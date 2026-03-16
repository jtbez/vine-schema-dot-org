import inverseProps from './generated/schema-inverse-properties.json'

/**
 * A map of Schema.org property names to their inverses, derived from
 * schema:inverseOf annotations in the Schema.org specification.
 *
 * Both directions are present: if A → B then B → A.
 * e.g. { containedInPlace: 'containsPlace', containsPlace: 'containedInPlace', ... }
 *
 * Regenerated automatically when the schema generator runs.
 */
export const INVERSE_PROPERTIES: Readonly<Record<string, string>> = inverseProps

/**
 * Returns the Schema.org inverse property name for a given property, if one exists.
 *
 * @example
 * getInverseProperty('containedInPlace') // → 'containsPlace'
 * getInverseProperty('memberOf')         // → 'member'
 * getInverseProperty('name')             // → undefined
 */
export function getInverseProperty(property: string): string | undefined {
    return (inverseProps as Record<string, string>)[property]
}
