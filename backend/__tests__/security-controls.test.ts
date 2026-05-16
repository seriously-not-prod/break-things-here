import { describe, expect, it } from 'vitest';
import {
  assertStrictDataSecurityControlsAtStartup,
  isSecureDeploymentEnv,
} from '../src/config/security-controls.js';

describe('strict data security startup controls', () => {
  it('treats production and staging as secure deployment environments', () => {
    expect(isSecureDeploymentEnv('production')).toBe(true);
    expect(isSecureDeploymentEnv('staging')).toBe(true);
    expect(isSecureDeploymentEnv('development')).toBe(false);
    expect(isSecureDeploymentEnv('test')).toBe(false);
  });

  it('does not throw in non-secure environments', () => {
    expect(() => assertStrictDataSecurityControlsAtStartup('development')).not.toThrow();
    expect(() => assertStrictDataSecurityControlsAtStartup('test')).not.toThrow();
  });

  it('throws when any required security flag is missing in production', () => {
    const snapshot = {
      ENFORCE_HTTPS: process.env.ENFORCE_HTTPS,
      EDGE_TLS_MIN_VERSION: process.env.EDGE_TLS_MIN_VERSION,
      DB_SSL_REQUIRED: process.env.DB_SSL_REQUIRED,
      DB_ENCRYPTION_AT_REST_VERIFIED: process.env.DB_ENCRYPTION_AT_REST_VERIFIED,
      VIRUS_SCAN_ENABLED: process.env.VIRUS_SCAN_ENABLED,
      VIRUS_SCAN_BLOCK_ON_ERROR: process.env.VIRUS_SCAN_BLOCK_ON_ERROR,
    };

    delete process.env.ENFORCE_HTTPS;
    delete process.env.EDGE_TLS_MIN_VERSION;
    delete process.env.DB_SSL_REQUIRED;
    delete process.env.DB_ENCRYPTION_AT_REST_VERIFIED;
    delete process.env.VIRUS_SCAN_ENABLED;
    delete process.env.VIRUS_SCAN_BLOCK_ON_ERROR;

    expect(() => assertStrictDataSecurityControlsAtStartup('production')).toThrowError(
      /Startup blocked due to unmet strict data-security requirements/,
    );

    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('passes when all strict flags are correctly set in production', () => {
    const snapshot = {
      ENFORCE_HTTPS: process.env.ENFORCE_HTTPS,
      EDGE_TLS_MIN_VERSION: process.env.EDGE_TLS_MIN_VERSION,
      DB_SSL_REQUIRED: process.env.DB_SSL_REQUIRED,
      DB_ENCRYPTION_AT_REST_VERIFIED: process.env.DB_ENCRYPTION_AT_REST_VERIFIED,
      VIRUS_SCAN_ENABLED: process.env.VIRUS_SCAN_ENABLED,
      VIRUS_SCAN_BLOCK_ON_ERROR: process.env.VIRUS_SCAN_BLOCK_ON_ERROR,
    };

    process.env.ENFORCE_HTTPS = 'true';
    process.env.EDGE_TLS_MIN_VERSION = 'TLSv1.3';
    process.env.DB_SSL_REQUIRED = 'true';
    process.env.DB_ENCRYPTION_AT_REST_VERIFIED = 'true';
    process.env.VIRUS_SCAN_ENABLED = 'true';
    process.env.VIRUS_SCAN_BLOCK_ON_ERROR = 'true';

    expect(() => assertStrictDataSecurityControlsAtStartup('production')).not.toThrow();

    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
});
