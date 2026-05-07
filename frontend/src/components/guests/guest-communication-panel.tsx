import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
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
  TextField,
  Typography,
} from '@mui/material';
import { SendRounded } from '@mui/icons-material';
import {
  listCommunicationLog,
  sendInvitation,
  sendReminder,
  type BulkSendPayload,
  type CommunicationLogEntry,
  type RsvpGuest,
} from '../../services/guest-service';

type RecipientScope = 'all' | 'confirmed' | 'pending' | 'custom';

interface GuestCommunicationPanelProps {
  eventId: number | string;
  guests: RsvpGuest[];
  selectedRsvpIds?: number[];
}

const TYPE_COLOUR: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  invitation: 'info',
  reminder: 'warning',
  announcement: 'default',
  thank_you: 'success',
};

export function GuestCommunicationPanel({
  eventId,
  guests,
  selectedRsvpIds = [],
}: GuestCommunicationPanelProps): JSX.Element {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<RecipientScope>('all');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [log, setLog] = useState<CommunicationLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);

  useEffect(() => {
    setLogLoading(true);
    listCommunicationLog(eventId)
      .then(setLog)
      .catch((err: unknown) =>
        setLogError(err instanceof Error ? err.message : 'Failed to load log.'),
      )
      .finally(() => setLogLoading(false));
  }, [eventId, sendResult]);

  function buildPayload(): BulkSendPayload {
    if (scope === 'confirmed') {
      return {
        rsvpIds: guests.filter((guest) => guest.status === 'Going').map((guest) => guest.id),
        subject,
        body,
      };
    }
    if (scope === 'pending') {
      return {
        rsvpIds: guests.filter((guest) => guest.status === 'Pending').map((guest) => guest.id),
        subject,
        body,
      };
    }
    if (scope === 'custom' && selectedRsvpIds.length > 0) {
      return { rsvpIds: selectedRsvpIds, subject, body };
    }
    return { subject, body };
  }

  async function handleSendInvitation(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const result = await sendInvitation(eventId, buildPayload());
      setSendResult(result);
      setSubject('');
      setBody('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function handleSendReminder(): Promise<void> {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const result = await sendReminder(eventId, buildPayload());
      setSendResult(result);
      setSubject('');
      setBody('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ── Compose form ── */}
      <Box component="form" onSubmit={(e) => void handleSendInvitation(e)}>
        <Typography variant="h6" gutterBottom>
          Send Communication
        </Typography>

        {sendResult && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Sent to {sendResult.sent} recipient(s).{sendResult.failed > 0 && ` ${sendResult.failed} failed.`}
          </Alert>
        )}
        {sendError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {sendError}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="recipient-scope-label">Recipients</InputLabel>
            <Select
              labelId="recipient-scope-label"
              value={scope}
              label="Recipients"
              onChange={(e: SelectChangeEvent<RecipientScope>) =>
                setScope(e.target.value as RecipientScope)
              }
            >
              <MenuItem value="all">All guests</MenuItem>
              <MenuItem value="confirmed">Confirmed (Going)</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="custom">
                Selected ({selectedRsvpIds.length} guest{selectedRsvpIds.length !== 1 ? 's' : ''})
              </MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            fullWidth
            inputProps={{ 'aria-label': 'Email subject' }}
          />

          <TextField
            label="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            fullWidth
            multiline
            rows={5}
            helperText="Use {name} to personalise with guest name, {event} for event title."
            inputProps={{ 'aria-label': 'Email body' }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={sending}
              startIcon={sending ? <CircularProgress size={16} /> : <SendRounded />}
            >
              Send Invitation
            </Button>
            <Button
              variant="outlined"
              disabled={sending}
              onClick={() => void handleSendReminder()}
            >
              Send Reminder
            </Button>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* ── Communication log ── */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Communication Log
        </Typography>

        {logLoading && <CircularProgress size={24} />}
        {logError && <Alert severity="error">{logError}</Alert>}

        {!logLoading && !logError && (
          <TableContainer>
            <Table size="small" aria-label="Communication log">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Sent By</TableCell>
                  <TableCell>Sent At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {log.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No communications sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  log.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Chip
                          label={entry.type}
                          color={TYPE_COLOUR[entry.type] ?? 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{entry.subject}</TableCell>
                      <TableCell>{entry.sent_by_name ?? '—'}</TableCell>
                      <TableCell>
                        {new Date(entry.sent_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}
