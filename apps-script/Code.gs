const DATA_SHEET_NAME = 'RABData'
const USERS_SHEET_NAME = 'USERS'
const SESSIONS_SHEET_NAME = 'SESSIONS'
const SESSION_HOURS = 8
const AUTH_USERS_CACHE_KEY = 'rab-auth-users-v1'
const AUTH_USERS_CACHE_SECONDS = 15
const PUBLIC_DASHBOARD_CACHE_KEY = 'rab-public-dashboard-v1'
const PUBLIC_DASHBOARD_CACHE_SECONDS = 20
const SHA256_K_ = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
const USER_ROLES = ['admin', 'planner', 'viewer']
const WORKFLOW_SHEETS = {
  materials: 'RAB_MATERIAL',
  activityCatalog: 'DATABASE_KEGIATAN',
  components: 'RAB_KOMPONEN',
  activities: 'RAB_KEGIATAN',
  materialRecap: 'REKAP_MATERIAL',
  paTransfers: 'PA_TRANSFERS',
  realizations: 'REALISASI',
}
const WORKFLOW_COLUMNS = {
  materials: [
    ['ID', 'id'], ['Kode', 'code'], ['Uraian Material', 'name'], ['Satuan', 'unit'], ['Kriteria', 'criteria'],
    ['Harga Material (Rp)', 'materialPrice'], ['Tarif Jasa (Rp)', 'servicePrice'], ['Jenis', 'source'], ['Catatan', 'notes'],
    ['Kegiatan Komponen', 'componentActivity'], ['Operasi', 'operation'], ['Diimpor Dari', 'importedFrom'], ['Baris Sumber', 'sourceRow'],
  ],
  activityCatalog: [
    ['ID', 'id'], ['Paket Pekerjaan', 'workPackage'], ['Nama Kegiatan', 'name'], ['Kegiatan', 'activity'], ['Satuan', 'unit'],
    ['No. PRK Acuan', 'prk'], ['Kriteria', 'criteria'], ['Catatan', 'notes'], ['Diimpor Dari', 'importedFrom'], ['Sheet Sumber', 'sourceSheet'], ['Baris Sumber', 'sourceRow'],
  ],
  components: [
    ['ID', 'id'], ['ID Data PRK', 'programRecordId'], ['No. PRK', 'prk'], ['Kriteria', 'criteria'],
    ['Kegiatan', 'activity'], ['Paket Kegiatan', 'workPackage'], ['Uraian Komponen', 'name'], ['ID Material', 'materialId'],
    ['Nama Material', 'materialName'], ['Keterangan', 'operation'], ['Jenis Material', 'source'], ['Volume per Satuan', 'quantityPerUnit'], ['Satuan', 'unit'], ['Harga Material (Rp)', 'materialPrice'],
    ['Harga Jasa (Rp)', 'servicePrice'], ['Bagian Material (Rp)', 'materialPart'], ['Bagian Jasa (Rp)', 'servicePart'], ['Jumlah (Rp)', 'totalPart'], ['Catatan', 'notes'],
  ],
  activities: [
    ['ID', 'id'], ['No. RAB', 'rabNumber'], ['ID Data PRK', 'programRecordId'], ['No. PRK', 'prk'], ['Pos Anggaran', 'position'],
    ['Kriteria', 'criteria'], ['Nama Kegiatan', 'name'], ['Paket Kegiatan', 'workPackage'], ['Satuan', 'unit'], ['Volume', 'volume'], ['Tahun Anggaran', 'year'],
    ['Nama Komponen Pekerjaan', 'componentName'], ['ID Material', 'materialId'], ['ID Komponen', 'componentId'], ['Nama Material', 'materialName'],
    ['Jenis Material', 'source'], ['Kuantitas per Satuan', 'quantityPerUnit'],
    ['Harga Material Satuan (Rp)', 'materialPrice'], ['Harga Jasa Satuan (Rp)', 'servicePrice'],
    ['Nilai Material (Rp)', 'materialTotal'], ['Nilai Jasa (Rp)', 'serviceTotal'], ['Total RAB (Rp)', 'total'], ['Catatan', 'notes'],
  ],
  materialRecap: [
    ['ID', 'id'], ['ID Kegiatan', 'activityId'], ['ID Material', 'materialId'], ['Volume Material', 'quantity'], ['Tanggal', 'date'], ['Satuan', 'unit'],
    ['Kriteria', 'criteria'], ['No. PRK', 'prk'], ['Nama Kegiatan', 'activityName'], ['Catatan', 'notes'],
  ],
  paTransfers: [
    ['ID', 'id'], ['ID Data PRK', 'recordId'], ['No. PRK', 'prk'], ['No. RAB', 'rabNumber'], ['Kriteria', 'criteria'], ['Uraian', 'description'],
    ['Tanggal', 'date'], ['Nilai Dialihkan (Rp)', 'amount'], ['RAB Sebelum (Rp)', 'rabBefore'], ['RAB Sesudah (Rp)', 'rabAfter'],
    ['PA Sebelum (Rp)', 'paBefore'], ['PA Sesudah (Rp)', 'paAfter'], ['Nilai Kontrak (Rp)', 'contractValue'], ['Catatan', 'notes'],
  ],
  realizations: [
    ['ID', 'id'], ['ID Kegiatan', 'activityId'], ['ID Data PRK', 'programRecordId'], ['Tanggal Tagihan', 'date'], ['Tagihan (Rp)', 'billed'],
    ['Dibayar (Rp)', 'paid'], ['Status Pembayaran', 'paymentStatus'], ['Kriteria', 'criteria'],
    ['No. PRK', 'prk'], ['Nama Kegiatan', 'activityName'], ['Catatan', 'notes'],
  ],
}
const MONTHLY_BILLING_COLUMNS = [
  ['TAGIHAN JANUARI', 'billingJanuary'], ['TAGIHAN PEBRUARI', 'billingFebruary'],
  ['TAGIHAN MARET', 'billingMarch'], ['TAGIHAN APRIL', 'billingApril'],
  ['TAGIHAN MEI', 'billingMay'], ['TAGIHAN JUNI', 'billingJune'],
  ['TAGIHAN JULI', 'billingJuly'], ['TAGIHAN AGUSTUS', 'billingAugust'],
  ['TAGIHAN SEPTEMBER', 'billingSeptember'], ['TAGIHAN OKTOBER', 'billingOctober'],
  ['TAGIHAN NOPEMBER', 'billingNovember'], ['TAGIHAN DESEMBER', 'billingDecember'],
]
const DATA_HEADERS = [
  'NO.PRK', 'NO.PRK SKKI', 'NO.PRK FIX', 'NO.WBS', 'POS ANGGARAN', 'NO.RAB', 'NO.PA',
  'URAIAN', 'TOTAL PRK', 'RELOKASI', 'REVISI SKKI', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA',
  'NOKONTRAK', 'VENDOR', 'NILAI KONTRAK', 'PENGEMBALIAN PA', 'PENGGANTIAN BIAYA', 'TAGIHAN',
  'TOTAL BAYAR', 'SISA PRK', 'PROGRAM', 'TAHUN ANGGARAN', 'KETERANGAN', 'POS ANGGARAN', 'RECORD ID',
  'TANGGAL AWAL', 'TANGGAL AKHIR', 'RENCANA KONTRAK', 'RENCANA TAGIH',
  ...MONTHLY_BILLING_COLUMNS.map(([header]) => header),
  'PROGRESS', 'PROYEKSI TAGIH', 'TANGGAL BAYAR',
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
  'TANGGAL AWAL': 'startDate', 'TANGGAL AKHIR': 'endDate',
  'RENCANA KONTRAK': 'plannedContract', 'RENCANA TAGIH': 'plannedBilling',
  'PROGRESS': 'progress', 'PROYEKSI TAGIH': 'projectedBilling', 'TANGGAL BAYAR': 'paymentDate',
}
MONTHLY_BILLING_COLUMNS.forEach(([header, key]) => { CLIENT_KEYS[header] = key })

