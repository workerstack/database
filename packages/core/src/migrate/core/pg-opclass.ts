/**
 * The operator class an index element of a built-in type takes when it spells none, as
 * GetDefaultOpClass finds it: the type's own default under the access method, else the default of
 * the type it reaches by binary coercion or as a polymorphic type. Undefined for a type database
 * knows no default for (an enum, an extension's), which leaves an index match unknown
 * (pg-index-match.ts).
 */
import type { ColumnType } from "./pg-nodes.ts";

/**
 * The types whose default operator class under each access method is named for them, `{type}_ops`
 * (brin's `{type}_minmax_ops`), as Postgres 17's pg_opclass marks them opcdefault.
 * tests/integration/postgres/opclass-defaults.test.ts holds these tables to its catalog
 */
// lookup-table: by access method, the types whose default class is named for them
const NAMED: Readonly<Record<string, readonly string[]>> = {
  brin: [
    "bit",
    "bpchar",
    "bytea",
    "char",
    "date",
    "float4",
    "float8",
    "int2",
    "int4",
    "int8",
    "interval",
    "macaddr",
    "macaddr8",
    "name",
    "numeric",
    "oid",
    "pg_lsn",
    "text",
    "tid",
    "time",
    "timestamp",
    "timestamptz",
    "timetz",
    "uuid",
    "varbit",
  ],
  btree: [
    "bit",
    "bool",
    "bpchar",
    "bytea",
    "char",
    "date",
    "float4",
    "float8",
    "inet",
    "int2",
    "int4",
    "int8",
    "interval",
    "jsonb",
    "macaddr",
    "macaddr8",
    "money",
    "name",
    "numeric",
    "oid",
    "oidvector",
    "pg_lsn",
    "record",
    "text",
    "tid",
    "time",
    "timestamp",
    "timestamptz",
    "timetz",
    "tsquery",
    "tsvector",
    "uuid",
    "varbit",
    "xid8",
  ],
  gist: ["box", "circle", "point", "tsquery", "tsvector"],
  hash: [
    "aclitem",
    "bool",
    "bpchar",
    "bytea",
    "char",
    "cid",
    "date",
    "float4",
    "float8",
    "inet",
    "int2",
    "int4",
    "int8",
    "interval",
    "jsonb",
    "macaddr",
    "macaddr8",
    "name",
    "numeric",
    "oid",
    "oidvector",
    "pg_lsn",
    "record",
    "text",
    "tid",
    "time",
    "timestamp",
    "timestamptz",
    "timetz",
    "uuid",
    "xid",
    "xid8",
  ],
  spgist: ["box", "inet", "text"],
};

// lookup-table: by `method:type`, each default class named otherwise, the polymorphic types' among them
const OTHER: Readonly<Record<string, string>> = {
  "brin:anyrange": "range_inclusion_ops",
  "brin:box": "box_inclusion_ops",
  "brin:inet": "inet_inclusion_ops",
  "btree:anyarray": "array_ops",
  "btree:anymultirange": "multirange_ops",
  "btree:anyrange": "range_ops",
  "gin:anyarray": "array_ops",
  "gin:jsonb": "jsonb_ops",
  "gin:tsvector": "tsvector_ops",
  "gist:anymultirange": "multirange_ops",
  "gist:anyrange": "range_ops",
  "gist:polygon": "poly_ops",
  "hash:anyarray": "array_ops",
  "hash:anymultirange": "multirange_ops",
  "hash:anyrange": "range_ops",
  "spgist:anyrange": "range_ops",
  "spgist:point": "quad_point_ops",
  "spgist:polygon": "poly_ops",
};

// lookup-table: the built-in types GetDefaultOpClass reaches another type's class from where they have none of their own, by binary coercion or as a polymorphic type
const COERCED: Readonly<Record<string, string>> = {
  cidr: "inet",
  datemultirange: "anymultirange",
  daterange: "anyrange",
  int2vector: "anyarray",
  int4multirange: "anymultirange",
  int4range: "anyrange",
  int8multirange: "anymultirange",
  int8range: "anyrange",
  nummultirange: "anymultirange",
  numrange: "anyrange",
  oidvector: "anyarray",
  regclass: "oid",
  regcollation: "oid",
  regconfig: "oid",
  regdictionary: "oid",
  regnamespace: "oid",
  regoper: "oid",
  regoperator: "oid",
  regproc: "oid",
  regprocedure: "oid",
  regrole: "oid",
  regtype: "oid",
  tsmultirange: "anymultirange",
  tsrange: "anyrange",
  tstzmultirange: "anymultirange",
  tstzrange: "anyrange",
  varchar: "text",
};

/** The default class `method` has for `type` itself, undefined where it has none */
const ownClass = (method: string, type: string): string | undefined =>
  OTHER[`${method}:${type}`] ??
  (NAMED[method]?.includes(type) === true ? `${type}${method === "brin" ? "_minmax_ops" : "_ops"}` : undefined);

/** The class an element of `method` over `column` takes when it spells none; undefined where database cannot tell */
function defaultClass(method: string, column: ColumnType): string | undefined {
  const type = column.dims > 0 ? "anyarray" : column.type;
  const coerced = COERCED[type];

  return ownClass(method, type) ?? (coerced === undefined ? undefined : ownClass(method, coerced));
}

export { defaultClass };
