// Local Node backend: better-sqlite3 behind the async Database interface.
import BetterSqlite3 from "better-sqlite3";
import { AsyncLocalStorage } from "node:async_hooks";
import { SCHEMA } from "./schema";
import type { Database } from "./sql";

export function createDatabase(filename: string): Database {
  const connection = new BetterSqlite3(filename);
  connection.pragma("foreign_keys = ON");
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.exec(SCHEMA);

  // One connection is shared by all requests, so transactions are queued; nested calls join the active one.
  const active = new AsyncLocalStorage<true>();
  let queue: Promise<unknown> = Promise.resolve();
  return {
    prepare(sql) {
      const statement = connection.prepare(sql);
      return {
        get: async (...params) => statement.get(...params) as never,
        all: async (...params) => statement.all(...params) as never,
        run: async (...params) => ({ changes: statement.run(...params).changes }),
      };
    },
    transaction(fn) {
      if (active.getStore()) return fn();
      const result = queue.then(() => active.run(true, async () => {
        connection.exec("BEGIN IMMEDIATE");
        try {
          const value = await fn();
          connection.exec("COMMIT");
          return value;
        } catch (error) {
          connection.exec("ROLLBACK");
          throw error;
        }
      }));
      queue = result.catch(() => undefined);
      return result;
    },
    close: () => connection.close(),
  };
}
