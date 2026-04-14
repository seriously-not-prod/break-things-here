import { confirmEmailChange, hasPendingEmailChange } from '../api/email-change';

vi.spyOn(global, 'fetch').mockImplementation(vi.fn() as unknown as typeof fetch);

describe('confirmEmailChange', () => {
  afterEach(() => vi.clearAllMocks());

  it('throws for empty token', async () => {
    await expect(confirmEmailChange('')).rejects.toThrow('Invalid confirmation token.');
  });

  it('throws for whitespace-only token', async () => {
    await expect(confirmEmailChange('   ')).rejects.toThrow('Invalid confirmation token.');
  });

  it('returns email on successful confirmation', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ email: 'new@example.com' }),
    });
    const result = await confirmEmailChange('valid-token');
    expect(result.email).toBe('new@example.com');
  });

  it('throws on 400 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Token expired.' }),
    });
    await expect(confirmEmailChange('expired-token')).rejects.toThrow('Token expired.');
  });

  it('throws generic error on other failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(confirmEmailChange('bad-token')).rejects.toThrow('Email confirmation failed.');
  });
});

describe('hasPendingEmailChange', () => {
  it('returns true when pendingEmail is set', () => {
    expect(hasPendingEmailChange('new@example.com')).toBe(true);
  });

  it('returns false when pendingEmail is undefined', () => {
    expect(hasPendingEmailChange(undefined)).toBe(false);
  });

  it('returns false when pendingEmail is empty string', () => {
    expect(hasPendingEmailChange('')).toBe(false);
  });
});
