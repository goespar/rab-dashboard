import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { readRabMaterialFile, summarizeRabMaterials } from '../src/lib/rabDatabase.js'

async function createRabFile(rows = [
  ['RAB PEKERJAAN', null, null, null, null, null],
  ['BARANG/JASA', null, null, null, 'VOL', 'HARGA SATUAN'],
  ['PEMASANGAN', null, null, null, null, null],
  ['Kabel NYY 4x16', null, null, null, 2.5, 10000],
  ['Kabel NYY 4x16', null, null, null, 1.5, 10000],
  ['BONGKAR', null, null, null, null, null],
  ['Tiang beton', null, null, null, 2, 50000],
]) {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('REKAP JTM').addRows(rows)
  const buffer = await workbook.xlsx.writeBuffer()
  return {
    name: 'RAB-Uji.xlsx',
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  }
}

test('reads RAB material rows, quantities, work types, and unit prices', async () => {
  const result = await readRabMaterialFile(await createRabFile(), { idRAB: 'RAB-1', prk: 'PRK-1' })

  assert.equal(result.metadata.detailSheet, 'REKAP JTM')
  assert.equal(result.rows.length, 3)
  assert.deepEqual(result.rows.map((row) => [row[1], row[2], row[7], row[8], row[9], row[10]]), [
    ['RAB-1', 'PRK-1', 'Kabel NYY 4x16', 2.5, 'PASANG', 10000],
    ['RAB-1', 'PRK-1', 'Kabel NYY 4x16', 1.5, 'PASANG', 10000],
    ['RAB-1', 'PRK-1', 'Tiang beton', 2, 'BONGKAR', 50000],
  ])
})

test('requires RAB metadata and material headers', async () => {
  await assert.rejects(readRabMaterialFile(await createRabFile(), { idRAB: '', prk: 'PRK-1' }), /ID RAB wajib diisi/)
  await assert.rejects(readRabMaterialFile(await createRabFile([['Tidak ada header']]), { idRAB: 'RAB-1', prk: 'PRK-1' }), /Header material dan volume tidak ditemukan/)
})

test('groups Database RAB material totals by description and work type', () => {
  const result = summarizeRabMaterials([
    ['', 'RAB-1', 'PRK-1', '', '', '', 1, 'Kabel NYY', 2, 'PASANG', 100],
    ['', 'RAB-1', 'PRK-1', '', '', '', 2, 'Kabel NYY', 3, 'PASANG', 100],
    ['', 'RAB-1', 'PRK-1', '', '', '', 3, 'Kabel NYY', 1, 'BONGKAR', 100],
  ])

  assert.deepEqual(result.map(({ material, type, rowCount, volume, totalPrice }) => ({ material, type, rowCount, volume, totalPrice })), [
    { material: 'Kabel NYY', type: 'PASANG', rowCount: 2, volume: 5, totalPrice: 500 },
    { material: 'Kabel NYY', type: 'BONGKAR', rowCount: 1, volume: 1, totalPrice: 100 },
  ])
})
