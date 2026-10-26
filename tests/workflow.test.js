import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import appsScriptHandler from '../api/apps-script.js'
import { HEADERS, importWorkbook, MONTHLY_BILLING_COLUMNS, parseNumber } from '../src/lib/workbook.js'
import { applyFinalizedPaBalances, summarizePublicDashboard } from '../src/lib/publicDashboard.js'
import { findProgramRecordForRabGroup } from '../src/lib/rabReferences.js'
import { calculateRabTotalsByProgramRecord } from '../src/lib/rabTotals.js'
import { accumulateProjectedBilling, getBillingForDate, getPlannedBilling } from '../src/lib/contractBilling.js'

test('accumulates each new monthly projection with the existing total', () => {
  assert.equal(accumulateProjectedBilling(900000, 500000), 1400000)
  assert.equal(accumulateProjectedBilling(900000, ''), 900000)
  assert.equal(accumulateProjectedBilling('', 500000), 500000)
})

test('gets realization date and amount from the contract billing month', () => {
  const record = {
    plannedBilling: '2026-10-12',
    billingOctober: 10000000,
    billingNovember: 10000000,
  }
  assert.deepEqual(getPlannedBilling(record), { date: '2026-10-12', amount: 10000000 })
  assert.deepEqual(getBillingForDate(record, '2026-10-29'), { date: '2026-10-29', amount: 10000000 })
  assert.deepEqual(getBillingForDate(record, '2026-11-05'), { date: '2026-11-05', amount: 10000000 })
})

test('finds the source budget row by normalized PRK or fixed PRK reference', () => {
  const sourceRecord = { id: 'budget-1', prk: 'OTHER-PRK', prkFix: 'MRN-62.SAR-01', rabTotal: 5000 }
  const group = { prk: 'MRN 62 SAR 01', records: [{ programRecordId: '' }] }

  assert.equal(findProgramRecordForRabGroup([sourceRecord], group), sourceRecord)
})

test('uses the saved budget-row link when the RAB PRK label has changed', () => {
  const sourceRecord = { id: 'budget-1', prk: 'LAN-62.SAR-01', rabTotal: 5000 }
  const group = { prk: 'MRN-62.SAR-01', sourcePrk: 'LAN-62.SAR-01', records: [{ programRecordId: 'budget-1' }] }

  assert.equal(findProgramRecordForRabGroup([sourceRecord], group), sourceRecord)
})

test('resolves a legacy RAB group through its corrected source PRK', () => {
  const sourceRecord = { id: 'budget-1', prk: 'LAN-62.SAR-01', rabTotal: 5000 }
  const group = { prk: 'MRN-62.SAR-01', sourcePrk: 'LAN-62.SAR-01', records: [] }

  assert.equal(findProgramRecordForRabGroup([sourceRecord], group), sourceRecord)
})

test('rejects an old linked record when its PRK does not match the activity PRK', () => {
  const oldRecord = { id: 'old-row', prk: 'MRN-62.SAR-01', description: 'Kegiatan lama' }
  const matchingRecord = { id: 'new-row', prk: 'LAN-62.SAR-01', description: 'Kegiatan penyambungan' }
  const group = {
    prk: 'MRN-62.SAR-01',
    sourcePrk: 'LAN-62.SAR-01',
    workPackage: 'Kegiatan penyambungan',
    records: [{ programRecordId: 'old-row' }],
  }

  assert.equal(findProgramRecordForRabGroup([oldRecord, matchingRecord], group), matchingRecord)
})

test('uses activity name to disambiguate records sharing a PRK', () => {
  const otherRecord = { id: 'other-row', prk: 'PRK-01', description: 'Kegiatan lain' }
  const matchingRecord = { id: 'matching-row', prk: 'PRK-01', description: 'Penyambungan pelanggan' }
  const group = { prk: 'PRK-01', workPackage: 'Penyambungan pelanggan', records: [] }

  assert.equal(findProgramRecordForRabGroup([otherRecord, matchingRecord], group), matchingRecord)
})

test('matches the exact RABData activity description when the PRK is stored only in the activity catalog', () => {
  const prkOnlyRow = { id: 'prk-row', prk: 'MRN-62.SAR-PENYAMBUNGAN PELANGGAN TM BARA', description: 'MRN-62.SAR-PENYAMBUNGAN PELANGGAN TM BARA', rabTotal: 0 }
  const activityRow = { id: 'activity-row', prk: '', description: 'Pengadaan dan Pemasangan Joint Terminasi MVTC Program Pemasaran UP3 Bali Utara Tahun 2026', rabTotal: 0 }
  const group = {
    prk: 'MRN-62.SAR-PENYAMBUNGAN PELANGGAN TM BARA',
    workPackage: 'Pengadaan dan Pemasangan Joint Terminasi MVTC Program Pemasaran UP3 Bali Utara Tahun 2026',
    records: [],
  }

  assert.equal(findProgramRecordForRabGroup([prkOnlyRow, activityRow], group), activityRow)
})

test('synchronizes the saved Input RAB total including VAT to the matching RABData row', () => {
  const prk = 'LAN-62.SAR-PENYAMBUNGAN BARU TEGANGAN RENDAH (TR) BARA'
  const source = {
    id: 'budget-row',
    prk,
    description: 'Kegiatan Penyambungan Baru',
    rabTotal: 0,
    paTotal: 297801882,
  }
  const component = {
    id: 'rab-line',
    prk,
    workPackage: 'Kegiatan Penyambungan Baru',
    activity: 'Material Sambungan',
    rabTitle: 'Paket A',
    rabNumber: 'RAB-1',
    materialId: 'material-1',
    totalPart: 8030722,
  }
  const catalog = [{
    prk,
    name: 'Material Sambungan',
    workPackage: 'Kegiatan Penyambungan Baru',
  }]

  const totals = calculateRabTotalsByProgramRecord(
    [source],
    [],
    [component],
    catalog,
    [],
  )

  assert.equal(totals.get(source.id), 8914101)
  const afterTransfer = calculateRabTotalsByProgramRecord(
    [source],
    [],
    [component],
    catalog,
    [{
      recordId: source.id,
      amount: 8914101,
      notes: `FINALIZED_RAB_GROUP::${prk}::kegiatan penyambungan baru::paket a::rab-1`,
    }],
  )
  assert.equal(afterTransfer.get(source.id), 0)
})

