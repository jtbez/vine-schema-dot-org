import path from 'path'
import { fetchSchemaOrg } from './fetch'
import { parseSchemaJson } from './parse'
import { convertTypes } from './convert'

export async function runGenerator() {
    const out = await fetchSchemaOrg('data/schema.json')
    const parsed = await parseSchemaJson(out)
    // Generate for all discovered types (write into `src/generated` for consumers/CI)
    await convertTypes(parsed, 'src/generated/types')
    return { fetched: out, written: parsed.length }
}

if (require.main === module) {
    runGenerator().then((r) => console.log('generated', r)).catch((e) => {
        console.error(e)
        process.exit(1)
    })
}

export default runGenerator
