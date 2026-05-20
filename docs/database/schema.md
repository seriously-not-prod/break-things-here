# Database Schema Reference

> Generated from live database metadata using `scripts/generate-erd.sh`.

## Summary

- Schema: `public`
- Total tables: `64`

## `activity_feed`

- Purpose: Stores activity feed records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                     |
| ------------- | ----------------------------- | ----------- | ------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('activity_feed_id_seq'::regclass)` |
| `event_id`    | `integer`                     | `NULLABLE`  | `-`                                         |
| `user_id`     | `integer`                     | `NULLABLE`  | `-`                                         |
| `action_type` | `text`                        | `NOT NULL`  | `-`                                         |
| `description` | `text`                        | `NOT NULL`  | `-`                                         |
| `link`        | `text`                        | `NULLABLE`  | `-`                                         |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                         |

### Indexes

- `activity_feed_pkey`: `CREATE UNIQUE INDEX activity_feed_pkey ON public.activity_feed USING btree (id)`

## `attendance_events`

- Purpose: Stores attendance events records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                         |
| ------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('attendance_events_id_seq'::regclass)` |
| `event_id`    | `integer`                     | `NOT NULL`  | `-`                                             |
| `rsvp_id`     | `integer`                     | `NOT NULL`  | `-`                                             |
| `action`      | `text`                        | `NOT NULL`  | `-`                                             |
| `source`      | `text`                        | `NOT NULL`  | `'manual'::text`                                |
| `occurred_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |
| `actor_id`    | `integer`                     | `NULLABLE`  | `-`                                             |
| `metadata`    | `jsonb`                       | `NULLABLE`  | `-`                                             |

### Indexes

- `attendance_events_pkey`: `CREATE UNIQUE INDEX attendance_events_pkey ON public.attendance_events USING btree (id)`
- `idx_attendance_events_event`: `CREATE INDEX idx_attendance_events_event ON public.attendance_events USING btree (event_id, occurred_at DESC)`

## `audit_log`

- Purpose: Stores audit log records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                 |
| ------------- | ----------------------------- | ----------- | --------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('audit_log_id_seq'::regclass)` |
| `user_id`     | `integer`                     | `NULLABLE`  | `-`                                     |
| `email`       | `text`                        | `NULLABLE`  | `-`                                     |
| `action`      | `text`                        | `NOT NULL`  | `-`                                     |
| `description` | `text`                        | `NULLABLE`  | `-`                                     |
| `ip_address`  | `text`                        | `NULLABLE`  | `-`                                     |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                     |
| `actor_id`    | `integer`                     | `NULLABLE`  | `-`                                     |
| `target_type` | `text`                        | `NULLABLE`  | `-`                                     |
| `target_id`   | `text`                        | `NULLABLE`  | `-`                                     |
| `context`     | `jsonb`                       | `NULLABLE`  | `-`                                     |
| `severity`    | `text`                        | `NULLABLE`  | `'INFO'::text`                          |

### Indexes

- `audit_log_pkey`: `CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)`
- `idx_audit_log_action`: `CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action)`
- `idx_audit_log_created_at`: `CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC)`
- `idx_audit_log_user_id`: `CREATE INDEX idx_audit_log_user_id ON public.audit_log USING btree (user_id)`

## `budget_categories`

- Purpose: Stores budget categories records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column             | Type                          | Nullability | Default                                         |
| ------------------ | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`               | `integer`                     | `NOT NULL`  | `nextval('budget_categories_id_seq'::regclass)` |
| `event_id`         | `integer`                     | `NOT NULL`  | `-`                                             |
| `name`             | `text`                        | `NOT NULL`  | `-`                                             |
| `allocated_amount` | `numeric`                     | `NULLABLE`  | `0`                                             |
| `tax_rate`         | `numeric`                     | `NULLABLE`  | `0`                                             |
| `gratuity_rate`    | `numeric`                     | `NULLABLE`  | `0`                                             |
| `contingency_rate` | `numeric`                     | `NULLABLE`  | `0`                                             |
| `color`            | `text`                        | `NULLABLE`  | `'#6366f1'::text`                               |
| `created_at`       | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |

### Indexes

- `budget_categories_pkey`: `CREATE UNIQUE INDEX budget_categories_pkey ON public.budget_categories USING btree (id)`

## `budget_template_items`

- Purpose: Stores budget template items records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column             | Type                          | Nullability | Default                                             |
| ------------------ | ----------------------------- | ----------- | --------------------------------------------------- |
| `id`               | `integer`                     | `NOT NULL`  | `nextval('budget_template_items_id_seq'::regclass)` |
| `template_id`      | `integer`                     | `NOT NULL`  | `-`                                                 |
| `name`             | `text`                        | `NOT NULL`  | `-`                                                 |
| `allocated_amount` | `numeric`                     | `NULLABLE`  | `0`                                                 |
| `color`            | `text`                        | `NULLABLE`  | `'#6366f1'::text`                                   |
| `created_at`       | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                 |

### Indexes

- `budget_template_items_pkey`: `CREATE UNIQUE INDEX budget_template_items_pkey ON public.budget_template_items USING btree (id)`
- `idx_budget_template_items_template_id`: `CREATE INDEX idx_budget_template_items_template_id ON public.budget_template_items USING btree (template_id)`

## `budget_templates`

- Purpose: Stores budget templates records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                        |
| ------------- | ----------------------------- | ----------- | ---------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('budget_templates_id_seq'::regclass)` |
| `name`        | `text`                        | `NOT NULL`  | `-`                                            |
| `description` | `text`                        | `NULLABLE`  | `-`                                            |
| `created_by`  | `integer`                     | `NULLABLE`  | `-`                                            |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                            |

### Indexes

- `budget_templates_pkey`: `CREATE UNIQUE INDEX budget_templates_pkey ON public.budget_templates USING btree (id)`

## `categories`

- Purpose: Stores categories records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                  |
| ------------- | ----------------------------- | ----------- | ---------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('categories_id_seq'::regclass)` |
| `name`        | `text`                        | `NOT NULL`  | `-`                                      |
| `description` | `text`                        | `NULLABLE`  | `-`                                      |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                      |

### Indexes

- `categories_name_key`: `CREATE UNIQUE INDEX categories_name_key ON public.categories USING btree (name)`
- `categories_pkey`: `CREATE UNIQUE INDEX categories_pkey ON public.categories USING btree (id)`

## `communication_log`

- Purpose: Stores communication log records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column               | Type                          | Nullability | Default                                         |
| -------------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`                 | `integer`                     | `NOT NULL`  | `nextval('communication_log_id_seq'::regclass)` |
| `event_id`           | `integer`                     | `NOT NULL`  | `-`                                             |
| `guest_email`        | `text`                        | `NULLABLE`  | `-`                                             |
| `communication_type` | `text`                        | `NOT NULL`  | `-`                                             |
| `subject`            | `text`                        | `NULLABLE`  | `-`                                             |
| `content`            | `text`                        | `NULLABLE`  | `-`                                             |
| `status`             | `text`                        | `NULLABLE`  | `'sent'::text`                                  |
| `sent_by`            | `integer`                     | `NULLABLE`  | `-`                                             |
| `sent_at`            | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |

### Indexes

- `communication_log_pkey`: `CREATE UNIQUE INDEX communication_log_pkey ON public.communication_log USING btree (id)`
- `idx_communication_log_event_id`: `CREATE INDEX idx_communication_log_event_id ON public.communication_log USING btree (event_id)`

## `communication_templates`

