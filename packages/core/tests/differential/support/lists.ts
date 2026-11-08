/**
 * The list oracle: a case (list-cases.ts) built by one version of comb with that version's drizzle, walked page by
 * page on a driver, and judged against the engine's own ORDER BY over the same rows on the same driver. The rule:
 * the walk serves every row the filter selects exactly once, in the engine's order, each row projected to `select`,
 * or it stops at a refusal the walk's mode allows. Versions are loaded as their entry module (entry.ts), so
 * everything here takes them untyped: the releases differ in their types, not in the calls a case makes.
 */
import type * as Entry from "./entry.ts"
import { type Column, type ListCase, orderOf, type Reads } from "./list-cases.ts"

export type Lib = typeof Entry
type Row = Record<string, unknown>

/**
 * A database a case opens: statements run in order as one round trip where the driver batches them (each D1
 * statement costs a round trip to workerd, which dominates the run), a query's rows, and drizzle over it built
 * by the version's own driver
 */
export type Db = {
	all(sql: string): Promise<Row[]>
	close(): Promise<void>
	orm: any
	run(...statements: string[]): Promise<void>
}
export type Driver = {
	name: string
	open(lib: Lib, relations?: object): Promise<Db>
	/** what the driver's drizzle reads back, so its cases store only that */
	reads: Reads
}

/** What a walk saw: every id it served in order, and the error that stopped it, if one did */
export type Walk = {
	error: { key: string | undefined; message: string; page: number } | undefined
	/** the rows whose fields are not exactly the case's `select` */
	misprojected: string[]
	pages: number
	served: string[]
}

/** The drizzle column of `column` named `name`, from the version's own builders */
function columnOf(lib: Lib, column: Column, name: string): any {
	const { blob, customType, integer, numeric, real, text } = lib as any
	switch (column.builder) {
		case "blob":
			return blob(name, { mode: column.mode })
		case "cents":
			return customType({
				dataType: () => "integer",
				fromDriver: (value: number) => value / 100,
				toDriver: (value: number) => Math.round(value * 100),
			})(name)
		case "folded":
			return customType({
				dataType: () => "text",
				fromDriver: (value: string) => value,
				toDriver: (value: string) => value,
			})(name)
		case "integer":
			return "mode" in column ? integer(name, { mode: column.mode }) : integer(name)
		case "numeric":
			return "mode" in column ? numeric(name, { mode: column.mode }) : numeric(name)
		case "real":
			return real(name)
		case "text":
			return text(name)
	}
}

const KEY_NAMES = ["k", "k2"] as const

/** The case's table `name` as the version's drizzle declares it: id, its keys, and the filtered g */
function tableOf(lib: Lib, name: string, c: ListCase): any {
	const keys = Object.fromEntries(
		c.keys.map((kind, index) => [KEY_NAMES[index], columnOf(lib, kind.drizzle, KEY_NAMES[index] as string)]),
	)
	return (lib.sqliteTable as any)(name, {
		g: (lib.integer as any)("g"),
		id: (lib.text as any)("id").primaryKey(),
		...keys,
	})
}

const ddlOf = (name: string, c: ListCase): string =>
	`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${c.keys.map((kind, index) => `${KEY_NAMES[index]} ${kind.ddl}`).join(", ")}, g INTEGER)`
const valuesOf = (rows: ListCase["rows"]): string => rows.map((row) => `(${row.join(", ")})`).join(", ")
const idOf = (row: readonly string[]): string => (row[0] as string).slice(1, -1)

/**
 * The engine's answer for the case: each id its filter selects, with its dense rank in the engine's own order of
 * the case's keys (a walk may serve ties in any order), and its position once comb's tiebreak, the id in the first
 * key's direction, makes the order total (where a page by number starts and ends)
 */
export type Truth = Map<string, { position: number; rank: number }>

