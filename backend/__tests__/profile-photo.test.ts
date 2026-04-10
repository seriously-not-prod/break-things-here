/**
 * Profile photo upload — unit tests — issue #38
 *
 * Validates the server-side rules for file type, file size, and path
 * construction in `uploadProfilePhoto` without requiring a running HTTP
 * server.  All tests call the controller directly with minimal mock
 * Express req / res objects and a vi.mock'd database.
 *
 * Acceptance criteria verified:
 *   ✔ Accepted formats: JPEG, PNG, WebP only
 *   ✔ Maximum file size: 2 MB
 *   ✔ File type validated by MIME type (not just extension)
 *   ✔ Old photo deleted when a new one is uploaded
 *   ✔ Returns 400 for invalid file type or oversized file
 *   ✔ Stored URL includes correct subdirectory path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { uploadProfilePhoto } from '../src/controllers/profile-controller.js';

// ---------------------------------------------------------------------------
// Mock the database module — keeps tests side-effect free
// ---------------------------------------------------------------------------
const mockDbGet = vi.fn();
const mockDbRun = vi.fn();

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => ({ get: mockDbGet, run: mockDbRun }),
}));

// Mock fs/promises so no real files are touched
const { mockUnlink } = vi.hoisted(() => ({
  mockUnlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs/promises', () => ({
  default: { unlink: mockUnlink },
  unlink: mockUnlink,
}));

// ---------------------------------------------------------------------------
// Minimal Express mock helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    send: (data?: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data ?? null;
      return this;
    },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, email: 'user@test.com', role_id: 2 },
    file: null,
    body: {},
    ...overrides,
  } as unknown;
}

// Helper that builds a multer-style req.file object
function makeFile(opts: { mimetype?: string; size?: number; filename?: string; path?: string } = {}) {
  return {
    mimetype: opts.mimetype ?? 'image/jpeg',
    size: opts.size ?? 1024 * 500, // 500 KB default
    filename: opts.filename ?? 'profile-123.jpg',
    path: opts.path ?? path.join(process.cwd(), 'uploads', 'profile-photos', opts.filename ?? 'profile-123.jpg'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('[#38] uploadProfilePhoto — file type validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing profile photo
    mockDbGet.mockResolvedValue({ profile_photo_url: null });
    mockDbRun.mockResolvedValue({});
  });

  it('accepts image/jpeg', async () => {
    const req = makeReq({ file: makeFile({ mimetype: 'image/jpeg' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(200);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.message).toBe('Profile photo uploaded successfully');
  });

  it('accepts image/png', async () => {
    const req = makeReq({ file: makeFile({ mimetype: 'image/png', filename: 'avatar.png' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('accepts image/webp', async () => {
    const req = makeReq({ file: makeFile({ mimetype: 'image/webp', filename: 'photo.webp' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('rejects image/gif with 400', async () => {
    const req = makeReq({ file: makeFile({ mimetype: 'image/gif', filename: 'anim.gif' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(400);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.error).toBe('Only JPEG, PNG, and WebP images are accepted');
  });

  it('rejects image/bmp with 400', async () => {
    const req = makeReq({ file: makeFile({ mimetype: 'image/bmp', filename: 'img.bmp' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(400);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.error).toBe('Only JPEG, PNG, and WebP images are accepted');
  });

  it('rejects application/pdf with 400', async () => {
    const req = makeReq({ file: makeFile({ mimetype: 'application/pdf', filename: 'cv.pdf' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('cleans up rejected file from disk', async () => {
    const fakePath = path.resolve('uploads/profile-photos/bad-type.gif');
    const req = makeReq({ file: makeFile({ mimetype: 'image/gif', path: fakePath }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(mockUnlink).toHaveBeenCalledWith(fakePath);
  });
});

describe('[#38] uploadProfilePhoto — file size validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbGet.mockResolvedValue({ profile_photo_url: null });
    mockDbRun.mockResolvedValue({});
  });

  const MAX = 2 * 1024 * 1024; // 2 MB

  it('accepts file exactly at 2 MB limit', async () => {
    const req = makeReq({ file: makeFile({ size: MAX }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('accepts file below 2 MB', async () => {
    const req = makeReq({ file: makeFile({ size: 1024 * 800 }) }); // 800 KB
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('rejects file 1 byte over 2 MB with 400', async () => {
    const req = makeReq({ file: makeFile({ size: MAX + 1 }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(400);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.error).toBe('File size must not exceed 2MB');
  });

  it('rejects a 5 MB file with 400', async () => {
    const req = makeReq({ file: makeFile({ size: 5 * 1024 * 1024 }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(400);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.error).toBe('File size must not exceed 2MB');
  });

  it('cleans up oversized file from disk', async () => {
    const fakePath = path.resolve('uploads/profile-photos/huge.jpg');
    const req = makeReq({ file: makeFile({ size: MAX + 1, path: fakePath }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(mockUnlink).toHaveBeenCalledWith(fakePath);
  });
});

describe('[#38] uploadProfilePhoto — missing file', () => {
  it('returns 401 when user is not authenticated', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no file is attached to request', async () => {
    const req = makeReq({ file: undefined });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    expect(res.statusCode).toBe(400);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.error).toBe('No file uploaded');
  });
});

describe('[#38] uploadProfilePhoto — stored URL path correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbGet.mockResolvedValue({ profile_photo_url: null });
    mockDbRun.mockResolvedValue({});
  });

  it('stores URL with uploads/profile-photos/ prefix (not just uploads/)', async () => {
    const file = makeFile({ mimetype: 'image/jpeg', filename: 'profile-999.jpg' });
    const req = makeReq({ file });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);

    // The db.run() call must receive the correct relative URL
    expect(mockDbRun).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_profiles'),
      expect.arrayContaining([
        expect.stringContaining(path.join('uploads', 'profile-photos', 'profile-999.jpg')),
        1, // user id
      ]),
    );
  });

  it('returns the correct photoUrl in response', async () => {
    const file = makeFile({ mimetype: 'image/png', filename: 'avatar.png' });
    const req = makeReq({ file });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);
    // @ts-expect-error accessing dynamic body
    expect(res.body?.photoUrl).toBe(path.join('uploads', 'profile-photos', 'avatar.png'));
  });
});

describe('[#38] uploadProfilePhoto — old photo cleanup on replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRun.mockResolvedValue({});
  });

  it('deletes old photo from disk when one already exists', async () => {
    const oldUrl = path.join('uploads', 'profile-photos', 'old-photo.jpg');
    mockDbGet.mockResolvedValue({ profile_photo_url: oldUrl });

    const req = makeReq({ file: makeFile({ mimetype: 'image/jpeg', filename: 'new-photo.jpg' }) });
    const res = makeRes();
    await uploadProfilePhoto(req as never, res as never);

    const expectedOldPath = path.join(process.cwd(), oldUrl);
    expect(mockUnlink).toHaveBeenCalledWith(expectedOldPath);
  });

  it('does not crash when no old photo exists', async () => {
    mockDbGet.mockResolvedValue({ profile_photo_url: null });
    const req = makeReq({ file: makeFile({ mimetype: 'image/webp', filename: 'first.webp' }) });
    const res = makeRes();
    await expect(uploadProfilePhoto(req as never, res as never)).resolves.not.toThrow();
    expect(res.statusCode).toBe(200);
  });
});
