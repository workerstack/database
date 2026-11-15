/**
 * More of pg-index-cases.ts's histories (cases 3a-3c of plan 31's facts probe): a partition's index
 * matches its parent's as CompareIndexInfo compares their operator classes and collations, by what
 * each resolves to, so a default spelled on one side and left out on the other attaches where a
 * different one makes a clone.
 */
import type { IndexCase } from "./pg-index-cases.ts"

/** A RANGE-partitioned p over `type`, and a table c to attach to it with `index` on it */
const attach = (type: string, index: string, parent: string, method = "") =>
	`CREATE TABLE p (a ${type}) PARTITION BY RANGE (a);\nCREATE TABLE c (a ${type});\n` +
	`CREATE INDEX ON c ${method}(${index});\nCREATE INDEX ON p ${method}(${parent});\n` +
	"ALTER TABLE p ATTACH PARTITION c DEFAULT;"
const ATTACHED = ["c_a_idx on c", "p_a_idx on p partitioned"]
const CLONED = ["c_a_idx on c", "c_a_idx1 on c", "p_a_idx on p partitioned"]

// lookup-table: each history with the indexes Postgres 17 leaves
const MATCH_CASES: readonly IndexCase[] = [
	{
		history: attach("int", "a", "a int4_ops"),
		indexes: ATTACHED,
		label: "a default operator class on the parent alone",
	},
	{
		history: attach("int", "a int4_ops", "a"),
		indexes: ATTACHED,
		label: "a default operator class on the partition alone",
	},
	{
		history: attach("int", "a pg_catalog.int4_ops", "a"),
		indexes: ATTACHED,
		label: "a default operator class qualified by its schema",
	},
	{
		history: attach("varchar(9)", "a text_ops", "a"),
		indexes: ATTACHED,
		label: "the text class varchar takes by default",
	},
	{ history: attach("int[]", "a array_ops", "a"), indexes: ATTACHED, label: "the class an array takes by default" },
	{
		history: attach("int[]", "a array_ops", "a", "USING gin "),
		indexes: ATTACHED,
		label: "the class an array takes by default under gin",
	},
	{
		history: attach("text", "a text_pattern_ops", "a"),
		indexes: CLONED,
		label: "a class other than the default on one side",
	},
	{ history: attach("text", 'a COLLATE "default"', "a"), indexes: ATTACHED, label: "the default collation spelled" },
	{
		history: attach('text COLLATE "C"', 'a COLLATE "C"', "a"),
		indexes: ATTACHED,
		label: "a column's own collation spelled",
	},
	{
		history: attach('text COLLATE "C"', 'a COLLATE "default"', "a"),
		indexes: CLONED,
		label: "the default collation spelled on a column of another",
	},
	{
		history: `CREATE DOMAIN d AS text COLLATE "C";\n${attach("d", 'a COLLATE "C"', "a")}`,
		indexes: ATTACHED,
		label: "a domain's collation spelled",
	},
	{
		history: `CREATE DOMAIN d AS int;\n${attach("d", "a int4_ops", "a")}`,
		indexes: ATTACHED,
		label: "the default class of a domain's base",
	},
	{
		history:
			"CREATE TABLE p (a int) PARTITION BY RANGE (a);\nCREATE TABLE c PARTITION OF p DEFAULT;\n" +
			"CREATE INDEX ON c (a int4_ops);\nCREATE INDEX ON p (a);",
		indexes: ATTACHED,
		label: "a parent's index made over a partition's that spells the default class",
	},
]

export { MATCH_CASES }
