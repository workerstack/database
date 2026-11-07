/**
 * The PostgREST-style filter grammar: a filter string to its AST. Values stay as the request
 * wrote them; `validateFilter` checks them against the declared field types.
 *
 * - `field.op.value`: one condition; `,` joins conditions with AND
 * - `or(...)`, `and(...)`: groups, nestable
 * - `in.(a,b)`, `nin.(a,b)`: lists; `in.()` is the one empty list, and a comma beside no member is malformed
 * - `"..."`: a quoted value may hold `,` `(` `)` and `.`; `\"` and `\\` escape inside it
 * - `@name`: a computed field
 */
import type { FilterAST, FilterCondition, FilterGroup, FilterOperator } from "./types.ts"

/* A non-empty tuple, so the list query schema builds its operator enum from it */
/** Every operator the filter grammar parses; `validateFilter` holds each field to its type's */
const FILTER_OPERATORS: readonly [FilterOperator, ...FilterOperator[]] = [
	"eq",
	"ne",
	"neq",
	"gt",
	"gte",
	"lt",
	"lte",
	"in",
	"nin",
	"like",
	"ilike",
	"is",
	"contains",
]

/** An operator and the `.` after it; longest first, so `neq.` is not read as `ne` then `q.` */
const OPERATOR_PATTERN = /^(contains|ilike|like|neq|gte|lte|nin|eq|ne|gt|lt|in|is)\./

/** What a refused filter is told: this alone when no more is known, else this and the reason */
const SYNTAX = "Invalid filter syntax"

class FilterParser {
	private pos = 0
	/** Why the input is untrustworthy, the first reason met; null while every term parsed */
	private failure: string | null = null
	private readonly input: string
	/** Whitespace the caller's string held before the input: positions are told in the caller's string */
	private readonly offset: number

	constructor(input: string, offset: number) {
		this.input = input
		this.offset = offset
	}

	/** Why any term could not be parsed, or null: the input is not trustworthy while this is set. */
	get error(): string | null {
		return this.failure
	}

	/** Mark the input malformed; the first reason stays */
	private fail(reason: string = SYNTAX): void {
		this.failure ??= reason
	}

	/** Mark a comma beside no member, told by where the member should stand */
	private failEmptyMember(at: number): void {
		this.fail(`${SYNTAX}: empty member at position ${at + this.offset}`)
	}

	parse(): FilterAST {
		const root = this.parseGroup("and")
		/* a stray ")" stops the top-level group early; anything left is unparsed */
		if (this.pos < this.input.length) this.fail()
		return { root }
	}

	private parseGroup(logic: "and" | "or"): FilterGroup {
		const group: FilterGroup = { conditions: [], logic, subgroups: [] }
		while (this.skipWhitespace() < this.input.length && this.peek() !== ")") {
			const nested = this.matchKeyword("or(") ? "or" : this.matchKeyword("and(") ? "and" : null
			if (nested) {
				this.pos += nested.length + 1
				group.subgroups.push(this.parseGroup(nested))
				this.expect(")")
			} else {
				this.parseTerm(group)
			}
			this.skipWhitespace()
			if (this.peek() !== ",") break
			this.pos++
			/* a comma owes a member: a group that ends on one holds an empty member */
			if (this.skipWhitespace() >= this.input.length || this.peek() === ")") {
				this.failEmptyMember(this.pos)
				break
			}
		}
		return group
	}

	/** One condition into `group`; a term it cannot read is skipped and marks the input malformed */
	private parseTerm(group: FilterGroup): void {
		const start = this.pos
		const condition = this.parseCondition()
		if (condition) {
			group.conditions.push(condition)
			return
		}
		/* a term that starts at its comma is an empty member, beside another comma or leading the group */
		if (this.input[start] === ",") this.failEmptyMember(start)
		else this.fail()
		while (this.pos < this.input.length && this.peek() !== "," && this.peek() !== ")") this.pos++
	}

	private parseCondition(): FilterCondition | null {
		const head = this.readHead()
		return head && { ...head, value: this.readValueFor(head.operator) }
	}

