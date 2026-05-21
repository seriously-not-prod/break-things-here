import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileEdit } from '../components/profile-edit/profile-edit';
import { UserProfile } from '../types/user';
import * as fileValidation from '../utils/file-validation';

vi.mock('../utils/file-validation', () => ({
  validateProfilePhoto: vi.fn().mockReturnValue({ valid: true }),
  ALLOWED_PHOTO_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_PHOTO_SIZE_BYTES: 2 * 1024 * 1024,
}));

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
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
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
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
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
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
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
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={onSave}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'New Name');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'New Name' }));
    });
  });

  it('shows save error when provided', () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
        saveError="Server error occurred"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/server error occurred/i);
  });

  it('shows photo error for invalid file type', async () => {
    // Mock validateProfilePhoto to return invalid — the actual MIME validation
    // is tested exhaustively in file-validation.test.ts. This avoids jsdom's
    // inability to set files on an input for types not matching `accept`.
    vi.mocked(fileValidation.validateProfilePhoto).mockReturnValue({
      valid: false,
      error: 'Invalid file type "image/gif". Only JPEG, PNG, and WebP are allowed.',
    });

    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
      />,
    );
    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/profile photo/i);
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(screen.getByText(/only jpeg, png, and webp/i)).toBeInTheDocument();
    });
    vi.mocked(fileValidation.validateProfilePhoto).mockReturnValue({ valid: true });
  });
});

describe('ProfileEdit — dirty-state navigation guard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registers beforeunload handler when a field is changed', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPhotoChange={vi.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Changed');
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('handleCancel calls onCancel immediately when form is clean', () => {
    const onCancel = vi.fn();
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={vi.fn()}
        onCancel={onCancel}
        onPhotoChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handleCancel prompts when dirty and calls onCancel only if confirmed', async () => {
    const onCancel = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={vi.fn()}
        onCancel={onCancel}
        onPhotoChange={vi.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Dirty');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handleCancel does not call onCancel when dirty and user cancels confirm', async () => {
    const onCancel = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={vi.fn()}
        onCancel={onCancel}
        onPhotoChange={vi.fn()}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Dirty');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
