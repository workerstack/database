/**
 * What a Postgres file's own transaction control does inside the transaction Atlas runs a file
 * without `-- atlas:txmode none` in: a BEGIN or START TRANSACTION there starts none, as Postgres
 * warns, while COMMIT, ROLLBACK and PREPARE TRANSACTION end Atlas's own
 */
// lookup-table: the controls that start a transaction, which inside Atlas's start none
const STARTS = /* @__PURE__ */ new Set(["BEGIN", "START TRANSACTION"])

/** What `control`, as the classifier names it, does there */
export const controlEffect = (control: string): string =>
	STARTS.has(control) ? "starts no transaction, as one is already open" : "ends that transaction"
