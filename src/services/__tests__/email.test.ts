import nodemailer from 'nodemailer';
import { sendConfirmationEmail, setTransporter, EmailError } from '../../services/email';

vi.mock('nodemailer');

const mockSendMail = vi.fn();
const mockCreateTransport = nodemailer.createTransport as jest.Mock;

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset injected transporter so tests use the factory
    setTransporter(null);
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
  });

  describe('sendConfirmationEmail', () => {
    it('should call sendMail with correct recipient and subject', async () => {
      const email = 'user@example.com';
      const token = 'a'.repeat(64);

      await sendConfirmationEmail(email, token);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.to).toBe(email);
      expect(callArgs.subject).toBe('Confirm your email address');
    });

    it('should embed the token in the confirmation URL', async () => {
      const token = 'b'.repeat(64);
      await sendConfirmationEmail('t@example.com', token);

      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.text).toContain(token);
      expect(callArgs.html).toContain(token);
    });

    it('should not include anything other than the token in the confirmation URL', async () => {
      const token = 'c'.repeat(64);
      const email = 'secret@example.com';
      await sendConfirmationEmail(email, token);

      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      // The URL in the email body must not contain the email address
      expect(callArgs.text).not.toContain(email);
      expect(callArgs.html).not.toContain(email);
    });

    it('should throw EmailError when email is empty', async () => {
      await expect(sendConfirmationEmail('', 'token')).rejects.toThrow(EmailError);
    });

    it('should throw EmailError when token is empty', async () => {
      await expect(sendConfirmationEmail('user@example.com', '')).rejects.toThrow(EmailError);
    });

    it('should wrap SMTP errors in EmailError without leaking internals', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('ECONNREFUSED smtp.example.com:587'));

      await expect(
        sendConfirmationEmail('user@example.com', 'd'.repeat(64))
      ).rejects.toThrow(EmailError);
    });

    it('should use setTransporter injection when provided', async () => {
      const mockTransporter = { sendMail: mockSendMail } as unknown as Parameters<typeof setTransporter>[0];
      setTransporter(mockTransporter);

      await sendConfirmationEmail('inject@example.com', 'e'.repeat(64));

      // createTransport should NOT have been called since we injected
      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
  });
});