- Purpose: Stores communication templates records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                               |
| ------------ | ----------------------------- | ----------- | ----------------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('communication_templates_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NULLABLE`  | `-`                                                   |
| `slug`       | `text`                        | `NOT NULL`  | `-`                                                   |
| `name`       | `text`                        | `NOT NULL`  | `-`                                                   |
| `subject`    | `text`                        | `NOT NULL`  | `-`                                                   |
| `body`       | `text`                        | `NOT NULL`  | `-`                                                   |
| `is_default` | `boolean`                     | `NULLABLE`  | `false`                                               |
| `created_by` | `integer`                     | `NULLABLE`  | `-`                                                   |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |
| `updated_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |

### Indexes

- `communication_templates_event_id_slug_key`: `CREATE UNIQUE INDEX communication_templates_event_id_slug_key ON public.communication_templates USING btree (event_id, slug)`
- `communication_templates_pkey`: `CREATE UNIQUE INDEX communication_templates_pkey ON public.communication_templates USING btree (id)`
- `idx_comm_templates_event`: `CREATE INDEX idx_comm_templates_event ON public.communication_templates USING btree (event_id)`

## `communication_tracking_events`

- Purpose: Stores communication tracking events records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                 | Type                          | Nullability | Default                                                     |
| ---------------------- | ----------------------------- | ----------- | ----------------------------------------------------------- |
| `id`                   | `integer`                     | `NOT NULL`  | `nextval('communication_tracking_events_id_seq'::regclass)` |
| `communication_log_id` | `integer`                     | `NOT NULL`  | `-`                                                         |
| `event_type`           | `text`                        | `NOT NULL`  | `-`                                                         |
| `target_url`           | `text`                        | `NULLABLE`  | `-`                                                         |
| `ip_address`           | `text`                        | `NULLABLE`  | `-`                                                         |
| `user_agent`           | `text`                        | `NULLABLE`  | `-`                                                         |
| `occurred_at`          | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                         |

### Indexes

- `communication_tracking_events_pkey`: `CREATE UNIQUE INDEX communication_tracking_events_pkey ON public.communication_tracking_events USING btree (id)`
- `idx_comm_tracking_log_id`: `CREATE INDEX idx_comm_tracking_log_id ON public.communication_tracking_events USING btree (communication_log_id)`
- `idx_comm_tracking_type`: `CREATE INDEX idx_comm_tracking_type ON public.communication_tracking_events USING btree (event_type)`

## `event_categories`

- Purpose: Stores event categories records for festival planner workflows.
- Primary key: `event_id, category_id`
- RLS: `disabled`

### Columns

| Column        | Type      | Nullability | Default |
| ------------- | --------- | ----------- | ------- |
| `event_id`    | `integer` | `NOT NULL`  | `-`     |
| `category_id` | `integer` | `NOT NULL`  | `-`     |

### Indexes

- `event_categories_pkey`: `CREATE UNIQUE INDEX event_categories_pkey ON public.event_categories USING btree (event_id, category_id)`
- `idx_event_categories_event_id`: `CREATE INDEX idx_event_categories_event_id ON public.event_categories USING btree (event_id)`

## `event_custom_fields`

- Purpose: Stores event custom fields records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                           |
| ------------ | ----------------------------- | ----------- | ------------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('event_custom_fields_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                               |
| `field_key`  | `text`                        | `NOT NULL`  | `-`                                               |
| `label`      | `text`                        | `NOT NULL`  | `-`                                               |
| `field_type` | `text`                        | `NOT NULL`  | `-`                                               |
| `options`    | `jsonb`                       | `NULLABLE`  | `-`                                               |
| `value`      | `text`                        | `NULLABLE`  | `-`                                               |
| `required`   | `boolean`                     | `NOT NULL`  | `false`                                           |
| `sort_order` | `integer`                     | `NOT NULL`  | `0`                                               |
| `created_by` | `integer`                     | `NULLABLE`  | `-`                                               |
| `updated_by` | `integer`                     | `NULLABLE`  | `-`                                               |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |
| `updated_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |

### Indexes

- `event_custom_fields_event_id_field_key_key`: `CREATE UNIQUE INDEX event_custom_fields_event_id_field_key_key ON public.event_custom_fields USING btree (event_id, field_key)`
- `event_custom_fields_pkey`: `CREATE UNIQUE INDEX event_custom_fields_pkey ON public.event_custom_fields USING btree (id)`
- `idx_event_custom_fields_event_id`: `CREATE INDEX idx_event_custom_fields_event_id ON public.event_custom_fields USING btree (event_id)`

## `event_documents`

- Purpose: Stores event documents records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                | Type                          | Nullability | Default                                       |
| --------------------- | ----------------------------- | ----------- | --------------------------------------------- |
| `id`                  | `integer`                     | `NOT NULL`  | `nextval('event_documents_id_seq'::regclass)` |
| `event_id`            | `integer`                     | `NOT NULL`  | `-`                                           |
| `original_name`       | `text`                        | `NOT NULL`  | `-`                                           |
| `file_name`           | `text`                        | `NOT NULL`  | `-`                                           |
| `mime_type`           | `text`                        | `NOT NULL`  | `-`                                           |
| `file_size`           | `integer`                     | `NOT NULL`  | `-`                                           |
| `created_by`          | `integer`                     | `NULLABLE`  | `-`                                           |
| `created_at`          | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                           |
| `updated_at`          | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                           |
| `caption`             | `text`                        | `NULLABLE`  | `-`                                           |
| `album_id`            | `integer`                     | `NULLABLE`  | `-`                                           |
| `moderation_status`   | `text`                        | `NOT NULL`  | `'approved'::text`                            |
| `submitted_by`        | `integer`                     | `NULLABLE`  | `-`                                           |
| `visibility`          | `text`                        | `NOT NULL`  | `'event'::text`                               |
| `allow_download`      | `boolean`                     | `NOT NULL`  | `true`                                        |
| `allow_comments`      | `boolean`                     | `NOT NULL`  | `true`                                        |
| `conversion_status`   | `text`                        | `NOT NULL`  | `'none'::text`                                |
| `original_format`     | `text`                        | `NULLABLE`  | `-`                                           |
| `converted_file_name` | `text`                        | `NULLABLE`  | `-`                                           |
| `thumbnail_url`       | `text`                        | `NULLABLE`  | `-`                                           |
| `medium_url`          | `text`                        | `NULLABLE`  | `-`                                           |
| `updated_by`          | `integer`                     | `NULLABLE`  | `-`                                           |

### Indexes

- `event_documents_pkey`: `CREATE UNIQUE INDEX event_documents_pkey ON public.event_documents USING btree (id)`
- `idx_event_documents_album_id`: `CREATE INDEX idx_event_documents_album_id ON public.event_documents USING btree (album_id)`
- `idx_event_documents_conversion`: `CREATE INDEX idx_event_documents_conversion ON public.event_documents USING btree (conversion_status) WHERE (conversion_status <> 'none'::text)`
- `idx_event_documents_event_id`: `CREATE INDEX idx_event_documents_event_id ON public.event_documents USING btree (event_id)`
- `idx_event_documents_moderation`: `CREATE INDEX idx_event_documents_moderation ON public.event_documents USING btree (event_id, moderation_status)`
- `idx_event_documents_visibility`: `CREATE INDEX idx_event_documents_visibility ON public.event_documents USING btree (event_id, visibility)`

## `event_filter_presets`

- Purpose: Stores event filter presets records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                            |
| ------------ | ----------------------------- | ----------- | -------------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('event_filter_presets_id_seq'::regclass)` |
| `name`       | `text`                        | `NOT NULL`  | `-`                                                |
| `filters`    | `text`                        | `NOT NULL`  | `-`                                                |
| `user_id`    | `integer`                     | `NOT NULL`  | `-`                                                |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                |
| `updated_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                |

### Indexes

- `event_filter_presets_pkey`: `CREATE UNIQUE INDEX event_filter_presets_pkey ON public.event_filter_presets USING btree (id)`
- `idx_event_filter_presets_user`: `CREATE INDEX idx_event_filter_presets_user ON public.event_filter_presets USING btree (user_id)`
- `idx_event_filter_presets_user_name`: `CREATE UNIQUE INDEX idx_event_filter_presets_user_name ON public.event_filter_presets USING btree (user_id, name)`

## `event_meal_options`

- Purpose: Stores event meal options records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                          |
| ------------- | ----------------------------- | ----------- | ------------------------------------------------ |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('event_meal_options_id_seq'::regclass)` |
| `event_id`    | `integer`                     | `NOT NULL`  | `-`                                              |
| `name`        | `text`                        | `NOT NULL`  | `-`                                              |
| `description` | `text`                        | `NULLABLE`  | `-`                                              |
| `is_active`   | `boolean`                     | `NULLABLE`  | `true`                                           |
| `sort_order`  | `integer`                     | `NULLABLE`  | `0`                                              |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                              |
| `updated_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                              |

### Indexes

- `event_meal_options_event_id_name_key`: `CREATE UNIQUE INDEX event_meal_options_event_id_name_key ON public.event_meal_options USING btree (event_id, name)`
- `event_meal_options_pkey`: `CREATE UNIQUE INDEX event_meal_options_pkey ON public.event_meal_options USING btree (id)`
- `idx_event_meal_options_event`: `CREATE INDEX idx_event_meal_options_event ON public.event_meal_options USING btree (event_id)`

## `event_members`

- Purpose: Stores event members records for festival planner workflows.
- Primary key: `event_id, user_id`
- RLS: `disabled`

### Columns

| Column      | Type                          | Nullability | Default             |
| ----------- | ----------------------------- | ----------- | ------------------- |
| `event_id`  | `integer`                     | `NOT NULL`  | `-`                 |
| `user_id`   | `integer`                     | `NOT NULL`  | `-`                 |
| `role`      | `text`                        | `NULLABLE`  | `'Member'::text`    |
| `joined_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP` |

### Indexes

- `event_members_pkey`: `CREATE UNIQUE INDEX event_members_pkey ON public.event_members USING btree (event_id, user_id)`

## `event_messages`

- Purpose: Stores event messages records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                      |
| ------------ | ----------------------------- | ----------- | -------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('event_messages_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                          |
| `sender_id`  | `integer`                     | `NOT NULL`  | `-`                                          |
| `body`       | `text`                        | `NOT NULL`  | `-`                                          |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |
| `updated_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |
| `deleted_at` | `timestamp without time zone` | `NULLABLE`  | `-`                                          |

### Indexes

- `event_messages_pkey`: `CREATE UNIQUE INDEX event_messages_pkey ON public.event_messages USING btree (id)`
- `idx_event_messages_event_id`: `CREATE INDEX idx_event_messages_event_id ON public.event_messages USING btree (event_id)`
- `idx_event_messages_sender_id`: `CREATE INDEX idx_event_messages_sender_id ON public.event_messages USING btree (sender_id)`

## `event_template_sections`

- Purpose: Stores event template sections records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                               |
| ------------- | ----------------------------- | ----------- | ----------------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('event_template_sections_id_seq'::regclass)` |
| `template_id` | `integer`                     | `NOT NULL`  | `-`                                                   |
| `section_key` | `text`                        | `NOT NULL`  | `-`                                                   |
| `payload`     | `jsonb`                       | `NOT NULL`  | `'{}'::jsonb`                                         |
| `sort_order`  | `integer`                     | `NOT NULL`  | `0`                                                   |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |
| `updated_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |

### Indexes

- `event_template_sections_pkey`: `CREATE UNIQUE INDEX event_template_sections_pkey ON public.event_template_sections USING btree (id)`
- `event_template_sections_template_id_section_key_key`: `CREATE UNIQUE INDEX event_template_sections_template_id_section_key_key ON public.event_template_sections USING btree (template_id, section_key)`
- `idx_event_template_sections_template_id`: `CREATE INDEX idx_event_template_sections_template_id ON public.event_template_sections USING btree (template_id)`

## `event_templates`

- Purpose: Stores event templates records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                     | Type                          | Nullability | Default                                       |
| -------------------------- | ----------------------------- | ----------- | --------------------------------------------- |
| `id`                       | `integer`                     | `NOT NULL`  | `nextval('event_templates_id_seq'::regclass)` |
| `name`                     | `text`                        | `NOT NULL`  | `-`                                           |
| `description`              | `text`                        | `NULLABLE`  | `-`                                           |
| `default_title`            | `text`                        | `NULLABLE`  | `-`                                           |
| `default_location`         | `text`                        | `NULLABLE`  | `-`                                           |
| `default_capacity`         | `integer`                     | `NULLABLE`  | `-`                                           |
| `default_event_type`       | `text`                        | `NULLABLE`  | `-`                                           |
| `default_status`           | `text`                        | `NULLABLE`  | `'Draft'::text`                               |
| `default_tags`             | `text`                        | `NULLABLE`  | `-`                                           |
| `default_is_public`        | `boolean`                     | `NULLABLE`  | `false`                                       |
| `default_waitlist_enabled` | `boolean`                     | `NULLABLE`  | `false`                                       |
| `created_by`               | `integer`                     | `NOT NULL`  | `-`                                           |
| `created_at`               | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                           |
| `updated_at`               | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                           |
| `deleted_at`               | `timestamp without time zone` | `NULLABLE`  | `-`                                           |

### Indexes

- `event_templates_pkey`: `CREATE UNIQUE INDEX event_templates_pkey ON public.event_templates USING btree (id)`
- `idx_event_templates_created_by`: `CREATE INDEX idx_event_templates_created_by ON public.event_templates USING btree (created_by)`

## `events`

- Purpose: Stores events records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                     | Type                          | Nullability | Default                              |
| -------------------------- | ----------------------------- | ----------- | ------------------------------------ |
| `id`                       | `integer`                     | `NOT NULL`  | `nextval('events_id_seq'::regclass)` |
| `title`                    | `text`                        | `NOT NULL`  | `-`                                  |
| `date`                     | `text`                        | `NOT NULL`  | `-`                                  |
| `location`                 | `text`                        | `NOT NULL`  | `-`                                  |
| `description`              | `text`                        | `NULLABLE`  | `-`                                  |
| `capacity`                 | `integer`                     | `NULLABLE`  | `-`                                  |
| `status`                   | `text`                        | `NULLABLE`  | `'Draft'::text`                      |
| `created_by`               | `integer`                     | `NOT NULL`  | `-`                                  |
| `created_at`               | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                  |
| `updated_at`               | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                  |
| `deleted_at`               | `timestamp without time zone` | `NULLABLE`  | `-`                                  |
| `cover_image_url`          | `text`                        | `NULLABLE`  | `-`                                  |
| `event_type`               | `text`                        | `NULLABLE`  | `'Other'::text`                      |
| `is_public`                | `boolean`                     | `NULLABLE`  | `false`                              |
| `rsvp_deadline`            | `timestamp without time zone` | `NULLABLE`  | `-`                                  |
| `tags`                     | `text`                        | `NULLABLE`  | `-`                                  |
| `end_date`                 | `text`                        | `NULLABLE`  | `-`                                  |
| `currency_code`            | `text`                        | `NOT NULL`  | `'USD'::text`                        |
| `archived_at`              | `timestamp without time zone` | `NULLABLE`  | `-`                                  |
| `archived_by`              | `integer`                     | `NULLABLE`  | `-`                                  |
| `archive_reason`           | `text`                        | `NULLABLE`  | `-`                                  |
| `updated_by`               | `integer`                     | `NULLABLE`  | `-`                                  |
| `gallery_comments_enabled` | `boolean`                     | `NOT NULL`  | `true`                               |
| `gallery_guest_uploads`    | `boolean`                     | `NOT NULL`  | `false`                              |
| `gallery_public`           | `boolean`                     | `NOT NULL`  | `false`                              |
| `storage_quota_bytes`      | `bigint`                      | `NOT NULL`  | `524288000`                          |
| `storage_used_bytes`       | `bigint`                      | `NOT NULL`  | `0`                                  |
| `cover_image_sizes`        | `jsonb`                       | `NULLABLE`  | `-`                                  |

### Indexes

- `events_pkey`: `CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)`
- `idx_events_archived_at`: `CREATE INDEX idx_events_archived_at ON public.events USING btree (archived_at) WHERE (archived_at IS NOT NULL)`

## `exchange_rates`

- Purpose: Stores exchange rates records for festival planner workflows.
- Primary key: `base_currency, quote_currency`
- RLS: `disabled`

### Columns

| Column           | Type                          | Nullability | Default             |
| ---------------- | ----------------------------- | ----------- | ------------------- |
| `base_currency`  | `text`                        | `NOT NULL`  | `-`                 |
| `quote_currency` | `text`                        | `NOT NULL`  | `-`                 |
| `rate`           | `numeric`                     | `NOT NULL`  | `-`                 |
| `source`         | `text`                        | `NOT NULL`  | `'manual'::text`    |
| `fetched_at`     | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP` |

### Indexes

- `exchange_rates_pkey`: `CREATE UNIQUE INDEX exchange_rates_pkey ON public.exchange_rates USING btree (base_currency, quote_currency)`

## `expense_receipt_ocr`

- Purpose: Stores expense receipt ocr records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                  | Type                          | Nullability | Default                                           |
| ----------------------- | ----------------------------- | ----------- | ------------------------------------------------- |
| `id`                    | `integer`                     | `NOT NULL`  | `nextval('expense_receipt_ocr_id_seq'::regclass)` |
| `event_id`              | `integer`                     | `NOT NULL`  | `-`                                               |
| `expense_id`            | `integer`                     | `NOT NULL`  | `-`                                               |
| `receipt_text`          | `text`                        | `NOT NULL`  | `-`                                               |
| `extracted_title`       | `text`                        | `NULLABLE`  | `-`                                               |
| `extracted_amount`      | `numeric`                     | `NULLABLE`  | `-`                                               |
| `extracted_vendor_name` | `text`                        | `NULLABLE`  | `-`                                               |
| `extracted_date`        | `text`                        | `NULLABLE`  | `-`                                               |
| `confidence`            | `numeric`                     | `NOT NULL`  | `0`                                               |
| `status`                | `text`                        | `NOT NULL`  | `'extracted'::text`                               |
| `error_code`            | `text`                        | `NULLABLE`  | `-`                                               |
| `error_message`         | `text`                        | `NULLABLE`  | `-`                                               |
| `created_by`            | `integer`                     | `NOT NULL`  | `-`                                               |
| `applied_by`            | `integer`                     | `NULLABLE`  | `-`                                               |
| `applied_at`            | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `created_at`            | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |
| `updated_at`            | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |

### Indexes

- `expense_receipt_ocr_pkey`: `CREATE UNIQUE INDEX expense_receipt_ocr_pkey ON public.expense_receipt_ocr USING btree (id)`
- `idx_expense_receipt_ocr_event_id`: `CREATE INDEX idx_expense_receipt_ocr_event_id ON public.expense_receipt_ocr USING btree (event_id)`
- `idx_expense_receipt_ocr_expense_id`: `CREATE INDEX idx_expense_receipt_ocr_expense_id ON public.expense_receipt_ocr USING btree (expense_id)`

## `expense_reconciliation_logs`

- Purpose: Stores expense reconciliation logs records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column            | Type                          | Nullability | Default                                                   |
| ----------------- | ----------------------------- | ----------- | --------------------------------------------------------- |
| `id`              | `integer`                     | `NOT NULL`  | `nextval('expense_reconciliation_logs_id_seq'::regclass)` |
| `event_id`        | `integer`                     | `NOT NULL`  | `-`                                                       |
| `expense_id`      | `integer`                     | `NOT NULL`  | `-`                                                       |
| `ocr_id`          | `integer`                     | `NOT NULL`  | `-`                                                       |
| `before_data`     | `jsonb`                       | `NOT NULL`  | `-`                                                       |
| `extracted_data`  | `jsonb`                       | `NOT NULL`  | `-`                                                       |
| `applied_data`    | `jsonb`                       | `NOT NULL`  | `-`                                                       |
| `overrides_count` | `integer`                     | `NOT NULL`  | `0`                                                       |
| `override_reason` | `text`                        | `NULLABLE`  | `-`                                                       |
| `created_by`      | `integer`                     | `NOT NULL`  | `-`                                                       |
| `updated_by`      | `integer`                     | `NOT NULL`  | `-`                                                       |
| `created_at`      | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                       |
| `updated_at`      | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                       |

### Indexes

- `expense_reconciliation_logs_pkey`: `CREATE UNIQUE INDEX expense_reconciliation_logs_pkey ON public.expense_reconciliation_logs USING btree (id)`
- `idx_expense_reconciliation_logs_event_id`: `CREATE INDEX idx_expense_reconciliation_logs_event_id ON public.expense_reconciliation_logs USING btree (event_id)`
- `idx_expense_reconciliation_logs_expense_id`: `CREATE INDEX idx_expense_reconciliation_logs_expense_id ON public.expense_reconciliation_logs USING btree (expense_id)`

## `expense_workflow_events`

- Purpose: Stores expense workflow events records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                                               |
| --------------- | ----------------------------- | ----------- | ----------------------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('expense_workflow_events_id_seq'::regclass)` |
| `event_id`      | `integer`                     | `NOT NULL`  | `-`                                                   |
| `expense_id`    | `integer`                     | `NOT NULL`  | `-`                                                   |
| `action`        | `text`                        | `NOT NULL`  | `-`                                                   |
| `actor_user_id` | `integer`                     | `NOT NULL`  | `-`                                                   |
| `from_state`    | `text`                        | `NULLABLE`  | `-`                                                   |
| `to_state`      | `text`                        | `NULLABLE`  | `-`                                                   |
| `note`          | `text`                        | `NULLABLE`  | `-`                                                   |
| `created_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |

### Indexes

- `expense_workflow_events_pkey`: `CREATE UNIQUE INDEX expense_workflow_events_pkey ON public.expense_workflow_events USING btree (id)`
- `idx_expense_workflow_events_event_id`: `CREATE INDEX idx_expense_workflow_events_event_id ON public.expense_workflow_events USING btree (event_id)`
- `idx_expense_workflow_events_expense_id`: `CREATE INDEX idx_expense_workflow_events_expense_id ON public.expense_workflow_events USING btree (expense_id)`

## `expenses`

- Purpose: Stores expenses records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                       | Type                          | Nullability | Default                                |
| ---------------------------- | ----------------------------- | ----------- | -------------------------------------- |
| `id`                         | `integer`                     | `NOT NULL`  | `nextval('expenses_id_seq'::regclass)` |
| `event_id`                   | `integer`                     | `NOT NULL`  | `-`                                    |
| `category_id`                | `integer`                     | `NULLABLE`  | `-`                                    |
| `title`                      | `text`                        | `NOT NULL`  | `-`                                    |
| `amount`                     | `numeric`                     | `NOT NULL`  | `-`                                    |
| `payment_status`             | `text`                        | `NULLABLE`  | `'pending'::text`                      |
| `vendor_name`                | `text`                        | `NULLABLE`  | `-`                                    |
| `notes`                      | `text`                        | `NULLABLE`  | `-`                                    |
| `created_by`                 | `integer`                     | `NULLABLE`  | `-`                                    |
| `created_at`                 | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                    |
| `updated_at`                 | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                    |
| `is_recurring`               | `boolean`                     | `NULLABLE`  | `false`                                |
| `recurrence_pattern`         | `text`                        | `NULLABLE`  | `-`                                    |
| `recurrence_end_date`        | `date`                        | `NULLABLE`  | `-`                                    |
| `is_installment`             | `boolean`                     | `NULLABLE`  | `false`                                |
| `installment_total`          | `integer`                     | `NULLABLE`  | `-`                                    |
| `installment_number`         | `integer`                     | `NULLABLE`  | `-`                                    |
| `currency_code`              | `text`                        | `NULLABLE`  | `-`                                    |
| `amount_base`                | `numeric`                     | `NULLABLE`  | `-`                                    |
| `exchange_rate`              | `numeric`                     | `NULLABLE`  | `-`                                    |
| `updated_by`                 | `integer`                     | `NULLABLE`  | `-`                                    |
| `approval_status`            | `text`                        | `NOT NULL`  | `'pending'::text`                      |
| `approval_note`              | `text`                        | `NULLABLE`  | `-`                                    |
| `approved_by`                | `integer`                     | `NULLABLE`  | `-`                                    |
| `approved_at`                | `timestamp without time zone` | `NULLABLE`  | `-`                                    |
| `reimbursement_status`       | `text`                        | `NOT NULL`  | `'not_requested'::text`                |
| `reimbursement_requested_by` | `integer`                     | `NULLABLE`  | `-`                                    |
| `reimbursement_requested_at` | `timestamp without time zone` | `NULLABLE`  | `-`                                    |
| `reimbursed_by`              | `integer`                     | `NULLABLE`  | `-`                                    |
| `reimbursed_at`              | `timestamp without time zone` | `NULLABLE`  | `-`                                    |

### Indexes

- `expenses_pkey`: `CREATE UNIQUE INDEX expenses_pkey ON public.expenses USING btree (id)`

## `gallery_albums`

- Purpose: Stores gallery albums records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                      |
| ------------- | ----------------------------- | ----------- | -------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('gallery_albums_id_seq'::regclass)` |
| `event_id`    | `integer`                     | `NOT NULL`  | `-`                                          |
| `name`        | `text`                        | `NOT NULL`  | `-`                                          |
| `description` | `text`                        | `NULLABLE`  | `-`                                          |
| `created_by`  | `integer`                     | `NULLABLE`  | `-`                                          |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |
| `updated_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `gallery_albums_pkey`: `CREATE UNIQUE INDEX gallery_albums_pkey ON public.gallery_albums USING btree (id)`
- `idx_gallery_albums_event_id`: `CREATE INDEX idx_gallery_albums_event_id ON public.gallery_albums USING btree (event_id)`

## `gallery_comments`

- Purpose: Stores gallery comments records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                        |
| ------------- | ----------------------------- | ----------- | ---------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('gallery_comments_id_seq'::regclass)` |
| `event_id`    | `integer`                     | `NOT NULL`  | `-`                                            |
| `document_id` | `integer`                     | `NOT NULL`  | `-`                                            |
| `parent_id`   | `integer`                     | `NULLABLE`  | `-`                                            |
| `user_id`     | `integer`                     | `NULLABLE`  | `-`                                            |
| `body`        | `text`                        | `NOT NULL`  | `-`                                            |
| `is_hidden`   | `boolean`                     | `NOT NULL`  | `false`                                        |
| `hidden_by`   | `integer`                     | `NULLABLE`  | `-`                                            |
| `hidden_at`   | `timestamp without time zone` | `NULLABLE`  | `-`                                            |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                            |
| `updated_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                            |
| `updated_by`  | `integer`                     | `NULLABLE`  | `-`                                            |

### Indexes

- `gallery_comments_pkey`: `CREATE UNIQUE INDEX gallery_comments_pkey ON public.gallery_comments USING btree (id)`
- `idx_gallery_comments_document_id`: `CREATE INDEX idx_gallery_comments_document_id ON public.gallery_comments USING btree (document_id)`
- `idx_gallery_comments_event_id`: `CREATE INDEX idx_gallery_comments_event_id ON public.gallery_comments USING btree (event_id)`
- `idx_gallery_comments_parent_id`: `CREATE INDEX idx_gallery_comments_parent_id ON public.gallery_comments USING btree (parent_id)`

## `gallery_share_links`

- Purpose: Stores gallery share links records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column           | Type                          | Nullability | Default                                           |
| ---------------- | ----------------------------- | ----------- | ------------------------------------------------- |
| `id`             | `integer`                     | `NOT NULL`  | `nextval('gallery_share_links_id_seq'::regclass)` |
| `event_id`       | `integer`                     | `NOT NULL`  | `-`                                               |
| `album_id`       | `integer`                     | `NULLABLE`  | `-`                                               |
| `token`          | `text`                        | `NOT NULL`  | `-`                                               |
| `password_hash`  | `text`                        | `NULLABLE`  | `-`                                               |
| `allow_download` | `boolean`                     | `NOT NULL`  | `true`                                            |
| `expires_at`     | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `view_count`     | `integer`                     | `NOT NULL`  | `0`                                               |
| `last_viewed_at` | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `revoked_at`     | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `created_by`     | `integer`                     | `NULLABLE`  | `-`                                               |
| `created_at`     | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |
| `updated_at`     | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |

### Indexes

- `gallery_share_links_pkey`: `CREATE UNIQUE INDEX gallery_share_links_pkey ON public.gallery_share_links USING btree (id)`
- `gallery_share_links_token_key`: `CREATE UNIQUE INDEX gallery_share_links_token_key ON public.gallery_share_links USING btree (token)`
- `idx_gallery_share_links_album_id`: `CREATE INDEX idx_gallery_share_links_album_id ON public.gallery_share_links USING btree (album_id)`
- `idx_gallery_share_links_event_id`: `CREATE INDEX idx_gallery_share_links_event_id ON public.gallery_share_links USING btree (event_id)`
- `idx_gallery_share_links_token_active`: `CREATE INDEX idx_gallery_share_links_token_active ON public.gallery_share_links USING btree (token) WHERE (revoked_at IS NULL)`

## `gallery_slideshows`

- Purpose: Stores gallery slideshows records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                          |
| ------------ | ----------------------------- | ----------- | ------------------------------------------------ |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('gallery_slideshows_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                              |
| `name`       | `text`                        | `NOT NULL`  | `-`                                              |
| `created_by` | `integer`                     | `NULLABLE`  | `-`                                              |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                              |
| `updated_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                              |

### Indexes

- `gallery_slideshows_pkey`: `CREATE UNIQUE INDEX gallery_slideshows_pkey ON public.gallery_slideshows USING btree (id)`
- `idx_gallery_slideshows_event_id`: `CREATE INDEX idx_gallery_slideshows_event_id ON public.gallery_slideshows USING btree (event_id)`

## `guest_merge_audit`

- Purpose: Stores guest merge audit records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column              | Type                          | Nullability | Default                                         |
| ------------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`                | `integer`                     | `NOT NULL`  | `nextval('guest_merge_audit_id_seq'::regclass)` |
| `event_id`          | `integer`                     | `NOT NULL`  | `-`                                             |
| `surviving_rsvp_id` | `integer`                     | `NULLABLE`  | `-`                                             |
| `merged_rsvp_id`    | `integer`                     | `NOT NULL`  | `-`                                             |
| `merged_email`      | `text`                        | `NOT NULL`  | `-`                                             |
| `merged_name`       | `text`                        | `NOT NULL`  | `-`                                             |
| `merged_snapshot`   | `jsonb`                       | `NOT NULL`  | `-`                                             |
| `merged_by`         | `integer`                     | `NULLABLE`  | `-`                                             |
| `merged_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |
| `notes`             | `text`                        | `NULLABLE`  | `-`                                             |

### Indexes

- `guest_merge_audit_pkey`: `CREATE UNIQUE INDEX guest_merge_audit_pkey ON public.guest_merge_audit USING btree (id)`
- `idx_guest_merge_audit_event_id`: `CREATE INDEX idx_guest_merge_audit_event_id ON public.guest_merge_audit USING btree (event_id)`
- `idx_guest_merge_audit_surviving`: `CREATE INDEX idx_guest_merge_audit_surviving ON public.guest_merge_audit USING btree (surviving_rsvp_id)`

## `notifications`

- Purpose: Stores notifications records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                     |
| ------------ | ----------------------------- | ----------- | ------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('notifications_id_seq'::regclass)` |
| `user_id`    | `integer`                     | `NOT NULL`  | `-`                                         |
| `type`       | `text`                        | `NOT NULL`  | `-`                                         |
| `title`      | `text`                        | `NOT NULL`  | `-`                                         |
| `body`       | `text`                        | `NULLABLE`  | `-`                                         |
| `link`       | `text`                        | `NULLABLE`  | `-`                                         |
| `is_read`    | `boolean`                     | `NULLABLE`  | `false`                                     |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                         |

### Indexes

- `notifications_pkey`: `CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)`

## `password_reset_rate_limit`

- Purpose: Stores password reset rate limit records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                                                 |
| --------------- | ----------------------------- | ----------- | ------------------------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('password_reset_rate_limit_id_seq'::regclass)` |
| `email`         | `text`                        | `NOT NULL`  | `-`                                                     |
| `request_count` | `integer`                     | `NULLABLE`  | `1`                                                     |
| `window_start`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                     |

### Indexes

- `password_reset_rate_limit_email_key`: `CREATE UNIQUE INDEX password_reset_rate_limit_email_key ON public.password_reset_rate_limit USING btree (email)`
- `password_reset_rate_limit_pkey`: `CREATE UNIQUE INDEX password_reset_rate_limit_pkey ON public.password_reset_rate_limit USING btree (id)`

## `password_reset_tokens`

- Purpose: Stores password reset tokens records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column           | Type                          | Nullability | Default                                             |
| ---------------- | ----------------------------- | ----------- | --------------------------------------------------- |
| `id`             | `integer`                     | `NOT NULL`  | `nextval('password_reset_tokens_id_seq'::regclass)` |
| `user_id`        | `integer`                     | `NULLABLE`  | `-`                                                 |
| `email`          | `text`                        | `NOT NULL`  | `-`                                                 |
| `token_selector` | `text`                        | `NOT NULL`  | `''::text`                                          |
| `token`          | `text`                        | `NOT NULL`  | `-`                                                 |
| `expires_at`     | `timestamp without time zone` | `NOT NULL`  | `-`                                                 |
| `used`           | `integer`                     | `NULLABLE`  | `0`                                                 |
| `used_at`        | `timestamp without time zone` | `NULLABLE`  | `-`                                                 |
| `created_at`     | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                 |

### Indexes

- `password_reset_tokens_pkey`: `CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id)`
- `password_reset_tokens_token_key`: `CREATE UNIQUE INDEX password_reset_tokens_token_key ON public.password_reset_tokens USING btree (token)`

## `permissions`

- Purpose: Stores permissions records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                   |
| ------------- | ----------------------------- | ----------- | ----------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('permissions_id_seq'::regclass)` |
| `name`        | `text`                        | `NOT NULL`  | `-`                                       |
| `description` | `text`                        | `NULLABLE`  | `-`                                       |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                       |

### Indexes

- `permissions_name_key`: `CREATE UNIQUE INDEX permissions_name_key ON public.permissions USING btree (name)`
- `permissions_pkey`: `CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id)`

## `role_permissions`

- Purpose: Stores role permissions records for festival planner workflows.
- Primary key: `role_id, permission_id`
- RLS: `disabled`

### Columns

| Column          | Type      | Nullability | Default |
| --------------- | --------- | ----------- | ------- |
| `role_id`       | `integer` | `NOT NULL`  | `-`     |
| `permission_id` | `integer` | `NOT NULL`  | `-`     |

### Indexes

- `role_permissions_pkey`: `CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_id, permission_id)`

## `roles`

- Purpose: Stores roles records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                             |
| ------------- | ----------------------------- | ----------- | ----------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('roles_id_seq'::regclass)` |
| `name`        | `text`                        | `NOT NULL`  | `-`                                 |
| `description` | `text`                        | `NULLABLE`  | `-`                                 |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |

### Indexes

- `roles_name_key`: `CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name)`
- `roles_pkey`: `CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)`

## `rsvp_access_tokens`

- Purpose: Stores rsvp access tokens records for festival planner workflows.
- Primary key: `rsvp_id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default             |
| ------------ | ----------------------------- | ----------- | ------------------- |
| `rsvp_id`    | `integer`                     | `NOT NULL`  | `-`                 |
| `token`      | `text`                        | `NOT NULL`  | `-`                 |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP` |
| `revoked_at` | `timestamp without time zone` | `NULLABLE`  | `-`                 |

### Indexes

- `idx_rsvp_access_tokens_token`: `CREATE INDEX idx_rsvp_access_tokens_token ON public.rsvp_access_tokens USING btree (token) WHERE (revoked_at IS NULL)`
- `rsvp_access_tokens_pkey`: `CREATE UNIQUE INDEX rsvp_access_tokens_pkey ON public.rsvp_access_tokens USING btree (rsvp_id)`
- `rsvp_access_tokens_token_key`: `CREATE UNIQUE INDEX rsvp_access_tokens_token_key ON public.rsvp_access_tokens USING btree (token)`

## `rsvp_question_responses`

- Purpose: Stores rsvp question responses records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                               |
| ------------- | ----------------------------- | ----------- | ----------------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('rsvp_question_responses_id_seq'::regclass)` |
| `rsvp_id`     | `integer`                     | `NOT NULL`  | `-`                                                   |
| `question_id` | `integer`                     | `NOT NULL`  | `-`                                                   |
| `response`    | `text`                        | `NULLABLE`  | `-`                                                   |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |
| `updated_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                   |

### Indexes

- `idx_rsvp_question_responses_rsvp`: `CREATE INDEX idx_rsvp_question_responses_rsvp ON public.rsvp_question_responses USING btree (rsvp_id)`
- `rsvp_question_responses_pkey`: `CREATE UNIQUE INDEX rsvp_question_responses_pkey ON public.rsvp_question_responses USING btree (id)`
- `rsvp_question_responses_rsvp_id_question_id_key`: `CREATE UNIQUE INDEX rsvp_question_responses_rsvp_id_question_id_key ON public.rsvp_question_responses USING btree (rsvp_id, question_id)`

## `rsvp_questions`

- Purpose: Stores rsvp questions records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                                      |
| --------------- | ----------------------------- | ----------- | -------------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('rsvp_questions_id_seq'::regclass)` |
| `event_id`      | `integer`                     | `NOT NULL`  | `-`                                          |
| `prompt`        | `text`                        | `NOT NULL`  | `-`                                          |
| `question_type` | `text`                        | `NOT NULL`  | `-`                                          |
| `options`       | `jsonb`                       | `NULLABLE`  | `-`                                          |
| `required`      | `boolean`                     | `NULLABLE`  | `false`                                      |
| `sort_order`    | `integer`                     | `NULLABLE`  | `0`                                          |
| `created_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |
| `updated_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `idx_rsvp_questions_event_id`: `CREATE INDEX idx_rsvp_questions_event_id ON public.rsvp_questions USING btree (event_id)`
- `rsvp_questions_pkey`: `CREATE UNIQUE INDEX rsvp_questions_pkey ON public.rsvp_questions USING btree (id)`

