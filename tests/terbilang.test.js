import test from 'node:test'
import assert from 'node:assert/strict'
import { terbilangRupiah } from '../src/lib/terbilang.js'

test('converts rupiah amounts to Indonesian words', () => {
  assert.equal(terbilangRupiah(9990), 'Sembilan Ribu Sembilan Ratus Sembilan Puluh Rupiah')
  assert.equal(terbilangRupiah(1000), 'Seribu Rupiah')
  assert.equal(terbilangRupiah(0), 'Nol Rupiah')
})
