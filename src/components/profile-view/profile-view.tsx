import React, { useEffect, useState } from 'react';

interface UserProfile {
  id: number;
  display_name: string | null;
  email_masked: string;
  email_verified: boolean;
  role: string;
  bio: string | null;
  phone_number: string | null;
  profile_photo_url: string | null;
  city: string | null;
  country: string | null;
}

interface ProfileViewProps {
  onEditClick: () => void;
}

type LoadState = 'loading' | 'error' | 'loaded';

export function ProfileView({ onEditClick }: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const response = await fetch('/api/users/me', { credentials: 'include' });

        if (!response.ok) {
          throw new Error(response.status === 401 ? 'Please log in to view your profile.' : 'Failed to load profile.');
        }

        const data: UserProfile = await response.json();
        if (!cancelled) {
          setProfile(data);
          setState('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
          setState('error');
        }
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, []);

  if (state === 'loading') {
    return (
      <div className="profile-view profile-view--loading" role="status" aria-live="polite">
        <span aria-label="Loading profile">Loading your profile…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="profile-view profile-view--error" role="alert" aria-live="assertive">
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <section className="profile-view" aria-label="Your profile">
      <div className="profile-view__header">
        <div className="profile-view__photo-container">
          {profile.profile_photo_url ? (
            <img
              src={profile.profile_photo_url}
              alt={`${profile.display_name ?? 'User'}'s profile photo`}
              className="profile-view__photo"
              width={96}
              height={96}
            />
          ) : (
            <div
              className="profile-view__photo-placeholder"
              role="img"
              aria-label="No profile photo"
            >
              <span aria-hidden="true">👤</span>
            </div>
          )}
        </div>

        <div className="profile-view__identity">
          <h1 className="profile-view__name">{profile.display_name ?? 'No display name set'}</h1>
          <p className="profile-view__email">
            <span className="profile-view__label">Email: </span>
            <span aria-label={`Masked email: ${profile.email_masked}`}>{profile.email_masked}</span>
            {!profile.email_verified && (
              <span className="profile-view__badge profile-view__badge--warning" role="note">
                {' '}(unverified)
              </span>
            )}
          </p>
          {profile.role && (
            <p className="profile-view__role">
              <span className="profile-view__label">Role: </span>{profile.role}
            </p>
          )}
        </div>
      </div>

      <dl className="profile-view__details">
        {profile.bio && (
          <>
            <dt className="profile-view__dt">Bio</dt>
            <dd className="profile-view__dd">{profile.bio}</dd>
          </>
        )}
        {profile.city || profile.country ? (
          <>
            <dt className="profile-view__dt">Location</dt>
            <dd className="profile-view__dd">
              {[profile.city, profile.country].filter(Boolean).join(', ')}
            </dd>
          </>
        ) : null}
        {profile.phone_number && (
          <>
            <dt className="profile-view__dt">Phone</dt>
            <dd className="profile-view__dd">{profile.phone_number}</dd>
          </>
        )}
      </dl>

      <div className="profile-view__actions">
        <button
          type="button"
          className="profile-view__edit-btn"
          onClick={onEditClick}
          aria-label="Edit your profile"
        >
          Edit Profile
        </button>
      </div>
    </section>
  );
}