test('does not calculate column M from standalone legacy recap rows without Input RAB', () => {
  const prk = 'LAN-62.SAR-PENYAMBUNGAN BARU TEGANGAN RENDAH (TR) BARA'
  const source = { id: 'budget-row', prk, description: 'Kegiatan Penyambungan Baru', rabTotal: 0 }
  const legacyRecap = {
    id: 'legacy-recap-line',
    prk,
    workPackage: 'Kegiatan Penyambungan Baru',
    componentName: 'Material Sambungan',
    rabTitle: 'Paket A',
    rabNumber: 'RAB-1',
    total: 8030722,
  }
  const catalog = [{
    prk,
    name: 'Material Sambungan',
    workPackage: 'Kegiatan Penyambungan Baru',
  }]
  const totals = calculateRabTotalsByProgramRecord([source], [legacyRecap], [], catalog, [])

  assert.equal(totals.get(source.id), 0)
})

test('uses saved Input RAB components instead of stale recap rows', () => {
  const prk = 'LAN-62.SAR-PENYAMBUNGAN BARU TEGANGAN RENDAH (TR) BARA'
  const source = { id: 'budget-row', prk, description: 'Kegiatan Penyambungan Baru', rabTotal: 0 }
  const component = {
    id: 'component-line',
    prk,
    workPackage: 'Kegiatan Penyambungan Baru',
    activity: 'Material Sambungan',
    rabTitle: 'Paket A',
    rabNumber: 'RAB-1',
    totalPart: 8030722,
  }
  const catalog = [{
    prk,
    name: 'Material Sambungan',
    workPackage: 'Kegiatan Penyambungan Baru',
  }]

  const staleRecap = {
    id: 'stale-recap-line',
    prk,
    workPackage: 'Kegiatan Penyambungan Baru',
    componentName: 'Material Sambungan',
    rabTitle: 'Paket A',
    rabNumber: 'RAB-1',
    materialId: 'material-1',
    total: 100,
  }
  const totals = calculateRabTotalsByProgramRecord(
    [source],
    [staleRecap],
    [component],
    catalog,
    [],
    [],
    [],
  )

  assert.equal(totals.get(source.id), 8914101)
})

test('does not guess when multiple source budget rows match the PRK', () => {
  const records = [
    { id: 'budget-1', prk: 'PRK-01', program: 'Program A', year: '2025' },
    { id: 'budget-2', prk: 'PRK 01', program: 'Program B', year: '2026' },
  ]

  assert.equal(findProgramRecordForRabGroup(records, { prk: 'PRK.01', records: [] }), null)
})

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

test('adds monthly billing columns after RENCANA TAGIH and maps scheduled values to their month', async () => {
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  const context = {}
  vm.runInNewContext(script, context)

  class MockSheet {
    constructor(values) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getMaxRows() { return 1000 }
    insertColumnsAfter(position, count) {
      this.values.forEach((row) => row.splice(position, 0, ...Array(count).fill('')))
    }
    getRange(row, column) {
      return {
        setNumberFormat: (format) => { this.lastNumberFormat = { row, column, format }; return this },
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => {
            this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value
          })
        }),
      }
    }
  }

  const monthlyHeaders = MONTHLY_BILLING_COLUMNS.map(([header]) => header)
  const legacyHeaders = HEADERS.filter((header) => !monthlyHeaders.includes(header))
  legacyHeaders.splice(legacyHeaders.indexOf('TANGGAL AWAL'), 0, 'RECORD ID')
  const october = Array(legacyHeaders.length).fill('')
  october[legacyHeaders.indexOf('RENCANA TAGIH')] = '2026-10-12'
  october[legacyHeaders.indexOf('PROYEKSI TAGIH')] = 999000
  const november = Array(legacyHeaders.length).fill('')
  november[legacyHeaders.indexOf('RENCANA TAGIH')] = '2026-11-05'
  november[legacyHeaders.indexOf('PROYEKSI TAGIH')] = 888000
  const sheet = new MockSheet([legacyHeaders, october, november])

  context.ensureDataHeaders_(sheet)
  const headers = sheet.values[0]
  const plannedBillingIndex = headers.indexOf('RENCANA TAGIH')
  assert.deepEqual(
    headers.slice(plannedBillingIndex + 1, plannedBillingIndex + 1 + monthlyHeaders.length),
    monthlyHeaders,
  )
  assert.equal(headers[plannedBillingIndex + monthlyHeaders.length + 1], 'PROGRESS')
  assert.equal(sheet.lastNumberFormat.column, plannedBillingIndex + 2)
  assert.equal(sheet.lastNumberFormat.format, '#,##0')

  const workbookHeaders = HEADERS
  const workbookPlannedBillingIndex = workbookHeaders.indexOf('RENCANA TAGIH')
  assert.deepEqual(
    workbookHeaders.slice(workbookPlannedBillingIndex + 1, workbookPlannedBillingIndex + 1 + monthlyHeaders.length),
    monthlyHeaders,
  )
  assert.equal(context.monthlyBillingValues_({
    plannedBilling: '2026-10-12', billingAmount: 125000, projectedBilling: 999000,
  }).billingOctober, 125000)
  assert.equal(context.monthlyBillingValues_({
    plannedBilling: '2026-11-05', billingAmount: 250000, projectedBilling: 888000,
  }).billingNovember, 250000)
  const novemberValues = context.monthlyBillingValues_({
    plannedBilling: '2026-11-05',
    billingAmount: 5000000,
    billingOctober: 10000000,
  })
  assert.equal(novemberValues.billingOctober, 10000000)
  assert.equal(novemberValues.billingNovember, 5000000)
  assert.equal(context.sumMonthlyBilling_(novemberValues), 15000000)

  const clientRecord = context.toClientRecord_({
    'RECORD ID': 'contract-1',
    'NILAI KONTRAK': 20000000,
    'TAGIHAN OKTOBER': 10000000,
    'TAGIHAN NOPEMBER': 5000000,
    'TOTAL AKHIR': 30000000,
    'TOTAL RAB': 20000000,
  })
  assert.equal(clientRecord.id, 'contract-1')
  assert.equal(clientRecord.billingOctober, 10000000)
  assert.equal(clientRecord.billingNovember, 5000000)
})

