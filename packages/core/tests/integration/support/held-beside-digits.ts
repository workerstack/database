/**
 * QL2's datasets for the stored-keys walk (stored-keys.ts): a value the list holds apart beside a
 * numeric-looking TEXT, in a column of no declared type, on libsql, bun:sqlite and D1.
 */
import type { StoredCase } from "./stored-keys.ts"

/*
 * QL2: a value held apart beside a numeric-looking TEXT in a column of no declared type, whose bound
 * the next page must compare as SQLite compares the stored value: a cast's affinity turned '10' into 10
 */
export const HELD_BESIDE_DIGITS: Record<string, StoredCase> = {
	"text() holding ±Infinity beside '10'": { ddl: "", mode: "text", values: ["9e999", "'10'", "'a'", "-9e999"] },
	"text() holding a REAL above 10 beside '10'": { ddl: "", mode: "text", values: ["50.5", "'10'", "'a'", "2.5"] },
}
/* QL2: an integer past 2^53, held apart and bound as its digits; libsql's number intMode throws on reading it, before any list */
export const HELD_WIDE_BESIDE_DIGITS: StoredCase = {
	ddl: "",
	mode: "text",
	values: ["9007199254740993", "'10'", "'a'"],
}
