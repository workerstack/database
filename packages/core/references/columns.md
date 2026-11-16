---
description: Columns
order: 50
---

# Columns

## SQLite factories

`@workerstack/database/sqlite/columns` exports `c`:

| Factory                              | Emits                                               | Notes                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `c.id(prefix)`                       | `text("id").primaryKey()`                           | `prefix` is type-erased metadata; codegen uses it for `generateId()`, and `c.id` throws for one `generateId` refuses (2–10 lowercase letters and digits, a letter first) |
| `c.serialId()`                       | `integer("id").primaryKey({ autoIncrement: true })` |                                                                                                                                                                          |
| `c.text(name, constraints?)`         | `text(name)`                                        | `max` becomes `{ length: max }`                                                                                                                                          |
| `c.integer(name, constraints?)`      | `integer(name, { mode: "number" })`                 |                                                                                                                                                                          |
| `c.real(name, constraints?)`         | `real(name)`                                        |                                                                                                                                                                          |
| `c.boolean(name)`                    | `integer(name, { mode: "boolean" })`                |                                                                                                                                                                          |
| `c.enum(name, values)`               | `text(name).$type<T[number]>()`                     | `values` is type-erased; codegen emits the CHECK                                                                                                                         |
| `c.json(name, schema, constraints?)` | `text(name, { mode: "json" }).$type<z.infer<S>>()`  |                                                                                                                                                                          |
| `c.ref(name)`                        | `text(name)`                                        | chain `.references(() => other.id)`                                                                                                                                      |
| `c.timestamp(name, constraints?)`    | `integer(name, { mode: "number" })`                 | epoch milliseconds                                                                                                                                                       |
| `c.createdAt(name)`                  | non-null, defaults to `unixepoch() * 1000`          | name must be `createdAt` or `created_at`                                                                                                                                 |
| `c.updatedAt(name)`                  | non-null, with `$onUpdate`                          | name must be `updatedAt` or `updated_at`                                                                                                                                 |
| `c.deletedAt(name)`                  | nullable timestamp                                  | name must be `deletedAt` or `deleted_at`                                                                                                                                 |

Timestamps are integer milliseconds, not SQLite's `TEXT` dates — comparisons, cursors, and index ranges all stay numeric.

## PostgreSQL factories

`@workerstack/database/pg/columns` exports the same `c` shape backed by `drizzle-orm/pg-core` (`text`, `integer`, `serial`, `boolean`, `jsonb`, `doublePrecision`). Timestamps (`createdAt`, `updatedAt`, `deletedAt`, `timestamp`) are `bigint` epoch milliseconds read as JS numbers: a 4-byte `integer` overflows on today's time. A table file written against the package's `c` compiles under either dialect by swapping the import.

## Constraints

The constraint object is shared by both dialects. `@workerstack/database/sqlite/constraints` types them:

| Key                              | Applies to          | Effect                                                                                                                                                                                                                       |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `min` / `max`                    | text, integer, real | length or numeric bounds                                                                                                                                                                                                     |
| `maxBytes`                       | json                | UTF-8 byte bound on the serialized value, on writes                                                                                                                                                                          |
| `pattern`                        | text                | regex, as a source-level string                                                                                                                                                                                              |
| `format`                         | text, enum, integer | a standard by its id: a text's pattern, case, length and registry, an enum's values checked at codegen, an integer's range ([Formats](#formats))                                                                             |
| `schema`                         | text, integer, real | an exported zod schema the write DTOs pipe the value into after database's own rules ([Column schemas](#column-schemas))                                                                                                     |
| `email` / `url`                  | text                | an email checked by zod's email pattern, which publishes; a url by the WHATWG URL parser, https only, its https pattern published; neither publishes a `format`                                                              |
| `trim`, `lowercase`, `uppercase` | text                | transforms applied in generated schemas                                                                                                                                                                                      |
| `password`                       | text                | a stored password hash: kept as written, held to its declared bounds and pattern alone; `passwordText()` holds the plaintext                                                                                                 |
| `private`                        | any                 | omitted from generated read DTOs, from every published list and from every error; a column whose property name starts with `_` is private without it                                                                         |
| `nomutate`                       | any                 | set on create, then never: omitted from the generated update DTO                                                                                                                                                             |
| `mutable`                        | a foreign key       | moves after creation: in the generated update DTO, where every other reference is set once; refused elsewhere, with `nomutate` and with `tenant`                                                                             |
| `tenant`                         | any                 | the table's tenant scope, published as `tenantColumn`: set once, on create, whatever it references, so it is out of the generated update DTO and `immutable`; one per table                                                  |
| `relation: "…"`                  | a foreign key       | names the key's relation and its way back, where the column's role would take a column's own name (`currency` toward `currency.code`, a `parent` self-reference); an identifier, refused on a column that references nothing |
| `autogenerate`                   | any                 | server-assigned, omitted from create/update DTOs; defaults to `true` on `c.createdAt`, `c.updatedAt` and `c.deletedAt`, and on a timestamp-named column a default or `$onUpdate` fills, never by its name alone              |

