import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAddPage,
  mockRect,
  mockSave,
  mockSetDrawColor,
  mockSetFont,
  mockSetFontSize,
  mockSplitTextToSize,
  mockText,
  mockDocInstance,
  MockJsPDF,
} = vi.hoisted(() => {
  const mockAddPage = vi.fn();
  const mockRect = vi.fn();
  const mockSave = vi.fn();
  const mockSetDrawColor = vi.fn();
  const mockSetFont = vi.fn();
  const mockSetFontSize = vi.fn();
  const mockSplitTextToSize = vi.fn((text: string) => [text]);
  const mockText = vi.fn();

  const mockDocInstance = {
    addPage: mockAddPage,
    rect: mockRect,
    save: mockSave,
    setDrawColor: mockSetDrawColor,
    setFont: mockSetFont,
    setFontSize: mockSetFontSize,
    splitTextToSize: mockSplitTextToSize,
    text: mockText,
  };

  function MockJsPDF() {
    return mockDocInstance;
  }

  return {
    mockAddPage,
    mockRect,
    mockSave,
    mockSetDrawColor,
    mockSetFont,
    mockSetFontSize,
    mockSplitTextToSize,
    mockText,
    mockDocInstance,
    MockJsPDF,
  };
});

vi.mock('jspdf', () => ({
  jsPDF: MockJsPDF,
}));

import { generateNameTagPdf, type NameTagGuest } from '../src/utils/name-tag-pdf-export';

const FIXED_DATE = new Date('2026-05-07T00:00:00Z');

const SAMPLE_GUESTS: NameTagGuest[] = [
  {
    id: 1,
    name: 'Alice Smith',
    email: 'alice@example.com',
    groupLabel: 'Friends',
    status: 'Going',
    tableName: 'Table A',
    companionName: 'Jordan Smith',
    partySize: 2,
    checkedIn: true,
  },
  {
    id: 2,
    name: 'Bob Jones',
    email: 'bob@example.com',
    status: 'Pending',
    partySize: 1,
  },
];

function flattenTextCalls(): string[] {
  return mockText.mock.calls.flatMap(([value]) => (Array.isArray(value) ? value : [value]));
}

describe('generateNameTagPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSplitTextToSize.mockImplementation((text: string) => [text]);
  });

  it('returns the jsPDF document instance', () => {
    const result = generateNameTagPdf({
      guests: SAMPLE_GUESTS,
      eventName: 'Spring Gala',
      generatedAt: FIXED_DATE,
    });

    expect(result).toBe(mockDocInstance);
  });

  it('saves the PDF with a sanitized file name', () => {
    generateNameTagPdf({
      guests: SAMPLE_GUESTS,
      eventName: 'Spring Gala 2026',
      generatedAt: FIXED_DATE,
    });

    expect(mockSave).toHaveBeenCalledWith('name-tags-spring-gala-2026-2026-05-07.pdf');
  });

  it('renders guest identity and seating metadata on the tags', () => {
    generateNameTagPdf({
      guests: SAMPLE_GUESTS,
      eventName: 'Spring Gala',
      generatedAt: FIXED_DATE,
    });

    const textCalls = flattenTextCalls();
    expect(textCalls).toContain('Alice Smith');
    expect(textCalls).toContain('alice@example.com');
    expect(textCalls).toContain('Table: Table A');
    expect(textCalls).toContain('Group: Friends');
    expect(textCalls).toContain('Plus-one: Jordan Smith');
    expect(textCalls).toContain('Checked in');
  });

  it('adds a new page after every eight tags', () => {
    const guests = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      name: `Guest ${index + 1}`,
      email: `guest${index + 1}@example.com`,
    }));

    generateNameTagPdf({
      guests,
      eventName: 'Overflow Event',
      generatedAt: FIXED_DATE,
    });

    expect(mockAddPage).toHaveBeenCalledTimes(1);
  });

  it('throws when no guests are provided', () => {
    expect(() =>
      generateNameTagPdf({
        guests: [],
        eventName: 'Empty Event',
        generatedAt: FIXED_DATE,
      }),
    ).toThrow('At least one guest is required to export name tags.');
  });
});
