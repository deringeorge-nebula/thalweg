/**
 * /api/sanctions-sync
 *
 * Daily batch sync of OpenSanctions vessel data into Supabase.
 * Each POST invocation processes ONE batch of rows from the CSV stream.
 * Designed for Vercel Hobby 10s limit â€” each invocation targets < 8s.
 *
 * POST  { batch: number, batch_size?: number }  â€” requires Authorization header
 * GET   â€” returns endpoint documentation (no auth)
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// â”€â”€â”€ Runtime config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 9 // seconds (Vercel Hobby cap is 10)

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const OPENSANCTIONS_URL =
  'https://delivery.opensanctions.com/datasets/latest/default/targets.simple.csv'
const DEFAULT_BATCH_SIZE = 200
const FETCH_TIMEOUT_MS = 7_000

// â”€â”€â”€ Interfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RequestBody {
  batch: number
  batch_size?: number
}

interface SanctionRecord {
  opensanctions_id: string
  name: string
  aliases: string[]
  schema_type: 'Vessel'
  mmsi: string | null
  imo_number: string | null
  call_sign: string | null
  flag_state: string | null
  datasets: string[]
  topics: string[]
  first_seen: string
  last_checked: string
  content: SanctionContent
}

interface SanctionContent {
  sanctions_raw: string
}

interface SanctionedVesselRecord {
  mmsi: string | null
  imo_number: string | null
  vessel_name: string
  flag_state: string | null
  sanctions_lists: SanctionsListsJsonb
  last_updated: string
}

interface SanctionsListsJsonb {
  programs: string[]
  datasets: string[]
  raw: string
}

interface BatchResult {
  batch: number
  processed: number
  upserted: number
  skipped: number
  errors: number
  done: boolean
}

interface SupabaseError {
  message: string
  code?: string
  details?: string
}

// â”€â”€â”€ CSV PARSER (RFC 4180 compliant) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Handles:
//  â€¢ Quoted fields (may contain commas, newlines, semicolons)
//  â€¢ Escaped double-quotes ("") inside quoted fields
//  â€¢ Trailing \r\n or \n line endings

type ParserState = 'FIELD_START' | 'IN_UNQUOTED' | 'IN_QUOTED' | 'POST_QUOTE'

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let state: ParserState = 'FIELD_START'

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    switch (state) {
      case 'FIELD_START':
        if (ch === '"') {
          state = 'IN_QUOTED'
        } else if (ch === ',') {
          fields.push(current)
          current = ''
          state = 'FIELD_START'
        } else {
          current += ch
          state = 'IN_UNQUOTED'
        }
        break

      case 'IN_UNQUOTED':
        if (ch === ',') {
          fields.push(current)
          current = ''
          state = 'FIELD_START'
        } else {
          current += ch
        }
        break

      case 'IN_QUOTED':
        if (ch === '"') {
          if (next === '"') {
            // Escaped quote ("")
            current += '"'
            i++ // skip next quote
          } else {
            state = 'POST_QUOTE'
          }
        } else {
          current += ch
        }
        break

      case 'POST_QUOTE':
        if (ch === ',') {
          fields.push(current)
          current = ''
          state = 'FIELD_START'
        }
        // Anything else after closing quote is ignored (malformed CSV)
        break
    }
  }

  fields.push(current)
  return fields
}

// â”€â”€â”€ Identifier parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ParsedIdentifiers {
  imo_number: string | null
  mmsi: string | null
  call_sign: string | null
}

function parseIdentifiers(raw: string): ParsedIdentifiers {
  const result: ParsedIdentifiers = { imo_number: null, mmsi: null, call_sign: null }
  if (!raw) return result

  const parts = raw.split(';').map((s) => s.trim()).filter(Boolean)
  for (const part of parts) {
    if (part.startsWith('IMO')) {
      const num = part.slice(3).trim()
      if (/^\d{7}$/.test(num)) result.imo_number = num
    } else if (part.startsWith('MMSI')) {
      const num = part.slice(4).trim()
      if (/^\d{9}$/.test(num)) result.mmsi = num
    } else if (part.startsWith('CALLSIGN')) {
      result.call_sign = part.slice(8).trim() || null
    }
  }
  return result
}

// â”€â”€â”€ Sanctions string parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseTopics(sanctionsRaw: string): string[] {
  if (!sanctionsRaw) return []
  return Array.from(
    new Set(
      sanctionsRaw
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const delimIdx = entry.indexOf(' - ')
          return delimIdx !== -1 ? entry.slice(0, delimIdx).trim() : entry.trim()
        })
        .filter(Boolean)
    )
  )
}

// â”€â”€â”€ Row â†’ Domain record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rowToRecord(cols: string[]): SanctionRecord | null {
  // Guard minimum column count
  if (cols.length < 15) return null

  const opensanctions_id = cols[0]?.trim()
  const schema = cols[1]?.trim()
  if (schema !== 'Vessel' || !opensanctions_id) return null

  const identifiers = parseIdentifiers(cols[7]?.trim() ?? '')
  // Skip rows with no cross-reference key
  if (!identifiers.imo_number && !identifiers.mmsi) return null

  const name = cols[2]?.trim() ?? ''
  const aliases = (cols[3]?.trim() ?? '')
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean)

  const countriesRaw = cols[5]?.trim() ?? ''
  const flag_state = countriesRaw.split(';')[0]?.trim() || null

  const datasets = (cols[12]?.trim() ?? '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)

  const sanctionsRaw = cols[8]?.trim() ?? ''
  const topics = parseTopics(sanctionsRaw)

  const first_seen = cols[13]?.trim() ?? new Date().toISOString()
  const last_checked = cols[14]?.trim() ?? new Date().toISOString()

  return {
    opensanctions_id,
    name,
    aliases,
    schema_type: 'Vessel',
    mmsi: identifiers.mmsi,
    imo_number: identifiers.imo_number,
    call_sign: identifiers.call_sign,
    flag_state,
    datasets,
    topics,
    first_seen,
    last_checked,
    content: { sanctions_raw: sanctionsRaw },
  }
}

// â”€â”€â”€ Supabase client (service role) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// â”€â”€â”€ Auth helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const secret = process.env.CRON_SECRET ?? ''
  return token.length > 0 && token === secret
}

// â”€â”€â”€ GET â€” documentation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: '/api/sanctions-sync',
    description:
      'Daily batch sync of OpenSanctions vessel data into Supabase. ' +
      'Each POST invocation processes one batch of rows from the streaming CSV.',
    method: 'POST',
    authentication: 'Authorization: Bearer {CRON_SECRET}',
    body: {
      batch: 'number  â€” 0-indexed batch number',
      batch_size: 'number? â€” rows per batch (default: 200)',
    },
    response: {
      batch: 'number',
      processed: 'number â€” vessel rows consumed in this batch',
      upserted: 'number â€” rows written to sanctions table',
      skipped: 'number  â€” rows without IMO or MMSI',
      errors: 'number',
      done: 'boolean â€” true when no more batches remain',
    },
    batchingStrategy:
      'Run batch 0 through 44 sequentially (45 Ã— 200 = 9 000 rows). ' +
      'Each invocation streams the CSV, skips to the correct offset, ' +
      'and stops after batch_size Vessel rows.',
    dataSource: OPENSANCTIONS_URL,
  })
}

// â”€â”€â”€ POST â€” batch processor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const batchIndex = typeof body.batch === 'number' ? body.batch : -1
  if (batchIndex < 0) {
    return NextResponse.json(
      { error: 'missing_field', detail: '"batch" must be a non-negative integer' },
      { status: 400 }
    )
  }

  const batchSize = typeof body.batch_size === 'number' && body.batch_size > 0
    ? body.batch_size
    : DEFAULT_BATCH_SIZE

  // 3. Fetch CSV (streaming)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let csvStream: ReadableStream<Uint8Array>
  try {
    const token = process.env.OPENSANCTIONS_TOKEN
    if (!token) throw new Error('OPENSANCTIONS_TOKEN not set')

    const upstream = await fetch(OPENSANCTIONS_URL, {
      headers: { Authorization: `Token ${token}` },
      signal: controller.signal,
    })

    if (!upstream.ok) {
      clearTimeout(timeoutId)
      return NextResponse.json({ error: 'upstream_unavailable' }, { status: 503 })
    }

    if (!upstream.body) {
      clearTimeout(timeoutId)
      return NextResponse.json({ error: 'upstream_unavailable' }, { status: 503 })
    }

    csvStream = upstream.body
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return NextResponse.json({ error: 'upstream_unavailable', detail: message }, { status: 503 })
  }

  // 4. Stream-parse: scan to offset, collect batchSize vessel rows
  const records: SanctionRecord[] = []
  let skipped = 0
  let linesScanned = 0          // total lines read (0 = header)
  let vesselRowsFound = 0       // rows where schema === "Vessel"
  const startAt = batchIndex * batchSize
  const stopAfter = startAt + batchSize

  const decoder = new TextDecoder('utf-8')
  let remainder = ''

  try {
    const reader = csvStream.getReader()

    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = remainder + decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      // The last element may be an incomplete line â€” carry it forward
      remainder = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

        if (linesScanned === 0) {
          // Skip header row
          linesScanned++
          continue
        }

        linesScanned++

        // Fast pre-filter: only examine Vessel rows
        // Column 1 (schema) must equal "Vessel"
        // We can sniff without full parse: look for ",Vessel," pattern
        if (!line.includes('Vessel')) continue

        const cols = parseCSVLine(line)
        if (cols[1]?.trim() !== 'Vessel') continue

        vesselRowsFound++

        // Skip rows before our window
        if (vesselRowsFound <= startAt) continue

        // Parse full record
        const record = rowToRecord(cols)
        if (!record) {
          skipped++
        } else {
          records.push(record)
        }

        // Stop once we have consumed our window
        if (vesselRowsFound >= stopAfter) {
          reader.cancel()
          break outer
        }
      }
    }

    // Process any remaining content in the buffer
    if (remainder.trim()) {
      const line = remainder.endsWith('\r') ? remainder.slice(0, -1) : remainder
      if (line.includes('Vessel')) {
        linesScanned++
        const cols = parseCSVLine(line)
        if (cols[1]?.trim() === 'Vessel') {
          vesselRowsFound++
          if (vesselRowsFound > startAt && vesselRowsFound <= stopAfter) {
            const record = rowToRecord(cols)
            if (!record) skipped++
            else records.push(record)
          }
        }
      }
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const message = err instanceof Error ? err.message : 'stream_error'
    return NextResponse.json({ error: 'upstream_unavailable', detail: message }, { status: 503 })
  } finally {
    clearTimeout(timeoutId)
  }

  // 5. Write to Supabase
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'config_error'
    return NextResponse.json({ error: 'db_error', detail: message }, { status: 500 })
  }

  let upserted = 0
  let dbErrors = 0

  if (records.length > 0) {
    // â”€â”€ 5a. Upsert into sanctions table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sanctionsRows = records.map((r) => ({
      opensanctions_id: r.opensanctions_id,
      name: r.name,
      aliases: r.aliases,
      schema_type: r.schema_type,
      mmsi: r.mmsi,
      imo_number: r.imo_number,
      call_sign: r.call_sign,
      flag_state: r.flag_state,
      datasets: r.datasets,
      topics: r.topics,
      first_seen: r.first_seen,
      last_checked: r.last_checked,
      content: r.content,
    }))

    try {
      const { error: upsertError } = await supabase
        .from('sanctions')
        .upsert(sanctionsRows, { onConflict: 'opensanctions_id' })

      if (upsertError) {
        const sbErr = upsertError as SupabaseError
        return NextResponse.json(
          { error: 'db_error', detail: sbErr.message },
          { status: 500 }
        )
      }

      upserted = records.length
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_db_error'
      return NextResponse.json({ error: 'db_error', detail: message }, { status: 500 })
    }

    // â”€â”€ 5b. Flag matched vessels in the vessels table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const mmsiList = records.map((r) => r.mmsi).filter((m): m is string => m !== null)
    const imoList = records.map((r) => r.imo_number).filter((i): i is string => i !== null)

    if (mmsiList.length > 0 || imoList.length > 0) {
      try {
        // Supabase doesn't support OR across two .in() in one call directly,
        // so we fire two updates and let Postgres handle overlaps gracefully.
        const updates: Promise<{ error: SupabaseError | null }>[] = []

        if (mmsiList.length > 0) {
          updates.push(
            supabase
              .from('vessels')
              .update({ sanctions_match: true })
              .in('mmsi', mmsiList) as unknown as Promise<{ error: SupabaseError | null }>
          )
        }

        if (imoList.length > 0) {
          updates.push(
            supabase
              .from('vessels')
              .update({ sanctions_match: true })
              .in('imo_number', imoList) as unknown as Promise<{ error: SupabaseError | null }>
          )
        }

        const results = await Promise.all(updates)
        for (const res of results) {
          if (res.error) dbErrors++
        }
      } catch {
        dbErrors++
      }
    }

    // â”€â”€ 5c. Upsert into sanctioned_vessels table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sanctionedRows: SanctionedVesselRecord[] = records.map((r) => ({
      mmsi: r.mmsi,
      imo_number: r.imo_number,
      vessel_name: r.name,
      flag_state: r.flag_state,
      sanctions_lists: {
        programs: r.topics,
        datasets: r.datasets,
        raw: r.content.sanctions_raw,
      },
      last_updated: new Date().toISOString(),
    }))

    try {
      const { error: svError } = await supabase
        .from('sanctioned_vessels')
        .upsert(sanctionedRows, { onConflict: 'mmsi,imo_number' })

      if (svError) {
        // Non-fatal â€” increment error count but don't abort
        dbErrors++
      }
    } catch {
      dbErrors++
    }
  }

  // 6. Determine if there are more batches
  // If we found fewer vessel rows than our window end, we've exhausted the file.
  const done = vesselRowsFound < stopAfter

  const result: BatchResult = {
    batch: batchIndex,
    processed: records.length + skipped,
    upserted,
    skipped,
    errors: dbErrors,
    done,
  }

  return NextResponse.json(result, { status: 200 })
}

