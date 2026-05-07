import https from 'https';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface JwksKey {
  kty: string;
  use?: string;
  kid: string;
  n: string;
  e: string;
  x5c?: string[];
}

interface JwksResponse {
  keys: JwksKey[];
}

export interface EntraTokenClaims {
  oid: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  tid: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  nonce?: string;
}

let _jwksCache: { keys: JwksKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function getJwksKeys(jwksUri: string): Promise<JwksKey[]> {
  const now = Date.now();
  if (_jwksCache && now - _jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return _jwksCache.keys;
  }
  const jwks = await fetchJson<JwksResponse>(jwksUri);
  _jwksCache = { keys: jwks.keys, fetchedAt: now };
  return jwks.keys;
}

function jwkToPem(key: JwksKey): string {
  if (key.x5c && key.x5c.length > 0) {
    const cert = key.x5c[0];
    const lines = cert.match(/.{1,64}/g) ?? [cert];
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  }
  const pub = crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' });
  return pub.export({ type: 'spki', format: 'pem' }) as string;
}

export async function validateEntraIdToken(
  idToken: string,
  jwksUri: string,
  clientId: string,
  tenantId: string,
): Promise<EntraTokenClaims> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded.header.kid !== 'string') {
    throw new Error('Invalid token: missing kid in header');
  }
  const kid = decoded.header.kid;

  let keys = await getJwksKeys(jwksUri);
  let signingKey = keys.find((k) => k.kid === kid);

  if (!signingKey) {
    _jwksCache = null;
    keys = await getJwksKeys(jwksUri);
    signingKey = keys.find((k) => k.kid === kid);
  }

  if (!signingKey) {
    throw new Error('Unknown signing key: kid not found in JWKS');
  }

  const pem = jwkToPem(signingKey);

  const validIssuers: [string, ...string[]] = [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];

  const verified = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: validIssuers,
  });

  return verified as unknown as EntraTokenClaims;
}

export function _resetJwksCacheForTest(): void {
  _jwksCache = null;
}