A text takes one kind of `email`, `url`, `password`, `imageUri` and `name`, and no key its kind would drop, each a codegen failure: `uppercase` on an email, which is lowercased; `lowercase` or `uppercase` on a url, kept as written but for its trim; `trim` or a casing on a password, kept as written.

`private` and `nomutate` are the two that change generated output the most: a `password` column marked `private` never appears in a row DTO, and a `created_at` marked `autogenerate` never appears in a create DTO. A key database or the database fills (`c.id`, `c.serialId`, an `autoIncrement` or defaulted key, SQLite's integer rowid key) is left out of create and update too, while a natural key the caller supplies stays required, whatever its name. The timestamp columns are never part of a create body, so a client backdates no row. A write takes an integer's declared `min` and `max`, clamped to what the column holds (int4 on Postgres, a JS number's exact range on SQLite); a count that may not go negative declares `{ min: 0 }`. A written text is held to its declared bounds and to database's own together: a required text's minimum of 1, an https URL's 9 characters at least; codegen fails, naming the column, when they leave no value, as it does for an integer's. A read never refuses a stored row, which an older rule, a migration or an import may have stored past a bound: it holds a value only to what the engine holds the column to (a Postgres varchar's length, int2 or int4's range, a JS number's exact range, an enum's values), and states each declared bound, a `c.id`'s length of 1 to 48 and a SQLite text length among them, as `x-database-minLength`, `x-database-maxLength`, `x-database-minimum` or `x-database-maximum` in its JSON Schema. A text reference keeps its own bounds; a `c.ref` takes the id's when its target is a `c.id` key or it names none, as a reference to another database's key, and its own text rules when it names a non-id column. A write refuses U+0000 and an unpaired surrogate in text and in JSON, on both dialects, as no engine stores them as sent; a written text's `trim`, `lowercase` and `uppercase` rewrite it before its checks, which the JSON Schema lists, in order, as `x-database-transform` (an email's is `["trim", "lowercase"]`), its bounds and pattern binding the rewritten value; the rule is a refine, which the JSON Schema states as `x-database-text` (and a JSON byte limit as `x-database-maxBytes`), never as a pattern, so a field's own `pattern` stays its pattern and a `c.json` field a `$ref` to its schema. A nullable field's keys sit on the property and on its non-null member alike, so a field taken as a required input with zod's `.unwrap()` keeps them, as `.optional()`, `.pick()` and `.extend()` do (meta-contract §2.1). The rule is `isStorableText(s)` from the package root, which the generated files import; `storableText()` from there is `z.string()` under the same refine and `x-database-text`, for a text field of your own schema, a `c.json` document's or a request body's, that is stored as sent. The `imageUri` and `url` (https) rules are regexes, so the JSON Schema publishes them as patterns, and each OpenAPI example satisfies its field's bounds; a field with a `pattern` gets none.

## Passwords

A `password` column holds the hash, so its DTO takes any storable hash: bcrypt's 60 characters, an argon2id PHC string or a PBKDF2 one, at least 1 character when the column is required, under the `max` and `pattern` it declares (`pattern: "/^\\$argon2id\\$/"` holds the hash to its scheme) and no limit of database's. The plaintext is the request body's, before it is hashed: `passwordText()` from the package root holds it to NIST SP 800-63B rev 4 §3.1.1.2.

```ts
import { passwordText } from "@workerstack/database"
import * as z from "zod"

const signUp = z.object({ email: z.email(), password: passwordText() })
const signIn = z.object({ email: z.email(), password: passwordText.typed() })
```

`passwordText()` sets a password: any storable text of 15 to 128 characters, counted by code point, with no composition rule and nothing trimmed. A password used only beside a second factor may take `passwordText({ min: 8 })`, as rev 4 allows; `min` and `max` are yours to set. `passwordText.typed()` reads one typed to sign in and holds only the max, so a password set under an older or shorter minimum still signs in. Both normalize the value to NFC before they count it, and give the NFC string, so a password typed in another normalization hashes to the same value; an app that adopts it over hashes made from input it never normalized rehashes each one on its next successful sign-in. Under `{ hash: "bcrypt" }` both refuse past 72 UTF-8 bytes, which bcrypt reads no further than, and publish `x-database-maxUtf8Bytes: 72`, the string's own bytes (`x-database-maxBytes` is a JSON text's); `passwordText({ hash: "bcrypt", min })` with a `min` past 72 throws, as no password would pass it. The JSON Schema states the rewrite as `x-database-transform: ["nfc"]` and the bounds as `minLength` and `maxLength`, which count the NFC form's code points, and a password out of bounds is zod's own `too_small` or `too_big` issue with its `minimum` or `maximum`, bcrypt's bytes included.

