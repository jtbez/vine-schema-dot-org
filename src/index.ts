export * from './generated'
export { createCustomSchemas } from './customize'

export type SchemaProperty = {
    type: string;
    required?: boolean;
    items?: SchemaProperty;
    enum?: string[];
};

function mapType(prop: SchemaProperty): string {
    if (prop.enum && prop.enum.length > 0) {
        const vals = prop.enum.map((v) => `"${v}"`).join(", ");
        return `vine.enum([${vals}])`;
    }

    switch (prop.type) {
        case "string":
            return "vine.string()";
        case "number":
            return "vine.number()";
        case "boolean":
            return "vine.boolean()";
        case "array":
            if (!prop.items) return "vine.array(vine.any())";
            return `vine.array(${mapType(prop.items)})`;
        case "object":
            return "vine.any()";
        default:
            return "vine.any()";
    }
}

export function toVine(schemaName: string, properties: Record<string, SchemaProperty>): string {
    const lines: string[] = [];
    lines.push("import vine from '@vinejs/vine';\n");
    lines.push(`export const ${schemaName} = vine.object({`);

    for (const [key, prop] of Object.entries(properties)) {
        const base = mapType(prop);
        const final = prop.required ? base : `${base}.optional()`;
        lines.push(`  ${key}: ${final},`);
    }

    lines.push("});\n");

    return lines.join("\n");
}

export default toVine;
