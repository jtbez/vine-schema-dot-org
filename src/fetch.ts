import fs from 'fs/promises'
import path from 'path'

const SCHEMA_ORG_JSONLD_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld'

export async function fetchSchemaOrg(outPath = 'data/schema.json') {
    if (typeof fetch !== 'function') {
        throw new Error('global fetch is not available in this Node runtime. Run with Node 18+ or install a fetch polyfill.')
    }

    const res = await fetch(SCHEMA_ORG_JSONLD_URL)
    if (!res.ok) throw new Error(`Failed to fetch schema: ${res.status} ${res.statusText}`)

    const json = await res.json()
    const dest = path.resolve(outPath)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, JSON.stringify(json, null, 2), 'utf8')
    return dest
}

export default fetchSchemaOrg
