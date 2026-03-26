import { getProfile, updateProfile, uploadProfilePhoto, deleteAccount } from '../api/users';
import { UserProfile } from '../types/user';

const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
  jest.fn() as jest.MockedFunction<typeof fetch>,
);

const mockProfile: UserProfile = {
  id: 'user-1',
  displayName: 'Savita Sawant',
  email: 'savita@example.com',
  role: 'Attendee',
  emailConfirmed: true,
  festivalPreferences: { genres: ['Rock', 'Jazz'], campingPreferred: true },
  notificationPreferences: { emailNotifications: true, pushNotifications: false },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => fetchSpy.mockReset());

describe('getProfile', () => {
  it('fetches and returns the authenticated user profile', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, mockProfile));
    const result = await getProfile();
    expect(result).toEqual(mockProfile);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws Unauthorized on 401', async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, {}));
    await expect(getProfile()).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden on 403', async () => {
    fetchSpy.mockResolvedValue(makeResponse(403, {}));
    await expect(getProfile()).rejects.toThrow('Forbidden');
  });

  it('throws the server error message on failure', async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, { message: 'Database error' }));
    await expect(getProfile()).rejects.toThrow('Database error');
  });

  it('falls back to a generic message when server returns no message', async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, {}));
    await expect(getProfile()).rejects.toThrow('Request failed');
  });
});

describe('updateProfile', () => {
  it('sends a PATCH request and returns the updated profile', async () => {
    const updated = { ...mockProfile, displayName: 'New Name' };
    fetchSpy.mockResolvedValue(makeResponse(200, updated));
    const result = await updateProfile({ displayName: 'New Name' });
    expect(result.displayName).toBe('New Name');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"displayName":"New Name"'),
      }),
    );
  });

  it('throws Unauthorized on 401', async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, {}));
    await expect(updateProfile({ displayName: 'Test' })).rejects.toThrow('Unauthorized');
  });

  it('throws server error message on 422', async () => {
    fetchSpy.mockResolvedValue(makeResponse(422, { message: 'Email already in use.' }));
    await expect(updateProfile({ email: 'taken@example.com' })).rejects.toThrow(
      'Email already in use.',
    );
  });
});

describe('uploadProfilePhoto', () => {
  const file = new File(['img'], 'avatar.jpg', { type: 'image/jpeg' });

  it('returns photoUrl on success', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, { photoUrl: 'https://cdn.example.com/photo.jpg' }),
    );
    const result = await uploadProfilePhoto(file);
    expect(result.photoUrl).toBe('https://cdn.example.com/photo.jpg');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/me/photo'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws Unauthorized on 401', async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, {}));
    await expect(uploadProfilePhoto(file)).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden on 403', async () => {
    fetchSpy.mockResolvedValue(makeResponse(403, {}));
    await expect(uploadProfilePhoto(file)).rejects.toThrow('Forbidden');
  });

  it('throws server error message on 400', async () => {
    fetchSpy.mockResolvedValue(makeResponse(400, { message: 'File type not supported.' }));
    await expect(uploadProfilePhoto(file)).rejects.toThrow('File type not supported.');
  });

  it('throws generic error on other failure', async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, {}));
    await expect(uploadProfilePhoto(file)).rejects.toThrow('Photo upload failed');
  });
});

describe('deleteAccount', () => {
  it('resolves without a value on 204', async () => {
    fetchSpy.mockResolvedValue(makeResponse(204, null));
    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws Unauthorized on 401', async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, {}));
    await expect(deleteAccount()).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden on 403', async () => {
    fetchSpy.mockResolvedValue(makeResponse(403, {}));
    await expect(deleteAccount()).rejects.toThrow('Forbidden');
  });
});
