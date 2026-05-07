/**
 * Minimal QR code generator used for RSVP access links (#437).
 *
 * The frontend needs a self-contained SVG payload that can be rendered in an
 * <img> tag, embedded in an email, or printed on a name badge — without
 * pulling a heavyweight QR library into the bundle. This implementation
 * supports byte-mode QR up to version 10 with M-level error correction, which
 * comfortably fits any RSVP URL we generate (well under 200 chars).
 *
 * Algorithm follows ISO/IEC 18004:2015. Reed–Solomon and bit-stream code is
 * adapted into TypeScript from the public-domain reference at
 * https://www.nayuki.io/page/qr-code-generator-library, kept terse and
 * dependency-free. Tested against known vectors in qr.test.ts.
 */

type Bits = number[];

// ── GF(256) tables for Reed-Solomon ─────────────────────────────────────────
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, generator: number[]): Uint8Array {
  const result = new Uint8Array(generator.length - 1);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) result[i] ^= gfMul(generator[i + 1], factor);
  }
  return result;
}

// ── Capacity tables (M error correction only) ───────────────────────────────
// For each version (1..10): [totalDataCodewords, ecCodewordsPerBlock, [block group sizes]].
// Source: ISO/IEC 18004:2015 Table 9.
interface VersionInfo {
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  blockGroups: Array<[number, number]>; // [numBlocks, dataCodewordsPerBlock]
}

const VERSIONS_M: Record<number, VersionInfo> = {
  1: { totalCodewords: 26, ecCodewordsPerBlock: 10, blockGroups: [[1, 16]] },
  2: { totalCodewords: 44, ecCodewordsPerBlock: 16, blockGroups: [[1, 28]] },
  3: { totalCodewords: 70, ecCodewordsPerBlock: 26, blockGroups: [[1, 44]] },
  4: { totalCodewords: 100, ecCodewordsPerBlock: 18, blockGroups: [[2, 32]] },
  5: { totalCodewords: 134, ecCodewordsPerBlock: 24, blockGroups: [[2, 43]] },
  6: { totalCodewords: 172, ecCodewordsPerBlock: 16, blockGroups: [[4, 27]] },
  7: { totalCodewords: 196, ecCodewordsPerBlock: 18, blockGroups: [[4, 31]] },
  8: { totalCodewords: 242, ecCodewordsPerBlock: 22, blockGroups: [[2, 38], [2, 39]] },
  9: { totalCodewords: 292, ecCodewordsPerBlock: 22, blockGroups: [[3, 36], [2, 37]] },
  10: { totalCodewords: 346, ecCodewordsPerBlock: 26, blockGroups: [[4, 43], [1, 44]] },
};

function totalDataCodewords(v: VersionInfo): number {
  return v.blockGroups.reduce((sum, [n, d]) => sum + n * d, 0);
}

function chooseVersion(byteLength: number): number {
  for (const [vStr, info] of Object.entries(VERSIONS_M)) {
    const v = Number(vStr);
    const dataCodewords = totalDataCodewords(info);
    // Byte mode header: 4-bit mode + 8-bit (v<10) or 16-bit char count
    const charCountBits = v < 10 ? 8 : 16;
    const headerBits = 4 + charCountBits;
    const dataBits = byteLength * 8;
    const totalNeededBits = headerBits + dataBits + 4; // +4 terminator
    if (totalNeededBits <= dataCodewords * 8) return v;
  }
  throw new Error(`QR payload too large for supported versions (${byteLength} bytes)`);
}

function bitsToBytes(bits: Bits): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >>> 3] |= 0x80 >>> (i & 7);
  }
  return out;
}

function appendBits(bits: Bits, value: number, len: number): void {
  for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function buildBitstream(text: string, version: number): Uint8Array {
  const bytes = Buffer.from(text, 'utf8');
  const charCountBits = version < 10 ? 8 : 16;
  const dataCodewords = totalDataCodewords(VERSIONS_M[version]);
  const capacityBits = dataCodewords * 8;

  const bits: Bits = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, bytes.length, charCountBits);
  for (const b of bytes) appendBits(bits, b, 8);

  // Terminator (up to 4 zero bits)
  const term = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad with alternating 0xEC, 0x11
  const data = bitsToBytes(bits);
  const padded = new Uint8Array(dataCodewords);
  padded.set(data);
  for (let i = data.length, toggle = 0; i < dataCodewords; i++, toggle ^= 1) {
    padded[i] = toggle ? 0x11 : 0xec;
  }
  return padded;
}

function interleaveBlocks(data: Uint8Array, version: number): Uint8Array {
  const info = VERSIONS_M[version];
  const ecLen = info.ecCodewordsPerBlock;
  const generator = rsGeneratorPoly(ecLen);

  const blocks: Array<{ data: Uint8Array; ec: Uint8Array }> = [];
  let offset = 0;
  for (const [numBlocks, dataPerBlock] of info.blockGroups) {
    for (let i = 0; i < numBlocks; i++) {
      const slice = data.subarray(offset, offset + dataPerBlock);
      offset += dataPerBlock;
      blocks.push({ data: slice, ec: rsRemainder(slice, generator) });
    }
  }

  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const out: number[] = [];
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i]);
  return Uint8Array.from(out);
}

// ── Module placement ────────────────────────────────────────────────────────
function size(version: number): number {
  return version * 4 + 17;
}

const ALIGNMENT_PATTERN_POSITIONS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