## `rsvps`

- Purpose: Stores rsvps records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                    | Type                          | Nullability | Default                             |
| ------------------------- | ----------------------------- | ----------- | ----------------------------------- |
| `id`                      | `integer`                     | `NOT NULL`  | `nextval('rsvps_id_seq'::regclass)` |
| `event_id`                | `integer`                     | `NOT NULL`  | `-`                                 |
| `name`                    | `text`                        | `NOT NULL`  | `-`                                 |
| `email`                   | `text`                        | `NOT NULL`  | `-`                                 |
| `guests`                  | `integer`                     | `NULLABLE`  | `1`                                 |
| `status`                  | `text`                        | `NULLABLE`  | `'Pending'::text`                   |
| `notes`                   | `text`                        | `NULLABLE`  | `-`                                 |
| `source`                  | `text`                        | `NULLABLE`  | `'public'::text`                    |
| `created_at`              | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |
| `updated_at`              | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |
| `checked_in`              | `boolean`                     | `NULLABLE`  | `false`                             |
| `checked_in_at`           | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `phone`                   | `text`                        | `NULLABLE`  | `-`                                 |
| `dietary_restriction`     | `text`                        | `NULLABLE`  | `'None'::text`                      |
| `accessibility_needs`     | `text`                        | `NULLABLE`  | `-`                                 |
| `plus_one`                | `boolean`                     | `NULLABLE`  | `false`                             |
| `plus_one_name`           | `text`                        | `NULLABLE`  | `-`                                 |
| `guest_group`             | `text`                        | `NULLABLE`  | `-`                                 |
| `rsvp_deadline`           | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `waitlist_position`       | `integer`                     | `NULLABLE`  | `-`                                 |
| `waitlisted_at`           | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `promoted_at`             | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `address_line1`           | `text`                        | `NULLABLE`  | `-`                                 |
| `address_line2`           | `text`                        | `NULLABLE`  | `-`                                 |
| `city`                    | `text`                        | `NULLABLE`  | `-`                                 |
| `state_region`            | `text`                        | `NULLABLE`  | `-`                                 |
| `postal_code`             | `text`                        | `NULLABLE`  | `-`                                 |
| `country`                 | `text`                        | `NULLABLE`  | `-`                                 |
| `company`                 | `text`                        | `NULLABLE`  | `-`                                 |
| `title`                   | `text`                        | `NULLABLE`  | `-`                                 |
| `relation_type`           | `text`                        | `NULLABLE`  | `-`                                 |
| `age_group`               | `text`                        | `NULLABLE`  | `-`                                 |
| `emergency_contact_name`  | `text`                        | `NULLABLE`  | `-`                                 |
| `emergency_contact_phone` | `text`                        | `NULLABLE`  | `-`                                 |
| `profile_completeness`    | `integer`                     | `NULLABLE`  | `0`                                 |
| `canonical_status`        | `text`                        | `NULLABLE`  | `-`                                 |
| `meal_choice`             | `text`                        | `NULLABLE`  | `-`                                 |
| `meal_options_locked`     | `boolean`                     | `NULLABLE`  | `false`                             |
| `late_arrival`            | `boolean`                     | `NULLABLE`  | `false`                             |
| `arrival_delay_minutes`   | `integer`                     | `NULLABLE`  | `-`                                 |
| `unsubscribed_at`         | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `unsubscribe_token`       | `text`                        | `NULLABLE`  | `-`                                 |
| `seating_group_id`        | `integer`                     | `NULLABLE`  | `-`                                 |