test('preserves monthly invoices, sums billing, and keeps projection independent', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getMaxRows() { return 1000 }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return {
        setNumberFormat: () => this,
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => {
            this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value
          })
        }),
      }
    }
  }

  const dataHeaders = [...HEADERS]
  dataHeaders.splice(dataHeaders.indexOf('TANGGAL AWAL'), 0, 'RECORD ID')
  const dataSheet = new MockSheet([dataHeaders])
  const spreadsheet = {
    getSheetByName: (name) => name === 'RABData' ? dataSheet : null,
    insertSheet: () => dataSheet,
  }
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', role: 'admin' } })
  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text)
  const save = (record) => post({ action: 'save', records: [record] })
  const record = {
    id: 'billing-row',
    prk: 'PRK-1',
    paid: 3000000,
    plannedBilling: '2026-10-12',
    billingAmount: 10000000,
    projectedBilling: 900000,
  }

  assert.equal(save(record).ok, true)
  const novemberRecord = {
    ...record,
    plannedBilling: '2026-11-05',
    billingAmount: 5000000,
  }
  assert.equal(save(novemberRecord).ok, true)

  const row = dataSheet.values[1]
  assert.equal(row[dataHeaders.indexOf('TAGIHAN OKTOBER')], 10000000)
  assert.equal(row[dataHeaders.indexOf('TAGIHAN NOPEMBER')], 5000000)
  assert.equal(row[dataHeaders.indexOf('TAGIHAN')], 15000000)
  assert.equal(row[dataHeaders.indexOf('PROYEKSI TAGIH')], 900000)
  assert.equal(row[dataHeaders.indexOf('TOTAL BAYAR')], 3000000)
})

