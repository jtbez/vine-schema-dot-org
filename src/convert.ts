import fs from 'fs/promises'
import path from 'path'
import { ParsedType } from './parse'
import { DATA_TYPE_MAP } from './datatypes'

function safeLabel(id: string) {
    return id.replace(/[:\\/\.#]/g, '_').replace(/^_+/, '')
}

const RESERVED = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'as', 'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static', 'yield', 'any', 'number', 'boolean', 'string', 'symbol', 'unknown', 'never'
])

function formatComment(comment: string | undefined): string | undefined {
    if (!comment) return undefined
    const text = typeof comment === 'object' ? (comment as any)['@value'] || String(comment) : String(comment)
    if (!text) return undefined
    // Escape */ inside comments to avoid breaking JSDoc
    return text.replace(/\*\//g, '*\\/')
}

function formatJSDoc(comment: string | undefined, extras?: string[]): string[] {
    const text = formatComment(comment)
    if (!text && (!extras || extras.length === 0)) return []
    const lines: string[] = ['/**']
    if (text) {
        for (const line of text.split('\n')) {
            lines.push(` * ${line}`)
        }
    }
    if (extras) {
        if (text) lines.push(' *')
        for (const e of extras) lines.push(` * ${e}`)
    }
    lines.push(' */')
    return lines
}

function makeSafeName(original: string) {
    let s = String(original || '')
    // prefer the label's simple part if it's a URI
    if (s.includes('/')) s = s.split('/').pop() || s
    s = safeLabel(s)
    if (!s) s = 'Type'
    // replace any remaining invalid chars with _
    s = s.replace(/[^A-Za-z0-9_$]/g, '_')
    // if starts with digit, prefix with _
    if (/^[0-9]/.test(s)) s = '_' + s
    // avoid reserved words
    if (RESERVED.has(s)) s = s + '_'
    // ensure it matches identifier pattern now
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) {
        s = '_' + s.replace(/^[^A-Za-z_$]+/, '')
        if (!s) s = '_Type'
    }
    return s
}

