/**
 * A statement that runs code its text does not show, which the history then cannot follow: a DO
 * block, a CALL, or a call of a function the history defined. Each can move a table to another
 * persistence, tablespace or access method, or drop a CHECK, through EXECUTE, so what the history
 * knew of where its relations are and what its CHECKs prove is unknown after one. A move then reads
 * the target's catalog, and an ATTACH warns of its scan until a later file proves its bound again.
 */
import { type Facts, keyOf, type Node, names } from "./pg-nodes.ts";

/**
 * Whether a statement runs code its text does not show, from its nodes, as nodesOf lists them.
 * A CREATE FUNCTION's body runs only when called, so a call inside it is not one
 */
function runsUnseen(nodes: ReadonlyArray<[string, Node]>, { defined, schema }: Facts): boolean {
  if (nodes.some(([type]) => type === "CreateFunctionStmt")) return false;

  return nodes.some(
    ([type, node]) =>
      type === "DoStmt" ||
      type === "CallStmt" ||
      (type === "FuncCall" && defined.has(keyOf(names(node["funcname"]), schema))),
  );
}

/** What the history knows of where relations are and what a CHECK proves, forgotten after code it cannot read ran */
function forgetUnseen(facts: Facts): void {
  facts.storage.clear();

  for (const index of facts.indexes.values()) index.tablespace = undefined;
  facts.proofs.clear();
}

export { forgetUnseen, runsUnseen };
