const DATA_SHEET_NAME = 'RABData'
const USERS_SHEET_NAME = 'USERS'
const SESSIONS_SHEET_NAME = 'SESSIONS'
const SESSION_HOURS = 8
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
    ['ID', 'id'], ['Kriteria', 'criteria'], ['Kegiatan', 'activity'], ['Uraian Komponen', 'name'], ['ID Material', 'materialId'],
    ['Nama Material', 'materialName'], ['Volume per Satuan', 'quantityPerUnit'], ['Satuan', 'unit'], ['Harga Material (Rp)', 'materialPrice'],
    ['Harga Jasa (Rp)', 'servicePrice'], ['Bagian Material (Rp)', 'materialPart'], ['Bagian Jasa (Rp)', 'servicePart'], ['Jumlah (Rp)', 'totalPart'], ['Catatan', 'notes'],
  ],
  activities: [
    ['ID', 'id'], ['No. RAB', 'rabNumber'], ['ID Data PRK', 'programRecordId'], ['No. PRK', 'prk'], ['Pos Anggaran', 'position'],
    ['Kriteria', 'criteria'], ['Nama Kegiatan', 'name'], ['Satuan', 'unit'], ['Volume', 'volume'], ['Tahun Anggaran', 'year'],
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
    ['ID', 'id'], ['ID Kegiatan', 'activityId'], ['Tanggal', 'date'], ['Volume Terealisasi', 'volume'], ['Tagihan (Rp)', 'billed'],
    ['Dibayar (Rp)', 'paid'], ['Kriteria', 'criteria'], ['No. PRK', 'prk'], ['Nama Kegiatan', 'activityName'], ['Catatan', 'notes'],
  ],
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
  if (action === 'authStatus') return json_({ ok: true, ...authStatus_() })
  if (action === 'publicDashboard') return json_({ ok: true, summary: publicDashboard_() })
  if (action !== 'loadWorkflow' && action !== 'load') return json_({ ok: false, error: 'Aksi tidak dikenal.' })
  const authorization = authorize_(event.parameter.token)
  if (!authorization.ok) return json_({ ok: false, error: authorization.error, code: 'AUTH_REQUIRED' })
  if (action === 'loadWorkflow') return json_({ ok: true, collections: loadWorkflow_(), user: authorization.user })
  const sheet = getDataSheet_()
  syncPrkRemainingColumn_(sheet)
  const values = sheet.getDataRange().getValues()
  const headers = values.shift() || []
  const records = values.filter((row) => row.some((cell) => cell !== '')).map((row, index) => {
    const record = { sourceRow: index + 2 }
    headers.forEach((header, column) => { record[header] = row[column] === null ? '' : row[column] })
    return toClientRecord_(record)
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
    return json_({ ok: true, collection: payload.collection, rows: payload.records.length, updatedRecords: updatedRecords || [] })
  }
  if (payload.action === 'transferToPA') {
    try {
      return json_({ ok: true, ...transferToPA_(payload) })
    } catch (error) {
      return json_({ ok: false, error: error.message || 'Finalisasi ke PA gagal.' })
    }
  }
  if (payload.action === 'cancelTransferToPA') {
    try {
      return json_({ ok: true, ...cancelTransferToPA_(payload) })
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
    const rows = payload.records.map((record) => {
      const current = { ...record }
      current.prkRemaining = calculatePrkRemaining_(current)
      return DATA_HEADERS.map((header) => current[CLIENT_KEYS[header]] ?? '')
    })
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
  result.prkRemaining = calculatePrkRemaining_(result)
  return result
}

function calculatePrkRemaining_(record) {
  return (Number(record.totalFinal) || 0) - (Number(record.rabTotal) || 0) - (Number(record.paTotal) || 0)
}

function syncPrkRemainingColumn_(sheet) {
  const values = sheet.getDataRange().getValues()
  if (values.length < 2) return
  const headers = values[0]
  const totalFinalIndex = headers.indexOf('TOTAL AKHIR')
  const rabIndex = headers.indexOf('TOTAL RAB')
  const paIndex = headers.indexOf('TOTAL PA')
  const remainingIndex = headers.indexOf('SISA PRK')
  if (totalFinalIndex < 0 || rabIndex < 0 || paIndex < 0 || remainingIndex < 0) return

  const remainingValues = values.slice(1).map((row) => {
    if (!row.some((cell) => cell !== '' && cell !== null)) return ['']
    return [(Number(row[totalFinalIndex]) || 0) - (Number(row[rabIndex]) || 0) - (Number(row[paIndex]) || 0)]
  })
  sheet.getRange(2, remainingIndex + 1, remainingValues.length, 1).setValues(remainingValues)
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

function getUsersSheet_() {
  const sheet = getWorkflowSheet_(USERS_SHEET_NAME)
  const values = sheet.getDataRange().getValues()
  if (!values.length || values[0][1] === 'DATA_JSON') sheet.getRange(1, 1, 1, 8).setValues([['ID', 'USERNAME', 'NAME', 'ROLE', 'PASSWORD_HASH', 'SALT', 'ACTIVE', 'CREATED_AT']])
  return sheet
}

function getSessionsSheet_() {
  const sheet = getWorkflowSheet_(SESSIONS_SHEET_NAME)
  const values = sheet.getDataRange().getValues()
  if (!values.length || values[0][1] === 'DATA_JSON') sheet.getRange(1, 1, 1, 4).setValues([['TOKEN_HASH', 'USER_ID', 'EXPIRES_AT', 'CREATED_AT']])
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
  return { setupRequired: users.length === 0, setupAvailable: Boolean(PropertiesService.getScriptProperties().getProperty('ADMIN_SETUP_KEY')) }
}

function hashPassword_(password, salt) {
  let digest = salt + ':' + password
  for (let index = 0; index < 10000; index += 1) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest, Utilities.Charset.UTF_8)
    digest = bytes.map((byte) => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('') + salt
  }
  return digest.slice(0, 64)
}

function hashToken_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''), Utilities.Charset.UTF_8)
  return bytes.map((byte) => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('')
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
    properties.deleteProperty('ADMIN_SETUP_KEY')
    return login_(username, password)
  } finally {
    lock.releaseLock()
  }
}

