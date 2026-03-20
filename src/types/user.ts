export type UserRole = 'Admin' | 'Organizer' | 'Attendee';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  pendingEmail?: string;
  photoUrl?: string;
  role: UserRole;
  emailConfirmed: boolean;
  festivalPreferences: FestivalPreferences;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface FestivalPreferences {
  genres: string[];
  maxTravelDistance?: number;
  campingPreferred: boolean;
}

export interface NotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
  festivalPreferences?: Partial<FestivalPreferences>;
  notificationPreferences?: Partial<NotificationPreferences>;
}

export interface ApiError {
  message: string;
  field?: string;
}
