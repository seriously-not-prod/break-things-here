import { Request, Response } from 'express';
import crypto from 'crypto';
import { isEntraEnabled, getEntraConfig, isMfaRequired, resolveRoleFromEntraGroups } from '../config/entra.js';
import { validateEntraIdToken } from '../utils/entra-token.js';
import { getDatabase } from '../db/database.js';
import { generateTokens } from '../middleware/auth.js';
import { hashToken, encryptToken, hashPassword } from '../utils/auth-helpers.js';

interface UserRow {
  id: number;
  email: string;
  role_id: number;
  entra_oid: string | null;
}

export function getEntraStatus(_req: Request, res: Response): void {
  res.json({ enabled: isEntraEnabled() });
}

export function initiateEntraLogin(_req: Request, res: Response): void {
  if (!isEntraEnabled()) {
    res.status(404).json({ error: 'Entra auth is not enabled.' });
    return;
  }

  const config = getEntraConfig();
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  res.cookie('entra_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });

  res.cookie('entra_pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_mode: 'query',
  });

  res.redirect(`${config.authority}/oauth2/v2.0/authorize?${params.toString()}`);
}

export async function handleEntraCallback(req: Request, res: Response): Promise<void> {
  if (!isEntraEnabled()) {
    res.status(404).json({ error: 'Entra auth is not enabled.' });
    return;
  }

  const { code, state, id_token: directIdToken } = req.body as {
    code?: string;
    state?: string;
    id_token?: string;
  };

  if (!code && !directIdToken) {
    res.status(400).json({ error: 'Authorization code or id_token is required.' });
    return;
  }

  const config = getEntraConfig();
  let idToken: string;

  if (directIdToken) {
    idToken = directIdToken;
  } else {
    const expectedState = (req.cookies?.entra_state as string | undefined) ?? '';
    const codeVerifier = (req.cookies?.entra_pkce_verifier as string | undefined) ?? '';

    if (!state || !expectedState || state !== expectedState) {
      res.status(401).json({ error: 'Invalid or missing Entra state.' });
      return;
    }

    if (!codeVerifier) {
      res.status(400).json({ error: 'Missing PKCE verifier cookie. Restart Entra sign-in and try again.' });
      return;
    }

    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code!,
      code_verifier: codeVerifier,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(`${config.authority}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({})) as Record<string, unknown>;
      res.clearCookie('entra_state');
      res.clearCookie('entra_pkce_verifier');
      res.status(401).json({ error: 'Failed to exchange code for token.', details: err });
      return;
    }

    const tokenData = await tokenRes.json() as { id_token?: string };
    if (!tokenData.id_token) {
      res.clearCookie('entra_state');
      res.clearCookie('entra_pkce_verifier');
      res.status(401).json({ error: 'No ID token received from Azure.' });
      return;
    }
    idToken = tokenData.id_token;
  }

  res.clearCookie('entra_state');
  res.clearCookie('entra_pkce_verifier');

  const claims = await validateEntraIdToken(
    idToken,
    config.jwksUri,
    config.clientId,
    config.tenantId,
    config.authority,
  );

  // #568 — MFA enforcement: when ENTRA_MFA_REQUIRED=true the token's `amr`
  // claim MUST include 'mfa'. Azure AD sets this when MFA was completed.
  if (isMfaRequired()) {
    const amr: string[] = Array.isArray(claims.amr) ? (claims.amr as string[]) : [];
    if (!amr.includes('mfa')) {
      res.status(401).json({ error: 'MFA is required. Please complete multi-factor authentication and try again.' });
      return;
    }
  }

  const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase().trim();
  const displayName = claims.name ?? email.split('@')[0];
  const entraOid = claims.oid;

  if (!email) {
    res.status(400).json({ error: 'No email claim found in Entra token.' });
    return;
  }

  const db = getDatabase();

  const requestedRoleName = resolveRoleFromEntraGroups(Array.isArray(claims.groups) ? claims.groups : []);
  let requestedRoleId: number | null = null;
  if (requestedRoleName) {
    const role = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = $1', [requestedRoleName]);
    requestedRoleId = role?.id ?? null;
  }

  let user = await db.get<UserRow>(
    'SELECT id, email, role_id, entra_oid FROM users WHERE entra_oid = $1 AND deleted_at IS NULL',
    [entraOid],
  );

  // FR-AUTH-003: re-sync role from Azure group membership on every login.
  // requestedRoleId is null when no group env vars are configured — in that
  // case keep the existing role so manual assignments are preserved.
  if (user && requestedRoleId !== null && user.role_id !== requestedRoleId) {
    await db.run(
      `UPDATE users
       SET role_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [requestedRoleId, user.id],
    );
    user.role_id = requestedRoleId;
  }

  if (!user) {
    user = await db.get<UserRow>(
      'SELECT id, email, role_id, entra_oid FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL',
      [email],
    );

    if (user) {
      await db.run(
        `UPDATE users
         SET entra_oid = $1,
             auth_provider = 'entra',
             role_id = COALESCE($2, role_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [entraOid, requestedRoleId, user.id],
      );
      if (requestedRoleId !== null) {
        user.role_id = requestedRoleId;
      }
    }
  }

  if (!user) {
    const dummyHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
    const result = await db.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, email_verified_at, entra_oid, auth_provider)
       VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP, $4, 'entra')
       RETURNING id`,
      [email, dummyHash, displayName, entraOid],
    );

    if (!result.lastID) {
      res.status(500).json({ error: 'Failed to provision user.' });
      return;
    }

    user = await db.get<UserRow>(
      'SELECT id, email, role_id, entra_oid FROM users WHERE id = $1',
      [result.lastID],
    );

    if (user && requestedRoleId !== null) {
      await db.run('UPDATE users SET role_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [requestedRoleId, user.id]);
      user.role_id = requestedRoleId;
    }
  }

  if (!user) {
    res.status(500).json({ error: 'Failed to resolve user after provisioning.' });
    return;
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role_id, sessionId);
  const tokenHash = hashToken(sessionId);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.run(
    `INSERT INTO sessions (user_id, token, refresh_token, expires_at, last_activity)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, refreshTokenHash, expiresAt, new Date().toISOString()],
  );

  const encryptedRefresh = encryptToken(refreshToken);
  res.cookie('refreshToken', encryptedRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const encryptedAccess = encryptToken(accessToken);
  res.cookie('accessToken', encryptedAccess, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000,
  });

  const resp: Record<string, unknown> = {
    message: 'Entra login successful.',
    user: { id: user.id, email: user.email, displayName, roleId: user.role_id },
  };

  if (process.env.NODE_ENV !== 'production') {
    resp.accessToken = accessToken;
  }

  res.status(200).json(resp);
}
