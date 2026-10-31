import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { getTibetDisplayRows, importMonitoringWorkbook } from '../src/lib/monitoringWorkbook.js'
import {
  buildTibetDetailRows, buildTibetMetrics, buildTibetProgramChart, buildTibetVendorChart,
  getTibetMetricTotal, normalizeTibetRows,
} from '../src/lib/tibetMonitoring.js'

async function makeWorkbookFile() {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('SPB').addRows([
    ['POS', 'PROGRAM', 'NORMALISASI', 'URAIAN MATERIAL', 'NO SPB', 'VOL SPB', 'VOL DTG', 'VOL BLM DTG', 'PROGRES', 'STATUS SPB'],
    ['61', 'Program A', 'MAT-1', 'Kabel', 'SPB-1', 10, 4, 6, 'Belum datang', 'OPEN'],
  ])
  workbook.addWorksheet('STOCK GUDANG').addRows([
    ['NORMALISASI', 'NAMA BARANG', 'NAMA MATERIAL', 'VOL 61', 'VOL 62', 'VOL GUDANG', 'RATA-RATA PER BULAN', 'RATA-RATA PER TAHUN', 'STATUS', 'KRITERIA MATERIAL'],
    ['MAT-1', 'Kabel', 'Kabel', 1, 2, 3, 1, 12, 'NORMAL', 'TM'],
  ])
  workbook.addWorksheet('BEBAN GI DAN PYL').addRows([
    ['UP3', 'PENYULANG', 'JANUARI', 'BEBAN SIANG', 'BEBAN MALAM'],
    ['UP3 A', 'Penyulang A', 10, 20, 15],
  ])
  workbook.addWorksheet('DATABASE_RAB').addRows([
    ['UPDATED_AT', 'ID RAB', 'PRK', 'NAMA FILE', 'REKAP AKTIF', 'SHEET DETAIL', 'BARIS', 'URAIAN MATERIAL', 'VOLUME', 'JENIS PEKERJAAN', 'HARGA SATUAN'],
    ['2026-01-01', 'RAB-1', 'PRK-1', 'rab.xlsx', 'REKAP JTM', 'JTM', 2, 'Kabel', 5, 'PASANG', 1000],
  ])
  workbook.addWorksheet('MONITORING TIBET').addRows([
    ['POS', 'PROG', 'TAHUN', 'UKURAN', 'PABRIKAN', 'NO KR', 'TGL KR', 'VOL KR', 'NO PK', 'VOL PK', 'SISA KR', 'SDH PSG', 'BLM PSG'],
    ['61', 'SAR', 2026, 9, 'Vendor A', 'KR-1', '', 10, 'PK-1', 8, 2, 3, 5],
    ['61', 'SAR', 2026, 9, 'Vendor A', 'KR-1', '', 10, 'PK-2', 4, 2, 2, 2],
  ])
  const vendorHeaders = Array(29).fill('')
  Object.assign(vendorHeaders, {
    0: 'NOMOR KONTRAK', 1: 'VENDOR', 2: 'NILAI KONTRAK', 3: 'NOMOR PK', 4: 'NAMA PELANGGAN',
    5: 'NILAI PK', 6: 'REALISASI (Rp)', 7: 'SISA KONTRAK', 23: 'Nomor WO', 28: 'STATUS',
  })
  const vendorParent = Array(29).fill('')
  Object.assign(vendorParent, { 0: 'KONTRAK-1', 1: 'Vendor A', 2: 100, 23: 'WO-1', 28: 'OPEN' })
  const vendorDetail = Array(29).fill('')
  Object.assign(vendorDetail, { 3: 'PK-1', 4: 'Pelanggan A', 6: 30 })
  workbook.addWorksheet('MON KONTRAK VENDOR').addRows([vendorHeaders, vendorParent, vendorDetail])
  workbook.addWorksheet('MON KEBUTUHAN PELANGGAN').addRows([
    ['NO', 'NAMA', 'TARIF', 'JENIS PLG', 'DAYA', 'PK', 'PROGRESS', 'NO PK', 'NO KONTRAK', 'ULP', 'KETERANGAN KENDALA', 'TIANG 13'],
    [1, 'Pelanggan A', 'R1', 'TR', 1300, 'PK-1', 'Bayar', 'PK-1', 'KONTRAK-1', 'ULP A', '', 2],
  ])
  workbook.addWorksheet('DATA WO DAN MIMS').addRows([
    ['MIMS', 'WO', 'NO SAP', 'NAMA MATERIAL', 'JUMLAH MATERIAL'],
    ['MIMS-1', 'WO-1', 'SAP-1', 'Material A', 5],
  ])
  const buffer = await workbook.xlsx.writeBuffer()
  return { name: 'monitoring.xlsx', arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }
}

