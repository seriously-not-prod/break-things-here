export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authority: string;
  jwksUri: string;
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

  const redirectUri = process.env.AZURE_REDIRECT_URI ?? 'http://localhost:3000/auth/entra/callback';
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
