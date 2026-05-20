/**
 * Vendor Communication Log Panel (#452)
 * Displays and manages the communication history for a vendor.
 */

import { useCallback, useEffect, useState } from 'react';
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
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import {
  VendorCommLog,
  addVendorCommunication,
  deleteVendorCommunication,
  listVendorCommunication,
} from '../../services/vendor-communication-service';

const COMM_TYPES = ['email', 'call', 'meeting', 'quote', 'follow_up', 'other'] as const;

const TYPE_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'secondary'> = {
  email: 'info',
  call: 'success',
  meeting: 'secondary',
  quote: 'warning',
  follow_up: 'default',
  other: 'default',
};

interface Props {
  eventId: number | string;
  vendorId: number | string;
  vendorName: string;
}

export default function VendorCommunicationLog({ eventId, vendorId, vendorName }: Props): JSX.Element {
  const [logs, setLogs] = useState<VendorCommLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Form state
  const [type, setType] = useState<string>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const data = await listVendorCommunication(eventId, vendorId);
      setLogs(data);
    } catch {
      setError('Failed to load communication log.');
    } finally {
      setLoading(false);
    }
  }, [eventId, vendorId]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (): Promise<void> => {
    setFormError(null);
    if (!subject.trim()) { setFormError('Subject is required.'); return; }

    try {
      setSaving(true);
      await addVendorCommunication(eventId, vendorId, { type, subject, body: body || undefined });
      setAddOpen(false);
      setSubject('');
      setBody('');
      setType('email');
      await load();
    } catch {
      setFormError('Failed to add log entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId: number): Promise<void> => {
    try {
      await deleteVendorCommunication(eventId, vendorId, logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch {
      setError('Failed to delete log entry.');
    }
  };

  if (loading) return <CircularProgress size={20} />;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">Communication History — {vendorName}</Typography>
        <Button size="small" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
          Log
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {logs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No communication logged yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {logs.map((log) => (
            <Box
              key={log.id}
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                  <Chip
                    label={log.type.replace('_', ' ')}
                    size="small"
                    color={TYPE_COLORS[log.type] ?? 'default'}
                  />
                  <Typography variant="subtitle2">{log.subject}</Typography>
                </Stack>
                {log.body && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {log.body}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {log.author_name ?? 'Unknown'} · {new Date(log.created_at).toLocaleString()}
                </Typography>
              </Box>
              <Tooltip title="Delete entry">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => void handleDelete(log.id)}
                  aria-label="Delete log entry"
                >
                  <DeleteRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log Communication</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
                {COMM_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{t.replace('_', ' ')}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              fullWidth
              size="small"
            />
            <TextField
              label="Notes (optional)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              fullWidth
              multiline
              rows={3}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleAdd()} disabled={saving}>
            {saving ? 'Saving…' : 'Log'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
