export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authority: string;
  jwksUri: string;
}

export interface EntraGroupRoleConfig {
  admins: string[];
  organizers: string[];
  collaborators: string[];
  guests: string[];
  viewers: string[];
}

export function isEntraEnabled(): boolean {
  return process.env.ENTRA_AUTH_ENABLED === 'true';
}

export function getEntraConfig(): EntraConfig {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Entra auth is enabled but missing required environment variables: ' +
      'AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET must all be set.',
    );
  }

  const redirectUri = process.env.AZURE_REDIRECT_URI ?? 'http://localhost:8081/auth/callback';
  const authority = `https://login.microsoftonline.com/${tenantId}`;
  const jwksUri = `${authority}/discovery/v2.0/keys`;

  return { tenantId, clientId, clientSecret, redirectUri, authority, jwksUri };
}

/**
 * Returns true when ENTRA_MFA_REQUIRED=true is set.
 * When enabled, the Entra callback will reject any token whose `amr` claim
 * does not contain 'mfa', enforcing that all SSO logins complete MFA.
 */
export function isMfaRequired(): boolean {
  return process.env.ENTRA_MFA_REQUIRED === 'true';
}

export function validateEntraConfigAtStartup(): void {
  if (!isEntraEnabled()) return;
  getEntraConfig();
  console.log('[Entra] Configuration validated. Entra auth is enabled.');
}

function parseGroupList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Optional mapping of Entra group object IDs to application roles.
 *
 * Env vars accept comma-separated Entra group IDs:
 * - ENTRA_GROUP_ADMINS
 * - ENTRA_GROUP_ORGANIZERS
 * - ENTRA_GROUP_COLLABORATORS
 * - ENTRA_GROUP_GUESTS
 * - ENTRA_GROUP_VIEWERS
 */
export function getEntraGroupRoleConfig(): EntraGroupRoleConfig {
  return {
    admins: parseGroupList(process.env.ENTRA_GROUP_ADMINS),
    organizers: parseGroupList(process.env.ENTRA_GROUP_ORGANIZERS),
    collaborators: parseGroupList(process.env.ENTRA_GROUP_COLLABORATORS),
    guests: parseGroupList(process.env.ENTRA_GROUP_GUESTS),
    viewers: parseGroupList(process.env.ENTRA_GROUP_VIEWERS),
  };
}

/**
 * Resolves app role name from Entra groups using explicit precedence.
 * Precedence: Admin > Organizer > Collaborator > Guest > Viewer.
 */
export function resolveRoleFromEntraGroups(groupIds: string[]): string | null {
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    return null;
  }

  const userGroups = new Set(groupIds);
  const cfg = getEntraGroupRoleConfig();

  if (cfg.admins.some((id) => userGroups.has(id))) return 'Admin';
  if (cfg.organizers.some((id) => userGroups.has(id))) return 'Organizer';
  if (cfg.collaborators.some((id) => userGroups.has(id))) return 'Collaborator';
  if (cfg.guests.some((id) => userGroups.has(id))) return 'Guest';
  if (cfg.viewers.some((id) => userGroups.has(id))) return 'Viewer';

  return null;
}
