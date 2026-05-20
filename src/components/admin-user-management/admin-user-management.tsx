import { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '../../types/user';
import { UserRole, USER_ROLES } from '../../types/user-role';
import { useUserRole } from '../../hooks/use-user-role';
import { fetchAllUsers, restoreUser, updateUserRole } from '../../api/admin/admin-users';
import { UserTableRow } from './user-table-row';
import { RoleChangeDialog } from './role-change-dialog';
import './admin-user-management.css';

const PAGE_SIZE = 10;

type LoadState = 'loading' | 'error' | 'loaded';
type FeedbackState = { type: 'success' | 'error'; message: string } | null;

interface RoleChangeTarget {
  userId: string;
  userName: string;
  currentRole: UserRole;
}

export function AdminUserManagement(): React.JSX.Element {
  const currentRole = useUserRole();
  const [users, setUsers] = useState<User[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [changeTarget, setChangeTarget] = useState<RoleChangeTarget | null>(null);
  const isAdmin = currentRole === null || currentRole === UserRole.Admin;

  const loadUsers = useCallback(async () => {
    setLoadState('loading');
    try {
      const data = await fetchAllUsers();
      setUsers(data);
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [loadUsers, isAdmin]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (q && !u.displayName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageUsers = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRoleChange = useCallback((userId: string, userName: string, role: UserRole) => {
    setChangeTarget({ userId, userName, currentRole: role });
  }, []);

  const confirmRoleChange = useCallback(
    async (newRole: UserRole) => {
      if (!changeTarget) return;
      setChangeTarget(null);
      try {
        await updateUserRole(changeTarget.userId, newRole);
        await loadUsers();
        setFeedback({
          type: 'success',
          message: `${changeTarget.userName}'s role updated to ${newRole}.`,
        });
      } catch (err) {
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to update role.',
        });
      }
    },
    [changeTarget, loadUsers],
  );

  const handleRestore = useCallback(
    async (userId: string, userName: string) => {
      try {
        await restoreUser(userId);
        await loadUsers();
        setFeedback({ type: 'success', message: `${userName}'s account was restored.` });
      } catch (err) {
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to restore user.',
        });
      }
    },
    [loadUsers],
  );

  const cancelRoleChange = useCallback(() => {
    setChangeTarget(null);
  }, []);

  // Auto-clear feedback after 4 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, roleFilter]);

  // Redirect non-admins (after all hooks)
  if (!isAdmin) {
    window.location.href = '/';
    return <p role="alert">Redirecting&hellip;</p>;
  }

  if (loadState === 'loading') {
    return (
      <p role="status" aria-live="polite" className="admin-user-management">
        Loading users&hellip;
      </p>
    );
  }

  if (loadState === 'error') {
    return (
      <div role="alert" aria-live="assertive" className="admin-user-management">
        <p>Failed to load users.</p>
        <button onClick={loadUsers} aria-label="Retry loading users">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="admin-user-management">
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
          className={`admin-user-management__feedback admin-user-management__feedback--${feedback.type}`}
        >
          {feedback.message}
        </div>
      )}

      <div className="admin-user-management__header">
        <h1 className="admin-user-management__title">User Management</h1>
        <input
          type="search"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users by name or email"
          className="admin-user-management__search"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
          aria-label="Filter users by role"
          className="admin-user-management__filter"
        >
          <option value="">All Roles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-user-management__table-wrapper">
        <table className="admin-user-management__table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>
                  No users found.
                </td>
              </tr>
            ) : (
              pageUsers.map((u) => (
                <UserTableRow
                  key={u.id}
                  user={u}
                  onRoleChange={handleRoleChange}
                  onRestore={handleRestore}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="admin-user-management__pagination" aria-label="User list pagination">
          <button
            className="admin-user-management__page-btn"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span aria-current="page">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="admin-user-management__page-btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      )}

      {changeTarget && (
        <RoleChangeDialog
          userName={changeTarget.userName}
          currentRole={changeTarget.currentRole}
          onConfirm={confirmRoleChange}
          onCancel={cancelRoleChange}
        />
      )}
    </div>
  );
}
