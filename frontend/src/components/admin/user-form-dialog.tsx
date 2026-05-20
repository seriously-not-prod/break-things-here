import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select as MuiSelect,
  TextField,
  Typography,
} from '@mui/material';
import {
  CloseRounded,
  EventRounded,
  PersonRounded,
  AdminPanelSettingsRounded,
  SecurityRounded,
  VisibilityRounded,
  VisibilityOffRounded,
} from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';

export interface AdminUserSummary {
  id: number;
  email: string;
  display_name: string;
  email_verified: number;
  account_locked: number;
  role_id: number;
}

export interface Role {
  id: number;
  name: string;
}

interface EventOption {
  id: number;
  title: string;
  status: string;
}

interface UserFormDialogProps {
  open: boolean;
  /** When provided, the dialog edits this user; otherwise it creates a new one. */
  user?: AdminUserSummary | null;
  roles: Role[];
  onClose: () => void;
  /** Called after a successful create or update so the caller can reload. */
  onSaved: (message: string) => void;
}

interface FormState {
  email: string;
  display_name: string;
  password: string;
  confirmPassword: string;
  role_id: number | '';
  email_verified: boolean;
  account_locked: boolean;
  assignedEventIds: number[];
}

function emptyForm(roles: Role[]): FormState {
  const defaultRole = roles.find((r) => r.name === 'Guest') ?? roles[0];
  return {
    email: '',
    display_name: '',
    password: '',
    confirmPassword: '',
    role_id: defaultRole?.id ?? '',
    email_verified: false,
    account_locked: false,
    assignedEventIds: [],
  };
}

