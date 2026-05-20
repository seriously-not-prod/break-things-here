/**
 * Unit tests: PDF Report Renderer (#813)
 *
 * Verifies:
 *   ✅ generatePdfReport returns valid Buffer for all 3 report types
 *   ✅ Metadata includes correct reportType, eventName, generatedAt, pageCount, byteLength
 *   ✅ PDF contains event header (title)
 *   ✅ PDF contains page number footer text
 *   ✅ PDF contains generated-at timestamp
 *   ✅ Rejects unknown report type
 *   ✅ Rejects missing event (event not found)
 *   ✅ isValidPdfReportType validates correctly
 *   ✅ File size stays under 5 MB for typical data
 *   ✅ Budget summary includes TOTAL row
 *   ✅ Guest list maps checked_in boolean to Yes/No
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAll = vi.fn();
const mockGet = vi.fn();

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => ({
    all: mockAll,
    get: mockGet,
    run: vi.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
    exec: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock pdfkit — return a simple buffer that simulates PDF structure
vi.mock('pdfkit', () => {
  const { EventEmitter } = require('events');

  class MockPDFDocument extends EventEmitter {
    private _pages = 1;
    private _currentPage = 0;
    private _textContent: string[] = [];

    constructor(private _options?: Record<string, unknown>) {
      super();
    }

    fontSize() { return this; }
    font() { return this; }
    fillColor() { return this; }
    save() { return this; }
    restore() { return this; }
    rect() { return this; }
    fill() { return this; }
    stroke() { return this; }

    text(content: string, _x?: number, _y?: number, _opts?: unknown) {
      this._textContent.push(content);
      return this;
    }

    addPage() {
      this._pages++;
      this._currentPage = this._pages - 1;
      return this;
    }

    switchToPage(_i: number) {
      return this;
    }

    bufferedPageRange() {
      return { start: 0, count: this._pages };
    }

    end() {
      // Build a fake PDF buffer that contains the text content for assertions
      const textPayload = this._textContent.join('\n');
      const pdfHeader = '%PDF-1.4\n';
      const content = pdfHeader + textPayload + '\n%%EOF';
      const buffer = Buffer.from(content, 'utf-8');
      this.emit('data', buffer);
      this.emit('end');
    }

    pipe() { return this; }
    on(event: string, handler: (...args: unknown[]) => void) {
      super.on(event, handler);
      return this;
    }
  }

  return { default: MockPDFDocument };
});

import {
  generatePdfReport,
  isValidPdfReportType,
  type PdfReportType,
} from '../src/services/reports/pdf.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_EVENT = {
  id: 1,
  name: 'Summer Music Festival 2026',
  event_date: '2026-07-15',
  location: 'Central Park Amphitheatre',
};

const TEST_GUESTS = [
  { guest_name: 'Alice Johnson', email: 'alice@example.com', status: 'Going', dietary_requirements: 'Vegetarian', checked_in: true },
  { guest_name: 'Bob Smith', email: 'bob@example.com', status: 'Maybe', dietary_requirements: null, checked_in: false },
  { guest_name: 'Carol White', email: 'carol@example.com', status: 'Going', dietary_requirements: 'Gluten-free', checked_in: true },
];

const TEST_BUDGET = [
  { category: 'Venue', allocated: 5000, spent: 4500, remaining: 500 },
  { category: 'Catering', allocated: 3000, spent: 2800, remaining: 200 },
  { category: 'Entertainment', allocated: 2000, spent: 1500, remaining: 500 },
];

const TEST_EXPENSES = [
  { category: 'Venue', description: 'Hall rental deposit', amount: 2000, date: '2026-06-01', vendor: 'City Hall Events' },
  { category: 'Venue', description: 'AV equipment', amount: 2500, date: '2026-06-15', vendor: 'SoundTech Pro' },
  { category: 'Catering', description: 'Menu tasting', amount: 300, date: '2026-06-10', vendor: 'Fine Dine Co' },
  { category: 'Catering', description: 'Bulk food order', amount: 2500, date: '2026-07-01', vendor: null },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PDF Report Renderer (#813)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(TEST_EVENT);
  });

  describe('isValidPdfReportType', () => {
    it('should accept valid report types', () => {
      expect(isValidPdfReportType('guest_list')).toBe(true);
      expect(isValidPdfReportType('budget_summary')).toBe(true);
      expect(isValidPdfReportType('expense_detail')).toBe(true);
    });

    it('should reject invalid report types', () => {
      expect(isValidPdfReportType('invalid')).toBe(false);
      expect(isValidPdfReportType('')).toBe(false);
      expect(isValidPdfReportType('csv')).toBe(false);
    });
  });

  describe('generatePdfReport — guest_list', () => {
    beforeEach(() => {
      mockAll.mockResolvedValue(TEST_GUESTS);
    });

    it('should return a Buffer and metadata', async () => {
      const { buffer, meta } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(meta.reportType).toBe('guest_list');
      expect(meta.eventName).toBe('Summer Music Festival 2026');
      expect(meta.generatedAt).toBeTruthy();
      expect(meta.pageCount).toBeGreaterThanOrEqual(1);
      expect(meta.byteLength).toBe(buffer.length);
    });

    it('should include event header in PDF content', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('Guest List Report');
      expect(text).toContain('Summer Music Festival 2026');
    });

    it('should include page number footer', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('Page 1 of');
    });

    it('should include generated-at timestamp', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('Generated:');
    });

    it('should map checked_in boolean to Yes/No', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('Yes');
      expect(text).toContain('No');
    });

    it('should stay under 5 MB for typical event sizes', async () => {
      // Generate a larger dataset (500 guests)
      const manyGuests = Array.from({ length: 500 }, (_, i) => ({
        guest_name: `Guest ${i + 1}`,
        email: `guest${i + 1}@example.com`,
        status: i % 3 === 0 ? 'Going' : i % 3 === 1 ? 'Maybe' : 'Declined',
        dietary_requirements: i % 5 === 0 ? 'Vegan' : null,
        checked_in: i % 2 === 0,
      }));
      mockAll.mockResolvedValue(manyGuests);

      const { meta } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });

      expect(meta.byteLength).toBeLessThan(5 * 1024 * 1024); // < 5 MB
    });
  });

  describe('generatePdfReport — budget_summary', () => {
    beforeEach(() => {
      mockAll.mockResolvedValue(TEST_BUDGET);
    });

    it('should return valid Buffer with budget metadata', async () => {
      const { buffer, meta } = await generatePdfReport({ eventId: 1, reportType: 'budget_summary' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(meta.reportType).toBe('budget_summary');
      expect(meta.eventName).toBe('Summer Music Festival 2026');
      expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    });

    it('should include budget title and event header', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'budget_summary' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('Budget Summary Report');
      expect(text).toContain('Summer Music Festival 2026');
    });

    it('should include TOTAL row in output', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'budget_summary' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('TOTAL');
    });
  });

  describe('generatePdfReport — expense_detail', () => {
    beforeEach(() => {
      mockAll.mockResolvedValue(TEST_EXPENSES);
    });

    it('should return valid Buffer with expense metadata', async () => {
      const { buffer, meta } = await generatePdfReport({ eventId: 1, reportType: 'expense_detail' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(meta.reportType).toBe('expense_detail');
      expect(meta.eventName).toBe('Summer Music Festival 2026');
    });

    it('should include expense title and transaction count', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'expense_detail' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('Expense Detail Report');
      expect(text).toContain('4 transactions');
    });

    it('should include vendor names in output', async () => {
      const { buffer } = await generatePdfReport({ eventId: 1, reportType: 'expense_detail' });
      const text = buffer.toString('utf-8');

      expect(text).toContain('City Hall Events');
      expect(text).toContain('SoundTech Pro');
    });
  });

  describe('error handling', () => {
    it('should throw for unsupported report type', async () => {
      await expect(
        generatePdfReport({ eventId: 1, reportType: 'invalid' as PdfReportType }),
      ).rejects.toThrow('Unsupported report type: invalid');
    });

    it('should throw when event is not found', async () => {
      mockGet.mockResolvedValue(null);

      await expect(
        generatePdfReport({ eventId: 999, reportType: 'guest_list' }),
      ).rejects.toThrow('Event not found: 999');
    });
  });

  describe('metadata correctness', () => {
    beforeEach(() => {
      mockAll.mockResolvedValue(TEST_GUESTS);
    });

    it('should include ISO timestamp in generatedAt', async () => {
      const { meta } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });

      // ISO 8601 format validation
      expect(meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should report byteLength matching buffer length', async () => {
      const { buffer, meta } = await generatePdfReport({ eventId: 1, reportType: 'guest_list' });

      expect(meta.byteLength).toBe(buffer.length);
    });
  });
});
