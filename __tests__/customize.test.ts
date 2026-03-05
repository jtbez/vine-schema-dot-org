import vine from '@vinejs/vine'
import { createCustomSchemas } from '../src/customize'
import {
    OpeningHoursSpecification,
    Place,
    Event,
    DayOfWeek,
    EventStatusType,
    Thing,
} from '../src/generated'

// Helper: compile and validate, returning { success, data?, error? }
async function safeParse(schema: any, data: unknown) {
    try {
        const validator = vine.compile(schema)
        const result = await validator.validate(data)
        return { success: true, data: result }
    } catch (error) {
        return { success: false, error }
    }
}

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------
describe('Enumerations', () => {
    it('DayOfWeek values array contains all seven days plus PublicHolidays', () => {
        // DayOfWeek is a vine.enum — check the exported values
        const { DayOfWeekValues } = require('../src/generated')
        expect(DayOfWeekValues).toContain('Monday')
        expect(DayOfWeekValues).toContain('Tuesday')
        expect(DayOfWeekValues).toContain('Wednesday')
        expect(DayOfWeekValues).toContain('Thursday')
        expect(DayOfWeekValues).toContain('Friday')
        expect(DayOfWeekValues).toContain('Saturday')
        expect(DayOfWeekValues).toContain('Sunday')
        expect(DayOfWeekValues).toContain('PublicHolidays')
    })

    it('DayOfWeek schema validates correctly', async () => {
        const schema = vine.object({ day: DayOfWeek })
        const valid = await safeParse(schema, { day: 'Monday' })
        expect(valid.success).toBe(true)

        const invalid = await safeParse(schema, { day: 'Funday' })
        expect(invalid.success).toBe(false)
    })

    it('EventStatusType schema validates correctly', async () => {
        const schema = vine.object({ status: EventStatusType })
        const valid = await safeParse(schema, { status: 'EventScheduled' })
        expect(valid.success).toBe(true)

        const invalid = await safeParse(schema, { status: 'EventDelayed' })
        expect(invalid.success).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
describe('Schema validation', () => {
    it('validates Place with primitive properties', async () => {
        const result = await safeParse(Place, {
            name: 'Test',
            telephone: '555-1234',
        })
        expect(result.success).toBe(true)
    })

    it('Thing accepts valid data', async () => {
        const result = await safeParse(Thing, {
            name: 'My Thing',
            url: 'https://example.com',
        })
        expect(result.success).toBe(true)
    })

    it('empty object is valid (all properties optional)', async () => {
        const result = await safeParse(Place, {})
        expect(result.success).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// createCustomSchemas — overrides
// ---------------------------------------------------------------------------
describe('createCustomSchemas', () => {
    it('returns default schemas when no overrides are provided', () => {
        const schemas = createCustomSchemas({})
        expect(schemas.Place).toBeDefined()
        expect(schemas.Thing).toBeDefined()
    })

    it('accepts the new options format with overrides key', async () => {
        const schemas = createCustomSchemas({
            overrides: {
                Time: vine.string(),
            },
        })

        const ohs = schemas.OpeningHoursSpecification
        const valid = await safeParse(ohs, { opens: '09:00' })
        expect(valid.success).toBe(true)
    })

    it('does not affect default exports', async () => {
        createCustomSchemas({
            overrides: {
                Time: vine.string(),
            },
        })

        const result = await safeParse(OpeningHoursSpecification, {
            opens: 'any string works',
        })
        expect(result.success).toBe(true)
    })

    it('cascades type overrides through the schema graph', async () => {
        const schemas = createCustomSchemas({
            overrides: {
                Time: vine.string(),
            },
        })

        const place = schemas.Place
        const valid = await safeParse(place, {
            name: 'Test Place',
            openingHoursSpecification: {
                opens: '09:00',
                closes: '17:30',
            },
        })
        expect(valid.success).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// createCustomSchemas — declarative wrapping with additionalProperties
// ---------------------------------------------------------------------------
describe('createCustomSchemas declarative wrapping', () => {
    const extra = vine.object({ id: vine.string(), source: vine.string().optional() })

    it('wraps primitive properties as Array<Extra & { value: T }>', async () => {
        const schemas = createCustomSchemas({ additionalProperties: extra })

        const result = await safeParse(schemas.Thing, {
            name: [{ id: 'n1', source: 'user', value: 'My Thing' }],
        })
        expect(result.success).toBe(true)
    })

    it('wraps object-type properties as Array<Extra & { value: T }>', async () => {
        const schemas = createCustomSchemas({ additionalProperties: extra })

        const result = await safeParse(schemas.Place, {
            openingHoursSpecification: [
                { id: 'slot-1', value: { opens: '09:00', closes: '17:00' } },
            ],
        })
        expect(result.success).toBe(true)
    })

    it('rejects unwrapped values after wrapping', async () => {
        const schemas = createCustomSchemas({ additionalProperties: extra })

        // Plain string should no longer be accepted for name (needs array of wrapped objects)
        const result = await safeParse(schemas.Thing, { name: 'plain string' })
        expect(result.success).toBe(false)
    })

    it('requires additional properties when marked required', async () => {
        const strictExtra = vine.object({ id: vine.string() })
        const schemas = createCustomSchemas({ additionalProperties: strictExtra })

        // Missing required 'id' should fail
        const missing = await safeParse(schemas.Thing, {
            name: [{ value: 'no id' }],
        })
        expect(missing.success).toBe(false)

        // With id should pass
        const present = await safeParse(schemas.Thing, {
            name: [{ id: 'n1', value: 'with id' }],
        })
        expect(present.success).toBe(true)
    })

    it('wraps all properties including inherited ones', async () => {
        const schemas = createCustomSchemas({ additionalProperties: extra })

        // Place inherits name from Thing — it should be wrapped too
        const result = await safeParse(schemas.Place, {
            name: [{ id: 'n1', value: 'My Place' }],
            latitude: [{ id: 'l1', value: 51.4476 }],
        })
        expect(result.success).toBe(true)
    })

    it('does not affect default exports', async () => {
        createCustomSchemas({ additionalProperties: extra })

        // Default Thing should still accept plain values
        const result = await safeParse(Thing, { name: 'plain' })
        expect(result.success).toBe(true)
    })

    it('all properties are optional after wrapping', async () => {
        const schemas = createCustomSchemas({ additionalProperties: extra })

        // Empty object should be valid (all properties optional)
        const result = await safeParse(schemas.Place, {})
        expect(result.success).toBe(true)
    })

    it('create method returns data as-is', () => {
        const schemas = createCustomSchemas({ additionalProperties: extra })

        const data = {
            name: [{ id: 'n1', value: 'Test' }],
        }
        const created = schemas.Thing.create(data as any)
        expect(created).toEqual(data)
    })
})
