# zod-schema-dot-org - LLM Development Context

**Package:** `zod-schema-dot-org`
**npm:** `npm install zod-schema-dot-org`
**Purpose:** Converts the full Schema.org specification into strongly-typed Zod schemas with full inheritance, enumerations, and data type support.
**Repository:** Standalone GitHub repo, separate from Linx
**Status:** Completed

## Problem Being Solved

Schema.org defines ~800 types and ~1400 properties in a JSON-LD specification. Developers who want to validate Schema.org-structured data in TypeScript have no official Zod integration. This library solves that by:

1. Fetching the official Schema.org JSON-LD specification
2. Converting it programmatically into Zod schemas
3. Preserving the full Schema.org inheritance hierarchy
4. Providing strongly-typed TypeScript types and zod object inferred from those schemas

---

## Developer API

### Usage Pattern

```typescript
import { Place, Person, Organization, Thing } from 'zod-schema-dot-org'

// Parse and validate
const place = Place.parse(data)

// Safe parse
const result = Place.safeParse(data)

// Infer TypeScript type
type PlaceType = z.infer<typeof Place>

// Access inherited properties (Place extends Thing)
place.name        // from Thing
place.latitude    // from Place
place.address     // from Place
```

### Named Exports

Every Schema.org type is a named export:

```typescript
import {
  // Root
  Thing,
  
  // Places
  Place,
  LocalBusiness,
  Restaurant,
  GasStation,
  
  // People
  Person,
  
  // Organizations
  Organization,
  Corporation,
  
  // Enumerations
  DayOfWeek,
  EventStatusType,
  
  // Data types
  SchemaDate,
  SchemaURL,
  SchemaText,
  
  // ... all ~800 types
} from 'zod-schema-dot-org'
```

---

## Architecture

### Repository Structure

```
zod-schema-dot-org/
├── src/
│   ├── generate/                  # Generation scripts (run at build time)
│   │   ├── fetch.ts               # Fetches schema.org JSON-LD
│   │   ├── parse.ts               # Parses JSON-LD into intermediate format
│   │   ├── convert.ts             # Converts to Zod schema code
│   │   ├── inheritance.ts         # Handles type hierarchy
│   │   ├── enumerations.ts        # Handles enum types
│   │   ├── datatypes.ts           # Maps Schema.org data types to Zod
│   │   ├── circular.ts            # Resolves circular references with z.lazy()
│   │   └── index.ts
│   │
│   ├── generated/                 # ⚠️ AUTO-GENERATED - DO NOT EDIT
│   │   ├── types/                 # One file per Schema.org type
│   │   │   ├── Thing.ts
│   │   │   ├── Place.ts
│   │   │   ├── Person.ts
│   │   │   ├── Organization.ts
│   │   │   └── ... (~800 files)
│   │   ├── enumerations/          # One file per Schema.org enumeration
│   │   │   ├── DayOfWeek.ts
│   │   │   └── ...
│   │   ├── datatypes.ts           # Schema.org data type mappings
│   │   └── index.ts               # Barrel export of everything
│   │
│   └── index.ts                   # Public API entry point
│
├── tests/
│   ├── types/                     # One test file per generated type
│   │   ├── Thing.test.ts
│   │   ├── Place.test.ts
│   │   └── ...
│   ├── inheritance.test.ts        # Tests inheritance chain
│   ├── enumerations.test.ts       # Tests enum values
│   └── generation.test.ts        # Tests the generator itself
│
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Test on every PR
│       ├── release.yml            # Semantic release on merge to main
│       └── schema-sync.yml        # Scheduled check for Schema.org updates
│
├── scripts/
│   └── generate.ts               # Entry point: runs full generation
│
├── package.json
├── tsconfig.json
├── vite.config.ts                 # Vitest config
├── .releaserc.json                # Semantic Release config
├── CHANGELOG.md                   # Auto-generated
└── README.md                      # Primary documentation
```

---

## Generation Process

### Step 1: Fetch Schema.org Specification

```typescript
// src/generate/fetch.ts

const SCHEMA_ORG_JSONLD_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld'

async function fetchSchemaOrg(): Promise<SchemaOrgSpec> {
  const response = await fetch(SCHEMA_ORG_JSONLD_URL)
  const spec = await response.json()
  
  // Store version for change detection
  await writeVersionFile({
    version: spec.version,
    fetchedAt: new Date().toISOString(),
    url: SCHEMA_ORG_JSONLD_URL
  })
  
  return spec
}
```

### Step 2: Parse JSON-LD into Intermediate Format