function doGet(event) {
  const action = event && event.parameter && event.parameter.action
  if (action === 'health') return json_({ ok: true, service: 'RAB Monitor' })
  if (action === 'authStatus') return json_({ ok: true, ...authStatus_() })
  if (action === 'publicDashboard') return json_({ ok: true, summary: cachedPublicDashboard_() })
  if (action !== 'loadWorkflow' && action !== 'load') return json_({ ok: false, error: 'Aksi tidak dikenal.' })
  const authorization = authorize_(event.parameter.token)
  if (!authorization.ok) return json_({ ok: false, error: authorization.error, code: 'AUTH_REQUIRED' })
  if (action === 'loadWorkflow') return json_({ ok: true, collections: loadWorkflow_(), user: authorization.user })
  const sheet = getDataSheet_()
  syncPrkRemainingColumn_(sheet)
  const values = sheet.getDataRange().getValues()
  const headers = values.shift() || []
  const records = values.map((row, index) => ({ row, sourceRow: index + 2 }))
    .filter(({ row }) => row.some((cell) => cell !== '')).map(({ row, sourceRow }, index) => {
    const record = { sourceRow }
    headers.forEach((header, column) => { record[header] = row[column] === null ? '' : row[column] })
    const clientRecord = toClientRecord_(record)
    if (!record['RECORD ID']) clientRecord.legacyId = `row-${index + 2}`
    return clientRecord
  })
  return json_({ ok: true, records, user: authorization.user })
}

function doPost(event) {
  let payload
  try { payload = JSON.parse(event.postData.contents) } catch (error) {
    return json_({ ok: false, error: 'Isi permintaan bukan JSON yang valid.' })
  }
  if (payload.action === 'login') return json_(login_(payload.username, payload.password))
  if (payload.action === 'bootstrapAdmin') return json_(bootstrapAdmin_(payload))
  const authorization = authorize_(payload.token)
  if (!authorization.ok) return json_({ ok: false, error: authorization.error, code: 'AUTH_REQUIRED' })
  if (payload.action === 'logout') return json_(logout_(payload.token))
  if (payload.action === 'listUsers') {
    if (authorization.user.role !== 'admin') return json_({ ok: false, error: 'Hanya admin yang dapat mengelola pengguna.' })
    return json_({ ok: true, users: listUsers_() })
  }
  if (payload.action === 'saveUser') {
    if (authorization.user.role !== 'admin') return json_({ ok: false, error: 'Hanya admin yang dapat mengelola pengguna.' })
    return json_(saveUser_(payload.user))
  }
  if (authorization.user.role === 'viewer') return json_({ ok: false, error: 'Akun viewer hanya memiliki akses baca.' })
  if (payload.action === 'saveWorkflow') {
    if (!Object.prototype.hasOwnProperty.call(WORKFLOW_SHEETS, payload.collection) || !Array.isArray(payload.records)) {
      return json_({ ok: false, error: 'Jenis data atau daftar record tidak valid.' })
    }
    if (payload.records.length > 5000) return json_({ ok: false, error: 'Maksimum 5.000 baris per jenis data.' })
    const updatedRecords = saveWorkflow_(payload.collection, payload.records)
    clearPublicDashboardCache_()
    return json_({ ok: true, collection: payload.collection, rows: payload.records.length, updatedRecords: updatedRecords || [] })
  }
  if (payload.action === 'transferToPA') {
    try {
      const result = transferToPA_(payload)
      clearPublicDashboardCache_()
      return json_({ ok: true, ...result })
    } catch (error) {
      return json_({ ok: false, error: error.message || 'Finalisasi ke PA gagal.' })
    }
  }
  if (payload.action === 'cancelTransferToPA') {
    try {
      const result = cancelTransferToPA_(payload)
      clearPublicDashboardCache_()
      return json_({ ok: true, ...result })
    } catch (error) {
      return json_({ ok: false, error: error.message || 'Pembatalan finalisasi gagal.' })
    }
  }
  if (payload.action !== 'save' || !Array.isArray(payload.records)) return json_({ ok: false, error: 'Permintaan simpan tidak valid.' })
  if (payload.records.length > 5000) return json_({ ok: false, error: 'Maksimum 5.000 baris per penyimpanan.' })

  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const sheet = getDataSheet_()
    const existingValues = sheet.getDataRange().getValues()
    const existingHeaders = existingValues[0] || []
    const existingRecords = new Map()
    existingValues.slice(1).forEach((row, index) => {
      if (!row.some((cell) => cell !== '' && cell !== null)) return
      const source = { sourceRow: index + 2 }
      existingHeaders.forEach((header, column) => { source[header] = row[column] })
      const existingRecord = toClientRecord_(source)
      existingRecords.set(String(existingRecord.id), existingRecord)
    })
    const rows = payload.records.map((record) => {
      const existing = existingRecords.get(String(record.id)) || {}
      const current = { ...existing, ...record }
      MONTHLY_BILLING_COLUMNS.forEach(([, key]) => {
        if ((record[key] === '' || record[key] === null || record[key] === undefined)
          && existing[key] !== '' && existing[key] !== null && existing[key] !== undefined) {
          current[key] = existing[key]
        }
      })
      current.prkRemaining = calculatePrkRemaining_(current)
      const monthlyValues = monthlyBillingValues_(current)
      Object.assign(current, monthlyValues)
      if (MONTHLY_BILLING_COLUMNS.some(([, key]) => monthlyValues[key] !== '' && monthlyValues[key] !== null)) {
        const monthlyTotal = sumMonthlyBilling_(monthlyValues)
        current.billed = monthlyTotal
      }
      return DATA_HEADERS.map((header) => current[CLIENT_KEYS[header]] ?? '')
    })
    sheet.clearContents()
    sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS])
    if (rows.length) sheet.getRange(2, 1, rows.length, DATA_HEADERS.length).setValues(rows)
    formatMonthlyBillingColumns_(sheet, DATA_HEADERS)
    clearPublicDashboardCache_()
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
  ensureDataHeaders_(sheet)
  return sheet
}

