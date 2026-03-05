import fs from 'fs/promises'
import path from 'path'
import { parseSchemaJson } from '../src/parse'
import { convertTypes } from '../src/convert'

const TMP_FULL = path.join(process.cwd(), 'tmp-gen-full')

async function rimraf(p: string) {
    try {
        await fs.rm(p, { recursive: true, force: true })
    } catch (e) {
        // ignore
    }
}

beforeAll(async () => {
    await rimraf(TMP_FULL)
    await fs.mkdir(TMP_FULL, { recursive: true })
})

afterAll(async () => {
    await rimraf(TMP_FULL)
})

test('full generation produces expected files, compiles, and uses vine', async () => {
    const dataPath = path.join(process.cwd(), 'data', 'schema.json')
    const parsedAll = await parseSchemaJson(dataPath)

    // In CI, limit to a representative subset to keep runtime small
    const isCI = !!process.env.CI
    const subsetIds = ['schema:Thing', 'schema:Place', 'schema:Person', 'schema:Organization', 'schema:Event']
    const parsed = isCI ? parsedAll.filter((p) => subsetIds.includes(p.id)) : parsedAll

    // generate into a temp folder
    const outTypes = path.join(TMP_FULL, 'types')
    await convertTypes(parsed, outTypes)

    // check file count (in CI this will be the subset length)
    // DataType classes (Date, DateTime, Time, etc.) are filtered out by the generator
    const nonDataTypes = parsed.filter((p) => !p.isDataType)
    const files = await fs.readdir(outTypes)
    const tsFiles = files.filter((f) => f.endsWith('.ts'))
    expect(tsFiles.length).toBe(nonDataTypes.length)

    // check barrel exists next to outTypes
    const barrelPath = path.join(TMP_FULL, 'index.ts')
    const barrel = await fs.readFile(barrelPath, 'utf8')
    expect(barrel).toContain("from './types/Thing'")

    // spot-check: Thing exists and exports Thing
    const thingPath = path.join(outTypes, 'Thing.ts')
    const thingTxt = await fs.readFile(thingPath, 'utf8')
    expect(thingTxt).toMatch(/export const Thing/)
    expect(thingTxt).toContain("import vine from '@vinejs/vine'")

    // compile generated types using tsc to ensure emitted files are valid
    // create a temporary tsconfig that includes the generated types and barrel
    const tmpTsconfig = path.join(TMP_FULL, 'tsconfig.json')
    const tsconfig = {
        compilerOptions: {
            target: 'ES2022',
            module: 'CommonJS',
            moduleResolution: 'Node',
            esModuleInterop: true,
            strict: false,
            skipLibCheck: true,
            outDir: './out'
        },
        include: ['./types/**/*.ts', './index.ts']
    }
    await fs.writeFile(tmpTsconfig, JSON.stringify(tsconfig, null, 2), 'utf8')

    const { exec } = await import('child_process')
    await new Promise<void>((resolve, reject) => {
        const tscBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsc')
        exec(`${tscBin} -p ${tmpTsconfig}`, { cwd: TMP_FULL }, (err, stdout, stderr) => {
            if (err) return reject(new Error(`tsc failed. stdout:\n${stdout}\n\nstderr:\n${stderr}`))
            resolve()
        })
    })

    // snapshot a few representative outputs to detect regressions
    const reps = ['Thing.ts', 'Person.ts', 'Place.ts'].filter((n) => tsFiles.includes(n))
    for (const r of reps) {
        const txt = await fs.readFile(path.join(outTypes, r), 'utf8')
        expect(txt).toMatchSnapshot(r)
    }

    // ensure all generated files use vine, not zod
    for (const f of tsFiles) {
        const txt = await fs.readFile(path.join(outTypes, f), 'utf8')
        expect(txt).toContain("vine")
        expect(txt).not.toContain("from 'zod'")
    }
}, 300000)
