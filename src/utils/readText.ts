import { stat, readFile } from "node:fs/promises";

export async function readText(p: string, maxBytes = 1_000_000): Promise<string> {
  const s = await stat(p);
  if (s.size > maxBytes) return "";
  return await readFile(p, "utf8");
}