### Indexes

- `idx_rsvps_canonical_status`: `CREATE INDEX idx_rsvps_canonical_status ON public.rsvps USING btree (event_id, canonical_status)`
- `idx_rsvps_event_waitlist`: `CREATE INDEX idx_rsvps_event_waitlist ON public.rsvps USING btree (event_id, waitlist_position) WHERE (waitlist_position IS NOT NULL)`
- `idx_rsvps_seating_group`: `CREATE INDEX idx_rsvps_seating_group ON public.rsvps USING btree (seating_group_id)`
- `idx_rsvps_unsubscribe_token`: `CREATE UNIQUE INDEX idx_rsvps_unsubscribe_token ON public.rsvps USING btree (unsubscribe_token) WHERE (unsubscribe_token IS NOT NULL)`
- `rsvps_event_id_email_key`: `CREATE UNIQUE INDEX rsvps_event_id_email_key ON public.rsvps USING btree (event_id, email)`
- `rsvps_pkey`: `CREATE UNIQUE INDEX rsvps_pkey ON public.rsvps USING btree (id)`

## `scheduled_report_deliveries`

- Purpose: Stores scheduled report deliveries records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                                                   |
| --------------- | ----------------------------- | ----------- | --------------------------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('scheduled_report_deliveries_id_seq'::regclass)` |
| `report_id`     | `integer`                     | `NOT NULL`  | `-`                                                       |
| `delivered_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                       |
| `recipients`    | `jsonb`                       | `NOT NULL`  | `'[]'::jsonb`                                             |
| `status`        | `text`                        | `NOT NULL`  | `-`                                                       |
| `error_message` | `text`                        | `NULLABLE`  | `-`                                                       |
| `payload_kind`  | `text`                        | `NOT NULL`  | `'json'::text`                                            |