test('imports activity PRKs using their column headers rather than fixed positions', async () => {
  const workbook = new ExcelJS.Workbook()
  const budgetSheet = workbook.addWorksheet('DATA ANGGARAN INVESTASI')
  budgetSheet.addRow(['NO.PRK', 'URAIAN', 'TOTAL RAB', 'NILAI KONTRAK'])
  budgetSheet.addRow(['LAN-62.SAR-PENYAMBUNGAN BARU TEGANGAN RENDAH (TR) BARA', 'Paket A', 1000, 0])
  const activitySheet = workbook.addWorksheet('DATABASE KEGIATAN')
  activitySheet.addRow(['PRK', 'SATUAN', 'KOMPONEN PEKERJAAN', 'KEGIATAN'])
  activitySheet.addRow(['LAN-62.SAR-PENYAMBUNGAN BARU TEGANGAN RENDAH (TR) BARA', 'unit', 'Pekerjaan sambungan baru', 'Penyambungan pelanggan'])
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await importWorkbook({
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })

  assert.equal(result.activityCatalog[0].prk, 'LAN-62.SAR-PENYAMBUNGAN BARU TEGANGAN RENDAH (TR) BARA')
  assert.equal(result.activityCatalog[0].workPackage, 'Penyambungan pelanggan')
  assert.equal(result.activityCatalog[0].name, 'Pekerjaan sambungan baru')
  assert.equal(result.activityCatalog[0].unit, 'unit')
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

test('calculates remaining PRK from total final, RAB, and PA when importing', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DATA ANGGARAN INVESTASI')
  sheet.addRow(['NO.PRK', 'URAIAN', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA', 'SISA PRK', 'NILAI KONTRAK'])
  sheet.addRow(['PRK-1', 'Paket A', 1000, 300, 200, 9999, 0])
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await importWorkbook({
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })

  assert.equal(result.records[0].prkRemaining, 500)
})

test('imports schedule columns AA-AG and keeps blank AI totals empty', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DATA ANGGARAN INVESTASI')
  sheet.addRow([
    'NO.PRK', 'URAIAN', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'TAGIHAN', 'TOTAL BAYAR',
    'KETERANGAN', 'TANGGAL AWAL', 'TANGGAL AKHIR', 'RENCANA KONTRAK', 'RENCANA TAGIH', 'PROGRESS', 'PROYEKSI TAGIH', 'TANGGAL BAYAR',
  ])
  sheet.addRow([
    'PRK-1', 'Paket A', 1000, 100, 200, 600, 150, 50, 'MURNI',
    new Date(2026, 0, 15), new Date(2026, 5, 30), new Date(2026, 6, 20), new Date(2026, 7, 15), 'BELUM LUNAS', 500, new Date(2026, 6, 1),
  ])
  sheet.addRow(['PRK-1', 'Detail paket', '', 0, 0, 0, 0, 0, 'MURNI'])
  for (const address of ['J2', 'K2', 'L2', 'M2', 'P2']) sheet.getCell(address).numFmt = 'dd/mm/yyyy'
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await importWorkbook({
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })

  assert.equal(result.records[0].startDate, '2026-01-15')
  assert.equal(result.records[0].endDate, '2026-06-30')
  assert.equal(result.records[0].plannedContract, '2026-07-20')
  assert.equal(result.records[0].plannedBilling, '2026-08-15')
  assert.equal(result.records[0].progress, 'BELUM LUNAS')
  assert.equal(result.records[0].projectedBilling, 500)
  assert.equal(result.records[0].paymentDate, '2026-07-01')
  assert.equal(result.records[1].totalFinal, '')
})

test('summarizes public dashboard totals and percentages per investment category', () => {
  const summary = summarizePublicDashboard([
    { prk: 'PRK-1', totalFinal: 1000, rabTotal: 100, paTotal: 300, contractValue: 200, billed: 100, paid: 50, prkRemaining: 600, notes: 'MURNI' },
    { prk: 'PRK-2', totalFinal: 3000, rabTotal: 200, paTotal: 500, contractValue: 1000, billed: 400, paid: 200, prkRemaining: 2300, notes: 'LANJUTAN' },
    { totalFinal: '', totalPrk: 50000, rabTotal: 50000, notes: 'MURNI' },
  ])

  assert.deepEqual(summary.totals, {
    count: 2, ai: 4000, rab: 300, pa: 800, contract: 1200, billed: 500, paid: 250, remainingPrk: 2900, projectedBilling: 0,
  })
  assert.equal(summary.categories.murni.ai, 1000)
  assert.equal(summary.categories.lanjutan.ai, 3000)
  assert.equal(summary.percentages.ai.murni, 25)
  assert.equal(summary.percentages.categories.lanjutan.pa, 500 / 3000 * 100)
  assert.equal(summary.percentages.totals.billed, 500 / 1200 * 100)
  assert.equal(summary.percentages.categories.murni.paid, 50 / 200 * 100)
})

test('calculates remaining PRK only for rows with a PRK number', () => {
  const records = [
    { id: 'prk-row', prk: 'PRK-1', totalFinal: 1500, rabTotal: 500, paTotal: 200, prkRemaining: 800 },
    { id: 'rab-detail', rabNumber: 'RAB-1', totalFinal: 500, rabTotal: 250, paTotal: 100, prkRemaining: 150 },
  ]
  const updated = applyFinalizedPaBalances(records, [
    { recordId: 'prk-row', paAfter: 300 },
    { recordId: 'rab-detail', paAfter: 150 },
  ])
  const summary = summarizePublicDashboard(updated)

  assert.equal(updated[0].prkRemaining, 700)
  assert.equal(updated[1].prkRemaining, '')
  assert.equal(summary.totals.remainingPrk, 700)
})

test('includes finalized PA when total final is blank', () => {
  const summary = summarizePublicDashboard([
    { totalFinal: '', rabTotal: 0, paTotal: 450, paFinalized: true, notes: 'MURNI' },
  ])

  assert.equal(summary.totals.count, 1)
  assert.equal(summary.totals.ai, 0)
  assert.equal(summary.totals.pa, 450)
  assert.equal(summary.categories.murni.pa, 450)
})

test('restores blank PA totals from finalized transfer history', () => {
  const records = [
    { id: 'record-1', paTotal: 0, totalFinal: 1000, notes: 'MURNI' },
    { id: 'record-2', legacyId: 'old-row-2', paTotal: 250 },
    { id: 'record-3', rabNumber: 'RAB-42', paTotal: 0, totalFinal: 500, notes: 'LANJUTAN' },
  ]
  const transfers = [
    { recordId: 'record-1', paAfter: 300 },
    { recordId: 'record-1', paAfter: 100 },
    { recordId: 'old-row-2', paAfter: 200 },
    { recordId: 'old-row-id', rabNumber: '  rab-42 ', paAfter: 450 },
  ]
  const restored = applyFinalizedPaBalances(records, transfers)

  assert.equal(restored[0].paTotal, 300)
  assert.equal(restored[1].paTotal, 250)
  assert.equal(restored[2].paTotal, 450)
  assert.equal(summarizePublicDashboard(restored).totals.pa, 1000)
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

    getMaxRows() { return 1000 }

    clearContents() {
      this.values = []
    }

    getRange(row, column) {
      return {
        setNumberFormat: () => { this.numberFormatColumn = column; return this },
        setValue: (value) => { this.values[row - 1][column - 1] = value },
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => { this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value })
        }),
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

  const headers = ['NO.PRK', 'NO.RAB', 'URAIAN', 'TOTAL AKHIR', 'TOTAL RAB', 'TOTAL PA', 'NOKONTRAK', 'VENDOR', 'NILAI KONTRAK', 'SISA PRK', 'RECORD ID', 'PROGRAM', 'TAHUN ANGGARAN', 'KETERANGAN', 'TANGGAL AWAL', 'TANGGAL AKHIR']
  const dataSheet = new MockSheet([headers, ['PRK-1', 'RAB-42', 'Paket A', 1500, 1000, 200, '', '', 200, 300, '', 'SAR', 2026, 'MURNI', '', '']])
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

  const result = post({ action: 'transferToPA', recordId: 'row-2', amount: 300, date: '2026-09-26' })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.record.id, 'row-2')
  assert.equal(result.record.rabTotal, 700)
  assert.equal(result.record.paTotal, 500)
  assert.equal(result.record.contractValue, 500)
  assert.equal(result.record.prkRemaining, 300)
  assert.equal(result.transfer.contractValue, 500)
  assert.equal(dataValue('NILAI KONTRAK'), 500)
  assert.equal(dataValue('SISA PRK'), 300)
  assert.equal(dataValue('RECORD ID'), 'row-2')
  const paColumn = headers.indexOf('TOTAL PA')
  const paguColumn = headers.indexOf('TOTAL AKHIR')
  const rabColumn = headers.indexOf('TOTAL RAB')
  const recordIdColumn = headers.indexOf('RECORD ID')
  const prkColumn = headers.indexOf('NO.PRK')
  dataSheet.values[1][paColumn] = 0
  dataSheet.values[1][paguColumn] = ''
  dataSheet.values[1][rabColumn] = 0
  dataSheet.values[1][recordIdColumn] = 'stale-row-id'
  dataSheet.values[1][prkColumn] = ''
  const publicSummary = context.publicDashboard_()
  assert.equal(publicSummary.rows.length, 1)
  assert.equal(publicSummary.rows[0].rabNumber, 'RAB-42')
  assert.equal(publicSummary.rows[0].paTotal, 500)
  assert.equal(publicSummary.rows[0].paFinalized, true)
  assert.equal(publicSummary.rows[0].prkRemaining, '')
  assert.equal(publicSummary.groups[0].pa, 500)
  assert.equal(publicSummary.groups[0].remainingPrk, 0)
  context.syncPrkRemainingColumn_(dataSheet)
  assert.equal(dataSheet.values[1][headers.indexOf('SISA PRK')], '')
  dataSheet.values[1][paColumn] = 500
  dataSheet.values[1][paguColumn] = 1500
  dataSheet.values[1][rabColumn] = 700
  dataSheet.values[1][recordIdColumn] = 'row-2'
  dataSheet.values[1][prkColumn] = 'PRK-1'
  dataSheet.values[1][headers.indexOf('SISA PRK')] = 300
  const transferHeaders = sheets.PA_TRANSFERS.values[0]
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)
  assert.equal(transferHeaders.includes('DATA_JSON'), false)
  assert.equal(sheets.PA_TRANSFERS.values[1][transferHeaders.indexOf('Nilai Dialihkan (Rp)')], 300)

  const rejected = post({ action: 'transferToPA', recordId: 'row-2', amount: 701 })
  assert.equal(rejected.ok, false)
  assert.equal(dataValue('TOTAL RAB'), 700)
  assert.equal(dataValue('TOTAL PA'), 500)
  assert.equal(dataValue('SISA PRK'), 300)
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)

  const saved = post({ action: 'save', records: [result.record] })
  assert.equal(saved.ok, true)
  const loaded = JSON.parse(context.doGet({ parameter: { action: 'load' } }).text)
  assert.equal(loaded.records[0].id, 'row-2')

  const later = post({ action: 'transferToPA', recordId: 'row-2', amount: 100 })
  assert.equal(later.ok, true, later.error)
  assert.equal(dataValue('TOTAL RAB'), 600)
  assert.equal(dataValue('TOTAL PA'), 600)
  assert.equal(dataValue('NILAI KONTRAK'), 600)
  assert.equal(dataValue('SISA PRK'), 300)

  const blocked = post({ action: 'cancelTransferToPA', transferId: result.transfer.id })
  assert.equal(blocked.ok, false)
  assert.equal(dataValue('TOTAL RAB'), 600)
  assert.equal(sheets.PA_TRANSFERS.values.length, 3)

  const canceledLater = post({ action: 'cancelTransferToPA', transferId: later.transfer.id })
  assert.equal(canceledLater.ok, true, canceledLater.error)
  assert.equal(canceledLater.record.rabTotal, 700)
  assert.equal(canceledLater.record.paTotal, 500)
  assert.equal(canceledLater.record.contractValue, 500)
  assert.equal(canceledLater.record.prkRemaining, 300)
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)

  const canceledFirst = post({ action: 'cancelTransferToPA', transferId: result.transfer.id })
  assert.equal(canceledFirst.ok, true, canceledFirst.error)
  assert.equal(canceledFirst.record.rabTotal, 1000)
  assert.equal(canceledFirst.record.paTotal, 200)
  assert.equal(canceledFirst.record.contractValue, 200)
  assert.equal(dataValue('TOTAL RAB'), 1000)
  assert.equal(dataValue('TOTAL PA'), 200)
  assert.equal(dataValue('NILAI KONTRAK'), 200)
  assert.equal(dataValue('SISA PRK'), 300)
  assert.equal(sheets.PA_TRANSFERS.values.length, 1)

  const contractPreservingTransfer = post({
    action: 'transferToPA', recordId: 'row-2', amount: 100, preserveContractValue: true,
    notes: 'FINALIZED_RAB_GROUP::test-group',
  })
  assert.equal(contractPreservingTransfer.ok, true, contractPreservingTransfer.error)
  assert.equal(contractPreservingTransfer.record.rabTotal, 900)
  assert.equal(contractPreservingTransfer.record.paTotal, 300)
  assert.equal(contractPreservingTransfer.record.contractValue, 200)
  assert.equal(dataValue('NILAI KONTRAK'), 200)
  const canceledContractTransfer = post({ action: 'cancelTransferToPA', transferId: contractPreservingTransfer.transfer.id })
  assert.equal(canceledContractTransfer.ok, true, canceledContractTransfer.error)
  assert.equal(canceledContractTransfer.record.rabTotal, 1000)
  assert.equal(canceledContractTransfer.record.paTotal, 200)
  assert.equal(canceledContractTransfer.record.contractValue, 200)

  const finalizableTransfer = post({
    action: 'transferToPA', recordId: 'row-2', amount: 100, preserveContractValue: true,
    notes: 'FINALIZED_RAB_GROUP::contract-guard-test',
  })
  assert.equal(finalizableTransfer.ok, true, finalizableTransfer.error)
  dataSheet.values[1][headers.indexOf('NOKONTRAK')] = 'KONTRAK-2026-01'
  dataSheet.values[1][headers.indexOf('VENDOR')] = 'Vendor Test'
  dataSheet.values[1][headers.indexOf('TANGGAL AWAL')] = '2026-10-25'
  const blockedAfterContractEntry = post({ action: 'cancelTransferToPA', transferId: finalizableTransfer.transfer.id })
  assert.equal(blockedAfterContractEntry.ok, false)
  assert.match(blockedAfterContractEntry.error, /Data kontrak sudah diisi/)
  assert.equal(sheets.PA_TRANSFERS.values.length, 2)
})

