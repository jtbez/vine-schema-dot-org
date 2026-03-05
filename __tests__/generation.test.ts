import fs from 'fs/promises'
import path from 'path'
import { convertTypes } from '../src/convert'
import { ParsedType } from '../src/parse'

const TMP = path.join(process.cwd(), 'tmp-gen-test')

async function rimraf(p: string) {
    try {
        await fs.rm(p, { recursive: true, force: true })
    } catch (e) {
        // ignore
    }
}

beforeEach(async () => {
    await rimraf(TMP)
    await fs.mkdir(TMP, { recursive: true })
})

afterEach(async () => {
    await rimraf(TMP)
})

test('uses vine.any() for cyclic references', async () => {
    const A: ParsedType = {
        id: 'schema:A',
        label: 'A',
        parents: [],
        properties: [
            { id: 'schema:hasB', label: 'hasB', rangeIncludes: ['schema:B'] },
        ],
    }

    const B: ParsedType = {
        id: 'schema:B',
        label: 'B',
        parents: [],
        properties: [
            { id: 'schema:hasA', label: 'hasA', rangeIncludes: ['schema:A'] },
        ],
    }

    await convertTypes([A, B], path.join(TMP, 'types'))

    const aPath = path.join(TMP, 'types', 'A.ts')
    const bPath = path.join(TMP, 'types', 'B.ts')
    const aTxt = await fs.readFile(aPath, 'utf8')
    const bTxt = await fs.readFile(bPath, 'utf8')

    // Cyclic refs use vine.any() since VineJS has no lazy support
    expect(aTxt).toMatch(/vine\.any\(\)\.optional\(\)/)
    expect(bTxt).toMatch(/vine\.any\(\)\.optional\(\)/)
})

test('uses vine.any() for non-cyclic type refs (type-only imports for TS interface)', async () => {
    const D: ParsedType = {
        id: 'schema:D',
        label: 'D',
        parents: [],
        properties: [
            { id: 'schema:hasE', label: 'hasE', rangeIncludes: ['schema:E'] },
        ],
    }

    const E: ParsedType = {
        id: 'schema:E',
        label: 'E',
        parents: [],
        properties: [],
    }

    await convertTypes([D, E], path.join(TMP, 'types2'))

    const dPath = path.join(TMP, 'types2', 'D.ts')
    const dTxt = await fs.readFile(dPath, 'utf8')

    // Non-cyclic ref types are imported as type-only for the TS interface
    expect(dTxt).toMatch(/import type \{ E \} from '\.\/E'/)
    // VineJS schema uses vine.any() for type refs
    expect(dTxt).toMatch(/vine\.any\(\)\.optional\(\)/)
})
