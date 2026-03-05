module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    // VineJS and all its transitive deps are ESM-only; transform everything
    transformIgnorePatterns: [],
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
        '^.+\\.m?js$': ['ts-jest', { useESM: false }],
    },
};
