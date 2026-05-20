import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationPreferencesTab } from '../src/components/profile/notification-preferences-tab';
import * as collaborationService from '../src/services/collaboration-service';
import type { NotificationPreference } from '../src/services/collaboration-service';

vi.mock('../src/services/collaboration-service', () => ({
  NOTIFICATION_TYPES: [
    'task_due',
    'task_overdue',
    'task_assigned',
    'budget_alert',
    'rsvp_submitted',
    'event_update',
    'chat_message',
    'event_reminder',
  ],
  listNotificationPreferences: vi.fn(),
  upsertNotificationPreference: vi.fn(),
}));

const mockedService = vi.mocked(collaborationService);

const MOCK_PREFERENCES: NotificationPreference[] = [
  { id: 1, user_id: 10, notification_type: 'task_due', email_enabled: true, in_app_enabled: true, push_enabled: false },
  { id: 2, user_id: 10, notification_type: 'task_overdue', email_enabled: true, in_app_enabled: true, push_enabled: false },
  { id: 3, user_id: 10, notification_type: 'task_assigned', email_enabled: true, in_app_enabled: true, push_enabled: true },
  { id: 4, user_id: 10, notification_type: 'budget_alert', email_enabled: false, in_app_enabled: true, push_enabled: false },
  { id: 5, user_id: 10, notification_type: 'rsvp_submitted', email_enabled: true, in_app_enabled: true, push_enabled: false },
  { id: 6, user_id: 10, notification_type: 'event_update', email_enabled: true, in_app_enabled: true, push_enabled: false },
  { id: 7, user_id: 10, notification_type: 'chat_message', email_enabled: true, in_app_enabled: true, push_enabled: false },
  { id: 8, user_id: 10, notification_type: 'event_reminder', email_enabled: true, in_app_enabled: true, push_enabled: false },
];

describe('NotificationPreferencesTab', () => {
  beforeEach(() => {
    mockedService.listNotificationPreferences.mockResolvedValue(MOCK_PREFERENCES);
    mockedService.upsertNotificationPreference.mockImplementation(
      async (_type, prefs) =>
        ({ id: 1, user_id: 10, notification_type: _type, ...prefs }) as NotificationPreference,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockedService.listNotificationPreferences.mockReturnValue(new Promise(() => {}));
    render(<NotificationPreferencesTab />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the preferences matrix after loading', async () => {
    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByText('Task Due Soon')).toBeInTheDocument();
    });

    expect(screen.getByText('Task Overdue')).toBeInTheDocument();
    expect(screen.getByText('Task Assigned to Me')).toBeInTheDocument();
    expect(screen.getByText('Budget Alert')).toBeInTheDocument();
    expect(screen.getByText('RSVP Submitted')).toBeInTheDocument();
    expect(screen.getByText('Event Updated')).toBeInTheDocument();
    expect(screen.getByText('Chat Message')).toBeInTheDocument();
    expect(screen.getByText('Event Reminder')).toBeInTheDocument();
  });

  it('renders column headers for all channels', async () => {
    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByText('In-App')).toBeInTheDocument();
    });

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
  });

  it('reflects initial preference values from the API', async () => {
    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByText('Budget Alert')).toBeInTheDocument();
    });

    const emailBudget = screen.getByLabelText('Email notifications for Budget Alert');
    expect(emailBudget).not.toBeChecked();

    const pushAssigned = screen.getByLabelText('Push notifications for Task Assigned to Me');
    expect(pushAssigned).toBeChecked();
  });

  it('saves toggle change via API with optimistic update', async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByText('Budget Alert')).toBeInTheDocument();
    });

    const emailBudget = screen.getByLabelText('Email notifications for Budget Alert');
    expect(emailBudget).not.toBeChecked();

    await user.click(emailBudget);

    await waitFor(() => {
      expect(mockedService.upsertNotificationPreference).toHaveBeenCalledWith(
        'budget_alert',
        expect.objectContaining({ email_enabled: true }),
      );
    });
  });

  it('rolls back on API failure', async () => {
    const user = userEvent.setup();
    mockedService.upsertNotificationPreference.mockRejectedValueOnce(
      new Error('Network error'),
    );

    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByText('Budget Alert')).toBeInTheDocument();
    });

    const emailBudget = screen.getByLabelText('Email notifications for Budget Alert');
    expect(emailBudget).not.toBeChecked();

    await user.click(emailBudget);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });

    // Should be rolled back to unchecked
    await waitFor(() => {
      expect(screen.getByLabelText('Email notifications for Budget Alert')).not.toBeChecked();
    });
  });

  it('displays error when loading preferences fails', async () => {
    mockedService.listNotificationPreferences.mockRejectedValue(
      new Error('Server unavailable'),
    );

    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable');
    });
  });

  it('has accessible aria-labels on all checkboxes', async () => {
    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByText('Task Due Soon')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('In-App notifications for Task Due Soon')).toBeInTheDocument();
    expect(screen.getByLabelText('Email notifications for Task Due Soon')).toBeInTheDocument();
    expect(screen.getByLabelText('Push notifications for Task Due Soon')).toBeInTheDocument();
  });

  it('renders the table with proper role for accessibility', async () => {
    render(<NotificationPreferencesTab />);

    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'Notification preferences matrix' })).toBeInTheDocument();
    });
  });
});