function ensureDataHeaders_(sheet) {
  const values = sheet.getDataRange().getValues()
  if (!values.length) {
    sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS])
    formatMonthlyBillingColumns_(sheet, DATA_HEADERS)
    return
  }
  let headers = values[0] || []
  const existingHeaders = new Set(headers.map((header) => String(header || '').trim()).filter(Boolean))
  const monthlyHeaders = MONTHLY_BILLING_COLUMNS.map(([header]) => header)
  const missingMonthlyHeaders = monthlyHeaders.filter((header) => !existingHeaders.has(header))
  const plannedBillingIndex = headers.findIndex((header) => String(header || '').trim() === 'RENCANA TAGIH')
  if (missingMonthlyHeaders.length && plannedBillingIndex >= 0) {
    sheet.insertColumnsAfter(plannedBillingIndex + 1, missingMonthlyHeaders.length)
    sheet.getRange(1, plannedBillingIndex + 2, 1, missingMonthlyHeaders.length).setValues([missingMonthlyHeaders])
    missingMonthlyHeaders.forEach((header) => existingHeaders.add(header))
    headers = sheet.getDataRange().getValues()[0] || []
  }
  const missingHeaders = DATA_HEADERS.filter((header) => !existingHeaders.has(header))
  if (missingHeaders.length) {
    const lastHeaderColumn = headers.reduce((last, header, index) => String(header || '').trim() ? index + 1 : last, 0)
    sheet.getRange(1, lastHeaderColumn + 1, 1, missingHeaders.length).setValues([missingHeaders])
  }
  formatMonthlyBillingColumns_(sheet, sheet.getDataRange().getValues()[0] || [])
}

function formatMonthlyBillingColumns_(sheet, headers) {
  const columnIndexes = MONTHLY_BILLING_COLUMNS.map(([header]) => headers.indexOf(header))
  if (columnIndexes.some((index) => index < 0)) {
    throw new Error('Kolom tagihan bulanan tidak lengkap di RABData.')
  }
  const firstColumn = Math.min(...columnIndexes)
  const sequential = columnIndexes.every((index, offset) => index === firstColumn + offset)
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1)
  if (sequential) {
    sheet.getRange(2, firstColumn + 1, rowCount, MONTHLY_BILLING_COLUMNS.length).setNumberFormat('#,##0')
    return
  }
  columnIndexes.forEach((columnIndex) => {
    sheet.getRange(2, columnIndex + 1, rowCount, 1).setNumberFormat('#,##0')
  })
}

function toClientRecord_(row) {
  const result = {}
  Object.keys(CLIENT_KEYS).forEach((header) => { result[CLIENT_KEYS[header]] = row[header] })
  result.id = result.id || `row-${row.sourceRow}`
  result.prkRemaining = calculatePrkRemaining_(result)
  return result
}

function monthlyBillingValues_(record) {
  const values = MONTHLY_BILLING_COLUMNS.reduce((result, [, key]) => {
    result[key] = record[key] ?? ''
    return result
  }, {})
  const plannedBilling = record.plannedBilling
  let month = -1
  if (plannedBilling instanceof Date && Number.isFinite(plannedBilling.getTime())) {
    month = plannedBilling.getMonth()
  } else {
    const dateMatch = String(plannedBilling || '').match(/^\d{4}-(\d{2})-\d{2}/)
    if (dateMatch) month = Number(dateMatch[1]) - 1
  }
  const key = MONTHLY_BILLING_COLUMNS[month]?.[1]
  const hasNewAmount = Object.prototype.hasOwnProperty.call(record, 'billingAmount')
    && record.billingAmount !== ''
    && record.billingAmount !== null
    && record.billingAmount !== undefined
  const amount = Number(hasNewAmount ? record.billingAmount : values[key])
  if (month >= 0 && month < MONTHLY_BILLING_COLUMNS.length && hasNewAmount && Number.isFinite(amount)) {
    values[key] = amount
  }
  return values
}