export function UserFormDialog({
  open,
  user,
  roles,
  onClose,
  onSaved,
}: UserFormDialogProps): JSX.Element {
  const isEdit = Boolean(user);
  const [form, setForm] = useState<FormState>(() => emptyForm(roles));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [allEvents, setAllEvents] = useState<EventOption[]>([]);

  // Load all events and current assignments when the dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowPassword(false);

    api
      .get<EventOption[] | { events: EventOption[] }>('/api/events')
      .then((data) => {
        const list = Array.isArray(data) ? data : ((data as { events: EventOption[] }).events ?? []);
        setAllEvents(list);
      })
      .catch(() => setAllEvents([]));

    if (user) {
      setForm({
        email: user.email,
        display_name: user.display_name,
        password: '',
        confirmPassword: '',
        role_id: user.role_id,
        email_verified: Boolean(user.email_verified),
        account_locked: Boolean(user.account_locked),
        assignedEventIds: [],
      });
      // Fetch existing event assignments for this user
      api
        .get<{ events: { id: number }[] }>(`/api/admin/users/${user.id}/events`)
        .then((data) => {
          setForm((prev) => ({
            ...prev,
            assignedEventIds: (data.events ?? []).map((e) => e.id),
          }));
        })
        .catch(() => {/* silently fall back to empty */});
    } else {
      setForm(emptyForm(roles));
    }
  }, [open, user, roles]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.email.trim()) return 'Email is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'Invalid email format.';
    if (!form.display_name.trim()) return 'Display name is required.';
    if (!form.role_id) return 'Role is required.';
    if (!isEdit) {
      if (form.password.length < 8) return 'Password must be at least 8 characters.';
      if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    } else if (form.password) {
      if (form.password.length < 8) return 'Password must be at least 8 characters.';
      if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    }
    return null;
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let savedUserId = user?.id;
      if (isEdit && user) {
        const body: Record<string, unknown> = {
          email: form.email.trim(),
          display_name: form.display_name.trim(),
          role_id: Number(form.role_id),
          email_verified: form.email_verified,
          account_locked: form.account_locked,
        };
        if (form.password) body.password = form.password;
        await api.put(`/api/admin/users/${user.id}`, body);
      } else {
        const result = await api.post<{ userId: number }>('/api/admin/users', {
          email: form.email.trim(),
          display_name: form.display_name.trim(),
          password: form.password,
          role_id: Number(form.role_id),
          email_verified: form.email_verified,
        });
        savedUserId = result.userId;
      }

      // Save event assignments for the user
      if (savedUserId !== undefined) {
        await api.put(`/api/admin/users/${savedUserId}/events`, {
          event_ids: form.assignedEventIds,
        });
      }

      onSaved(isEdit ? 'User updated successfully.' : 'User created successfully.');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save user.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          {isEdit ? 'Edit User' : 'Create User'}
        </Typography>
        <IconButton size="small" onClick={onClose} disabled={submitting} aria-label="Close">
          <CloseRounded />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Section 1 — Profile */}
        <SectionHeader icon={<PersonRounded fontSize="small" />} title="Profile" />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              label="Display name"
              value={form.display_name}
              onChange={(e) => update('display_name', e.target.value)}
              disabled={submitting}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              type="email"
              label="Email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              disabled={submitting}
            />
          </Grid>
        </Grid>

        {/* Section 2 — Role & permissions */}
        <SectionHeader
          icon={<AdminPanelSettingsRounded fontSize="small" />}
          title="Role & Access"
        />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              select
              required
              label="Role"
              value={form.role_id}
              onChange={(e) => update('role_id', Number(e.target.value))}
              disabled={submitting}
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.email_verified}
                    onChange={(e) => update('email_verified', e.target.checked)}
                    disabled={submitting}
                  />
                }
                label="Email verified"
              />
              {isEdit && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.account_locked}
                      onChange={(e) => update('account_locked', e.target.checked)}
                      disabled={submitting}
                    />
                  }
                  label="Account locked"
                />
              )}
            </Box>
          </Grid>
        </Grid>

        {/* Section 3 — Security */}
        <SectionHeader icon={<SecurityRounded fontSize="small" />} title="Security" />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {isEdit
            ? 'Leave blank to keep the current password. Minimum 8 characters when changed.'
            : 'Set an initial password for the new user. Minimum 8 characters.'}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required={!isEdit}
              type={showPassword ? 'text' : 'password'}
              label={isEdit ? 'New password (optional)' : 'Password'}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <VisibilityOffRounded fontSize="small" />
                      ) : (
                        <VisibilityRounded fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required={!isEdit || Boolean(form.password)}
              type={showPassword ? 'text' : 'password'}
              label="Confirm password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
            />
          </Grid>
        </Grid>

        {/* Section 4 — Event Access */}
        <SectionHeader icon={<EventRounded fontSize="small" />} title="Event Access" />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Select events this user can access. Admins can see all events regardless of assignment.
        </Typography>
        <MuiSelect
          fullWidth
          multiple
          displayEmpty
          value={form.assignedEventIds}
          onChange={(e) => update('assignedEventIds', e.target.value as number[])}
          input={<OutlinedInput />}
          disabled={submitting}
          renderValue={(selected) => {
            const ids = selected as number[];
            if (ids.length === 0) return <em style={{ color: '#9e9e9e' }}>No events assigned</em>;
            return ids
              .map((id) => allEvents.find((ev) => ev.id === id)?.title ?? `Event #${id}`)
              .join(', ');
          }}
          inputProps={{ 'aria-label': 'Assign events' }}
        >
          {allEvents.length === 0 && (
            <MenuItem disabled>
              <em>No events available</em>
            </MenuItem>
          )}
          {allEvents.map((ev) => (
            <MenuItem key={ev.id} value={ev.id}>
              <Checkbox checked={form.assignedEventIds.includes(ev.id)} />
              <ListItemText
                primary={ev.title}
                secondary={ev.status}
              />
            </MenuItem>
          ))}
        </MuiSelect>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isEdit ? 'Save changes' : 'Create user'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SectionHeader({ icon, title }: { icon: JSX.Element; title: string }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, mt: 0.5 }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: 0.3 }}>
        {title}
      </Typography>
      <Divider sx={{ flex: 1, ml: 1 }} />
    </Box>
  );
}
