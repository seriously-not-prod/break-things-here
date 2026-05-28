/**
 * Tests: AI Data Privacy and PII Minimization — Issue #957
 *
 * Covers the `ai-privacy` module in full:
 *
 * classifyField
 * - Returns PUBLIC for known public event fields
 * - Returns INTERNAL for known operational fields
 * - Returns SENSITIVE for known PII fields
 * - Returns RESTRICTED for known regulated fields
 * - Falls back to INTERNAL for unknown field names
 *
 * redactPii
 * - Returns clean text unchanged when no PII is present
 * - Detects and redacts email addresses
 * - Detects and redacts US phone numbers
 * - Detects and redacts Social Security Numbers
 * - Detects and redacts credit card numbers (Visa, Mastercard)
 * - Detects and redacts IPv4 addresses
 * - Detects and redacts date-of-birth patterns
 * - Detects and redacts passport/national ID patterns
 * - Detects and redacts street address fragments
 * - Handles multiple PII categories in a single string
 * - Counts substitutions correctly
 * - Deduplicates detected categories
 * - Returns piiDetected=false when input is clean
 * - Handles non-string input gracefully
 *
 * sanitiseForLog
 * - Returns redacted string for PII-containing log values
 * - Returns original string when no PII present
 * - Handles non-string input gracefully
 *
 * filterProviderPayload
 * - Includes PUBLIC fields verbatim
 * - Includes INTERNAL fields verbatim
 * - Redacts SENSITIVE string fields containing PII
 * - Includes SENSITIVE string fields that contain no PII as-is
 * - Replaces non-string SENSITIVE values with [REDACTED]
 * - Excludes RESTRICTED fields entirely
 * - Sets filtered=true when fields were redacted or excluded
 * - Sets filtered=false when no redaction was necessary
 * - Returns per-field classification decisions
 * - Handles unknown fields by classifying them as INTERNAL
 *
 * buildSafeLogContext
 * - Returns valid JSON string
 * - Excludes RESTRICTED fields from the output
 *
 * logAiPrivacyEvent
 * - Calls db.run with the correct SQL and parameters
 * - Swallows database errors without propagating
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyField,
  redactPii,
  sanitiseForLog,
  filterProviderPayload,
  buildSafeLogContext,
  logAiPrivacyEvent,
  type AiPrivacyEvent,
  type DataClassification,
} from '../src/lib/ai-privacy.js';

// ── Module-level mock for the database ───────────────────────────────────────

vi.mock('../src/db/database.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../src/db/database.js';

// ── classifyField ─────────────────────────────────────────────────────────────

describe('classifyField', () => {
  it('returns PUBLIC for known public event fields', () => {
    const publicFields = ['title', 'description', 'date', 'event_type', 'tags', 'status'];
    for (const field of publicFields) {
      expect(classifyField(field)).toBe<DataClassification>('PUBLIC');
    }
  });

  it('returns INTERNAL for known operational fields', () => {
    const internalFields = ['id', 'userId', 'eventId', 'workflowType', 'role_id'];
    for (const field of internalFields) {
      expect(classifyField(field)).toBe<DataClassification>('INTERNAL');
    }
  });

  it('returns SENSITIVE for known PII fields', () => {
    const sensitiveFields = [
      'email',
      'guestEmail',
      'phone',
      'name',
      'fullName',
      'address',
      'ipAddress',
      'dateOfBirth',
      'dob',
    ];
    for (const field of sensitiveFields) {
      expect(classifyField(field)).toBe<DataClassification>('SENSITIVE');
    }
  });

  it('returns RESTRICTED for known regulated fields', () => {
    const restrictedFields = [
      'password',
      'passwordHash',
      'creditCard',
      'ssn',
      'passport',
      'apiKey',
      'secret',
      'token',
      'refreshToken',
    ];
    for (const field of restrictedFields) {
      expect(classifyField(field)).toBe<DataClassification>('RESTRICTED');
    }
  });

  it('falls back to INTERNAL for unknown field names', () => {
    expect(classifyField('someUnknownField')).toBe<DataClassification>('INTERNAL');
    expect(classifyField('')).toBe<DataClassification>('INTERNAL');
    expect(classifyField('customAttribute')).toBe<DataClassification>('INTERNAL');
  });
});

// ── redactPii ─────────────────────────────────────────────────────────────────

describe('redactPii', () => {
  it('returns clean text unchanged when no PII is present', () => {
    const input = 'Help me plan a summer festival for 200 guests.';
    const result = redactPii(input);
    expect(result.piiDetected).toBe(false);
    expect(result.detectedCategories).toHaveLength(0);
    expect(result.substitutionCount).toBe(0);
    expect(result.text).toBe(input);
  });

  it('detects and redacts email addresses', () => {
    const result = redactPii('Contact us at organiser@festival.example.com for tickets.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('EMAIL');
    expect(result.text).not.toContain('@');
    expect(result.text).toContain('[EMAIL]');
    expect(result.substitutionCount).toBeGreaterThanOrEqual(1);
  });

  it('detects and redacts multiple email addresses in one string', () => {
    const result = redactPii('Send RSVPs to alice@example.com and bob@example.org');
    expect(result.piiDetected).toBe(true);
    expect(result.substitutionCount).toBe(2);
    expect(result.text).not.toContain('@');
  });

  it('detects and redacts US phone numbers', () => {
    const result = redactPii('Call our hotline at 555-867-5309 for assistance.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('PHONE');
    expect(result.text).toContain('[PHONE]');
  });

  it('detects and redacts Social Security Numbers', () => {
    const result = redactPii('SSN on file: 123-45-6789. Please confirm.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('SSN');
    expect(result.text).toContain('[SSN]');
    expect(result.text).not.toContain('123-45-6789');
  });

  it('detects and redacts Visa credit card numbers', () => {
    const result = redactPii('Payment card: 4111111111111111 expires 12/26.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('CREDIT_CARD');
    expect(result.text).toContain('[CREDIT_CARD]');
    expect(result.text).not.toContain('4111111111111111');
  });

  it('detects and redacts Mastercard credit card numbers', () => {
    const result = redactPii('Card: 5500005555555559');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('CREDIT_CARD');
  });

  it('detects and redacts IPv4 addresses', () => {
    const result = redactPii('Request originated from 192.168.1.42 last Thursday.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('IP_ADDRESS');
    expect(result.text).toContain('[IP_ADDRESS]');
    expect(result.text).not.toContain('192.168.1.42');
  });

  it('detects and redacts date-of-birth patterns', () => {
    const result = redactPii('Guest dob: 1990-05-15 for age verification.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('DATE_OF_BIRTH');
    expect(result.text).toContain('[DATE_OF_BIRTH]');
  });

  it('detects and redacts passport/national ID patterns', () => {
    const result = redactPii('Passport: AB123456 — please present at gate.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('PASSPORT');
    expect(result.text).toContain('[PASSPORT]');
  });

  it('detects and redacts street address fragments', () => {
    const result = redactPii('Venue is at 42 Festival Boulevard for outdoor stage.');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('ADDRESS');
    expect(result.text).toContain('[ADDRESS]');
    expect(result.text).not.toContain('42 Festival Boulevard');
  });

  it('handles multiple PII categories in a single string', () => {
    const result = redactPii('Email: host@event.com, Phone: 555-123-4567, SSN: 987-65-4321');
    expect(result.piiDetected).toBe(true);
    expect(result.detectedCategories).toContain('EMAIL');
    expect(result.detectedCategories).toContain('PHONE');
    expect(result.detectedCategories).toContain('SSN');
    expect(result.substitutionCount).toBe(3);
  });

  it('deduplicates detected categories when multiple instances of the same category are found', () => {
    const result = redactPii('Contact alice@test.com or bob@test.com');
    expect(result.piiDetected).toBe(true);
    const emailCount = result.detectedCategories.filter((c) => c === 'EMAIL').length;
    expect(emailCount).toBe(1); // deduplicated — only one category entry
    expect(result.substitutionCount).toBe(2); // two substitutions
  });

  it('handles non-string input gracefully', () => {
    expect(redactPii(null)).toEqual({
      text: '',
      piiDetected: false,
      detectedCategories: [],
      substitutionCount: 0,
    });
    expect(redactPii(undefined)).toEqual({
      text: '',
      piiDetected: false,
      detectedCategories: [],
      substitutionCount: 0,
    });
    expect(redactPii(42)).toEqual({
      text: '',
      piiDetected: false,
      detectedCategories: [],
      substitutionCount: 0,
    });
  });
});

// ── sanitiseForLog ────────────────────────────────────────────────────────────

describe('sanitiseForLog', () => {
  it('returns redacted string for PII-containing log values', () => {
    const result = sanitiseForLog('Error for user user@example.com at step 3');
    expect(result).not.toContain('user@example.com');
    expect(result).toContain('[EMAIL]');
  });

  it('returns original string when no PII is present', () => {
    const clean = 'Failed to load event with id=42';
    expect(sanitiseForLog(clean)).toBe(clean);
  });

  it('handles non-string input gracefully', () => {
    expect(sanitiseForLog(null)).toBe('');
    expect(sanitiseForLog(undefined)).toBe('');
    expect(sanitiseForLog(123)).toBe('123');
  });
});

// ── filterProviderPayload ─────────────────────────────────────────────────────

describe('filterProviderPayload', () => {
  it('includes PUBLIC fields verbatim', () => {
    const payload = { title: 'Summer Fest', date: '2026-07-04', status: 'published' };
    const result = filterProviderPayload(payload);
    expect(result.payload).toMatchObject({
      title: 'Summer Fest',
      date: '2026-07-04',
      status: 'published',
    });
    expect(result.filtered).toBe(false);
  });

  it('includes INTERNAL fields verbatim', () => {
    const payload = { id: 42, workflowType: 'event', entityId: 7 };
    const result = filterProviderPayload(payload);
    expect(result.payload).toMatchObject({ id: 42, workflowType: 'event', entityId: 7 });
    expect(result.filtered).toBe(false);
  });

  it('redacts SENSITIVE string fields that contain PII', () => {
    const payload = { email: 'host@festival.example.com', title: 'Outdoor Fest' };
    const result = filterProviderPayload(payload);
    expect(result.payload['email']).toContain('[EMAIL]');
    expect(result.payload['title']).toBe('Outdoor Fest');
    expect(result.filtered).toBe(true);
  });

  it('includes SENSITIVE string fields that contain no PII as-is', () => {
    const payload = { name: 'Alice Organiser' };
    const result = filterProviderPayload(payload);
    // 'name' is SENSITIVE but no PII patterns fire on a plain name string
    expect(result.payload['name']).toBe('Alice Organiser');
    // filtered may be false if no PII was detected within the value
    const nameClassification = result.classifications.find((c) => c.field === 'name');
    expect(nameClassification?.classification).toBe('SENSITIVE');
  });

  it('replaces non-string SENSITIVE values with [REDACTED]', () => {
    const payload = { phone: 5551234567 }; // number, not string
    const result = filterProviderPayload(payload);
    expect(result.payload['phone']).toBe('[REDACTED]');
    expect(result.filtered).toBe(true);
  });

  it('excludes RESTRICTED fields entirely from the output payload', () => {
    const payload = { title: 'Spring Gala', password: 'secret123', ssn: '123-45-6789' };
    const result = filterProviderPayload(payload);
    expect(Object.keys(result.payload)).not.toContain('password');
    expect(Object.keys(result.payload)).not.toContain('ssn');
    expect(result.payload['title']).toBe('Spring Gala');
    expect(result.filtered).toBe(true);
  });

  it('sets filtered=false when no redaction or exclusion was necessary', () => {
    const payload = { title: 'Autumn Fest', capacity: 300, status: 'draft' };
    const result = filterProviderPayload(payload);
    expect(result.filtered).toBe(false);
  });

  it('returns per-field classification decisions', () => {
    const payload = { title: 'Event', email: 'a@b.com', password: 'x' };
    const result = filterProviderPayload(payload);
    const titleDec = result.classifications.find((c) => c.field === 'title');
    const emailDec = result.classifications.find((c) => c.field === 'email');
    const passDec = result.classifications.find((c) => c.field === 'password');
    expect(titleDec?.classification).toBe('PUBLIC');
    expect(titleDec?.redacted).toBe(false);
    expect(emailDec?.classification).toBe('SENSITIVE');
    expect(passDec?.classification).toBe('RESTRICTED');
    expect(passDec?.redacted).toBe(true);
  });

  it('classifies unknown fields as INTERNAL and includes them verbatim', () => {
    const payload = { customMetric: 99, internalFlag: true };
    const result = filterProviderPayload(payload);
    expect(result.payload['customMetric']).toBe(99);
    expect(result.payload['internalFlag']).toBe(true);
    const dec = result.classifications.find((c) => c.field === 'customMetric');
    expect(dec?.classification).toBe('INTERNAL');
  });

  it('handles an empty payload', () => {
    const result = filterProviderPayload({});
    expect(result.payload).toEqual({});
    expect(result.classifications).toHaveLength(0);
    expect(result.filtered).toBe(false);
  });
});

// ── buildSafeLogContext ───────────────────────────────────────────────────────

describe('buildSafeLogContext', () => {
  it('returns a valid JSON string', () => {
    const context = { title: 'Summer Fest', capacity: 500 };
    const result = buildSafeLogContext(context);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('excludes RESTRICTED fields from the output', () => {
    const context = { title: 'Autumn Gala', apiKey: 'secret-key-abc', capacity: 100 };
    const result = buildSafeLogContext(context);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain('apiKey');
    expect(parsed['title']).toBe('Autumn Gala');
  });
});

// ── logAiPrivacyEvent ─────────────────────────────────────────────────────────

describe('logAiPrivacyEvent', () => {
  let mockDb: { run: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDb = { run: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.run with INSERT INTO ai_privacy_events and correct parameters', async () => {
    const event: AiPrivacyEvent = {
      userId: 7,
      eventType: 'pii_detected',
      workflowType: 'event',
      entityId: 42,
      piiCategories: ['EMAIL', 'PHONE'],
      fieldNames: ['prompt'],
      detail: 'PII detected in prompt: EMAIL, PHONE',
    };

    await logAiPrivacyEvent(event);

    expect(mockDb.run).toHaveBeenCalledOnce();
    const [sql, params] = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO ai_privacy_events/i);
    expect(params[0]).toBe(7); // userId
    expect(params[1]).toBe('pii_detected'); // eventType
    expect(params[2]).toBe('event'); // workflowType
    expect(params[3]).toBe(42); // entityId
    expect(JSON.parse(params[4] as string)).toEqual(['EMAIL', 'PHONE']); // pii_categories
    expect(JSON.parse(params[5] as string)).toEqual(['prompt']); // field_names
    expect(params[6]).toBe('PII detected in prompt: EMAIL, PHONE'); // detail
  });

  it('uses null for undefined userId', async () => {
    const event: AiPrivacyEvent = {
      userId: undefined,
      eventType: 'payload_filtered',
      workflowType: 'task',
      entityId: null,
      piiCategories: [],
      fieldNames: ['email'],
      detail: 'Payload filtered',
    };

    await logAiPrivacyEvent(event);

    const [, params] = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull(); // userId → null
  });

  it('swallows database errors without propagating', async () => {
    mockDb.run.mockRejectedValue(new Error('Database connection failed'));

    const event: AiPrivacyEvent = {
      userId: 1,
      eventType: 'log_sanitised',
      workflowType: 'general',
      entityId: null,
      piiCategories: ['SSN'],
      fieldNames: [],
      detail: 'Log sanitised',
    };

    // Should resolve without throwing even though db.run rejects.
    await expect(logAiPrivacyEvent(event)).resolves.toBeUndefined();
  });
});