test('imports all Monitoring sheets and preserves workbook cross references', async () => {
  const data = await importMonitoringWorkbook(await makeWorkbookFile())

  assert.equal(Object.keys(data).length, 7)
  assert.equal(data.spb.rows.length, 1)
  assert.deepEqual(data.stock.rows[0].slice(-1), ['SPB-1'])
  assert.equal(data.vendor.rows[0][0], 'KONTRAK-1')
  assert.equal(data.vendor.rows[0][24], 'SAP-1')
  assert.equal(data.vendor.rows[0][25], 'Material A')
  assert.equal(data.vendor.rows[0][28], 'OPEN')
  assert.equal(data.vendor.rows[1][0], '')
  assert.equal(data.vendor.rows[1][28], 'OPEN')
  assert.equal(data.tibet.sheetName, 'MONITORING TIBET')
  assert.equal(data.tibet.rows[1][4], 'Vendor A')
  assert.equal(data.tibet.rows[1][5], 'KR-1')
  assert.equal(data.tibet.rows[1][8], 'PK-2')
  assert.equal(data.customers.rows[0][1], 'Pelanggan A')
})

test('imports only MONITORING TIBET from a single-sheet workbook', async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('MONITORING TIBET').addRows([
    ['POS', 'PROG', 'TAHUN', 'UKURAN', 'PABRIKAN', 'NO KR', 'VOL KR', 'NO PK', 'VOL PK', 'SISA KR', 'SDH PSG', 'BLM PSG'],
    ['62', 'SAR', 2026, 9, 'Vendor A', 'KR-1', 100, 'PK-1', 80, 20, 50, 30],
  ])
  const buffer = await workbook.xlsx.writeBuffer()
  const file = { arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }
  const data = await importMonitoringWorkbook(file, undefined, { moduleId: 'tibet' })

  assert.deepEqual(Object.keys(data), ['tibet'])
  assert.equal(data.tibet.sheetName, 'MONITORING TIBET')
  assert.equal(data.tibet.rows.length, 1)
  await assert.rejects(importMonitoringWorkbook(file, undefined, { moduleId: 'unknown' }), /Menu Monitoring untuk impor tidak dikenal/)
})

test('displays repeated saved Tibet group labels only on the first row', () => {
  const headers = ['VENDOR', 'NOMOR KR', 'JENIS TIBET', 'NO PK', 'POS', 'VOL KR']
  const rows = [
    ['Vendor A', 'KR-1', '13', '', '62', 100],
    ['Vendor A', 'KR-1', '13', 'PK-1', '62', ''],
    ['Vendor B', 'KR-2', '9', '', '61', 200],
    ['', '', '', 'PK-2', '61', ''],
  ]

  const displayRows = getTibetDisplayRows(headers, rows)

  assert.deepEqual(displayRows[0], rows[0])
  assert.deepEqual(displayRows[1].slice(0, 3), ['', '', ''])
  assert.deepEqual(displayRows[2], rows[2])
  assert.deepEqual(displayRows[3], rows[3])
  assert.deepEqual(rows[1].slice(0, 3), ['Vendor A', 'KR-1', '13'])
})