## Formats

`format` holds a column to a published standard, named by its id: a `c.text` value's syntax, case and length, and its membership where the standard is a registry; a `c.enum`'s listed values, at codegen; a `c.integer`'s range. Like every constraint it shapes the generated DTOs alone, with no CHECK and no change to the column's type, the same on SQLite, D1 and Postgres, and a column stays nullable unless `.notNull()`: a null passes, a value is checked.

```ts
import { sqliteTable } from "drizzle-orm/sqlite-core"
import { c } from "@workerstack/database/sqlite/columns"

export const users = sqliteTable("users", {
	id: c.id("usr"),
	currency: c.text("currency", { format: "iso4217" }),
	time_zone: c.text("time_zone", { format: "iana-time-zone" }),
	locale: c.text("locale", { format: "bcp47" }),
	country: c.text("country", { format: "iso3166-1-alpha-2" }),
	pay_currency: c.enum("pay_currency", ["USD", "EUR", "GBP"], { format: "iso4217" }),
	hour_cycle: c.enum("hour_cycle", ["h12", "h23"], { format: "uts35-hc" }),
	week_start: c.integer("week_start", { format: "iso8601-weekday" }), // 1 Monday … 7 Sunday
})
```

A text format trims the value, then writes it in its standard's case, before it checks it. The table names each text format's standard and release, the case a written value is put in, and the registry it must also belong to; an editor shows the same list on the `format` key.