function sumMonthlyBilling_(values) {
  return MONTHLY_BILLING_COLUMNS.reduce((total, [, key]) => {
    const amount = Number(values[key])
    return total + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

function calculatePrkRemaining_(record) {
  if (!String(record.prk || '').trim()) return ''
  return (Number(record.totalFinal) || 0) - (Number(record.rabTotal) || 0) - (Number(record.paTotal) || 0)
}

function normalizeReference_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

function syncPrkRemainingColumn_(sheet) {
  const values = sheet.getDataRange().getValues()
  if (values.length < 2) return
  const headers = values[0]
  const totalFinalIndex = headers.indexOf('TOTAL AKHIR')
  const rabIndex = headers.indexOf('TOTAL RAB')
  const paIndex = headers.indexOf('TOTAL PA')
  const remainingIndex = headers.indexOf('SISA PRK')
  const prkIndex = headers.indexOf('NO.PRK')
  if (totalFinalIndex < 0 || rabIndex < 0 || paIndex < 0 || remainingIndex < 0 || prkIndex < 0) return

  const remainingValues = values.slice(1).map((row) => {
    if (!row.some((cell) => cell !== '' && cell !== null)) return ['']
    if (!String(row[prkIndex] || '').trim()) return ['']
    return [(Number(row[totalFinalIndex]) || 0) - (Number(row[rabIndex]) || 0) - (Number(row[paIndex]) || 0)]
  })
  sheet.getRange(2, remainingIndex + 1, remainingValues.length, 1).setValues(remainingValues)
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

function getUsersSheet_() {
  const sheet = getWorkflowSheet_(USERS_SHEET_NAME)
  if (sheet.getRange(1, 2).getValue() === 'DATA_JSON') sheet.getRange(1, 1, 1, 8).setValues([['ID', 'USERNAME', 'NAME', 'ROLE', 'PASSWORD_HASH', 'SALT', 'ACTIVE', 'CREATED_AT']])
  return sheet
}

function getSessionsSheet_() {
  const sheet = getWorkflowSheet_(SESSIONS_SHEET_NAME)
  if (sheet.getRange(1, 2).getValue() === 'DATA_JSON') sheet.getRange(1, 1, 1, 4).setValues([['TOKEN_HASH', 'USER_ID', 'EXPIRES_AT', 'CREATED_AT']])
  return sheet
}

function readUsers_() {
  const values = getUsersSheet_().getDataRange().getValues()
  return values.slice(1).filter((row) => row[0]).map((row, index) => ({
    rowNumber: index + 2, id: String(row[0]), username: String(row[1] || ''), name: String(row[2] || ''),
    role: String(row[3] || 'viewer'), passwordHash: String(row[4] || ''), salt: String(row[5] || ''),
    active: row[6] === true || String(row[6]).toLowerCase() === 'true', createdAt: row[7] || '',
  }))
}

function authStatus_() {
  const users = readUsers_()
  cacheAuthUsers_(users)
  return { setupRequired: users.length === 0, setupAvailable: Boolean(PropertiesService.getScriptProperties().getProperty('ADMIN_SETUP_KEY')) }
}

function cacheAuthUsers_(users) {
  if (typeof CacheService !== 'undefined') {
    CacheService.getScriptCache().put(AUTH_USERS_CACHE_KEY, JSON.stringify(users), AUTH_USERS_CACHE_SECONDS)
  }
}

function cachedAuthUsers_() {
  if (typeof CacheService === 'undefined') return null
  const cached = CacheService.getScriptCache().get(AUTH_USERS_CACHE_KEY)
  return cached ? JSON.parse(cached) : null
}

function clearAuthUsersCache_() {
  if (typeof CacheService !== 'undefined') CacheService.getScriptCache().remove(AUTH_USERS_CACHE_KEY)
}

function cachedPublicDashboard_() {
  if (typeof CacheService !== 'undefined') {
    const cache = CacheService.getScriptCache()
    const cached = cache.get(PUBLIC_DASHBOARD_CACHE_KEY)
    if (cached) return JSON.parse(cached)
    const summary = publicDashboard_()
    cache.put(PUBLIC_DASHBOARD_CACHE_KEY, JSON.stringify(summary), PUBLIC_DASHBOARD_CACHE_SECONDS)
    return summary
  }
  return publicDashboard_()
}

function clearPublicDashboardCache_() {
  if (typeof CacheService !== 'undefined') CacheService.getScriptCache().remove(PUBLIC_DASHBOARD_CACHE_KEY)
}

function hashPassword_(password, salt) {
  let digest = salt + ':' + password
  const saltContext = createSha256SaltContext_(salt)
  for (let index = 0; index < 10000; index += 1) {
    const hashed = index === 0
      ? sha256Hex_(digest)
      : saltContext ? sha256HexWithSalt_(digest, saltContext) : sha256Hex_(digest)
    digest = hashed + salt
  }
  return digest.slice(0, 64)
}

function createSha256SaltContext_(salt) {
  if (salt.length !== 72) return null
  for (let index = 0; index < salt.length; index += 1) {
    if (salt.charCodeAt(index) > 0x7f) return null
  }

  const saltBlock = new Uint32Array(64)
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4
    saltBlock[index] = ((salt.charCodeAt(offset) << 24)
      | (salt.charCodeAt(offset + 1) << 16)
      | (salt.charCodeAt(offset + 2) << 8)
      | salt.charCodeAt(offset + 3)) >>> 0
  }
  expandSha256Schedule_(saltBlock)

  const tailBlock = new Uint32Array(64)
  tailBlock[0] = ((salt.charCodeAt(64) << 24)
    | (salt.charCodeAt(65) << 16)
    | (salt.charCodeAt(66) << 8)
    | salt.charCodeAt(67)) >>> 0
  tailBlock[1] = ((salt.charCodeAt(68) << 24)
    | (salt.charCodeAt(69) << 16)
    | (salt.charCodeAt(70) << 8)
    | salt.charCodeAt(71)) >>> 0
  tailBlock[2] = 0x80000000
  tailBlock[15] = 1088
  expandSha256Schedule_(tailBlock)

  return {
    saltBlock,
    tailBlock,
    firstBlock: new Uint32Array(64),
    state: new Uint32Array(8),
  }
}

function sha256HexWithSalt_(digest, context) {
  const { saltBlock, tailBlock, firstBlock, state } = context
  state[0] = 0x6a09e667
  state[1] = 0xbb67ae85
  state[2] = 0x3c6ef372
  state[3] = 0xa54ff53a
  state[4] = 0x510e527f
  state[5] = 0x9b05688c
  state[6] = 0x1f83d9ab
  state[7] = 0x5be0cd19
  for (let index = 0; index < 16; index += 1) firstBlock[index] = 0
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4
    firstBlock[index] = ((digest.charCodeAt(offset) << 24)
      | (digest.charCodeAt(offset + 1) << 16)
      | (digest.charCodeAt(offset + 2) << 8)
      | digest.charCodeAt(offset + 3)) >>> 0
  }
  expandSha256Schedule_(firstBlock)
  compressSha256Block_(state, firstBlock)
  compressSha256Block_(state, saltBlock)
  compressSha256Block_(state, tailBlock)

  let result = ''
  for (let index = 0; index < state.length; index += 1) {
    result += ('00000000' + state[index].toString(16)).slice(-8)
  }
  return result
}

function expandSha256Schedule_(words) {
  const rotateRight = (word, amount) => (word >>> amount) | (word << (32 - amount))
  for (let index = 16; index < 64; index += 1) {
    const left = words[index - 15]
    const right = words[index - 2]
    const smallSigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
    const smallSigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
    words[index] = (words[index - 16] + smallSigma0 + words[index - 7] + smallSigma1) >>> 0
  }
}

function compressSha256Block_(state, words) {
  let a = state[0], b = state[1], c = state[2], d = state[3]
  let e = state[4], f = state[5], g = state[6], h = state[7]
  const rotateRight = (word, amount) => (word >>> amount) | (word << (32 - amount))
  for (let index = 0; index < 64; index += 1) {
    const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
    const choice = (e & f) ^ (~e & g)
    const temp1 = (h + bigSigma1 + choice + SHA256_K_[index] + words[index]) >>> 0
    const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
    const majority = (a & b) ^ (a & c) ^ (b & c)
    const temp2 = (bigSigma0 + majority) >>> 0
    h = g
    g = f
    f = e
    e = (d + temp1) >>> 0
    d = c
    c = b
    b = a
    a = (temp1 + temp2) >>> 0
  }
  state[0] = (state[0] + a) >>> 0
  state[1] = (state[1] + b) >>> 0
  state[2] = (state[2] + c) >>> 0
  state[3] = (state[3] + d) >>> 0
  state[4] = (state[4] + e) >>> 0
  state[5] = (state[5] + f) >>> 0
  state[6] = (state[6] + g) >>> 0
  state[7] = (state[7] + h) >>> 0
}

function sha256Hex_(value) {
  const bytes = []
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00)
        index += 1
      } else {
        codePoint = 0xfffd
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd
    }
    if (codePoint < 0x80) bytes.push(codePoint)
    else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    else if (codePoint < 0x10000) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
    else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
  }

  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const highLength = Math.floor(bitLength / 0x100000000)
  const lowLength = bitLength >>> 0
  bytes.push((highLength >>> 24) & 0xff, (highLength >>> 16) & 0xff, (highLength >>> 8) & 0xff, highLength & 0xff,
    (lowLength >>> 24) & 0xff, (lowLength >>> 16) & 0xff, (lowLength >>> 8) & 0xff, lowLength & 0xff)

  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const words = new Uint32Array(64)
  const rotateRight = (word, amount) => (word >>> amount) | (word << (32 - amount))
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteIndex = offset + index * 4
      words[index] = ((bytes[byteIndex] << 24) | (bytes[byteIndex + 1] << 16) | (bytes[byteIndex + 2] << 8) | bytes[byteIndex + 3]) >>> 0
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]
      const right = words[index - 2]
      const smallSigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const smallSigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      words[index] = (words[index - 16] + smallSigma0 + words[index - 7] + smallSigma1) >>> 0
    }

    let a = state[0], b = state[1], c = state[2], d = state[3]
    let e = state[4], f = state[5], g = state[6], h = state[7]
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + bigSigma1 + choice + SHA256_K_[index] + words[index]) >>> 0
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (bigSigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }
  return state.map((word) => ('00000000' + word.toString(16)).slice(-8)).join('')
}

