/** The differential project's setup: every oracle's box installed once, before any file imports from one */
import { installOracle, ORACLES } from "./oracles.ts"

export default function setup(): void {
	for (const version of ORACLES) installOracle(version)
}
