/**
 * QE1 and QE2 of r23: a statement whose constraint fails in a row other than its own. A trigger on
 * orders writes ledger, whose CHECK fails; a REPLACE into member deletes the row its email
 * conflicts with, which badge references. SQLite names the CHECK alone and the foreign key not at
 * all, so the handler answers from the map. libsql, bun:sqlite and D1 each run these cases.
 */
import type { ConstraintMap } from "../../../src/types.ts"

export const ELSEWHERE_DDL = [
	"PRAGMA foreign_keys = ON",
	"CREATE TABLE ledger (amount INTEGER, CONSTRAINT ledger_amount_positive CHECK (amount > 0))",
	"CREATE TABLE orders (id TEXT PRIMARY KEY, total INTEGER)",
	"CREATE TRIGGER orders_ledger AFTER INSERT ON orders BEGIN INSERT INTO ledger VALUES (new.total); END",
	"CREATE TABLE org (id TEXT PRIMARY KEY)",
	"CREATE TABLE member (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, org_id TEXT NOT NULL REFERENCES org(id))",
	"CREATE TABLE badge (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES member(id))",
	"INSERT INTO org VALUES ('o1')",
	"INSERT INTO member VALUES ('m1', 'a@x.io', 'o1')",
	"INSERT INTO badge VALUES ('b1', 'm1')",
]

/** The map codegen writes for ELSEWHERE_DDL, with each referenced column listed */
export const ELSEWHERE_MAPS: ConstraintMap[] = [
	{
		badge: { foreignKey: { member_id: { cause: "No such member", errorKey: "badge_member_not_found" } } },
		ledger: {
			check: { ledger_amount_positive: { cause: "Amount must be positive", errorKey: "ledger_amount_invalid" } },
		},
		member: { foreignKey: { org_id: { cause: "No such org", errorKey: "member_org_not_found" } }, referenced: ["id"] },
		org: { referenced: ["id"] },
		orders: {},
	},
]

/** The neutral answer to a foreign key failure on either side */
const EITHER_SIDE = {
	cause: "Referenced record does not exist or is still in use",
	column: undefined,
	errorKey: "foreign_key_violation",
	status: 409,
}

/** Each statement, and what the handler answers for it */
export const ELSEWHERE_CASES = [
	{
		expected: { cause: "Amount must be positive", errorKey: "ledger_amount_invalid", status: 400, table: "ledger" },
		label: "a ledger CHECK an orders trigger fails (QE1)",
		statement: "INSERT INTO orders VALUES ('o1', -5)",
	},
	{
		expected: { ...EITHER_SIDE, table: "member" },
		label: "a REPLACE into a referenced table (QE2)",
		statement: "REPLACE INTO member (id, email, org_id) VALUES ('m2', 'a@x.io', 'o1')",
	},
	{
		expected: { ...EITHER_SIDE, table: "member" },
		label: "an INSERT OR REPLACE into a referenced table (QE2)",
		statement: "INSERT OR REPLACE INTO member (id, email, org_id) VALUES ('m2', 'a@x.io', 'o1')",
	},
	{
		expected: { column: "member_id", errorKey: "badge_member_not_found", status: 409, table: "badge" },
		label: "a REPLACE into a table no one references, its own key (sibling)",
		statement: "REPLACE INTO badge (id, member_id) VALUES ('b2', 'nope')",
	},
] as const