function bytesToHex_(bytes) {
  const hexDigits = '0123456789abcdef'
  let result = ''
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = (bytes[index] + 256) % 256
    result += hexDigits.charAt(byte >> 4) + hexDigits.charAt(byte & 15)
  }
  return result
}

function hashToken_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''), Utilities.Charset.UTF_8)
  return bytesToHex_(bytes)
}

function safeUser_(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active, createdAt: user.createdAt }
}

function bootstrapAdmin_(payload) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const properties = PropertiesService.getScriptProperties()
    const setupKey = properties.getProperty('ADMIN_SETUP_KEY')
    if (!setupKey || String(payload.setupKey || '') !== setupKey) return { ok: false, error: 'Kunci setup admin tidak valid atau belum dikonfigurasi.' }
    if (readUsers_().length) return { ok: false, error: 'Admin awal sudah dibuat. Hubungi admin yang aktif.' }
    const username = String(payload.username || '').trim().toLowerCase()
    const password = String(payload.password || '')
    const name = String(payload.name || '').trim()
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { ok: false, error: 'Username harus 3-40 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' }
    if (password.length < 12) return { ok: false, error: 'Kata sandi minimal 12 karakter.' }
    if (!name) return { ok: false, error: 'Nama admin wajib diisi.' }
    const salt = Utilities.getUuid() + Utilities.getUuid()
    const user = { id: Utilities.getUuid(), username, name, role: 'admin', passwordHash: hashPassword_(password, salt), salt, active: true, createdAt: new Date().toISOString() }
    getUsersSheet_().appendRow([user.id, user.username, user.name, user.role, user.passwordHash, user.salt, true, user.createdAt])
    cacheAuthUsers_([user])
    properties.deleteProperty('ADMIN_SETUP_KEY')
    return login_(username, password)
  } finally {
    lock.releaseLock()
  }
}

function login_(usernameValue, passwordValue) {
  const username = String(usernameValue || '').trim().toLowerCase()
  const password = String(passwordValue || '')
  const users = cachedAuthUsers_() || readUsers_()
  const user = users.find((item) => item.username.toLowerCase() === username && item.active)
  if (!user || hashPassword_(password, user.salt) !== user.passwordHash) return { ok: false, error: 'Username atau kata sandi salah.' }

  const token = Utilities.getUuid() + Utilities.getUuid()
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + SESSION_HOURS * 60 * 60 * 1000)
  getSessionsSheet_().appendRow([hashToken_(token), user.id, expiresAt.toISOString(), createdAt.toISOString()])
  return { ok: true, token, expiresAt: expiresAt.toISOString(), user: safeUser_(user) }
}

function authorize_(token) {
  if (!token) return { ok: false, error: 'Silakan login untuk mengakses data ini.' }
  const tokenHash = hashToken_(token)
  const sessionsSheet = getSessionsSheet_()
  const lastRow = sessionsSheet.getLastRow()
  const sessionRange = lastRow > 1
    ? sessionsSheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(tokenHash).matchEntireCell(true).findNext()
    : null
  const session = sessionRange
    ? sessionsSheet.getRange(sessionRange.getRow(), 1, 1, 4).getValues()[0]
    : null
  const now = Date.now()
  if (!session || new Date(session[2]).getTime() <= now) return { ok: false, error: 'Sesi berakhir atau tidak valid. Silakan login kembali.' }
  const user = readUsers_().find((item) => item.id === String(session[1]) && item.active)
  if (!user) return { ok: false, error: 'Akun tidak aktif. Hubungi admin.' }
  return { ok: true, user: safeUser_(user) }
}

function logout_(token) {
  const sheet = getSessionsSheet_()
  const tokenHash = hashToken_(token)
  const lastRow = sheet.getLastRow()
  if (lastRow <= 1) return { ok: true }
  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(tokenHash)
    .matchEntireCell(true)
    .findNext()
  if (match) sheet.deleteRow(match.getRow())
  return { ok: true }
}

function listUsers_() {
  return readUsers_().map(safeUser_)
}

function saveUser_(payload) {
  const userData = payload || {}
  const userId = String(userData.id || '')
  const username = String(userData.username || '').trim().toLowerCase()
  const name = String(userData.name || '').trim()
  const role = String(userData.role || '')
  const password = String(userData.password || '')
  const active = userData.active !== false
  const users = readUsers_()
  const existing = users.find((item) => item.id === userId)
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { ok: false, error: 'Username harus 3-40 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' }
  if (!name) return { ok: false, error: 'Nama pengguna wajib diisi.' }
  if (!USER_ROLES.includes(role)) return { ok: false, error: 'Peran pengguna tidak valid.' }
  if (users.some((item) => item.username === username && item.id !== userId)) return { ok: false, error: 'Username sudah digunakan.' }
  if (!existing && password.length < 12) return { ok: false, error: 'Kata sandi pengguna baru minimal 12 karakter.' }
  if (password && password.length < 12) return { ok: false, error: 'Kata sandi minimal 12 karakter.' }
  if (existing && existing.role === 'admin' && existing.active && (role !== 'admin' || !active)
    && users.filter((item) => item.role === 'admin' && item.active).length <= 1) {
    return { ok: false, error: 'Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan perannya.' }
  }

  const salt = password ? Utilities.getUuid() + Utilities.getUuid() : existing?.salt || ''
  const passwordHash = password ? hashPassword_(password, salt) : existing.passwordHash
  const user = { id: existing?.id || Utilities.getUuid(), username, name, role, passwordHash, salt, active, createdAt: existing?.createdAt || new Date().toISOString() }
  const sheet = getUsersSheet_()
  const row = [user.id, user.username, user.name, user.role, user.passwordHash, user.salt, user.active, user.createdAt]
  if (existing) sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row])
  else sheet.appendRow(row)
  clearAuthUsersCache_()
  return { ok: true, user: safeUser_(user) }
}

