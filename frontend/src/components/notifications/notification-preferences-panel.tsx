import React, { useEffect, useState } from 'react';
import {
  NOTIFICATION_TYPES,
  listNotificationPreferences,
  upsertNotificationPreference,
  type NotificationPreference,
  type NotificationType,
} from '../../services/collaboration-service';

const TYPE_LABELS: Record<NotificationType, string> = {
  task_due:       'Task Due Soon',
  task_overdue:   'Task Overdue',
  task_assigned:  'Task Assigned to Me',
  budget_alert:   'Budget Alert',
  rsvp_submitted: 'RSVP Submitted',
  event_update:   'Event Updated',
  chat_message:   'Chat Message',
  event_reminder: 'Event Reminder',
};

export function NotificationPreferencesPanel(): React.JSX.Element {
  const [prefs, setPrefs] = useState<Map<NotificationType, NotificationPreference>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<NotificationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listNotificationPreferences()
      .then((list) => {
        const map = new Map<NotificationType, NotificationPreference>();
        list.forEach((p) => map.set(p.notification_type, p));
        setPrefs(map);
        setLoading(false);
      })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, []);

  const handleToggle = async (
    type: NotificationType,
    field: 'email_enabled' | 'in_app_enabled' | 'push_enabled',
  ) => {
    const current = prefs.get(type) ?? {
      notification_type: type,
      email_enabled: true,
      in_app_enabled: true,
      push_enabled: false,
    } as NotificationPreference;
    const updated = { ...current, [field]: !current[field] };
    setSaving(type);
    try {
      const saved = await upsertNotificationPreference(type, {
        email_enabled:  updated.email_enabled,
        in_app_enabled: updated.in_app_enabled,
        push_enabled:   updated.push_enabled,
      });
      setPrefs((prev) => new Map(prev).set(type, saved));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save preference');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading preferences…</div>;

  return (
    <div className="p-4" aria-label="Notification preferences">
      <h2 className="text-lg font-semibold mb-4">Notification Preferences</h2>
      {error && (
        <div className="text-red-600 text-sm p-2 rounded bg-red-50 border border-red-200 mb-4" role="alert">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" role="table">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium">Notification Type</th>
              <th className="text-center py-2 px-3 font-medium">In-App</th>
              <th className="text-center py-2 px-3 font-medium">Email</th>
              <th className="text-center py-2 px-3 font-medium">Push</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map((type) => {
              const pref = prefs.get(type);
              const inApp  = pref?.in_app_enabled  ?? true;
              const email  = pref?.email_enabled   ?? true;
              const push   = pref?.push_enabled    ?? false;
              const isSaving = saving === type;

              return (
                <tr key={type} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-4">{TYPE_LABELS[type]}</td>
                  <td className="text-center py-2 px-3">
                    <input
                      type="checkbox"
                      checked={inApp}
                      onChange={() => handleToggle(type, 'in_app_enabled')}
                      disabled={isSaving}
                      aria-label={`In-app notifications for ${TYPE_LABELS[type]}`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="text-center py-2 px-3">
                    <input
                      type="checkbox"
                      checked={email}
                      onChange={() => handleToggle(type, 'email_enabled')}
                      disabled={isSaving}
                      aria-label={`Email notifications for ${TYPE_LABELS[type]}`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="text-center py-2 px-3">
                    <input
                      type="checkbox"
                      checked={push}
                      onChange={() => handleToggle(type, 'push_enabled')}
                      disabled={isSaving}
                      aria-label={`Push notifications for ${TYPE_LABELS[type]}`}
                      className="cursor-pointer"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Changes are saved immediately. Anti-spam batch rules are applied by the server regardless of these settings.
      </p>
    </div>
  );
}