```typescript
// src/generate/parse.ts

interface ParsedType {
  id: string               // e.g. 'schema:Place'
  label: string            // e.g. 'Place'
  comment: string          // Schema.org description
  parents: string[]        // e.g. ['schema:Thing']
  properties: ParsedProperty[]
  isEnumeration: boolean
  enumerationValues?: string[]
}

interface ParsedProperty {
  id: string               // e.g. 'schema:latitude'
  label: string            // e.g. 'latitude'
  comment: string          // Schema.org description
  rangeIncludes: string[]  // e.g. ['schema:Number', 'schema:Text']
  required: boolean        // schema.org has no required, all optional
}
```

### Step 3: Handle Inheritance

```typescript
// src/generate/inheritance.ts

// Schema.org hierarchy example:
// Thing → Place → LocalBusiness → FoodEstablishment → Restaurant
//
// Zod implementation uses .extend() to chain schemas

function buildInheritanceChain(type: ParsedType, allTypes: ParsedType[]): string {
  if (type.parents.length === 0) {
    // Root type (Thing) - base z.object()
    return `export const Thing = z.object({...})`
  }
  
  const parent = type.parents[0]
  
  // Extend parent schema - inherits ALL parent properties
  return `export const ${type.label} = ${parent}.extend({...})`
}
```

### Step 4: Handle Property Types

```typescript
// src/generate/datatypes.ts

// Schema.org data types mapped to Zod equivalents
const DATA_TYPE_MAP: Record<string, string> = {
  'schema:Text':     'z.string()',
  'schema:Number':   'z.number()',
  'schema:Boolean':  'z.boolean()',
  'schema:Date':     'z.string().date()',       // ISO date string
  'schema:DateTime': 'z.string().datetime()',   // ISO datetime string
  'schema:Time':     'z.string()',
  'schema:URL':      'z.string().url()',
  'schema:Integer':  'z.number().int()',
  'schema:Float':    'z.number()',
}

// Multi-type properties use z.union()
// e.g. address: Text | PostalAddress
// → address: z.union([z.string(), PostalAddress]).optional()
```

### Step 5: Handle Circular References

```typescript
// src/generate/circular.ts

// Schema.org has circular refs e.g.:
// Person.knows → Person
// Organization.member → Person | Organization

// Detected and wrapped in z.lazy()
const PersonSchema: z.ZodType<PersonType> = z.lazy(() =>
  ThingSchema.extend({
    knows: z.array(PersonSchema).optional(),
    // ...
  })
)
```

### Step 6: Handle Enumerations

```typescript
// src/generate/enumerations.ts

// Schema.org enumerations become z.enum()
// e.g. DayOfWeek has values: Monday, Tuesday, etc.

export const DayOfWeek = z.enum([
  'https://schema.org/Monday',
  'https://schema.org/Tuesday',
  'https://schema.org/Wednesday',
  'https://schema.org/Thursday',
  'https://schema.org/Friday',
  'https://schema.org/Saturday',
  'https://schema.org/Sunday',
])

export type DayOfWeek = z.infer<typeof DayOfWeek>
```

---

## Generated Output Format

### Example: Generated Place.ts

```typescript
// src/generated/types/Place.ts
// ⚠️ AUTO-GENERATED - DO NOT EDIT
// Source: https://schema.org/Place
// Schema.org version: 27.0
// Generated: 2024-02-16T10:30:00Z

import { z } from 'zod'
import { Thing } from './Thing'

/**
 * Entities that have a somewhat fixed, physical extension.
 * @see https://schema.org/Place
 */
export const Place = Thing.extend({
  /** Physical address of the item. */
  address: z.union([
    z.string(),
    PostalAddress,
  ]).optional(),

  /** The overall rating, based on a collection of reviews or ratings. */
  aggregateRating: AggregateRating.optional(),

  /** The basic containment relation between a place and one that contains it. */
  containedInPlace: z.lazy(() => Place).optional(),

  /** The basic containment relation between a place and another that it contains. */
  containsPlace: z.array(z.lazy(() => Place)).optional(),

  /** The geo coordinates of the place. */
  geo: z.union([
    GeoCoordinates,
    GeoShape,
  ]).optional(),

  /** The latitude of a location. */
  latitude: z.union([
    z.number(),
    z.string(),
  ]).optional(),

  /** The longitude of a location. */
  longitude: z.union([
    z.number(),
    z.string(),
  ]).optional(),

  /** The opening hours of a certain place. */
  openingHoursSpecification: z.array(OpeningHoursSpecification).optional(),

  // ... all Place properties
})

export type Place = z.infer<typeof Place>
```

---

## Testing (Vitest)

### Test Coverage Requirements

- Minimum 90% coverage enforced in CI
- Every Schema.org type has a corresponding test
- Generator itself is tested against known Schema.org shapes

### Test Structure

