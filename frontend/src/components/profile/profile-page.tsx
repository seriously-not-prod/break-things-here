import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { CameraAltRounded, DeleteRounded, SaveRounded } from '@mui/icons-material';
import { api, ApiError, getAuthHeaders } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';

interface ProfileData {
  bio: string | null;
  phone_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  profile_photo_url: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export default function ProfilePage(): JSX.Element {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form, setForm] = useState({ bio: '', phone_number: '', address: '', city: '', state: '', zip_code: '', country: '' });
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get<ProfileData>('/api/profile'),
      api.get<{ display_name: string; email: string }>('/api/users/me'),
    ])
      .then(([profileData, userData]) => {
        setProfile(profileData);
        setDisplayName(userData.display_name ?? '');
        setForm({
          bio: profileData.bio ?? '',
          phone_number: profileData.phone_number ?? '',
          address: profileData.address ?? '',
          city: profileData.city ?? '',
          state: profileData.state ?? '',
          zip_code: profileData.zip_code ?? '',
          country: profileData.country ?? '',
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    setSaving(true);
    try {
      await Promise.all([
        api.put('/api/profile', form),
        displayName !== user?.displayName
          ? api.patch('/api/users/me', { display_name: displayName })
          : Promise.resolve(),
      ]);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${API_BASE}/api/profile/photo`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      const data = await res.json() as { profile_photo_url: string };
      setProfile((prev) => prev ? { ...prev, profile_photo_url: data.profile_photo_url } : prev);
      setSuccess('Photo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto(): Promise<void> {
    if (!window.confirm('Remove profile photo?')) return;
    try {
      await api.delete('/api/profile/photo');
      setProfile((prev) => prev ? { ...prev, profile_photo_url: null } : prev);
      setSuccess('Photo removed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove photo.');
    }
  }

  function field(key: keyof typeof form): (e: ChangeEvent<HTMLInputElement>) => void {
    return (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 4, maxWidth: 640 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>My Profile</Typography>

      {/* Avatar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar
          src={profile?.profile_photo_url ?? undefined}
          sx={{ width: 80, height: 80, fontSize: 32 }}
        >
          {user?.displayName?.[0]?.toUpperCase()}
        </Avatar>
        <Box>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />
          <Stack direction="row" spacing={1}>
            <Tooltip title="Upload photo">
              <span>
                <IconButton onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <CircularProgress size={20} /> : <CameraAltRounded />}
                </IconButton>
              </span>
            </Tooltip>
            {profile?.profile_photo_url && (
              <Tooltip title="Remove photo">
                <IconButton color="error" onClick={handleDeletePhoto}>
                  <DeleteRounded />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">JPEG, PNG, WebP · max 2 MB</Typography>
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box component="form" onSubmit={handleSave} noValidate>
        <Stack spacing={2}>
          <TextField label="Display Name" value={displayName} onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)} required fullWidth />
          <TextField label="Email" value={user?.email ?? ''} disabled fullWidth helperText="Email changes are managed separately via account settings." />
          <TextField label="Bio" value={form.bio} onChange={field('bio')} multiline rows={3} fullWidth />
          <TextField label="Phone Number" value={form.phone_number} onChange={field('phone_number')} fullWidth />
          <TextField label="Address" value={form.address} onChange={field('address')} fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField label="City" value={form.city} onChange={field('city')} fullWidth />
            <TextField label="State / Province" value={form.state} onChange={field('state')} fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Zip / Postal Code" value={form.zip_code} onChange={field('zip_code')} fullWidth />
            <TextField label="Country" value={form.country} onChange={field('country')} fullWidth />
          </Stack>
          <Button
            type="submit"
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