function login_(usernameValue, passwordValue) {
  const username = String(usernameValue || '').trim().toLowerCase()
  const password = String(passwordValue || '')
  const user = readUsers_().find((item) => item.username.toLowerCase() === username && item.active)
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
  const sessionValues = getSessionsSheet_().getDataRange().getValues()
  const now = Date.now()
  const session = sessionValues.slice(1).find((row) => row[0] === tokenHash && new Date(row[2]).getTime() > now)
  if (!session) return { ok: false, error: 'Sesi berakhir atau tidak valid. Silakan login kembali.' }
  const user = readUsers_().find((item) => item.id === String(session[1]) && item.active)
  if (!user) return { ok: false, error: 'Akun tidak aktif. Hubungi admin.' }
  return { ok: true, user: safeUser_(user) }
}

function logout_(token) {
  const sheet = getSessionsSheet_()
  const tokenHash = hashToken_(token)
  const values = sheet.getDataRange().getValues()
  const index = values.findIndex((row, rowIndex) => rowIndex > 0 && row[0] === tokenHash)
  if (index > 0) sheet.deleteRow(index + 1)
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
  return { ok: true, user: safeUser_(user) }
}

function publicDashboard_() {
  const sheet = getDataSheet_()
  syncPrkRemainingColumn_(sheet)
  const values = sheet.getDataRange().getValues()
  const headers = values.shift() || []
  const column = (name) => headers.indexOf(name)
  const indexes = {
    prk: column('NO.PRK'), description: column('URAIAN'), program: column('PROGRAM'), year: column('TAHUN ANGGARAN'), notes: column('KETERANGAN'),
    pagu: column('TOTAL AKHIR'), totalPrk: column('TOTAL PRK'), pa: column('TOTAL PA'), rab: column('TOTAL RAB'),
    contract: column('NILAI KONTRAK'), billed: column('TAGIHAN'), paid: column('TOTAL BAYAR'), remainingPrk: column('SISA PRK'),
  }
  const groups = new Map()
  const rows = values.filter((row) => row.some((cell) => cell !== '')).map((row) => {
    const value = (index) => index >= 0 ? row[index] : ''
    const number = (index) => index >= 0 ? Number(row[index]) || 0 : 0
    return {
      prk: String(value(indexes.prk) || ''), description: String(value(indexes.description) || ''),
      program: String(value(indexes.program) || 'Program lain'), year: String(value(indexes.year) || ''),
      notes: String(value(indexes.notes) || ''), totalFinal: number(indexes.pagu), totalPrk: number(indexes.totalPrk),
      rabTotal: number(indexes.rab), paTotal: number(indexes.pa), contractValue: number(indexes.contract),
      billed: number(indexes.billed), paid: number(indexes.paid),
      prkRemaining: number(indexes.pagu) - number(indexes.rab) - number(indexes.pa),
    }
  }).filter((record) => record.prk.trim())
  rows.forEach((record) => {
    const program = record.program
    const year = record.year
    const key = `${program}::${year}`
    const group = groups.get(key) || { program, year, count: 0, pagu: 0, rab: 0, pa: 0, contract: 0, billed: 0, paid: 0, remainingPrk: 0, contractCount: 0 }
    group.count += 1
    group.pagu += record.totalFinal || record.totalPrk
    group.rab += record.rabTotal
    group.pa += record.paTotal
    group.contract += record.contractValue
    group.billed += record.billed
    group.paid += record.paid
    group.remainingPrk += record.prkRemaining
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
  if (billedIndex < 0 || paidIndex < 0) throw new Error('Kolom TAGIHAN atau TOTAL BAYAR tidak ditemukan di RABData.')

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

  const affectedRecordIds = new Set([...previousRecords, ...nextRecords]
    .map((item) => recordByActivity.get(String(item.activityId)))
    .filter(Boolean).map(String))
  if (!affectedRecordIds.size) return []

  const totals = new Map([...affectedRecordIds].map((id) => [id, { billed: 0, paid: 0 }]))
  nextRecords.forEach((item) => {
    const total = totals.get(String(recordByActivity.get(String(item.activityId)) || ''))
    if (!total) return
    total.billed += Number(item.billed) || 0
    total.paid += Number(item.paid) || 0
  })

  const updates = []
  programRecords.forEach((record, index) => {
    const total = totals.get(String(record.id))
    if (!total) return
    const rowNumber = index + 2
    const previousBilled = values[index][billedIndex]
    const previousPaid = values[index][paidIndex]
    try {
      dataSheet.getRange(rowNumber, billedIndex + 1).setValue(total.billed)
      dataSheet.getRange(rowNumber, paidIndex + 1).setValue(total.paid)
    } catch (error) {
      dataSheet.getRange(rowNumber, billedIndex + 1).setValue(previousBilled)
      dataSheet.getRange(rowNumber, paidIndex + 1).setValue(previousPaid)
      throw error
    }
    updates.push({ ...record, billed: total.billed, paid: total.paid })
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
    if (rabIndex < 0 || paIndex < 0 || contractIndex < 0 || remainingIndex < 0) throw new Error('Kolom TOTAL RAB, TOTAL PA, NILAI KONTRAK, atau SISA PRK tidak ditemukan.')

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
    const nextRemaining = calculatePrkRemaining_({ ...target, rabTotal: nextRab, paTotal: nextPA })
    try {
      sheet.getRange(targetRow, rabIndex + 1).setValue(nextRab)
      sheet.getRange(targetRow, paIndex + 1).setValue(nextPA)
      sheet.getRange(targetRow, contractIndex + 1).setValue(nextPA)
      sheet.getRange(targetRow, remainingIndex + 1).setValue(nextRemaining)
      const transfer = {
        id: Utilities.getUuid(), recordId: target.id, prk: target.prk, rabNumber: target.rabNumber,
        criteria: payload.criteria || '', description: target.description || '', date: payload.date || new Date().toISOString().slice(0, 10),
        amount, rabBefore: previousRab, rabAfter: nextRab, paBefore: previousPA, paAfter: nextPA, contractBefore: previousContract,
        contractValue: nextPA, notes: String(payload.notes || '').trim(), createdAt: new Date().toISOString(),
      }
      appendWorkflowRecord_('paTransfers', transfer)
      return { transfer, record: { ...target, rabTotal: nextRab, paTotal: nextPA, contractValue: nextPA, prkRemaining: nextRemaining } }
    } catch (error) {
      sheet.getRange(targetRow, rabIndex + 1).setValue(previousRab)
      sheet.getRange(targetRow, paIndex + 1).setValue(previousPA)
      sheet.getRange(targetRow, contractIndex + 1).setValue(previousContract)
      sheet.getRange(targetRow, remainingIndex + 1).setValue(calculatePrkRemaining_(target))
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
        }
      }
    })
    if (!current) throw new Error('PRK sumber transfer tidak ditemukan.')

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