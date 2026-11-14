/**
 * What a `c` helper records on the column it builds, for codegen to read at runtime: the helper's
 * kind and the very values it was given. Kept under a registered symbol on drizzle's builder
 * config, which the built column keeps, so a second copy of database reads what the first wrote.
 */

/** The `c` helpers, by name */
type ColumnMetaKind =
	| "boolean"
	| "createdAt"
	| "deletedAt"
	| "enum"
	| "id"
	| "integer"
	| "json"
	| "real"
	| "ref"
	| "serialId"
	| "text"
	| "timestamp"
	| "updatedAt"

/** A column's database metadata: its helper, and the constraints, enum values, states, schema or prefix it took */
type ColumnMeta = {
	constraints?: Readonly<Record<string, unknown>> | undefined
	kind: ColumnMetaKind
	prefix?: string | undefined
	schema?: unknown
	states?: unknown
	values?: readonly string[] | undefined
}

const DATABASE_COLUMN: unique symbol = /* @__PURE__ */ Symbol.for("database.column")

/** `builder` with `meta` recorded on its config; the options a helper was not given are left out */
function withColumn<B>(builder: B, meta: { [K in keyof ColumnMeta]: ColumnMeta[K] | undefined }): B {
	const recorded = Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined))
	;(builder as unknown as { config: Record<symbol, unknown> }).config[DATABASE_COLUMN] = recorded
	return builder
}

/** The database metadata a built column (or its builder) carries; undefined for a column no `c` helper built */
function columnMeta(column: unknown): ColumnMeta | undefined {
	const config = (column as { config?: Record<symbol, unknown> | undefined } | null | undefined)?.config
	return config?.[DATABASE_COLUMN] as ColumnMeta | undefined
}

/** `record` without the keys set to undefined, as a key set to undefined is one left out */
function defined(record: Readonly<Record<string, unknown>>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

/**
 * A c.enum's options as its column's record: its constraints (the flags, its `format`, and a `schema`
 * a JavaScript caller passes, kept for codegen to refuse by name), the rest its state machine, none
 * when it names no state
 */
function enumMeta(
	values: readonly string[],
	options: {
		format?: string | undefined
		nomutate?: boolean | undefined
		private?: boolean | undefined
		schema?: unknown
		tenant?: boolean | undefined
	} = {},
): { [K in keyof ColumnMeta]: ColumnMeta[K] | undefined } {
	const { format, nomutate, private: hidden, schema, tenant, ...rest } = options
	const constraints = defined({ format, nomutate, private: hidden, schema, tenant })
	const states = defined(rest)
	const whole = Object.keys(constraints).length === 0 && Object.keys(states).length === Object.keys(options).length
	return {
		constraints: Object.keys(constraints).length === 0 ? undefined : constraints,
		kind: "enum",
		/* a machine given alone is kept as the very object passed, as assertTransition takes it too */
		states: Object.keys(states).length === 0 ? undefined : whole ? options : states,
		values,
	}
}

export { columnMeta, enumMeta, withColumn, type ColumnMetaKind, type ColumnMeta }