function publicDashboard_() {
  const sheet = getDataSheet_()
  const values = sheet.getDataRange().getValues()
  const headers = values.shift() || []
  const column = (name) => headers.indexOf(name)
  const indexes = {
    prk: column('NO.PRK'), rabNumber: column('NO.RAB'), description: column('URAIAN'), program: column('PROGRAM'), year: column('TAHUN ANGGARAN'), notes: column('KETERANGAN'),
    pagu: column('TOTAL AKHIR'), totalPrk: column('TOTAL PRK'), pa: column('TOTAL PA'), rab: column('TOTAL RAB'),
    contract: column('NILAI KONTRAK'), billed: column('TAGIHAN'), paid: column('TOTAL BAYAR'), remainingPrk: column('SISA PRK'),
    projectedBilling: column('PROYEKSI TAGIH'), recordId: column('RECORD ID'),
  }
  const finalizedPaByRecord = new Map()
  const finalizedPaByRab = new Map()
  const finalizedPaByPrk = new Map()
  const transferSheet = getWorkflowSheet_(WORKFLOW_SHEETS.paTransfers)
  readWorkflowRecords_('paTransfers', transferSheet, false).forEach((transfer) => {
    const recordId = String(transfer.recordId || '')
    const paAfter = Number(transfer.paAfter)
    if (!Number.isFinite(paAfter)) return
    if (recordId) finalizedPaByRecord.set(recordId, Math.max(finalizedPaByRecord.get(recordId) || 0, paAfter))
    const rabNumber = normalizeReference_(transfer.rabNumber)
    const prk = normalizeReference_(transfer.prk)
    if (rabNumber) finalizedPaByRab.set(rabNumber, Math.max(finalizedPaByRab.get(rabNumber) || 0, paAfter))
    if (prk) finalizedPaByPrk.set(prk, Math.max(finalizedPaByPrk.get(prk) || 0, paAfter))
  })
  const groups = new Map()
  const rows = values.map((row, index) => ({ row, sourceRow: index + 2 }))
    .filter(({ row }) => row.some((cell) => cell !== '')).map(({ row, sourceRow }, index) => {
    const value = (index) => index >= 0 ? row[index] : ''
    const number = (index) => index >= 0 ? Number(row[index]) || 0 : 0
    const storedRecordId = String(value(indexes.recordId) || '')
    const recordId = storedRecordId || `row-${sourceRow}`
    const legacyRecordId = storedRecordId ? '' : `row-${index + 2}`
    const rabNumber = normalizeReference_(value(indexes.rabNumber))
    const prk = normalizeReference_(value(indexes.prk))
    const finalizedPa = finalizedPaByRecord.get(recordId)
      ?? (legacyRecordId ? finalizedPaByRecord.get(legacyRecordId) : undefined)
      ?? finalizedPaByRab.get(rabNumber)
      ?? finalizedPaByPrk.get(prk)
      ?? 0
    const paTotal = Math.max(number(indexes.pa), finalizedPa)
    const paFinalized = finalizedPaByRecord.has(recordId)
      || Boolean(legacyRecordId && finalizedPaByRecord.has(legacyRecordId))
      || finalizedPaByRab.has(rabNumber)
      || finalizedPaByPrk.has(prk)
    return {
      prk: String(value(indexes.prk) || ''), rabNumber: String(value(indexes.rabNumber) || ''),
      description: String(value(indexes.description) || ''),
      program: String(value(indexes.program) || 'Program lain'), year: String(value(indexes.year) || ''),
      notes: String(value(indexes.notes) || ''), totalFinal: number(indexes.pagu), totalPrk: number(indexes.totalPrk),
      rabTotal: number(indexes.rab), paTotal, paFinalized, contractValue: number(indexes.contract),
      billed: number(indexes.billed), paid: number(indexes.paid),
      prkRemaining: prk ? number(indexes.pagu) - number(indexes.rab) - paTotal : '',
      projectedBilling: number(indexes.projectedBilling),
    }
  }).filter((record) => (record.prk.trim() || record.rabNumber.trim())
    && (record.totalFinal > 0 || (record.paFinalized && record.paTotal > 0)))
  rows.forEach((record) => {
    const program = record.program
    const year = record.year
    const key = `${program}::${year}`
    const group = groups.get(key) || { program, year, count: 0, pagu: 0, rab: 0, pa: 0, contract: 0, billed: 0, paid: 0, remainingPrk: 0, projectedBilling: 0, contractCount: 0 }
    group.count += 1
    group.pagu += record.totalFinal
    group.rab += record.rabTotal
    group.pa += record.paTotal
    group.contract += record.contractValue
    group.billed += record.billed
    group.paid += record.paid
    group.remainingPrk += Number(record.prkRemaining) || 0
    group.projectedBilling += record.projectedBilling
    if (record.contractValue > 0) group.contractCount += 1
    groups.set(key, group)
  })
  return { groups: [...groups.values()], rows, updatedAt: new Date().toISOString() }
}

function loadWorkflow_() {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
  const collections = {}
  Object.keys(WORKFLOW_SHEETS).forEach((key) => {
    const sheet = getWorkflowSheet_(WORKFLOW_SHEETS[key])
      collections[key] = readWorkflowRecords_(key, sheet, true)
  })
  return collections
  } finally {
    lock.releaseLock()
  }
}

function saveWorkflow_(collection, records) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const sheet = getWorkflowSheet_(WORKFLOW_SHEETS[collection])
    const previousRecords = collection === 'realizations' ? readWorkflowRecords_(collection, sheet, true) : []
    writeWorkflowRecords_(collection, records, sheet)
    return collection === 'realizations' ? syncRealizationTotals_(previousRecords, records) : []
  } finally {
    lock.releaseLock()
  }
}

