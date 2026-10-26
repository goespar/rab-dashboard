import ExcelJS from 'exceljs'
import { normalizeMonitoringHeader } from './monitoringWorkbook.js'

function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'object') return value
  if ('result' in value && value.result !== undefined) return cellText(value.result)
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  if ('text' in value) return value.text
  return ''
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return null
  let normalized = text
  if (normalized.includes('.') && normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.')
  else if (normalized.includes(',') && !normalized.includes('.')) normalized = normalized.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function workType(value) {
  const text = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (/\bBONGKAR\b|\bPEMBONGKARAN\b/.test(text)) return 'BONGKAR'
  if (/\bPASANG\b|\bPEMASANGAN\b/.test(text)) return 'PASANG'
  return ''
}

function findHeader(worksheet) {
  const maxRow = Math.min(worksheet.rowCount, 80)
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const headers = worksheet.getRow(rowNumber).values.slice(1).map((value) => normalizeMonitoringHeader(cellText(value)))
    const descriptionIndex = headers.findIndex((header) => ['BARANGJASA', 'URAIAN', 'URAIANMATERIAL'].includes(header))
    const volumeIndex = headers.findIndex((header) => ['VOL', 'VOLUME'].includes(header))
    if (descriptionIndex >= 0 && volumeIndex >= 0) {
      const priceIndex = headers.findIndex((header) => header === 'HARGASATUAN')
      return {
        rowNumber,
        descriptionColumn: descriptionIndex + 1,
        volumeColumn: volumeIndex + 1,
        priceColumn: priceIndex >= 0 ? priceIndex + 1 : 0,
      }
    }
  }
  return null
}

function chooseActiveSheet(workbook) {
  const visibleSheets = workbook.worksheets.filter((worksheet) => worksheet.state === 'visible')
  const activeTab = Number(workbook.views?.[0]?.activeTab)
  const active = Number.isInteger(activeTab) ? workbook.worksheets[activeTab] : null
  if (active?.state === 'visible' && /^REKAP\b/i.test(active.name.trim())) return active
  return visibleSheets.find((worksheet) => /^REKAP\b/i.test(worksheet.name.trim())) || active || visibleSheets[0] || null
}

function extractMaterials(worksheet, header, meta) {
  const rows = []
  let currentType = ''
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const description = String(cellText(row.getCell(header.descriptionColumn).value) ?? '').trim()
    const volume = numberValue(cellText(row.getCell(header.volumeColumn).value))
    if (!description) continue

    const rowText = row.values.slice(1, 22).map((value) => String(cellText(value) ?? '').trim()).filter(Boolean).join(' | ')
    const rowType = workType(rowText)
    const looksLikeHeading = /^(?:\s*[-–—:.)]*\s*)?(?:PASANG|PEMASANGAN|BONGKAR|PEMBONGKARAN)(?:\s+.*)?$/i.test(description)
      || /(?:^|[|])\s*(?:PASANG|PEMASANGAN|BONGKAR|PEMBONGKARAN)(?:\s*[-–—:.)]*\s*)?(?:$|[|])/i.test(rowText)
    if ((volume === null || volume === 0) && rowType && looksLikeHeading) {
      currentType = rowType
      continue
    }
    if (volume === null || volume <= 0) continue

    const type = (workType(description) && looksLikeHeading ? workType(description) : currentType) || 'LAINNYA'
    const price = header.priceColumn ? numberValue(cellText(row.getCell(header.priceColumn).value)) : ''
    rows.push([
      new Date().toISOString(),
      meta.idRAB,
      meta.prk,
      meta.fileName,
      meta.activeRekap,
      worksheet.name,
      rowNumber,
      description,
      volume,
      type,
      price ?? '',
    ])
  }
  return rows
}

export async function readRabMaterialFile(file, { idRAB, prk }) {
  const cleanId = String(idRAB ?? '').trim()
  const cleanPrk = String(prk ?? '').trim()
  if (!cleanId) throw new Error('ID RAB wajib diisi.')
  if (!cleanPrk) throw new Error('PRK wajib diisi.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = chooseActiveSheet(workbook)
  if (!worksheet) throw new Error('File tidak memiliki sheet Excel yang dapat dibaca.')
  if (worksheet.state !== 'visible') throw new Error('Sheet RAB yang dipilih sedang tersembunyi. Tampilkan sheet lalu simpan ulang file.')

  const header = findHeader(worksheet)
  if (!header) throw new Error(`Header material dan volume tidak ditemukan di sheet "${worksheet.name}". Pastikan ada kolom BARANG/JASA atau URAIAN dan VOL/VOLUME.`)
  const metadata = {
    idRAB: cleanId,
    prk: cleanPrk,
    fileName: String(file.name ?? '').trim(),
    activeRekap: worksheet.name,
  }
  const rows = extractMaterials(worksheet, header, metadata)
  if (!rows.length) throw new Error(`Tidak ditemukan material dengan volume lebih dari 0 pada sheet "${worksheet.name}".`)
  const sheets = workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    state: sheet.state,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
  }))
  return { metadata: { ...metadata, detailSheet: worksheet.name }, rows, sheets }
}

export function summarizeRabMaterials(rows) {
  const grouped = new Map()
  rows.forEach((row) => {
    const key = JSON.stringify([String(row[7] ?? '').trim(), String(row[9] ?? 'LAINNYA').trim()])
    const entry = grouped.get(key) || {
      material: String(row[7] ?? '').trim(),
      type: String(row[9] ?? 'LAINNYA').trim(),
      rowCount: 0,
      volume: 0,
      totalPrice: 0,
    }
    entry.rowCount += 1
    entry.volume += numberValue(row[8]) || 0
    entry.totalPrice += (numberValue(row[10]) || 0) * (numberValue(row[8]) || 0)
    grouped.set(key, entry)
  })
  return [...grouped.values()].sort((left, right) => right.volume - left.volume)
}
