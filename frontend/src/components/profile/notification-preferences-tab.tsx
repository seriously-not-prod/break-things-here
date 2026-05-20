import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Resolver } from 'react-hook-form';
import {
  NOTIFICATION_TYPES,
  listNotificationPreferences,
  upsertNotificationPreference,
  type NotificationPreference,
  type NotificationType,
} from '../../services/collaboration-service';

const TYPE_LABELS: Record<NotificationType, string> = {
  task_due: 'Task Due Soon',
  task_overdue: 'Task Overdue',
  task_assigned: 'Task Assigned to Me',
  budget_alert: 'Budget Alert',
  rsvp_submitted: 'RSVP Submitted',
  event_update: 'Event Updated',
  chat_message: 'Chat Message',
  event_reminder: 'Event Reminder',
};

const CHANNELS = ['in_app_enabled', 'email_enabled', 'push_enabled'] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABELS: Record<Channel, string> = {
  in_app_enabled: 'In-App',
  email_enabled: 'Email',
  push_enabled: 'Push',
};

const channelSchema = z.object({
  in_app_enabled: z.boolean(),
  email_enabled: z.boolean(),
  push_enabled: z.boolean(),
});

const preferencesSchema = z.object(
  Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, channelSchema]),
  ) as Record<NotificationType, typeof channelSchema>,
);

type PreferencesFormValues = z.infer<typeof preferencesSchema>;

function buildDefaultValues(): PreferencesFormValues {
  const values: Record<string, z.infer<typeof channelSchema>> = {};
  for (const type of NOTIFICATION_TYPES) {
    values[type] = { in_app_enabled: true, email_enabled: true, push_enabled: false };
  }
  return values as PreferencesFormValues;
}

function prefsToFormValues(
  prefs: NotificationPreference[],
): PreferencesFormValues {
  const values = buildDefaultValues();
  for (const p of prefs) {
    if (p.notification_type in values) {
      values[p.notification_type] = {
        in_app_enabled: p.in_app_enabled,
        email_enabled: p.email_enabled,
        push_enabled: p.push_enabled,
      };
    }
  }
  return values;
}

export function NotificationPreferencesTab(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { control, reset, getValues, setValue } = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema) as Resolver<PreferencesFormValues>,
    defaultValues: buildDefaultValues(),
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listNotificationPreferences()
      .then((list) => {
        if (!cancelled) {
          reset(prefsToFormValues(list));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reset]);

  const handleToggle = useCallback(
    async (type: NotificationType, channel: Channel) => {
      const fieldPath = `${type}.${channel}` as const;
      const currentValue = getValues(fieldPath as `${NotificationType}.${Channel}`);
      const newValue = !currentValue;

      // Optimistic update
      setValue(fieldPath as `${NotificationType}.${Channel}`, newValue, { shouldDirty: true });
      setError(null);
      setSavingKey(`${type}.${channel}`);

      try {
        const typeValues = getValues(type);
        await upsertNotificationPreference(type, {
          email_enabled: typeValues.email_enabled,
          in_app_enabled: typeValues.in_app_enabled,
          push_enabled: typeValues.push_enabled,
        });
      } catch (err: unknown) {
        // Rollback on failure
        setValue(fieldPath as `${NotificationType}.${Channel}`, currentValue, { shouldDirty: true });
        setError(err instanceof Error ? err.message : 'Failed to save preference');
      } finally {
        setSavingKey(null);
      }
    },
    [getValues, setValue],
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box aria-label="Notification preferences">
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setError(null)}
          role="alert"
        >
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Notification preferences matrix">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Notification Type</TableCell>
              {CHANNELS.map((ch) => (
                <TableCell key={ch} align="center" sx={{ fontWeight: 600 }}>
                  {CHANNEL_LABELS[ch]}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {NOTIFICATION_TYPES.map((type) => (
              <TableRow key={type} hover>
                <TableCell>{TYPE_LABELS[type]}</TableCell>
                {CHANNELS.map((channel) => {
                  const key = `${type}.${channel}`;
                  const isSaving = savingKey === key;
                  return (
                    <TableCell key={channel} align="center" sx={{ py: 0.5 }}>
                      {isSaving ? (
                        <CircularProgress size={20} />
                      ) : (
                        <Controller
                          name={`${type}.${channel}` as `${NotificationType}.${Channel}`}
                          control={control}
                          render={({ field }) => (
                            <Checkbox
                              checked={!!field.value}
                              onChange={() => handleToggle(type, channel)}
                              inputProps={{
                                'aria-label': `${CHANNEL_LABELS[channel]} notifications for ${TYPE_LABELS[type]}`,
                              }}
                              size="small"
                            />
                          )}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
        Changes are saved immediately. Anti-spam batch rules are applied by the server.
      </Typography>
    </Box>
  );
}
