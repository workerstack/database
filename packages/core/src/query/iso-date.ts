/**
 * An ISO 8601 date or date-time as an ISO date filter takes it: a
 * real day and time by the proleptic Gregorian calendar, read as the instant it names in
 * `toISOString()`'s form, so every spelling of one instant compares as one. A bare date is midnight
 * UTC. A JS Date holds no fraction past milliseconds, so the instant keeps its millisecond and says
 * whether digits past it were cut, which a filter compares by.
 */

/**
 * An ISO date filter's value as validateFilter types it: the instant, by its epoch milliseconds and
 * its `toISOString()` text, so a lowering binds whichever its column stores. A bare date is
 * midnight UTC. A fraction past milliseconds is cut from `ms` and `text`, and kept in `fraction`:
 * `cut` says the instant lies between `ms` and the millisecond after it, which a filter compares
 * exactly by. It writes itself as its text, in a string and in JSON
 */
class IsoInstant {
  /** whether the instant lies past `ms`, by digits past the millisecond that `ms` and `text` cut */
  readonly cut: boolean;
  /** the instant's fraction of its second, in nine digits: nanoseconds */
  readonly fraction: string;
  /** the instant in epoch milliseconds, its fraction past them cut */
  readonly ms: number;
  /** the instant as `toISOString()` writes it, in UTC, its fraction past milliseconds cut */
  readonly text: string;

  /**
   * The instant `ms` epoch milliseconds name, or, with `fraction`, the instant `fraction` digits
   * into the second of `ms`, whose milliseconds they must start with
   */
  constructor(ms: number, fraction?: string) {
    this.ms = ms;
    this.text = new Date(ms).toISOString();
    const millisecond = String(((ms % 1000) + 1000) % 1000).padStart(3, "0");
    this.fraction = (fraction ?? millisecond).padEnd(9, "0");

    if (!/^\d{9}$/.test(this.fraction) || this.fraction.slice(0, 3) !== millisecond)
      throw new RangeError(`IsoInstant: fraction "${fraction}" is not the second's fraction of ${this.text}`);
    this.cut = /[1-9]/.test(this.fraction.slice(3));
  }

  /** The instant's ISO text */
  toJSON(): string {
    return this.text;
  }

  /** The instant's ISO text */
  toString(): string {
    return this.text;
  }
}

// a date, or a date-time with seconds and a fraction optional and an offset required
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:Z|([+-])(\d{2}):(\d{2})))?$/;

// days in each month of a common year
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in `month` (1 to 12) of `year`, by the proleptic Gregorian calendar, where year 0 is a leap year */
const daysIn = (year: number, month: number): number =>
  month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : (MONTH_DAYS[month - 1] as number);

/** An ISO date-time's fields, each a number, an absent one 0 */
type Fields = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  offsetHour: number;
  offsetMinute: number;
  second: number;
  year: number;
};

/** Whether `fields` name a real day and time, and an offset within a day */
const isReal = ({ day, hour, minute, month, offsetHour, offsetMinute, second, year }: Fields): boolean =>
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= daysIn(year, month) &&
  hour < 24 &&
  minute < 60 &&
  second < 60 &&
  offsetHour < 24 &&
  offsetMinute < 60;

/** A field the match holds, 0 when absent */
const number = (part: string | undefined): number => (part === undefined ? 0 : Number(part));

/** `raw` as the instant it names; undefined for text that names no real day and time */
function isoInstant(raw: string): IsoInstant | undefined {
  const match = ISO_DATE.exec(raw);

  if (match === null) return undefined;
  const [, year, month, day, hour, minute, second, fraction = "", sign = "+", offsetHour, offsetMinute] = match;

  const fields: Fields = {
    day: number(day),
    hour: number(hour),
    minute: number(minute),
    month: number(month),
    offsetHour: number(offsetHour),
    offsetMinute: number(offsetMinute),
    second: number(second),
    year: number(year),
  };

  if (!isReal(fields)) return undefined;
  const ahead = sign === "-" ? -1 : 1;
  // set field by field, since Date.UTC reads a year below 100 as 19xx
  const at = new Date(0);
  at.setUTCFullYear(fields.year, fields.month - 1, fields.day);
  at.setUTCHours(
    fields.hour - ahead * fields.offsetHour,
    fields.minute - ahead * fields.offsetMinute,
    fields.second,
    Number(fraction.padEnd(3, "0").slice(0, 3)),
  );

  return new IsoInstant(at.getTime(), fraction);
}

export { IsoInstant, isoInstant };
