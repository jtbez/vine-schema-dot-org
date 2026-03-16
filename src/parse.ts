import fs from 'fs/promises'

export type ParsedProperty = {
    id: string
    label: string
    comment?: string
    rangeIncludes: string[]
    inverseOf?: string
}

export type ParsedType = {
    id: string
    label: string
    comment?: string
    parents: string[]
    properties: ParsedProperty[]
    isEnumeration?: boolean
    enumerationValues?: string[]
    isDataType?: boolean
}

export async function parseSchemaJson(filePath: string): Promise<ParsedType[]> {
    const content = await fs.readFile(filePath, 'utf8')
    const json = JSON.parse(content)
    const graph = json['@graph'] || []

    const types: Record<string, ParsedType> = {}
    const properties: any[] = []

    for (const node of graph) {
        const rawType = node['@type']
        const typesList = Array.isArray(rawType) ? rawType : (rawType ? [rawType] : [])
        if (typesList.includes('rdfs:Class')) {
            const id = node['@id'] || node['id'] || node['@type']
            const label = node['rdfs:label'] || node['label'] || id
            types[id] = {
                id,
                label: typeof label === 'object' ? label['@value'] || String(label) : String(label),
                comment: node['rdfs:comment'] || node['comment'],
                parents: [],
                properties: [],
                isDataType: typesList.includes('schema:DataType'),
            }
        }

        if (typesList.includes('rdf:Property')) {
            properties.push(node)
        }
    }

    // map property domains to types
    for (const prop of properties) {
        const ranges = []
        if (prop['schema:rangeIncludes']) {
            const r = prop['schema:rangeIncludes']
            if (Array.isArray(r)) {
                for (const item of r) ranges.push(item['@id'] || item['id'] || item)
            } else {
                ranges.push(r['@id'] || r['id'] || r)
            }
        }

        const domains = []
        if (prop['schema:domainIncludes']) {
            const d = prop['schema:domainIncludes']
            if (Array.isArray(d)) {
                for (const item of d) domains.push(item['@id'] || item['id'] || item)
            } else {
                domains.push(d['@id'] || d['id'] || d)
            }
        }

        const rawInverse = prop['schema:inverseOf']
        const inverseOf: string | undefined = rawInverse
            ? (rawInverse['@id'] || rawInverse['id'] || String(rawInverse))
            : undefined

        for (const domain of domains) {
            if (types[domain]) {
                types[domain].properties.push({
                    id: prop['@id'] || prop['id'],
                    label: prop['rdfs:label'] || prop['label'] || prop['@id'] || prop['id'],
                    comment: prop['rdfs:comment'] || prop['comment'],
                    rangeIncludes: ranges.map(String),
                    inverseOf,
                })
            }
        }
    }

    // populate parents (subClassOf)
    for (const node of graph) {
        const id = node['@id'] || node['id']
        if (!id || !types[id]) continue
        const raw = node['rdfs:subClassOf'] || node['subClassOf']
        if (!raw) continue
        const parents = Array.isArray(raw) ? raw : [raw]
        const parentIds: string[] = []
        for (const p of parents) {
            if (!p) continue
            parentIds.push(p['@id'] || p['id'] || String(p))
        }
        types[id].parents = parentIds
    }

    // Detect enumeration types: walk the inheritance tree from schema:Enumeration
    const allEnumTypeIds = new Set<string>()
    const parentMap: Record<string, string[]> = {}
    for (const t of Object.values(types)) {
        parentMap[t.id] = t.parents
    }
    const queue = ['schema:Enumeration']
    const visited = new Set<string>()
    while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current)) continue
        visited.add(current)
        allEnumTypeIds.add(current)
        for (const [tid, pids] of Object.entries(parentMap)) {
            if (pids.includes(current) && !visited.has(tid)) {
                queue.push(tid)
            }
        }
    }
    allEnumTypeIds.delete('schema:Enumeration')

    // Collect enumeration members: nodes whose @type is an enumeration type
    const enumMembers: Record<string, string[]> = {}
    for (const node of graph) {
        const rawType = node['@type']
        const typesList = Array.isArray(rawType) ? rawType : (rawType ? [rawType] : [])
        for (const t of typesList) {
            if (allEnumTypeIds.has(t)) {
                if (!enumMembers[t]) enumMembers[t] = []
                const label = node['rdfs:label'] || node['label'] || node['@id'] || ''
                const memberLabel = typeof label === 'object' ? label['@value'] || String(label) : String(label)
                if (memberLabel) enumMembers[t].push(memberLabel)
            }
        }
    }

    // Mark enumeration types and attach their member values
    for (const tid of allEnumTypeIds) {
        if (types[tid]) {
            types[tid].isEnumeration = true
            types[tid].enumerationValues = enumMembers[tid] || []
        }
    }

    return Object.values(types)
}

export default parseSchemaJson
