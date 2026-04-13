import { User } from '../../types/user';
import { UserRole } from '../../types/user-role';

interface UserTableRowProps {
  user: User;
  onRoleChange: (userId: string, userName: string, currentRole: UserRole) => void;
}

export function UserTableRow({ user, onRoleChange }: UserTableRowProps): React.JSX.Element {
  const statusClass = user.emailConfirmed
    ? 'admin-user-management__status--confirmed'
    : 'admin-user-management__status--pending';

  return (
    <tr>
      <td>{user.displayName}</td>
      <td>{user.email}</td>
      <td>{user.role}</td>
      <td>
        <span className={statusClass}>
          {user.emailConfirmed ? 'Confirmed' : 'Pending'}
        </span>
      </td>
      <td>
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
      </td>
    </tr>
  );
}
