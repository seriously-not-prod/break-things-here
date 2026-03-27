import React, { useEffect, useRef, useState } from 'react';

interface ProfileFormData {
  displayName: string;
}

interface ProfileEditProps {
  onSave: () => void;
  onCancel: () => void;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function ProfileEdit({ onSave, onCancel }: ProfileEditProps) {
  const [formData, setFormData] = useState<ProfileFormData>({ displayName: '' });
  const [initialData, setInitialData] = useState<ProfileFormData>({ displayName: '' });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const isDirty = formData.displayName !== initialData.displayName;
  const displayNameRef = useRef<HTMLInputElement>(null);

  // Load current profile data on mount
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const res = await fetch('/api/users/me', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        const loaded: ProfileFormData = { displayName: data.display_name ?? '' };
        if (!cancelled) {
          setFormData(loaded);
          setInitialData(loaded);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Could not load profile');
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, []);

  // Focus first field after load
  useEffect(() => {
    if (!loading) displayNameRef.current?.focus();
  }, [loading]);

  // Warn user before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (saveState === 'error') setSaveState('idle');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (formData.displayName.trim().length < 2) {
      setErrorMessage('Display name must be at least 2 characters');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setErrorMessage('');

    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: formData.displayName.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(body.error ?? 'Save failed');
      }

      setSaveState('success');
      setInitialData(formData);
      onSave();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes');
      setSaveState('error');
    }
  }

  function handleCancel() {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard them and leave?');
      if (!confirmed) return;
    }
    onCancel();
  }

  if (loading) {
    return (
      <div className="profile-edit profile-edit--loading" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  return (
    <section className="profile-edit" aria-label="Edit your profile">
      <h2 className="profile-edit__title">Edit Profile</h2>

      {saveState === 'error' && (
        <p className="profile-edit__error" role="alert" aria-live="assertive">
          {errorMessage}
        </p>
      )}

      {saveState === 'success' && (
        <p className="profile-edit__success" role="status" aria-live="polite">
          Profile saved successfully.
        </p>
      )}

      <form className="profile-edit__form" onSubmit={handleSubmit} noValidate>
        <div className="profile-edit__field">
          <label className="profile-edit__label" htmlFor="displayName">
            Display Name
          </label>
          <input
            ref={displayNameRef}
            id="displayName"
            name="displayName"
            type="text"
            className="profile-edit__input"
            value={formData.displayName}
            onChange={handleChange}
            minLength={2}
            maxLength={100}
            aria-required="true"
            aria-describedby={saveState === 'error' ? 'profile-edit-error' : undefined}
            disabled={saveState === 'saving'}
          />
        </div>

        <div className="profile-edit__actions">
          <button
            type="submit"
            className="profile-edit__save-btn"
            disabled={saveState === 'saving' || !isDirty}
            aria-label="Save profile changes"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>

          <button
            type="button"
            className="profile-edit__cancel-btn"
            onClick={handleCancel}
            disabled={saveState === 'saving'}
            aria-label="Cancel editing and return to profile"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
