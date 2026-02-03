export function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}
