import schemaMeta from './generated/schema-meta.json'

type SchemaMetaEntry = {
  parent?: string
  isDataType?: boolean
  isEnumeration?: boolean
  typeRefs: Record<string, string[]>
}

const meta = schemaMeta as Record<string, SchemaMetaEntry>

/**
 * Schema.org hierarchy ancestors whose descendants are always value types.
 * StructuredValue covers GeoCoordinates, PostalAddress, OpeningHoursSpecification, etc.
 * DataType and Enumeration are detected via flags in schema-meta.json.
 */
const FACTOID_ANCESTORS = new Set(['StructuredValue'])

const cache = new Map<string, boolean>()

/**
 * Returns true if a Schema.org type is a "value type" (factoid),
 * i.e. it is a DataType, Enumeration, or descends from StructuredValue.
 *
 * Types not found in schema-meta.json are assumed to be factoid values.
 * Everything else in the Thing hierarchy is treated as an entity.
 */
export function isFactoidType(typeName: string): boolean {
  if (cache.has(typeName)) return cache.get(typeName)!

  const entry = meta[typeName]

  // Type not in meta at all — unknown, treat as factoid
  if (!entry) {
    cache.set(typeName, true)
    return true
  }

  // Flagged as DataType or Enumeration by the generator
  if (entry.isDataType || entry.isEnumeration) {
    cache.set(typeName, true)
    return true
  }

  // Is a known factoid ancestor itself
  if (FACTOID_ANCESTORS.has(typeName)) {
    cache.set(typeName, true)
    return true
  }

  // Walk parent chain to check for factoid ancestors
  let current: string | undefined = entry.parent
  while (current) {
    if (FACTOID_ANCESTORS.has(current)) {
      cache.set(typeName, true)
      return true
    }
    const parentEntry = meta[current]
    if (parentEntry?.isDataType || parentEntry?.isEnumeration) {
      cache.set(typeName, true)
      return true
    }
    current = parentEntry?.parent
  }

  cache.set(typeName, false)
  return false
}

/**
 * Returns true if a Schema.org type is an entity type —
 * i.e. it does NOT descend from StructuredValue, DataType, or Enumeration.
 */
export function isEntityType(typeName: string): boolean {
  return !isFactoidType(typeName)
}

export type PropertyKind = 'factoid' | 'entity' | 'mixed'

/**
 * Classifies a property on a Schema.org type as 'factoid', 'entity', or 'mixed'.
 *
 * - 'factoid': all type refs are value types (scalars or structured values)
 * - 'entity': all type refs are entity types
 * - 'mixed': some refs are entities, some are values
 *
 * Properties with no typeRefs in the metadata default to 'factoid'.
 */
export function classifyProperty(schemaType: string, property: string): PropertyKind {
  const refs = findTypeRefs(schemaType, property)
  if (!refs || refs.length === 0) return 'factoid'

  const hasEntity = refs.some(isEntityType)
  const hasFactoid = refs.some(isFactoidType)

  if (hasEntity && hasFactoid) return 'mixed'
  if (hasEntity) return 'entity'
  return 'factoid'
}

/**
 * Walks up the type hierarchy to find typeRefs for a property,
 * since properties may be inherited from parent types.
 */
export function findTypeRefs(schemaType: string, property: string): string[] | undefined {
  let current: string | undefined = schemaType
  while (current) {
    const refs = meta[current]?.typeRefs?.[property]
    if (refs) return refs
    current = meta[current]?.parent
  }
  return undefined
}

/**
 * Returns all properties of a Schema.org type, classified as factoid or entity.
 * Walks the full parent chain to include inherited properties.
 */
export function classifyAllProperties(schemaType: string): Record<string, { kind: PropertyKind; typeRefs: string[] }> {
  const result: Record<string, { kind: PropertyKind; typeRefs: string[] }> = {}
  let current: string | undefined = schemaType

  while (current) {
    const typeMeta: SchemaMetaEntry | undefined = meta[current]
    if (typeMeta?.typeRefs) {
      for (const [prop, refs] of Object.entries(typeMeta.typeRefs)) {
        if (!(prop in result)) {
          result[prop] = {
            kind: classifyProperty(schemaType, prop),
            typeRefs: refs,
          }
        }
      }
    }
    current = typeMeta?.parent
  }

  return result
}
