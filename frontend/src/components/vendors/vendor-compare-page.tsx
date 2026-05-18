/**
 * Vendor Compare Page (#452)
 * Side-by-side comparison of selected vendors.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Rating,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';
import { api } from '../../lib/api-client';
import { compareVendors, VendorCompare } from '../../services/vendor-communication-service';

interface VendorRow {
  id: number;
  name: string;
  category: string;
  status: string;
  quoted_amount: number | null;
  rating: number | null;
  contract_file: string | null;
}

interface Props {
  eventId: number | string;
}

export default function VendorComparePage({ eventId }: Props): JSX.Element {
  const [allVendors, setAllVendors] = useState<VendorRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [compared, setCompared] = useState<VendorCompare[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ vendors: VendorRow[] }>(`/api/events/${eventId}/vendors`)
      .then((d) => setAllVendors(d.vendors))
      .catch(() => setError('Failed to load vendors.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const toggleSelect = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const handleCompare = async (): Promise<void> => {
    if (selected.size < 2) return;
    setComparing(true);
    setError(null);
    try {
      const result = await compareVendors(eventId, [...selected]);
      setCompared(result);
    } catch {
      setError('Failed to compare vendors.');
    } finally {
      setComparing(false);
    }
  };

  const fmt = (n: number | null): string =>
    n != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
      : '—';

  /** Returns the id(s) of the best vendor(s) for a given numeric metric. */
  const bestIds = (getter: (v: VendorCompare) => number | null, lowerIsBetter = false): Set<number> => {
    const vals = compared.map((v) => ({ id: v.id, val: getter(v) })).filter((x) => x.val != null) as { id: number; val: number }[];
    if (vals.length === 0) return new Set();
    const best = lowerIsBetter ? Math.min(...vals.map((x) => x.val)) : Math.max(...vals.map((x) => x.val));
    return new Set(vals.filter((x) => x.val === best).map((x) => x.id));
  };

  const bestBg = (ids: Set<number>, vendorId: number): { bgcolor?: string } =>
    ids.has(vendorId) ? { bgcolor: 'success.50' } : {};

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h6" mb={1}>Compare Vendors</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Select 2–5 vendors to compare side by side.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Vendor selection */}
      <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
        {allVendors.map((v) => (
          <Chip
            key={v.id}
            label={v.name}
            onClick={() => toggleSelect(v.id)}
            color={selected.has(v.id) ? 'primary' : 'default'}
            variant={selected.has(v.id) ? 'filled' : 'outlined'}
            clickable
          />
        ))}
      </Stack>

      <Button
        variant="contained"
        startIcon={<CompareArrowsRounded />}
        onClick={() => void handleCompare()}
        disabled={selected.size < 2 || comparing}
        sx={{ mb: 3 }}
      >
        {comparing ? 'Loading…' : 'Compare Selected'}
      </Button>

      {/* Comparison table */}
      {compared.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Vendor comparison">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Attribute</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center" sx={{ fontWeight: 700 }}>
                    {v.name}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Category</TableCell>
                {compared.map((v) => <TableCell key={v.id} align="center">{v.category}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Status</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center">
                    <Chip label={v.status} size="small" />
                  </TableCell>
                ))}
              </TableRow>
              {/* Lowest quoted amount highlighted */}
              {(() => { const best = bestIds((v) => v.quoted_amount, true); return (
              <TableRow>
                <TableCell>Quoted Amount</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center" sx={bestBg(best, v.id)}>{fmt(v.quoted_amount)}</TableCell>
                ))}
              </TableRow>
              ); })()}
              {/* Highest rating highlighted */}
              {(() => { const best = bestIds((v) => v.rating); return (
              <TableRow>
                <TableCell>Rating</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center" sx={bestBg(best, v.id)}>
                    {v.rating ? <Rating value={v.rating} readOnly size="small" /> : '—'}
                  </TableCell>
                ))}
              </TableRow>
              ); })()}
              <TableRow>
                <TableCell>Contract on File</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center">
                    <Chip
                      label={v.contract_file ? 'Yes' : 'No'}
                      color={v.contract_file ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                ))}
              </TableRow>
              {/* Most communications highlighted */}
              {(() => { const best = bestIds((v) => v.communication_count); return (
              <TableRow>
                <TableCell>Communications</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center" sx={bestBg(best, v.id)}>{v.communication_count}</TableCell>
                ))}
              </TableRow>
              ); })()}
              <TableRow>
                <TableCell>Last Contact</TableCell>
                {compared.map((v) => (
                  <TableCell key={v.id} align="center">
                    {v.last_contact_at
                      ? new Date(v.last_contact_at).toLocaleDateString()
                      : '—'}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
