import { ChangeEvent, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { importCsv, importCsvTemplateUrl } from '../../services/guest-service';

/** File extensions accepted by the upload input. */
const ACCEPTED_EXTENSIONS =
  '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

/** Returns true when the selected file is an Excel workbook (.xlsx / .xls). */
function isExcelFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

// Columns that can be mapped from CSV
const GUEST_FIELDS = [
  { value: '', label: '— skip —' },
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'guests', label: 'Guest Count' },
  { value: 'status', label: 'RSVP Status' },
  { value: 'dietary_restriction', label: 'Dietary Restriction' },
  { value: 'accessibility_needs', label: 'Accessibility Needs' },
  { value: 'plus_one_name', label: 'Plus One Name' },
  { value: 'guest_group', label: 'Guest Group' },
  { value: 'notes', label: 'Notes' },
];

interface CsvImportDialogProps {
  open: boolean;
  eventId: number | string;
  onClose: () => void;
  onImported: (imported: number, skipped: number) => void;
}

export function CsvImportDialog({
  open,
  eventId,
  onClose,
  onImported,
}: CsvImportDialogProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setSelectedFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setColumnMap({});
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  function applyPreview(rows: string[][]): void {
    if (rows.length < 2) {
      setError('File appears empty or has no data rows.');
      return;
    }
    const fileHeaders = rows[0];
    const dataRows = rows.slice(1, 6);
    setHeaders(fileHeaders);
    setPreviewRows(dataRows);
    // Auto-map headers that match field names (case-insensitive)
    const autoMap: Record<string, string> = {};
    fileHeaders.forEach((h) => {
      const normalised = h.toLowerCase().replace(/\s+/g, '_');
      const match = GUEST_FIELDS.find((f) => f.value === normalised);
      autoMap[h] = match ? match.value : '';
    });
    setColumnMap(autoMap);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setError(null);

    if (isExcelFile(file)) {
      // Parse with SheetJS — read first 6 rows from the first sheet
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result;
          if (!data) {
            setError('Failed to read Excel file.');
            return;
          }
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            setError('Excel file has no sheets.');
            return;
          }
          const sheet = workbook.Sheets[sheetName];
          // sheet_to_json with header:1 gives string[][] (first row = headers)
          const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            defval: '',
            range: 0,
          });
          // Filter out completely empty rows
          const rows = allRows
            .filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''))
            .map((r) => r.map((cell) => String(cell ?? '')));
          applyPreview(rows);
        } catch {
          setError('Failed to parse Excel file. Please check the format.');
        }
      };
      reader.onerror = () => setError('Failed to read Excel file.');
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<string[]>(file, {
        preview: 6,
        skipEmptyLines: true,
        complete: (result) => {
          applyPreview(result.data as string[][]);
        },
        error: () => setError('Failed to parse CSV file. Please check the format.'),
      });
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile) return;
    setImporting(true);
    setError(null);
    try {
      // Pass the field mapping from the wizard so the backend applies it
      const result = await importCsv(eventId, selectedFile, columnMap);
      onImported(result.imported, result.skipped);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Guests from CSV / Excel</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              style={{ display: 'none' }}
              id="csv-file-input"
              aria-label="Select CSV or Excel file"
              onChange={handleFileChange}
            />
            <label htmlFor="csv-file-input">
              <Button component="span" variant="outlined">
                {selectedFile ? selectedFile.name : 'Choose CSV or Excel File'}
              </Button>
            </label>
          </Box>

          {headers.length > 0 && (
            <>
              <Typography variant="subtitle2">Map columns to guest fields:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {headers.map((h) => (
                  <FormControl key={h} size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>{h}</InputLabel>
                    <Select
                      value={columnMap[h] ?? ''}
                      label={h}
                      onChange={(e: SelectChangeEvent<string>) =>
                        setColumnMap((prev) => ({ ...prev, [h]: e.target.value }))
                      }
                    >
                      {GUEST_FIELDS.map((f) => (
                        <MenuItem key={f.value} value={f.value}>
                          {f.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ))}
              </Box>

              <Typography variant="subtitle2">Preview (first 5 rows):</Typography>
              <TableContainer sx={{ maxHeight: 240 }}>
                <Table size="small" stickyHeader aria-label="CSV preview table">
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            window.location.href = importCsvTemplateUrl(eventId);
          }}
          disabled={importing}
          variant="text"
        >
          Download CSV Template
        </Button>
        <Button onClick={handleClose} disabled={importing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!selectedFile || importing}
          onClick={() => void handleImport()}
          startIcon={importing ? <CircularProgress size={16} /> : null}
        >
          {importing ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