function syncRealizationTotals_(previousRecords, nextRecords) {
  const activityRecords = readWorkflowRecords_('activities', getWorkflowSheet_(WORKFLOW_SHEETS.activities), true)
  const dataSheet = getDataSheet_()
  const values = dataSheet.getDataRange().getValues()
  const headers = values.shift() || []
  const billedIndex = headers.indexOf('TAGIHAN')
  const paidIndex = headers.indexOf('TOTAL BAYAR')
  const progressIndex = headers.indexOf('PROGRESS')
  const paymentDateIndex = headers.indexOf('TANGGAL BAYAR')
  if ([billedIndex, paidIndex, progressIndex, paymentDateIndex].some((index) => index < 0)) {
    throw new Error('Kolom TAGIHAN, TOTAL BAYAR, PROGRESS, atau TANGGAL BAYAR tidak ditemukan di RABData.')
  }

  const programRecords = values.map((row, index) => {
    const source = { sourceRow: index + 2 }
    headers.forEach((header, column) => { source[header] = row[column] })
    return toClientRecord_(source)
  })
  const recordByActivity = new Map()
  activityRecords.forEach((activity) => {
    const linkedRecord = (activity.programRecordId && programRecords.find((record) => String(record.id) === String(activity.programRecordId)))
      || programRecords.find((record) => {
        const identifiers = [activity.prk, activity.rabNumber].map((value) => String(value || '').trim()).filter(Boolean)
        return identifiers.includes(String(record.prk || '').trim())
          || identifiers.includes(String(record.rabNumber || '').trim())
      })
    if (linkedRecord) recordByActivity.set(String(activity.id), linkedRecord.id)
  })

  const resolveRecordId = (item) => {
    const linkedRecordId = String(item.programRecordId || '')
    return linkedRecordId && programRecords.some((record) => String(record.id) === linkedRecordId)
      ? linkedRecordId
      : recordByActivity.get(String(item.activityId))
  }
  const affectedRecordIds = new Set([...previousRecords, ...nextRecords]
    .map(resolveRecordId)
    .filter(Boolean).map(String))
  if (!affectedRecordIds.size) return []

  const totals = new Map([...affectedRecordIds].map((id) => [id, { billed: 0, paid: 0, latest: null }]))
  nextRecords.forEach((item) => {
    const total = totals.get(String(resolveRecordId(item) || ''))
    if (!total) return
    total.billed += Number(item.billed) || 0
    total.paid += Number(item.paid) || 0
    const date = String(item.date || '')
    const createdAt = String(item.createdAt || '')
    if (date && (!total.latest || date > total.latest.date
      || (date === total.latest.date && createdAt > total.latest.createdAt))) {
      total.latest = { date, createdAt, status: String(item.paymentStatus || '') }
    }
  })

  const updates = []
  programRecords.forEach((record, index) => {
    const total = totals.get(String(record.id))
    if (!total) return
    const rowNumber = index + 2
    const previousBilled = values[index][billedIndex]
    const previousPaid = values[index][paidIndex]
    const previousProgress = values[index][progressIndex]
    const previousPaymentDate = values[index][paymentDateIndex]
    try {
      dataSheet.getRange(rowNumber, billedIndex + 1).setValue(total.billed)
      dataSheet.getRange(rowNumber, paidIndex + 1).setValue(total.paid)
      dataSheet.getRange(rowNumber, progressIndex + 1).setValue(total.latest?.status || '')
      dataSheet.getRange(rowNumber, paymentDateIndex + 1).setValue(total.latest?.date || '')
    } catch (error) {
      dataSheet.getRange(rowNumber, billedIndex + 1).setValue(previousBilled)
      dataSheet.getRange(rowNumber, paidIndex + 1).setValue(previousPaid)
      dataSheet.getRange(rowNumber, progressIndex + 1).setValue(previousProgress)
      dataSheet.getRange(rowNumber, paymentDateIndex + 1).setValue(previousPaymentDate)
      throw error
    }
    updates.push({
      ...record,
      billed: total.billed,
      paid: total.paid,
      progress: total.latest?.status || '',
      paymentDate: total.latest?.date || '',
    })
  })
  return updates
}

function workflowColumnPairs_(collection, records) {
  const columns = (WORKFLOW_COLUMNS[collection] || [['ID', 'id']]).slice()
  const knownKeys = new Set(columns.map((column) => column[1]))
  records.forEach((record) => Object.keys(record).forEach((key) => {
    if (key !== 'updatedAt' && !knownKeys.has(key)) {
      columns.push([key, key])
      knownKeys.add(key)
    }
  }))
  columns.push(['UPDATED_AT', '__updatedAt'])
  return columns
}

function readWorkflowRecords_(collection, sheet, migrateLegacy) {
  const values = sheet.getDataRange().getValues()
  if (!values.length) return []
  const headers = values[0].map((value) => String(value || ''))
  const rows = values.slice(1).filter((row) => row.some((value) => value !== '' && value !== null))
  const jsonIndex = headers.indexOf('DATA_JSON')
  if (jsonIndex >= 0) {
    const records = rows.filter((row) => row[jsonIndex]).map((row) => JSON.parse(row[jsonIndex]))
    if (migrateLegacy) writeWorkflowRecords_(collection, records, sheet)
    return records
  }

  const headerToKey = Object.fromEntries(workflowColumnPairs_(collection, []).map(([header, key]) => [header, key]))
  return rows.map((row) => {
    const record = {}
    headers.forEach((header, index) => {
      const key = headerToKey[header] || (header === 'UPDATED_AT' ? '__updatedAt' : header)
      if (key !== '__updatedAt' && header !== '') record[key] = row[index] === null ? '' : row[index]
    })
    return record
  })
}

function writeWorkflowRecords_(collection, records, sheet) {
  const columns = workflowColumnPairs_(collection, records)
  const rows = records.map((record) => columns.map(([, key]) => {
    if (key === '__updatedAt') return new Date()
    const value = record[key]
    if (value === undefined || value === null) return ''
    return typeof value === 'object' ? JSON.stringify(value) : value
  }))
  sheet.clearContents()
  sheet.getRange(1, 1, 1, columns.length).setValues([columns.map(([header]) => header)])
  if (rows.length) sheet.getRange(2, 1, rows.length, columns.length).setValues(rows)
}

function appendWorkflowRecord_(collection, record) {
  const sheet = getWorkflowSheet_(WORKFLOW_SHEETS[collection])
  const records = readWorkflowRecords_(collection, sheet, false)
  records.push(record)
  writeWorkflowRecords_(collection, records, sheet)
}

function getWorkflowSheet_(name) {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet()
  if (!spreadsheet) throw new Error('Atur Script Property SPREADSHEET_ID terlebih dahulu.')
  let sheet = spreadsheet.getSheetByName(name)
  if (!sheet) sheet = spreadsheet.insertSheet(name)
  if (sheet.getLastRow() === 0) {
    const collection = Object.keys(WORKFLOW_SHEETS).find((key) => WORKFLOW_SHEETS[key] === name)
    const columns = collection ? workflowColumnPairs_(collection, []) : [['ID', 'id'], ['DATA_JSON', 'data'], ['UPDATED_AT', '__updatedAt']]
    sheet.getRange(1, 1, 1, columns.length).setValues([columns.map(([header]) => header)])
  }
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
    const remainingIndex = headers.indexOf('SISA PRK')
    const recordIdIndex = headers.indexOf('RECORD ID')
    if (rabIndex < 0 || paIndex < 0 || contractIndex < 0 || remainingIndex < 0 || recordIdIndex < 0) throw new Error('Kolom TOTAL RAB, TOTAL PA, NILAI KONTRAK, SISA PRK, atau RECORD ID tidak ditemukan.')

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

    const previousRecordId = values[targetRow - 2][recordIdIndex] || ''
    const nextRab = Math.max(0, previousRab - amount)
    const nextPA = previousPA + amount
    const previousContract = Number(target.contractValue) || 0
    const nextContract = payload.preserveContractValue ? previousContract : nextPA
    const nextRemaining = calculatePrkRemaining_({ ...target, rabTotal: nextRab, paTotal: nextPA })
    try {
      sheet.getRange(targetRow, rabIndex + 1).setValue(nextRab)
      sheet.getRange(targetRow, paIndex + 1).setValue(nextPA)
      sheet.getRange(targetRow, contractIndex + 1).setValue(nextContract)
      sheet.getRange(targetRow, remainingIndex + 1).setValue(nextRemaining)
      if (!previousRecordId) sheet.getRange(targetRow, recordIdIndex + 1).setValue(target.id)
      const transfer = {
        id: Utilities.getUuid(), recordId: target.id, prk: target.prk, rabNumber: target.rabNumber,
        criteria: payload.criteria || '', description: target.description || '', date: payload.date || new Date().toISOString().slice(0, 10),
        amount, rabBefore: previousRab, rabAfter: nextRab, paBefore: previousPA, paAfter: nextPA, contractBefore: previousContract,
        contractValue: nextContract, notes: String(payload.notes || '').trim(), createdAt: new Date().toISOString(),
      }
      appendWorkflowRecord_('paTransfers', transfer)
      return { transfer, record: { ...target, rabTotal: nextRab, paTotal: nextPA, contractValue: nextContract, prkRemaining: nextRemaining } }
    } catch (error) {
      sheet.getRange(targetRow, rabIndex + 1).setValue(previousRab)
      sheet.getRange(targetRow, paIndex + 1).setValue(previousPA)
      sheet.getRange(targetRow, contractIndex + 1).setValue(previousContract)
      sheet.getRange(targetRow, remainingIndex + 1).setValue(calculatePrkRemaining_(target))
      if (!previousRecordId) sheet.getRange(targetRow, recordIdIndex + 1).setValue('')
      throw error
    }
  } finally {
    lock.releaseLock()
  }
}