test('preserves physical row IDs when loading data around blank sheet rows', async () => {
  class MockSheet {
    constructor(values) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getMaxRows() { return 1000 }
    getRange(row, column) {
      return {
        setNumberFormat: () => this,
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => { this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value })
        }),
      }
    }
  }

  const headers = ['NO.PRK', 'NO.RAB', 'URAIAN', 'RECORD ID']
  const blankRow = Array(headers.length).fill('')
  const dataSheet = new MockSheet([
    headers,
    ['PRK-1', 'RAB-1', 'Paket A', ''],
    blankRow,
    ['PRK-2', 'RAB-2', 'Paket B', ''],
  ])
  const spreadsheet = { getSheetByName: () => dataSheet }
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  }
  const script = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
  vm.runInNewContext(script, context)
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', role: 'admin' } })
  context.syncPrkRemainingColumn_ = () => {}

  const response = JSON.parse(context.doGet({ parameter: { action: 'load', token: 'test' } }).text)
  assert.deepEqual(response.records.map(({ id }) => id), ['row-2', 'row-4'])
})

test('syncs realization billing and payment totals to matching RABData rows', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    getMaxRows() { return 1000 }
    insertColumnsAfter(position, count) {
      this.values.forEach((row) => row.splice(position, 0, ...Array(count).fill('')))
    }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return {
        setNumberFormat: () => this,
        setValue: (value) => {
          this.values[row - 1] ??= []
          this.values[row - 1][column - 1] = value
        },
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => { this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value })
        }),
      }
    }
  }

  const dataHeaders = ['NO.PRK', 'NO.RAB', 'URAIAN', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'TAGIHAN', 'TOTAL BAYAR', 'PROGRESS', 'TANGGAL BAYAR', 'RECORD ID']
  const dataSheet = new MockSheet([dataHeaders, ['PRK-1', 'RAB-1', 'Paket A', 1000, 0, 500, 50, 25, '', '', 'record-1']])
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
  const realization = (id, date, billed, paid, paymentStatus, programRecordId = '', paymentDate = '') => ({
    id, activityId: programRecordId ? 'input-rab:activity-1' : 'activity-1', programRecordId, date, billed, paid, paymentStatus, paymentDate,
  })

  const saved = post({ action: 'saveWorkflow', collection: 'realizations', records: [
    realization('real-1', '2026-09-27', 100, 40, 'BELUM LUNAS', '', '2026-10-01'),
    realization('real-2', '2026-09-28', 200, 80, 'LUNAS', 'record-1', '2026-10-03'),
  ] })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TAGIHAN')], 300)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TOTAL BAYAR')], 120)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('PROGRESS')], 'LUNAS')
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TANGGAL BAYAR')], '2026-10-03')
  assert.equal(saved.updatedRecords[0].billed, 300)
  assert.equal(saved.updatedRecords[0].paid, 120)
  assert.equal(saved.updatedRecords[0].progress, 'LUNAS')
  assert.equal(saved.updatedRecords[0].paymentDate, '2026-10-03')

  const edited = post({ action: 'saveWorkflow', collection: 'realizations', records: [
    realization('real-2', '2026-09-28', 250, 100, 'BELUM LUNAS', 'record-1', '2026-10-04'),
  ] })
  assert.equal(edited.ok, true, edited.error)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TAGIHAN')], 250)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TOTAL BAYAR')], 100)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('PROGRESS')], 'BELUM LUNAS')
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TANGGAL BAYAR')], '2026-10-04')

  const deleted = post({ action: 'saveWorkflow', collection: 'realizations', records: [] })
  assert.equal(deleted.ok, true, deleted.error)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TAGIHAN')], 0)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TOTAL BAYAR')], 0)
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('PROGRESS')], '')
  assert.equal(dataSheet.values[1][dataHeaders.indexOf('TANGGAL BAYAR')], '')
})