| Format                | Standard                                                               | Case       | Registry          |
| --------------------- | ---------------------------------------------------------------------- | ---------- | ----------------- |
| `base64url`           | RFC 4648 §5 base64url, unpadded                                        | kept       |                   |
| `bcp47`               | BCP 47 language tag, RFC 5646 §2.1 well-formed                         | kept       |                   |
| `e164`                | ITU-T E.164 phone number, + and up to 15 digits                        | kept       |                   |
| `iana-time-zone`      | IANA time zone name, tzdata 2026f                                      | kept       | `isIanaTimeZone`  |
| `ip`                  | IPv4 dotted quad or IPv6 address, RFC 4291 §2.2                        | lowercased |                   |
| `ipv4`                | IPv4 address, dotted quad without leading zeros                        | kept       |                   |
| `ipv6`                | IPv6 address, RFC 4291 §2.2                                            | lowercased |                   |
| `iso3166-1-alpha-2`   | ISO 3166-1 alpha-2 country code, Debian iso-codes v4.20.1              | uppercased | `isIso3166Alpha2` |
| `iso3166-1-alpha-3`   | ISO 3166-1 alpha-3 country code, Debian iso-codes v4.20.1              | uppercased | `isIso3166Alpha3` |
| `iso4217`             | ISO 4217 alphabetic currency code, SIX list 2026-09-17                 | uppercased | `isIso4217`       |
| `iso639-1`            | ISO 639-1 language code, Debian iso-codes v4.20.1                      | lowercased | `isIso639Alpha2`  |
| `kebab-slug`          | kebab-case slug, lowercase letters and digits joined by single hyphens | kept       |                   |
| `pkce-s256-challenge` | RFC 7636 §4.2 PKCE SHA-256 code challenge                              | kept       |                   |
| `rfc1123-hostname`    | RFC 1123 §2.1 host name                                                | lowercased |                   |
| `semver`              | Semantic Versioning 2.0.0 version                                      | kept       |                   |
| `sha256-hex`          | SHA-256 digest, FIPS 180-4, lowercase hex                              | lowercased |                   |
| `sha512-hex`          | SHA-512 digest, FIPS 180-4, lowercase hex                              | lowercased |                   |
| `srgb-hex`            | sRGB color as #rrggbb, CSS Color 4                                     | lowercased |                   |
| `srgb-hex-alpha`      | sRGB color with alpha as #rrggbbaa, CSS Color 4                        | lowercased |                   |
| `ulid`                | ULID, Crockford base32 in lowercase                                    | lowercased |                   |
| `uts35-ca`            | UTS #35 calendar (ca) key value, CLDR 49                               | lowercased |                   |
| `uts35-fw`            | UTS #35 first day of the week (fw) key value, CLDR 49                  | lowercased |                   |
| `uts35-hc`            | UTS #35 hour cycle (hc) key value, CLDR 49                             | lowercased |                   |
| `uts35-ms`            | UTS #35 measurement system (ms) key value, CLDR 49                     | lowercased |                   |
| `uts35-mu`            | UTS #35 measurement unit (mu) key value, CLDR 49                       | lowercased |                   |
| `uts35-nu`            | UTS #35 numbering system (nu) key value, CLDR 49                       | lowercased |                   |
| `uuid`                | RFC 9562 UUID, lowercase hex                                           | lowercased |                   |
| `uuid-v4`             | RFC 9562 UUID version 4, lowercase hex                                 | lowercased |                   |
| `uuid-v7`             | RFC 9562 UUID version 7, lowercase hex                                 | lowercased |                   |

A text format's rule is its pattern, which Go's RE2, Rust's regex and JavaScript's `u` mode read alike, and its length bounds, published as `pattern`, `minLength` and `maxLength` beside `x-database-format` and the `x-database-transform` it runs (`["trim", "uppercase"]` on `iso4217`), and its OpenAPI example is a value of the standard as written (`EUR` on `iso4217`), none where the column's own bounds leave that value out. It takes no `x-database-text`, as no format's pattern admits U+0000 or a surrogate. The format sets the column's trim, case and length, so codegen refuses a `trim`, `lowercase` or `uppercase` beside it (`users.currency: an iso4217 text takes no lowercase: the format sets its case and trim`), a `min` or `max` outside its range, which the format already holds or which leaves no value (`users.currency: max 4 is past iso4217's length 3: the format holds it`), and an `email`, `url`, `password`, `imageUri` or `name` beside it, each a rule of its own (`users.currency: format and email contradict; declare one`). A bound inside the range, or a `pattern`, beside a format narrows it. `bcp47` sets no maximum, as RFC 5646's 35 characters are the least an implementation must hold, not a cap on a tag, so a column declares its own `max`. An id database does not know is refused with the list it does (`users.currency: database knows no format "iso-4217"; text formats: base64url, bcp47, …`).

Where the table names a predicate, a value must also be a member of the pinned registry it reads, which no pattern states: `HRK` matches `^[A-Z]{3}$` and is no `iso4217` value, withdrawn in 2023, and `Europe/Atlantis` matches the zone pattern and names no zone. Each registry is a snapshot of the release the table names, committed in database's source: nothing fetches at build, test or run time, and a database release moves to a newer one. The five registry predicates are root exports, each taking any string, exactly as written, and never throwing; a bundle that calls none of them carries none of their lists. `isBcp47` is the one predicate that checks a pattern alone: it takes what a `format: "bcp47"` column takes before its trim, RFC 5646 §2.1's whole Language-Tag, `x-private` and `i-klingon` among them, from the same grammar.

```ts
import {
	isBcp47,
	isIanaTimeZone,
	isIso3166Alpha2,
	isIso3166Alpha3,
	isIso4217,
	isIso639Alpha2,
} from "@workerstack/database"

