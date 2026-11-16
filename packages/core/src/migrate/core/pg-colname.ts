/**
 * The name Postgres gives an index's expression column, as transformIndexStmt takes it from
 * FigureIndexColname before ChooseIndexColumnNames: a column's or field's own name, a function's,
 * a cast's type where its argument has none, and the keyword of a construct (`coalesce`, `row`,
 * `json_value`, …). Undefined where FigureColnameInternal finds none, which the index names `expr`.
 * Only what an index expression can hold is read: subqueries, aggregates and the SQL value
 * functions, which Postgres refuses there, are left out.
 */
import type { Node } from "./pg-nodes.ts";

/** A name and how strongly it names its expression: 2 for a column's or a function's, 1 for a fallback a cast or CASE gives */
type Named = { name: string; strength: 1 | 2 } | undefined;

// lookup-table: the keyword each construct names its column by, as FigureColnameInternal returns it with strength 2
const KEYWORDS: Readonly<Record<string, string>> = {
  A_ArrayExpr: "array",
  CoalesceExpr: "coalesce",
  JsonArrayConstructor: "json_array",
  JsonArrayQueryConstructor: "json_array",
  JsonObjectConstructor: "json_object",
  JsonParseExpr: "json",
  JsonScalarExpr: "json_scalar",
  JsonSerializeExpr: "json_serialize",
  RowExpr: "row",
  XmlSerialize: "xmlserialize",
};

// lookup-table: the keyword of each op of a construct that names its column by its op
const OPS: Readonly<Record<string, string>> = {
  IS_GREATEST: "greatest",
  IS_LEAST: "least",
  IS_XMLCONCAT: "xmlconcat",
  IS_XMLELEMENT: "xmlelement",
  IS_XMLFOREST: "xmlforest",
  IS_XMLPARSE: "xmlparse",
  IS_XMLPI: "xmlpi",
  IS_XMLROOT: "xmlroot",
  IS_XMLSERIALIZE: "xmlserialize",
  JSON_EXISTS_OP: "json_exists",
  JSON_QUERY_OP: "json_query",
  JSON_VALUE_OP: "json_value",
};

/** The last String of a name list, undefined when it ends otherwise (a `*`, a subscript) */
const lastString = (parts: unknown): string | undefined =>
  ((parts as Node[] | undefined)?.at(-1)?.["String"] as Node | undefined)?.["sval"] as string | undefined;

/** A name of `name`'s strength, undefined without one */
const named = (name: string | undefined, strength: 1 | 2): Named =>
  name === undefined ? undefined : { name, strength };

/** The keyword a construct named by its op takes, as greatest or json_value */
const byOp = (node: Node): Named => named(OPS[String(node["op"])], 2);

/** A cast's or CASE's own name, the inner one's where that names its expression outright, else `fallback` */
const unlessNamed = (inner: Named, fallback: string | undefined): Named =>
  inner?.strength === 2 ? inner : named(fallback, 1);

// lookup-table: how each node FigureColnameInternal reads names its column; any other by KEYWORDS
const FIGURES: Readonly<Record<string, (node: Node) => Named>> = {
  A_Expr: (node) => named(node["kind"] === "AEXPR_NULLIF" ? "nullif" : undefined, 2),
  A_Indirection: (node) => named(lastString(node["indirection"]), 2) ?? figure(node["arg"]),
  CaseExpr: (node) => unlessNamed(figure(node["defresult"]), "case"),
  CollateClause: (node) => figure(node["arg"]),
  ColumnRef: (node) => named(lastString(node["fields"]), 2),
  FuncCall: (node) => named(lastString(node["funcname"]), 2),
  JsonFuncExpr: byOp,
  MinMaxExpr: byOp,
  TypeCast: (node) => unlessNamed(figure(node["arg"]), lastString((node["typeName"] as Node)["names"])),
  XmlExpr: byOp,
};

/** FigureColnameInternal over one parse node */
function figure(expr: unknown): Named {
  const [[type, node] = []] = Object.entries((expr ?? {}) as Node);

  if (type === undefined) return undefined;

  return FIGURES[type]?.(node as Node) ?? named(KEYWORDS[type], 2);
}

/** The name Postgres gives an index column computing `expr`, undefined for `expr` */
const figureName = (expr: unknown): string | undefined => figure(expr)?.name;

export { figureName };
