const SMALL_NUMBERS = [
  'nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
]

function spellUnderThousand(value) {
  if (value < 12) return SMALL_NUMBERS[value]
  if (value < 20) return `${SMALL_NUMBERS[value - 10]} belas`
  if (value < 100) return `${SMALL_NUMBERS[Math.floor(value / 10)]} puluh${value % 10 ? ` ${spellUnderThousand(value % 10)}` : ''}`
  if (value < 200) return `seratus${value % 100 ? ` ${spellUnderThousand(value % 100)}` : ''}`
  return `${SMALL_NUMBERS[Math.floor(value / 100)]} ratus${value % 100 ? ` ${spellUnderThousand(value % 100)}` : ''}`
}

export function terbilangRupiah(value) {
  const amount = Math.floor(Math.abs(Number(value) || 0))
  if (!amount) return 'Nol Rupiah'

  const groups = [
    { divisor: 1_000_000_000_000, label: 'triliun' },
    { divisor: 1_000_000_000, label: 'miliar' },
    { divisor: 1_000_000, label: 'juta' },
    { divisor: 1_000, label: 'ribu' },
  ]
  let remaining = amount
  const words = []
  groups.forEach(({ divisor, label }) => {
    const group = Math.floor(remaining / divisor)
    if (!group) return
    words.push(divisor === 1_000 && group === 1 ? 'seribu' : `${spellUnderThousand(group)} ${label}`)
    remaining %= divisor
  })
  if (remaining) words.push(spellUnderThousand(remaining))

  const result = `${words.join(' ')}${Number(value) < 0 ? ' minus' : ''} rupiah`
  return result.split(' ').map((word) => word.charAt(0).toLocaleUpperCase('id-ID') + word.slice(1)).join(' ')
}
