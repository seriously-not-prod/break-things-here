interface SecurityRequirement {
  envVar: string;
  expected: string;
  reason: string;
}

const REQUIRED_SECURITY_FLAGS: SecurityRequirement[] = [
  {
    envVar: 'ENTRA_AUTH_ENABLED',
    expected: 'true',
    reason: 'Azure Entra ID must be the primary authentication method.',
  },
  {
    envVar: 'ENTRA_MFA_REQUIRED',
    expected: 'true',
    reason: 'MFA enforcement must be enabled for all Entra sign-ins.',
  },
  {
    envVar: 'ENFORCE_HTTPS',
    expected: 'true',
    reason: 'Application must reject insecure HTTP requests.',
  },
  {
    envVar: 'EDGE_TLS_MIN_VERSION',
    expected: 'TLSv1.3',
    reason: 'Edge/load-balancer TLS floor must be TLS 1.3.',
  },
  {
    envVar: 'DB_SSL_REQUIRED',
    expected: 'true',
    reason: 'Database traffic must be encrypted in transit.',
  },
  {
    envVar: 'DB_ENCRYPTION_AT_REST_VERIFIED',
    expected: 'true',
    reason: 'Operational attestation required for encrypted database storage volumes.',
  },
  {
    envVar: 'VIRUS_SCAN_ENABLED',
    expected: 'true',
    reason: 'All file uploads must be malware scanned.',
  },
  {
    envVar: 'VIRUS_SCAN_BLOCK_ON_ERROR',
    expected: 'true',
    reason: 'Upload scanning failures must fail closed.',
  },
];

export function isSecureDeploymentEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production' || nodeEnv === 'staging';
}

export function assertStrictDataSecurityControlsAtStartup(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (!isSecureDeploymentEnv(nodeEnv)) {
    return;
  }

  const errors: string[] = [];

  for (const requirement of REQUIRED_SECURITY_FLAGS) {
    const actual = process.env[requirement.envVar];
    if (actual !== requirement.expected) {
      errors.push(
        `${requirement.envVar} must be '${requirement.expected}' (actual: '${actual ?? 'unset'}'). ${requirement.reason}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      '[SECURITY] Startup blocked due to unmet strict data-security requirements:\n' +
        errors.map((line) => `- ${line}`).join('\n'),
    );
  }
}
