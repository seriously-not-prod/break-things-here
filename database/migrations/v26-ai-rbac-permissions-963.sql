-- =============================================================================
-- Migration: AI RBAC Permissions — Issue #963
-- Enforce Role-Based Access for AI Capabilities
-- Applied: idempotent (safe to run on fresh or existing databases)
-- =============================================================================

-- Add the ai.access permission that guards all AI endpoints.
-- Only Admin and Organizer roles are granted this permission by default.
-- Attendee, Guest, Viewer, and Collaborator roles do NOT receive this permission.
INSERT INTO permissions (name, description) VALUES
  ('ai.access', 'Access AI-powered features and endpoints')
ON CONFLICT (name) DO NOTHING;

-- Grant ai.access to Admin (id=3)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE name = 'ai.access'
ON CONFLICT DO NOTHING;

-- Grant ai.access to Organizer (id=2)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE name = 'ai.access'
ON CONFLICT DO NOTHING;
