import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  DeleteRounded,
  FileDownloadRounded,
  FileUploadRounded,
  HowToRegRounded,
  PictureAsPdfRounded,
  QrCode2Rounded,
  SearchRounded,
  SendRounded,
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import {
  checkInGuest,
  createRsvp,
  deleteRsvp,
  exportCsvUrl,
  listRsvpGuests,
  listTables,
  type GuestGroup,
  type RsvpGuest,
  type RsvpGuestInput,
  type RsvpStatus,
} from '../../services/guest-service';
import { generateNameTagPdf } from '../../utils/name-tag-pdf-export';
import { AddGuestDialog } from './add-guest-dialog';
import { CsvImportDialog } from './csv-import-dialog';
import { GuestCommunicationPanel } from './guest-communication-panel';
import { DuplicatesPanel } from './duplicates-panel';
import { WaitlistPanel } from './waitlist-panel';
import { RsvpQuestionsPanel } from './rsvp-questions-panel';
import { RsvpQrDialog } from './rsvp-qr-dialog';

// ─── Status chip colours ──────────────────────────────────────────────────────

const STATUS_COLOUR: Record<
  RsvpStatus,
  'default' | 'success' | 'warning' | 'error' | 'info'
> = {
  Going: 'success',
  Pending: 'warning',
  Maybe: 'info',
  'Not Going': 'error',
  Declined: 'error',
};

const ALL_STATUSES: RsvpStatus[] = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];
const ALL_GROUPS: GuestGroup[] = ['Family', 'Friends', 'Colleagues', 'VIPs', 'Custom'];

// ─── Component ───────────────────────────────────────────────────────────────

