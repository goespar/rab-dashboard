const DATA_SHEET_NAME = 'RABData'
const WORKFLOW_SHEETS = {
  materials: 'RAB_MATERIAL',
  activityCatalog: 'DATABASE_KEGIATAN',
  components: 'RAB_KOMPONEN',
  activities: 'RAB_KEGIATAN',
  materialRecap: 'REKAP_MATERIAL',
  paTransfers: 'PA_TRANSFERS',
  realizations: 'REALISASI',
}
const DATA_HEADERS = [
  'NO.PRK', 'NO.PRK SKKI', 'NO.PRK FIX', 'NO.WBS', 'POS ANGGARAN', 'NO.RAB', 'NO.PA',
  'URAIAN', 'TOTAL PRK', 'RELOKASI', 'REVISI SKKI', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA',
  'NOKONTRAK', 'VENDOR', 'NILAI KONTRAK', 'PENGEMBALIAN PA', 'PENGGANTIAN BIAYA', 'TAGIHAN',
  'TOTAL BAYAR', 'SISA PRK', 'PROGRAM', 'TAHUN ANGGARAN', 'KETERANGAN', 'POS ANGGARAN', 'RECORD ID',
]

const CLIENT_KEYS = {
  'NO.PRK': 'prk', 'NO.PRK SKKI': 'prkSkki', 'NO.PRK FIX': 'prkFix', 'NO.WBS': 'wbs',
  'POS ANGGARAN': 'position', 'NO.RAB': 'rabNumber', 'NO.PA': 'paNumber', 'URAIAN': 'description',
  'TOTAL PRK': 'totalPrk', 'RELOKASI': 'relocation', 'REVISI SKKI': 'skkiRevision',
  'TOTAL AKHIR': 'totalFinal', 'TOTAL RAB': 'rabTotal', 'TOTAL PA': 'paTotal',
  'NOKONTRAK': 'contractNumber', 'VENDOR': 'vendor', 'NILAI KONTRAK': 'contractValue',
  'PENGEMBALIAN PA': 'paReturn', 'PENGGANTIAN BIAYA': 'costReplacement', 'TAGIHAN': 'billed',
  'TOTAL BAYAR': 'paid', 'SISA PRK': 'prkRemaining', 'PROGRAM': 'program',
  'TAHUN ANGGARAN': 'year', 'KETERANGAN': 'notes', 'RECORD ID': 'id',
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
  if (payload.action === 'transferToPA') {
    try {
      return json_({ ok: true, ...transferToPA_(payload) })
    } catch (error) {
      return json_({ ok: false, error: error.message || 'Finalisasi ke PA gagal.' })
    }
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
  result.id = result.id || `row-${row.sourceRow}`
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

function transferToPA_(payload) {
  const amount = Number(payload.amount)
  if (!payload.recordId) throw new Error('Data PRK yang akan difinalisasi tidak ditemukan.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nilai transfer harus lebih besar dari nol.')

  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const sheet = getDataSheet_()
    const values = sheet.getDataRange().getValues()
    const headers = values.shift() || []
    const rabIndex = headers.indexOf('TOTAL RAB')
    const paIndex = headers.indexOf('TOTAL PA')
    const contractIndex = headers.indexOf('NILAI KONTRAK')
    if (rabIndex < 0 || paIndex < 0 || contractIndex < 0) throw new Error('Kolom TOTAL RAB, TOTAL PA, atau NILAI KONTRAK tidak ditemukan.')

    let targetRow = -1
    let target = null
    values.forEach((row, index) => {
      if (target) return
      const source = { sourceRow: index + 2 }
      headers.forEach((header, column) => { source[header] = row[column] })
      const record = toClientRecord_(source)
      if (String(record.id) === String(payload.recordId)) {
        targetRow = index + 2
        target = record
      }
    })
    if (!target) throw new Error('PRK tidak ditemukan. Muat ulang data lalu coba lagi.')

    const previousRab = Number(target.rabTotal) || 0
    const previousPA = Number(target.paTotal) || 0
    if (amount > previousRab + 0.000001) throw new Error(`Nilai transfer melebihi sisa RAB ${previousRab}.`)

    const nextRab = Math.max(0, previousRab - amount)
    const nextPA = previousPA + amount
    const previousContract = Number(target.contractValue) || 0
    try {
      sheet.getRange(targetRow, rabIndex + 1).setValue(nextRab)
      sheet.getRange(targetRow, paIndex + 1).setValue(nextPA)
      sheet.getRange(targetRow, contractIndex + 1).setValue(nextPA)
      const transfer = {
        id: Utilities.getUuid(), recordId: target.id, prk: target.prk, rabNumber: target.rabNumber,
        criteria: payload.criteria || '', description: target.description || '', date: payload.date || new Date().toISOString().slice(0, 10),
        amount, rabBefore: previousRab, rabAfter: nextRab, paBefore: previousPA, paAfter: nextPA,
        contractValue: nextPA, notes: String(payload.notes || '').trim(), createdAt: new Date().toISOString(),
      }
      getWorkflowSheet_(WORKFLOW_SHEETS.paTransfers).appendRow([transfer.id, JSON.stringify(transfer), new Date()])
      return { transfer, record: { ...target, rabTotal: nextRab, paTotal: nextPA, contractValue: nextPA } }
    } catch (error) {
      sheet.getRange(targetRow, rabIndex + 1).setValue(previousRab)
      sheet.getRange(targetRow, paIndex + 1).setValue(previousPA)
      sheet.getRange(targetRow, contractIndex + 1).setValue(previousContract)
      throw error
    }
  } finally {
    lock.releaseLock()
  }
}