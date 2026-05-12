/**
 * RSVP QR + confirmation-email dialog (#411, #436, #437).
 *
 * Renders an inline SVG QR code that links to the public RSVP entry, lets the
 * planner trigger a confirmation email with ICS attached, and exposes the raw
 * link for sharing.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopyRounded, RefreshRounded, SendRounded } from '@mui/icons-material';
import {
  issueRsvpToken,
  rsvpIcsUrl,
  rsvpQrUrl,
  sendRsvpConfirmation,
} from '../../services/guest-service';

interface Props {
  eventId: string | number;
  rsvpId: number;
  guestName: string;
  open: boolean;
  onClose: () => void;
}

function publicBase(): string {
  const env = (import.meta as ImportMeta & { env: { VITE_PUBLIC_BASE_URL?: string } }).env;
  if (env?.VITE_PUBLIC_BASE_URL) return env.VITE_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

export function RsvpQrDialog({
  eventId,
  rsvpId,
  guestName,
  open,
  onClose,
}: Props): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureToken(rotate = false): Promise<void> {
    setWorking(true);
    try {
      const result = await issueRsvpToken(eventId, rsvpId, rotate);
      setToken(result.token);
      setInfo(rotate ? 'Generated a new RSVP token. The previous QR is now invalid.' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue RSVP token.');
    } finally {
      setWorking(false);
    }
  }

  async function handleSend(): Promise<void> {
    setWorking(true);
    try {
      await sendRsvpConfirmation(eventId, rsvpId);
      setInfo(`Confirmation email queued for ${guestName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send confirmation.');
    } finally {
      setWorking(false);
    }
  }

  function handleCopy(text: string): void {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    setInfo('Copied to clipboard.');
  }

  // Lazy-load the token once when the dialog first opens.
  if (open && token === null && !working && !error) {
    void ensureToken(false);
  }

  const link = token ? `${publicBase()}/rsvp/${token}` : '';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>QR & confirmation — {guestName}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {info && (
          <Alert severity="info" sx={{ mb: 2 }} onClose={() => setInfo(null)}>
            {info}
          </Alert>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} gap={3} alignItems="center">
          <Box
            sx={{
              p: 1,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }}
          >
            {working && !token ? (
              <CircularProgress />
            ) : (
              <img
                src={rsvpQrUrl(eventId, rsvpId)}
                alt={`RSVP QR for ${guestName}`}
                style={{ display: 'block', width: 220, height: 220 }}
              />
            )}
          </Box>

          <Stack gap={1.5} sx={{ flex: 1 }}>
            <TextField
              label="RSVP link"
              value={link}
              size="small"
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <Tooltip title="Copy link">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(link)}
                      disabled={!link}
                      aria-label="Copy RSVP link"
                    >
                      <ContentCopyRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              }}
            />

            <Button
              startIcon={<SendRounded />}
              variant="contained"
              onClick={handleSend}
              disabled={working}
            >
              {working ? 'Sending…' : 'Send confirmation email'}
            </Button>
            <Button
              startIcon={<RefreshRounded />}
              variant="outlined"
              onClick={() => ensureToken(true)}
              disabled={working}
            >
              Rotate token
            </Button>
            <Button
              variant="text"
              component="a"
              href={rsvpIcsUrl(eventId, rsvpId)}
              target="_blank"
              rel="noopener"
            >
              Download .ics calendar invite
            </Button>
            <Typography variant="caption" color="text.secondary">
              Tokens are revoked when guests are merged or rotated. Confirmation emails attach an ICS calendar invite (Google, Outlook, Apple).
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
