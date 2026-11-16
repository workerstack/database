/**
 * How an index made on a partitioned table reaches each partition, as DefineIndex and
 * AttachPartitionEnsureIndexes take it there: attached to a partition's own index that matches it, or
 * cloned onto the partition. A match is CompareIndexInfo's, by the operator class and collation each
 * element resolves to, so a default spelled on one side and left out on the other match. An element
 * database cannot resolve (an expression's collation, a type it knows no default class for) leaves
 * the match unknown, and the clone made in its place is marked `unsure`.
 */
import {
  candidate,
  chosen,
  besideTable,
  indexesOn,
  type IndexElement,
  type IndexFact,
  type Wanted,
} from "./pg-index-facts.ts";
import { type ColumnType, type Facts, keyOf } from "./pg-nodes.ts";
import { defaultClass } from "./pg-opclass.ts";
import { partitionsOf } from "./pg-partition-order.ts";

/** How two indexes compare: alike, different, or alike but for what database cannot resolve */
type Match = "different" | "same" | "unknown";

/** A column's type as its index reads it: a domain's base, with the domain's collation where the column spells none */
function resolved(facts: Facts, column: ColumnType): ColumnType {
  const domain = column.dims > 0 ? undefined : facts.domains.get(column.type);

  if (domain === undefined) return column;

  return { ...domain.over, collation: column.collation ?? domain.over.collation };
}

/** How two spellings compare once each left out resolves to `fallback`, the side's own */
function compared(one: string | undefined, two: string | undefined, fallbacks: Array<string | undefined>): Match {
  if (one === two) return "same";
  const [first, second] = [one ?? fallbacks[0], two ?? fallbacks[1]];

  if (first === undefined || second === undefined) return "unknown";

  return first === second ? "same" : "different";
}

/** A spelled name list as one key, undefined when not spelled */
const spelled = (parts: readonly string[], schema: string): string | undefined =>
  parts.length === 0 ? undefined : keyOf(parts, schema);

/** The column the `i`th element of `index` reads, resolved; undefined for an expression or a column database does not know */
function columnOf(facts: Facts, index: IndexFact, i: number): ColumnType | undefined {
  const name = index.shape.elements[i]?.name;
  const column = name === undefined ? undefined : facts.columnTypes.get(index.table)?.get(name);

  return column === undefined ? undefined : resolved(facts, column);
}

/** How the `i`th elements of two indexes compare by operator class and collation */
function elementMatch(facts: Facts, pair: readonly [IndexFact, IndexFact], i: number): Match[] {
  const columns = pair.map((index) => columnOf(facts, index, i));
  // both have an `i`th element: matchOf compares elements only where the shapes match bare
  const [one, two] = pair.map((index) => index.shape.elements[i] as IndexElement) as [IndexElement, IndexElement];

  const classes = columns.map((column, side) =>
    column === undefined ? undefined : defaultClass((pair[side] as IndexFact).shape.method, column),
  );

  const collations = columns.map((column) => (column === undefined ? undefined : (column.collation ?? "default")));

  return [
    compared(spelled(one.opclass, facts.schema), spelled(two.opclass, facts.schema), classes),
    compared(spelled(one.collation, facts.schema), spelled(two.collation, facts.schema), collations),
  ];
}

/** A shape with its elements' operator classes and collations left out, which elementMatch compares */
const bare = (index: IndexFact): string =>
  JSON.stringify({
    ...index.shape,
    elements: index.shape.elements.map((each) => ({ ...each, collation: [], opclass: [] })),
  });

/** How a partition's index `own` compares with its parent's `fact` */
function matchOf(facts: Facts, own: IndexFact, fact: IndexFact): Match {
  if (JSON.stringify(own.shape) === JSON.stringify(fact.shape)) return "same";

  if (bare(own) !== bare(fact)) return "different";
  const matches = own.shape.elements.flatMap((_, i) => elementMatch(facts, [own, fact], i));

  if (matches.includes("different")) return "different";

  return matches.includes("unknown") ? "unknown" : "same";
}

/**
 * The first of a partition's `candidates` that `fact` attaches to, and whether one may match where
 * database cannot tell, so the clone made for none is marked
 */
function matchIn(
  facts: Facts,
  candidates: readonly IndexFact[],
  fact: IndexFact,
): { match: IndexFact | undefined; unknown: boolean } {
  const matches = candidates.map((each) => matchOf(facts, each, fact));

  return { match: candidates[matches.indexOf("same")], unknown: matches.includes("unknown") };
}

/** `made` and every index cloned under it marked unsure, as Postgres may have attached an index in its place */
function markUnmatched(facts: Facts, made: IndexFact): void {
  for (const each of facts.indexes.values()) {
    for (let at: IndexFact | undefined = each; at !== undefined; at = at.parent) {
      if (at === made) {
        each.unsure = "match";
        break;
      }
    }
  }
}

/** `fact` cloned onto `table`, attached to it when `attached`, and on to each partition of `table` */
function clone(facts: Facts, fact: IndexFact, { attached, table }: { attached: boolean; table: string }): IndexFact {
  const copy: IndexFact = { columns: [...fact.columns], kind: fact.kind, shape: structuredClone(fact.shape), table };

  if (attached) copy.parent = fact;
  facts.indexes.set(chosen(facts, copy), copy);
  spread(facts, copy);

  return copy;
}

/** `clones` marked unsure where their names cut to one across partitioned and plain partitions */
function markUnsure(facts: Facts, clones: readonly IndexFact[]): void {
  const groups = new Map<string, IndexFact[]>();

  for (const each of clones) {
    const key = candidate(each, 0);
    groups.set(key, [...(groups.get(key) ?? []), each]);
  }

  for (const group of groups.values()) {
    const partitioned = group.filter((each) => facts.partitioned.has(each.table)).length;

    if (partitioned > 0 && partitioned < group.length) for (const each of group) each.unsure ??= "order";
  }
}

/**
 * `fact` on each partition of its table, as DefineIndex recurses: the partition's first index
 * attached to no other that matches it, a constraint's for a constraint, is attached to it; else a
 * clone of it is made there
 */
function spread(facts: Facts, fact: IndexFact): void {
  const { children, sure } = partitionsOf(facts, fact.table);
  const clones: IndexFact[] = [];

  for (const child of children) {
    const free = indexesOn(facts, child).filter(
      (each) => each.parent === undefined && (fact.kind === "index" || each.kind !== "index"),
    );

    settle(facts, fact, { candidates: free, clones, table: child });
  }

  if (!sure) markUnsure(facts, clones);
}

/**
 * `fact` on the partition `table`: attached to the first of `candidates` that matches it, else
 * cloned there, the clone pushed to `clones` and marked unsure where Postgres may have attached one
 */
function settle(
  facts: Facts,
  fact: IndexFact,
  {
    candidates,
    clones = [],
    table,
  }: { candidates: readonly IndexFact[]; clones?: IndexFact[] | undefined; table: string },
): void {
  const { match, unknown } = matchIn(facts, candidates, fact);

  if (match !== undefined) {
    match.parent = fact;

    return;
  }

  const copy = clone(facts, fact, { attached: true, table });
  clones.push(copy);

  if (unknown) markUnmatched(facts, copy);
}

/** An index made: under `name` when given, else the one Postgres chooses, and on to its table's partitions when `recurse` */
function make(facts: Facts, { fact, name }: Wanted, recurse: boolean): void {
  facts.indexes.set(name === undefined ? chosen(facts, fact) : besideTable(fact.table, name, facts.schema), fact);

  if (recurse) spread(facts, fact);
}

export { clone, make, settle };
