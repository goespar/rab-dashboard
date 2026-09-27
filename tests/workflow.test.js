import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import appsScriptHandler from '../api/apps-script.js'
import { importWorkbook, parseNumber } from '../src/lib/workbook.js'

test('imports No. RAB-only rows with distinct sheet row IDs', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DATA ANGGARAN INVESTASI')
  sheet.addRow(['NO.PRK', 'NO.RAB', 'URAIAN', 'TOTAL RAB', 'NILAI KONTRAK'])
  sheet.addRow(['', 'RAB-42', 'Paket A', 1000, 0])
  sheet.addRow(['', 'RAB-42', 'Paket B', 2000, 0])
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await importWorkbook({
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })

  assert.equal(result.records.length, 2)
  assert.notEqual(result.records[0].id, result.records[1].id)
  assert.equal(result.records[0].id, 'DATAANGGARANINVESTASI-row-2')
  assert.equal(result.records[0].prk, '')
  assert.equal(result.records[0].rabNumber, 'RAB-42')
})

test('imports thousands-separated financial values without converting them to zero', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DATA ANGGARAN INVESTASI')
  sheet.addRow(['NO.PRK', 'URAIAN', 'TOTAL PRK', 'TOTAL AKHIR', 'TOTAL RAB', 'NILAI KONTRAK'])
  sheet.addRow(['PRK-1', 'Paket A', '1,234,567', '2,345,678', '3,456,789', '4,567,890'])
  sheet.addRow(['PRK-2', 'Paket B', '2.345.678,50', '3.456.789,25', '4.567.890,75', '5.678.901,25'])
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await importWorkbook({
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })

  assert.deepEqual(result.records.map(({ totalPrk, totalFinal, rabTotal, contractValue }) => ({ totalPrk, totalFinal, rabTotal, contractValue })), [
    { totalPrk: 1234567, totalFinal: 2345678, rabTotal: 3456789, contractValue: 4567890 },
    { totalPrk: 2345678.5, totalFinal: 3456789.25, rabTotal: 4567890.75, contractValue: 5678901.25 },
  ])
})

test('transfers PA against the matching row ID and rejects overspending', async () => {
  class MockSheet {
    constructor(values = []) {
      this.values = values
      this.appended = []
    }

    getDataRange() {
      return { getValues: () => this.values.map((row) => [...row]) }
    }

    getLastRow() {
      return this.values.length
    }

    clearContents() {
      this.values = []
    }

    getRange(row, column) {
      return {
        setValue: (value) => { this.values[row - 1][column - 1] = value },
        setValues: (rows) => rows.forEach((values, index) => { this.values[row - 1 + index] = values }),
      }
    }

    appendRow(row) {
      this.appended.push(row)
      this.values.push(row)
    }

    deleteRow(row) {
      this.values.splice(row - 1, 1)
    }
  }

  const headers = ['NO.PRK', 'NO.RAB', 'URAIAN', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'RECORD ID']
  const dataSheet = new MockSheet([headers, ['', 'RAB-42', 'Paket A', 1000, 200, 200, 'DATAANGGARANINVESTASI-row-2']])
  const sheets = { RABData: dataSheet }
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => { sheets[name] = new MockSheet(); return sheets[name] },
  }
  const dataValue = (header) => dataSheet.values[1][dataSheet.values[0].indexOf(header)]
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
    Utilities: { getUuid: (() => { let id = 0; return () => `mock-transfer-${++id}` })() },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', username: 'admin', role: 'admin', name: 'Test Admin' } })
  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text)

  const result = post({ action: 'transferToPA', recordId: 'DATAANGGARANINVESTASI-row-2', amount: 300, date: '2026-09-26' })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.record.id, 'DATAANGGARANINVESTASI-row-2')
  assert.equal(result.record.rabTotal, 700)
  assert.equal(result.record.paTotal, 500)
  assert.equal(result.record.contractValue, 500)
  assert.equal(result.transfer.contractValue, 500)
  assert.equal(dataValue('NILAI KONTRAK'), 500)
  const transferHeaders = sheets.PA_TRANSFERS.values[0]
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)
  assert.equal(transferHeaders.includes('DATA_JSON'), false)
  assert.equal(sheets.PA_TRANSFERS.values[1][transferHeaders.indexOf('Nilai Dialihkan (Rp)')], 300)

  const rejected = post({ action: 'transferToPA', recordId: 'DATAANGGARANINVESTASI-row-2', amount: 701 })
  assert.equal(rejected.ok, false)
  assert.equal(dataValue('TOTAL RAB'), 700)
  assert.equal(dataValue('TOTAL PA'), 500)
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)

  const saved = post({ action: 'save', records: [result.record] })
  assert.equal(saved.ok, true)
  const loaded = JSON.parse(context.doGet({ parameter: { action: 'load' } }).text)
  assert.equal(loaded.records[0].id, 'DATAANGGARANINVESTASI-row-2')

  const later = post({ action: 'transferToPA', recordId: 'DATAANGGARANINVESTASI-row-2', amount: 100 })
  assert.equal(later.ok, true, later.error)
  assert.equal(dataValue('TOTAL RAB'), 600)
  assert.equal(dataValue('TOTAL PA'), 600)
  assert.equal(dataValue('NILAI KONTRAK'), 600)

  const blocked = post({ action: 'cancelTransferToPA', transferId: result.transfer.id })
  assert.equal(blocked.ok, false)
  assert.equal(dataValue('TOTAL RAB'), 600)
  assert.equal(sheets.PA_TRANSFERS.values.length, 3)

  const canceledLater = post({ action: 'cancelTransferToPA', transferId: later.transfer.id })
  assert.equal(canceledLater.ok, true, canceledLater.error)
  assert.equal(canceledLater.record.rabTotal, 700)
  assert.equal(canceledLater.record.paTotal, 500)
  assert.equal(canceledLater.record.contractValue, 500)
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)

  const canceledFirst = post({ action: 'cancelTransferToPA', transferId: result.transfer.id })
  assert.equal(canceledFirst.ok, true, canceledFirst.error)
  assert.equal(canceledFirst.record.rabTotal, 1000)
  assert.equal(canceledFirst.record.paTotal, 200)
  assert.equal(canceledFirst.record.contractValue, 200)
  assert.equal(dataValue('TOTAL RAB'), 1000)
  assert.equal(dataValue('TOTAL PA'), 200)
  assert.equal(dataValue('NILAI KONTRAK'), 200)
  assert.equal(sheets.PA_TRANSFERS.values.length, 1)
})

