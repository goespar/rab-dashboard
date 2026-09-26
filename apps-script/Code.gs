const DATA_SHEET_NAME = 'RABData'
const WORKFLOW_SHEETS = {
  materials: 'RAB_MATERIAL',
  components: 'RAB_KOMPONEN',
  activities: 'RAB_KEGIATAN',
  materialRecap: 'REKAP_MATERIAL',
  realizations: 'REALISASI',
}
const DATA_HEADERS = [
  'NO.PRK', 'NO.PRK SKKI', 'NO.PRK FIX', 'NO.WBS', 'POS ANGGARAN', 'NO.RAB', 'NO.PA',
  'URAIAN', 'TOTAL PRK', 'RELOKASI', 'REVISI SKKI', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA',
  'NOKONTRAK', 'VENDOR', 'NILAI KONTRAK', 'PENGEMBALIAN PA', 'PENGGANTIAN BIAYA', 'TAGIHAN',
  'TOTAL BAYAR', 'SISA PRK', 'PROGRAM', 'TAHUN ANGGARAN', 'KETERANGAN', 'POS ANGGARAN',
]

const CLIENT_KEYS = {
  'NO.PRK': 'prk', 'NO.PRK SKKI': 'prkSkki', 'NO.PRK FIX': 'prkFix', 'NO.WBS': 'wbs',
  'POS ANGGARAN': 'position', 'NO.RAB': 'rabNumber', 'NO.PA': 'paNumber', 'URAIAN': 'description',
  'TOTAL PRK': 'totalPrk', 'RELOKASI': 'relocation', 'REVISI SKKI': 'skkiRevision',
  'TOTAL AKHIR': 'totalFinal', 'TOTAL RAB': 'rabTotal', 'TOTAL PA': 'paTotal',
  'NOKONTRAK': 'contractNumber', 'VENDOR': 'vendor', 'NILAI KONTRAK': 'contractValue',
  'PENGEMBALIAN PA': 'paReturn', 'PENGGANTIAN BIAYA': 'costReplacement', 'TAGIHAN': 'billed',
  'TOTAL BAYAR': 'paid', 'SISA PRK': 'prkRemaining', 'PROGRAM': 'program',
  'TAHUN ANGGARAN': 'year', 'KETERANGAN': 'notes',
}

function doGet(event) {
  const action = event && event.parameter && event.parameter.action
  if (action === 'health') return json_({ ok: true, service: 'RAB Monitor' })
  if (action === 'loadWorkflow') return json_({ ok: true, collections: loadWorkflow_() })
  if (action && action !== 'load') return json_({ ok: false, error: 'Aksi tidak dikenal.' })
  const sheet = getDataSheet_()
  const values = sheet.getDataRange().getValues()
  const headers = values.shift() || []
  const records = values.filter((row) => row.some((cell) => cell !== '')).map((row, index) => {
    const record = { sourceRow: index + 2 }
    headers.forEach((header, column) => { record[header] = row[column] === null ? '' : row[column] })
    return toClientRecord_(record)
  })
  return json_({ ok: true, records })
}

function doPost(event) {
  let payload
  try { payload = JSON.parse(event.postData.contents) } catch (error) {
    return json_({ ok: false, error: 'Isi permintaan bukan JSON yang valid.' })
  }
  if (payload.action === 'saveWorkflow') {
    if (!Object.prototype.hasOwnProperty.call(WORKFLOW_SHEETS, payload.collection) || !Array.isArray(payload.records)) {
      return json_({ ok: false, error: 'Jenis data atau daftar record tidak valid.' })
    }
    if (payload.records.length > 5000) return json_({ ok: false, error: 'Maksimum 5.000 baris per jenis data.' })
    saveWorkflow_(payload.collection, payload.records)
    return json_({ ok: true, collection: payload.collection, rows: payload.records.length })
  }
  if (payload.action !== 'save' || !Array.isArray(payload.records)) return json_({ ok: false, error: 'Permintaan simpan tidak valid.' })
  if (payload.records.length > 5000) return json_({ ok: false, error: 'Maksimum 5.000 baris per penyimpanan.' })

  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const sheet = getDataSheet_()
    const rows = payload.records.map((record) => DATA_HEADERS.map((header) => record[CLIENT_KEYS[header]] ?? ''))
    sheet.clearContents()
    sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS])
    if (rows.length) sheet.getRange(2, 1, rows.length, DATA_HEADERS.length).setValues(rows)
    return json_({ ok: true, rows: rows.length, updatedAt: new Date().toISOString() })
  } finally {
    lock.releaseLock()
  }
}

function getDataSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet()
  if (!spreadsheet) throw new Error('Atur Script Property SPREADSHEET_ID terlebih dahulu.')
  let sheet = spreadsheet.getSheetByName(DATA_SHEET_NAME)
  if (!sheet) sheet = spreadsheet.insertSheet(DATA_SHEET_NAME)
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS])
  return sheet
}

function toClientRecord_(row) {
  const result = {}
  Object.keys(CLIENT_KEYS).forEach((header) => { result[CLIENT_KEYS[header]] = row[header] })
  result.id = result.prk || result.rabNumber || result.paNumber || `row-${row.sourceRow}`
  return result
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

function loadWorkflow_() {
  const collections = {}
  Object.keys(WORKFLOW_SHEETS).forEach((key) => {
    const sheet = getWorkflowSheet_(WORKFLOW_SHEETS[key])
    const lastRow = sheet.getLastRow()
    collections[key] = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 3).getValues()
      .filter((row) => row[1])
      .map((row) => JSON.parse(row[1]))
  })
  return collections
}

function saveWorkflow_(collection, records) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const sheet = getWorkflowSheet_(WORKFLOW_SHEETS[collection])
    const rows = records.map((record) => [record.id || '', JSON.stringify(record), new Date()])
    sheet.clearContents()
    sheet.getRange(1, 1, 1, 3).setValues([['ID', 'DATA_JSON', 'UPDATED_AT']])
    if (rows.length) sheet.getRange(2, 1, rows.length, 3).setValues(rows)
  } finally {
    lock.releaseLock()
  }
}

function getWorkflowSheet_(name) {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet()
  if (!spreadsheet) throw new Error('Atur Script Property SPREADSHEET_ID terlebih dahulu.')
  let sheet = spreadsheet.getSheetByName(name)
  if (!sheet) sheet = spreadsheet.insertSheet(name)
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, 3).setValues([['ID', 'DATA_JSON', 'UPDATED_AT']])
  return sheet
}