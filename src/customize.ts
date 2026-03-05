import vine from '@vinejs/vine'
import * as allSchemas from './generated'
import schemaMeta from './generated/schema-meta.json'

type AllSchemas = typeof allSchemas
type SchemaOverrides = Record<string, any>

interface TypeMeta {
    parent?: string
    typeRefs: Record<string, string[]>
}

const meta = schemaMeta as Record<string, TypeMeta>

/** Extract the interface type from a schema's create() method. */
type InferSchemaData<T> = T extends { create(data: infer D): any } ? D : never

/** Registry for overrides-only (no wrapping) */
type SchemaRegistry = { [K in keyof AllSchemas]: AllSchemas[K] }

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface CustomSchemaOptions {
    overrides?: SchemaOverrides
    additionalProperties?: ReturnType<typeof vine.object>
}

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/**
 * Computes the set of type names affected by the given overrides.
 */
function computeAffectedTypes(overrides: SchemaOverrides): Set<string> {
    const overrideNames = new Set(Object.keys(overrides))
    const affected = new Set<string>()

    const referencedBy: Record<string, Set<string>> = {}
    for (const [typeName, typeMeta] of Object.entries(meta)) {
        for (const refTypes of Object.values(typeMeta.typeRefs)) {
            for (const refType of refTypes) {
                if (!referencedBy[refType]) referencedBy[refType] = new Set()
                referencedBy[refType].add(typeName)
            }
        }
    }

    const queue = [...overrideNames]
    while (queue.length > 0) {
        const current = queue.shift()!
        if (referencedBy[current]) {
            for (const dependent of referencedBy[current]) {
                if (!affected.has(dependent) && !overrideNames.has(dependent)) {
                    affected.add(dependent)
                    queue.push(dependent)
                }
            }
        }
        for (const [typeName, typeMeta] of Object.entries(meta)) {
            if (typeMeta.parent === current && !affected.has(typeName) && !overrideNames.has(typeName)) {
                affected.add(typeName)
                queue.push(typeName)
            }
        }
    }

    return affected
}

/**
 * Rebuilds a single schema with overrides applied to its properties.
 * VineJS schemas use getProperties() + vine.object() for reconstruction.
 */
function rebuildSchema(
    typeName: string,
    registry: Record<string, any>,
    overrides: SchemaOverrides,
): any {
    const typeMeta = meta[typeName]
    if (!typeMeta) {
        return (allSchemas as any)[typeName]
    }

    // Get parent properties (from registry if rebuilt, else original)
    let parentProps: Record<string, any> = {}
    if (typeMeta.parent) {
        const parentSchema = registry[typeMeta.parent] ?? (allSchemas as any)[typeMeta.parent]
        if (parentSchema && typeof parentSchema.getProperties === 'function') {
            parentProps = { ...parentSchema.getProperties() }
        }
    }

    // Get own properties from the original schema
    const original = (allSchemas as any)[typeName]
    let ownProps: Record<string, any> = {}
    if (original && typeof original.getProperties === 'function') {
        const allProps = original.getProperties()
        const origParent = (allSchemas as any)[typeMeta.parent!]
        const origParentProps = origParent && typeof origParent.getProperties === 'function'
            ? origParent.getProperties()
            : {}
        for (const [k, v] of Object.entries(allProps)) {
            if (!(k in origParentProps)) {
                ownProps[k] = v
            }
        }
    }

    // Apply property overrides: for properties that reference overridden types,
    // replace the VineJS schema with vine.any().optional() (since the override
    // changes the expected type and VineJS doesn't support dynamic union reconstruction)
    const propOverrides: Record<string, any> = {}
    let hasChange = false
    for (const [propName, refTypes] of Object.entries(typeMeta.typeRefs)) {
        for (const refType of refTypes) {
            if (overrides[refType] || registry[refType]) {
                // The property references an overridden type — use vine.any().optional()
                // to accept the new type at runtime
                propOverrides[propName] = vine.any().optional()
                hasChange = true
                break
            }
        }
    }

    if (!hasChange && !registry[typeMeta.parent!]) {
        return original
    }

    const combined = { ...parentProps, ...ownProps, ...propOverrides }
    return vine.object(combined).allowUnknownProperties()
}