test('syncs realization billing and payment totals to matching RABData rows', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return {
        setValue: (value) => {
          this.values[row - 1] ??= []
          this.values[row - 1][column - 1] = value
        },
        setValues: (rows) => rows.forEach((values, index) => { this.values[row - 1 + index] = values }),
      }
    }
  }

  const dataHeaders = ['NO.PRK', 'NO.RAB', 'URAIAN', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'TAGIHAN', 'TOTAL BAYAR', 'RECORD ID']
  const dataSheet = new MockSheet([dataHeaders, ['PRK-1', 'RAB-1', 'Paket A', 1000, 0, 0, 50, 25, 'record-1']])
  const activitySheet = new MockSheet([
    ['ID', 'No. RAB', 'ID Data PRK', 'No. PRK'],
    ['activity-1', 'RAB-1', 'record-1', 'PRK-1'],
  ])
  const sheets = { RABData: dataSheet, RAB_KEGIATAN: activitySheet }
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => { sheets[name] = new MockSheet(); return sheets[name] },
  }
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', username: 'admin', role: 'admin', name: 'Test Admin' } })
  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text)
  const realization = (id, billed, paid) => ({ id, activityId: 'activity-1', date: '2026-09-27', volume: 1, billed, paid })

  const saved = post({ action: 'saveWorkflow', collection: 'realizations', records: [realization('real-1', 100, 40), realization('real-2', 200, 80)] })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TAGIHAN')], 300)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TOTAL BAYAR')], 120)
  assert.equal(saved.updatedRecords[0].billed, 300)
  assert.equal(saved.updatedRecords[0].paid, 120)

  const edited = post({ action: 'saveWorkflow', collection: 'realizations', records: [realization('real-2', 250, 100)] })
  assert.equal(edited.ok, true, edited.error)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TAGIHAN')], 250)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TOTAL BAYAR')], 100)

  const deleted = post({ action: 'saveWorkflow', collection: 'realizations', records: [] })
  assert.equal(deleted.ok, true, deleted.error)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TAGIHAN')], 0)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TOTAL BAYAR')], 0)
})

