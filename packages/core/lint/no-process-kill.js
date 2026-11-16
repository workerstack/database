// A bare process.kill of a recorded pid lands on whatever later process the kernel gave the pid once
// the recorded one was reaped. Tests signal a recorded process through tests/support/pid.ts, which
// knows the process by its start time; a stub through vi.spyOn(process, "kill") names it by string.
const MESSAGE =
  'a test signals a pid it recorded through tests/support/pid.ts, which knows the process by its start time; vi.spyOn(process, "kill") stubs it';

const isProcess = (node) => node?.type === "Identifier" && node.name === "process";

function keyName(node, computed) {
  if (computed) return node.type === "Literal" ? node.value : null;

  return node.type === "Identifier" ? node.name : null;
}

export const rule = {
  create(context) {
    return {
      MemberExpression(node) {
        if (isProcess(node.object) && keyName(node.property, node.computed) === "kill")
          context.report({ message: MESSAGE, node });
      },
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || !isProcess(node.init)) return;

        for (const property of node.id.properties) {
          if (property.type === "Property" && keyName(property.key, property.computed) === "kill")
            context.report({ message: MESSAGE, node: property });
        }
      },
    };
  },
};
