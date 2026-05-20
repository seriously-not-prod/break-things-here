import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface EnvMap {
  [key: string]: string | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TEST_DATABASE_NAME = 'festival_planner_test';
const DEFAULT_TEST_DATABASE_PORT = '5433';
const DEFAULT_TEST_DATABASE_HOST = '127.0.0.1';
const DEFAULT_TEST_DATABASE_USER = 'postgres';
const DEFAULT_TEST_DATABASE_PASSWORD = 'postgres';

function parseEnvFile(filePath: string): EnvMap {
  if (!existsSync(filePath)) {
    return {};
  }

  const fileContents = readFileSync(filePath, 'utf8');
  const entries: EnvMap = {};

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function getFileEnv(): EnvMap {
  const backendEnvPath = path.resolve(__dirname, '.env');
  const repoEnvPath = path.resolve(__dirname, '..', '.env');

  return {
    ...parseEnvFile(repoEnvPath),
    ...parseEnvFile(backendEnvPath),
  };
}

function buildConnectionString(env: EnvMap): string {
  const user = env.TEST_DB_USER ?? env.POSTGRES_USER ?? DEFAULT_TEST_DATABASE_USER;
  const password = env.TEST_DB_PASSWORD ?? env.POSTGRES_PASSWORD ?? DEFAULT_TEST_DATABASE_PASSWORD;
  const host = env.TEST_DB_HOST ?? env.DB_HOST ?? DEFAULT_TEST_DATABASE_HOST;
  const port = env.TEST_DB_PORT ?? env.TEST_DATABASE_PORT ?? DEFAULT_TEST_DATABASE_PORT;
  const database = env.TEST_DB_NAME ?? env.TEST_DATABASE_NAME ?? DEFAULT_TEST_DATABASE_NAME;

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const fileEnv = getFileEnv();

  if (fileEnv.TEST_DATABASE_URL) {
    return fileEnv.TEST_DATABASE_URL;
  }

  return buildConnectionString(fileEnv);
}