test('loads and migrates workflow JSON into named columns without losing records', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return { setValues: (rows) => rows.forEach((values, index) => { this.values[row - 1 + index] = values }) }
    }
  }

  const component = { id: 'component-1', activity: 'Pembangunan jaringan', name: 'Kabel', quantityPerUnit: 2, unit: 'm', materialPrice: 1000 }
  const transfer = { id: 'transfer-1', recordId: 'prk-1', amount: 250, rabBefore: 1000, rabAfter: 750, paBefore: 0, paAfter: 250, contractValue: 250 }
  const sheets = {
    RAB_KOMPONEN: new MockSheet([['ID', 'DATA_JSON', 'UPDATED_AT'], ['component-1', JSON.stringify(component), '2026-09-27']]),
    PA_TRANSFERS: new MockSheet([['ID', 'DATA_JSON', 'UPDATED_AT'], ['transfer-1', JSON.stringify(transfer), '2026-09-27']]),
  }
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => { sheets[name] = new MockSheet(); return sheets[name] },
  }
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', username: 'admin', role: 'admin', name: 'Test Admin' } })

  const result = JSON.parse(context.doGet({ parameter: { action: 'loadWorkflow' } }).text)
  const componentHeaders = sheets.RAB_KOMPONEN.values[0]
  const transferHeaders = sheets.PA_TRANSFERS.values[0]

  assert.equal(result.collections.components[0].quantityPerUnit, 2)
  assert.equal(result.collections.paTransfers[0].amount, 250)
  assert.equal(componentHeaders.includes('DATA_JSON'), false)
  assert.equal(sheets.RAB_KOMPONEN.values[1][componentHeaders.indexOf('Volume per Satuan')], 2)
  assert.equal(transferHeaders.includes('DATA_JSON'), false)
  assert.equal(sheets.PA_TRANSFERS.values[1][transferHeaders.indexOf('Nilai Dialihkan (Rp)')], 250)
})

test('Vercel proxy forwards health checks and transfer requests to Apps Script', async () => {
  const previousUrl = process.env.APPS_SCRIPT_URL
  const previousFetch = globalThis.fetch
  const requests = []
  process.env.APPS_SCRIPT_URL = 'https://script.example/exec'
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    return { status: 200, text: async () => '{"ok":true}' }
  }
  const response = {
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers ??= {}; this.headers[name] = value; return this },
    send(value) { this.body = value; return this },
    json(value) { this.body = value; return this },
  }

  try {
    await appsScriptHandler({ method: 'GET', query: { action: 'health' } }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(new URL(requests[0].url).searchParams.get('action'), 'health')

    await appsScriptHandler({ method: 'POST', body: { action: 'transferToPA', recordId: 'row-2', amount: 300 } }, response)
    assert.equal(requests[1].options.method, 'POST')
    assert.deepEqual(JSON.parse(requests[1].options.body), { action: 'transferToPA', recordId: 'row-2', amount: 300 })
  } finally {
    if (previousUrl === undefined) delete process.env.APPS_SCRIPT_URL
    else process.env.APPS_SCRIPT_URL = previousUrl
    globalThis.fetch = previousFetch
  }
})

test('imports material prices by header and normalizes Excel thousand-scaled currency values', async () => {
  const workbook = new ExcelJS.Workbook()
  const dataSheet = workbook.addWorksheet('DATA ANGGARAN INVESTASI')
  dataSheet.addRow(['NO.PRK', 'URAIAN', 'TOTAL RAB', 'NILAI KONTRAK'])
  dataSheet.addRow(['PRK-1', 'Paket A', 1000, 0])
  const materialSheet = workbook.addWorksheet('FORM MATERIAL & HARGA')
  materialSheet.addRow(['HARGA JASA', 'KRITERIA', 'URAIAN', 'MDU/NON MDU', 'SAT', 'HARGA MATERIAL', 'KOMPONEN PEKERJAAN'])
  materialSheet.addRow([254.649, 'TM', 'Material A', 'NON MDU', 'set', '1,344,478', 'Pemasangan SUTM'])
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await importWorkbook({
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })

  assert.deepEqual({
    name: result.materials[0].name,
    unit: result.materials[0].unit,
    materialPrice: result.materials[0].materialPrice,
    servicePrice: result.materials[0].servicePrice,
    componentActivity: result.materials[0].componentActivity,
  }, {
    name: 'Material A',
    unit: 'set',
    materialPrice: 1344478,
    servicePrice: 254649,
    componentActivity: 'Pemasangan SUTM',
  })
  assert.equal(parseNumber('1.344.478'), 1344478)
  assert.equal(parseNumber('1,25'), 1.25)
})

