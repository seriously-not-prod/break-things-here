import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileEdit } from '../components/ProfileEdit/ProfileEdit';
import { updateProfile, uploadProfilePhoto } from '../api/users';
import { UpdateProfileRequest } from '../types/user';
import { UserProfile } from '../types/user';

const mockProfile: UserProfile = {
  id: 'user-1',
  displayName: 'Savita Sawant',
  email: 'savita@example.com',
  role: 'Attendee',
  emailConfirmed: true,
  festivalPreferences: { genres: ['Rock'], campingPreferred: false },
  notificationPreferences: { emailNotifications: true, pushNotifications: false },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
  jest.fn() as jest.MockedFunction<typeof fetch>,
);

beforeEach(() => fetchSpy.mockReset());

/**
 * Wrappers that satisfy the `() => Promise<void>` prop contract while
 * delegating to the real API functions under test.
 */
async function saveViaApi(data: UpdateProfileRequest): Promise<void> {
  await updateProfile(data);
}

async function uploadViaApi(file: File): Promise<void> {
  await uploadProfilePhoto(file);
}

describe('Profile management — integration', () => {
  it('routes a valid form submission through updateProfile to the fetch API', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...mockProfile, displayName: 'Updated Name' }),
    } as Response);

    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={saveViaApi}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Updated Name');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/users/me'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('Updated Name'),
        }),
      );
    });
  });

  it('routes a valid photo file through uploadProfilePhoto to the fetch API', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ photoUrl: 'https://cdn.example.com/new-photo.jpg' }),
    } as Response);

    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={uploadViaApi}
      />,
    );

    const file = new File(['img'], 'avatar.webp', { type: 'image/webp' });
    await userEvent.upload(screen.getByLabelText(/profile photo/i), file);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/photo'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('does not call the API when form validation fails', async () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={saveViaApi}
        onCancel={jest.fn()}
        onPhotoChange={jest.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText(/display name/i));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not upload a photo file that fails client-side validation', async () => {
    render(
      <ProfileEdit
        profile={mockProfile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onPhotoChange={uploadViaApi}
      />,
    );

    const invalidFile = new File(['img'], 'doc.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/profile photo/i), invalidFile);

    await waitFor(() => {
      expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
