/**
 * PostgreSQL access.
 *
 * One connection pool for the whole app, plus two small helpers:
 *   query() - run a statement and get the rows back
 *   transaction() - run several statements as one unit (all or nothing)
 */
import { Pool, PoolClient, types } from "pg";

// pg returns NUMERIC columns as strings to avoid precision loss. Prices here
// are small amounts with 2 decimals, so plain JS numbers are fine and easier
// to work with. 1700 is the PostgreSQL type id of NUMERIC.
types.setTypeParser(1700, (value) => parseFloat(value));

// In development Next.js reloads modules on every change. Keeping the pool on
// globalThis stops each reload from opening a new pool and running out of
// connections.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

/** Anything that can run a query: the pool itself or a client inside a transaction. */
export type Queryable = Pool | PoolClient;

/**
 * Runs one SQL statement and returns its rows.
 * Pass a transaction client as the last argument to run it inside that transaction.
 */
export async function query<T = Record<string, any>>(sql: string, params: unknown[] = [], db: Queryable = pool): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

/**
 * Runs `work` inside a transaction. If it throws, everything it did is rolled
 * back and the error is passed on; otherwise the transaction is committed.
 */
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
