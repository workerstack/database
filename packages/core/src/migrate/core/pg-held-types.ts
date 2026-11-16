/**
 * What check's replay reads of a file's transaction at a VALIDATE (pg-replay-held.ts), and what
 * the warning (pg-validate.ts) says of it in place of what the file's text says (pg-held.ts).
 */

/** The tables whose column defaults, and the table whose identity column, call a sequence */
type Calls = { defaults: readonly string[]; identity: string | undefined };

/**
 * What Postgres held at a VALIDATE, read from pg_locks: each relation's lock, by key, with whether
 * reads wait too, and of each sequence among them, the tables another session sees that call it.
 * After a statement whose code database does not read, `validated` names, by key, each table a
 * constraint of which that code validated, and the locks are those held as it ended
 */
type Locked = {
  calls: ReadonlyMap<string, Calls>;
  locks: ReadonlyMap<string, boolean>;
  validated?: readonly string[] | undefined;
};

export type { Calls, Locked };
