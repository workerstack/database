/*
 * The IPv6 address and network a plain inet or cidr column's DTO takes, as Postgres reads one:
 * RFC 3986's IPv6address, its last 32 bits two groups or an IPv4 tail, whose octets are decimal
 * with no leading zero and which Postgres also takes in two or three parts, padding zeros, and a `::`
 * standing for at least one group; a network that, a `/` and a prefix length of 0 to 128 with no
 * leading zero. zod's z.ipv6 and z.cidrv6 publish a pattern of hex groups alone and check with the URL
 * parser, which refuses a short tail, and z.cidrv6 takes a fractional prefix (`::/1.5`) Postgres
 * refuses. Each is a z.stringFormat of zod's format name, so the rule zod runs is the pattern a
 * reader is published, and its issue zod's: the same code, format and message
 */
const GROUP = "[0-9A-Fa-f]{1,4}"
const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])"
/** Postgres's IPv4 tail: two groups, or two to four octets */
const TAIL = `(?:${GROUP}:${GROUP}|${OCTET}(?:\\.${OCTET}){1,3})`
/** A dotted quad: four decimal octets, none with a leading zero */
const QUAD = `${OCTET}(?:\\.${OCTET}){3}`
/** RFC 4291's IPv4 tail: two groups, or a dotted quad */
const STRICT_TAIL = `(?:${GROUP}:${GROUP}|${QUAD})`
const PREFIX = "(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])"

/** At most `most` + 1 groups split by `:`, or none: what stands before a `::` */
const before = (most: number): string => `(?:(?:${GROUP}:){0,${most}}${GROUP})?`

/** An IPv6 address's source: eight groups, or a `::` with up to seven around it, the last two `tail` */
function address(tail: string): string {
	return [
		`(?:${GROUP}:){6}${tail}`,
		`::(?:${GROUP}:){5}${tail}`,
		`${before(0)}::(?:${GROUP}:){4}${tail}`,
		`${before(1)}::(?:${GROUP}:){3}${tail}`,
		`${before(2)}::(?:${GROUP}:){2}${tail}`,
		`${before(3)}::${GROUP}:${tail}`,
		`${before(4)}::${tail}`,
		`${before(5)}::${GROUP}`,
		`${before(6)}::`,
	].join("|")
}

/*
 * Each branch publishes its pattern and no format: a format-checking
 * reader's ipv6 refuses the short IPv4 tails the pattern takes, and none knows cidrv4 or cidrv6, which
 * Ajv's strict mode refuses to compile. The issue keeps zod's format name; the pattern states the rule
 */
const unformatted = (rule: string): string => `${rule}.meta({ format: void 0 })`

/** An IPv6 address, as Postgres's inet reads one */
export const ipv6Rule = (): string => unformatted(`z.stringFormat("ipv6", /^(?:${address(TAIL)})$/u)`)

/** An IPv6 network, an address and its prefix length, as Postgres's inet and cidr read one */
export const cidrv6Rule = (): string => unformatted(`z.stringFormat("cidrv6", /^(?:${address(TAIL)})\\/${PREFIX}$/u)`)

/** A plain inet's rule: a host address, its netmask optional */
export const inetRule = (): string =>
	`z.union([${unformatted("z.ipv4()")}, ${ipv6Rule()}, ${unformatted("z.cidrv4()")}, ${cidrv6Rule()}])`

/**
 * An IPv6 address as RFC 4291 §2.2 writes one, unanchored: Postgres's rule but an IPv4 tail of four
 * octets, never two or three, so `::ffff:1.2` is refused. The `ipv6` and `ip` text formats' source
 */
export const strictIpv6Source = (): string => address(STRICT_TAIL)

/** An IPv4 address as a dotted quad, unanchored: the `ipv4` and `ip` text formats' source */
export const ipv4Source = (): string => QUAD
