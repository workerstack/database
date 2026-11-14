import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { declaredNames } from "./public-declarations.js"
import { entryFiles, findPackageRoot, starredNames } from "./public-surface.js"

/* A name a public entry exports reaches every consumer's import list, so a bare one-word name (Run, Dialect) collides
 * with the consumer's own, and a Cloudflare Workers type name (ExecutionContext) collides with the ambient type a
 * Worker already has. Both are named for what they are: MigrateRun, not Run. */

/* one capital, then lowercase only: Run, Dialect, Manifest. RunId, DatabaseError and defineConfig are not bare. */
const BARE = /^[A-Z][a-z]+$/

const DECLARATION =
	/^(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|function|const|var|let|namespace|enum)\s+([A-Za-z_$][\w$]*)/gm

/* the names @cloudflare/workers-types declares at the top level, read once from the installed package */
const WORKERS_TYPES = (() => {
	const root = dirname(createRequire(import.meta.url).resolve("@cloudflare/workers-types/package.json"))
	const source = readFileSync(join(root, "index.d.ts"), "utf8")
	return new Set([...source.matchAll(DECLARATION)].map((match) => match[1]))
})()

function faultOf(name, entry) {
	if (WORKERS_TYPES.has(name)) {
		return `\`${name}\` is exported from "${entry}" under the name of a Cloudflare Workers type, so a consumer importing both collides: name it for what it is`
	}
	if (BARE.test(name)) {
		return `\`${name}\` is exported from "${entry}" as a bare name: a consumer's own ${name} collides with it, so name it for what it is (MigrateRun, not Run)`
	}
	return null
}

function exportedNames(node, filename) {
	if (node.type === "ExportAllDeclaration") {
		if (node.exported) return [node.exported.name ?? node.exported.value]
		const source = node.source.value
		return source.startsWith(".") ? starredNames(resolve(dirname(filename), source)) : []
	}
	const specifiers = node.specifiers.map((specifier) => specifier.exported.name ?? specifier.exported.value)
	return [...declaredNames(node), ...specifiers]
}

export const rule = {
	create(context) {
		const root = findPackageRoot(context.filename)
		const entry = root === null ? undefined : entryFiles(root).get(context.filename)
		if (entry === undefined) return {}
		const check = (node) => {
			for (const name of exportedNames(node, context.filename)) {
				const message = faultOf(name, entry)
				if (message !== null) context.report({ message, node })
			}
		}
		return { ExportAllDeclaration: check, ExportNamedDeclaration: check }
	},
}
