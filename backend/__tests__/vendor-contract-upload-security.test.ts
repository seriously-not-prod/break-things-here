import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { uploadContract } from '../src/controllers/vendors-controller.js';

const mockDbGet = vi.fn();
const mockDbRun = vi.fn();
const mockRequireEventAccess = vi.fn();
const mockScanFile = vi.fn();
const mockLogAuditEvent = vi.fn();
const { mockUnlink } = vi.hoisted(() => ({
  mockUnlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => ({ get: mockDbGet, run: mockDbRun }),
}));

vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: (...args: unknown[]) => mockRequireEventAccess(...args),
}));

vi.mock('../src/utils/virus-scan.js', () => ({
  scanFile: (...args: unknown[]) => mockScanFile(...args),
}));

vi.mock('../src/utils/audit-log.js', () => ({
  AUDIT_ACTIONS: {
    UPLOAD_SCAN_PASS: 'UPLOAD_SCAN_PASS',
    UPLOAD_SCAN_FAIL: 'UPLOAD_SCAN_FAIL',
  },
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

vi.mock('fs/promises', () => ({
  default: { unlink: mockUnlink },
  unlink: mockUnlink,
}));

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
    params: { eventId: '1', id: '2' },
    user: { id: 7, email: 'owner@test.com', role_id: 1 },
    file: {
      filename: 'contract-123.pdf',
      path: path.resolve('uploads/vendor-contracts/contract-123.pdf'),
      mimetype: 'application/pdf',
      size: 1024,
    },
    ip: '127.0.0.1',
    ...overrides,
  } as unknown;
}

describe('vendor contract upload virus scan enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventAccess.mockResolvedValue({ id: 1, created_by: 7 });
    mockDbGet.mockResolvedValue({ id: 2, contract_file: null });
    mockDbRun.mockResolvedValue({});
  });

  it('rejects malicious contract files with 422 and logs audit fail', async () => {
    mockScanFile.mockResolvedValue({
      clean: false,
      threat: 'EICAR-Test-File (stub scanner)',
      scanner: 'stub',
      scannedAt: new Date().toISOString(),
    });

    const req = makeReq();
    const res = makeRes();

    await uploadContract(req as never, res as never);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: 'File failed security scan and was rejected.' });
    expect(mockDbRun).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE vendors SET contract_file'),
      expect.anything(),
    );
    expect(mockUnlink).toHaveBeenCalledWith(path.resolve('uploads/vendor-contracts/contract-123.pdf'));
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPLOAD_SCAN_FAIL',
        targetType: 'vendor-contract',
        targetId: '2',
      }),
    );
  });

  it('accepts clean contract files and updates vendor record', async () => {
    mockScanFile.mockResolvedValue({ clean: true, scanner: 'stub', scannedAt: new Date().toISOString() });

    const req = makeReq();
    const res = makeRes();

    await uploadContract(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(mockDbRun).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE vendors SET contract_file = $1'),
      ['contract-123.pdf', '2'],
    );
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPLOAD_SCAN_PASS',
        targetType: 'vendor-contract',
        targetId: '2',
      }),
    );
  });
});
