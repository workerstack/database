// A spawned kill, a bare process.kill and migrate's isAlive all reach a pid by number: once the
// recorded process is reaped, they land on whatever later process the kernel gave it. Tests signal
// and probe a recorded process through tests/support/pid.ts, which knows it by its start time; a
// shell's kill of its own `$$` names no recorded pid.
const MESSAGE =
  "a test spawns no kill, pkill or killall of a pid: signal a recorded process through tests/support/pid.ts";

const PID_KILL =
  'A test signals a pid it recorded through tests/support/pid.ts, which knows the process by its start time; vi.spyOn(process, "kill") stubs it';

const PID_PROBE =
  "A test probes a pid it recorded through tests/support/pid.ts, which knows the process by its start time";

// the one module that signals by pid, and the one test of the module isAlive lives in
const PID_MODULE = /(^|\/)packages\/core\/tests\/support\/pid\.ts$/;
const CLEANUP_TEST = /(^|\/)packages\/core\/src\/migrate\/core\/cleanup\.test\.ts$/;
const CLEANUP_SOURCE = /(^|\/)migrate\/core\/cleanup[^/]*$|^\.\/cleanup[^/]*$/;

const KILLERS = new Set(["kill", "killall", "pkill"]);
const SHELLS = new Set(["bash", "dash", "sh", "zsh"]);
const SPAWNS = new Set(["execFile", "execFileSync", "spawn", "spawnSync"]);
const EXECS = new Set(["exec", "execSync"]);

function calleeName(callee) {
  if (callee.type === "Identifier") return callee.name;

  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;

  return "";
}

// a literal string's text, a template's with each placeholder as a word, else null
function text(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;

  if (node?.type === "TemplateLiteral") return node.quasis.map((quasi) => quasi.value.cooked).join("X");

  return null;
}

const command = (word) => KILLERS.has(word.split("/").at(-1));

// a shell script that runs a kill of anything but its own `$$`
function killsInScript(script) {
  return script.split(/[;&|\n]+/).some((segment) => {
    const words = segment.trim().split(/\s+/);

    return command(words[0]) && words.at(-1) !== "$$";
  });
}

// the script a shell spawn runs: the string after `-c` in its argument array
function shellScript(args) {
  if (args?.type !== "ArrayExpression") return null;
  const at = args.elements.findIndex((element) => text(element) === "-c");

  return at === -1 ? null : text(args.elements[at + 1]);
}

function spawnsKill(name, [file, args]) {
  const first = text(file);

  if (first === null) return false;

  if (EXECS.has(name)) return killsInScript(first);

  if (!SPAWNS.has(name)) return false;

  if (command(first)) return true;
  const script = SHELLS.has(first) ? shellScript(args) : null;

  return script !== null && killsInScript(script);
}

const isProcess = (node) => node?.type === "Identifier" && node.name === "process";

// `kill` as a key: `.kill`, `["kill"]`, `{ kill }` or `{ "kill": k }`
const isKillKey = (key, computed) =>
  (key.type === "Literal" && key.value === "kill") || (!computed && key.type === "Identifier" && key.name === "kill");

const isProcessKill = (node) => isProcess(node.object) && isKillKey(node.property, node.computed);

// `const { kill } = process`, and any pattern that takes `kill` out of process
const destructuresKill = (node) =>
  node.id.type === "ObjectPattern" &&
  isProcess(node.init) &&
  node.id.properties.some((prop) => prop.type === "Property" && isKillKey(prop.key, prop.computed));

// an import of isAlive, under any local name, from migrate's cleanup module
const importsIsAlive = (node) =>
  CLEANUP_SOURCE.test(node.source.value) &&
  node.specifiers.some((spec) => spec.type === "ImportSpecifier" && spec.imported.name === "isAlive");

export const rule = {
  create(context) {
    const file = String(context.filename).replaceAll("\\", "/");

    return {
      CallExpression(node) {
        if (spawnsKill(calleeName(node.callee), node.arguments)) context.report({ message: MESSAGE, node });
      },
      ImportDeclaration(node) {
        if (!CLEANUP_TEST.test(file) && importsIsAlive(node)) context.report({ message: PID_PROBE, node });
      },
      MemberExpression(node) {
        if (!PID_MODULE.test(file) && isProcessKill(node)) context.report({ message: PID_KILL, node });
      },
      VariableDeclarator(node) {
        if (!PID_MODULE.test(file) && destructuresKill(node)) context.report({ message: PID_KILL, node });
      },
    };
  },
};
