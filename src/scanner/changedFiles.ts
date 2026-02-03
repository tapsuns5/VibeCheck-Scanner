import { execSync } from "node:child_process";

export async function getChangedFiles(rootDir: string): Promise<string[] | null> {
  try {
    const out = execSync("git diff --name-only HEAD", { cwd: rootDir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (!out) return [];
    return out.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}
