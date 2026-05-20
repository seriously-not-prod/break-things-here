import { jsPDF } from 'jspdf';

export interface NameTagGuest {
  id: number | string;
  name: string;
  email: string;
  groupLabel?: string | null;
  status?: string | null;
  tableName?: string | null;
  companionName?: string | null;
  partySize?: number | null;
  checkedIn?: boolean;
}

export interface NameTagPdfOptions {
  guests: NameTagGuest[];
  eventName?: string;
  generatedAt?: Date;
}

const PAGE_MARGIN = 10;
const CARD_GAP = 6;
const CARD_COLUMNS = 2;
const CARD_ROWS = 4;
const PAGE_SIZE = {
  width: 210,
  height: 297,
};
const CARDS_PER_PAGE = CARD_COLUMNS * CARD_ROWS;
const CARD_WIDTH =
  (PAGE_SIZE.width - PAGE_MARGIN * 2 - CARD_GAP * (CARD_COLUMNS - 1)) / CARD_COLUMNS;
const CARD_HEIGHT = (PAGE_SIZE.height - PAGE_MARGIN * 2 - CARD_GAP * (CARD_ROWS - 1)) / CARD_ROWS;

function sanitizeFileSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'event';
}

function buildDetailLines(guest: NameTagGuest): string[] {
  const detailLines = [guest.email];

  if (guest.tableName) {
    detailLines.push(`Table: ${guest.tableName}`);
  }

  if (guest.groupLabel) {
    detailLines.push(`Group: ${guest.groupLabel}`);
  }

  if (guest.status) {
    detailLines.push(`Status: ${guest.status}`);
  }

  if ((guest.partySize ?? 0) > 1) {
    detailLines.push(`Party: ${guest.partySize}`);
  }

  if (guest.companionName) {
    detailLines.push(`Plus-one: ${guest.companionName}`);
  }

  if (guest.checkedIn) {
    detailLines.push('Checked in');
  }

  return detailLines;
}

function drawNameTag(doc: jsPDF, guest: NameTagGuest, x: number, y: number): void {
  const contentWidth = CARD_WIDTH - 8;
  let currentY = y + 7;

  doc.setDrawColor(55, 65, 81);
  doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NAME TAG', x + 4, currentY);
  currentY += 8;

  doc.setFontSize(18);
  const nameLines = doc.splitTextToSize(guest.name, contentWidth);
  const cappedNameLines = nameLines.slice(0, 2);
  doc.text(cappedNameLines, x + 4, currentY);
  currentY += cappedNameLines.length * 7 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const detailLines = buildDetailLines(guest);

  for (const line of detailLines) {
    const wrappedLines = doc.splitTextToSize(line, contentWidth);
    for (const wrappedLine of wrappedLines) {
      if (currentY > y + CARD_HEIGHT - 6) {
        return;
      }
      doc.text(wrappedLine, x + 4, currentY);
      currentY += 4.5;
    }
  }
}

export function generateNameTagPdf(options: NameTagPdfOptions): jsPDF {
  const { guests, eventName = 'Event', generatedAt = new Date() } = options;

  if (guests.length === 0) {
    throw new Error('At least one guest is required to export name tags.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  guests.forEach((guest, index) => {
    if (index > 0 && index % CARDS_PER_PAGE === 0) {
      doc.addPage();
    }

    const pageIndex = index % CARDS_PER_PAGE;
    const column = pageIndex % CARD_COLUMNS;
    const row = Math.floor(pageIndex / CARD_COLUMNS);
    const x = PAGE_MARGIN + column * (CARD_WIDTH + CARD_GAP);
    const y = PAGE_MARGIN + row * (CARD_HEIGHT + CARD_GAP);

    drawNameTag(doc, guest, x, y);
  });

  const fileName = `name-tags-${sanitizeFileSegment(eventName)}-${generatedAt
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(fileName);
  return doc;
}
