/**
 * More of pg-index-cases.ts's histories (case 2 of plan 31's facts probe): a DROP COLUMN reaches an
 * inheritance child, and drops its indexes on the column, only where the child holds the column from
 * its parents alone (attinhcount 1, attislocal false); a column the child declares, holds from
 * another parent, or keeps through ONLY or NO INHERIT stays, with its index. A column rename reaches
 * every table under the one named.
 */
import type { IndexCase } from "./pg-index-cases.ts";

const PAR = "CREATE TABLE par (a int, b int);\n";

// PAR with a child ch that holds b from par alone, indexed on it
const CH = `${PAR}CREATE TABLE ch () INHERITS (par);\nCREATE INDEX ON ch (b);\n`;
const KEPT = ["ch_b_idx on ch"];

// lookup-table: each history with the indexes Postgres 17 leaves
const INHERIT_CASES: readonly IndexCase[] = [
  {
    history: `${CH}ALTER TABLE par DROP COLUMN b;`,
    indexes: [],
    label: "a child's index on a column it holds from its parent alone, dropped with the parent's column",
  },
  {
    history: `${PAR}CREATE TABLE ch (b int) INHERITS (par);\nCREATE INDEX ON ch (b);\nALTER TABLE par DROP COLUMN b;`,
    indexes: KEPT,
    label: "a child's index on a column it declares too, kept",
  },
  {
    history: `CREATE TABLE ch (a int, b int);\nCREATE INDEX ON ch (b);\n${PAR}ALTER TABLE ch INHERIT par;\nALTER TABLE par DROP COLUMN b;`,
    indexes: KEPT,
    label: "a child's index on a column it had before it inherited, kept",
  },
  {
    history: `${CH}ALTER TABLE ONLY par DROP COLUMN b;`,
    indexes: KEPT,
    label: "a child's index past a DROP COLUMN of ONLY its parent, kept",
  },
  {
    history: `${CH}CREATE TABLE gc () INHERITS (ch);\nCREATE INDEX ON gc (b);\nALTER TABLE ONLY par DROP COLUMN b;\nALTER TABLE ch DROP COLUMN b;`,
    indexes: [],
    label: "a column ONLY left a child, dropped from it later with its child's",
  },
  {
    history: `${CH}ALTER TABLE ch NO INHERIT par;\nALTER TABLE par DROP COLUMN b;`,
    indexes: KEPT,
    label: "a child's index on a column it kept through NO INHERIT, kept",
  },
  {
    history: `CREATE TABLE par2 (b int);\n${PAR}CREATE TABLE ch () INHERITS (par, par2);\nCREATE INDEX ON ch (b);\nALTER TABLE par DROP COLUMN b;`,
    indexes: KEPT,
    label: "a child's index on a column another parent gives it too, kept",
  },
  {
    history: `CREATE TABLE par2 (b int);\n${PAR}CREATE TABLE ch () INHERITS (par, par2);\nCREATE INDEX ON ch (b);\nALTER TABLE par DROP COLUMN b;\nALTER TABLE par2 DROP COLUMN b;`,
    indexes: [],
    label: "a child's index on a column each of its parents gives up, dropped",
  },
  {
    history: `${PAR}CREATE TABLE ch () INHERITS (par);\nCREATE TABLE gc () INHERITS (ch);\nCREATE INDEX ON gc (b);\nALTER TABLE par DROP COLUMN b;`,
    indexes: [],
    label: "a grandchild's index on an inherited column, dropped",
  },
  {
    history: `${PAR}CREATE TABLE c1 () INHERITS (par);\nCREATE TABLE c2 () INHERITS (par);\nCREATE TABLE gc () INHERITS (c1, c2);\nCREATE INDEX ON gc (b);\nALTER TABLE par DROP COLUMN b;`,
    indexes: [],
    label: "an index on a column a table inherits down two paths, dropped once both give it up",
  },
  {
    history: `${CH}ALTER TABLE par RENAME COLUMN b TO c;\nALTER TABLE par DROP COLUMN c;`,
    indexes: [],
    label: "a child's index on an inherited column renamed through the parent, then dropped",
  },
];

export { INHERIT_CASES };
