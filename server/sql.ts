// Async database interface shared by the local Node backend (better-sqlite3, server/sqlite.ts)
// and the Cloudflare Worker backend (D1, server/d1.ts).
export interface Statement {
  get<T = unknown>(...params: unknown[]): Promise<T | undefined>;
  all<T = unknown>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

export interface Database {
  prepare(sql: string): Statement;
  /**
   * Runs fn as one unit; nested calls join the outer one. SQLite rolls back on error.
   * D1 has no interactive transactions, so there statements run in order without rollback.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): void;
}
