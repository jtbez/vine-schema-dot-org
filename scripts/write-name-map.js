const fs = require('fs')
const path = require('path')

const outDir = process.argv[2] || 'src/generated/types'
const root = path.resolve(outDir, '..')
const map = {}
try {
    const files = fs.readdirSync(outDir)
    for (const f of files) {
        if (!f.endsWith('.ts')) continue
        const content = fs.readFileSync(path.join(outDir, f), 'utf8')
        const m = content.match(/AUTO-GENERATED - (.+)/)
        if (m) {
            const id = m[1].trim()
            const name = f.replace(/\.ts$/, '')
            map[id] = name
        }
    }
    fs.writeFileSync(path.join(root, 'name-map.json'), JSON.stringify(map, null, 2), 'utf8')
    console.log('written', Object.keys(map).length)
} catch (e) {
    console.error('error', e && e.message)
    process.exit(1)
}
