import { useCallback, useRef, useState } from 'react';
import { UserRole, USER_ROLES } from '../../types/user-role';

interface RoleChangeDialogProps {
  userName: string;
  currentRole: UserRole;
  onConfirm: (newRole: UserRole) => void;
  onCancel: () => void;
}

export function RoleChangeDialog({
  userName,
  currentRole,
  onConfirm,
  onCancel,
}: RoleChangeDialogProps): React.JSX.Element {
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = useCallback(() => {
    onConfirm(selectedRole);
  }, [onConfirm, selectedRole]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm role change"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 8, padding: '24px 32px',
        maxWidth: 420, width: '90%', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 12px' }}>Confirm Role Change</h3>
        <p>
          Change <strong>{userName}</strong>&apos;s role
          from <strong>{currentRole}</strong> to:
        </p>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as UserRole)}
          aria-label={`New role for ${userName}`}
          style={{
            width: '100%', padding: '8px 12px', fontSize: '0.95rem',
            border: '1px solid #ccc', borderRadius: 4, marginBottom: 16,
          }}
        >
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            aria-label="Cancel role change"
            style={{
              padding: '8px 16px', border: '1px solid #ccc',
              borderRadius: 4, background: '#fff', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedRole === currentRole}
            aria-label={`Confirm changing role to ${selectedRole}`}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 4,
              background: selectedRole === currentRole ? '#ccc' : '#1976d2',
              color: '#fff', cursor: selectedRole === currentRole ? 'default' : 'pointer',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
