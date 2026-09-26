import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import appsScriptHandler from '../api/apps-script.js'
import { importWorkbook } from '../src/lib/workbook.js'

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
  }

  const headers = ['NO.PRK', 'NO.RAB', 'URAIAN', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'RECORD ID']
  const dataSheet = new MockSheet([headers, ['', 'RAB-42', 'Paket A', 1000, 200, 200, 'DATAANGGARANINVESTASI-row-2']])
  const sheets = { RABData: dataSheet }
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
    Utilities: { getUuid: () => 'mock-transfer-1' },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text)

  const result = post({ action: 'transferToPA', recordId: 'DATAANGGARANINVESTASI-row-2', amount: 300, date: '2026-09-26' })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.record.id, 'DATAANGGARANINVESTASI-row-2')
  assert.equal(result.record.rabTotal, 700)
  assert.equal(result.record.paTotal, 500)
  assert.equal(result.record.contractValue, 500)
  assert.equal(sheets.PA_TRANSFERS.appended.length, 1)

  const rejected = post({ action: 'transferToPA', recordId: 'DATAANGGARANINVESTASI-row-2', amount: 701 })
  assert.equal(rejected.ok, false)
  assert.equal(dataSheet.values[1][3], 700)
  assert.equal(dataSheet.values[1][4], 500)
  assert.equal(sheets.PA_TRANSFERS.appended.length, 1)

  const saved = post({ action: 'save', records: [result.record] })
  assert.equal(saved.ok, true)
  const loaded = JSON.parse(context.doGet({ parameter: { action: 'load' } }).text)
  assert.equal(loaded.records[0].id, 'DATAANGGARANINVESTASI-row-2')
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