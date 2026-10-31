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
  assert.equal(targetHeaders.at(-1), 'RECORD ID')
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

test('moves the existing RABData RECORD ID column to the last header without changing row values', async () => {
  class MockSheet {
    constructor(values) { this.values = values.map((row) => [...row]) }
    getDataRange() {
      return { getValues: () => this.values.map((row) => {
        const values = [...row]
        while (values.length && values.at(-1) === '') values.pop()
        return values
      }) }
    }
    getMaxRows() { return 100 }
    getMaxColumns() { return Math.max(...this.values.map((row) => row.length)) }
    insertColumnsAfter(afterPosition, count) {
      this.values.forEach((row) => row.splice(afterPosition, 0, ...Array(count).fill('')))
    }
    getRange(row, column, numRows, numColumns) {
      return {
        column,
        setValues: (rows) => rows.forEach((value, rowOffset) => {
          this.values[row - 1 + rowOffset] ??= Array(numColumns).fill('')
          value.forEach((cell, columnOffset) => { this.values[row - 1 + rowOffset][column - 1 + columnOffset] = cell })
        }),
        setNumberFormat() {},
      }
    }
    moveColumns(columnRange, destinationIndex) {
      const sourceIndex = columnRange.column - 1
      this.values.forEach((row) => {
        const [value] = row.splice(sourceIndex, 1)
        row.splice(destinationIndex - 2, 0, value)
      })
    }
  }

  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  const context = {}
  vm.runInNewContext(script, context)
  const headers = vm.runInContext('DATA_HEADERS', context)
  const existingHeaders = [...headers]
  const idIndex = existingHeaders.indexOf('RECORD ID')
  existingHeaders.splice(idIndex, 1)
  existingHeaders.splice(26, 0, 'RECORD ID')
  const existingRow = existingHeaders.map((header) => header === 'RECORD ID' ? 'stable-record-id' : `value-${header}`)
  const sheet = new MockSheet([existingHeaders, existingRow])

  context.ensureDataHeaders_(sheet)

  const [migratedHeaders, migratedRow] = sheet.getDataRange().getValues()
  assert.equal(migratedHeaders.at(-1), 'RECORD ID')
  assert.equal(migratedRow.at(-1), 'stable-record-id')
  assert.equal(migratedRow[migratedHeaders.indexOf('NO.PRK')], 'value-NO.PRK')
  assert.equal(migratedRow[migratedHeaders.indexOf('TANGGAL BAYAR')], 'value-TANGGAL BAYAR')
})
