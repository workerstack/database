/**
 * More of pg-index-cases.ts's histories (PA6 and PA7 of r23): a name a sequence, a composite type,
 * a materialized view or, for a constraint's index, a CHECK, a domain's constraint or a constraint
 * trigger takes, which ChooseRelationName and ChooseConstraintName number past; and clones whose cut
 * names meet, numbered in the order Postgres keeps a partitioned table's partitions, its bounds'
 * (.tmp/grunt/pa6/probe.log).
 */
import type { IndexCase } from "./pg-index-cases.ts";

const P =
  "CREATE TABLE p (id int NOT NULL, at date NOT NULL, note text) PARTITION BY RANGE (at);\nCREATE TABLE p1 PARTITION OF p FOR VALUES FROM ('2020-01-01') TO ('2021-01-01');\n";

const AT = `${P}CREATE INDEX ON p (at);`;
const AT_INDEXES = ["p1_at_idx on p1", "p_at_idx on p partitioned"];
const AT_NUMBERED = ["p1_at_idx on p1", "p_at_idx1 on p partitioned"];
const UNIQUE = "CREATE TABLE t (v text);\nALTER TABLE t ADD UNIQUE (v);";
const V_KEY = ["t_v_key on t constraint"];
const V_NUMBERED = ["t_v_key1 on t constraint"];

// partitions whose clones' names cut to one: X's 58 bytes, then `_1_a_idx`, past 63
const X = "x".repeat(58);

const partitions = (strategy: string, key: string, bounds: readonly string[]): string =>
  `CREATE TABLE r (a ${key}) PARTITION BY ${strategy} (a);\n${bounds
    .map((bound, i) => `CREATE TABLE ${X}_${i + 1} PARTITION OF r ${bound};\n`)
    .join("")}CREATE INDEX ON r (a);`;

/** The `i`th clone's name, X cut so the name and its number fit 63 bytes */
const cut = (i: number): string => {
  const n = i === 0 ? "" : String(i);

  return `${"x".repeat(57 - n.length)}_a_idx${n}`;
};

/** The indexes after `partitions`, the clones named in the order of the partitions numbered `order` */
const clones = (...order: number[]): string[] =>
  [...order.map((n, i) => `${cut(i)} on ${X}_${n}`), "r_a_idx on r partitioned"].toSorted();

