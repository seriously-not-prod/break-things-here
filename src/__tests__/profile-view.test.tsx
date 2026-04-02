/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileView } from '../components/ProfileView/ProfileView';
import { UserProfile } from '../types/user';

const mockProfile: UserProfile = {
  id: 'user-1',
  displayName: 'Savita Sawant',
  email: 'savita@example.com',
  photoUrl: undefined,
  role: 'Attendee',
  emailConfirmed: true,
  festivalPreferences: { genres: ['Rock', 'Jazz'], campingPreferred: true },
  notificationPreferences: { emailNotifications: true, pushNotifications: false },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

describe('ProfileView', () => {
  it('renders the profile heading', () => {
    render(<ProfileView profile={mockProfile} onEditClick={jest.fn()} />);
    expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
  });

  it('displays masked email', () => {
    render(<ProfileView profile={mockProfile} onEditClick={jest.fn()} />);
    expect(screen.getByText(/sa\*\*\*@example\.com/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<ProfileView profile={mockProfile} onEditClick={jest.fn()} isLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ProfileView profile={mockProfile} onEditClick={jest.fn()} error="Network error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('calls onEditClick when Edit Profile button is clicked', () => {
    const onEditClick = jest.fn();
    render(<ProfileView profile={mockProfile} onEditClick={onEditClick} />);
    fireEvent.click(screen.getByRole('button', { name: /edit your profile/i }));
    expect(onEditClick).toHaveBeenCalledTimes(1);
  });

  it('shows pending email change notice when pendingEmail is set', () => {
    const profileWithPending = { ...mockProfile, pendingEmail: 'new@example.com' };
    render(<ProfileView profile={profileWithPending} onEditClick={jest.fn()} />);
    expect(screen.getByText(/change pending confirmation/i)).toBeInTheDocument();
  });

  it('displays festival preferences', () => {
    render(<ProfileView profile={mockProfile} onEditClick={jest.fn()} />);
    expect(screen.getByText(/rock, jazz/i)).toBeInTheDocument();
    expect(screen.getByText(/^yes$/i)).toBeInTheDocument();
  });
});
