import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse'
import { Readable } from 'stream'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.MY_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const OPENSANCTIONS_URL =
  'https://delivery.opensanctions.com/datasets/latest/default/targets.simple.csv'
const BATCH_SIZE = 500

function extractIMO(identifiers: string): string | null {
  const match = identifiers.match(/IMO(\d+)/i)
  return match ? match[1] : null
}

function extractMMSI(identifiers: string): string | null {
  const match = identifiers.match(/MMSI(\d+)/i)
  return match ? match[1] : null
}

async function upsertBatch(rows: Record<string, any>[]) {
  // Deduplicate by imo_number — keep last occurrence
  const deduped = Object.values(
    rows.reduce((acc, row) => { acc[row.imo_number] = row; return acc }, {} as Record<string, any>)
  )
  const { error } = await supabase
    .from('sanctioned_vessels')
    .upsert(deduped, { onConflict: 'imo_number', ignoreDuplicates: false })
  if (error) console.error('Upsert error:', error.message)
  else console.log(`? Upserted ${deduped.length} rows`)
}

async function run() {
  const token = process.env.OPENSANCTIONS_TOKEN
  if (!token) throw new Error('OPENSANCTIONS_TOKEN not set')

  const redirect = await fetch(OPENSANCTIONS_URL, {
    headers: { Authorization: `Token ${token}` },
    redirect: 'manual',
  })
  const location = redirect.headers.get('location')
  if (!location) throw new Error('No redirect location received')
  console.log(`Redirected to: ${location}`)

  const res = await fetch(location)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  if (!res.body) throw new Error('No response body')

  const parser = parse({ columns: true, skip_empty_lines: true })
  const nodeStream = Readable.fromWeb(res.body as any)
  nodeStream.pipe(parser)

  let batch: Record<string, any>[] = []
  let total = 0
  let skipped = 0

  for await (const row of parser as AsyncIterable<any>) {
    if (row.schema !== 'Vessel') continue

    const imo = extractIMO(row.identifiers || '')
    const mmsi = extractMMSI(row.identifiers || '')

    if (!imo) { skipped++; continue }

    batch.push({
      vessel_name: row.name || '',
      mmsi,
      imo_number: imo,
      flag_state: row.countries || null,
      first_listed: row.first_seen || null,
      last_updated: row.last_seen || null,
      sanctions_lists: {
        dataset: row.dataset || '',
        program_ids: row.program_ids || '',
      },
      properties: {
        id: row.id,
        aliases: row.aliases || '',
        sanctions: row.sanctions || '',
      },
    })

    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batch)
      total += batch.length
      batch = []
    }
  }

  if (batch.length) { await upsertBatch(batch); total += batch.length }
  console.log(`\n? Done. Synced: ${total}, Skipped (no IMO): ${skipped}`)
}

run().catch(console.error)
