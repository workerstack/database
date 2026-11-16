// cleanup.ts's isAlive probes a pid with signal 0, which answers for whatever process holds the pid
// now. A test probes a pid it recorded through tests/support/pid.ts, which knows the process by its
// start time too; cleanup.ts's own test is where isAlive itself is tested.
const MESSAGE =
  "a test probes a pid it recorded through tests/support/pid.ts, which knows the process by its start time, not through cleanup.ts's isAlive";

const CLEANUP = /(?:^|\/)(?:migrate\/core\/)?cleanup(?:\.[jt]s)?$/;

export const rule = {
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!CLEANUP.test(node.source.value)) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && specifier.imported.name === "isAlive")
            context.report({ message: MESSAGE, node: specifier });
        }
      },
    };
  },
};
