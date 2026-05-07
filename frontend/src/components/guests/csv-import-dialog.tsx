import { ChangeEvent, useRef, useState } from 'react';
import Papa from 'papaparse';
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
import { importCsv } from '../../services/guest-service';

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

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setError(null);

    Papa.parse<string[]>(file, {
      preview: 6,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data as string[][];
        if (rows.length < 2) {
          setError('CSV appears empty or has no data rows.');
          return;
        }
        const csvHeaders = rows[0];
        const dataRows = rows.slice(1, 6);
        setHeaders(csvHeaders);
        setPreviewRows(dataRows);
        // Auto-map headers that match field names (case-insensitive)
        const autoMap: Record<string, string> = {};
        csvHeaders.forEach((h) => {
          const normalised = h.toLowerCase().replace(/\s+/g, '_');
          const match = GUEST_FIELDS.find((f) => f.value === normalised);
          autoMap[h] = match ? match.value : '';
        });
        setColumnMap(autoMap);
      },
      error: () => setError('Failed to parse CSV file. Please check the format.'),
    });
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importCsv(eventId, selectedFile);
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
      <DialogTitle>Import Guests from CSV</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              id="csv-file-input"
              aria-label="Select CSV file"
              onChange={handleFileChange}
            />
            <label htmlFor="csv-file-input">
              <Button component="span" variant="outlined">
                {selectedFile ? selectedFile.name : 'Choose CSV File'}
              </Button>
            </label>
          </Box>

          {headers.length > 0 && (
            <>
              <Typography variant="subtitle2">Map CSV columns to guest fields:</Typography>
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
                        <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
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
        <Button onClick={handleClose} disabled={importing}>Cancel</Button>
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
