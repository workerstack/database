/**
 * Which tables a column change reaches down partitions and inheritance, as Postgres recurses it. A
 * rename reaches every table under the one named, as renameatt does (it refuses ONLY where a table
 * has children). A DROP COLUMN, as ATExecDropColumn recurses, reaches each partition, and each
 * inheritance child that holds the column from the dropping parents alone: one that never declared
 * it (attislocal false) and that no other parent still gives it (attinhcount reaching 0). ONLY
 * stops it at the table named. `facts.tables` holds the columns each table declares itself, so a
 * table it has no columns for is unknown, and held to declare the column, which keeps it.
 */
import type { Facts } from "./pg-nodes.ts";

/** Each table `table` is a direct parent of, with its parents */
const childrenOf = (facts: Facts, table: string) =>
  [...facts.parents].filter(([, parents]) => parents.some((each) => each.parent === table));

/** Whether `table` declares `column` itself, or is unknown to the history */
const declares = (facts: Facts, table: string, column: string): boolean =>
  facts.tables.get(table)?.has(column) !== false;

/** Whether `table` has `column`, its own or from a parent */
const holds = (facts: Facts, table: string, column: string): boolean =>
  declares(facts, table, column) || (facts.parents.get(table) ?? []).some((each) => holds(facts, each.parent, column));

/** Every column `table` has, its own and its parents' */
const columnsOf = (facts: Facts, table: string): string[] => [
  ...(facts.tables.get(table) ?? []),
  ...(facts.parents.get(table) ?? []).flatMap((each) => columnsOf(facts, each.parent)),
];

/** `table` and every table under it, by partition or inheritance, each once */
function descendants(facts: Facts, table: string): string[] {
  const found = [table];

  for (let at = 0; at < found.length; at++)
    for (const [child] of childrenOf(facts, found[at] as string)) if (!found.includes(child)) found.push(child);

  return found;
}

/** A column a DROP COLUMN drops, and whether it recurses, which it does but under ONLY */
type Drop = { column: string; recurse: boolean };

/** The tables a DROP COLUMN on `table` drops its column from */
function droppedFrom(facts: Facts, table: string, { column, recurse }: Drop): string[] {
  const dropped = [table];

  if (!recurse) return dropped;

  for (let at = 0; at < dropped.length; at++) {
    for (const [child, parents] of childrenOf(facts, dropped[at] as string)) {
      if (dropped.includes(child)) continue;
      const partition = parents.some((each) => each.partition);
      const given = parents.some((each) => !dropped.includes(each.parent) && holds(facts, each.parent, column));

      if (partition || (!declares(facts, child, column) && !given)) dropped.push(child);
    }
  }

  return dropped;
}

/**
 * A DROP COLUMN: the column gone from each table it drops from. Under ONLY, each child that held it
 * from `table` keeps it as its own, as Postgres marks it attislocal
 */
function dropColumn(facts: Facts, table: string, { column, recurse }: Drop): void {
  for (const each of droppedFrom(facts, table, { column, recurse })) {
    facts.tables.get(each)?.delete(column);
    facts.columnTypes.get(each)?.delete(column);
  }

  if (!recurse) for (const [child] of childrenOf(facts, table)) facts.tables.get(child)?.add(column);
}

/** A NO INHERIT: `table` leaves `parent`, and keeps each column the parent gave it as its own */
function noInherit(facts: Facts, table: string, parent: string): void {
  const own = facts.tables.get(table);

  for (const each of columnsOf(facts, parent)) own?.add(each);
  const parents = (facts.parents.get(table) ?? []).filter((each) => each.parent !== parent);

  if (parents.length === 0) facts.parents.delete(table);
  else facts.parents.set(table, parents);
}

export { descendants, droppedFrom, dropColumn, noInherit };
