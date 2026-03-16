# @linxhq/zod-schema-dot-org

Converts the full [Schema.org](https://schema.org) JSON-LD specification into strongly-typed Zod schemas with full inheritance, enumerations, and data type support.

## Installation

```bash
npm install @linxhq/zod-schema-dot-org zod
```

> **Note:** `zod` is a peer dependency and must be installed alongside this package.

## Usage

Every export is both a Zod schema and a TypeScript type — no need for separate type imports.

```ts
import { Place, Person, Organization, Thing } from '@linxhq/zod-schema-dot-org'

// Use as a Zod schema for runtime validation
const place = Place.parse({
  name: 'Membury Services',
  latitude: 51.4476,
  longitude: -1.5363,
})

// Safe parse
const result = Place.safeParse(data)
if (result.success) {
  console.log(result.data.name)
}

// Use as a TypeScript type directly
// Note: This pattern does NOT work with createCustomSchemas(). Use .create() instead.
const myPlace: Place = {
  name: 'Membury Services',
  latitude: 51.4476,
}

```

### Creating typed objects with `.create()`

Use `.create()` to construct typed objects in your own code. TypeScript infers the type directly from the schema and catches unknown properties at the call site — no type annotation needed.

```ts
// ✅ Recommended
import { Place } from '@linxhq/zod-schema-dot-org'

const somePlace = Place.create({
  name: 'Membury Services',
  latitude: 51.4476,
  someUnexpectedKey: 'value',  // ❌ TypeScript error: 'someUnexpectedKey' does not exist in type 'Place'
})

somePlace.name  // string | undefined ✓
```

```ts
// ⚠️ Avoid — requires a redundant type import and won't catch typos. Does not work with createCustomSchemas().
const place: Place = {
  name: 'Membury Services',
  latitude: 51.4476,
}
```

> **Note:** `.create()` performs no runtime validation — it returns the strongly-typed object as-is. Use `.parse()` or `.safeParse()` when validating untrusted external data.

### Inheritance

Schema.org types preserve their full inheritance chain. For example, `Restaurant` extends `FoodEstablishment` extends `LocalBusiness` extends `Place` extends `Thing`:

```ts
import { Restaurant } from '@linxhq/zod-schema-dot-org'

const restaurant = Restaurant.parse({
  name: 'The Great Oak',         // from Thing
  latitude: 51.45,               // from Place
  currenciesAccepted: 'GBP',    // from LocalBusiness
  servesCuisine: 'British',     // from Restaurant
})
```

### Arrays

Properties that reference other Schema.org types (non-primitive) accept both single values and arrays:

```ts
import { Place } from '@linxhq/zod-schema-dot-org'

// Single value
Place.parse({
  name: 'My Shop',
  openingHoursSpecification: { opens: '09:00', closes: '17:00', dayOfWeek: 'Monday' },
})

// Array of values
Place.parse({
  name: 'My Shop',
  openingHoursSpecification: [
    { opens: '09:00', closes: '17:00', dayOfWeek: 'Monday' },
    { opens: '10:00', closes: '16:00', dayOfWeek: 'Saturday' },
  ],
})
```

Primitive properties (`string`, `number`, `boolean`) remain single-value only.

### Enumerations

Schema.org enumerations are generated as `z.enum()` with their actual member values:

```ts
import { DayOfWeek, EventStatusType } from '@linxhq/zod-schema-dot-org'

const day = DayOfWeek.parse('Monday')           // 'Monday' | 'Tuesday' | ...
const status = EventStatusType.parse('EventScheduled')  // 'EventScheduled' | 'EventCancelled' | ...
```

### Customizing Schemas

#### Per-schema customization with `.extend()`

Use Zod's built-in `.extend()` to override properties on a single schema:

```ts
import { z } from 'zod'
import { Place } from '@linxhq/zod-schema-dot-org'

const StrictPlace = Place.extend({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})
type StrictPlace = z.infer<typeof StrictPlace>
```

You can also use `.pick()`, `.omit()`, and `.merge()`:

```ts
const PlaceBasics = Place.pick({ name: true, latitude: true, longitude: true })
```

#### Cascading overrides with `createCustomSchemas()`

Override a foundation type (like `Time`, `Date`, or any schema) and have the change cascade through every schema that references it:

```ts
import { z } from 'zod'
import { createCustomSchemas } from '@linxhq/zod-schema-dot-org'

const schemas = createCustomSchemas({
  overrides: {
    // All properties typed as schema:Time now validate HH:MM format
    Time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    // All properties typed as schema:Date now validate ISO dates
    Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }
})

// OpeningHoursSpecification.opens/closes now validate time format
// Place.openingHoursSpecification uses the updated OpeningHoursSpecification
const place = schemas.Place.parse({
  name: 'My Shop',
  openingHoursSpecification: { opens: '09:00', closes: '17:30' },
})

// Default exports are unaffected
import { Place } from '@linxhq/zod-schema-dot-org'
Place.parse({ opens: 'any string' }) // still works
```

#### Property wrapping with `additionalProperties`

Wrap every property across all schemas with additional fields. Each property becomes `Array<Extra & { value: OriginalType }>` — with **full per-property type inference**.

This is useful for attaching metadata like IDs, sources, or scores alongside each data value.

```ts
import { z } from 'zod'
import { createCustomSchemas } from '@linxhq/zod-schema-dot-org'

const schemas = createCustomSchemas({
  additionalProperties: z.object({ id: z.string() }),
})

const place = schemas.Place.create({
  name: [{ id: 'n1', value: 'Membury Services' }],
  latitude: [{ id: 'l1', value: 51.4476 }],
  openingHoursSpecification: [
    { id: 'slot-1', value: { opens: '09:00', closes: '17:00' } },
    { id: 'slot-2', value: { opens: '10:00', closes: '16:00' } },
  ],
})

// TypeScript knows the exact type of each property:
//   name:  Array<{ id: string, value: string }>
//   latitude:  Array<{ id: string, value: number | string }>
//   openingHoursSpecification:  Array<{ id: string, value: OpeningHoursSpecification }>
```

You can combine `additionalProperties` with `overrides`:

```ts
const schemas = createCustomSchemas({
  additionalProperties: z.object({ id: z.string(), source: z.string() }),
  overrides: {
    Time: z.string().regex(/^\d{2}:\d{2}$/),
  },
})
```

#### `.create()` with custom schemas

When using `createCustomSchemas()`, always use `.create()` on the returned schemas. The original Schema.org types won't match your custom shape:

```ts
const schemas = createCustomSchemas({
  additionalProperties: z.object({ id: z.string() }),
})

// ✅ Correct — .create() is typed against the wrapped shape
const place = schemas.Place.create({
  name: [{ id: 'n1', value: 'My Shop' }],
  unknownProp: [],  // ❌ TypeScript error
})

// ❌ Wrong — the original Place type doesn't know about wrapping
import { Place } from '@linxhq/zod-schema-dot-org'
const bad: Place = schemas.Place.create({ ... })
```

## What's Included

- ~800+ Schema.org types as Zod schemas
- Full inheritance hierarchy via `.extend()`
- Circular reference handling via `z.lazy()`
- All properties optional (matching Schema.org semantics)
- Non-primitive properties accept single values or arrays (`T | T[]`)
- Enumerations generated as `z.enum()` with actual member values
- Declarative property wrapping with `additionalProperties` and full type inference
- Cascading type overrides via `createCustomSchemas()`
- TypeScript type inference for every schema

## Inverse Properties

The package exposes a utility for working with Schema.org's `schema:inverseOf` annotations — property pairs where each direction implies the other (e.g. `containedInPlace` ↔ `containsPlace`).

```ts
import { getInverseProperty, INVERSE_PROPERTIES } from '@linxhq/vine-schema-dot-org'

getInverseProperty('containedInPlace')  // → 'containsPlace'
getInverseProperty('memberOf')          // → 'member'
getInverseProperty('name')              // → undefined (no inverse)

// All 58 pairs as a plain record
INVERSE_PROPERTIES['containsPlace']     // → 'containedInPlace'
```

Also importable via the dedicated entry point:

```ts
import { getInverseProperty } from '@linxhq/vine-schema-dot-org/inverse-properties'
```

The mapping is fully derived from Schema.org's own `schema:inverseOf` annotations and is regenerated automatically when `pnpm run build` runs. Adding a new inverse pair to the Schema.org spec will be picked up on the next build with no manual changes needed.

## Development

### Prerequisites

- Node.js >= 18
- pnpm

### Scripts

| Command | Description |
| --- | --- |
| `pnpm install` | Installs dependencies and runs a full build via `prepare` |
| `pnpm run build` | Clean generate + compile + copy JSON artifacts (`schema-meta.json`, `schema-inverse-properties.json`) |
| `pnpm run generate` | Compile generator + run it to produce `src/generated/` (types, schema-meta.json, schema-inverse-properties.json) |
| `pnpm test` | Run tests |

### Project Structure

```
src/
  fetch.ts              # Fetches schema.org JSON-LD
  parse.ts              # Parses RDF graph → typed structure (incl. inverseOf)
  convert.ts            # Generates TS types + schema-meta.json + schema-inverse-properties.json
  generator.ts          # Entry point: fetch → parse → convert
  generated/            # Auto-generated (do not edit)
    index.ts            # Barrel — exports all VineJS schemas and types
    schema-meta.json    # Type hierarchy + property typeRefs
    schema-inverse-properties.json  # inverseOf pairs (58 pairs from Schema.org)
  classify-property.ts  # isEntityType(), isFactoidType(), classifyProperty()
  inverse-properties.ts # getInverseProperty(), INVERSE_PROPERTIES
  customize.ts          # createCustomSchemas() — overrides and property wrapping
  index.ts              # Public API entry point
```

> `src/generated/` is auto-generated. Do not edit files in it directly — run `pnpm run generate` to rebuild after changes to `parse.ts` or `convert.ts`.

## Contributing

See [CONTRIBUTING.md](#) for how to run the generator, update snapshots, and other development guidelines.

## License

[ISC](LICENSE)
