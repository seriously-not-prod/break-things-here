/**
 * Guest Communication Panel — issue #444 (story #413)
 *
 * Supports sending invitations, reminders, and post-event thank-you messages.
 * Shows an advisory banner with the count of unsubscribed guests so planners
 * know how many recipients will be automatically suppressed on bulk sends.
 */
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
  Tooltip,
  Typography,
} from '@mui/material';
import { SendRounded, VolunteerActivismRounded } from '@mui/icons-material';
import {
  listCommunicationLog,
  sendInvitation,
  sendReminder,
  sendThankYou,
  type BulkSendPayload,
  type BulkSendResult,
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
  const [sendResult, setSendResult] = useState<BulkSendResult | null>(null);
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
        rsvpIds: guests.filter((guest) => guest.canonical_status === 'confirmed').map((guest) => guest.id),
        subject,
        body,
      };
    }
    if (scope === 'pending') {
      return {
        rsvpIds: guests.filter((guest) => guest.canonical_status === 'pending').map((guest) => guest.id),
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

  /**
   * Send a post-event thank-you message (#444).
   * Always targets confirmed (Going) guests regardless of the selected scope;
   * unsubscribed guests are automatically suppressed by the backend.
   */
  async function handleSendThankYou(): Promise<void> {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const confirmedPayload: BulkSendPayload = {
        rsvpIds: guests.filter((g) => g.canonical_status === 'confirmed').map((g) => g.id),
        subject,
        body,
      };
      const result = await sendThankYou(eventId, confirmedPayload);
      setSendResult(result);
      setSubject('');
      setBody('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  // Count unsubscribed guests so the planner can see how many will be suppressed.
  const unsubscribedCount = guests.filter((g) => g.unsubscribed_at).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ── Compose form ── */}
      <Box component="form" onSubmit={(e) => void handleSendInvitation(e)}>
        <Typography variant="h6" gutterBottom>
          Send Communication
        </Typography>

        {unsubscribedCount > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {unsubscribedCount} guest{unsubscribedCount !== 1 ? 's have' : ' has'} unsubscribed and
            will be automatically skipped on bulk sends.
          </Alert>
        )}
        {sendResult && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Sent to {sendResult.sent} recipient(s).
            {sendResult.failed > 0 && ` ${sendResult.failed} failed.`}
            {sendResult.suppressed ? ` ${sendResult.suppressed} suppressed (unsubscribed).` : ''}
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

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
            <Tooltip title="Send post-event thank-you to confirmed (Going) guests. Unsubscribed guests are skipped automatically.">
              <span>
                <Button
                  variant="outlined"
                  color="success"
                  disabled={sending}
                  startIcon={<VolunteerActivismRounded />}
                  onClick={() => void handleSendThankYou()}
                >
                  Send Thank-You
                </Button>
              </span>
            </Tooltip>
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
