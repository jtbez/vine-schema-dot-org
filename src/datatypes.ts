// Minimal mapping from Schema.org datatypes / IRIs to VineJS snippets and TypeScript types.
export const DATA_TYPE_MAP: Record<string, { vine: string; ts: string }> = {
    'schema:Text': { vine: 'vine.string()', ts: 'string' },
    'schema:URL': { vine: 'vine.string().url()', ts: 'string' },
    'schema:Number': { vine: 'vine.number()', ts: 'number' },
    'schema:Integer': { vine: 'vine.number()', ts: 'number' },
    'schema:Float': { vine: 'vine.number()', ts: 'number' },
    'schema:Boolean': { vine: 'vine.boolean()', ts: 'boolean' },
    'schema:Date': { vine: 'vine.string()', ts: 'string' },
    'schema:DateTime': { vine: 'vine.string()', ts: 'string' },
    'schema:Time': { vine: 'vine.string()', ts: 'string' },
}

export function mapRangeToVine(range: string | string[]) {
    if (Array.isArray(range)) {
        const mapped = range.map((r) => DATA_TYPE_MAP[r]?.vine || r)
        return mapped.join(', ')
    }
    return DATA_TYPE_MAP[range]?.vine || range
}

export function mapRangeToTs(range: string | string[]) {
    if (Array.isArray(range)) {
        const mapped = range.map((r) => DATA_TYPE_MAP[r]?.ts || r)
        return mapped.join(' | ')
    }
    return DATA_TYPE_MAP[range]?.ts || range
}

export default DATA_TYPE_MAP
