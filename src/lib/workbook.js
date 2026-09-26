import ExcelJS from 'exceljs'

export const HEADERS = [
  'NO.PRK', 'NO.PRK SKKI', 'NO.PRK FIX', 'NO.WBS', 'POS ANGGARAN', 'NO.RAB', 'NO.PA',
  'URAIAN', 'TOTAL PRK', 'RELOKASI', 'REVISI SKKI', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA',
  'NOKONTRAK', 'VENDOR', 'NILAI KONTRAK', 'PENGEMBALIAN PA', 'PENGGANTIAN BIAYA', 'TAGIHAN',
  'TOTAL BAYAR', 'SISA PRK', 'PROGRAM', 'TAHUN ANGGARAN', 'KETERANGAN', 'POS ANGGARAN',
]

const COLUMN_KEYS = {
  'NO.PRK': 'prk', 'NO.PRK SKKI': 'prkSkki', 'NO.PRK FIX': 'prkFix', 'NO.WBS': 'wbs',
  'POS ANGGARAN': 'position', 'NO.RAB': 'rabNumber', 'NO.PA': 'paNumber', 'URAIAN': 'description',
  'TOTAL PRK': 'totalPrk', RELOKASI: 'relocation', 'REVISI SKKI': 'skkiRevision', 'TOTAL AKHIR': 'totalFinal',
  'TOTAL RAB': 'rabTotal', 'TOTAL PA': 'paTotal', NOKONTRAK: 'contractNumber', VENDOR: 'vendor',
  'NILAI KONTRAK': 'contractValue', 'PENGEMBALIAN PA': 'paReturn', 'PENGGANTIAN BIAYA': 'costReplacement',
  TAGIHAN: 'billed', 'TOTAL BAYAR': 'paid', 'SISA PRK': 'prkRemaining', PROGRAM: 'program',
  'TAHUN ANGGARAN': 'year', KETERANGAN: 'notes',
}

const NUMERIC_KEYS = new Set(['totalPrk', 'relocation', 'skkiRevision', 'totalFinal', 'rabTotal', 'paTotal', 'contractValue', 'paReturn', 'costReplacement', 'billed', 'paid', 'prkRemaining', 'year'])

export const sampleRecords = []

function normalizedHeader(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(String(value).replace(/[Rp\s]/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headers = row.map(normalizedHeader)
    return headers.includes('NOPRK') && headers.includes('URAIAN') && headers.includes('TOTALRAB') && headers.includes('NILAIKONTRAK')
  })
}

function workbookCellValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object' || value instanceof Date) return value
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  if ('result' in value) return value.result ?? ''
  if ('text' in value) return value.text
  return ''
}

function normalizeRecord(row, headerRow, sheetName, rowIndex) {
  const record = { sourceSheet: sheetName, sourceRow: rowIndex + 1 }
  headerRow.forEach((header, index) => {
    const key = COLUMN_KEYS[String(header ?? '').trim().toUpperCase()]
    if (!key) return
    record[key] = NUMERIC_KEYS.has(key) ? toNumber(row[index]) : String(row[index] ?? '').trim()
  })
  record.id = record.prk || record.rabNumber || record.paNumber || `${sheetName}-${rowIndex + 1}`
  record.program = record.program || 'Lainnya'
  return record
}

export async function importWorkbook(file) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheets = workbook.worksheets.map((worksheet) => {
    const rows = []
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      rows[row.number - 1] = Array.from({ length: worksheet.columnCount }, (_, index) => workbookCellValue(row.getCell(index + 1).value))
    })
    return { name: worksheet.name, rows }
  })
  const preferred = sheets.find((sheet) => ['DATA ANGGARAN INVESTASI', 'DATA PENGADAAN'].includes(sheet.name.trim().toUpperCase()))
  const candidates = preferred ? [preferred, ...sheets.filter((sheet) => sheet !== preferred)] : sheets
  let chosen
  let headerIndex = -1
  for (const sheet of candidates) {
    const found = findHeaderRow(sheet.rows.slice(0, 15))
    if (found >= 0) { chosen = sheet; headerIndex = found; break }
  }
  if (!chosen) throw new Error('Kolom rekap tidak ditemukan. Gunakan sheet DATA ANGGARAN INVESTASI dengan header NO.PRK, URAIAN, TOTAL RAB, dan NILAI KONTRAK.')
  const headerRow = chosen.rows[headerIndex]
  const records = chosen.rows.slice(headerIndex + 1)
    .map((row, index) => normalizeRecord(row, headerRow, chosen.name, headerIndex + index + 1))
    .filter((record) => record.prk || record.rabNumber || record.paNumber || record.description)
  if (!records.length) throw new Error('Sheet ditemukan, tetapi tidak ada baris data anggaran untuk diimpor.')
  return { records, sheetName: chosen.name }
}

export async function exportWorkbook(records) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DATA PENGADAAN')
  sheet.columns = HEADERS.map((header) => ({ header, width: header === 'URAIAN' ? 54 : header === 'NOKONTRAK' ? 32 : 18 }))
  records.forEach((record) => sheet.addRow(HEADERS.map((header) => record[COLUMN_KEYS[header]] ?? '')))
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'rekap-rab.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0).replace('IDR', 'Rp')
}