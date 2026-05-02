declare module 'sqlite3' {
  interface SqliteDatabase {
    get(sql: string, params: unknown[], callback: (err: unknown, row: unknown) => void): void;
    all(sql: string, params: unknown[], callback: (err: unknown, rows: unknown[]) => void): void;
    run(sql: string, params: unknown[], callback: (this: { lastID?: number; changes?: number }, err: unknown) => void): void;
    exec(sql: string, callback: (err: unknown) => void): void;
    close(callback: (err: unknown) => void): void;
  }

  interface Sqlite3Static {
    Database: new (filename: string) => SqliteDatabase;
    verbose(): void;
  }

  const sqlite3: Sqlite3Static;
  export default sqlite3;
}