	/** The field and operator: up to the first `.` that an operator and its own `.` follow */
	private readHead(): Omit<FilterCondition, "value"> | null {
		for (let at = this.pos; at < this.input.length; at++) {
			const char = this.input[at]
			if (char === "," || char === "(" || char === ")") return null
			const operator = char === "." ? OPERATOR_PATTERN.exec(this.input.slice(at + 1))?.[1] : undefined
			if (operator !== undefined) {
				const field = this.input.slice(this.pos, at).trim()
				this.pos = at + operator.length + 2
				return field === "" ? null : { field, operator: operator as FilterOperator }
			}
		}
		return null
	}

	private readValueFor(operator: FilterOperator): unknown {
		if ((operator === "in" || operator === "nin") && this.peek() === "(") return this.readList()
		const value = this.readValue()
		/* the value is a keyword here; validation decides which keywords the field accepts */
		return operator === "is" && value.toLowerCase() === "null" ? null : value
	}

	private readList(): string[] {
		this.pos++
		const values: string[] = []
		while (this.skipWhitespace() < this.input.length && this.peek() !== ")") {
			const quoted = this.peek() === '"'
			const at = this.pos
			const value = this.readValue()
			/* a bare member with nothing in it stands beside a comma; only a quoted one may be empty */
			if (quoted || value !== "") values.push(value)
			else this.failEmptyMember(at)
			/* a quoted member ends at its quote: only a comma or the list's end may follow */
			if (quoted && this.skipWhitespace() < this.input.length && this.peek() !== "," && this.peek() !== ")") {
				this.fail()
				return values
			}
			if (this.peek() === ",") {
				this.pos++
				/* a comma owes a member: `in.(x,)` holds an empty one, `in.()` is the only empty list */
				if (this.skipWhitespace() >= this.input.length || this.peek() === ")") this.failEmptyMember(this.pos)
			}
		}
		this.expect(")")
		return values
	}

	/**
	 * A quoted value as written between its quotes, or a bare one up to `,` or `)`, trimmed. `(` is
	 * reserved as `)` is: inside a bare value it marks the input malformed; quote the value to hold it.
	 */
	private readValue(): string {
		if (this.peek() === '"') return this.readQuoted()
		const start = this.pos
		while (this.pos < this.input.length && this.peek() !== "," && this.peek() !== ")") this.pos++
		const value = this.input.slice(start, this.pos).trim()
		if (value.includes("(")) this.fail()
		return value
	}

	private readQuoted(): string {
		let value = ""
		for (this.pos++; this.pos < this.input.length; this.pos++) {
			const char = this.peek()
			if (char === '"') {
				this.pos++
				this.skipWhitespace()
				return value
			}
			if (char === "\\" && this.pos + 1 < this.input.length) this.pos++
			value += this.peek()
		}
		/* an unterminated quote */
		this.fail()
		return value
	}

	private matchKeyword(keyword: string): boolean {
		return this.input.slice(this.pos, this.pos + keyword.length).toLowerCase() === keyword
	}

	private peek(): string {
		return this.input[this.pos] ?? ""
	}

	/** A group that is never closed leaves the input unbalanced: reject it. */
	private expect(char: string): void {
		if (this.peek() === char) this.pos++
		else this.fail()
	}

	/** Step past whitespace; returns the new position */
	private skipWhitespace(): number {
		while (this.pos < this.input.length && /\s/.test(this.peek())) this.pos++
		return this.pos
	}
}

/**
 * The AST of a non-blank filter string, or why it cannot be read, in words for a caller to show: a
 * filter the parser does not fully understand is refused, never reduced to "no filter", which
 * would widen the result to the whole table on a typo.
 */
function readFilter(input: string): { ast: FilterAST } | { error: string } {
	const parser = new FilterParser(input.trim(), input.length - input.trimStart().length)
	const ast = parser.parse()
	return parser.error === null ? { ast } : { error: parser.error }
}

/**
 * The AST of a filter string, or null when there is none or any part of it cannot be read: a
 * filter the parser does not fully understand is refused, never reduced to "no filter", which
 * would widen the result to the whole table on a typo.
 */
function parseFilter(input: string | null | undefined): FilterAST | null {
	if (!input || input.trim() === "") return null
	const read = readFilter(input)
	return "ast" in read ? read.ast : null
}

export { FILTER_OPERATORS, parseFilter, readFilter }