export async function truthOf(driver: Driver, lib: Lib, c: ListCase): Promise<Truth> {
	const db = await driver.open(lib)
	try {
		await db.run(ddlOf("t", c), `INSERT INTO t VALUES ${valuesOf(c.rows)}`)
		const order = c.keys
			.map((_, index) => {
				const column = KEY_NAMES[index]
				const nullsFirst = c.nulls[index] === undefined ? c.dirs[index] === "desc" : c.nulls[index] === "first"
				return `(${column} IS NULL) ${nullsFirst ? "DESC" : "ASC"}, ${column} ${c.dirs[index]}`
			})
			.join(", ")
		const where = c.filter ? ` WHERE ${c.filter.where}` : ""
		const ranked = await db.all(
			`SELECT id, dense_rank() OVER (ORDER BY ${order}) AS r, row_number() OVER (ORDER BY ${order}, id ${c.dirs[0]}) - 1 AS p FROM t${where}`,
		)
		return new Map(ranked.map((row) => [String(row["id"]), { position: Number(row["p"]), rank: Number(row["r"]) }]))
	} finally {
		await db.close()
	}
}

type Built = { m: any; relations: object; shards: Db[]; t: any }

/** The case's shards, each holding its share of the rows in t and in m, the table a joined list reads its keys from */
async function build(driver: Driver, lib: Lib, c: ListCase): Promise<Built> {
	const t = tableOf(lib, "t", c)
	const m = tableOf(lib, "m", c)
	const relations = (lib.defineRelations as any)({ t }, () => ({}))
	const shards: Db[] = []
	for (let shard = 0; shard < c.shards; shard++) {
		const db = await driver.open(lib, c.path === "listOptions" ? relations : undefined)
		shards.push(db)
		const mine = c.rows.filter((_, index) => index % c.shards === shard)
		const inserts =
			mine.length > 0 ? [`INSERT INTO t VALUES ${valuesOf(mine)}`, `INSERT INTO m VALUES ${valuesOf(mine)}`] : []
		await db.run(ddlOf("t", c), ddlOf("m", c), ...inserts)
	}
	return { m, relations, shards, t }
}

const SEALED = { cursorScope: "differential", cursorSecret: "p".repeat(32) }
type Page = { items: Row[]; meta: { hasMore: boolean; nextCursor: string | null } }

/** One page of the case's list on `built`, for the parsed request */
async function pageOf(lib: Lib, c: ListCase, built: Built, parsed: unknown): Promise<Page> {
	const { applyListQuery, buildDerivedListQuery, buildListQuery, paginateMerged, queryHelpers, sql } = lib as any
	const { m, shards, t } = built
	const sort = KEY_NAMES.slice(0, c.keys.length)
	const page = ([items, meta]: [Row[], Page["meta"]]): Page => ({ items, meta })
	if (c.path === "merged" || c.path === "merged-derived") {
		const sortColumns = Object.fromEntries(sort.map((field) => [field, sql`${t[field]}`]))
		const list =
			c.path === "merged"
				? buildListQuery({ ...SEALED, merged: {}, parsed, table: t })
				: buildDerivedListQuery({ ...SEALED, dialect: "sqlite", idColumn: t.id, merged: {}, parsed, sortColumns })
		const columns = c.path === "merged" ? (lib.getTableColumns as any)(t) : { id: t.id, ...sortColumns }
		const reads = await Promise.all(
			shards.map((db) => applyListQuery((extras: object) => db.orm.select({ ...columns, ...extras }).from(t), list)),
		)
		return page(paginateMerged(reads, list))
	}
	const db = shards[0] as Db
	if (c.path === "listOptions") {
		const options = queryHelpers.listOptions(parsed, SEALED)
		const rows = await db.orm.query.t.findMany({
			extras: options.extras,
			limit: options.limit,
			offset: options.offset,
			orderBy: options.orderBy,
			...(options.where && { where: options.where }),
		})
		return page(queryHelpers.paginate(rows, options))
	}
	const keyOf = (field: string) =>
		c.path === "joined" ? m[field] : c.path.startsWith("expr") ? sql`${t[field]}` : t[field]
	const anchored = c.path === "anchored" || c.path === "expr-anchored" || c.path === "joined"
	const sortColumns = Object.fromEntries(sort.map((field) => [field, keyOf(field)]))
	const list =
		c.path === "table"
			? buildListQuery({ ...SEALED, parsed, table: t })
			: buildDerivedListQuery({
					...SEALED,
					...(anchored ? { anchor: { idColumn: t.id, table: t } } : { idColumn: t.id }),
					parsed,
					sortColumns,
				})
	const select = (extras: object) =>
		c.path === "joined"
			? db.orm
					.select({ id: t.id, ...sortColumns, ...extras })
					.from(t)
					.innerJoin(m, (lib.eq as any)(m.id, t.id))
			: db.orm.select({ ...(lib.getTableColumns as any)(t), ...sortColumns, ...extras }).from(t)
	return page(queryHelpers.paginate(await applyListQuery(select, list), list))
}

