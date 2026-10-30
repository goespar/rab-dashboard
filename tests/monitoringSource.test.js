import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('loads Monitoring data from the configured Google Sheets source', async () => {
  class MockSheet {
    constructor(name, values) {
      this.name = name
      this.values = values
    }
    getName() { return this.name }
    getLastRow() { return this.values.length }
    getLastColumn() { return this.values[0]?.length || 0 }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
  }

  const sheets = new Map([
    ['SPB', new MockSheet('SPB', [['NO SPB', 'URAIAN MATERIAL'], ['SPB-1', 'Kabel']])],
    ['STOCK GUDANG', new MockSheet('STOCK GUDANG', [['NAMA MATERIAL', 'VOL GUDANG'], ['Kabel', 5]])],
    ['BEBAN GI DAN PYL', new MockSheet('BEBAN GI DAN PYL', [['PENYULANG', 'BEBAN SIANG'], ['Penyulang A', 10]])],
    ['DATABASE_RAB', new MockSheet('DATABASE_RAB', [['ID RAB', 'URAIAN MATERIAL'], ['RAB-1', 'Kabel']])],
    ['Tibet', new MockSheet('Tibet', [['Daftar Tibet'], ['VENDOR', 'NOMOR KR'], ['Vendor A', 'KR-1']])],
    ['MON KONTRAK VENDOR', new MockSheet('MON KONTRAK VENDOR', [['NOMOR KONTRAK', 'VENDOR'], ['KONTRAK-1', 'Vendor A']])],
    ['MON PLG PERLUASAN', new MockSheet('MON PLG PERLUASAN', [['NAMA', 'NO PK'], ['Pelanggan A', 'PK-1']])],
  ])
  let openedId = ''
  const sourceSpreadsheet = {
    getSheetByName: (name) => sheets.get(name) || null,
    getSheets: () => [...sheets.values()],
  }
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: { openById: (id) => { openedId = id; return sourceSpreadsheet } },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', role: 'admin' } })

  const result = JSON.parse(context.doGet({
    parameter: { action: 'loadMonitoringSource', token: 'test' },
  }).text)

  assert.equal(result.ok, true, result.error)
  assert.equal(openedId, '1E330xkEvgia8w4n43eWIg8_854sX3VS7zqcrO5rXdWc')
  assert.equal(Object.keys(result.datasets).length, 7)
  assert.equal(result.datasets.tibet.sheetName, 'Tibet')
  assert.deepEqual(Array.from(result.datasets.tibet.headers), ['VENDOR', 'NOMOR KR'])
  assert.deepEqual(Array.from(result.datasets.tibet.rows[0]), ['Vendor A', 'KR-1'])
  assert.equal(result.datasets.customers.sheetName, 'MON PLG PERLUASAN')
})
