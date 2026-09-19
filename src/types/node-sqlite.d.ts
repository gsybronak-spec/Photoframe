/**
 * Ambient types for node:sqlite (built into Node 22+).
 * Keeps @types/node from failing to resolve the module while giving
 * the database and statements accurate shapes for this project.
 */
declare module "node:sqlite" {
  export interface StatementSync {
    run(
      ...params: (string | number | null)[]
    ): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: (string | number | null)[]): unknown;
    all(...params: (string | number | null)[]): unknown[];
  }

  export interface DatabaseSync {
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export let DatabaseSync: { new (location: string): DatabaseSync };
}