```typescript
// tests/types/Place.test.ts

import { describe, it, expect } from 'vitest'
import { Place } from '../../src'

describe('Place', () => {
  it('parses valid Place data', () => {
    const result = Place.safeParse({
      name: 'Membury Services',
      latitude: 51.4476,
      longitude: -1.5363,
    })
    expect(result.success).toBe(true)
  })

  it('inherits Thing properties', () => {
    const result = Place.safeParse({
      name: 'Membury Services',          // Thing property
      description: 'A service station',  // Thing property
      latitude: 51.4476,                 // Place property
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid latitude', () => {
    const result = Place.safeParse({
      name: 'Invalid',
      latitude: 999,  // Out of range
    })
    expect(result.success).toBe(false)
  })

  it('handles optional properties', () => {
    // All Schema.org properties are optional
    const result = Place.safeParse({ name: 'Minimal Place' })
    expect(result.success).toBe(true)
  })
})
```

```typescript
// tests/inheritance.test.ts

import { describe, it, expect } from 'vitest'
import { Thing, Place, LocalBusiness, Restaurant } from '../../src'

describe('Inheritance chain', () => {
  it('Restaurant includes Thing properties', () => {
    // Restaurant → FoodEstablishment → LocalBusiness → Place → Thing
    const result = Restaurant.safeParse({
      name: 'Test Restaurant',  // Thing property
      latitude: 51.4,           // Place property
      currenciesAccepted: 'GBP' // LocalBusiness property
    })
    expect(result.success).toBe(true)
  })
})
```

---

## Technical Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Circular references (Person.knows → Person) | `z.lazy()` wrapper, detected during parse step |
| Multi-type properties (address: Text OR PostalAddress) | `z.union([...])` |
| All properties optional in Schema.org | `.optional()` on every property |
| Schema.org data types → Zod types | Explicit mapping in datatypes.ts |
| ~800 types as named exports | Barrel file with re-exports, tree-shakeable |
| Type name conflicts with TypeScript builtins | Prefix with Schema e.g. SchemaDate |
| Enumerations as full URIs | z.enum() with full schema.org URIs |
| Keeping in sync with Schema.org updates | Weekly GitHub Action, auto PR |

---

## Package Configuration

```json
// package.json
{
  "name": "zod-schema-dot-org",
  "description": "Full Schema.org specification as Zod schemas with TypeScript support",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typedoc": "typedoc src/index.ts",
    "release": "semantic-release"
  },
  "peerDependencies": {
    "zod": ">=3.0.0"
  },
  "devDependencies": {
    "@semantic-release/changelog": "...",
    "@semantic-release/git": "...",
    "semantic-release": "...",
    "tsup": "...",
    "tsx": "...",
    "typedoc": "...",
    "vitest": "..."
  }
}
```

---

## README Structure

The README is the primary documentation. It must cover:

1. **What it is** - One sentence
2. **Installation** - `npm install zod-schema-dot-org zod`
3. **Quick Start** - Working code example in 10 lines
4. **Full Usage** - All major patterns (parse, safeParse, type inference)
5. **Inheritance** - How Place extends Thing
6. **Enumerations** - How to use DayOfWeek etc.
7. **TypeScript** - How to infer types
8. **Schema.org Version** - How to check current version
9. **Contributing** - Commit conventions for semantic release
10. **License** - MIT

---

## Relationship to Linx

`zod-schema-dot-org` is a **standalone open-source library** with no dependency on Linx. However, Linx depends on it:

```
zod-schema-dot-org (standalone, public npm)
         ↓ used by
@linx/core-entities
         ↓ used by
apps/api + @linx/client
```

**In Linx:**
```typescript
// packages/core-entities/src/schemas/schema-org/index.ts
import { Place, Person, Organization, Thing } from 'zod-schema-dot-org'

export { Place, Person, Organization, Thing }
```

---

## Critical Rules for AI Development

### 1. Never Edit Generated Files
**Always:** Only edit files in `src/generate/`
**Never:** Edit files in `src/generated/`
**Why:** Generated files are overwritten on every generation run

### 2. Generator is Source of Truth
**Always:** Fix schema issues in the generator
**Never:** Patch individual generated files
**Why:** Patches would be lost on next generation

### 3. Commit Convention Enforced
**Always:** Use conventional commits (feat:, fix:, chore:, etc.)
**Why:** Semantic Release uses commits to determine version bumps

### 4. All Properties Optional
**Always:** Every Schema.org property gets `.optional()`
**Never:** Mark Schema.org properties as required
**Why:** Schema.org itself has no required properties

### 5. Preserve Schema.org Descriptions
**Always:** Include Schema.org property descriptions as JSDoc comments
**Why:** TypeDoc generates API reference from these comments

### 6. Peer Dependency Pattern
**Always:** Keep zod as peerDependency (not dependency)
**Why:** Prevents version conflicts in consumer projects

---

**Document Version:** 1.0
**Last Updated:** Initial context creation
**Relationship:** Used by @linx/core-entities, standalone public npm package