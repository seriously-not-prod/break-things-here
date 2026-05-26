import { ChangeEvent, useState } from 'react';
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api, ApiError } from '../../lib/api-client';

interface EventMember {
  user_id: number;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
}

interface UserOption {
  user_id: number;
  display_name: string;
  email: string;
  role_name: string | null;
}

interface EventTeamTabProps {
  eventId: string;
  members: EventMember[];
  availableUsers: UserOption[];
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
}

export function EventTeamTab({
  eventId,
  members,
  availableUsers,
  canEdit,
  onRefresh,
  onError,
}: EventTeamTabProps): JSX.Element {
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('Member');
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  async function addMember(): Promise<void> {
    if (!memberUserId) {
      setMemberError('Please choose a user to add.');
      return;
    }
    setMemberSaving(true);
    setMemberError(null);
    try {
      await api.post(`/api/events/${eventId}/members`, {
        user_id: Number(memberUserId),
        role: memberRole,
      });
      setMemberUserId('');
      setMemberRole('Member');
      await onRefresh();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : 'Failed to add member.');
    } finally {
      setMemberSaving(false);
    }
  }

  async function removeMember(userId: number): Promise<void> {
    if (!window.confirm('Remove this team member?')) return;
    await api
      .delete(`/api/events/${eventId}/members/${userId}`)
      .catch((err) => onError(err.message));
    await onRefresh();
  }

  return (
    <>
      {canEdit && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
            <TextField
              label="Invite User"
              select
              value={memberUserId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMemberUserId(e.target.value)}
              fullWidth
            >
              {availableUsers
                .filter((option) => !members.some((member) => member.user_id === option.user_id))
                .map((option) => (
                  <MenuItem key={option.user_id} value={option.user_id}>
                    {option.display_name} ({option.email})
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label="Role"
              value={memberRole}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMemberRole(e.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={addMember} disabled={memberSaving}>
              {memberSaving ? 'Adding…' : 'Invite'}
            </Button>
          </Stack>
          {memberError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {memberError}
            </Alert>
          )}
        </Paper>
      )}
      {members.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No team members yet.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Name</strong>
                </TableCell>
                <TableCell>
                  <strong>Email</strong>
                </TableCell>
                <TableCell>
                  <strong>Role</strong>
                </TableCell>
                <TableCell>
                  <strong>Joined</strong>
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <strong>Actions</strong>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.user_id} hover>
                  <TableCell>{member.display_name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell>{new Date(member.joined_at).toLocaleString()}</TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        onClick={() => removeMember(member.user_id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
