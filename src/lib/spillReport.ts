import jsPDF from 'jspdf'
import { SpillResult } from '@/hooks/useSpillPredictor'

function computePolygonAreaKm2(polygon: { coordinates: number[][][] }): string {
  const coords = polygon.coordinates[0]
  if (!coords || coords.length < 3) return 'N/A'
  let area = 0
  const R = 6371 // Earth radius km
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i]
    const [lon2, lat2] = coords[i + 1]
    const x1 = (lon1 * Math.PI / 180) * R * Math.cos(lat1 * Math.PI / 180)
    const y1 = (lat1 * Math.PI / 180) * R
    const x2 = (lon2 * Math.PI / 180) * R * Math.cos(lat2 * Math.PI / 180)
    const y2 = (lat2 * Math.PI / 180) * R
    area += (x1 * y2 - x2 * y1)
  }
  return Math.abs(area / 2).toFixed(1)
}

function getBoundingBox(polygon: { coordinates: number[][][] }): {
  north: number; south: number; east: number; west: number
} | null {
  const coords = polygon.coordinates[0]
  if (!coords || coords.length === 0) return null
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lon, lat] of coords) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return { north: maxLat, south: minLat, east: maxLon, west: minLon }
}

export function generateSpillReport(
  result: SpillResult,
  vesselName: string | null
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const margin = 15

  // ── HEADER BLOCK ──────────────────────────────────────────────────────────
  doc.setFillColor(10, 22, 40)
  doc.rect(0, 0, pageW, 22, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('THALWEG MARITIME INTELLIGENCE', margin, 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 212, 255)
  doc.text('OIL SPILL DRIFT PREDICTION REPORT', margin, 16)

  // ── INCIDENT INFO BOX ─────────────────────────────────────────────────────
  const boxY = 26
  const boxH = 38
  doc.setFillColor(16, 28, 48)
  doc.setDrawColor(40, 60, 90)
  doc.setLineWidth(0.3)
  doc.rect(margin, boxY, pageW - margin * 2, boxH, 'FD')

  const labelSize = 7
  const valueSize = 9
  const colLeft = margin + 4
  const colRight = 110

  // Left column
  const leftFields: [string, string][] = [
    ['VESSEL', vesselName ?? 'UNKNOWN VESSEL'],
    ['MMSI', result.mmsi ?? 'N/A'],
    ['INCIDENT POSITION', `${result.origin.lat.toFixed(4)}° N, ${result.origin.lon.toFixed(4)}° E`],
  ]
  let ly = boxY + 8
  for (const [label, value] of leftFields) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(labelSize)
    doc.setTextColor(170, 170, 170)
    doc.text(label, colLeft, ly)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(valueSize)
    doc.setTextColor(255, 255, 255)
    doc.text(value, colLeft, ly + 4.5)
    ly += 11
  }

  // Right column
  const rightFields: [string, string][] = [
    ['GENERATED', new Date(result.generated_at).toUTCString()],
    ['SPILL VOLUME', `${result.spill_tonnes.toLocaleString()} tonnes`],
    ['VESSEL TYPE', (result.vessel_type ?? 'unknown').toUpperCase()],
  ]
  let ry = boxY + 8
  for (const [label, value] of rightFields) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(labelSize)
    doc.setTextColor(170, 170, 170)
    doc.text(label, colRight, ry)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(valueSize)
    doc.setTextColor(255, 255, 255)
    doc.text(value, colRight, ry + 4.5)
    ry += 11
  }

  // ── DRIFT PREDICTION TABLE ─────────────────────────────────────────────────
  let curY = boxY + boxH + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 212, 255)
  doc.text('DRIFT PREDICTION SUMMARY', margin, curY)
  curY += 6

  const tableX = margin
  const colW = [35, 35, 35, 40, 35]
  const headers = ['TIME HORIZON', 'CENTROID LAT', 'CENTROID LON', 'DRIFT DISTANCE', 'AREA (KM²)']
  const rowH = 8
  const tableW = colW.reduce((a, b) => a + b, 0)

  // Header row
  doc.setFillColor(10, 22, 40)
  doc.rect(tableX, curY, tableW, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(0, 212, 255)
  let hx = tableX
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], hx + 2, curY + 5.5)
    hx += colW[i]
  }
  curY += rowH

  // Data rows
  const rows: [string, string, string, string, string, [number, number, number]][] = [
    [
      '24 HOURS',
      String(result.centroid_drift.h24.lat),
      String(result.centroid_drift.h24.lon),
      `${result.centroid_drift.h24.distance_km} km`,
      `${computePolygonAreaKm2(result.footprints.h24)} km²`,
      [26, 42, 26],
    ],
    [
      '48 HOURS',
      String(result.centroid_drift.h48.lat),
      String(result.centroid_drift.h48.lon),
      `${result.centroid_drift.h48.distance_km} km`,
      `${computePolygonAreaKm2(result.footprints.h48)} km²`,
      [42, 26, 10],
    ],
    [
      '72 HOURS',
      String(result.centroid_drift.h72.lat),
      String(result.centroid_drift.h72.lon),
      `${result.centroid_drift.h72.distance_km} km`,
      `${computePolygonAreaKm2(result.footprints.h72)} km²`,
      [42, 10, 10],
    ],
  ]

  for (const [h, clat, clon, dist, area, bg] of rows) {
    doc.setFillColor(bg[0], bg[1], bg[2])
    doc.setDrawColor(40, 60, 90)
    doc.setLineWidth(0.2)
    doc.rect(tableX, curY, tableW, rowH, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    const cells = [h, clat, clon, dist, area]
    let cx = tableX
    for (let i = 0; i < cells.length; i++) {
      doc.text(cells[i], cx + 2, curY + 5.5)
      cx += colW[i]
    }
    curY += rowH
  }

  curY += 8

  // ── FOOTPRINT COORDINATES ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 212, 255)
  doc.text('CONTAMINATION POLYGON EXTENTS', margin, curY)
  curY += 6

  const extentHorizons: [string, typeof result.footprints.h24, [number, number, number]][] = [
    ['24-HOUR EXTENT', result.footprints.h24, [251, 191, 36]],
    ['48-HOUR EXTENT', result.footprints.h48, [249, 115, 22]],
    ['72-HOUR EXTENT', result.footprints.h72, [239, 68, 68]],
  ]

  for (const [label, fp, color] of extentHorizons) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(label, margin, curY)
    curY += 4.5

    const bb = getBoundingBox(fp)
    if (bb) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(170, 170, 170)
      doc.text(
        `North: ${bb.north.toFixed(4)}°   South: ${bb.south.toFixed(4)}°   East: ${bb.east.toFixed(4)}°   West: ${bb.west.toFixed(4)}°`,
        margin + 4,
        curY
      )
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(170, 170, 170)
      doc.text('Bounding box unavailable', margin + 4, curY)
    }
    curY += 7
  }

  curY += 4

  // ── DATA SOURCES ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 212, 255)
  doc.text('DATA SOURCES', margin, curY)
  curY += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(170, 170, 170)
  doc.text(`Ocean Currents: ${result.data_sources.currents}`, margin, curY)
  curY += 4.5
  doc.text(`Wind Data: ${result.data_sources.wind}`, margin, curY)
  curY += 10

  // ── DISCLAIMER BOX ────────────────────────────────────────────────────────
  const disclaimerH = 24
  doc.setFillColor(20, 12, 4)
  doc.setDrawColor(249, 115, 22)
  doc.setLineWidth(0.3)
  doc.rect(margin, curY, pageW - margin * 2, disclaimerH, 'FD')
  // Orange left accent bar
  doc.setFillColor(249, 115, 22)
  doc.rect(margin, curY, 3, disclaimerH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(249, 115, 22)
  doc.text('SIMULATION ONLY - NOT FOR EMERGENCY RESPONSE USE', margin + 6, curY + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(136, 136, 136)
  const disclaimerLines = doc.splitTextToSize(
    'This report is generated from numerical models using publicly available oceanographic data. ' +
    'Accuracy depends on data quality and model assumptions. For real maritime emergencies, contact ' +
    'your national Maritime Rescue Coordination Centre (MRCC) or USCG NRC: +1 800 424 8802',
    pageW - margin * 2 - 10
  )
  doc.text(disclaimerLines, margin + 6, curY + 13)

  // ── FOOTER ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(170, 170, 170)
  doc.text('thalweg.vercel.app', margin, pageH - 8)
  doc.text('Generated by THALWEG v1.0 - AGPL-3.0', pageW / 2, pageH - 8, { align: 'center' })
  doc.text('Page 1 of 1', pageW - margin, pageH - 8, { align: 'right' })

  // ── FOOTER DIVIDER ────────────────────────────────────────────────────────
  doc.setDrawColor(40, 60, 90)
  doc.setLineWidth(0.3)
  doc.line(margin, pageH - 11, pageW - margin, pageH - 11)

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().slice(0, 10)
  const mmsiStr = result.mmsi ?? 'unknown'
  doc.save(`thalweg-spill-${mmsiStr}-${timestamp}.pdf`)
}
