import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Rating,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import {
  type CreateVendorInput,
  type Vendor,
  type VendorStatus,
  createVendor,
  deleteVendor,
  listVendors,
  updateVendor,
  uploadVendorContract,
} from '../../services/vendors-service';

const VENDOR_STATUSES: VendorStatus[] = ['Contacted', 'Quote Received', 'Booked', 'Confirmed', 'Cancelled'];
const VENDOR_CATEGORIES = [
  'Catering', 'Audio/Visual', 'Venue', 'Photography', 'Videography',
  'Entertainment', 'Décor', 'Flowers', 'Security', 'Transportation',
  'Lighting', 'Staffing', 'Other',
];

function statusColor(status: VendorStatus): 'default' | 'info' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'Contacted': return 'default';
    case 'Quote Received': return 'info';
    case 'Booked': return 'warning';
    case 'Confirmed': return 'success';
    case 'Cancelled': return 'error';
    default: return 'default';
  }
}

const emptyForm: CreateVendorInput = {
  name: '',
  category: '',
  email: '',
  phone: '',
  website: '',
  status: 'Contacted',
  quoted_amount: undefined,
  notes: '',
  rating: undefined,
};

export default function VendorsPage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<CreateVendorInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const contractInputRef = useRef<HTMLInputElement>(null);
  const [contractTarget, setContractTarget] = useState<Vendor | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void loadVendors();
  }, [eventId]);

  async function loadVendors(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const data = await listVendors(eventId);
      setVendors(data);
    } catch {
      setError('Failed to load vendors.');
    } finally {
      setLoading(false);
    }
  }

  function openAddDialog(): void {
    setEditingVendor(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(vendor: Vendor): void {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name,
      category: vendor.category,
      email: vendor.email ?? '',
      phone: vendor.phone ?? '',
      website: vendor.website ?? '',
      status: vendor.status,
      quoted_amount: vendor.quoted_amount ?? undefined,
      notes: vendor.notes ?? '',
      rating: vendor.rating ?? undefined,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function handleTextField(field: keyof CreateVendorInput) {
    return (e: ChangeEvent<HTMLInputElement>): void => {
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    };
  }

  function handleStatusChange(e: SelectChangeEvent): void {
    setForm(prev => ({ ...prev, status: e.target.value as VendorStatus }));
  }

  function handleCategoryChange(e: SelectChangeEvent): void {
    setForm(prev => ({ ...prev, category: e.target.value }));
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.category.trim()) { setFormError('Category is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreateVendorInput = {
        ...form,
        quoted_amount: form.quoted_amount !== undefined && form.quoted_amount !== ('' as unknown) ? Number(form.quoted_amount) : undefined,
        rating: form.rating !== undefined && form.rating !== ('' as unknown) ? Number(form.rating) : undefined,
      };
      if (editingVendor) {
        const updated = await updateVendor(eventId, editingVendor.id, payload);
        setVendors(prev => prev.map(v => (v.id === updated.id ? updated : v)));
      } else {
        const created = await createVendor(eventId, payload);
        setVendors(prev => [created, ...prev]);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save vendor.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVendor(eventId, deleteTarget.id);
      setVendors(prev => prev.filter(v => v.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError('Failed to delete vendor.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleContractUpload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file || !contractTarget) return;
    setUploading(true);
    try {
      const updated = await uploadVendorContract(eventId, contractTarget.id, file);
      setVendors(prev => prev.map(v => (v.id === updated.id ? updated : v)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload contract.');
    } finally {
      setUploading(false);
      setContractTarget(null);
      if (contractInputRef.current) contractInputRef.current.value = '';
    }
  }

  const filtered = vendors.filter(v => {
    if (filterCategory && v.category !== filterCategory) return false;
    if (filterStatus && v.status !== filterStatus) return false;
    return true;
  });

  return (
    <PageLayout
      title="Vendors"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Vendors' }]}
      actions={
        <Button variant="contained" startIcon={<AddRounded />} onClick={openAddDialog}>
          Add Vendor
        </Button>
      }
    >

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filter-category-label">Category</InputLabel>
          <Select
            labelId="filter-category-label"
            label="Category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <MenuItem value="">All Categories</MenuItem>
            {VENDOR_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filter-status-label">Status</InputLabel>
          <Select
            labelId="filter-status-label"
            label="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {VENDOR_STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">No vendors found. Add one to get started.</Typography>
      ) : (
        <Grid container spacing={2}>
          {filtered.map(vendor => (
            <Grid item key={vendor.id} xs={12} sm={6} md={4}>
              <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} mb={1} flexWrap="wrap">
                    <Chip label={vendor.category} size="small" />
                    <Chip label={vendor.status} size="small" color={statusColor(vendor.status)} />
                  </Stack>
                  <Typography variant="h6" component="h2" gutterBottom>{vendor.name}</Typography>
                  {vendor.rating !== null && (
                    <Rating value={vendor.rating} readOnly size="small" aria-label={`Rating: ${vendor.rating} out of 5`} />
                  )}
                  {vendor.quoted_amount !== null && (
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                      Quoted: ${Number(vendor.quoted_amount).toFixed(2)}
                    </Typography>
                  )}
                  {vendor.email && (
                    <Typography variant="body2" mt={0.5}>{vendor.email}</Typography>
                  )}
                  {vendor.phone && (
                    <Typography variant="body2">{vendor.phone}</Typography>
                  )}
                  {vendor.notes && (
                    <Typography variant="body2" color="text.secondary" mt={1} sx={{ whiteSpace: 'pre-line' }}>
                      {vendor.notes}
                    </Typography>
                  )}
                  {vendor.contract_file && (
                    <Typography variant="caption" color="success.main" display="block" mt={1}>
                      ✓ Contract uploaded
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                  <Tooltip title="Upload contract (PDF)">
                    <IconButton
                      size="small"
                      aria-label={`Upload contract for ${vendor.name}`}
                      onClick={() => {
                        setContractTarget(vendor);
                        contractInputRef.current?.click();
                      }}
                      disabled={uploading}
                    >
                      <UploadFileRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit vendor">
                    <IconButton size="small" aria-label={`Edit ${vendor.name}`} onClick={() => openEditDialog(vendor)}>
                      <EditRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete vendor">
                    <IconButton size="small" aria-label={`Delete ${vendor.name}`} onClick={() => setDeleteTarget(vendor)}>
                      <DeleteRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Hidden file input for contract upload */}
      <input
        ref={contractInputRef}
        type="file"
        accept="application/pdf"
        aria-label="Select contract file"
        style={{ display: 'none' }}
        onChange={handleContractUpload}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit} noValidate>
          <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              {formError && <Alert severity="error">{formError}</Alert>}
              <TextField
                label="Vendor Name"
                value={form.name}
                onChange={handleTextField('name')}
                required
                autoFocus
                inputProps={{ 'aria-required': 'true' }}
              />
              <FormControl required>
                <InputLabel id="vendor-category-label">Category</InputLabel>
                <Select
                  labelId="vendor-category-label"
                  label="Category"
                  value={form.category}
                  onChange={handleCategoryChange}
                >
                  {VENDOR_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel id="vendor-status-label">Status</InputLabel>
                <Select
                  labelId="vendor-status-label"
                  label="Status"
                  value={form.status ?? 'Contacted'}
                  onChange={handleStatusChange}
                >
                  {VENDOR_STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Email" type="email" value={form.email ?? ''} onChange={handleTextField('email')} />
              <TextField label="Phone" value={form.phone ?? ''} onChange={handleTextField('phone')} />
              <TextField label="Website" value={form.website ?? ''} onChange={handleTextField('website')} />
              <TextField
                label="Quoted Amount ($)"
                type="number"
                value={form.quoted_amount ?? ''}
                onChange={handleTextField('quoted_amount')}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <Box>
                <Typography component="legend" variant="body2" gutterBottom>Rating</Typography>
                <Rating
                  name="vendor-rating"
                  value={form.rating ?? null}
                  onChange={(_, val) => setForm(prev => ({ ...prev, rating: val ?? undefined }))}
                />
              </Box>
              <TextField
                label="Notes"
                multiline
                minRows={3}
                value={form.notes ?? ''}
                onChange={handleTextField('notes')}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={20} /> : (editingVendor ? 'Save' : 'Add')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Vendor</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
