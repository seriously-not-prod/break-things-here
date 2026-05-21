/**
 * Place-card PDF export (#592).
 *
 * Place cards differ from name tags in three ways: they include a
 * prominent table assignment (the whole point of a place card is to
 * direct a guest to a specific seat), they include the seating group when
 * available, and they are landscape-oriented to lay flat on the table.
 * The renderer reuses jsPDF (already a project dependency) so we do not
 * add any new packages.
 */
import { jsPDF } from 'jspdf';

export interface PlaceCardGuest {
  id: number | string;
  name: string;
  email?: string | null;
  tableName: string | null;
  seatLabel?: string | null;
  groupLabel?: string | null;
  mealChoice?: string | null;
  dietary?: string | null;
}

export interface PlaceCardPdfOptions {
  guests: PlaceCardGuest[];
  eventName?: string;
  generatedAt?: Date;
}

const PAGE = { width: 297, height: 210 };
const MARGIN = 10;
const CARD_GAP = 8;
const COLUMNS = 2;
const ROWS = 2;
const CARD_WIDTH = (PAGE.width - MARGIN * 2 - CARD_GAP * (COLUMNS - 1)) / COLUMNS;
const CARD_HEIGHT = (PAGE.height - MARGIN * 2 - CARD_GAP * (ROWS - 1)) / ROWS;
const CARDS_PER_PAGE = COLUMNS * ROWS;

function fileSegment(value: string): string {
  const v = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return v || 'event';
}

function drawCard(doc: jsPDF, guest: PlaceCardGuest, x: number, y: number): void {
  doc.setDrawColor(31, 41, 55);
  doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT);
  doc.setDrawColor(229, 231, 235);
  doc.rect(x + 3, y + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6);

  // Table label, top-center
  if (guest.tableName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`TABLE  ${guest.tableName}`.toUpperCase(), x + CARD_WIDTH / 2, y + 12, {
      align: 'center',
    });
  }

  // Name, center
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  const nameLines = doc.splitTextToSize(guest.name, CARD_WIDTH - 16);
  doc.text(nameLines.slice(0, 2), x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2, {
    align: 'center',
    baseline: 'middle',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const footers: string[] = [];
  if (guest.seatLabel) footers.push(`Seat: ${guest.seatLabel}`);
  if (guest.groupLabel) footers.push(`Group: ${guest.groupLabel}`);
  if (guest.mealChoice) footers.push(`Meal: ${guest.mealChoice}`);
  if (guest.dietary && guest.dietary !== 'None') footers.push(`Dietary: ${guest.dietary}`);
  let currentY = y + CARD_HEIGHT - 8;
  for (const line of footers.slice().reverse()) {
    doc.text(line, x + CARD_WIDTH / 2, currentY, { align: 'center' });
    currentY -= 4.5;
  }
}

export function generatePlaceCardPdf(options: PlaceCardPdfOptions): jsPDF {
  const { guests, eventName = 'Event', generatedAt = new Date() } = options;
  if (guests.length === 0) throw new Error('At least one guest is required to export place cards.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  guests.forEach((guest, index) => {
    if (index > 0 && index % CARDS_PER_PAGE === 0) doc.addPage();
    const pageIndex = index % CARDS_PER_PAGE;
    const col = pageIndex % COLUMNS;
    const row = Math.floor(pageIndex / COLUMNS);
    const x = MARGIN + col * (CARD_WIDTH + CARD_GAP);
    const y = MARGIN + row * (CARD_HEIGHT + CARD_GAP);
    drawCard(doc, guest, x, y);
  });

  doc.save(`place-cards-${fileSegment(eventName)}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
  return doc;
}
