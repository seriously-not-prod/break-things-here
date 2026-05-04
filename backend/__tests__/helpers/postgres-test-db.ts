import { randomUUID } from 'node:crypto';
import pg from 'pg';

export interface TestRunResult {
  lastID?: number;
  changes: number;
}

export interface TestDatabase {
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<TestRunResult>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

class PostgresTestDatabase implements TestDatabase {
  private readonly pool: pg.Pool;
  private readonly schemaName: string;

  constructor(connectionString: string, schemaName: string) {
    this.pool = new pg.Pool({ connectionString });
    this.schemaName = schemaName;
  }

  async initialize(schemaSql: string): Promise<void> {
    await this.pool.query(`CREATE SCHEMA "${this.schemaName}"`);
    await this.exec(schemaSql);
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const result = await this.query<T>(sql, params);
    return result.rows[0];
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.query<T>(sql, params);
    return result.rows;
  }

  async run(sql: string, params?: unknown[]): Promise<TestRunResult> {
    const result = await this.query<{ id?: number }>(sql, params);
    const lastID = /\bRETURNING\b/i.test(sql) ? result.rows[0]?.id : undefined;
    return {
      lastID,
      changes: result.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.query(sql);
  }

  async close(): Promise<void> {
    try {
      await this.pool.query(`DROP SCHEMA IF EXISTS "${this.schemaName}" CASCADE`);
    } finally {
      await this.pool.end();
    }
  }

  private async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();

    try {
      await client.query(`SET search_path TO "${this.schemaName}", public`);
      return await client.query<T>(convertPlaceholders(sql), params ?? []);
    } finally {
      client.release();
    }
  }
}

export async function createPostgresTestDatabase(schemaSql: string): Promise<TestDatabase> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set for backend tests.');
  }

  const schemaName = `test_${randomUUID().replace(/-/g, '_')}`;
  const database = new PostgresTestDatabase(connectionString, schemaName);
  await database.initialize(schemaSql);
  return database;
}