export default function GuestsPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();

  const [guests, setGuests] = useState<RsvpGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RsvpStatus | ''>('');
  const [groupFilter, setGroupFilter] = useState<GuestGroup | ''>('');

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Tab: 0 = Guest List, 1 = Communication, 2 = Duplicates, 3 = Waitlist, 4 = Questions
  const [tab, setTab] = useState(0);
  const [exportingNameTags, setExportingNameTags] = useState(false);

  // QR/confirmation dialog
  const [qrTarget, setQrTarget] = useState<RsvpGuest | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback((): void => {
    if (!eventId) return;
    setLoading(true);
    listRsvpGuests(eventId)
      .then(setGuests)
      .catch((err: unknown) =>
        setPageError(err instanceof Error ? err.message : 'Failed to load guests.'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () =>
      guests.filter((g) => {
        const q = search.toLowerCase();
        if (
          q &&
          !g.name.toLowerCase().includes(q) &&
          !g.email.toLowerCase().includes(q) &&
          !(g.phone ?? '').toLowerCase().includes(q)
        ) {
          return false;
        }
        if (statusFilter && g.status !== statusFilter) return false;
        if (groupFilter && g.guest_group !== groupFilter) return false;
        return true;
      }),
    [guests, search, statusFilter, groupFilter],
  );

  // ── Selection helpers ──────────────────────────────────────────────────────

  const allSelected =
    filtered.length > 0 && filtered.every((g) => selected.has(g.id));

  function toggleSelectAll(): void {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((g) => g.id)));
    }
  }

  function toggleSelect(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleAddGuest(input: RsvpGuestInput): Promise<void> {
    if (!eventId) return;
    await createRsvp(eventId, input);
    load();
  }

  async function handleCheckIn(guest: RsvpGuest): Promise<void> {
    if (!eventId) return;
    try {
      const updated = await checkInGuest(eventId, guest.id);
      setGuests((prev) => prev.map((g) => (g.id === updated.id ? (updated as RsvpGuest) : g)));
      setToast(`${guest.name} checked in.`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Check-in failed.');
    }
  }

  async function handleDeleteSelected(): Promise<void> {
    if (!eventId) return;
    const ids = Array.from(selected);
    await Promise.allSettled(ids.map((id) => deleteRsvp(eventId, id)));
    setSelected(new Set());
    load();
    setToast(`${ids.length} guest(s) deleted.`);
  }

  function handleExport(): void {
    if (!eventId) return;
    window.location.href = exportCsvUrl(eventId);
  }

  async function handleExportNameTags(selectedGuestIds?: Set<number>): Promise<void> {
    if (!eventId) return;

    const exportGuests = selectedGuestIds
      ? guests.filter((guest) => selectedGuestIds.has(guest.id))
      : filtered;

    if (exportGuests.length === 0) {
      return;
    }

    setExportingNameTags(true);
    try {
      const tables = await listTables(eventId).catch(() => []);
      const tableLookup = new Map<number, string>();

      tables.forEach((table) => {
        table.guests.forEach((guest) => {
          tableLookup.set(guest.rsvp_id, table.name);
        });
      });

      generateNameTagPdf({
        guests: exportGuests.map((guest) => ({
          id: guest.id,
          name: guest.name,
          email: guest.email,
          groupLabel: guest.guest_group,
          status: guest.status,
          tableName: tableLookup.get(guest.id) ?? null,
          companionName: guest.plus_one ? guest.plus_one_name : null,
          partySize: guest.guests,
          checkedIn: guest.checked_in,
        })),
        eventName: `event-${eventId}`,
      });
      setToast(`Exported ${exportGuests.length} name tag(s).`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to export name tags.');
    } finally {
      setExportingNameTags(false);
    }
  }

  function handleImported(imported: number, skipped: number): void {
    load();
    setToast(`Imported ${imported} guest(s), skipped ${skipped} duplicate(s).`);
  }

  const selectedIds = Array.from(selected);

  return (
    <PageLayout
      title="Guest List"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Guests' }]}
    >
      {pageError && <Alert severity="error" sx={{ mb: 2 }}>{pageError}</Alert>}

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Guests" aria-label="Guests tab" />
        <Tab label="Communication" aria-label="Communication tab" />
        <Tab label="Duplicates" aria-label="Duplicate guests tab" />
        <Tab label="Waitlist" aria-label="Waitlist tab" />
        <Tab label="Custom questions" aria-label="Custom RSVP questions tab" />
      </Tabs>

      {tab === 2 && eventId && (
        <DuplicatesPanel eventId={eventId} onChanged={load} />
      )}
      {tab === 3 && eventId && (
        <WaitlistPanel eventId={eventId} onChanged={load} />
      )}
      {tab === 4 && eventId && <RsvpQuestionsPanel eventId={eventId} />}

      {tab === 0 && (
        <>
          {/* ── Toolbar ── */}
          <Toolbar disableGutters sx={{ gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <TextField
              size="small"
              placeholder="Search name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>
                ),
              }}
              sx={{ minWidth: 220 }}
              inputProps={{ 'aria-label': 'Search guests' }}
            />

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="status-filter-label">Status</InputLabel>
              <Select
                labelId="status-filter-label"
                value={statusFilter}
                label="Status"
                onChange={(e: SelectChangeEvent<RsvpStatus | ''>) =>
                  setStatusFilter(e.target.value as RsvpStatus | '')
                }
              >
                <MenuItem value=""><em>All statuses</em></MenuItem>
                {ALL_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="group-filter-label">Group</InputLabel>
              <Select
                labelId="group-filter-label"
                value={groupFilter}
                label="Group"
                onChange={(e: SelectChangeEvent<GuestGroup | ''>) =>
                  setGroupFilter(e.target.value as GuestGroup | '')
                }
              >
                <MenuItem value=""><em>All groups</em></MenuItem>
                {ALL_GROUPS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>

            <Box sx={{ flexGrow: 1 }} />

            <Button
              variant="outlined"
              size="small"
              startIcon={<FileUploadRounded />}
              onClick={() => setImportOpen(true)}
            >
              Import CSV
            </Button>

            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadRounded />}
              onClick={handleExport}
            >
              Export CSV
            </Button>

            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdfRounded />}
              onClick={() => void handleExportNameTags()}
              disabled={exportingNameTags || filtered.length === 0}
              aria-label="Export guest name tags as PDF"
            >
              {exportingNameTags ? 'Exporting…' : 'Name Tags PDF'}
            </Button>

            <Button
              variant="contained"
              size="small"
              startIcon={<AddRounded />}
              onClick={() => setAddOpen(true)}
            >
              Add Guest
            </Button>
          </Toolbar>

          {/* ── Bulk action bar ── */}
          {selected.size > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1,
                bgcolor: 'primary.50',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                {selected.size} selected
              </Typography>
              <Button
                size="small"
                startIcon={<SendRounded />}
                onClick={() => setTab(1)}
              >
                Send Invitation
              </Button>
              <Button
                size="small"
                startIcon={<PictureAsPdfRounded />}
                onClick={() => void handleExportNameTags(new Set(selected))}
                disabled={exportingNameTags}
                aria-label="Export selected guest name tags as PDF"
              >
                Export Selected Tags
              </Button>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteRounded />}
                onClick={() => void handleDeleteSelected()}
              >
                Delete Selected
              </Button>
            </Box>
          )}

          {/* ── Table ── */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Guest list table">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={selected.size > 0 && !allSelected}
                        onChange={toggleSelectAll}
                        inputProps={{ 'aria-label': 'Select all guests' }}
                      />
                    </TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Phone</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Dietary</TableCell>
                    <TableCell>Plus One</TableCell>
                    <TableCell>Group</TableCell>
                    <TableCell>Checked In</TableCell>
                    <TableCell aria-label="Actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center">
                        No guests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((guest) => (
                      <TableRow
                        key={guest.id}
                        selected={selected.has(guest.id)}
                        hover
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selected.has(guest.id)}
                            onChange={() => toggleSelect(guest.id)}
                            inputProps={{ 'aria-label': `Select ${guest.name}` }}
                          />
                        </TableCell>
                        <TableCell>{guest.name}</TableCell>
                        <TableCell>{guest.email}</TableCell>
                        <TableCell>{guest.phone ?? '—'}</TableCell>
                        <TableCell>
                          <Chip
                            label={guest.status}
                            color={STATUS_COLOUR[guest.status] ?? 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{guest.dietary_restriction ?? 'None'}</TableCell>
                        <TableCell>{guest.plus_one ? (guest.plus_one_name ?? 'Yes') : 'No'}</TableCell>
                        <TableCell>{guest.guest_group ?? '—'}</TableCell>
                        <TableCell>
                          {guest.checked_in ? (
                            <Chip label="Checked in" color="success" size="small" />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {!guest.checked_in && (
                              <Tooltip title="Check in">
                                <IconButton
                                  size="small"
                                  aria-label={`Check in ${guest.name}`}
                                  onClick={() => void handleCheckIn(guest)}
                                >
                                  <HowToRegRounded fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="QR / confirmation">
                              <IconButton
                                size="small"
                                aria-label={`Show QR for ${guest.name}`}
                                onClick={() => setQrTarget(guest)}
                              >
                                <QrCode2Rounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete ${guest.name}`}
                                onClick={() => {
                                  if (!eventId) return;
                                  void deleteRsvp(eventId, guest.id).then(() => load());
                                }}
                              >
                                <DeleteRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {tab === 1 && eventId && (
        <GuestCommunicationPanel
          eventId={eventId}
          guests={guests}
          selectedRsvpIds={selectedIds}
        />
      )}

      {/* ── Dialogs ── */}
      <AddGuestDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddGuest}
      />

      {eventId && (
        <CsvImportDialog
          open={importOpen}
          eventId={eventId}
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      )}

      {qrTarget && eventId && (
        <RsvpQrDialog
          eventId={eventId}
          rsvpId={qrTarget.id}
          guestName={qrTarget.name}
          open={!!qrTarget}
          onClose={() => setQrTarget(null)}
        />
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
      />
    </PageLayout>
  );
}
