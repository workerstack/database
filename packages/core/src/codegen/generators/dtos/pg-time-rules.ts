/**
 * The write rules of Postgres's time, timestamp and interval types: each a zod source string that
 * takes only a value Postgres stores as given, with no fraction of a second past the precision it
 * keeps, which it would round, perhaps into the next day. pg-types.ts keys them by data type.
 */

/** An interval's last field, below which Postgres drops every part without an error */
export type IntervalField = "day" | "hour" | "minute" | "month" | "second" | "year";

// an offset as RFC 3339 writes one, Z or ±hh:mm, as JSON Schema's time and date-time formats and
// z.iso.datetime take it, its hours at most 15 as Postgres holds one: the
// one source a timetz and a timestamptz read, so they take one spelling
const OFFSET = "(?:Z|[+-](?:0[0-9]|1[0-5]):[0-5][0-9])";

// zod's ISO date, date-time and time regexes, each \d written as [0-9] and nothing else changed (a test
// holds each copy to zod's own, read as it runs): zod's publish \d, which Rust's regex reads as any
// Unicode digit, so database publishes its own, which ECMAScript, Go's RE2 and Rust's regex read alike.
// Each is a z.stringFormat of zod's format name, which checks and publishes the regex it
// is given: zod's types refuse a `pattern` param on z.iso.*, which a consumer's tsc reads. One
// departure: the date's year is 0001 at least, as Postgres's year 0000 is a 22008
const YEAR = "(?:000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|[1-9][0-9]{3})";
export const ISO_DATE: string = `(?:(?:[0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|(?:[2468][048]|0[48])00|[13579][26]00)-02-29|${YEAR}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|(?:02)-(?:0[1-9]|1[0-9]|2[0-8])))`;
const ISO_CLOCK = "(?:[01][0-9]|2[0-3]):[0-5][0-9]";
const ISO_SECOND = "(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]+)?";
const ISO_WALL = `${ISO_CLOCK}(?::[0-5][0-9](?:\\.[0-9]+)?)?`;
const ISO_TIME = `^${ISO_WALL}$`;
const ISO_LOCAL = `^${ISO_DATE}T(?:${ISO_SECOND}(?:Z)|${ISO_WALL})$`;
const ISO_OFFSET = `^${ISO_DATE}T(?:${ISO_SECOND}(?:Z|([+-](?:[01][0-9]|2[0-3]):[0-5][0-9])))$`;

/** A second's fraction of at most `precision` digits, as a regex piece */
const fractionOf = (precision: number): string => (precision === 0 ? "" : `(?:\\.[0-9]{1,${precision}})?`);

/** Why a fraction past `precision` digits is refused: Postgres would round it, maybe into the next day */
const roundedBy = (type: string, precision: number): string =>
  precision === 0
    ? `Must have no fraction of a second, which ${type}(0) would round`
    : `Must have at most ${precision} digits after the second's point, which ${type}(${precision}) would round`;

/**
 * A time's fraction held to its precision, checked at the end of the value, before `tail` (its
 * offset, if any): its last two digits not after a point, or a fraction of at most `precision`
 * digits. A refine of no lookaround, which every regex engine reads
 */
function fractionRule(type: string, precision: number, tail: string): string {
  const fraction = precision === 0 ? "" : `|\\.[0-9]{1,${precision}}`;

  return `.regex(/(?:[^.0-9][0-9][0-9]${fraction})${tail}$/u, { message: "${roundedBy(type, precision)}" })`;
}

// a time with an offset, which z.iso.time does not take: hh:mm[:ss[.f]], then the offset
const timetz = (precision: number): string =>
  `z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9]${fractionOf(precision)})?${OFFSET}$/u, { message: "Must be a time with an offset${precision === 0 ? " and no fraction of a second" : ` and at most ${precision} digits after the second's point`}, which time(${precision}) with time zone would round" })`;

