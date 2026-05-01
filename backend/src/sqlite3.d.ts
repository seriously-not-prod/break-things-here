declare module 'sqlite3' {
  export interface StatementContext {
    lastID?: number;
    changes?: number;
  }

  export interface Database {
    get<T = unknown>(
      sql: string,
      params: readonly unknown[],
      callback: (err: Error | null, row: T | undefined) => void,
    ): void;
    all<T = unknown>(
      sql: string,
      params: readonly unknown[],
      callback: (err: Error | null, rows: T[]) => void,
    ): void;
    run(
      sql: string,
      params: readonly unknown[],
      callback: (this: StatementContext, err: Error | null) => void,
    ): void;
    exec(sql: string, callback: (err: Error | null) => void): void;
    close(callback: (err: Error | null) => void): void;
  }

  export interface Sqlite3Static {
    Database: new (filename: string) => Database;
    verbose(): Sqlite3Static;
  }

  const sqlite3: Sqlite3Static;
  export default sqlite3;
}