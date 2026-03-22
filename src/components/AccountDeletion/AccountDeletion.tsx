import React, { useState } from 'react';

const CONFIRM_TEXT = 'DELETE';

interface AccountDeletionProps {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isDeleting?: boolean;
  error?: string;
}

export function AccountDeletion({
  onConfirm,
  onCancel,
  isDeleting = false,
  error,
}: AccountDeletionProps): React.ReactElement {
  const [confirmInput, setConfirmInput] = useState('');
  const isConfirmed = confirmInput === CONFIRM_TEXT;

  async function handleDelete(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!isConfirmed) return;
    await onConfirm();
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="delete-dialog-heading">
      <h2 id="delete-dialog-heading">Delete Account</h2>

      <p>
        This action is <strong>permanent and cannot be undone</strong>. All your personal
        data, preferences, and event registrations will be removed.
      </p>

      <form onSubmit={handleDelete} aria-label="Confirm account deletion">
        <label htmlFor="confirm-delete-input">
          Type <strong>{CONFIRM_TEXT}</strong> to confirm
        </label>
        <input
          id="confirm-delete-input"
          type="text"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          aria-required="true"
          aria-describedby="delete-hint"
          autoComplete="off"
        />
        <span id="delete-hint">
          You must type exactly "{CONFIRM_TEXT}" to enable the delete button.
        </span>

        {error && (
          <div role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={!isConfirmed || isDeleting}
            aria-disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Permanently Delete My Account'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel account deletion"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