test('summarizes Tibet KR and PK volumes once and builds program and vendor charts', () => {
  const headers = ['POS', 'PROG', 'TAHUN', 'UKURAN', 'PABRIKAN', 'NO KR', 'VOL KR', 'NO PK', 'VOL PK', 'SISA KR', 'SDH PSG', 'BLM PSG']
  const rows = [
    ['62', 'SAR', 2026, 9, 'Vendor A', 'KR-1', 200, 'PK-1', 141, 59, 66, 75],
    ['62', 'SAR', 2026, 9, 'Vendor A', 'KR-1', 200, 'PK-2', 141, 59, 126, 15],
    ['62', 'SAR', 2026, 13, 'Vendor A', 'KR-2', 100, 'BLM PK', '', 100, '', 0],
    ['61', 'SUT', 2026, 13, 'Vendor B', 'KR-3', 50, 'PK-3', 40, 10, 10, 30],
  ]

  assert.deepEqual(buildTibetMetrics(headers, rows), {
    krCount: 3,
    pkCount: 3,
    volumeKr: 350,
    volumePk: 322,
    installed: 202,
    remainingKr: 169,
    remainingPk: 1,
    notInstalled: 120,
  })

  const programChart = buildTibetProgramChart(headers, rows)
  assert.deepEqual(programChart.data, [
    { name: 'SAR', 'VOL KR 9': 200, 'VOL KR 13': 100, 'VOL PK 9': 282, 'VOL PK 13': 0 },
    { name: 'SUT', 'VOL KR 9': 0, 'VOL KR 13': 50, 'VOL PK 9': 0, 'VOL PK 13': 40 },
  ])
  const vendorChart = buildTibetVendorChart(headers, rows)
  assert.deepEqual(vendorChart.data, [
    { name: 'Vendor A', 'VOL KR 9': 200, 'VOL KR 13': 100 },
    { name: 'Vendor B', 'VOL KR 9': 0, 'VOL KR 13': 50 },
  ])
})

test('builds the Tibet detail matrix grouped by KR and vendor with program, size, and totals', () => {
  const headers = ['POS', 'PROG', 'TAHUN', 'UKURAN', 'PABRIKAN', 'NO KR', 'VOL KR', 'NO PK', 'VOL PK', 'SISA KR', 'SDH PSG', 'BLM PSG']
  const rows = [
    ['62', 'SAR', 2026, 9, 'Vendor A', 'KR-1', 200, 'PK-1', 100, 100, 60, 40],
    ['62', 'SAR', 2026, 9, 'Vendor A', 'KR-1', 200, 'PK-2', 100, 100, 40, 60],
    ['62', 'SAR', 2026, 13, 'Vendor A', 'KR-1', 80, 'PK-3', 80, 0, 80, 0],
    ['61', 'SUT', 2026, 13, 'Vendor B', 'KR-2', 50, 'BLM PK', '', 50, '', 0],
  ]

  const details = buildTibetDetailRows(headers, rows)

  assert.equal(details.length, 2)
  assert.equal(details[0].kr, 'KR-1')
  assert.equal(details[0].vendor, 'Vendor A')
  assert.equal(details[0].volumeKr.SAR[9], 200)
  assert.equal(details[0].volumeKr.SAR[13], 80)
  assert.equal(details[0].volumePk.SAR[9], 200)
  assert.equal(details[0].installed.SAR[9], 100)
  assert.equal(details[0].notInstalled.SAR[9], 100)
  assert.equal(details[0].remainingKr.SAR[9], 100)
  assert.equal(getTibetMetricTotal(details[0], 'volumeKr'), 280)
  assert.equal(details[1].notes, 'BELUM PK')
})

test('fills merged Tibet header cells without carrying a KR into a new vendor group', () => {
  const headers = ['POS', 'PROG', 'TAHUN', 'UKURAN', 'PABRIKAN', 'NO KR', 'VOL KR', 'NO PK', 'VOL PK', 'SISA KR', 'SDH PSG', 'BLM PSG']
  const rows = [
    ['62', 'SAR', 2026, 9, 'Vendor A', 'KR-1', 200, 'PK-1', 100, 100, 50, 50],
    ['', '', '', '', '', '', '', 'PK-2', 100, '', 50, 50],
    ['', '', '', '', 'Vendor B', '', 75, 'BLM PK', '', 75, '', 0],
  ]

  const normalized = normalizeTibetRows(headers, rows)

  assert.equal(normalized[1][1], 'SAR')
  assert.equal(normalized[1][5], 'KR-1')
  assert.equal(normalized[1][6], 200)
  assert.equal(normalized[2][4], 'Vendor B')
  assert.equal(normalized[2][5], '')
  assert.equal(normalized[2][6], 75)
})

test('reports which Monitoring sheet is missing', async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('SPB').addRows([['NO SPB', 'URAIAN MATERIAL'], ['1', 'Kabel']])
  const buffer = await workbook.xlsx.writeBuffer()
  const file = { arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }

  await assert.rejects(importMonitoringWorkbook(file), /Sheet berikut belum ditemukan/)
})