// A timestamp keeps no zone: given an offset or Z it discards it, so the instant is lost. A
// timestamptz given a local time reads it in the session's TimeZone, so the instant depends on
// the server's config. Each takes only the form whose instant it keeps, and a precision rounds a
// longer fraction, perhaps into the next day, so each takes none.
export function timestampRule({ precision, withTimeZone }: { precision: number; withTimeZone: boolean }): string {
  const type = withTimeZone ? "timestamp with time zone" : "timestamp";

  if (!withTimeZone)
    return `z.stringFormat("datetime", /${ISO_LOCAL}/u).regex(/[^Zz]$/u, { message: "Must be a local date-time, with no offset or Z, which timestamp would discard" })${fractionRule(type, precision, "")}`;

  return `z.stringFormat("datetime", /${ISO_OFFSET}/u).regex(/${OFFSET}$/u, { message: "Must have an offset of at most 15:59, as Postgres holds one" })${fractionRule(type, precision, OFFSET)}`;
}

/** A time, local or with its offset, its fraction held to its precision */
export function timeRule({ precision, withTimeZone }: { precision: number; withTimeZone: boolean }): string {
  return withTimeZone
    ? timetz(precision)
    : `z.stringFormat("time", /${ISO_TIME}/u)${fractionRule("time", precision, "")}`;
}

// an ISO 8601 duration as z.iso.duration takes one, with no lookaround, so RE2 compiles it:
// weeks alone, or at least one date or time part, the seconds alone taking a fraction. Its
// decimal mark is `.` alone, as Postgres refuses ISO 8601's comma with a 22007. Each
// part takes at most the digits whose every value Postgres holds alone, past which it is a 22015:
// 8 for years and weeks, 9 for months, days and hours, 11 for minutes, 12 for whole
// seconds. A sum past its range is the handler's 400, a 22008 or 22015
const YEARS = "[0-9]{1,8}";
const MONTHS = "[0-9]{1,9}";
const WEEKS = "[0-9]{1,8}";
const DAYS = "[0-9]{1,9}";
const HOURS = "[0-9]{1,9}";
const MINUTES = "[0-9]{1,11}";
const SECONDS = "[0-9]{1,12}(?:\\.[0-9]+)?S";
const TIME_PART = `T(?:${HOURS}H(?:${MINUTES}M)?(?:${SECONDS})?|${MINUTES}M(?:${SECONDS})?|${SECONDS})`;
const DURATION = `^P(?:${WEEKS}W|(?:${YEARS}Y(?:${MONTHS}M)?(?:${DAYS}D)?|${MONTHS}M(?:${DAYS}D)?|${DAYS}D)(?:${TIME_PART})?|${TIME_PART})$`;

// lookup-table: the ISO 8601 duration an interval's last field keeps, as a regex of no lookaround
const KEPT_BY: Readonly<Record<Exclude<IntervalField, "second">, string>> = {
  day: "^P[^T]*$",
  hour: "^P[^T]*(?:T[0-9]+H)?$",
  minute: "^P[^T]*(?:T(?:[0-9]+H)?(?:[0-9]+M)?)?$",
  month: "^P(?:[0-9]+Y)?(?:[0-9]+M)?$",
  year: "^P[0-9]+Y$",
};

/**
 * An interval: an ISO 8601 duration with no part below its last field, which Postgres drops
 * (`PT1H` into an `interval day` is stored as 0), and no fraction of a second past its precision,
 * which it rounds. A string and its pattern, with no `format: "duration"`: that format
 * is RFC 3339's, whose seconds take no fraction, where Postgres keeps one. Its precision is the
 * declared one, or 6 for none, as Postgres's: drizzle's SQL type writes `precision: 0` as no
 * precision, so the declared one comes first and the DTO alone holds whole seconds
 */
export function intervalRule({ field, precision }: { field: IntervalField | null; precision: number }): string {
  const fields =
    field === null || field === "second"
      ? ""
      : `.regex(/${KEPT_BY[field]}/u, { message: "Must hold no part below its ${field}s, which an interval of ${field}s drops" })`;

  const fraction = `.regex(/^[^.]*${precision === 0 ? "" : `(?:\\.[0-9]{1,${precision}}S)?`}$/u, { message: "${roundedBy("interval", precision)}" })`;

  return `z.string().regex(/${DURATION}/u, { message: "Must be an ISO 8601 duration" })${fields}${fraction}`;
}