### Indexes

- `idx_scheduled_report_deliveries_report_id`: `CREATE INDEX idx_scheduled_report_deliveries_report_id ON public.scheduled_report_deliveries USING btree (report_id)`
- `scheduled_report_deliveries_pkey`: `CREATE UNIQUE INDEX scheduled_report_deliveries_pkey ON public.scheduled_report_deliveries USING btree (id)`

## `scheduled_reports`

- Purpose: Stores scheduled reports records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                         |
| ------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('scheduled_reports_id_seq'::regclass)` |
| `event_id`    | `integer`                     | `NULLABLE`  | `-`                                             |
| `report_type` | `text`                        | `NOT NULL`  | `-`                                             |
| `frequency`   | `text`                        | `NOT NULL`  | `-`                                             |
| `recipients`  | `jsonb`                       | `NOT NULL`  | `'[]'::jsonb`                                   |
| `filters`     | `jsonb`                       | `NULLABLE`  | `-`                                             |
| `next_run_at` | `timestamp without time zone` | `NULLABLE`  | `-`                                             |
| `last_run_at` | `timestamp without time zone` | `NULLABLE`  | `-`                                             |
| `is_active`   | `boolean`                     | `NOT NULL`  | `true`                                          |
| `created_by`  | `integer`                     | `NULLABLE`  | `-`                                             |
| `updated_by`  | `integer`                     | `NULLABLE`  | `-`                                             |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |
| `updated_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |

