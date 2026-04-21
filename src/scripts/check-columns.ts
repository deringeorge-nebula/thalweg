import { parse } from 'csv-parse'
import { Readable } from 'stream'

async function run() {
  const token = process.env.OPENSANCTIONS_TOKEN!
  const redirect = await fetch(
    'https://delivery.opensanctions.com/datasets/latest/default/targets.simple.csv',
    { headers: { Authorization: `Token ${token}` }, redirect: 'manual' }
  )
  const location = redirect.headers.get('location')!
  const res = await fetch(location)
  const parser = parse({ columns: true, skip_empty_lines: true })
  const nodeStream = Readable.fromWeb(res.body as any)
  nodeStream.pipe(parser)

  let count = 0
  for await (const row of parser as AsyncIterable<any>) {
    if (row.schema !== 'Vessel') continue
    console.log('COLUMNS:', Object.keys(row))
    console.log('SAMPLE:', JSON.stringify(row, null, 2))
    if (++count >= 3) break
  }
}
run().catch(console.error)
