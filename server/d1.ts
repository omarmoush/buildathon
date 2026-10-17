// Cloudflare backend: D1 behind the async Database interface.
import { isAppliedMigrationError, MIGRATIONS, schemaStatements } from "./schema";
import type { Database } from "./sql";

// The subset of the D1 binding used here (avoids depending on @cloudflare/workers-types).
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Binding {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<unknown>;
}

export function d1Database(d1: D1Binding): Database {
  return {
    prepare(sql) {
      const bound = (params: unknown[]) => d1.prepare(sql).bind(...params);
      return {
        get: async <T>(...params: unknown[]) => (await bound(params).first<T>()) ?? undefined,
        all: async <T>(...params: unknown[]) => (await bound(params).all<T>()).results,
        run: async (...params) => ({ changes: (await bound(params).run()).meta.changes }),
      };
    },
    transaction: fn => fn(),
    close() {},
  };
}

export async function applySchema(d1: D1Binding): Promise<void> {
  await d1.batch(schemaStatements().map(statement => d1.prepare(statement)));
  for (const statement of MIGRATIONS) {
    try { await d1.prepare(statement).run(); } catch (error) { if (!isAppliedMigrationError(error)) throw error; }
  }
}
