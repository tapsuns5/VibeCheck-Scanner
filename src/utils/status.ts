import readline from "node:readline";

type StatusOptions = {
  words?: string[];
  intervalMs?: number;
  prefix?: string;
};

export function startStatusLine(opts: StatusOptions = {}) {
  const words = opts.words ?? ["Running", "Scanning", "Vibing"];
  const intervalMs = opts.intervalMs ?? 650;
  const prefix = opts.prefix ?? "";

  // ✅ Write status to STDERR so JSON on STDOUT stays clean for jq/CI
  const stream = process.stderr;

  let i = 0;
  const render = () => {
    const w = words[i % words.length];
    i++;
    readline.clearLine(stream, 0);
    readline.cursorTo(stream, 0);
    stream.write(`${prefix}${w}...`);
  };

  render();
  const t = setInterval(render, intervalMs);

  const stop = (finalMessage?: string) => {
    clearInterval(t);
    readline.clearLine(stream, 0);
    readline.cursorTo(stream, 0);
    if (finalMessage) stream.write(finalMessage + "\n");
  };

  return { stop };
}
