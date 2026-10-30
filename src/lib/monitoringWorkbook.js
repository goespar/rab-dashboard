import ExcelJS from 'exceljs'

export const MONITORING_MODULES = [
  { id: 'spb', label: 'SPB', sheetNames: ['SPB'], required: ['NO SPB', 'URAIAN MATERIAL'] },
  { id: 'stock', label: 'Stock Gudang', sheetNames: ['STOCK GUDANG'], required: ['NAMA MATERIAL', 'VOL GUDANG'] },
  { id: 'load', label: 'Monitoring Beban', sheetNames: ['BEBAN GI DAN PYL'], required: ['PENYULANG', 'BEBAN SIANG'] },
  { id: 'rabDatabase', label: 'Database RAB', sheetNames: ['DATABASE_RAB', 'DATABASE RAB'], required: ['ID RAB', 'URAIAN MATERIAL'] },
  { id: 'tibet', label: 'Mon Tibet', sheetNames: ['TIBET'], required: ['VENDOR', 'NOMOR KR'] },
  { id: 'vendor', label: 'Mon Kontrak Vendor', sheetNames: ['MON KONTRAK VENDOR'], required: ['NOMOR KONTRAK', 'VENDOR'] },
  { id: 'customers', label: 'Mon Kebutuhan Pelanggan', sheetNames: ['MON KEBUTUHAN PELANGGAN', 'MON PLG PERLUASAN'], required: ['NAMA', 'NO PK'] },
]

export function normalizeMonitoringHeader(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function getTibetDisplayRows(headers, rows) {
  const indexes = ['VENDOR', 'NOMOR KR', 'JENIS TIBET'].map((name) =>
    headers.findIndex((header) => normalizeMonitoringHeader(header) === normalizeMonitoringHeader(name))
  )
  let previousGroup = null

  return rows.map((row) => {
    const currentGroup = indexes.map((index) => String(row[index] ?? '').trim())
    const repeatedGroup = previousGroup
      && currentGroup[0]
      && currentGroup[1]
      && currentGroup.every((value, index) => value === previousGroup[index])
    const displayRow = repeatedGroup ? row.map((value, index) => indexes.includes(index) ? '' : value) : row

    if (currentGroup[0] && currentGroup[1]) previousGroup = currentGroup
    return displayRow
  })
}

function getCellValue(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return ''
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (typeof value !== 'object') return value
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  if ('result' in value) return getCellValue(value.result)
  if ('text' in value) return value.text
  return ''
}

function getHeaderRow(worksheet, required) {
  const requiredHeaders = required.map(normalizeMonitoringHeader)
  let best = { rowNumber: 0, score: 0, headers: [] }
  const lastRow = Math.min(worksheet.rowCount, 15)
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const headers = Array.from({ length: worksheet.columnCount }, (_, index) => String(getCellValue(row.getCell(index + 1).value) || '').trim())
    const normalized = headers.map(normalizeMonitoringHeader)
    const score = requiredHeaders.filter((header) => normalized.includes(header)).length
    if (score > best.score) best = { rowNumber, score, headers }
  }
  if (best.score < requiredHeaders.length) return null
  return best
}

function readWorksheet(worksheet, module) {
  const header = getHeaderRow(worksheet, module.required)
  if (!header) {
    throw new Error(`Header sheet "${worksheet.name}" tidak sesuai untuk menu ${module.label}.`)
  }

  const columnCount = module.id === 'vendor' ? Math.min(29, worksheet.columnCount) : worksheet.columnCount
  const seenHeaders = new Map()
  const headers = header.headers.slice(0, columnCount).map((value, index) => {
    const fallback = module.id === 'vendor' && index === 28
      ? 'STATUS KONTRAK'
      : `Kolom ${index + 1}`
    const label = value || fallback
    const normalized = normalizeMonitoringHeader(label)
    const occurrence = (seenHeaders.get(normalized) || 0) + 1
    seenHeaders.set(normalized, occurrence)
    return occurrence > 1 ? `${label} (${occurrence})` : label
  })
  const rows = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= header.rowNumber) return
    const values = headers.map((_, index) => getCellValue(row.getCell(index + 1).value))
    if (values.some((value) => value !== '' && value !== null && value !== undefined)) rows.push(values)
  })
  return { sheetName: worksheet.name, headers, rows }
}