isIso4217("EUR") // true
isIso4217("HRK") // false: withdrawn in 2023
isIso4217("eur") // false: the DTO uppercases a value first, the predicate does not
isIso3166Alpha2("UK") // false: reserved, not assigned; GB is the code
isBcp47("zh-Hant-TW") // true
isBcp47(" en") // false: the DTO trims a value first, the predicate does not
```

A reader that validates from the JSON Schema alone checks such a value with the predicate, or with the release meta-contract §2.1 names beside the id. The `uts35-*` formats are the values of UTS #35's Unicode locale extension keys in CLDR 49, deprecated ones left out (`uts35-hc` is `h11`, `h12`, `h23`, `h24`, `c12` and `c24`); their pattern lists every value, so it is the whole rule, as on every format the table names no registry for.

On a `c.enum` the listed values stay the rule, and `format` says what they mean: codegen refuses a value the format does not take as written (`users.pay_currency: "usd" is no iso4217 value; write the standard's form, "USD"`, `users.pay_currency: "HRK" is no iso4217 value`), and every DTO of the column publishes its `enum` with `x-database-format`.

`c.integer` takes the two integer formats: `iso8601-month`, 1 January to 12 December, and `iso8601-weekday`, 1 Monday to 7 Sunday (ISO 8601 §3.2.2), the numbering `Intl.Locale`'s `getWeekInfo().firstDay` returns. The write DTOs hold the value to the standard's range, or to a declared `min` or `max` inside it, published as `minimum` and `maximum` beside `x-database-format`, and a value outside it gets zod's own `too_small` or `too_big`; codegen refuses a bound past the standard's (`users.week_start: max 8 is past iso8601-weekday's 7: the format holds it`) and a text format's id (`users.week_start: c.integer takes no format "iso4217"; integer formats: iso8601-month, iso8601-weekday`). `c.real`, `c.ref`, `c.json` and the timestamps take no format: TypeScript refuses one, and codegen refuses it from a tables module in JavaScript (`users.owner_id: c.ref takes no format`).

A text its format refuses gets exactly one issue, zod's `invalid_format` with the id as its `format` and `origin: "string"`, and no message of database's, so zod words it in the locale you configure, and an error map can key a message of your own on the id:

```ts
import * as z from "zod"

// " eu " or "HRK" on an iso4217 field:
// { code: "invalid_format", format: "iso4217", origin: "string", path: ["currency"], message: "Invalid iso4217" }

z.config(z.locales.de()) // message: "Ungültig: iso4217"

z.config({
	customError: (issue) =>
		issue.code === "invalid_format" && issue.format === "iso4217" ? "Unknown currency" : undefined,
})
```

An error map that returns `undefined` leaves the issue to the locale, as that one does for every other issue.

## Column schemas

`schema` takes a rule database has no key for: a zod schema the create and update DTOs pipe a `c.text`, `c.integer` or `c.real` value into after every rule of database's, so it reads the value trimmed, cased and checked. Codegen imports it as it imports a `c.json` schema, so it must be exported, and it is best in a module of its own:

