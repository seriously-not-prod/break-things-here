import React, { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  Alert, CircularProgress, Link as MuiLink, InputAdornment, IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Festival as LogoIcon } from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) { setError('All fields are required'); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await authApi.register(form.email.trim(), form.password, form.name.trim());
      setSuccess('Account created! You can now sign in.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f6fa', p: 2 }}>
      <Card elevation={0} sx={{ width: '100%', maxWidth: 420, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LogoIcon sx={{ color: 'primary.main', fontSize: 32 }} />
              <Typography variant="h5" fontWeight={800} color="primary.main">FestPlanner</Typography>
            </Box>
            <Typography color="text.secondary" variant="body2">Create your account</Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField label="Full name" fullWidth value={form.name} onChange={set('name')} sx={{ mb: 2 }} autoFocus />
            <TextField label="Email address" type="email" fullWidth value={form.email} onChange={set('email')} sx={{ mb: 2 }} />
            <TextField
              label="Password" type={showPwd ? 'text' : 'password'} fullWidth value={form.password} onChange={set('password')} sx={{ mb: 2 }}
              InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd(!showPwd)} size="small">{showPwd ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }}
            />
            <TextField label="Confirm password" type="password" fullWidth value={form.confirm} onChange={set('confirm')} sx={{ mb: 3 }} />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ borderRadius: 2, py: 1.2 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Create Account'}
            </Button>
          </Box>

          <Typography variant="body2" textAlign="center" sx={{ mt: 2 }} color="text.secondary">
            Already have an account? <MuiLink component={Link} to="/login">Sign in</MuiLink>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
