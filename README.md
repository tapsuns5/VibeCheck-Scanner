# vibecheck

A lightweight codebase checker CLI that scans repos for common security footguns across:
- Next.js (App Router)
- Vite
- NestJS
- Prisma (heuristics)

## Install

```bash
npm i
```

## Build

```bash
npm run build
```

This compiles TypeScript to `dist/cli.js` and makes the `vibecheck` command available.

## Usage

After building, you can run the scanner with:

```bash
# Basic scan of current directory
vibecheck scan

# Scan a specific directory
vibecheck scan /path/to/repo

# Specify tech stack (auto-detects by default)
vibecheck scan --stack nextjs
vibecheck scan --stack vite
vibecheck scan --stack nestjs

# Specify auth framework (auto-detects by default)
vibecheck scan --auth auto
vibecheck scan --auth nextauth
vibecheck scan --auth clerk
vibecheck scan --auth betterauth

# Only scan changed files (useful in CI)
vibecheck scan --changed

# Strict mode - exit with error if blocker/high severity issues found
vibecheck scan --strict

# Output formats
vibecheck scan --format json
vibecheck scan --format sarif --out results.sarif

# Use baseline to ignore known issues
vibecheck scan --baseline .vibecheck-baseline.json
```

## Commands

- `vibecheck scan [dir]` - Run a security scan
- `vibecheck baseline init [dir]` - Create a baseline file of current findings
- `vibecheck ci [dir]` - CI-friendly scan (strict + changed files)

## Options

### Scan Options
- `--stack <stack>`: Tech stack to scan (auto|nextjs|vite|nestjs) - default: auto
- `--auth <auth>`: Auth framework (auto|nextauth|clerk|betterauth|custom|none) - default: auto
- `--strict`: Exit with non-zero code if blocker/high severity issues found
- `--changed`: Only scan files changed vs HEAD (best effort)
- `--baseline <file>`: Path to baseline file to ignore known issues
- `--format <format>`: Output format (console|json|sarif) - default: console
- `--out <file>`: Write report to file (for json/sarif formats)

### Baseline Options
- `--stack <stack>`: Tech stack (same as scan)
- `--auth <auth>`: Auth framework (same as scan)
- `--out <file>`: Output baseline file - default: .vibecheck-baseline.json

## Development

```bash
# Run scan directly with tsx (no build needed)
npm run dev
```

## Notes
- This project uses ESM (`"type":"module"`). In TS source we import local modules using `.js` specifiers (NodeNext), and `tsc` outputs `.js` files into `dist/`.
