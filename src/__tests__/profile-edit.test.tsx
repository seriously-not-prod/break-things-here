/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileEdit } from '../components/ProfileEdit/ProfileEdit';
import { UserProfile } from '../types/user';

const mockProfile: UserProfile = {
  id: 'user-1',
  displayName: 'Savita Sawant',
  email: 'savita@example.com',
  role: 'Attendee',
  emailConfirmed: true,
  festivalPreferences: { genres: [], campingPreferred: false },
  notificationPreferences: { emailNotifications: true, pushNotifications: false },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

describe('ProfileEdit', () => {
  it('renders all required fields', () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/profile photo/i)).toBeInTheDocument();
  });

  it('shows validation error when display name is empty', async () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid email', async () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );
    await userEvent.clear(screen.getByRole('textbox', { name: /email/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'not-an-email');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    });
  });

  it('calls onSave with updated values on valid submit', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={onSave}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'New Name');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'New Name' }),
      );
    });
  });

  it('shows save error when provided', () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
        saveError="Server error occurred"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/server error occurred/i);
  });

  it('shows photo error for invalid file type', async () => {
    // Mock validateProfilePhoto to return invalid — the actual MIME validation
    // is tested exhaustively in file-validation.test.ts. This avoids jsdom's
    // inability to set files on an input for types not matching `accept`.
    jest.spyOn(
      require('../utils/file-validation'),
      'validateProfilePhoto',
    ).mockReturnValue({ valid: false, error: 'Invalid file type "image/gif". Only JPEG, PNG, and WebP are allowed.' });

    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );
    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/profile photo/i);
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(screen.getByText(/only jpeg, png, and webp/i)).toBeInTheDocument();
    });
    jest.restoreAllMocks();
  });
});

describe('ProfileEdit — dirty-state navigation guard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers beforeunload handler when a field is changed', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Changed');
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('handleCancel calls onCancel immediately when form is clean', () => {
    const onCancel = jest.fn();
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={onCancel}
        onPhotoChange={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handleCancel prompts when dirty and calls onCancel only if confirmed', async () => {
    const onCancel = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={onCancel}
        onPhotoChange={jest.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Dirty');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handleCancel does not call onCancel when dirty and user cancels confirm', async () => {
    const onCancel = jest.fn();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={onCancel}
        onPhotoChange={jest.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Dirty');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