function enrichVendorRows(dataset, worksheet) {
  if (!dataset) return
  const contractIndex = 0
  const statusIndex = 28
  const vendorWorkOrderIndex = headersFor(dataset).indexOf('NOMORWO')
  dataset.headers[statusIndex] = 'STATUS KONTRAK'
  if (dataset.headers.length < 29) dataset.headers.length = 29

  let group = []
  const applyGroupStatus = (rows) => {
    if (!rows.length) return
    const parent = rows.find((row) => String(row[contractIndex] ?? '').trim())
    if (!parent) return
    const normalizeStatus = (value) => {
      const status = String(value ?? '').trim().toUpperCase()
      return /\bOPEN\b/.test(status) ? 'OPEN' : /\bCLOSE\b/.test(status) ? 'CLOSE' : ''
    }
    const subId = String(parent[27] ?? '').trim()
    const status = normalizeStatus(parent[statusIndex])
      || rows.map((row) => normalizeStatus(row[statusIndex])).find(Boolean)
      || (subId ? 'CLOSE' : 'OPEN')
    rows.forEach((row) => { row[statusIndex] = status })
  }

  dataset.rows.forEach((row) => {
    if (String(row[contractIndex] ?? '').trim()) {
      applyGroupStatus(group)
      group = []
    }
    group.push(row)
  })
  applyGroupStatus(group)

  const needsMaterialLookup = vendorWorkOrderIndex >= 0 && dataset.rows.some((row) => (
    String(row[vendorWorkOrderIndex] ?? '').trim()
    && !String(row[24] ?? '').trim()
    && !String(row[25] ?? '').trim()
    && !String(row[26] ?? '').trim()
  ))
  if (!worksheet || !needsMaterialLookup) return

  const materialSheet = worksheet
  const materialHeader = getHeaderRow(materialSheet, ['MIMS', 'WO', 'NO SAP', 'NAMA MATERIAL'])
  if (!materialHeader) return
  const headers = materialHeader.headers.map(normalizeMonitoringHeader)
  const mimsIndex = headers.indexOf('MIMS')
  const materialWorkOrderIndex = headers.indexOf('WO')
  const sapIndex = headers.indexOf('NOSAP')
  const materialIndex = headers.indexOf('NAMAMATERIAL')
  const quantityIndex = headers.indexOf('JUMLAHMATERIAL')
  const byReference = new Map()
  const normalizeReference = (value) => String(value ?? '').trim().replace(/\s+/g, '').toUpperCase()
  materialSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= materialHeader.rowNumber) return
    const values = Array.from({ length: materialSheet.columnCount }, (_, index) => getCellValue(row.getCell(index + 1).value))
    const material = [values[sapIndex], values[materialIndex], values[quantityIndex]]
    for (const index of [mimsIndex, materialWorkOrderIndex]) {
      const reference = normalizeReference(values[index])
      if (!reference) continue
      if (!byReference.has(reference)) byReference.set(reference, [])
      byReference.get(reference).push(material)
    }
  })

  if (vendorWorkOrderIndex < 0) return
  ;[24, 25, 26].forEach((index) => {
    if (dataset.headers.length <= index) dataset.headers[index] = ['NO SAP MATERIAL', 'NAMA MATERIAL', 'JUMLAH MATERIAL'][index - 24]
  })
  dataset.rows.forEach((row) => {
    const matches = byReference.get(normalizeReference(row[vendorWorkOrderIndex])) || []
    if (!matches.length) return
    row[24] = matches.map(([sap]) => sap).filter(Boolean).join('\n')
    row[25] = matches.map(([, name]) => name).filter(Boolean).join('\n')
    row[26] = matches.map(([, quantity]) => quantity).filter(Boolean).join('\n')
  })
}

function headersFor(dataset) {
  return dataset.headers.map(normalizeMonitoringHeader)
}

function linkStockToSpb(stock, spb) {
  if (!stock || !spb) return
  const stockHeaderIndexes = ['NORMALISASI', 'NAMABARANG', 'NAMAMATERIAL']
    .map((header) => headersFor(stock).indexOf(header)).filter((index) => index >= 0)
  const spbHeaders = headersFor(spb)
  const spbNameIndexes = ['NORMALISASI', 'URAIANMATERIAL'].map((header) => spbHeaders.indexOf(header)).filter((index) => index >= 0)
  const spbNumberIndex = spbHeaders.indexOf('NOSPB')
  const references = new Map()
  const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, '').toUpperCase()
  spb.rows.forEach((row) => {
    const number = String(row[spbNumberIndex] ?? '').trim()
    if (!number) return
    spbNameIndexes.forEach((index) => {
      const name = normalize(row[index])
      if (!name) return
      if (!references.has(name)) references.set(name, new Set())
      references.get(name).add(number)
    })
  })
  stock.headers.push('NO SPB TERKAIT')
  stock.rows.forEach((row) => {
    const matches = new Set()
    stockHeaderIndexes.forEach((index) => {
      for (const value of references.get(normalize(row[index])) || []) matches.add(value)
    })
    row.push([...matches].join('\n'))
  })
}

export async function importMonitoringWorkbook(file, onProgress) {
  onProgress?.('Membuka workbook Excel…')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheets = new Map(workbook.worksheets.map((worksheet) => [normalizeMonitoringHeader(worksheet.name), worksheet]))
  const datasets = {}
  const missing = []

  for (const module of MONITORING_MODULES) {
    onProgress?.(`Membaca sheet ${module.label}…`)
    const worksheet = module.sheetNames
      .map((name) => worksheets.get(normalizeMonitoringHeader(name)))
      .find(Boolean)
    if (!worksheet) {
      missing.push(module.label)
      continue
    }
    datasets[module.id] = readWorksheet(worksheet, module)
  }

  if (missing.length) {
    throw new Error(`Sheet berikut belum ditemukan: ${missing.join(', ')}. Pastikan workbook mencakup seluruh menu Monitoring.`)
  }

  const vendor = datasets.vendor
  const materialSheet = worksheets.get(normalizeMonitoringHeader('DATA WO DAN MIMS'))
  if (vendor) {
    onProgress?.('Menyiapkan status dan referensi kontrak…')
    enrichVendorRows(vendor, materialSheet)
  }
  linkStockToSpb(datasets.stock, datasets.spb)
  onProgress?.('Workbook siap disimpan.')
  return datasets
}
