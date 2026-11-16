import { readFileSync } from "node:fs";

import { RE2JS } from "re2js";
import { describe, expect, it } from "vitest";

import { FORMATS, INTEGER_FORMATS, INTEGER_SPECS, TEXT_FORMATS, formatTakes, type TextFormat } from "./catalog.ts";
import { isIanaTimeZone } from "./iana-time-zone.ts";
import { isIso639Alpha2 } from "./iso639-1.ts";
import { isIso3166Alpha2, isIso3166Alpha3 } from "./iso3166-1.ts";
import { isIso4217 } from "./iso4217.ts";
import {
  CALENDARS,
  FIRST_DAYS,
  HOUR_CYCLES,
  MEASUREMENT_SYSTEMS,
  MEASUREMENT_UNITS,
  NUMBERING_SYSTEMS,
} from "./uts35.ts";

const HEX_64 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

// values each format takes and refuses as written, the refusals naming the rule they break
const CASES: {
  readonly [F in TextFormat]: { readonly takes: readonly string[]; readonly refuses: readonly string[] };
} = {
  // length 5 leaves one stray character, which no byte string encodes to
  base64url: { refuses: ["AAAAA", "AA==", "a+b/"], takes: ["", "AQID-_8", "AAAA"] },
  // RFC 5646 §2.1's Language-Tag: a langtag, a bare private-use tag, or an irregular grandfathered tag
  bcp47: {
    refuses: ["e", "en_US", "en-", "x", "i-foobar", "abcdefghi"],
    takes: [
      "en",
      "zh-Hant-TW",
      "zh-yue-HK",
      "de-CH-1996",
      "en-US-u-ca-gregory-x-private",
      "x-private",
      "i-klingon",
      "en-GB-oed",
      "sgn-BE-FR",
    ],
  },
  e164: { refuses: ["14155552671", "+0123", "+1234567890123456"], takes: ["+14155552671", "+385911234567"] },
  // the shape alone takes Europe/Atlantis: the registry refuses it
  "iana-time-zone": {
    refuses: ["Europe/Atlantis", "Europe Zagreb", "europe/zagreb"],
    takes: ["Europe/Zagreb", "Etc/GMT+5", "America/Argentina/Buenos_Aires"],
  },
  ip: { refuses: ["::ffff:1.2", "192.0.2", "01.2.3.4"], takes: ["192.0.2.1", "2001:db8::1", "::ffff:192.0.2.1"] },
  ipv4: { refuses: ["192.168.01.1", "256.1.1.1", "1.2.3", "::1"], takes: ["192.0.2.1", "0.0.0.0", "255.255.255.255"] },
  // Postgres reads ::ffff:1.2 as a two-part IPv4 tail; RFC 4291 takes four octets only
  ipv6: {
    refuses: ["::ffff:1.2", "::ffff:1.2.3", "1.2.3.4", "fe80::1%eth0"],
    takes: ["::ffff:192.0.2.1", "2001:db8::1", "::", "1:2:3:4:5:6:7:8"],
  },
  // UK is reserved, not assigned
  "iso3166-1-alpha-2": { refuses: ["UK", "hr", "HRV"], takes: ["HR", "US"] },
  "iso3166-1-alpha-3": { refuses: ["XXX", "hrv", "HR"], takes: ["HRV", "USA"] },
  // HRK was withdrawn in 2023
  iso4217: { refuses: ["HRK", "eur", "EU"], takes: ["EUR", "USD"] },
  "iso639-1": { refuses: ["xx", "HR", "hrv"], takes: ["hr", "en"] },
  "kebab-slug": { refuses: ["My-Post", "a--b", "-a", ""], takes: ["my-post", "a1"] },
  // RFC 7636 Appendix B's challenge
  "pkce-s256-challenge": {
    refuses: ["E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-c", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-c="],
    takes: ["E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "_".repeat(43)],
  },
  "rfc1123-hostname": {
    refuses: [
      "-a.com",
      "a..b",
      "Example.com",
      "a_b",
      "a".repeat(64),
      /* four 63-character labels: 255 characters, past 253 */ Array(4).fill("a".repeat(63)).join("."),
    ],
    takes: ["example.com", "a-1.b2", "a".repeat(63)],
  },
  semver: {
    refuses: ["1.0", "01.0.0", "1.0.0-01", `1.0.0-${"a".repeat(251)}`],
    takes: ["1.0.0", "1.0.0-alpha.1+build.5", "10.20.30-rc-1"],
  },
  "sha256-hex": { refuses: [HEX_64.toUpperCase(), HEX_64.slice(1)], takes: [HEX_64, "0".repeat(64)] },
  "sha512-hex": { refuses: ["F".repeat(128), HEX_64], takes: [HEX_64.repeat(2), "f".repeat(128)] },
  "srgb-hex": { refuses: ["#FF8800", "#fff", "ff8800"], takes: ["#ff8800", "#000000"] },
  "srgb-hex-alpha": { refuses: ["#ff8800", "#FF8800CC"], takes: ["#ff8800cc", "#00000000"] },
  // the first character holds 3 bits: 8 overflows 128 bits; i, l, o and u are outside Crockford's alphabet
  ulid: {
    refuses: [`8${"z".repeat(25)}`, "01H5A3G8K9M2N4P6Q8R0T2V4X6", "01h5a3g8k9m2n4p6q8r0t2v4xi"],
    takes: ["01h5a3g8k9m2n4p6q8r0t2v4x6", `7${"z".repeat(25)}`],
  },
  "uts35-ca": { refuses: ["islamicc", "Gregory", "islamic-"], takes: ["gregory", "islamic-civil"] },
  "uts35-fw": { refuses: ["monday", "Mon"], takes: ["mon", "sun"] },
  "uts35-hc": { refuses: ["H23", "h25"], takes: ["h23", "c12"] },
  "uts35-ms": { refuses: ["imperial", "Metric"], takes: ["metric", "ussystem"] },
  "uts35-mu": { refuses: ["fahrenheit", "kelvins"], takes: ["celsius", "fahrenhe"] },
  "uts35-nu": { refuses: ["latin", "LATN"], takes: ["latn", "arab"] },
  uuid: {
    refuses: ["550E8400-E29B-41D4-A716-446655440000", "550e8400e29b41d4a716446655440000"],
    takes: ["550e8400-e29b-41d4-a716-446655440000", "00000000-0000-0000-0000-000000000000"],
  },
  "uuid-v4": {
    refuses: ["017f22e2-79b0-7cc3-98c4-dc0c0c07398f", "550e8400-e29b-41d4-c716-446655440000"],
    takes: ["550e8400-e29b-41d4-a716-446655440000", "f47ac10b-58cc-4372-b567-0e02b2c3d479"],
  },
  "uuid-v7": {
    refuses: ["550e8400-e29b-41d4-a716-446655440000", "017f22e2-79b0-7cc3-c8c4-dc0c0c07398f"],
    takes: ["017f22e2-79b0-7cc3-98c4-dc0c0c07398f", "0190b0a4-1c2d-7e3f-8a4b-5c6d7e8f9a0b"],
  },
};

// each text id's example as the `format?` keys' JSDoc in src/sqlite/constraints.ts lists it: `- \`id\`: standard; \`example\`; …`
const DOCUMENTED: ReadonlyMap<string, string> = new Map(
  [
    ...readFileSync(new URL("../sqlite/constraints.ts", import.meta.url), "utf8").matchAll(
      /^\s*\* - `([a-z0-9-]+)`: [^;\n]+; `([^`]+)`; (?:registry|pattern only)$/gmu,
    ),
  ].map(([, id, example]) => [id as string, example as string]),
);

const sorted = (list: readonly string[]): string[] => [...list].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe("the format ids", () => {
  it("are sorted, and each has one spec", () => {
    expect(TEXT_FORMATS).toEqual(sorted(TEXT_FORMATS));
    expect(INTEGER_FORMATS).toEqual(sorted(INTEGER_FORMATS));
    expect(sorted(Object.keys(FORMATS))).toEqual(TEXT_FORMATS);
    expect(sorted(Object.keys(INTEGER_SPECS))).toEqual(INTEGER_FORMATS);
  });
});

describe.each(TEXT_FORMATS)("the %s format", (format) => {
  const spec = FORMATS[format];

  it.each(CASES[format].takes)("takes %j", (value) => {
    expect(formatTakes(format, value)).toBe(true);
  });

  it.each(CASES[format].refuses)("refuses %j", (value) => {
    expect(formatTakes(format, value)).toBe(false);
  });

  // Ajv's `u` regexes and Go's RE2 both read the published source, and agree with the rule on every case
  it("compiles under JavaScript's u flag and RE2, which read every case alike", () => {
    const unicode = new RegExp(spec.source, "u");
    const re2 = RE2JS.compile(spec.source);

    for (const value of [...CASES[format].takes, ...CASES[format].refuses])
      expect(re2.test(value), value).toBe(unicode.test(value));
  });

  // a generated DTO publishes it, so it must pass the format's own rule as written
  it("has an example the format takes as written, the one the format key's JSDoc lists", () => {
    expect(formatTakes(format, spec.example)).toBe(true);
    expect(spec.example).toBe(DOCUMENTED.get(format));
  });

  it("trims, then applies at most one case transform", () => {
    expect(spec.transform[0]).toBe("trim");
    expect(spec.transform.length).toBeLessThanOrEqual(2);
    expect(spec.standard).not.toBe("");
    expect(spec.min).toBeGreaterThanOrEqual(0);
    expect(spec.max ?? spec.min).toBeGreaterThanOrEqual(spec.min);
  });
});

describe("a case-transformed format", () => {
  // the transform runs before the check, so each value the format takes is one the transform leaves as it is
  it.each(TEXT_FORMATS)("%s takes only values its transform keeps", (format) => {
    const casing = FORMATS[format].transform[1];

    const recased = (value: string): string =>
      casing === "lowercase" ? value.toLowerCase() : casing === "uppercase" ? value.toUpperCase() : value;

    expect(CASES[format].takes.map(recased)).toEqual(CASES[format].takes);
  });
});

/** The words of a registry module's lookup tables, read from its source */
const words = (file: string): string[] =>
  [...readFileSync(new URL(`./${file}`, import.meta.url), "utf8").matchAll(/`([^`]*)`\.split/gu)].flatMap(
    (match) => match[1]?.split(/\s/u) ?? [],
  );

describe("a registry format", () => {
  // the shape never refuses a code the pinned registry holds
  const REGISTRIES = [
    ["iana-time-zone", "iana-time-zone.ts", isIanaTimeZone],
    ["iso3166-1-alpha-2", "iso3166-1.ts", isIso3166Alpha2],
    ["iso3166-1-alpha-3", "iso3166-1.ts", isIso3166Alpha3],
    ["iso4217", "iso4217.ts", isIso4217],
    ["iso639-1", "iso639-1.ts", isIso639Alpha2],
  ] as const;

  it.each(REGISTRIES)("%s takes every code of %s", (format, file, predicate) => {
    const codes = words(file).filter(predicate);
    expect(codes.length).toBeGreaterThan(100);
    expect(codes.filter((code) => !formatTakes(format, code))).toEqual([]);
  });

  it.each(REGISTRIES)("%s names its member predicate", (format, _file, predicate) => {
    expect(FORMATS[format].member).toBe(predicate.name);
  });

  it("is the only kind that checks membership", () => {
    const members = TEXT_FORMATS.filter((format) => FORMATS[format].member !== null);
    expect(members).toEqual(REGISTRIES.map(([format]) => format));
  });
});

describe("a UTS #35 format", () => {
  // the alternation is the whole rule, so the format takes exactly the CLDR list
  it.each([
    ["uts35-ca", CALENDARS],
    ["uts35-fw", FIRST_DAYS],
    ["uts35-hc", HOUR_CYCLES],
    ["uts35-ms", MEASUREMENT_SYSTEMS],
    ["uts35-mu", MEASUREMENT_UNITS],
    ["uts35-nu", NUMBERING_SYSTEMS],
  ] as const)("%s takes every value of its list and no prefix or extension of one", (format, values) => {
    expect(values.filter((value) => !formatTakes(format, value))).toEqual([]);
    expect(
      values.filter((value) => formatTakes(format, value.slice(0, -1)) && !values.includes(value.slice(0, -1))),
    ).toEqual([]);
    expect(values.filter((value) => formatTakes(format, `${value}x`))).toEqual([]);
  });
});

describe("the integer formats", () => {
  it("number ISO 8601 weekdays 1 (Monday) to 7 and months 1 to 12", () => {
    expect(INTEGER_SPECS["iso8601-weekday"]).toMatchObject({ max: 7, min: 1 });
    expect(INTEGER_SPECS["iso8601-month"]).toMatchObject({ max: 12, min: 1 });

    for (const format of INTEGER_FORMATS) expect(INTEGER_SPECS[format].standard).not.toBe("");
  });
});
