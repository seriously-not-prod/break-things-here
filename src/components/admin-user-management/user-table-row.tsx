import { User } from '../../types/user';
import { UserRole } from '../../types/user-role';

interface UserTableRowProps {
  user: User;
  onRoleChange: (userId: string, userName: string, currentRole: UserRole) => void;
  onRestore: (userId: string, userName: string) => void;
}

export function UserTableRow({ user, onRoleChange, onRestore }: UserTableRowProps): React.JSX.Element {
  const isDeleted = Boolean(user.deletedAt);
  const statusClass = isDeleted
    ? 'admin-user-management__status--deleted'
    : user.emailConfirmed
    ? 'admin-user-management__status--confirmed'
    : 'admin-user-management__status--pending';

  return (
    <tr>
      <td>{user.displayName}</td>
      <td>{user.email}</td>
      <td>{user.role}</td>
      <td>
        <span className={statusClass}>
          {isDeleted ? 'Deleted' : user.emailConfirmed ? 'Confirmed' : 'Pending'}
        </span>
      </td>
      <td>
        {isDeleted ? (
          <button
            onClick={() => onRestore(user.id, user.displayName)}
            aria-label={`Restore ${user.displayName}`}
            style={{
              padding: '4px 12px', fontSize: '0.85rem', cursor: 'pointer',
              border: '1px solid #2e7d32', borderRadius: 4,
              background: '#fff', color: '#2e7d32',
            }}
          >
            Restore
          </button>
        ) : (
          <button
            onClick={() => onRoleChange(user.id, user.displayName, user.role)}
            aria-label={`Change role for ${user.displayName}`}
            style={{
              padding: '4px 12px', fontSize: '0.85rem', cursor: 'pointer',
              border: '1px solid #1976d2', borderRadius: 4,
              background: '#fff', color: '#1976d2',
            }}
          >
            Change Role
          </button>
        )}
      </td>
    </tr>
  );
}
