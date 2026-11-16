/**
 * A plain SQLite column's write rule by its data type. SQLite's NUMERIC affinity
 * stores a text that reads as a number as an INTEGER or a REAL, and drizzle reads it back as
 * `cast(n as text)`. An INTEGER of at most 15 digits, which a driver's JS number keeps too, reads back
 * as sent. A REAL is written out at 15 digits, or at 17 where SQLite does not read those 15 back as the
 * same REAL: SQLite 3.53 wrote 57.2505567882849 back as 57.250556788284897, a fraction of
 * 14 or 15 digits often, one of at most 13 never. So a `numeric()` write takes a whole number of at
 * most 15 digits or a fraction of at most 13, written as Postgres's numeric takes it: an exponent, a
 * sign of +, blanks and a bare point are spellings SQLite reads as a number, which the DTO would take as text.
 */
import type { FieldMeta } from "../../analyzer-types.ts";

// the digits of a whole number SQLite keeps as an INTEGER and a JS number holds exactly
const WHOLE_DIGITS = 15;

// the digits of a fraction every SQLite reads back as sent, its REAL written out at 15 digits
const FRACTION_DIGITS = 13;

/** A numeric's digits, as a regex literal: a whole number, or a fraction split anywhere about the point; a leading 0 or zeros cost none */
function numericPattern(): string {
  const splits = [
    `[0-9]{1,${WHOLE_DIGITS}}`,
    `0\\.[0-9]{1,${FRACTION_DIGITS}}`,
    ...Array.from(
      { length: FRACTION_DIGITS - 1 },
      (_, at) => `[0-9]{1,${FRACTION_DIGITS - at - 1}}\\.[0-9]{${at + 1}}`,
    ),
  ];

  return `/^-?0*(?:${splits.join("|")})$/u`;
}

/** The regex a plain SQLite numeric's write takes, which its rule checks and the manifest states */
const SQLITE_NUMERIC_PATTERN: string = /* @__PURE__ */ numericPattern();

/** A plain SQLite numeric's write rule */
export const SQLITE_NUMERIC: string = `z.string().regex(${SQLITE_NUMERIC_PATTERN}, { message: "Must be a whole number of at most ${WHOLE_DIGITS} digits or a fraction of at most ${FRACTION_DIGITS}, which SQLite's NUMERIC reads back as sent" })`;

/** The regex a write of a plain SQLite column of `field`'s data type must match; undefined when it has none of its own */
export const sqliteWritePattern = ({ dataType }: FieldMeta): string | undefined =>
  dataType === "string numeric" ? SQLITE_NUMERIC_PATTERN : undefined;

/** The write rule of a plain SQLite column of `field`'s data type; undefined when the plain type is its rule */
export const sqliteWriteRule = (field: FieldMeta): string | undefined =>
  sqliteWritePattern(field) === undefined ? undefined : SQLITE_NUMERIC;