export async function convertTypes(types: ParsedType[], outDir = 'src/generated/types') {
    // remove any previous generated outputs to avoid stale/unsanitized files
    try {
        await fs.rm(outDir, { recursive: true, force: true })
    } catch (e) {
        // ignore
    }
    await fs.mkdir(outDir, { recursive: true })

    // Filter out pure DataType classes (Date, DateTime, Time, etc.)
    // These are handled by DATA_TYPE_MAP at the property level and should not
    // generate standalone type files (they'd be empty vine.object({}) otherwise).
    types = types.filter(t => !t.isDataType)

    // map ids to sanitized names for imports
    const idToName: Record<string, string> = {}
    for (const t of types) {
        const name = makeSafeName(t.label || t.id)
        idToName[t.id] = name
    }

    // Build reference graph (type -> referenced types)
    // Includes both property references AND parent extends to detect all import cycles
    const graph: Record<string, Set<string>> = {}
    for (const t of types) {
        const name = makeSafeName(t.label || t.id)
        graph[name] = graph[name] || new Set()
        // Add parent extends edges (these create static imports too)
        for (const pid of t.parents || []) {
            const pn = idToName[pid]
            if (pn && pn !== name) graph[name].add(pn)
        }
        for (const p of t.properties) {
            const ranges = p.rangeIncludes || []
            for (const r of ranges) {
                const last = String(r).split('/').pop() || r
                const candidates = [r, `schema:${last}`, last]
                for (const c of candidates) {
                    const rn = idToName[c]
                    if (rn) graph[name].add(rn)
                }
            }
        }
    }

    // Tarjan's SCC to detect cycles
    const indexMap: Record<string, number> = {}
    const lowlink: Record<string, number> = {}
    const onStack: Record<string, boolean> = {}
    const stack: string[] = []
    let idx = 0
    const sccs: string[][] = []

    function strongconnect(v: string) {
        indexMap[v] = idx
        lowlink[v] = idx
        idx++
        stack.push(v)
        onStack[v] = true

        for (const w of Array.from(graph[v] || [])) {
            if (indexMap[w] === undefined) {
                strongconnect(w)
                lowlink[v] = Math.min(lowlink[v], lowlink[w])
            } else if (onStack[w]) {
                lowlink[v] = Math.min(lowlink[v], indexMap[w])
            }
        }

        if (lowlink[v] === indexMap[v]) {
            const comp: string[] = []
            while (true) {
                const w = stack.pop()!
                onStack[w] = false
                comp.push(w)
                if (w === v) break
            }
            sccs.push(comp)
        }
    }

    for (const v of Object.keys(graph)) {
        if (indexMap[v] === undefined) strongconnect(v)
    }

    const cyclicNames = new Set<string>()
    for (const comp of sccs) {
        if (comp.length > 1) for (const n of comp) cyclicNames.add(n)
        else {
            // self-loop
            const n = comp[0]
            if (graph[n] && graph[n].has(n)) cyclicNames.add(n)
        }
    }

    // Build a set of enumeration type names for reference during property generation
    const enumTypeNames = new Set<string>()
    for (const t of types) {
        if (t.isEnumeration && t.enumerationValues && t.enumerationValues.length > 0) {
            enumTypeNames.add(makeSafeName(t.label || t.id))
        }
    }

    for (const t of types) {
        const name = makeSafeName(t.label || t.id)
        const lines: string[] = []
        lines.push(`// ⚠️ AUTO-GENERATED - ${t.id}`)
        lines.push("import vine from '@vinejs/vine'")

        // Handle enumeration types with members: generate vine.enum() instead of object schema
        if (t.isEnumeration && t.enumerationValues && t.enumerationValues.length > 0) {
            const sorted = [...t.enumerationValues].sort()
            const members = sorted.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ')
            lines.push('')
            const schemaOrgUrl = `https://schema.org/${t.label || name}`
            const typeJSDoc = formatJSDoc(t.comment, [`@see ${schemaOrgUrl}`])
            lines.push(...typeJSDoc)
            lines.push(`export const ${name} = vine.enum([${members}])`)
            lines.push(`export const ${name}Values = [${members}] as const`)
            lines.push(`export type ${name} = typeof ${name}Values[number]`)

            const outPath = path.join(outDir, `${name}.ts`)
            await fs.writeFile(outPath, lines.join('\n'), 'utf8')
            continue
        }

        // collect imports (parents + referenced types)
        const parentNames: string[] = []
        for (const pid of t.parents || []) {
            const pn = idToName[pid]
            if (pn && pn !== name) parentNames.push(pn)
        }

        const runtimeImports = new Set<string>()
        const typeImports = new Set<string>()
        // we'll build property lines separately
        const propLines: string[] = []
        const tsPropLines: string[] = []

        function formatPropName(n: string) {
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n)) return n
            return JSON.stringify(n)
        }

        function findNameForId(r: string) {
            if (idToName[r]) return idToName[r]
            try {
                const last = String(r).split('/').pop() || r
                const short = `schema:${last}`
                if (idToName[short]) return idToName[short]
                if (idToName[last]) return idToName[last]
            } catch (e) {
                // ignore
            }
            return undefined
        }

        for (const p of t.properties) {
            const rawLabel = typeof p.label === 'object' ? p.label['@value'] || String(p.label) : String(p.label)
            const propName = formatPropName(rawLabel)

            const ranges = p.rangeIncludes || []
            const primitiveTypes: string[] = []
            let hasRefType = false
            for (const r of ranges) {
                if (DATA_TYPE_MAP[r]) {
                    primitiveTypes.push(DATA_TYPE_MAP[r].vine)
                    continue
                }
                const rn = findNameForId(r)
                if (rn) {
                    hasRefType = true
                    // Type-only import for TS interface
                    if (rn !== name) typeImports.add(rn)
                    continue
                }
            }

            // Determine the VineJS expression based on types involved
            // VineJS unionOfTypes doesn't support .optional(), so we use strategies:
            // 1. Single primitive type only → vine.string().optional() etc.
            // 2. Any ref types (cyclic or not), multiple primitives → vine.any().optional()
            // TypeScript interfaces provide full type safety regardless.
            const uniquePrimitives = [...new Set(primitiveTypes)]
            let vineExpr: string

            if (hasRefType || uniquePrimitives.length > 1) {
                // Complex case: type refs, multiple primitive types → use vine.any()
                vineExpr = 'vine.any()'
            } else if (uniquePrimitives.length === 1) {
                // Single primitive type
                vineExpr = uniquePrimitives[0]
            } else {
                // No types at all — fallback
                vineExpr = 'vine.any()'
            }

            const vinePropComment = formatComment(p.comment)
            if (vinePropComment) {
                propLines.push(`  /** ${vinePropComment} */`)
            }
            propLines.push(`  ${propName}: ${vineExpr}.optional(),`)

            // Build TypeScript interface property
            const tsParts: string[] = []
            for (const r of ranges) {
                if (DATA_TYPE_MAP[r]) {
                    tsParts.push(DATA_TYPE_MAP[r].ts)
                    continue
                }
                const rn = findNameForId(r)
                if (rn) {
                    tsParts.push(rn)
                    if (rn !== name && !runtimeImports.has(rn)) typeImports.add(rn)
                    continue
                }
                tsParts.push('any')
            }
            // Deduplicate identical TS types
            const uniqueTsParts = [...new Set(tsParts)]
            let tsExpr = uniqueTsParts.length === 1 ? uniqueTsParts[0] : uniqueTsParts.join(' | ')
            // Non-primitive properties accept both single values and arrays
            if (hasRefType) {
                tsExpr = uniqueTsParts.length === 1 ? `${tsExpr} | ${tsExpr}[]` : `(${tsExpr}) | (${tsExpr})[]`
            }
            const propComment = formatComment(p.comment)
            if (propComment) {
                tsPropLines.push(`  /** ${propComment} */`)
            }
            tsPropLines.push(`  ${propName}?: ${tsExpr};`)
        }

        // emit imports
        // Parent extends always use static imports (cycle is broken by vine.any() property refs)
        for (const pn of parentNames) {
            lines.push(`import { ${pn} } from './${pn}'`)
            runtimeImports.add(pn)
        }
        // emit type-only imports for interfaces we reference but didn't import as runtime values
        for (const ti of Array.from(typeImports).sort()) {
            if (runtimeImports.has(ti)) continue
            if (ti === name) continue
            lines.push(`import type { ${ti} } from './${ti}'`)
        }

        lines.push('')

        // Emit TypeScript interface for static typing
        const schemaOrgUrl = `https://schema.org/${t.label || name}`
        const typeJSDoc = formatJSDoc(t.comment, [`@see ${schemaOrgUrl}`])
        lines.push(...typeJSDoc)
        const ifaceHeader = parentNames.length > 0 ? `export interface ${name} extends ${parentNames[0]} {` : `export interface ${name} {`
        lines.push(ifaceHeader)
        lines.push(...tsPropLines)
        lines.push('}')
        lines.push('')

        // VineJS uses vine.object({...parent.getProperties(), ...ownProps}) for inheritance
        if (parentNames.length > 0) {
            lines.push(`export const ${name} = Object.assign(vine.object({`)
            lines.push(`  ...${parentNames[0]}.getProperties(),`)
        } else {
            lines.push(`export const ${name} = Object.assign(vine.object({`)
        }
        lines.push(...propLines)
        lines.push(`}).allowUnknownProperties(), {`)
        lines.push(`  create(data: ${name}): ${name} { return data }`)
        lines.push(`})`)

        const outPath = path.join(outDir, `${name}.ts`)
        await fs.writeFile(outPath, lines.join('\n'), 'utf8')
    }

    // Build type reference metadata for customization support
    // Maps each type to its parent and which properties reference which types
    const schemaMeta: Record<string, { parent?: string; isDataType?: boolean; isEnumeration?: boolean; typeRefs: Record<string, string[]> }> = {}

    // Include DataType primitives in metadata (they were filtered from type generation
    // but consumers need to know about them for property classification)
    for (const schemaId of Object.keys(DATA_TYPE_MAP)) {
        const name = schemaId.replace('schema:', '')
        schemaMeta[name] = { isDataType: true, typeRefs: {} }
    }
    for (const t of types) {
        const name = makeSafeName(t.label || t.id)
        const parentNames: string[] = []
        for (const pid of t.parents || []) {
            const pn = idToName[pid]
            if (pn && pn !== name) parentNames.push(pn)
        }
        const typeRefs: Record<string, string[]> = {}
        for (const p of t.properties) {
            const rawLabel = typeof p.label === 'object' ? (p.label as any)['@value'] || String(p.label) : String(p.label)
            const ranges = p.rangeIncludes || []
            const refTypes: string[] = []
            for (const r of ranges) {
                // Check DATA_TYPE_MAP — these are overrideable data types
                if (DATA_TYPE_MAP[r]) {
                    const dtName = String(r).replace('schema:', '')
                    refTypes.push(dtName)
                    continue
                }
                // Check for type references
                const rn = (() => {
                    if (idToName[r]) return idToName[r]
                    const last = String(r).split('/').pop() || r
                    const short = `schema:${last}`
                    if (idToName[short]) return idToName[short]
                    if (idToName[last]) return idToName[last]
                    return undefined
                })()
                if (rn) refTypes.push(rn)
            }
            if (refTypes.length > 0) {
                typeRefs[rawLabel] = [...new Set(refTypes)]
            }
        }
        schemaMeta[name] = {
            parent: parentNames[0],
            ...(t.isEnumeration ? { isEnumeration: true } : {}),
            ...(schemaMeta[name]?.isDataType ? { isDataType: true } : {}),
            typeRefs,
        }
    }

    // write a barrel index.ts next to the outDir
    const exports: string[] = []
    for (const t of types) {
        const name = idToName[t.id] || makeSafeName(t.label || t.id)
        exports.push(name)
    }

    // cleanup any stale/unsanitized files that may remain (old generator runs)
    try {
        const existing = await fs.readdir(outDir)
        for (const f of existing) {
            // remove files with characters that cannot appear in TS identifiers
            if (/[:\-\s]/.test(f) || /^[0-9]/.test(f)) {
                await fs.rm(path.join(outDir, f), { force: true })
            }
        }
    } catch (e) {
        // ignore
    }

    const root = path.resolve(outDir, '..')
    await fs.mkdir(root, { recursive: true })
    const typesRel = path.relative(root, outDir).split(path.sep).join('/')

    // generated/index.ts — exports VineJS schemas, interfaces, and enum values
    const schemaExportLines = exports.map((n) => `export * from './${typesRel}/${n}'`)
    await fs.writeFile(path.join(root, 'index.ts'), schemaExportLines.join('\n') + '\n', 'utf8')

    // Write schema metadata for customization support
    const metaPath = path.join(root, 'schema-meta.json')
    await fs.writeFile(metaPath, JSON.stringify(schemaMeta, null, 2), 'utf8')

    // Compute all typeRefs (own + inherited) for each type
    function getAllTypeRefs(typeName: string): Record<string, string[]> {
        const entry = schemaMeta[typeName]
        if (!entry) return {}
        const parentRefs = entry.parent ? getAllTypeRefs(entry.parent) : {}
        return { ...parentRefs, ...entry.typeRefs }
    }

    // Write TypeScript type-level metadata with literal types for compile-time override resolution
    const typeRefsLines: string[] = [
        '// ⚠️ AUTO-GENERATED — DO NOT EDIT',
        '// Type-level metadata with literal tuple types for compile-time override resolution.',
        'export interface SchemaTypeRefs {',
    ]
    for (const typeName of Object.keys(schemaMeta)) {
        const allRefs = getAllTypeRefs(typeName)
        const entries = Object.entries(allRefs)
        if (entries.length === 0) continue
        typeRefsLines.push(`  ${typeName}: {`)
        for (const [propName, refs] of entries) {
            const literals = (refs as string[]).map((r: string) => `'${r}'`).join(', ')
            typeRefsLines.push(`    ${propName}: [${literals}]`)
        }
        typeRefsLines.push(`  }`)
    }
    typeRefsLines.push('}')
    typeRefsLines.push('')
    typeRefsLines.push('export interface DataTypeTSMap {')
    for (const [key, { ts }] of Object.entries(DATA_TYPE_MAP)) {
        const name = key.replace('schema:', '')
        typeRefsLines.push(`  ${name}: ${ts}`)
    }
    typeRefsLines.push('}')

    const typeRefsPath = path.join(root, 'schema-type-refs.ts')
    await fs.writeFile(typeRefsPath, typeRefsLines.join('\n') + '\n', 'utf8')

    // write a stable name map for reproducible diffs and tooling
    try {
        const nameMapPath = path.join(root, 'name-map.json')
        await fs.writeFile(nameMapPath, JSON.stringify(idToName, null, 2), 'utf8')
    } catch (e) {
        // ignore write errors
    }

    // As a fallback, also generate a name-map by scanning generated files' headers
    try {
        const fallback: Record<string, string> = {}
        const files = await fs.readdir(outDir)
        for (const f of files) {
            if (!f.endsWith('.ts')) continue
            const content = await fs.readFile(path.join(outDir, f), 'utf8')
            const m = content.match(/AUTO-GENERATED - (.+)/)
            if (m) {
                const id = m[1].trim()
                const name = f.replace(/\.ts$/, '')
                fallback[id] = name
            }
        }
        await fs.writeFile(path.join(root, 'name-map.json'), JSON.stringify(fallback, null, 2), 'utf8')
    } catch (e) {
        // ignore write errors
    }
}

export default convertTypes
