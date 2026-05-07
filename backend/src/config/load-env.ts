import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface EnvMap {
  [key: string]: string | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DEV_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/festival_planner';
const DEFAULT_DEV_CORS_ORIGINS = 'http://localhost:3000,http://localhost:4173,http://localhost:5173,http://localhost:5174';

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
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function loadEnvFiles(): void {
  const backendEnvPath = path.resolve(__dirname, '../../.env');
  const repoEnvPath = path.resolve(__dirname, '../../../.env');
  const mergedEnv = {
    ...parseEnvFile(repoEnvPath),
    ...parseEnvFile(backendEnvPath),
  };

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function applyDevelopmentDefaults(): void {
  process.env.PORT ??= '4000';

  if (process.env.NODE_ENV === 'production') {
    return;
  }

  process.env.DATABASE_URL ??= DEFAULT_DEV_DATABASE_URL;
  process.env.CORS_ALLOWED_ORIGINS ??= DEFAULT_DEV_CORS_ORIGINS;
}

loadEnvFiles();
applyDevelopmentDefaults();