```ts
/* src/db/schemas.ts: a module of its own, so a DTO that imports a schema loads zod and this module alone */
import * as z from "zod"

export const dateOrder = z.enum(["iso", "dmy", "mdy"])
export const evenMinutes = z.int().refine((value) => value % 2 === 0, { error: "Must be even" })
```

The tables module imports both, `import { dateOrder, evenMinutes } from "./schemas.ts"`, and names each on its column:

<!-- ts-context
declare const dateOrder: import("zod").ZodType<string, string>
declare const evenMinutes: import("zod").ZodType<number, number>
-->

```ts
import { sqliteTable } from "drizzle-orm/sqlite-core"
import { c } from "@workerstack/database/sqlite/columns"

export const users = sqliteTable("users", {
	id: c.id("usr"),
	date_order: c.text("date_order", { schema: dateOrder, trim: true }),
	slot_minutes: c.integer("slot_minutes", { min: 0, schema: evenMinutes }),
})
```

A schema exported from the tables module works too, but then every DTO that imports it loads the tables module and drizzle with it, a frontend form's bundle among them, and as a `const` it must sit above the table that names it: one below throws a `ReferenceError` as the module loads, which codegen reports in the module's own words. An inline schema type-checks, yet codegen refuses it, as it can only import an export: `users.date_order: no module of the project exports the schema its schema key is given; export it, above the table that names it, so the generated DTOs can import it`, with the note of packages that would not load on their own that a `c.json` schema's error carries.

The text key takes a `z.ZodType<string, string>` and the number keys a `z.ZodType<number, number>`, so a `z.int()` on a text, or a transform to another type, fails to compile. The schema must come from the `zod` the generated DTOs import, one `zod` in the project's tree, as a `c.json` schema must. Codegen refuses a value that is no zod schema (`users.date_order: the constraint schema is no zod schema; database's DTOs are zod 4, so the schema must be one`) and one with no JSON Schema form, such as a `z.custom()`, keeping zod's reason (`… has no JSON Schema form (zod: Custom types cannot be represented in JSON Schema); database publishes every DTO rule`).

Its issues reach the caller exactly as zod yields them, and database adds no code or message: `"x"` on `date_order` is the enum's own `invalid_value` with its values, and `3` on `slot_minutes` is the refine's `custom` issue, `"Must be even"`. A value database's own rules refuse never reaches the schema, so `-3` there gets the `too_small` of `min: 0` alone.

The JSON Schema publishes the schema's export name as `x-database-schema` and the schema's own input JSON Schema in an `allOf` beside it, which codegen computes with `z.toJSONSchema(schema, { io: "input" })` and writes as a literal; on a nullable field the `allOf` sits on the non-null member of its `anyOf`, as the schema's `type` would refuse the null the field takes. A nullable `date_order` publishes:

```text
{
	"anyOf": [
		{
			"type": "string",
			"allOf": [{ "type": "string", "enum": ["iso", "dmy", "mdy"] }],
			"x-database-schema": "dateOrder",
			"x-database-text": "no U+0000 or unpaired surrogate",
			"x-database-transform": ["trim"]
		},
		{ "type": "null" }
	],
	"x-database-schema": "dateOrder",
	"x-database-text": "no U+0000 or unpaired surrogate",
	"x-database-transform": ["trim"]
}
```

A refine publishes nothing: `evenMinutes` publishes `{ "type": "integer" }` with a safe integer's range and no word of evenness. `x-database-schema` is how a reader that runs no JavaScript learns the producer runs a rule it cannot see, and such a reader may take a value the server then refuses. A column with a `schema` carries no generated example, as a refine its JSON Schema does not state may refuse any value database would pick. The read DTO runs no schema, as a read never refuses a stored row, and the manifest names the export as the column's `schema`. `c.enum`, `c.json`, `c.ref` and the timestamps take no `schema` (`users.status: c.enum takes no schema`): an enum's values and a `c.json` schema are rules of their own, and a reference's value is another table's key.