### Indexes

- `idx_scheduled_reports_due`: `CREATE INDEX idx_scheduled_reports_due ON public.scheduled_reports USING btree (next_run_at) WHERE (is_active = true)`
- `idx_scheduled_reports_event_id`: `CREATE INDEX idx_scheduled_reports_event_id ON public.scheduled_reports USING btree (event_id)`
- `scheduled_reports_pkey`: `CREATE UNIQUE INDEX scheduled_reports_pkey ON public.scheduled_reports USING btree (id)`

## `seating_assignments`

- Purpose: Stores seating assignments records for festival planner workflows.
- Primary key: `table_id, rsvp_id`
- RLS: `disabled`

### Columns

| Column     | Type      | Nullability | Default |
| ---------- | --------- | ----------- | ------- |
| `table_id` | `integer` | `NOT NULL`  | `-`     |
| `rsvp_id`  | `integer` | `NOT NULL`  | `-`     |

### Indexes

- `seating_assignments_pkey`: `CREATE UNIQUE INDEX seating_assignments_pkey ON public.seating_assignments USING btree (table_id, rsvp_id)`

## `seating_groups`

- Purpose: Stores seating groups records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column               | Type                          | Nullability | Default                                      |
| -------------------- | ----------------------------- | ----------- | -------------------------------------------- |
| `id`                 | `integer`                     | `NOT NULL`  | `nextval('seating_groups_id_seq'::regclass)` |
| `event_id`           | `integer`                     | `NOT NULL`  | `-`                                          |
| `name`               | `text`                        | `NOT NULL`  | `-`                                          |
| `seat_together`      | `boolean`                     | `NULLABLE`  | `true`                                       |
| `preferred_table_id` | `integer`                     | `NULLABLE`  | `-`                                          |
| `notes`              | `text`                        | `NULLABLE`  | `-`                                          |
| `created_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |
| `updated_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `seating_groups_event_id_name_key`: `CREATE UNIQUE INDEX seating_groups_event_id_name_key ON public.seating_groups USING btree (event_id, name)`
- `seating_groups_pkey`: `CREATE UNIQUE INDEX seating_groups_pkey ON public.seating_groups USING btree (id)`

## `seating_tables`

