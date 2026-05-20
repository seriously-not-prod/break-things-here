/**
 * Vendor Compare Dialog — #797
 *
 * Pop-up side-by-side comparison of 2–4 vendors triggered from the vendor
 * list page's selection toolbar. Shows currency-converted quoted_amount via
 * the exchange-rates API, rating, categories, communication response time.
 * The "Pick this vendor" action stamps `selected_vendor_id` on a budget
 * category via the new PATCH endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Rating,
  Select,
  type SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { compareVendors, type VendorCompare } from '../../services/vendor-communication-service';
import {
  type ExchangeRate,
  formatCurrency,
  listExchangeRates,
} from '../../services/currency-service';
import {
  type BudgetCategory,
  listCategories,
  setCategorySelectedVendor,
} from '../../services/budget-service';

interface Props {
  open: boolean;
  eventId: number | string;
  selectedVendorIds: number[];
  baseCurrency?: string;
  onClose: () => void;
  /** Notifies parent when a vendor was successfully "picked" for a category. */
  onPicked?: (vendorId: number, categoryId: number) => void;
}

const SUPPORTED_FALLBACK = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'];

function buildRateLookup(rates: ExchangeRate[]): (from: string, to: string) => number | null {
  const map = new Map<string, number>();
  rates.forEach((r) => {
    const key = `${r.base_currency.toUpperCase()}->${r.quote_currency.toUpperCase()}`;
    const v = Number(r.rate);
    if (Number.isFinite(v) && v > 0) map.set(key, v);
  });
  return (from: string, to: string): number | null => {
    const a = from.toUpperCase();
    const b = to.toUpperCase();
    if (a === b) return 1;
    const direct = map.get(`${a}->${b}`);
    if (direct) return direct;
    const inverse = map.get(`${b}->${a}`);
    if (inverse) return 1 / inverse;
    return null;
  };
}

