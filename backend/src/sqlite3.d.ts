declare module 'sqlite3' {
  interface Database {
    get(sql: string, params: unknown[], callback: (err: unknown, row: unknown) => void): void;
    all(sql: string, params: unknown[], callback: (err: unknown, rows: unknown[]) => void): void;
    run(sql: string, params: unknown[], callback: (this: StatementContext, err: unknown) => void): void;
    exec(sql: string, callback: (err: unknown) => void): void;
    close(callback: (err: unknown) => void): void;
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