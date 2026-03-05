import toVine from '../src/index';

test('toVine generates basic vine schema string', () => {
    const schema = {
        title: { type: 'string', required: true },
        count: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['open', 'closed'] }
    };

    const out = toVine('TestSchema', schema as any);

    expect(out).toContain("export const TestSchema = vine.object");
    expect(out).toContain("title: vine.string()");
    expect(out).toContain("count: vine.number().optional()");
    expect(out).toContain("tags: vine.array(vine.string()).optional()");
    expect(out).toContain("status: vine.enum([\"open\", \"closed\"]).optional()");
});
