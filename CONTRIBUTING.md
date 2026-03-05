# Contributing to @linxhq/zod-schema-dot-org

## Prerequisites

- Node.js >= 18
- pnpm

## Setup

```bash
pnpm install
```

This runs `prepare`, which executes a full build (generate + compile).

## Running the Generator

The generator fetches the Schema.org JSON-LD spec and emits Zod schemas into `src/generated/`.

```bash
pnpm run generate
```

This compiles the generator source via `tsconfig.generator.json`, then runs it to produce `src/generated/`.

To do a clean build (removes `src/generated/` first):

```bash
pnpm run build
```

## Running Tests

```bash
pnpm test
```

Tests use Jest. The full-generation test (`__tests__/full-generation.test.ts`) generates schemas into a temp directory and snapshots representative files (`Thing.ts`, `Person.ts`, `Place.ts`).

When `CI=true`, the full-generation test limits itself to a subset of 5 types to keep runtime small.

## Updating Snapshots

If you change the generator output (e.g. modifying emit logic in `src/convert.ts`), snapshots will fail. Update them with:

```bash
pnpm test -- --updateSnapshot
```

Review the snapshot diff to confirm the changes are intentional before committing.

## Project Structure

```
src/
  generator.ts        # Entry point for the generator
  fetch.ts            # Fetches Schema.org JSON-LD
  parse.ts            # Parses JSON-LD into intermediate format
  convert.ts          # Converts to Zod schema code and emits files
  datatypes.ts        # Schema.org → Zod type mappings
  generated/          # Auto-generated output (do not edit)
    types/            # One file per Schema.org type
    enumerations/     # One file per enumeration
    index.ts          # Barrel export
  index.ts            # Public API entry point
__tests__/
  full-generation.test.ts   # End-to-end generation + snapshot tests
  generation.test.ts        # Generator unit tests
  index.test.ts             # Basic schema output tests
```

## Key Rules

- **Never edit `src/generated/`** — it is overwritten on every generation run. Fix issues in the generator source files instead.
- **All Schema.org properties are optional** — every property gets `.optional()`.
- **Use conventional commits** — `feat:`, `fix:`, `chore:`, etc. for semantic release.