- Purpose: Stores seating tables records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                      |
| ------------ | ----------------------------- | ----------- | -------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('seating_tables_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                          |
| `name`       | `text`                        | `NOT NULL`  | `-`                                          |
| `capacity`   | `integer`                     | `NULLABLE`  | `8`                                          |
| `layout_x`   | `integer`                     | `NULLABLE`  | `-`                                          |
| `layout_y`   | `integer`                     | `NULLABLE`  | `-`                                          |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `seating_tables_pkey`: `CREATE UNIQUE INDEX seating_tables_pkey ON public.seating_tables USING btree (id)`

## `sessions`

- Purpose: Stores sessions records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                                |
| --------------- | ----------------------------- | ----------- | -------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('sessions_id_seq'::regclass)` |
| `user_id`       | `integer`                     | `NOT NULL`  | `-`                                    |
| `token`         | `text`                        | `NOT NULL`  | `-`                                    |
| `refresh_token` | `text`                        | `NOT NULL`  | `-`                                    |
| `expires_at`    | `timestamp without time zone` | `NOT NULL`  | `-`                                    |
| `last_activity` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                    |
| `created_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                    |

### Indexes

- `sessions_pkey`: `CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id)`
- `sessions_refresh_token_key`: `CREATE UNIQUE INDEX sessions_refresh_token_key ON public.sessions USING btree (refresh_token)`
- `sessions_token_key`: `CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token)`

## `shopping_items`

- Purpose: Stores shopping items records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column           | Type                          | Nullability | Default                                      |
| ---------------- | ----------------------------- | ----------- | -------------------------------------------- |
| `id`             | `integer`                     | `NOT NULL`  | `nextval('shopping_items_id_seq'::regclass)` |
| `list_id`        | `integer`                     | `NOT NULL`  | `-`                                          |
| `name`           | `text`                        | `NOT NULL`  | `-`                                          |
| `quantity`       | `integer`                     | `NULLABLE`  | `1`                                          |
| `unit`           | `text`                        | `NULLABLE`  | `-`                                          |
| `estimated_cost` | `numeric`                     | `NULLABLE`  | `-`                                          |
| `actual_cost`    | `numeric`                     | `NULLABLE`  | `-`                                          |
| `status`         | `text`                        | `NULLABLE`  | `'Needed'::text`                             |
| `assigned_to`    | `integer`                     | `NULLABLE`  | `-`                                          |
| `notes`          | `text`                        | `NULLABLE`  | `-`                                          |
| `created_at`     | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `shopping_items_pkey`: `CREATE UNIQUE INDEX shopping_items_pkey ON public.shopping_items USING btree (id)`

## `shopping_lists`

- Purpose: Stores shopping lists records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                      |
| ------------ | ----------------------------- | ----------- | -------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('shopping_lists_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                          |
| `name`       | `text`                        | `NOT NULL`  | `-`                                          |
| `created_by` | `integer`                     | `NULLABLE`  | `-`                                          |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `shopping_lists_pkey`: `CREATE UNIQUE INDEX shopping_lists_pkey ON public.shopping_lists USING btree (id)`

## `slideshow_items`

- Purpose: Stores slideshow items records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column         | Type      | Nullability | Default                                       |
| -------------- | --------- | ----------- | --------------------------------------------- |
| `id`           | `integer` | `NOT NULL`  | `nextval('slideshow_items_id_seq'::regclass)` |
| `slideshow_id` | `integer` | `NOT NULL`  | `-`                                           |
| `document_id`  | `integer` | `NOT NULL`  | `-`                                           |
| `sort_order`   | `integer` | `NOT NULL`  | `0`                                           |

### Indexes

- `idx_slideshow_items_slideshow_id`: `CREATE INDEX idx_slideshow_items_slideshow_id ON public.slideshow_items USING btree (slideshow_id)`
- `slideshow_items_pkey`: `CREATE UNIQUE INDEX slideshow_items_pkey ON public.slideshow_items USING btree (id)`
- `slideshow_items_slideshow_id_document_id_key`: `CREATE UNIQUE INDEX slideshow_items_slideshow_id_document_id_key ON public.slideshow_items USING btree (slideshow_id, document_id)`

## `store_suggestions`

- Purpose: Stores store suggestions records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column         | Type                          | Nullability | Default                                         |
| -------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`           | `integer`                     | `NOT NULL`  | `nextval('store_suggestions_id_seq'::regclass)` |
| `event_id`     | `integer`                     | `NOT NULL`  | `-`                                             |
| `name`         | `text`                        | `NOT NULL`  | `-`                                             |
| `website`      | `text`                        | `NULLABLE`  | `-`                                             |
| `notes`        | `text`                        | `NULLABLE`  | `-`                                             |
| `category`     | `text`                        | `NULLABLE`  | `-`                                             |
| `suggested_by` | `integer`                     | `NULLABLE`  | `-`                                             |
| `status`       | `text`                        | `NULLABLE`  | `'pending'::text`                               |
| `created_at`   | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |
| `updated_at`   | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |

### Indexes

- `idx_store_suggestions_event_id`: `CREATE INDEX idx_store_suggestions_event_id ON public.store_suggestions USING btree (event_id)`
- `idx_store_suggestions_unique`: `CREATE UNIQUE INDEX idx_store_suggestions_unique ON public.store_suggestions USING btree (event_id, lower(name))`
- `store_suggestions_pkey`: `CREATE UNIQUE INDEX store_suggestions_pkey ON public.store_suggestions USING btree (id)`

## `task_comments`

- Purpose: Stores task comments records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                     |
| ------------ | ----------------------------- | ----------- | ------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('task_comments_id_seq'::regclass)` |
| `task_id`    | `integer`                     | `NOT NULL`  | `-`                                         |
| `user_id`    | `integer`                     | `NOT NULL`  | `-`                                         |
| `body`       | `text`                        | `NOT NULL`  | `-`                                         |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                         |

### Indexes

- `idx_task_comments_task_id`: `CREATE INDEX idx_task_comments_task_id ON public.task_comments USING btree (task_id)`
- `task_comments_pkey`: `CREATE UNIQUE INDEX task_comments_pkey ON public.task_comments USING btree (id)`

## `task_dependencies`

- Purpose: Stores task dependencies records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                                         |
| --------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('task_dependencies_id_seq'::regclass)` |
| `task_id`       | `integer`                     | `NOT NULL`  | `-`                                             |
| `depends_on_id` | `integer`                     | `NOT NULL`  | `-`                                             |
| `created_by`    | `integer`                     | `NULLABLE`  | `-`                                             |
| `created_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |

### Indexes

- `idx_task_dependencies_depends_on_id`: `CREATE INDEX idx_task_dependencies_depends_on_id ON public.task_dependencies USING btree (depends_on_id)`
- `idx_task_dependencies_task_id`: `CREATE INDEX idx_task_dependencies_task_id ON public.task_dependencies USING btree (task_id)`
- `task_dependencies_pkey`: `CREATE UNIQUE INDEX task_dependencies_pkey ON public.task_dependencies USING btree (id)`
- `task_dependencies_task_id_depends_on_id_key`: `CREATE UNIQUE INDEX task_dependencies_task_id_depends_on_id_key ON public.task_dependencies USING btree (task_id, depends_on_id)`

## `task_subtasks`

- Purpose: Stores task subtasks records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                     |
| ------------ | ----------------------------- | ----------- | ------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('task_subtasks_id_seq'::regclass)` |
| `task_id`    | `integer`                     | `NOT NULL`  | `-`                                         |
| `title`      | `text`                        | `NOT NULL`  | `-`                                         |
| `completed`  | `boolean`                     | `NULLABLE`  | `false`                                     |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                         |

### Indexes

- `idx_task_subtasks_task_id`: `CREATE INDEX idx_task_subtasks_task_id ON public.task_subtasks USING btree (task_id)`
- `task_subtasks_pkey`: `CREATE UNIQUE INDEX task_subtasks_pkey ON public.task_subtasks USING btree (id)`

## `task_templates`

- Purpose: Stores task templates records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column            | Type                          | Nullability | Default                                      |
| ----------------- | ----------------------------- | ----------- | -------------------------------------------- |
| `id`              | `integer`                     | `NOT NULL`  | `nextval('task_templates_id_seq'::regclass)` |
| `event_id`        | `integer`                     | `NOT NULL`  | `-`                                          |
| `name`            | `text`                        | `NOT NULL`  | `-`                                          |
| `description`     | `text`                        | `NULLABLE`  | `-`                                          |
| `priority`        | `text`                        | `NULLABLE`  | `'Medium'::text`                             |
| `estimated_hours` | `numeric`                     | `NULLABLE`  | `-`                                          |
| `created_by`      | `integer`                     | `NULLABLE`  | `-`                                          |
| `created_at`      | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                          |

### Indexes

- `idx_task_templates_event_id`: `CREATE INDEX idx_task_templates_event_id ON public.task_templates USING btree (event_id)`
- `task_templates_pkey`: `CREATE UNIQUE INDEX task_templates_pkey ON public.task_templates USING btree (id)`

## `task_time_entries`

- Purpose: Stores task time entries records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column        | Type                          | Nullability | Default                                         |
| ------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `id`          | `integer`                     | `NOT NULL`  | `nextval('task_time_entries_id_seq'::regclass)` |
| `task_id`     | `integer`                     | `NOT NULL`  | `-`                                             |
| `user_id`     | `integer`                     | `NOT NULL`  | `-`                                             |
| `hours_spent` | `numeric`                     | `NOT NULL`  | `-`                                             |
| `notes`       | `text`                        | `NULLABLE`  | `-`                                             |
| `logged_at`   | `date`                        | `NOT NULL`  | `CURRENT_DATE`                                  |
| `created_at`  | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                             |

### Indexes

- `idx_task_time_entries_task_id`: `CREATE INDEX idx_task_time_entries_task_id ON public.task_time_entries USING btree (task_id)`
- `task_time_entries_pkey`: `CREATE UNIQUE INDEX task_time_entries_pkey ON public.task_time_entries USING btree (id)`

## `tasks`

- Purpose: Stores tasks records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                | Type                          | Nullability | Default                             |
| --------------------- | ----------------------------- | ----------- | ----------------------------------- |
| `id`                  | `integer`                     | `NOT NULL`  | `nextval('tasks_id_seq'::regclass)` |
| `event_id`            | `integer`                     | `NOT NULL`  | `-`                                 |
| `title`               | `text`                        | `NOT NULL`  | `-`                                 |
| `notes`               | `text`                        | `NULLABLE`  | `-`                                 |
| `assignee_name`       | `text`                        | `NULLABLE`  | `-`                                 |
| `assigned_user_id`    | `integer`                     | `NULLABLE`  | `-`                                 |
| `due_date`            | `text`                        | `NULLABLE`  | `-`                                 |
| `status`              | `text`                        | `NULLABLE`  | `'Pending'::text`                   |
| `priority`            | `text`                        | `NULLABLE`  | `'Medium'::text`                    |
| `created_by`          | `integer`                     | `NULLABLE`  | `-`                                 |
| `created_at`          | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |
| `updated_at`          | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |
| `description`         | `text`                        | `NULLABLE`  | `-`                                 |
| `estimated_hours`     | `numeric`                     | `NULLABLE`  | `-`                                 |
| `is_recurring`        | `boolean`                     | `NULLABLE`  | `false`                             |
| `recurrence_pattern`  | `text`                        | `NULLABLE`  | `-`                                 |
| `recurrence_end_date` | `text`                        | `NULLABLE`  | `-`                                 |
| `template_id`         | `integer`                     | `NULLABLE`  | `-`                                 |

### Indexes

- `tasks_pkey`: `CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id)`

## `timeline_activities`

- Purpose: Stores timeline activities records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column               | Type                          | Nullability | Default                                           |
| -------------------- | ----------------------------- | ----------- | ------------------------------------------------- |
| `id`                 | `integer`                     | `NOT NULL`  | `nextval('timeline_activities_id_seq'::regclass)` |
| `event_id`           | `integer`                     | `NOT NULL`  | `-`                                               |
| `title`              | `text`                        | `NOT NULL`  | `-`                                               |
| `description`        | `text`                        | `NULLABLE`  | `-`                                               |
| `start_time`         | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `end_time`           | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `location`           | `text`                        | `NULLABLE`  | `-`                                               |
| `vendor_id`          | `integer`                     | `NULLABLE`  | `-`                                               |
| `sort_order`         | `integer`                     | `NULLABLE`  | `0`                                               |
| `created_by`         | `integer`                     | `NULLABLE`  | `-`                                               |
| `created_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |
| `updated_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                               |
| `planned_start_time` | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `planned_end_time`   | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `actual_start_time`  | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `actual_end_time`    | `timestamp without time zone` | `NULLABLE`  | `-`                                               |
| `status`             | `text`                        | `NULLABLE`  | `'planned'::text`                                 |

### Indexes

- `timeline_activities_pkey`: `CREATE UNIQUE INDEX timeline_activities_pkey ON public.timeline_activities USING btree (id)`

## `user_profiles`

- Purpose: Stores user profiles records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column              | Type                          | Nullability | Default                                     |
| ------------------- | ----------------------------- | ----------- | ------------------------------------------- |
| `id`                | `integer`                     | `NOT NULL`  | `nextval('user_profiles_id_seq'::regclass)` |
| `user_id`           | `integer`                     | `NOT NULL`  | `-`                                         |
| `bio`               | `text`                        | `NULLABLE`  | `-`                                         |
| `phone_number`      | `text`                        | `NULLABLE`  | `-`                                         |
| `profile_photo_url` | `text`                        | `NULLABLE`  | `-`                                         |
| `address`           | `text`                        | `NULLABLE`  | `-`                                         |
| `city`              | `text`                        | `NULLABLE`  | `-`                                         |
| `state`             | `text`                        | `NULLABLE`  | `-`                                         |
| `zip_code`          | `text`                        | `NULLABLE`  | `-`                                         |
| `country`           | `text`                        | `NULLABLE`  | `-`                                         |
| `created_at`        | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                         |
| `updated_at`        | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                         |

### Indexes

- `user_profiles_pkey`: `CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id)`
- `user_profiles_user_id_key`: `CREATE UNIQUE INDEX user_profiles_user_id_key ON public.user_profiles USING btree (user_id)`

## `users`

- Purpose: Stores users records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column                       | Type                          | Nullability | Default                             |
| ---------------------------- | ----------------------------- | ----------- | ----------------------------------- |
| `id`                         | `integer`                     | `NOT NULL`  | `nextval('users_id_seq'::regclass)` |
| `email`                      | `text`                        | `NOT NULL`  | `-`                                 |
| `password_hash`              | `text`                        | `NOT NULL`  | `-`                                 |
| `display_name`               | `text`                        | `NOT NULL`  | `-`                                 |
| `email_verified`             | `integer`                     | `NULLABLE`  | `0`                                 |
| `email_verified_at`          | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `email_verification_token`   | `text`                        | `NULLABLE`  | `-`                                 |
| `pending_email`              | `text`                        | `NULLABLE`  | `-`                                 |
| `pending_email_token`        | `text`                        | `NULLABLE`  | `-`                                 |
| `pending_email_token_expiry` | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `role_id`                    | `integer`                     | `NULLABLE`  | `1`                                 |
| `account_locked`             | `integer`                     | `NULLABLE`  | `0`                                 |
| `locked_until`               | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `login_attempts`             | `integer`                     | `NULLABLE`  | `0`                                 |
| `created_at`                 | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |
| `updated_at`                 | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                 |
| `deleted_at`                 | `timestamp without time zone` | `NULLABLE`  | `-`                                 |
| `entra_oid`                  | `text`                        | `NULLABLE`  | `-`                                 |
| `auth_provider`              | `text`                        | `NULLABLE`  | `'local'::text`                     |

### Indexes

- `idx_users_entra_oid`: `CREATE UNIQUE INDEX idx_users_entra_oid ON public.users USING btree (entra_oid) WHERE (entra_oid IS NOT NULL)`
- `users_email_key`: `CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)`
- `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)`

## `vendor_bookings`

- Purpose: Stores vendor bookings records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column               | Type                          | Nullability | Default                                       |
| -------------------- | ----------------------------- | ----------- | --------------------------------------------- |
| `id`                 | `integer`                     | `NOT NULL`  | `nextval('vendor_bookings_id_seq'::regclass)` |
| `event_id`           | `integer`                     | `NOT NULL`  | `-`                                           |
| `vendor_id`          | `integer`                     | `NOT NULL`  | `-`                                           |
| `status`             | `text`                        | `NOT NULL`  | `'requested'::text`                           |
| `contract_signed_at` | `timestamp without time zone` | `NULLABLE`  | `-`                                           |
| `service_start_at`   | `timestamp without time zone` | `NULLABLE`  | `-`                                           |
| `service_end_at`     | `timestamp without time zone` | `NULLABLE`  | `-`                                           |
| `total_amount`       | `numeric`                     | `NULLABLE`  | `-`                                           |
| `currency_code`      | `text`                        | `NULLABLE`  | `'USD'::text`                                 |
| `notes`              | `text`                        | `NULLABLE`  | `-`                                           |
| `created_by`         | `integer`                     | `NULLABLE`  | `-`                                           |
| `updated_by`         | `integer`                     | `NULLABLE`  | `-`                                           |
| `created_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                           |
| `updated_at`         | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                           |

