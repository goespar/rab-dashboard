import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('syncs DATA AI by header and preserves matching application-only values and RECORD ID', async () => {
  class MockSheet {
    constructor(name, values) {
      this.name = name
      this.values = values.map((row) => [...row])
    }

    getName() { return this.name }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    getLastColumn() { return Math.max(0, ...this.values.map((row) => row.length)) }
    getMaxRows() { return 100 }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return {
        setValues: (rows) => rows.forEach((values, rowOffset) => {
          this.values[row - 1 + rowOffset] ??= []
          values.forEach((value, columnOffset) => {
            this.values[row - 1 + rowOffset][column - 1 + columnOffset] = value
          })
        }),
        setNumberFormat() {},
      }
    }
  }

  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  const context = {
    SpreadsheetApp: {
      openById: (id) => spreadsheets[id],
      getActiveSpreadsheet: () => spreadsheets.destination,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => ({
          SPREADSHEET_ID: 'destination',
          DASHBOARD_SOURCE_SPREADSHEET_ID: 'source',
        }[name] || ''),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => 'new-record-id' },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  }
  const spreadsheets = {}
  vm.runInNewContext(script, context)

  const targetHeaders = vm.runInContext('DATA_HEADERS', context)
  const existingRow = targetHeaders.map(() => '')
  existingRow[targetHeaders.indexOf('NO.PRK')] = 'PRK-OLD'
  existingRow[targetHeaders.indexOf('NO.RAB')] = 'RAB-1'
  existingRow[targetHeaders.indexOf('URAIAN')] = 'Uraian lama'
  existingRow[targetHeaders.indexOf('TOTAL RAB')] = 100
  existingRow[targetHeaders.indexOf('NILAI KONTRAK')] = 70
  existingRow[targetHeaders.lastIndexOf('POS ANGGARAN')] = 'POS aplikasi'
  existingRow[targetHeaders.indexOf('RECORD ID')] = 'existing-record-id'
  existingRow[targetHeaders.indexOf('PROGRESS')] = 'DIPROSES'

  const destination = {
    getSheetByName: (name) => name === 'RABData' ? destinationSheet : null,
    insertSheet: () => destinationSheet,
  }
  const destinationSheet = new MockSheet('RABData', [targetHeaders, existingRow])
  const sourceSheet = new MockSheet('DATA AI', [
    ['NO.RAB', 'TOTAL RAB', 'URAIAN', 'NO.PRK', 'NILAI KONTRAK'],
    ['RAB-1', 150, 'Uraian terbaru', 'PRK-NEW', 90],
    ['RAB-2', 250, 'Data baru', 'PRK-2', 110],
  ])
  spreadsheets.destination = destination
  spreadsheets.source = { getSheetByName: (name) => name === 'DATA AI' ? sourceSheet : null, getSheets: () => [sourceSheet] }
  context.authorize_ = () => ({ ok: true, user: { id: 'planner-1', role: 'planner' } })

  const result = JSON.parse(context.doPost({
    postData: { contents: JSON.stringify({ action: 'syncDashboardSource', token: 'test-token' }) },
  }).text)

  assert.equal(result.ok, true, result.error)
  assert.equal(result.rows, 2)
  assert.equal(result.records[0].id, 'existing-record-id')
  assert.equal(result.records[0].prk, 'PRK-NEW')
  assert.equal(result.records[0].description, 'Uraian terbaru')
  assert.equal(result.records[0].rabTotal, 150)
  assert.equal(result.records[0].contractValue, 90)
  assert.equal(result.records[0].progress, 'DIPROSES')
  assert.equal(result.records[0].position, 'POS aplikasi')
  assert.equal(result.records[1].id, 'new-record-id')
  assert.equal(destinationSheet.values[0][targetHeaders.indexOf('RECORD ID')], 'RECORD ID')
})