/** The list schema of the case: its keys sortable, g filterable when it filters, its fields when it selects */
function schemaOf(lib: Lib, c: ListCase): any {
	const sort = KEY_NAMES.slice(0, c.keys.length)
	return (lib.createListQuerySchema as any)({
		pagination: { defaultLimit: c.limit, maxLimit: 3 },
		sort,
		...(c.filter && { filter: { g: "number" } }),
		...(c.select && { fields: { scalars: ["id", ...sort, "g"] } }),
	})
}

/** The rows of `items` whose fields are not exactly the case's `select` */
function misprojected(c: ListCase, items: Row[]): string[] {
	if (c.select === undefined) return []
	const want = c.select.split(",").toSorted().join(",")
	return items
		.filter((row) => Object.keys(row).toSorted().join(",") !== want)
		.map((row) => JSON.stringify(Object.keys(row)))
}

/** Walk the case's list: by cursor until no next cursor, or by page number until no next page; a loop ends at a cap */
export async function walk(driver: Driver, lib: Lib, c: ListCase): Promise<Walk> {
	const built = await build(driver, lib, c)
	const result: Walk = { error: undefined, misprojected: [], pages: 0, served: [] }
	const schema = schemaOf(lib, c)
	let cursor: string | undefined
	try {
		for (; result.pages < c.rows.length + 3; result.pages++) {
			const parsed = schema.parse({
				limit: String(c.limit),
				order: orderOf(c),
				...(c.mode === "page" && { page: String(result.pages + 1) }),
				...(cursor && { cursor }),
				...(c.filter && { filter: c.filter.query }),
				...(c.select && { select: c.select }),
			})
			const { items, meta } = await pageOf(lib, c, built, parsed)
			const ids = items.map((row) => String(row["id"]))
			result.served.push(...ids)
			result.misprojected.push(...misprojected(c, items))
			if (c.deleting && c.mode === "cursor" && ids.length > 0) {
				const listed = ids.map((id) => `'${id}'`).join(", ")
				for (const db of built.shards)
					await db.run(`DELETE FROM t WHERE id IN (${listed})`, `DELETE FROM m WHERE id IN (${listed})`)
			}
			if (c.mode === "page" ? !meta.hasMore : meta.nextCursor === null) return result
			cursor = c.mode === "cursor" ? (meta.nextCursor as string) : undefined
		}
	} catch (error) {
		const thrown = error as { cause?: unknown; errorKey?: string; message?: string }
		result.error = {
			key: thrown.errorKey,
			message: String(thrown.cause ?? thrown.message).slice(0, 200),
			page: result.pages + 1,
		}
	} finally {
		for (const db of built.shards) await db.close()
	}
	return result
}

/** The ids a case stores, by the literal its first column holds */
export const idsOf = (c: ListCase): string[] => c.rows.map(idOf)