test('loads and migrates workflow JSON into named columns without losing records', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    getMaxRows() { return 1000 }
    clearContents() { this.values = [] }
    getRange(row) {
      return { setValues: (rows) => rows.forEach((values, index) => { this.values[row - 1 + index] = values }) }
    }
  }

  const component = { id: 'component-1', activity: 'Pembangunan jaringan', workPackage: 'Paket distribusi', prk: 'PRK-1', programRecordId: 'record-1', name: 'Kabel', operation: 'Pasang', source: 'MDU', quantityPerUnit: 2, unit: 'm', materialPrice: 1000 }
  const activity = { id: 'activity-1', prk: 'PRK-1', name: 'Pembangunan jaringan', componentName: 'Pembangunan jaringan', workPackage: 'Paket distribusi', materialId: 'material-1', materialName: 'Kabel', source: 'MDU', quantityPerUnit: 1.5, volume: 3, materialPrice: 1000, servicePrice: 250, total: 5625 }
  const transfer = { id: 'transfer-1', recordId: 'prk-1', amount: 250, rabBefore: 1000, rabAfter: 750, paBefore: 0, paAfter: 250, contractValue: 250 }
  const sheets = {
    RAB_KOMPONEN: new MockSheet([['ID', 'DATA_JSON', 'UPDATED_AT'], ['component-1', JSON.stringify(component), '2026-09-27']]),
    RAB_KEGIATAN: new MockSheet([['ID', 'DATA_JSON', 'UPDATED_AT'], ['activity-1', JSON.stringify(activity), '2026-09-27']]),
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
  const activityHeaders = sheets.RAB_KEGIATAN.values[0]
  const transferHeaders = sheets.PA_TRANSFERS.values[0]

  assert.equal(result.collections.components[0].quantityPerUnit, 2)
  assert.equal(result.collections.components[0].prk, 'PRK-1')
  assert.equal(result.collections.components[0].workPackage, 'Paket distribusi')
  assert.equal(result.collections.activities[0].source, 'MDU')
  assert.equal(result.collections.activities[0].quantityPerUnit, 1.5)
  assert.equal(result.collections.paTransfers[0].amount, 250)
  assert.equal(componentHeaders.includes('DATA_JSON'), false)
  assert.equal(sheets.RAB_KOMPONEN.values[1][componentHeaders.indexOf('No. PRK')], 'PRK-1')
  assert.equal(sheets.RAB_KOMPONEN.values[1][componentHeaders.indexOf('Paket Kegiatan')], 'Paket distribusi')
  assert.equal(sheets.RAB_KOMPONEN.values[1][componentHeaders.indexOf('Volume per Satuan')], 2)
  assert.equal(sheets.RAB_KOMPONEN.values[1][componentHeaders.indexOf('Keterangan')], 'Pasang')
  assert.equal(sheets.RAB_KOMPONEN.values[1][componentHeaders.indexOf('Jenis Material')], 'MDU')
  assert.equal(activityHeaders.includes('DATA_JSON'), false)
  assert.equal(result.collections.activities[0].workPackage, 'Paket distribusi')
  assert.equal(sheets.RAB_KEGIATAN.values[1][activityHeaders.indexOf('Jenis Material')], 'MDU')
  assert.equal(sheets.RAB_KEGIATAN.values[1][activityHeaders.indexOf('Kuantitas per Satuan')], 1.5)
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
  materialSheet.addRow(['HARGA JASA', 'KRITERIA', 'URAIAN', 'MDU/NON MDU', 'SAT', 'HARGA MATERIAL', 'KOMPONEN PEKERJAAN', 'KETERANGAN'])
  materialSheet.addRow([254.649, 'TM', 'Material A', 'NON MDU', 'set', '1,344,478', 'Pemasangan SUTM', 'Pasang'])
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
    operation: result.materials[0].operation,
  }, {
    name: 'Material A',
    unit: 'set',
    materialPrice: 1344478,
    servicePrice: 254649,
    componentActivity: 'Pemasangan SUTM',
    operation: 'Pasang',
  })
  assert.equal(parseNumber('1.344.478'), 1344478)
  assert.equal(parseNumber('1,25'), 1.25)
})

