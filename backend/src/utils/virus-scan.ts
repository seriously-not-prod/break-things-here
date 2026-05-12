import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export interface ScanResult {
  clean: boolean;
  threat?: string;
  scanner: 'clamav' | 'stub';
  scannedAt: string;
}

/**
 * Scan a file for malware/viruses.
 *
 * Strategy:
 *  1. If VIRUS_SCAN_ENABLED=true and clamscan is available, use ClamAV.
 *  2. Otherwise, fall back to a configurable stub that rejects known test
 *     signatures (EICAR test string) so security tests can verify the path.
 *  3. If VIRUS_SCAN_BLOCK_ON_ERROR=true, an unavailable scanner causes
 *     the upload to be rejected (fail-closed). Default: fail-open with a
 *     WARN log entry.
 */
export async function scanFile(filePath: string): Promise<ScanResult> {
  const now = new Date().toISOString();

  if (!fs.existsSync(filePath)) {
    throw new Error(`[VirusScan] File not found: ${filePath}`);
  }

  if (process.env.VIRUS_SCAN_ENABLED === 'true') {
    return scanWithClamAV(filePath, now);
  }

  return stubScan(filePath, now);
}

async function scanWithClamAV(filePath: string, scannedAt: string): Promise<ScanResult> {
  try {
    // clamscan exits 0 = clean, 1 = infected, 2 = error
    await execAsync(`clamscan --no-summary "${filePath}"`);
    return { clean: true, scanner: 'clamav', scannedAt };
  } catch (err: unknown) {
    const error = err as { code?: number; stderr?: string; stdout?: string };
    if (error.code === 1) {
      // Extract threat name from clamscan output
      const match = String(error.stdout ?? '').match(/: (.+) FOUND/);
      const threat = match ? match[1] : 'Unknown threat';
      return { clean: false, threat, scanner: 'clamav', scannedAt };
    }

    // Scanner error (code 2 or unexpected)
    console.error('[VirusScan] ClamAV scanner error:', error.stderr);

    if (process.env.VIRUS_SCAN_BLOCK_ON_ERROR === 'true') {
      return {
        clean: false,
        threat: 'Scanner unavailable — upload blocked (fail-closed policy)',
        scanner: 'clamav',
        scannedAt,
      };
    }

    // Fail-open: log warning and allow upload
    console.warn('[VirusScan] Scanner error — failing open. Set VIRUS_SCAN_BLOCK_ON_ERROR=true to fail closed.');
    return { clean: true, scanner: 'clamav', scannedAt };
  }
}

async function stubScan(filePath: string, scannedAt: string): Promise<ScanResult> {
  // Reject known EICAR test string to allow security test assertions
  const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const STUB_THREAT_BYTES = Buffer.from(EICAR_SIGNATURE);

  try {
    const content = fs.readFileSync(filePath);
    if (content.includes(STUB_THREAT_BYTES)) {
      return {
        clean: false,
        threat: 'EICAR-Test-File (stub scanner)',
        scanner: 'stub',
        scannedAt,
      };
    }

    // Additional heuristic: reject files with known dangerous extensions embedded
    // in content that don't match declared MIME type (simplified stub check).
    const contentStr = content.slice(0, 1024).toString('utf8', 0, 1024);
    if (/<script[\s>]/i.test(contentStr) && filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return {
        clean: false,
        threat: 'Embedded script in image (stub scanner)',
        scanner: 'stub',
        scannedAt,
      };
    }
  } catch {
    // Unreadable file — treat as suspicious when block-on-error is set
    if (process.env.VIRUS_SCAN_BLOCK_ON_ERROR === 'true') {
      return { clean: false, threat: 'Unreadable file', scanner: 'stub', scannedAt };
    }
  }

  return { clean: true, scanner: 'stub', scannedAt };
}