test('bootstraps admin, exposes only aggregate public data, and blocks viewer writes', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return {
        setValue: (value) => { this.values[row - 1][column - 1] = value },
        setValues: (rows) => rows.forEach((values, index) => { this.values[row - 1 + index] = values }),
      }
    }
    appendRow(row) { this.values.push(row) }
    deleteRow(row) { this.values.splice(row - 1, 1) }
  }

  const headers = ['NO.PRK', 'URAIAN', 'TOTAL AKHIR', 'TOTAL PRK', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'TAGIHAN', 'TOTAL BAYAR', 'SISA PRK', 'PROGRAM', 'TAHUN ANGGARAN', 'RECORD ID']
  const dataSheet = new MockSheet([
    headers,
    ['PRK-SECRET', 'Uraian rahasia', 1000, 1000, 500, 250, 250, 100, 50, 450, 'Program A', 2026, 'record-1'],
    ['PRK-SECOND', 'Uraian kedua', 2000, 2000, 900, 600, 550, 200, 150, 1100, 'Program B', 2027, 'record-2'],
    ['', 'Baris tanpa PRK', 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 'Program A', 2026, 'record-no-prk'],
  ])
  const sheets = { RABData: dataSheet }
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => { sheets[name] = new MockSheet(); return sheets[name] },
  }
  const properties = new Map([['ADMIN_SETUP_KEY', 'one-time-setup-secret']])
  let uuid = 0
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || '',
      deleteProperty: (key) => properties.delete(key),
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value), 'utf8').digest()].map((byte) => byte > 127 ? byte - 256 : byte),
      getUuid: () => `mock-uuid-${++uuid}`,
    },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text)

  const publicResponse = JSON.parse(context.doGet({ parameter: { action: 'publicDashboard' } }).text)
  assert.equal(publicResponse.ok, true)
  assert.equal(publicResponse.summary.groups[0].pagu, 1000)
  assert.equal(publicResponse.summary.groups[0].rab, 500)
  assert.equal(publicResponse.summary.groups[0].contract, 250)
  assert.equal(publicResponse.summary.groups[0].remainingPrk, 450)
  assert.equal(publicResponse.summary.groups[0].paid, 50)
  assert.equal(publicResponse.summary.rows.length, 2)
  assert.equal(publicResponse.summary.groups.find((group) => group.program === 'Program A').pagu, 1000)
  assert.equal(publicResponse.summary.rows[0].prk, 'PRK-SECRET')
  assert.equal(publicResponse.summary.rows[0].description, 'Uraian rahasia')
  assert.equal('vendor' in publicResponse.summary.rows[0], false)
  assert.equal('contractNumber' in publicResponse.summary.rows[0], false)
  assert.equal('records' in publicResponse, false)
  assert.equal('prk' in publicResponse.summary.groups[0], false)
  assert.equal('description' in publicResponse.summary.groups[0], false)

  const initialStatus = JSON.parse(context.doGet({ parameter: { action: 'authStatus' } }).text)
  assert.equal(initialStatus.setupRequired, true)
  assert.equal(initialStatus.setupAvailable, true)
  const admin = post({ action: 'bootstrapAdmin', setupKey: 'one-time-setup-secret', username: 'owner', name: 'Admin Utama', password: 'password-admin-123' })
  assert.equal(admin.ok, true, admin.error)
  assert.equal(admin.user.role, 'admin')
  assert.equal(properties.has('ADMIN_SETUP_KEY'), false)
  const privateData = JSON.parse(context.doGet({ parameter: { action: 'load', token: admin.token } }).text)
  assert.equal(privateData.records[0].prk, 'PRK-SECRET')

  const viewer = post({ action: 'saveUser', token: admin.token, user: { username: 'viewer', name: 'Viewer', role: 'viewer', password: 'password-viewer-123', active: true } })
  assert.equal(viewer.ok, true, viewer.error)
  const viewerLogin = post({ action: 'login', username: 'viewer', password: 'password-viewer-123' })
  assert.equal(viewerLogin.ok, true, viewerLogin.error)
  const blockedWrite = post({ action: 'save', token: viewerLogin.token, records: [] })
  assert.equal(blockedWrite.ok, false)
  assert.match(blockedWrite.error, /baca/)
  const blockedRead = JSON.parse(context.doGet({ parameter: { action: 'load' } }).text)
  assert.equal(blockedRead.ok, false)
  assert.equal(blockedRead.code, 'AUTH_REQUIRED')
})