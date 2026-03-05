import runGenerator from '../src/generate'

async function main() {
    try {
        const res = await runGenerator()
        console.log('Generator finished:', res)
    } catch (err) {
        console.error(err)
        process.exit(1)
    }
}

main()
