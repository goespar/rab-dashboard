import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { getTibetDisplayRows, importMonitoringWorkbook } from '../src/lib/monitoringWorkbook.js'

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
  workbook.addWorksheet('Tibet').addRows([
    ['VENDOR', 'NOMOR KR', 'JENIS TIBET', 'NO PK', 'POS', 'VOL KR', 'VOL PK', 'VOL PASANG', 'SISA KR', 'SISA PK'],
    ['Vendor A', 'KR-1', 'TM', 'PK-1', '61', 10, 8, 3, 2, 5],
    ['', '', '', 'PK-2', '61', 0, 4, 2, 0, 2],
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
  assert.equal(data.tibet.rows[1][0], '')
  assert.equal(data.tibet.rows[1][1], '')
  assert.equal(data.tibet.rows[1][3], 'PK-2')
  assert.equal(data.customers.rows[0][1], 'Pelanggan A')
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

test('reports which Monitoring sheet is missing', async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('SPB').addRows([['NO SPB', 'URAIAN MATERIAL'], ['1', 'Kabel']])
  const buffer = await workbook.xlsx.writeBuffer()
  const file = { arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }

  await assert.rejects(importMonitoringWorkbook(file), /Sheet berikut belum ditemukan/)
})