/**
 * Topologically sorts types so parents are built before children.
 */
function topologicalSort(affected: Set<string>): string[] {
    const visited = new Set<string>()
    const result: string[] = []

    function visit(name: string) {
        if (visited.has(name)) return
        visited.add(name)

        const typeMeta = meta[name]
        if (typeMeta?.parent && affected.has(typeMeta.parent)) {
            visit(typeMeta.parent)
        }
        if (typeMeta) {
            for (const refTypes of Object.values(typeMeta.typeRefs)) {
                for (const ref of refTypes) {
                    if (affected.has(ref)) visit(ref)
                }
            }
        }
        result.push(name)
    }

    for (const name of affected) {
        visit(name)
    }

    return result
}

/**
 * Wraps all properties of a VineJS object schema with the declarative pattern:
 * each property becomes vine.array(vine.object({...extra, value: vine.any()})).optional()
 */
function wrapSchemaProperties(
    schema: any,
    additionalProperties: ReturnType<typeof vine.object>,
): any {
    const props = typeof schema.getProperties === 'function'
        ? schema.getProperties()
        : {}
    const extraProps = typeof additionalProperties.getProperties === 'function'
        ? additionalProperties.getProperties()
        : {}
    const wrappedProps: Record<string, any> = {}

    for (const propName of Object.keys(props)) {
        wrappedProps[propName] = vine.array(
            vine.object({ ...extraProps, value: vine.any() })
        ).optional()
    }

    return vine.object(wrappedProps).allowUnknownProperties()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a customized set of Schema.org VineJS schemas.
 *
 * **Declarative wrapping** (with `additionalProperties`): every property on every
 * schema is wrapped as `Array<Extra & { value: OriginalType }>`.
 *
 * **Type overrides** (with `overrides`): substitute Schema.org types (e.g. `Time`,
 * `Date`) with custom VineJS schemas. All schemas that reference the overridden type
 * are automatically rebuilt.
 *
 * @example
 * ```typescript
 * import vine from '@vinejs/vine'
 * import { createCustomSchemas } from 'vine-schema-dot-org'
 *
 * const schemas = createCustomSchemas({
 *   additionalProperties: vine.object({ id: vine.string(), source: vine.string() }),
 * })
 * ```
 */
export function createCustomSchemas(
    optionsOrOverrides: CustomSchemaOptions | SchemaOverrides,
): SchemaRegistry {
    // Normalise legacy plain-overrides call shape
    let overrides: SchemaOverrides
    let additionalProperties: ReturnType<typeof vine.object> | undefined

    if ('overrides' in optionsOrOverrides || 'additionalProperties' in optionsOrOverrides) {
        const opts = optionsOrOverrides as CustomSchemaOptions
        overrides = opts.overrides ?? {}
        additionalProperties = opts.additionalProperties
    } else {
        overrides = optionsOrOverrides as SchemaOverrides
    }

    // --- Phase 1: apply type overrides ---
    const affected = computeAffectedTypes(overrides)
    const registry: Record<string, any> = {}

    for (const [name, schema] of Object.entries(overrides)) {
        registry[name] = schema
    }

    const sorted = topologicalSort(affected)
    for (const typeName of sorted) {
        const rebuilt = rebuildSchema(typeName, registry, overrides)
        registry[typeName] = Object.assign(rebuilt, { create(data: unknown) { return data } })
    }

    // --- Phase 2: declarative wrapping ---
    if (additionalProperties) {
        const allTypeNames = Object.keys(meta)

        for (const typeName of allTypeNames) {
            const schema = registry[typeName] ?? (allSchemas as any)[typeName]
            if (!schema || typeof schema.getProperties !== 'function') continue

            const wrapped = wrapSchemaProperties(schema, additionalProperties)
            registry[typeName] = Object.assign(wrapped, {
                create(data: unknown) { return data },
            })
        }
    }

    // Return a proxy that falls back to original schemas for non-overridden types
    return new Proxy(registry, {
        get(target, prop: string) {
            return target[prop] ?? (allSchemas as any)[prop]
        },
    }) as SchemaRegistry
}
