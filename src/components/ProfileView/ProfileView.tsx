import React from 'react';
import { UserProfile } from '../../types/user';

interface ProfileViewProps {
  profile: UserProfile;
  onEditClick: () => void;
  isLoading?: boolean;
  error?: string;
}

export function ProfileView({
  profile,
  onEditClick,
  isLoading = false,
  error,
}: ProfileViewProps): React.ReactElement {
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-label="Loading profile">
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" aria-live="assertive">
        <p>Error loading profile: {error}</p>
      </div>
    );
  }

  const atIndex = profile.email.indexOf('@');
  const local = profile.email.slice(0, atIndex);
  const domain = profile.email.slice(atIndex);
  const visibleChars = Math.min(2, local.length);
  const maskedEmail =
    local.slice(0, visibleChars) + (local.length > visibleChars ? '***' : '') + domain;

  return (
    <main aria-labelledby="profile-heading">
      <h1 id="profile-heading">My Profile</h1>

      <section aria-label="Profile photo">
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={`${profile.displayName}'s profile photo`}
            width={120}
            height={120}
          />
        ) : (
          <div aria-label="No profile photo" role="img">
            <span aria-hidden="true">👤</span>
          </div>
        )}
      </section>

      <section aria-label="Account information">
        <dl>
          <div>
            <dt>Display Name</dt>
            <dd>{profile.displayName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {maskedEmail}
              {profile.pendingEmail && (
                <span aria-label="Email change pending confirmation">
                  {' '}
                  (change pending confirmation)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{profile.role}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Festival preferences">
        <h2>Festival Preferences</h2>
        <dl>
          <div>
            <dt>Preferred Genres</dt>
            <dd>
              {profile.festivalPreferences.genres.length > 0
                ? profile.festivalPreferences.genres.join(', ')
                : 'None set'}
            </dd>
          </div>
          <div>
            <dt>Camping Preferred</dt>
            <dd>{profile.festivalPreferences.campingPreferred ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Notification preferences">
        <h2>Notifications</h2>
        <dl>
          <div>
            <dt>Email Notifications</dt>
            <dd>{profile.notificationPreferences.emailNotifications ? 'Enabled' : 'Disabled'}</dd>
          </div>
          <div>
            <dt>Push Notifications</dt>
            <dd>{profile.notificationPreferences.pushNotifications ? 'Enabled' : 'Disabled'}</dd>
          </div>
        </dl>
      </section>

      <button type="button" onClick={onEditClick} aria-label="Edit your profile">
        Edit Profile
      </button>
    </main>
  );
}