function cancelTransferToPA_(payload) {
  if (!payload.transferId) throw new Error('ID transfer yang akan dibatalkan tidak ditemukan.')

  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const transferSheet = getWorkflowSheet_(WORKFLOW_SHEETS.paTransfers)
    const transferRecords = readWorkflowRecords_('paTransfers', transferSheet, false)
    const transferIndex = transferRecords.findIndex((item) => String(item.id) === String(payload.transferId))
    if (transferIndex < 0) throw new Error('Transfer PA tidak ditemukan. Muat ulang data lalu coba lagi.')

    const transfer = transferRecords[transferIndex]
    const hasLaterTransfer = transferRecords.slice(transferIndex + 1)
      .some((item) => String(item.recordId) === String(transfer.recordId))
    if (hasLaterTransfer) throw new Error('Transfer ini bukan transfer terakhir untuk PRK tersebut. Batalkan transfer paling baru terlebih dahulu.')

    const sheet = getDataSheet_()
    const values = sheet.getDataRange().getValues()
    const headers = values.shift() || []
    const rabIndex = headers.indexOf('TOTAL RAB')
    const paIndex = headers.indexOf('TOTAL PA')
    const contractIndex = headers.indexOf('NILAI KONTRAK')
    const contractDetailHeaders = ['NOKONTRAK', 'VENDOR', 'TANGGAL AWAL', 'TANGGAL AKHIR', 'RENCANA KONTRAK', 'RENCANA TAGIH', 'PROGRESS', 'PROYEKSI TAGIH', 'TANGGAL BAYAR']
    const contractDetailIndexes = contractDetailHeaders.map((header) => headers.indexOf(header)).filter((index) => index >= 0)
    const totalFinalIndex = headers.indexOf('TOTAL AKHIR')
    const remainingIndex = headers.indexOf('SISA PRK')
    if (rabIndex < 0 || paIndex < 0 || contractIndex < 0 || totalFinalIndex < 0 || remainingIndex < 0) throw new Error('Kolom TOTAL RAB, TOTAL PA, TOTAL AKHIR, NILAI KONTRAK, atau SISA PRK tidak ditemukan.')

    const recordIdIndex = headers.indexOf('RECORD ID')
    const prkIndex = headers.indexOf('NO.PRK')
    let dataRow = -1
    let current = null
    values.forEach((row, index) => {
      if (current) return
      const matchesId = recordIdIndex >= 0 && String(row[recordIdIndex]) === String(transfer.recordId)
      const matchesPrk = recordIdIndex < 0 && prkIndex >= 0 && String(row[prkIndex]) === String(transfer.prk)
      if (matchesId || matchesPrk) {
        dataRow = index + 2
        current = {
          rab: Number(row[rabIndex]) || 0, pa: Number(row[paIndex]) || 0,
          contract: Number(row[contractIndex]) || 0, totalFinal: Number(row[totalFinalIndex]) || 0,
          remaining: Number(row[remainingIndex]) || 0,
          hasContractDetails: contractDetailIndexes.some((column) => String(row[column] ?? '').trim() !== ''),
        }
      }
    })
    if (!current) throw new Error('PRK sumber transfer tidak ditemukan.')
    if (current.hasContractDetails) throw new Error('Data kontrak sudah diisi. Pembatalan transfer PA tidak diizinkan.')

    const closeEnough = (left, right) => Math.abs(left - right) < 0.001
    if (!closeEnough(current.rab, Number(transfer.rabAfter))
      || !closeEnough(current.pa, Number(transfer.paAfter))
      || !closeEnough(current.contract, Number(transfer.contractValue))) {
      throw new Error('Saldo PRK sudah berubah sejak transfer. Pembatalan otomatis ditolak agar saldo tidak rusak.')
    }

    const previousRab = Number(transfer.rabBefore)
    const previousPA = Number(transfer.paBefore)
    const previousContract = Number(transfer.contractBefore ?? transfer.paBefore)
    const previousRemaining = current.totalFinal - previousRab - previousPA
    if (![previousRab, previousPA, previousContract].every(Number.isFinite)) {
      throw new Error('Data saldo sebelum transfer tidak lengkap, sehingga transfer tidak dapat dibatalkan otomatis.')
    }

    const transferValues = transferSheet.getDataRange().getValues()
    const transferHeaders = transferValues[0] || []
    const transferIdIndex = transferHeaders.indexOf('ID')
    const physicalIndex = transferValues.findIndex((row, index) => index > 0 && String(row[transferIdIndex]) === String(transfer.id))
    if (physicalIndex < 1) throw new Error('Baris transfer di Google Sheets tidak ditemukan.')

    try {
      sheet.getRange(dataRow, rabIndex + 1).setValue(previousRab)
      sheet.getRange(dataRow, paIndex + 1).setValue(previousPA)
      sheet.getRange(dataRow, contractIndex + 1).setValue(previousContract)
      sheet.getRange(dataRow, remainingIndex + 1).setValue(previousRemaining)
      transferSheet.deleteRow(physicalIndex + 1)
    } catch (error) {
      sheet.getRange(dataRow, rabIndex + 1).setValue(current.rab)
      sheet.getRange(dataRow, paIndex + 1).setValue(current.pa)
      sheet.getRange(dataRow, contractIndex + 1).setValue(current.contract)
      sheet.getRange(dataRow, remainingIndex + 1).setValue(current.remaining)
      throw error
    }

    return {
      transfer,
      record: { id: transfer.recordId, prk: transfer.prk, rabTotal: previousRab, paTotal: previousPA, contractValue: previousContract, prkRemaining: previousRemaining },
    }
  } finally {
    lock.releaseLock()
  }
}