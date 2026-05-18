/**
 * QR-based live scan check-in (#546, #589).
 *
 * Uses the browser-native `BarcodeDetector` API when available (Chrome,
 * Edge, Android) for a zero-dependency scanner. Falls back to a token-paste
 * input on platforms without the API (Safari/Firefox) — that's the same
 * flow door staff use today when reading the token off a printed badge.
 *
 * Late-arrival flag and attendance-board updates are computed and pushed
 * by the backend; this page just feeds tokens and renders the result.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { scanQrToken, type QrScanResult } from '../../services/guest-service';
import { ApiError } from '../../lib/api-client';

interface BarcodeDetectorLike {
  detect: (img: HTMLVideoElement | HTMLImageElement) => Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

export default function QrScannerPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastTokenRef = useRef<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<QrScanResult | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [supported, setSupported] = useState(true);

  const handleToken = useCallback(async (token: string) => {
    if (!eventId || !token || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    try {
      const result = await scanQrToken(eventId, token);
      setLastResult(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scan failed.');
    } finally {
      // Allow re-scanning the same token after 2.5s — useful when the guest
      // accidentally double-shows the badge.
      setTimeout(() => { if (lastTokenRef.current === token) lastTokenRef.current = null; }, 2500);
    }
  }, [eventId]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    const Detector = getBarcodeDetector();
    if (!Detector) { setSupported(false); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const detector = new Detector({ formats: ['qr_code'] });
      const loop = async (): Promise<void> => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0 && codes[0].rawValue) {
            void handleToken(codes[0].rawValue);
          }
        } catch {
          // Detector occasionally throws when video isn't ready; ignore.
        }
        if (streamRef.current) {
          requestAnimationFrame(() => void loop());
        }
      };
      void loop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera unavailable.');
      stopStream();
    }
  }, [handleToken, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  async function submitManual(): Promise<void> {
    if (!manualToken.trim()) return;
    await handleToken(manualToken.trim());
    setManualToken('');
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>Live QR check-in</Typography>
        {!supported && (
          <Alert severity="info">
            Your browser does not support the BarcodeDetector API. Use a Chromium-based browser
            for camera scanning, or paste the guest&apos;s token below.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}

        <Paper sx={{ p: 2 }} variant="outlined">
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="contained" disabled={scanning} onClick={() => void startScanner()}>
                Start camera
              </Button>
              <Button variant="outlined" disabled={!scanning} onClick={stopStream}>Stop</Button>
              {scanning && <CircularProgress size={20} />}
            </Stack>
            <Box sx={{ width: '100%', maxWidth: 480, aspectRatio: '4 / 3', bgcolor: 'black' }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }} variant="outlined">
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>Manual token entry</Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste token or RSVP URL"
                fullWidth
              />
              <Button variant="contained" onClick={() => void submitManual()}>Check in</Button>
            </Stack>
          </Stack>
        </Paper>

        {lastResult && (
          <Paper sx={{ p: 2 }} variant="outlined">
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                {lastResult.alreadyCheckedIn ? 'Already checked in' : 'Checked in'}: {lastResult.rsvp.name}
              </Typography>
              <Typography color="text.secondary">{lastResult.rsvp.email}</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={`Status: ${lastResult.rsvp.canonical_status ?? lastResult.rsvp.status}`} size="small" />
                {lastResult.rsvp.guests > 1 && <Chip label={`Party of ${lastResult.rsvp.guests}`} size="small" />}
                {lastResult.rsvp.late_arrival && (
                  <Chip color="warning" size="small" label={`Late by ${lastResult.rsvp.arrival_delay_minutes ?? '?'} min`} />
                )}
                {lastResult.rsvp.meal_choice && <Chip label={`Meal: ${lastResult.rsvp.meal_choice}`} size="small" />}
              </Stack>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}