### Indexes

- `idx_vendor_bookings_event_id`: `CREATE INDEX idx_vendor_bookings_event_id ON public.vendor_bookings USING btree (event_id)`
- `idx_vendor_bookings_vendor_id`: `CREATE INDEX idx_vendor_bookings_vendor_id ON public.vendor_bookings USING btree (vendor_id)`
- `vendor_bookings_event_id_vendor_id_key`: `CREATE UNIQUE INDEX vendor_bookings_event_id_vendor_id_key ON public.vendor_bookings USING btree (event_id, vendor_id)`
- `vendor_bookings_pkey`: `CREATE UNIQUE INDEX vendor_bookings_pkey ON public.vendor_bookings USING btree (id)`

## `vendor_communication_log`

- Purpose: Stores vendor communication log records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                                |
| ------------ | ----------------------------- | ----------- | ------------------------------------------------------ |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('vendor_communication_log_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                                    |
| `vendor_id`  | `integer`                     | `NOT NULL`  | `-`                                                    |
| `type`       | `text`                        | `NOT NULL`  | `-`                                                    |
| `subject`    | `text`                        | `NOT NULL`  | `-`                                                    |
| `body`       | `text`                        | `NULLABLE`  | `-`                                                    |
| `sent_by`    | `integer`                     | `NULLABLE`  | `-`                                                    |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                    |

### Indexes

- `idx_vendor_comm_log_event_id`: `CREATE INDEX idx_vendor_comm_log_event_id ON public.vendor_communication_log USING btree (event_id)`
- `idx_vendor_comm_log_vendor_id`: `CREATE INDEX idx_vendor_comm_log_vendor_id ON public.vendor_communication_log USING btree (vendor_id)`
- `vendor_communication_log_pkey`: `CREATE UNIQUE INDEX vendor_communication_log_pkey ON public.vendor_communication_log USING btree (id)`

## `vendor_favorites`

- Purpose: Stores vendor favorites records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column       | Type                          | Nullability | Default                                        |
| ------------ | ----------------------------- | ----------- | ---------------------------------------------- |
| `id`         | `integer`                     | `NOT NULL`  | `nextval('vendor_favorites_id_seq'::regclass)` |
| `event_id`   | `integer`                     | `NOT NULL`  | `-`                                            |
| `vendor_id`  | `integer`                     | `NOT NULL`  | `-`                                            |
| `user_id`    | `integer`                     | `NOT NULL`  | `-`                                            |
| `created_at` | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                            |

### Indexes

- `idx_vendor_favorites_event_id`: `CREATE INDEX idx_vendor_favorites_event_id ON public.vendor_favorites USING btree (event_id)`
- `idx_vendor_favorites_user_id`: `CREATE INDEX idx_vendor_favorites_user_id ON public.vendor_favorites USING btree (user_id)`
- `idx_vendor_favorites_vendor_id`: `CREATE INDEX idx_vendor_favorites_vendor_id ON public.vendor_favorites USING btree (vendor_id)`
- `vendor_favorites_event_id_vendor_id_user_id_key`: `CREATE UNIQUE INDEX vendor_favorites_event_id_vendor_id_user_id_key ON public.vendor_favorites USING btree (event_id, vendor_id, user_id)`
- `vendor_favorites_pkey`: `CREATE UNIQUE INDEX vendor_favorites_pkey ON public.vendor_favorites USING btree (id)`

## `vendor_payment_schedules`

- Purpose: Stores vendor payment schedules records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column              | Type                          | Nullability | Default                                                |
| ------------------- | ----------------------------- | ----------- | ------------------------------------------------------ |
| `id`                | `integer`                     | `NOT NULL`  | `nextval('vendor_payment_schedules_id_seq'::regclass)` |
| `event_id`          | `integer`                     | `NOT NULL`  | `-`                                                    |
| `vendor_id`         | `integer`                     | `NOT NULL`  | `-`                                                    |
| `vendor_booking_id` | `integer`                     | `NULLABLE`  | `-`                                                    |
| `due_date`          | `date`                        | `NOT NULL`  | `-`                                                    |
| `amount`            | `numeric`                     | `NOT NULL`  | `-`                                                    |
| `status`            | `text`                        | `NOT NULL`  | `'pending'::text`                                      |
| `paid_at`           | `timestamp without time zone` | `NULLABLE`  | `-`                                                    |
| `note`              | `text`                        | `NULLABLE`  | `-`                                                    |
| `created_by`        | `integer`                     | `NULLABLE`  | `-`                                                    |
| `updated_by`        | `integer`                     | `NULLABLE`  | `-`                                                    |
| `created_at`        | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                    |
| `updated_at`        | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                                    |

### Indexes

- `idx_vendor_payment_sched_event_id`: `CREATE INDEX idx_vendor_payment_sched_event_id ON public.vendor_payment_schedules USING btree (event_id)`
- `idx_vendor_payment_sched_vendor_id`: `CREATE INDEX idx_vendor_payment_sched_vendor_id ON public.vendor_payment_schedules USING btree (vendor_id)`
- `vendor_payment_schedules_pkey`: `CREATE UNIQUE INDEX vendor_payment_schedules_pkey ON public.vendor_payment_schedules USING btree (id)`

## `vendors`

- Purpose: Stores vendors records for festival planner workflows.
- Primary key: `id`
- RLS: `disabled`

### Columns

| Column          | Type                          | Nullability | Default                               |
| --------------- | ----------------------------- | ----------- | ------------------------------------- |
| `id`            | `integer`                     | `NOT NULL`  | `nextval('vendors_id_seq'::regclass)` |
| `event_id`      | `integer`                     | `NOT NULL`  | `-`                                   |
| `name`          | `text`                        | `NOT NULL`  | `-`                                   |
| `category`      | `text`                        | `NOT NULL`  | `-`                                   |
| `email`         | `text`                        | `NULLABLE`  | `-`                                   |
| `phone`         | `text`                        | `NULLABLE`  | `-`                                   |
| `website`       | `text`                        | `NULLABLE`  | `-`                                   |
| `status`        | `text`                        | `NULLABLE`  | `'Contacted'::text`                   |
| `quoted_amount` | `numeric`                     | `NULLABLE`  | `-`                                   |
| `contract_file` | `text`                        | `NULLABLE`  | `-`                                   |
| `notes`         | `text`                        | `NULLABLE`  | `-`                                   |
| `rating`        | `integer`                     | `NULLABLE`  | `-`                                   |
| `created_by`    | `integer`                     | `NULLABLE`  | `-`                                   |
| `created_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                   |
| `updated_at`    | `timestamp without time zone` | `NULLABLE`  | `CURRENT_TIMESTAMP`                   |

### Indexes

- `vendors_pkey`: `CREATE UNIQUE INDEX vendors_pkey ON public.vendors USING btree (id)`
