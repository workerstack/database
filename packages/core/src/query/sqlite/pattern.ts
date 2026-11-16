/**
 * The one lowering of `like` / `ilike`, for SQLite and Postgres. Every filter path calls this,
 * so the two operators cannot drift apart between builders.
 *
 * On Postgres, `like` is LIKE and `ilike` ILIKE, `*` written as `%` and LIKE's own specials escaped:
 * Postgres caps no pattern's length, so a fixed text needs no other form.
 *
 * On SQLite:
 * A value whose only `*` are at its ends is a fixed text to find, not a pattern: it lowers
 * to `instr`, `substr` or `=`, which no length cap limits, where D1 refuses a LIKE or GLOB
 * pattern over 50 bytes. `like` stays case-sensitive, as GLOB is; `ilike` compares both sides
 * through `lower()`, ASCII as LIKE folds. A NULL column matches neither, as it matches no pattern.
 */
import { Column, is, type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { FIXED, globPattern, likePattern } from "../like.ts";
import type { ListDialect } from "../list-dialect.ts";
import { countLiteral } from "./keyset.ts";

/**
 * `like` → GLOB on SQLite, LIKE on Postgres (case-sensitive). `ilike` → LIKE on SQLite (ASCII
 * case-insensitive), ILIKE on Postgres. A fixed text on SQLite → a search for it. A Postgres
 * column lowers as Postgres; any other SQL as SQLite
 */
function patternToSQL(column: SQLWrapper, operator: "like" | "ilike", value: unknown): SQL {
  const dialect = is(column, Column) && column.columnType.startsWith("Pg") ? "postgres" : "sqlite";

  return patternOn({ dialect, sql: column }, operator, value);
}

/** `patternToSQL` on a column of a known `dialect` */
function patternOn(
  { dialect, sql: column }: { dialect: ListDialect; sql: SQLWrapper },
  operator: "like" | "ilike",
  value: unknown,
): SQL {
  const raw = String(value);

  if (dialect === "postgres") {
    const pattern = likePattern(raw);

    return operator === "like"
      ? sql`${column} LIKE ${pattern} ESCAPE '\\'`
      : sql`${column} ILIKE ${pattern} ESCAPE '\\'`;
  }

  const fixed = FIXED.exec(raw);

  if (fixed !== null) return fixedToSQL(column, operator === "ilike", fixed);

  if (operator === "like") return sql`${column} GLOB ${globPattern(raw)}`;

  return sql`${column} LIKE ${likePattern(raw)} ESCAPE '\\'`;
}

/** A fixed text found in `column`: anywhere, at its start, at its end, or as all of it */
function fixedToSQL(column: SQLWrapper, folded: boolean, [, head, text, tail]: RegExpExecArray): SQL {
  const [opensStart, opensEnd] = [head !== "", tail !== ""];

  // a value of stars alone matches any text, as `*` does; a NULL is no text
  if (text === "" && (opensStart || opensEnd)) return sql`${column} IS NOT NULL`;
  const side = folded ? sql`lower(${column})` : sql`${column}`;
  const find = folded ? sql`lower(${text})` : sql`${text}`;

  if (opensStart && opensEnd) return sql`instr(${side}, ${find}) > 0`;
  // the text bound once, its length written as SQLite's length() counts it, in code points, which
  // lower()'s ASCII fold keeps: a bound value the budget counts once
  // FIXED's middle group takes part in every match, an empty text included
  const length = countLiteral([...(text as string)].length);

  if (opensEnd) return sql`substr(${side}, 1, ${length}) = ${find}`;

  if (opensStart) return sql`substr(${side}, -${length}) = ${find}`;

  // the column's own collation never applies: GLOB compares bytes, and LIKE folds only through lower() here
  return sql`${side} = ${find} COLLATE BINARY`;
}

export { patternOn, patternToSQL };
