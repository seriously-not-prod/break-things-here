import React, { useState, useEffect } from 'react';
import { UserProfile, UpdateProfileRequest } from '../../types/user';

interface ProfileEditProps {
  profile: UserProfile;
  onSave: (data: UpdateProfileRequest) => Promise<void>;
  onCancel: () => void;
  onPhotoChange: (file: File) => Promise<void>;
  isSaving?: boolean;
  saveError?: string;
}

export function ProfileEdit({
  profile,
  onSave,
  onCancel,
  onPhotoChange,
  isSaving = false,
  saveError,
}: ProfileEditProps): React.ReactElement {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email);
  const [campingPreferred, setCampingPreferred] = useState(profile.festivalPreferences.campingPreferred);
  const [emailNotifications, setEmailNotifications] = useState(profile.notificationPreferences.emailNotifications);
  const [pushNotifications, setPushNotifications] = useState(profile.notificationPreferences.pushNotifications);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const isProfileDirty =
    displayName !== profile.displayName ||
    email !== profile.email ||
    campingPreferred !== profile.festivalPreferences.campingPreferred ||
    emailNotifications !== profile.notificationPreferences.emailNotifications ||
    pushNotifications !== profile.notificationPreferences.pushNotifications;

  useEffect(() => {
    setIsDirty(isProfileDirty);
  }, [isProfileDirty]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!displayName.trim()) {
      newErrors.displayName = 'Display name is required.';
    }
    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleCancel(): void {
    if (isDirty && !window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
      return;
    }
    onCancel();
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;

    await onSave({
      displayName: displayName.trim(),
      email: email.trim(),
      festivalPreferences: { campingPreferred },
      notificationPreferences: { emailNotifications, pushNotifications },
    });
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setPhotoError('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Photo must be smaller than 2 MB.');
      return;
    }
    await onPhotoChange(file);
  }

  return (
    <main aria-labelledby="edit-profile-heading">
      <h1 id="edit-profile-heading">Edit Profile</h1>

      <form onSubmit={handleSubmit} noValidate aria-label="Edit profile form">
        <div>
          <label htmlFor="display-name">Display Name <span aria-hidden="true">*</span></label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-required="true"
            aria-describedby={errors.displayName ? 'display-name-error' : undefined}
            aria-invalid={!!errors.displayName}
          />
          {errors.displayName && (
            <span id="display-name-error" role="alert">{errors.displayName}</span>
          )}
        </div>

        <div>
          <label htmlFor="email">Email <span aria-hidden="true">*</span></label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            aria-describedby={errors.email ? 'email-error' : 'email-hint'}
            aria-invalid={!!errors.email}
          />
          <span id="email-hint">Changing your email will require re-confirmation.</span>
          {errors.email && (
            <span id="email-error" role="alert">{errors.email}</span>
          )}
        </div>

        <div>
          <label htmlFor="profile-photo">Profile Photo</label>
          <input
            id="profile-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            aria-describedby="photo-hint photo-error"
          />
          <span id="photo-hint">JPEG, PNG, or WebP. Max 2 MB.</span>
          {photoError && <span id="photo-error" role="alert">{photoError}</span>}
        </div>

        <fieldset>
          <legend>Festival Preferences</legend>
          <label>
            <input
              type="checkbox"
              checked={campingPreferred}
              onChange={(e) => setCampingPreferred(e.target.checked)}
            />
            Camping preferred
          </label>
        </fieldset>

        <fieldset>
          <legend>Notification Preferences</legend>
          <label>
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
            />
            Email notifications
          </label>
          <label>
            <input
              type="checkbox"
              checked={pushNotifications}
              onChange={(e) => setPushNotifications(e.target.checked)}
            />
            Push notifications
          </label>
        </fieldset>

        {saveError && <div role="alert" aria-live="assertive">{saveError}</div>}

        <div>
          <button type="submit" disabled={isSaving} aria-disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={handleCancel} aria-label="Cancel and return to profile">
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