test('bootstraps admin, exposes only aggregate public data, and blocks viewer writes', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    getMaxRows() { return 1000 }
    insertColumnsAfter(position, count) {
      this.values.forEach((row) => row.splice(position, 0, ...Array(count).fill('')))
    }
    clearContents() { this.values = [] }
    getRange(row, column, numRows = 1, numColumns = 1) {
      const range = {
        setNumberFormat: () => range,
        getValue: () => this.values[row - 1]?.[column - 1] ?? '',
        getValues: () => Array.from({ length: numRows }, (_, rowIndex) =>
          Array.from({ length: numColumns }, (_, columnIndex) => this.values[row - 1 + rowIndex]?.[column - 1 + columnIndex] ?? ''),
        ),
        setValue: (value) => { this.values[row - 1][column - 1] = value },
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => { this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value })
        }),
      }
      range.createTextFinder = (searchText) => {
        let matchEntireCell = false
        return {
          matchEntireCell(value) { matchEntireCell = value; return this },
          findNext: () => {
            for (let rowIndex = row - 1; rowIndex < row - 1 + numRows; rowIndex += 1) {
              for (let columnIndex = column - 1; columnIndex < column - 1 + numColumns; columnIndex += 1) {
                const cell = String(this.values[rowIndex]?.[columnIndex] ?? '')
                if (matchEntireCell ? cell === String(searchText) : cell.includes(String(searchText))) {
                  return { getRow: () => rowIndex + 1 }
                }
              }
            }
            return null
          },
        }
      }
      return range
    }
    appendRow(row) { this.values.push(row) }
    deleteRow(row) { this.values.splice(row - 1, 1) }
  }

  const headers = ['NO.PRK', 'URAIAN', 'TOTAL AKHIR', 'TOTAL PRK', 'TOTAL RAB', 'TOTAL PA', 'NILAI KONTRAK', 'TAGIHAN', 'TOTAL BAYAR', 'SISA PRK', 'PROGRAM', 'TAHUN ANGGARAN', 'KETERANGAN', 'TANGGAL AWAL', 'TANGGAL AKHIR', 'RENCANA KONTRAK', 'RENCANA TAGIH', 'PROGRESS', 'PROYEKSI TAGIH', 'TANGGAL BAYAR', 'RECORD ID']
  const dataSheet = new MockSheet([
    headers,
    ['PRK-SECRET', 'Uraian rahasia', 1000, 1000, 500, 250, 250, 100, 50, 450, 'Program A', 2026, 'MURNI', '2026-01-15', '2026-06-30', 700, 150, 'BELUM LUNAS', 75, '2026-07-01', 'record-1'],
    ['PRK-SECOND', 'Uraian kedua', 2000, 2000, 900, 600, 550, 200, 150, 1100, 'Program B', 2027, 'LANJUTAN', '', '', 0, 0, 'LUNAS', 125, '', 'record-2'],
    ['PRK-DETAIL', 'Detail paket', '', 1000, 1000, 1000, 1000, 1000, 0, 0, 'Program A', 2026, 'MURNI', '', '', 0, 0, 'BELUM LUNAS', 999, '', 'record-detail'],
    ['', 'Baris tanpa PRK', 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 'Program A', 2026, 'MURNI', '', '', 0, 0, 'BELUM LUNAS', 999, '', 'record-no-prk'],
  ])
  const sheets = { RABData: dataSheet }
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => { sheets[name] = new MockSheet(); return sheets[name] },
  }
  const properties = new Map([['ADMIN_SETUP_KEY', 'one-time-setup-secret']])
  const authCache = new Map()
  let uuid = 0
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || '',
      deleteProperty: (key) => properties.delete(key),
    }) },
    CacheService: { getScriptCache: () => ({
      get: (key) => authCache.get(key) || null,
      put: (key, value) => authCache.set(key, value),
      remove: (key) => authCache.delete(key),
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

  assert.equal(context.sha256Hex_('abc'), createHash('sha256').update('abc').digest('hex'))
  assert.equal(context.sha256Hex_('kata sandi 🔐'), createHash('sha256').update('kata sandi 🔐').digest('hex'))
  const testSalt = 'a'.repeat(72)
  const testDigest = createHash('sha256').update('starting digest').digest('hex')
  const saltContext = context.createSha256SaltContext_(testSalt)
  assert.equal(context.sha256HexWithSalt_(testDigest, saltContext), createHash('sha256').update(testDigest + testSalt).digest('hex'))
  assert.equal(context.sha256HexWithSalt_(testDigest, saltContext), createHash('sha256').update(testDigest + testSalt).digest('hex'))
  const uuidSalt = '12345678-1234-1234-1234-123456789012'.repeat(2)
  let expectedPasswordHash = `${uuidSalt}:legacy-password-test`
  for (let index = 0; index < 10000; index += 1) {
    expectedPasswordHash = createHash('sha256').update(expectedPasswordHash, 'utf8').digest('hex') + uuidSalt
  }
  assert.equal(context.hashPassword_('legacy-password-test', uuidSalt), expectedPasswordHash.slice(0, 64))
  const publicResponse = JSON.parse(context.doGet({ parameter: { action: 'publicDashboard' } }).text)
  assert.equal(publicResponse.ok, true)
  assert.equal(publicResponse.summary.groups[0].pagu, 1000)
  assert.equal(publicResponse.summary.groups[0].rab, 500)
  assert.equal(publicResponse.summary.groups[0].contract, 250)
  assert.equal(publicResponse.summary.groups[0].remainingPrk, 250)
  assert.equal(publicResponse.summary.groups[0].paid, 50)
  assert.equal(publicResponse.summary.rows.length, 2)
  assert.equal(publicResponse.summary.groups.find((group) => group.program === 'Program A').pagu, 1000)
  assert.equal(publicResponse.summary.rows[0].prk, 'PRK-SECRET')
  assert.equal(publicResponse.summary.rows[0].projectedBilling, 75)
  assert.equal(publicResponse.summary.rows[0].description, 'Uraian rahasia')
  assert.equal(publicResponse.summary.rows[0].prkRemaining, 250)
  assert.equal(dataSheet.values[1][headers.indexOf('SISA PRK')], 450)
  assert.equal('vendor' in publicResponse.summary.rows[0], false)
  assert.equal('contractNumber' in publicResponse.summary.rows[0], false)
  assert.equal('records' in publicResponse, false)
  assert.equal('prk' in publicResponse.summary.groups[0], false)
  assert.equal('description' in publicResponse.summary.groups[0], false)
  assert.equal(authCache.has('rab-public-dashboard-v1'), true)
  const computePublicDashboard = context.publicDashboard_
  context.publicDashboard_ = () => { throw new Error('Cached dashboard summary should be reused.') }
  const cachedPublicResponse = JSON.parse(context.doGet({ parameter: { action: 'publicDashboard' } }).text)
  assert.equal(cachedPublicResponse.summary.rows.length, publicResponse.summary.rows.length)
  context.publicDashboard_ = computePublicDashboard

  const initialStatus = JSON.parse(context.doGet({ parameter: { action: 'authStatus' } }).text)
  assert.equal(initialStatus.setupRequired, true)
  assert.equal(initialStatus.setupAvailable, true)
  const admin = post({ action: 'bootstrapAdmin', setupKey: 'one-time-setup-secret', username: 'owner', name: 'Admin Utama', password: 'password-admin-123' })
  assert.equal(admin.ok, true, admin.error)
  assert.equal(admin.user.role, 'admin')
  context.authStatus_()
  const readUsers = context.readUsers_
  context.readUsers_ = () => { throw new Error('Login did not use the short-lived auth cache.') }
  assert.equal(context.login_('owner', 'password-admin-123').ok, true)
  context.readUsers_ = readUsers
  let legacyDigest = 'mock-uuid-1mock-uuid-2:password-admin-123'
  for (let index = 0; index < 10000; index += 1) {
    legacyDigest = createHash('sha256').update(legacyDigest, 'utf8').digest('hex') + 'mock-uuid-1mock-uuid-2'
  }
  assert.equal(sheets.USERS.values[1][4], legacyDigest.slice(0, 64))
  assert.equal(properties.has('ADMIN_SETUP_KEY'), false)
  dataSheet.values[1][headers.indexOf('SISA PRK')] = 9999
  const privateData = JSON.parse(context.doGet({ parameter: { action: 'load', token: admin.token } }).text)
  assert.equal(privateData.records[0].prk, 'PRK-SECRET')
  assert.equal(privateData.records[0].prkRemaining, 250)
  assert.equal(privateData.records[0].startDate, '2026-01-15')
  assert.equal(privateData.records[0].plannedContract, 700)
  assert.equal(privateData.records[0].plannedBilling, 150)
  assert.equal(privateData.records[0].progress, 'BELUM LUNAS')
  assert.equal(privateData.records[0].projectedBilling, 75)
  assert.equal(privateData.records[0].paymentDate, '2026-07-01')
  assert.equal(dataSheet.values[1][headers.indexOf('SISA PRK')], 250)

  context.authStatus_()
  assert.equal(authCache.has('rab-auth-users-v1'), true)
  const viewer = post({ action: 'saveUser', token: admin.token, user: { username: 'viewer', name: 'Viewer', role: 'viewer', password: 'password-viewer-123', active: true } })
  assert.equal(viewer.ok, true, viewer.error)
  assert.equal(authCache.has('rab-auth-users-v1'), false)
  const viewerLogin = post({ action: 'login', username: 'viewer', password: 'password-viewer-123' })
  assert.equal(viewerLogin.ok, true, viewerLogin.error)
  const blockedWrite = post({ action: 'save', token: viewerLogin.token, records: [] })
  assert.equal(blockedWrite.ok, false)
  assert.match(blockedWrite.error, /baca/)
  const blockedRead = JSON.parse(context.doGet({ parameter: { action: 'load' } }).text)
  assert.equal(blockedRead.ok, false)
  assert.equal(blockedRead.code, 'AUTH_REQUIRED')

  const loggedOut = post({ action: 'logout', token: admin.token })
  assert.equal(loggedOut.ok, true)
  assert.equal(sheets.SESSIONS.values.some((row) => row[0] === createHash('sha256').update(admin.token).digest('hex')), false)
})

test('saves Monitoring datasets to protected dedicated Google Sheets tabs', async () => {
  class MockSheet {
    constructor(values = []) { this.values = values }
    getDataRange() { return { getValues: () => this.values.map((row) => [...row]) } }
    getLastRow() { return this.values.length }
    getLastColumn() { return Math.max(0, ...this.values.map((row) => row.length)) }
    clearContents() { this.values = [] }
    getRange(row, column) {
      return {
        setValues: (rows) => rows.forEach((values, rowIndex) => {
          this.values[row - 1 + rowIndex] ??= []
          values.forEach((value, columnIndex) => {
            this.values[row - 1 + rowIndex][column - 1 + columnIndex] = value
          })
        }),
      }
    }
  }

  const sheets = {}
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
  context.authorize_ = () => ({ ok: true, user: { id: 'test-admin', role: 'admin' } })
  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text)
  const datasets = {
    vendor: { headers: ['NOMOR KONTRAK', 'STATUS KONTRAK'], rows: [['K-1', 'OPEN']] },
    rabDatabase: { headers: ['ID RAB', 'URAIAN MATERIAL'], rows: [['R-1', '=IMPORTXML("url")']] },
  }
  const saved = post({ action: 'saveMonitoring', datasets })
  assert.equal(saved.ok, true, saved.error)
  assert.deepEqual(saved.sheetNames, ['MON_KONTRAK_VENDOR', 'MON_DATABASE_RAB'])
  assert.equal(sheets.MON_KONTRAK_VENDOR.values[1][0], 'K-1')
  assert.equal(sheets.MON_DATABASE_RAB.values[1][1], '\'=IMPORTXML("url")')

  const loaded = JSON.parse(context.doGet({ parameter: { action: 'loadMonitoring', token: 'test' } }).text)
  assert.equal(loaded.ok, true)
  assert.equal(loaded.datasets.vendor.rows[0][0], 'K-1')
  assert.equal(loaded.datasets.rabDatabase.rows[0][1], '\'=IMPORTXML("url")')

  context.authorize_ = () => ({ ok: true, user: { id: 'test-viewer', role: 'viewer' } })
  const denied = post({ action: 'saveMonitoring', datasets })
  assert.equal(denied.ok, false)
  assert.match(denied.error, /viewer/)
})