function makeMatrix(version: number): { mat: Uint8Array[]; reserved: Uint8Array[] } {
  const n = size(version);
  const mat = Array.from({ length: n }, () => new Uint8Array(n));
  const reserved = Array.from({ length: n }, () => new Uint8Array(n));

  const setFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        reserved[rr][cc] = 1;
        const inOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const onBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        mat[rr][cc] = onBorder ? 0 : inOuter || inInner ? 1 : 0;
      }
    }
  };
  setFinder(0, 0);
  setFinder(0, n - 7);
  setFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    mat[6][i] = i % 2 === 0 ? 1 : 0;
    mat[i][6] = i % 2 === 0 ? 1 : 0;
    reserved[6][i] = 1;
    reserved[i][6] = 1;
  }

  // Alignment patterns
  const positions = ALIGNMENT_PATTERN_POSITIONS[version];
  for (const r of positions) {
    for (const c of positions) {
      // Skip if overlaps a finder pattern
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          reserved[rr][cc] = 1;
          const onBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const center = dr === 0 && dc === 0;
          mat[rr][cc] = onBorder || center ? 1 : 0;
        }
      }
    }
  }

  // Reserve format info area
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = 1;
    if (!reserved[i][8]) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = 1;
    reserved[n - 1 - i][8] = 1;
  }
  // Dark module
  mat[n - 8][8] = 1;
  reserved[n - 8][8] = 1;

  return { mat, reserved };
}

function placeData(mat: Uint8Array[], reserved: Uint8Array[], data: Uint8Array): void {
  const n = mat.length;
  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // Skip timing column
    for (let i = 0; i < n; i++) {
      const r = upward ? n - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (reserved[r][c]) continue;
        const bit = (data[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
        mat[r][c] = bit;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

function maskCondition(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function applyMask(mat: Uint8Array[], reserved: Uint8Array[], mask: number): void {
  for (let r = 0; r < mat.length; r++) {
    for (let c = 0; c < mat.length; c++) {
      if (reserved[r][c]) continue;
      if (maskCondition(mask, r, c)) mat[r][c] ^= 1;
    }
  }
}

function applyFormatInfo(mat: Uint8Array[], mask: number): void {
  // Format info: 5 data bits (EC level + mask), then BCH(15,5).
  // M error correction = 0b00.
  const ecBits = 0b00;
  const data = (ecBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0b10100110111);
  }
  const formatBits = (((data << 10) | rem) ^ 0b101010000010010) & 0x7fff;
  const n = mat.length;
  for (let i = 0; i <= 5; i++) mat[8][i] = (formatBits >>> i) & 1;
  mat[8][7] = (formatBits >>> 6) & 1;
  mat[8][8] = (formatBits >>> 7) & 1;
  mat[7][8] = (formatBits >>> 8) & 1;
  for (let i = 9; i < 15; i++) mat[14 - i][8] = (formatBits >>> i) & 1;
  for (let i = 0; i < 8; i++) mat[n - 1 - i][8] = (formatBits >>> i) & 1;
  for (let i = 8; i < 15; i++) mat[8][n - 15 + i] = (formatBits >>> i) & 1;
  mat[n - 8][8] = 1;
}

function maskPenalty(mat: Uint8Array[]): number {
  const n = mat.length;
  let penalty = 0;
  // Rule 1: runs of 5+ same-colour modules in row/col
  for (let r = 0; r < n; r++) {
    let runColor = -1;
    let runLen = 0;
    for (let c = 0; c < n; c++) {
      if (mat[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += runLen - 2;
        runColor = mat[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += runLen - 2;
  }
  for (let c = 0; c < n; c++) {
    let runColor = -1;
    let runLen = 0;
    for (let r = 0; r < n; r++) {
      if (mat[r][c] === runColor) runLen++;
      else {
        if (runLen >= 5) penalty += runLen - 2;
        runColor = mat[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += runLen - 2;
  }
  return penalty;
}

function buildMatrix(text: string): Uint8Array[] {
  const bytes = Buffer.byteLength(text, 'utf8');
  const version = chooseVersion(bytes);
  const codewords = buildBitstream(text, version);
  const interleaved = interleaveBlocks(codewords, version);

  let bestMat: Uint8Array[] | null = null;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const { mat, reserved } = makeMatrix(version);
    placeData(mat, reserved, interleaved);
    applyMask(mat, reserved, mask);
    applyFormatInfo(mat, mask);
    const penalty = maskPenalty(mat);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMat = mat;
    }
  }
  return bestMat!;
}

/** Render a QR code as an SVG string for inline embedding. */
export function renderQrSvg(text: string, options: { scale?: number; quietZone?: number } = {}): string {
  const scale = Math.max(1, Math.floor(options.scale ?? 4));
  const quiet = Math.max(0, Math.floor(options.quietZone ?? 4));
  const mat = buildMatrix(text);
  const n = mat.length;
  const totalSize = (n + quiet * 2) * scale;
  let body = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (mat[r][c]) {
        body += `<rect x="${(c + quiet) * scale}" y="${(r + quiet) * scale}" width="${scale}" height="${scale}"/>`;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}"` +
    ` width="${totalSize}" height="${totalSize}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${totalSize}" height="${totalSize}" fill="#ffffff"/>` +
    `<g fill="#000000">${body}</g></svg>`
  );
}

/** Return the QR code as a `data:image/svg+xml;base64,...` URI. */
export function renderQrDataUri(text: string, options?: { scale?: number; quietZone?: number }): string {
  const svg = renderQrSvg(text, options);
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}