export default function VendorCompareDialog({
  open,
  eventId,
  selectedVendorIds,
  baseCurrency = 'USD',
  onClose,
  onPicked,
}: Props): JSX.Element {
  const [vendors, setVendors] = useState<VendorCompare[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<string>(baseCurrency);
  const [categoryIdByVendor, setCategoryIdByVendor] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [pickingVendorId, setPickingVendorId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canCompare = selectedVendorIds.length >= 2 && selectedVendorIds.length <= 4;

  const load = useCallback(async (): Promise<void> => {
    if (!open || !canCompare) return;
    setLoading(true);
    setError(null);
    try {
      const [comparison, rateList, cats] = await Promise.all([
        compareVendors(eventId, selectedVendorIds),
        listExchangeRates().catch(() => [] as ExchangeRate[]),
        listCategories(eventId).catch(() => [] as BudgetCategory[]),
      ]);
      setVendors(comparison);
      setRates(rateList);
      setCategories(cats);
    } catch {
      setError('Failed to load vendor comparison.');
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, [open, canCompare, eventId, selectedVendorIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setSuccess(null);
      setError(null);
      setPickingVendorId(null);
    }
  }, [open]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>([
      baseCurrency.toUpperCase(),
      displayCurrency.toUpperCase(),
      ...SUPPORTED_FALLBACK,
    ]);
    rates.forEach((r) => {
      set.add(r.base_currency.toUpperCase());
      set.add(r.quote_currency.toUpperCase());
    });
    return Array.from(set).sort();
  }, [rates, baseCurrency, displayCurrency]);

  const rateLookup = useMemo(() => buildRateLookup(rates), [rates]);

  const convert = useCallback(
    (amount: number | null): { value: number | null; missing: boolean } => {
      if (amount === null || amount === undefined) return { value: null, missing: false };
      const rate = rateLookup(baseCurrency, displayCurrency);
      if (rate === null) return { value: amount, missing: true };
      return { value: amount * rate, missing: false };
    },
    [rateLookup, baseCurrency, displayCurrency],
  );

  const handleCurrencyChange = (e: SelectChangeEvent<string>): void => {
    setDisplayCurrency(e.target.value);
  };

  const handleCategorySelect = (vendorId: number) => (e: SelectChangeEvent<string>) => {
    setCategoryIdByVendor((prev) => ({ ...prev, [vendorId]: e.target.value }));
  };

  const handlePick = async (vendor: VendorCompare): Promise<void> => {
    const categoryIdStr = categoryIdByVendor[vendor.id];
    if (!categoryIdStr) {
      setError('Choose a budget category before picking a vendor.');
      return;
    }
    const categoryId = Number(categoryIdStr);
    if (!Number.isFinite(categoryId)) return;
    setPickingVendorId(vendor.id);
    setError(null);
    try {
      await setCategorySelectedVendor(eventId, categoryId, vendor.id);
      const cat = categories.find((c) => c.id === categoryId);
      setSuccess(`"${vendor.name}" stamped onto category "${cat?.name ?? categoryId}".`);
      onPicked?.(vendor.id, categoryId);
    } catch {
      setError('Failed to stamp the vendor onto the category.');
    } finally {
      setPickingVendorId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      aria-labelledby="vendor-compare-dialog-title"
    >
      <DialogTitle id="vendor-compare-dialog-title" sx={{ pr: 6 }}>
        Compare Vendors
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!canCompare && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Select between 2 and 4 vendors to compare.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ mb: 2 }}
          alignItems="center"
        >
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="vendor-compare-currency-label">Display currency</InputLabel>
            <Select
              labelId="vendor-compare-currency-label"
              label="Display currency"
              value={displayCurrency}
              onChange={handleCurrencyChange}
            >
              {availableCurrencies.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            Quoted amounts shown in {displayCurrency} (converted from {baseCurrency} via
            exchange_rates).
          </Typography>
        </Stack>

        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : vendors.length === 0 ? (
          canCompare ? (
            <Typography color="text.secondary">No vendor data to compare.</Typography>
          ) : null
        ) : (
          <TableContainer>
            <Table
              size="small"
              aria-label="Vendor comparison table"
              data-testid="vendor-compare-table"
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    <strong>Attribute</strong>
                  </TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      <strong>{v.name}</strong>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Category</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      {v.category}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Status</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      <Chip label={v.status} size="small" />
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Rating</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      {v.rating ? (
                        <Rating
                          value={v.rating}
                          readOnly
                          size="small"
                          aria-label={`Rating ${v.rating} of 5`}
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>
                    Quoted Amount
                    <Typography variant="caption" display="block" color="text.secondary">
                      in {displayCurrency}
                    </Typography>
                  </TableCell>
                  {vendors.map((v) => {
                    const { value, missing } = convert(
                      v.quoted_amount === null ? null : Number(v.quoted_amount),
                    );
                    return (
                      <TableCell key={v.id} align="center" data-testid={`vendor-quote-${v.id}`}>
                        {value === null ? '—' : formatCurrency(value, displayCurrency)}
                        {missing && (
                          <Tooltip
                            title={`No ${baseCurrency}→${displayCurrency} rate; shown in ${baseCurrency}.`}
                          >
                            <Typography
                              component="span"
                              variant="caption"
                              color="warning.main"
                              sx={{ ml: 0.5 }}
                            >
                              *
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell>Communications</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      {v.communication_count}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Last contact / response</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      {v.last_contact_at ? new Date(v.last_contact_at).toLocaleString() : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Contract on file</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      <Chip
                        label={v.contract_file ? 'Yes' : 'No'}
                        color={v.contract_file ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Budget category</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id={`vc-cat-${v.id}`}>Category</InputLabel>
                        <Select
                          labelId={`vc-cat-${v.id}`}
                          label="Category"
                          value={categoryIdByVendor[v.id] ?? ''}
                          onChange={handleCategorySelect(v.id)}
                          inputProps={{ 'aria-label': `Choose budget category for ${v.name}` }}
                        >
                          <MenuItem value="">— Not set —</MenuItem>
                          {categories.map((c) => (
                            <MenuItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Action</TableCell>
                  {vendors.map((v) => (
                    <TableCell key={v.id} align="center">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={
                          pickingVendorId === v.id ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <CheckCircleRounded />
                          )
                        }
                        onClick={() => void handlePick(v)}
                        disabled={
                          pickingVendorId !== null ||
                          !categoryIdByVendor[v.id] ||
                          categories.length === 0
                        }
                        data-testid={`vendor-pick-${v.id}`}
                      >
                        Pick this vendor
                      </Button>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
