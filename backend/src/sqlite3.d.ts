declare module 'sqlite3' {
  interface Database {
    get<T = unknown>(sql: string, params: unknown[], callback: (err: Error | null, row: T | undefined) => void): void;
    all<T = unknown>(sql: string, params: unknown[], callback: (err: Error | null, rows: T[]) => void): void;
    run(sql: string, params: unknown[], callback: (this: StatementContext, err: Error | null) => void): void;
    exec(sql: string, callback: (err: Error | null) => void): void;
    close(callback: (err: Error | null) => void): void;
  }

  interface StatementContext {
    lastID?: number;
    changes?: number;
  }

  interface Sqlite3Static {
    Database: new (filename: string) => Database;
    verbose(): void;
  }

  export { Database, StatementContext };
  const sqlite3: Sqlite3Static;
  export default sqlite3;
}