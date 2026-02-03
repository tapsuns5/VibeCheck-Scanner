import traverseModule from "@babel/traverse";
const traverse: any = (traverseModule as any).default ?? (traverseModule as any);

export function traverseAst(rootNode: any, visitors: any) {
  const isProgram = rootNode?.type === "Program";
  const isFile = rootNode?.type === "File";

  const wrapped =
    isProgram || isFile
      ? rootNode
      : {
          type: "File",
          program: {
            type: "Program",
            sourceType: "module",
            body: [rootNode],
            directives: []
          }
        };

  return traverse(wrapped, visitors);
}