// lookup-table: each history with the indexes Postgres 17 leaves (.tmp/grunt/pa6/probe.log)
const TAKEN_CASES: readonly IndexCase[] = [
  { history: `CREATE SEQUENCE p_at_idx;\n${AT}`, indexes: AT_NUMBERED, label: "a name a sequence takes" },
  {
    history: `CREATE SEQUENCE p_at_idx;\nDROP SEQUENCE p_at_idx;\n${AT}`,
    indexes: AT_INDEXES,
    label: "a sequence dropped",
  },
  {
    history: `CREATE SEQUENCE s;\nALTER SEQUENCE s RENAME TO p_at_idx;\n${AT}`,
    indexes: AT_NUMBERED,
    label: "a sequence renamed to the name",
  },
  {
    history: `CREATE SEQUENCE s;\nALTER TABLE s RENAME TO p_at_idx;\n${AT}`,
    indexes: AT_NUMBERED,
    label: "a sequence renamed by ALTER TABLE",
  },
  {
    history: `CREATE SCHEMA o;\nCREATE SEQUENCE p_at_idx;\nALTER SEQUENCE p_at_idx SET SCHEMA o;\n${AT}`,
    indexes: AT_INDEXES,
    label: "a sequence moved to another schema",
  },
  { history: `CREATE TYPE p_at_idx AS (a int);\n${AT}`, indexes: AT_NUMBERED, label: "a name a composite type takes" },
  {
    history: `CREATE TYPE p_at_idx AS (a int);\nDROP TYPE p_at_idx;\n${AT}`,
    indexes: AT_INDEXES,
    label: "a composite type dropped",
  },
  {
    history: `CREATE TYPE c AS (a int);\nALTER TYPE c RENAME TO p_at_idx;\n${AT}`,
    indexes: AT_NUMBERED,
    label: "a composite type renamed to the name",
  },
  {
    history: `CREATE TYPE p_at_idx AS ENUM ('a');\n${AT}`,
    indexes: AT_INDEXES,
    label: "an enum, which is no relation",
  },
  {
    history: `CREATE MATERIALIZED VIEW p_at_idx AS SELECT 1;\n${AT}`,
    indexes: AT_NUMBERED,
    label: "a name a materialized view takes",
  },
  {
    history: "CREATE TABLE t (v text, CONSTRAINT t_v_key CHECK (v <> ''));\nALTER TABLE t ADD UNIQUE (v);",
    indexes: V_NUMBERED,
    label: "a name a CHECK takes",
  },
  {
    history: `CREATE TABLE o (v text, CONSTRAINT t_v_key CHECK (v <> ''));\n${UNIQUE}`,
    indexes: V_NUMBERED,
    label: "a name another table's CHECK takes",
  },
  {
    history: "CREATE TABLE t (v text, CONSTRAINT t_v_idx CHECK (v <> ''));\nCREATE INDEX ON t (v);",
    indexes: ["t_v_idx on t"],
    label: "a CHECK's name, which a plain index takes",
  },
  {
    history:
      "CREATE TABLE t (v text, CONSTRAINT t_v_key CHECK (v <> ''));\nALTER TABLE t DROP CONSTRAINT t_v_key;\nALTER TABLE t ADD UNIQUE (v);",
    indexes: V_KEY,
    label: "a CHECK dropped",
  },
  {
    history:
      "CREATE TABLE t (v text, CONSTRAINT c CHECK (v <> ''));\nALTER TABLE t RENAME CONSTRAINT c TO t_v_key;\nALTER TABLE t ADD UNIQUE (v);",
    indexes: V_NUMBERED,
    label: "a CHECK renamed to the name",
  },
  {
    history:
      "CREATE TABLE t (v text);\nALTER TABLE t ADD CONSTRAINT t_v_key CHECK (v <> '');\nALTER TABLE t ADD UNIQUE (v);",
    indexes: V_NUMBERED,
    label: "a CHECK added",
  },
  {
    history: `CREATE TABLE o (v text, CONSTRAINT t_v_key CHECK (v <> ''));\nDROP TABLE o;\n${UNIQUE}`,
    indexes: V_KEY,
    label: "a CHECK dropped with its table",
  },
  {
    history: `CREATE SCHEMA s;\nCREATE TABLE o (v text, CONSTRAINT t_v_key CHECK (v <> ''));\nALTER TABLE o SET SCHEMA s;\n${UNIQUE}`,
    indexes: V_KEY,
    label: "a CHECK moved to another schema with its table",
  },
  {
    history: "CREATE TABLE t (v text CONSTRAINT t_v_key CHECK (v <> '') UNIQUE);",
    indexes: V_NUMBERED,
    label: "a column's CHECK beside its UNIQUE",
  },
  {
    history: "CREATE TABLE t (v text UNIQUE, CONSTRAINT t_v_key CHECK (v <> ''));",
    indexes: V_NUMBERED,
    label: "a CHECK written after the UNIQUE in one CREATE TABLE",
  },
  {
    history:
      "CREATE TABLE p (v text, CONSTRAINT t_v_key CHECK (v <> '')) PARTITION BY LIST (v);\nCREATE TABLE p1 PARTITION OF p FOR VALUES IN ('a');\nALTER TABLE p DETACH PARTITION p1;\nALTER TABLE p DROP CONSTRAINT t_v_key;\nCREATE TABLE t (v text);\nALTER TABLE t ADD UNIQUE (v);",
    indexes: ["t_v_key1 on t constraint"],
    label: "a CHECK a partition inherits, which it keeps once detached",
  },
  {
    history: `CREATE DOMAIN d AS text CONSTRAINT t_v_key CHECK (VALUE <> '');\n${UNIQUE}`,
    indexes: V_NUMBERED,
    label: "a name a domain's constraint takes",
  },
  {
    history: `CREATE DOMAIN d AS text;\nALTER DOMAIN d ADD CONSTRAINT t_v_key CHECK (VALUE <> '');\n${UNIQUE}`,
    indexes: V_NUMBERED,
    label: "a domain's constraint added",
  },
  {
    history:
      "CREATE TABLE t (v text);\nCREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END$$;\nCREATE CONSTRAINT TRIGGER t_v_key AFTER INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();\nALTER TABLE t ADD UNIQUE (v);",
    indexes: V_NUMBERED,
    label: "a name a constraint trigger takes",
  },
  {
    history: partitions("RANGE", "int", ["FOR VALUES FROM (100) TO (200)", "FOR VALUES FROM (0) TO (100)"]),
    indexes: clones(2, 1),
    label: "clones cut to one name, partitions made out of their range order",
  },
  {
    history: partitions("RANGE", "int", [
      "FOR VALUES FROM (0) TO (100)",
      "FOR VALUES FROM (MINVALUE) TO (-100)",
      "FOR VALUES FROM (-100) TO (0)",
    ]),
    indexes: clones(2, 3, 1),
    label: "clones cut to one name, MINVALUE and a negative bound first",
  },
  {
    history: partitions("RANGE", "int", ["DEFAULT", "FOR VALUES FROM (0) TO (100)"]),
    indexes: clones(2, 1),
    label: "clones cut to one name, the DEFAULT partition last",
  },
  {
    history: partitions("RANGE", "date", [
      "FOR VALUES FROM ('2021-01-01') TO ('2022-01-01')",
      "FOR VALUES FROM ('2020-01-01') TO ('2021-01-01')",
    ]),
    indexes: clones(2, 1),
    label: "clones cut to one name, partitions by date",
  },
  {
    history: partitions("LIST", "int", ["FOR VALUES IN (NULL)", "FOR VALUES IN (7, 3)", "FOR VALUES IN (5)"]),
    indexes: clones(2, 3, 1),
    label: "clones cut to one name, LIST by its least value, NULL alone after",
  },
  {
    history: partitions("HASH", "int", [
      "FOR VALUES WITH (MODULUS 4, REMAINDER 3)",
      "FOR VALUES WITH (MODULUS 2, REMAINDER 0)",
      "FOR VALUES WITH (MODULUS 4, REMAINDER 1)",
    ]),
    indexes: clones(2, 3, 1),
    label: "clones cut to one name, HASH by modulus, then remainder",
  },
  {
    history: `CREATE TABLE r (a int) PARTITION BY RANGE (a);\nCREATE TABLE ${X}_2 (a int);\nCREATE TABLE ${X}_1 PARTITION OF r FOR VALUES FROM (100) TO (200);\nALTER TABLE r ATTACH PARTITION ${X}_2 FOR VALUES FROM (0) TO (100);\nCREATE INDEX ON r (a);`,
    indexes: clones(2, 1),
    label: "clones cut to one name, a partition attached before one made",
  },
  {
    history: partitions("RANGE", "int", [
      "FOR VALUES FROM (200) TO (300)",
      "FOR VALUES FROM (100) TO (200)",
      "FOR VALUES FROM (0) TO (100)",
    ]).replace("CREATE INDEX ON r (a);", `CREATE INDEX mine ON ${X}_3 (a);\nCREATE INDEX ON r (a);`),
    indexes: [`${cut(0)} on ${X}_2`, `${cut(1)} on ${X}_1`, `mine on ${X}_3`, "r_a_idx on r partitioned"].toSorted(),
    label: "clones cut to one name past a partition's matching index, which it attaches",
  },
];

export { TAKEN_CASES };
