import type { Finding } from "./types.js";

export function toSarif(findings: Finding[], rootDir: string) {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: { driver: { name: "vibecheck", rules: [] } },
        results: findings.map((f) => ({
          ruleId: f.ruleId,
          level:
            f.severity === "blocker" || f.severity === "high"
              ? "error"
              : f.severity === "med"
              ? "warning"
              : "note",
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: f.file.startsWith(rootDir) ? f.file.slice(rootDir.length + 1) : f.file
                },
                region: { startLine: f.line ?? 1, startColumn: (f.col ?? 0) + 1 }
              }
            }
          ]
        }))
      }
    ]
  };
}
