/**

 * MONITORING AI BARA — RAB Monitoring PLN — Google Sheets Backend

 *

 * DATABASE : Google Spreadsheet MONITORING AI BARA

 * SHEET    : Sheet1

 *

 * Fungsi utama:

 * 1. Menyajikan Index.html sebagai Web App.

 * 2. Menyimpan state aplikasi ke sheet APP_STATE agar data RAB/material/

 *    edit lokal dapat dipakai lintas device.

 * 3. Membaca REKAP PER PRK langsung dari header PRK Sheet1.

 *    Dashboard TIDAK menghitung ulang TOTAL PA / NILAI KONTRAK dari localStorage.

 */



const SPREADSHEET_ID = '1E330xkEvgia8w4n43eWIg8_854sX3VS7zqcrO5rXdWc';

// Sumber data utama dikunci ke Sheet1 sesuai spreadsheet MONITORING AI BARA.

const DATA_SHEET = 'Sheet1';

const STATE_SHEET = 'APP_STATE';

const CHUNK_SIZE = 40000;

const DATA_COLS = 31; // A:AE = 31 kolom (AE = PROGRESS)



function getDb_() {

  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf('ISI_ID') === 0) {

    throw new Error('SPREADSHEET_ID belum diisi.');

  }

  return SpreadsheetApp.openById(SPREADSHEET_ID);

}



function getMasterSheet_() {

  const ss = getDb_();

  const sh = ss.getSheetByName(DATA_SHEET);

  if (!sh) throw new Error('Sheet sumber "' + DATA_SHEET + '" tidak ditemukan pada spreadsheet MONITORING AI BARA.');

  return sh;

}



function doGet() {

  return HtmlService

    .createHtmlOutputFromFile('Index')

    .setTitle('DASHBOARD REN')

    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

}



/* =========================================================

   DATA MASTER / REKAP PER PRK

   ========================================================= */



function serializeValue_(value) {

  if (value instanceof Date) {

    if (isNaN(value.getTime())) return '';

    const dd = String(value.getDate()).padStart(2, '0');

    const mm = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][value.getMonth()];

    return dd + '/' + mm + '/' + value.getFullYear();

  }

  if (value === null || value === undefined) return '';

  return value;

}



/**

 * Membaca seluruh data master dari Sheet1.

 * Dipertahankan untuk kompatibilitas/fungsi lain jika dibutuhkan.

 */

function getMasterData() {

  const sh = getMasterSheet_();

  const lastRow = sh.getLastRow();

  const width = Math.max(31, sh.getLastColumn());

  if (lastRow < 1) return {sheetName: sh.getName(), headers: [], data: []};



  // Read the real header names first, then normalize every row into the

  // application's fixed 30-column structure. This prevents a column shift

  // in Sheet1 from corrupting Dashboard calculations.

  // Baca SELURUH kolom Sheet1 yang memiliki header. Data ini menjadi sumber

  // mentah aplikasi; tidak ada kolom yang dibuang dari sumber spreadsheet.

  const rawHeaders = sh.getRange(1, 1, 1, width).getDisplayValues()[0];

  const headersUpper = rawHeaders.map(v => String(v ?? '').trim().toUpperCase());

  const sourceData = lastRow > 1

    ? sh.getRange(2, 1, lastRow - 1, width).getDisplayValues()

    : [];

  const canonical = [

    'NO.PRK','NO.PRK SKKI','NO.PRK FIX','NO.WBS','POS ANGGARAN','NO.RAB','NO.PA','URAIAN',

    'TOTAL PRK','RELOKASI','REVISI SKKI','TOTAL AKHIR','TOTAL RAB','TOTAL PA','NOKONTRAK','VENDOR',

    'NILAI KONTRAK','PENGEMBALIAN PA','PENGGANTIAN BIAYA','TAGIHAN','TOTAL BAYAR','SISA PRK',

    'PROGRAM','TAHUN ANGGARAN','KETERANGAN','POS ANGGARAN','TANGGAL AWAL','TANGGAL AKHIR',

    'RENCANA KONTRAK','RENCANA TAGIH','PROGRESS'

  ];



  const headerIndex = {};

  headersUpper.forEach((h,i) => { if (h && headerIndex[h] === undefined) headerIndex[h] = i; });

  const values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, width).getValues() : [];



  const data = values.map(row => canonical.map((name, ci) => {

    // Kolom AE (index 30) adalah KHUSUS status Progress Kontrak.

    // Jangan bergantung pada nama header untuk field ini.

    if (ci === 30) return serializeValue_(row[30]);

    const idx = headerIndex[name];

    return idx === undefined ? '' : serializeValue_(row[idx]);

  }));



  return {

    sheetName: sh.getName(),

    // headers/data = struktur aplikasi yang sudah ada (untuk kompatibilitas).

    headers: canonical,

    data,

    // sourceHeaders/sourceData = SELURUH isi Sheet1 berdasarkan header asli.

    // Ini dipakai untuk filter agar tidak bergantung pada rekap 27 PRK.

    sourceHeaders: rawHeaders,

    sourceData

  };

}



function getRekapPRK() {

  const all = getMasterData();

  const noPrkCol = all.headers.indexOf('NO.PRK');

  if (noPrkCol < 0) throw new Error('Kolom NO.PRK tidak ditemukan pada Sheet1.');

  return all.data.filter(row => String(row[noPrkCol] ?? '').trim() !== '');

}



function toNumber_(v) {

  if (v === null || v === undefined || v === '') return 0;

  if (typeof v === 'number') return isFinite(v) ? v : 0;

  let s = String(v).trim().replace(/\s/g,'');

  if (!s) return 0;

  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g,'').replace(',', '.');

  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');

  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');

  const n = Number(s);

  return isFinite(n) ? n : 0;

}



function getDashboardSummary(){

  const rows=getRekapPRK();

  const s={prk:rows.length,totalAkhir:0,totalRab:0,totalPa:0,totalKontrak:0,tagihan:0,totalBayar:0,sisaPrk:0,murni:0,lanjutan:0};

  rows.forEach(r=>{

    s.totalAkhir += toNumber_(r[11]);

    s.totalRab += toNumber_(r[12]);

    s.totalPa += toNumber_(r[13]);

    s.totalKontrak += toNumber_(r[16]);

    s.tagihan += toNumber_(r[19]);

    s.totalBayar += toNumber_(r[20]);

    s.sisaPrk += toNumber_(r[21]);

    const st=String(r[24]||'').trim().toUpperCase();

    if(st==='MURNI') s.murni += toNumber_(r[11]);

    if(st==='LANJUTAN') s.lanjutan += toNumber_(r[11]);

  });

  return s;

}





/* =========================================================

   SPB / MATERIAL PER POS

   ========================================================= */

function getSPBData() {

  const ss = getDb_();

  const sh = ss.getSheetByName('SPB');

  if (!sh) {

    throw new Error('Sheet SPB tidak ditemukan. Pastikan nama sheet adalah "SPB".');

  }



  const lastRow = sh.getLastRow();

  const lastCol = Math.max(19, sh.getLastColumn());



  if (lastRow < 2) {

    return { headers: [], data: [] };

  }



  const values = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();

  const headers = values[0].map(v => String(v == null ? '' : v).trim());

  const data = values.slice(1).filter(row =>

    row.some(v => String(v == null ? '' : v).trim() !== '')

  );



  return { headers: headers, data: data };

}



/* =========================================================

   API YANG DIPANGGIL INDEX.HTML

   Sumber utama: Sheet1

   ========================================================= */

function getAppData() {

  const master = getMasterData();

  const noPrkCol = master.headers.indexOf('NO.PRK');

  if (noPrkCol < 0) throw new Error('Kolom NO.PRK tidak ditemukan pada Sheet1.');

  const rekap = (master.data || []).filter(row => String(row[noPrkCol] ?? '').trim() !== '');

  const s = {prk: rekap.length, totalAkhir:0, totalRab:0, totalPa:0, totalKontrak:0, tagihan:0, totalBayar:0, sisaPrk:0, murni:0, lanjutan:0};

  rekap.forEach(r=>{

    s.totalAkhir += toNumber_(r[11]);

    s.totalRab += toNumber_(r[12]);

    s.totalPa += toNumber_(r[13]);

    s.totalKontrak += toNumber_(r[16]);

    s.tagihan += toNumber_(r[19]);

    s.totalBayar += toNumber_(r[20]);

    s.sisaPrk += toNumber_(r[21]);

    const st=String(r[24]||'').trim().toUpperCase();

    if(st==='MURNI') s.murni += toNumber_(r[11]);

    if(st==='LANJUTAN') s.lanjutan += toNumber_(r[11]);

  });

  // Kolom AE (31) adalah SATU-SATUNYA sumber untuk filter Progress Kontrak.

  // Tidak digunakan untuk harga/RAB/PA/kontrak atau perhitungan lainnya.

  const sh = getMasterSheet_();

  const lastRow = sh.getLastRow();

  // Filter Progress Kontrak membaca langsung seluruh data sumber Sheet1,

  // khusus kolom AE (kolom ke-31 / index 30). Kolom ini hanya untuk filter.

  const sourceData = Array.isArray(master.sourceData) ? master.sourceData : [];

  const progressAE = [...new Set(

    sourceData

      .map(row => String(row?.[30] ?? '').trim().toUpperCase())

      .filter(v => v === 'LUNAS' || v === 'BELUM LUNAS')

  )];

  return {

    sheetName: master.sheetName,

    headers: master.headers || [],

    data: master.data || [],

    rekap,

    summary: s,

    progressAE,

    sourceHeaders: master.sourceHeaders || [],

    sourceData

  };

}





/* =========================================================

   DATABASE RAB

   Menyimpan hanya:

   ID RAB | PRK | FILE | REKAP AKTIF | SHEET DETAIL |

   BARIS | URAIAN MATERIAL | VOLUME

   Sheet akan dibuat otomatis dengan nama DATABASE_RAB.

   ========================================================= */



const RAB_DB_SHEET = 'DATABASE_RAB';



function getRABDatabaseSheet_() {

  const ss = getDb_();

  let sh = ss.getSheetByName(RAB_DB_SHEET);



  if (!sh) {

    sh = ss.insertSheet(RAB_DB_SHEET);

    sh.getRange(1, 1, 1, 10).setValues([[

      'UPDATED_AT', 'ID RAB', 'PRK', 'NAMA FILE', 'REKAP AKTIF',

      'SHEET DETAIL', 'BARIS', 'URAIAN MATERIAL', 'VOLUME', 'JENIS PEKERJAAN'

    ]]);

    sh.setFrozenRows(1);

  } else {

    // Migrasi header bila DATABASE_RAB versi lama masih hanya 9 kolom.

    if (String(sh.getRange(1,10).getDisplayValue() || '').trim().toUpperCase() !== 'JENIS PEKERJAAN') {

      sh.getRange(1,10).setValue('JENIS PEKERJAAN');

    }

  }

  sh.getRange('A1:J1').setFontWeight('bold');

  return sh;

}



function normalizeJenisPekerjaan_(value) {

  const s = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

  if (!s) return '';

  if (/\bBONGKAR\b|\bPEMBONGKARAN\b/.test(s)) return 'BONGKAR';

  if (/\bPASANG\b|\bPEMASANGAN\b/.test(s)) return 'PASANG';

  return s;

}



/**

 * Menentukan jenis pekerjaan dengan prioritas:

 * 1) nilai JENIS PEKERJAAN yang sudah tersimpan, jika memang PASANG/BONGKAR;

 * 2) NAMA SHEET DETAIL (contoh: "1. PASANG JTM AAACS (2)");

 * 3) URAIAN MATERIAL jika memang mengandung PASANG/BONGKAR;

 * 4) selain itu LAINNYA.

 *

 * Ini penting untuk data lama: kolom J bisa sudah berisi LAINNYA, tetapi

 * kolom F (SHEET DETAIL) sudah sangat jelas menunjukkan PASANG/BONGKAR.

 */

function resolveJenisPekerjaan_(jenisValue, sheetDetail, uraianMaterial) {

  const jenis = normalizeJenisPekerjaan_(jenisValue);

  if (jenis === 'PASANG' || jenis === 'BONGKAR') return jenis;



  const fromSheet = normalizeJenisPekerjaan_(sheetDetail);

  if (fromSheet === 'PASANG' || fromSheet === 'BONGKAR') return fromSheet;



  const fromMaterial = normalizeJenisPekerjaan_(uraianMaterial);

  if (fromMaterial === 'PASANG' || fromMaterial === 'BONGKAR') return fromMaterial;



  return jenis || fromSheet || fromMaterial || 'LAINNYA';

}



function jenisPekerjaanFromRow_(r) {

  return resolveJenisPekerjaan_(

    r && (r.jenisPekerjaan ?? r.jenis ?? r.type),

    r && (r.sheet ?? r.sheetDetail),

    r && (r.uraianMaterial ?? r.material)

  );

}



/**

 * Memperbaiki kolom JENIS PEKERJAAN pada DATABASE_RAB yang sudah terlanjur

 * tersimpan. Tidak menghapus data; hanya mengisi/menormalkan kolom J.

 */

function backfillJenisPekerjaanDatabase() {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();

  if (lastRow < 2) return {ok:true, updatedRows:0, sheetName:RAB_DB_SHEET};



  const range = sh.getRange(2, 1, lastRow - 1, 10);

  const values = range.getValues();

  let updated = 0;



  values.forEach(r => {

    const resolved = resolveJenisPekerjaan_(r[9], r[5], r[7]);

    if (String(r[9] || '').trim().toUpperCase() !== resolved) {

      r[9] = resolved;

      updated++;

    }

  });



  range.setValues(values);

  return {ok:true, updatedRows:updated, totalRows:values.length, sheetName:RAB_DB_SHEET};

}



function clearRABDatabase() {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();

  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 10).clearContent();

  return {ok:true, deletedRows:Math.max(0,lastRow-1), sheetName:RAB_DB_SHEET};

}



function saveRABMaterialRows(payload) {

  if (!payload || !payload.meta || !Array.isArray(payload.rows)) {

    throw new Error('Data Database RAB tidak valid.');

  }



  const meta = payload.meta;

  const idRAB = String(meta.idRAB || '').trim();

  const prk = String(meta.prk || '').trim();



  if (!idRAB) throw new Error('ID RAB wajib diisi.');

  if (!prk) throw new Error('PRK wajib diisi.');

  if (!payload.rows.length) throw new Error('Tidak ada material dengan volume untuk disimpan.');



  const sh = getRABDatabaseSheet_();

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);



  try {

    // ID RAB bersifat unik. Jika di-upload ulang, data lama untuk ID tersebut

    // diganti dengan hasil pembacaan terbaru.

    const lastRow = sh.getLastRow();

    if (lastRow >= 2) {

      const ids = sh.getRange(2, 2, lastRow - 1, 1).getDisplayValues();

      const deleteRows = [];

      ids.forEach((r, i) => {

        if (String(r[0] || '').trim() === idRAB) deleteRows.push(i + 2);

      });



      for (let i = deleteRows.length - 1; i >= 0; i--) {

        sh.deleteRow(deleteRows[i]);

      }

    }



    const now = new Date();

    const rows = payload.rows.map(r => [

      now,

      idRAB,

      prk,

      String(meta.fileName || ''),

      String(meta.activeRekap || ''),

      String(r.sheet || ''),

      Number(r.row || 0),

      String(r.uraianMaterial || '').trim(),

      Number(r.volume || 0),

      resolveJenisPekerjaan_(r.jenisPekerjaan, r.sheet, r.uraianMaterial)

    ]).filter(r => r[7] !== '' && isFinite(r[8]));



    if (!rows.length) throw new Error('Tidak ada baris material valid untuk disimpan.');



    const start = Math.max(2, sh.getLastRow() + 1);

    sh.getRange(start, 1, rows.length, 10).setValues(rows);

    sh.getRange(start, 1, rows.length, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');

    sh.getRange(start, 9, rows.length, 1).setNumberFormat('#,##0.######');



    return {

      ok: true,

      savedRows: rows.length,

      idRAB: idRAB,

      prk: prk,

      sheetName: RAB_DB_SHEET

    };

  } finally {

    lock.releaseLock();

  }

}



function getRABMaterialSummary(prk, searchText) {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();



  if (lastRow < 2) {

    return { rows: [], databaseRows: 0 };

  }



  const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();

  const p = String(prk || '').trim().toUpperCase();

  const q = String(searchText || '').trim().toUpperCase();



  const filtered = values.filter(r => {

    const rowPrk = String(r[2] || '').trim().toUpperCase();

    const material = String(r[7] || '').trim().toUpperCase();



    if (p && rowPrk !== p) return false;

    if (q && !material.includes(q)) return false;

    return material !== '';

  });



  const map = {};



  filtered.forEach(r => {

    const rowPrk = String(r[2] || '').trim();

    const material = String(r[7] || '').trim();

    const jenis = resolveJenisPekerjaan_(r[9], r[5], r[7]);



    // Pengelompokan material menggunakan nama material persis.

    // Jadi material dengan nama berbeda tidak digabung secara paksa.

    const key = rowPrk + '||' + jenis + '||' + material.toUpperCase();



    if (!map[key]) {

      map[key] = {

        prk: rowPrk,

        uraianMaterial: material,

        jenisPekerjaan: jenis || 'LAINNYA',

        totalVolume: 0,

        rowCount: 0

      };

    }



    map[key].totalVolume += Number(r[8]) || 0;

    map[key].rowCount++;

  });



  const rows = Object.keys(map).map(k => map[k]);



  rows.sort((a, b) => {

    const pcmp = a.prk.localeCompare(b.prk, 'id');

    if (pcmp !== 0) return pcmp;

    return a.uraianMaterial.localeCompare(b.uraianMaterial, 'id');

  });



  return {

    rows: rows,

    databaseRows: values.filter(r => String(r[7] || '').trim() !== '').length

  };

}





function getRABIdSummaryList() {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();

  if (lastRow < 2) return [];



  const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();

  const map = {};



  values.forEach(r => {

    const idRAB = String(r[1] || '').trim();

    const prk = String(r[2] || '').trim();

    const material = String(r[7] || '').trim();

    const volume = Number(r[8]) || 0;

    if (!idRAB || !material) return;



    if (!map[idRAB]) {

      map[idRAB] = {

        idRAB: idRAB,

        prk: prk,

        fileName: String(r[3] || '').trim(),

        activeRekap: String(r[4] || '').trim(),

        rowCount: 0,

        totalVolume: 0,

        materialMap: {}

      };

    }



    map[idRAB].rowCount++;

    map[idRAB].totalVolume += volume;

    const jenis = resolveJenisPekerjaan_(r[9], r[5], r[7]);

    const key = jenis + '||' + material.toUpperCase();

    if (!map[idRAB].materialMap[key]) {

      map[idRAB].materialMap[key] = {name: material, jenisPekerjaan: jenis || 'LAINNYA', volume: 0};

    }

    map[idRAB].materialMap[key].volume += volume;

  });



  return Object.values(map).map(x => ({

    idRAB: x.idRAB,

    prk: x.prk,

    fileName: x.fileName,

    activeRekap: x.activeRekap,

    rowCount: x.rowCount,

    materialCount: Object.keys(x.materialMap).length,

    totalVolume: x.totalVolume

  })).sort((a,b) => a.idRAB.localeCompare(b.idRAB, 'id', {numeric:true}));

}



function getRABIdMaterialSummary(idRAB, searchText) {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();

  const id = String(idRAB || '').trim();

  const q = String(searchText || '').trim().toUpperCase();



  if (!id) throw new Error('ID RAB wajib dipilih.');

  if (lastRow < 2) return {meta: null, rows: [], databaseRows: 0};



  const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();

  const filtered = values.filter(r => {

    const rowId = String(r[1] || '').trim();

    const material = String(r[7] || '').trim();

    if (rowId !== id || !material) return false;

    if (q && !material.toUpperCase().includes(q)) return false;

    return true;

  });



  let meta = null;

  const map = {};

  filtered.forEach(r => {

    if (!meta) {

      meta = {

        idRAB: String(r[1] || '').trim(),

        prk: String(r[2] || '').trim(),

        fileName: String(r[3] || '').trim(),

        activeRekap: String(r[4] || '').trim()

      };

    }

    const material = String(r[7] || '').trim();

    const jenis = resolveJenisPekerjaan_(r[9], r[5], r[7]);

    const key = jenis + '||' + material.toUpperCase();

    if (!map[key]) map[key] = {uraianMaterial: material, jenisPekerjaan: jenis || 'LAINNYA', totalVolume: 0, rowCount: 0};

    map[key].totalVolume += Number(r[8]) || 0;

    map[key].rowCount++;

  });



  const rows = Object.values(map).sort((a,b) =>

    a.uraianMaterial.localeCompare(b.uraianMaterial, 'id')

  );



  return {

    meta: meta,

    rows: rows,

    databaseRows: filtered.length

  };

}



function getRABIdDetail(idRAB) {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();

  const id = String(idRAB || '').trim();

  if (!id) throw new Error('ID RAB wajib dipilih.');

  if (lastRow < 2) return {meta:null, rows:[]};



  const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();

  let meta = null;

  const rows = [];

  values.forEach((r, i) => {

    if (String(r[1] || '').trim() !== id) return;

    if (!meta) {

      meta = {

        idRAB: String(r[1] || '').trim(),

        prk: String(r[2] || '').trim(),

        fileName: String(r[3] || '').trim(),

        activeRekap: String(r[4] || '').trim()

      };

    }

    rows.push({

      dbRow: i + 2,

      sheet: String(r[5] || '').trim(),

      sourceRow: Number(r[6]) || 0,

      uraianMaterial: String(r[7] || '').trim(),

      volume: Number(r[8]) || 0,

      jenisPekerjaan: resolveJenisPekerjaan_(r[9], r[5], r[7])

    });

  });

  return {meta:meta, rows:rows};

}



function updateRABIdRows(payload) {

  if (!payload || !payload.meta) throw new Error('Data edit RAB tidak valid.');

  const idRAB = String(payload.meta.idRAB || '').trim();

  const prk = String(payload.meta.prk || '').trim();

  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!idRAB) throw new Error('ID RAB wajib diisi.');

  if (!prk) throw new Error('PRK wajib diisi.');

  if (!rows.length) throw new Error('Tidak ada material. Gunakan Hapus ID jika seluruh data ingin dihapus.');



  const sh = getRABDatabaseSheet_();

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    const lastRow = sh.getLastRow();

    if (lastRow >= 2) {

      const ids = sh.getRange(2, 2, lastRow - 1, 1).getDisplayValues();

      for (let i = ids.length - 1; i >= 0; i--) {

        if (String(ids[i][0] || '').trim() === idRAB) sh.deleteRow(i + 2);

      }

    }



    const now = new Date();

    const out = rows.map(r => [

      now,

      idRAB,

      prk,

      String(payload.meta.fileName || ''),

      String(payload.meta.activeRekap || ''),

      String(r.sheet || ''),

      Number(r.sourceRow || r.row || 0),

      String(r.uraianMaterial || '').trim(),

      Number(r.volume) || 0,

      resolveJenisPekerjaan_(r.jenisPekerjaan, r.sheet, r.uraianMaterial)

    ]).filter(r => r[7] !== '');



    if (!out.length) throw new Error('Tidak ada baris material valid setelah diedit.');

    const start = Math.max(2, sh.getLastRow() + 1);

    sh.getRange(start, 1, out.length, 10).setValues(out);

    sh.getRange(start, 1, out.length, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');

    sh.getRange(start, 9, out.length, 1).setNumberFormat('#,##0.######');

    return {ok:true, idRAB:idRAB, savedRows:out.length};

  } finally {

    lock.releaseLock();

  }

}



function deleteRABId(idRAB) {

  const id = String(idRAB || '').trim();

  if (!id) throw new Error('ID RAB wajib dipilih.');

  const sh = getRABDatabaseSheet_();

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    const lastRow = sh.getLastRow();

    if (lastRow < 2) return {ok:false, deletedRows:0, idRAB:id};

    const ids = sh.getRange(2, 2, lastRow - 1, 1).getDisplayValues();

    const rows = [];

    ids.forEach((r, i) => {

      if (String(r[0] || '').trim() === id) rows.push(i + 2);

    });

    for (let i = rows.length - 1; i >= 0; i--) sh.deleteRow(rows[i]);

    return {ok:true, deletedRows:rows.length, idRAB:id};

  } finally {

    lock.releaseLock();

  }

}



/**

 * Rekap material berdasarkan PRK.

 * Semua ID RAB dengan PRK yang sama digabung, lalu material yang sama

 * (trim + case-insensitive) dijumlahkan volumenya.

 */

function getRABMaterialRekapByPRK(prk) {

  const targetPrk = String(prk || '').trim();

  // PRK kosong berarti seluruh Database RAB; grafik 8 material terbesar harus tetap tampil tanpa memilih PRK.



  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();

  if (lastRow < 2) {

    return {prk: targetPrk, rows: [], totalRows: 0, totalVolume: 0};

  }



  const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();

  const map = {};

  let totalRows = 0;

  let totalVolume = 0;



  values.forEach(r => {

    const rowPrk = String(r[2] || '').trim();

    if (targetPrk && rowPrk.toUpperCase() !== targetPrk.toUpperCase()) return;



    const idRAB = String(r[1] || '').trim();

    const material = String(r[7] || '').trim();

    const volume = Number(r[8]) || 0;

    const jenis = resolveJenisPekerjaan_(r[9], r[5], r[7]);

    if (!material) return;



    totalRows++;

    totalVolume += volume;



    const key = jenis + '||' + material.replace(/\s+/g, ' ').toUpperCase();

    if (!map[key]) {

      map[key] = {

        uraianMaterial: material.replace(/\s+/g, ' '),

        jenisPekerjaan: jenis,

        totalVolume: 0,

        ids: {}

      };

    }

    map[key].totalVolume += volume;

    if (idRAB) map[key].ids[idRAB] = true;

  });



  const rows = Object.keys(map).map(key => {

    const x = map[key];

    const idRABs = Object.keys(x.ids).sort((a,b) => a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));

    return {

      uraianMaterial: x.uraianMaterial,

      jenisPekerjaan: x.jenisPekerjaan,

      totalVolume: x.totalVolume,

      idCount: idRABs.length,

      idRABs: idRABs

    };

  });



  rows.sort((a,b) => a.uraianMaterial.localeCompare(b.uraianMaterial, undefined, {sensitivity:'base'}));



  return {

    prk: targetPrk,

    rows: rows,

    totalRows: totalRows,

    totalVolume: totalVolume

  };

}





function getRABMaterialDatabase() {

  const sh = getRABDatabaseSheet_();

  const lastRow = sh.getLastRow();



  if (lastRow < 2) return [];



  const values = sh.getRange(2, 1, lastRow - 1, 10).getDisplayValues();



  return values.map(r => ({

    updatedAt: r[0],

    idRAB: r[1],

    prk: r[2],

    fileName: r[3],

    activeRekap: r[4],

    sheet: r[5],

    row: r[6],

    uraianMaterial: r[7],

    volume: r[8],

    jenisPekerjaan: r[9]

  }));

}



/* =========================================================

   APP STATE — penyimpanan lintas device

   ========================================================= */



function getStateSheet_() {

  const ss = getDb_();

  let sh = ss.getSheetByName(STATE_SHEET);



  if (!sh) {

    sh = ss.insertSheet(STATE_SHEET);

    sh.getRange(1, 1, 1, 4).setValues([

      ['KEY', 'CHUNK', 'VALUE', 'UPDATED_AT']

    ]);

    sh.setFrozenRows(1);

  }



  return sh;

}



function loadAppState() {

  const sh = getStateSheet_();

  const last = sh.getLastRow();



  if (last < 2) {

    return {ok: true, hasData: false, state: {}};

  }



  const values = sh.getRange(2, 1, last - 1, 4).getValues();

  const grouped = {};



  values.forEach(row => {

    const key = String(row[0] || '');

    if (!key) return;



    const chunk = Number(row[1] || 0);

    if (!grouped[key]) grouped[key] = [];

    grouped[key][chunk] = String(row[2] == null ? '' : row[2]);

  });



  const state = {};



  Object.keys(grouped).forEach(key => {

    state[key] = grouped[key]

      .filter(v => v !== undefined)

      .join('');

  });



  return {

    ok: true,

    hasData: Object.keys(state).length > 0,

    state: state

  };

}



function saveAppState(state) {

  if (!state || typeof state !== 'object') {

    throw new Error('State aplikasi tidak valid.');

  }



  const lock = LockService.getScriptLock();

  lock.waitLock(15000);



  try {

    const sh = getStateSheet_();

    const keys = Object.keys(state);



    // Hapus state lama untuk key yang akan diperbarui.

    if (sh.getLastRow() >= 2 && keys.length) {

      const all = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();

      const keep = all.filter(row => !keys.includes(String(row[0] || '')));



      sh.getRange(2, 1, sh.getMaxRows() - 1, 4).clearContent();



      if (keep.length) {

        sh.getRange(2, 1, keep.length, 4).setValues(keep);

      }

    }



    const rows = [];

    const now = new Date();



    keys.forEach(key => {

      const value = state[key] == null ? '' : String(state[key]);



      if (!value) {

        rows.push([key, 0, '', now]);

        return;

      }



      for (let i = 0, chunk = 0; i < value.length; i += CHUNK_SIZE, chunk++) {

        rows.push([

          key,

          chunk,

          value.substring(i, i + CHUNK_SIZE),

          now

        ]);

      }

    });



    if (rows.length) {

      const start = Math.max(2, sh.getLastRow() + 1);

      sh.getRange(start, 1, rows.length, 4).setValues(rows);

    }



    return {

      ok: true,

      savedKeys: keys.length,

      savedAt: now.toISOString()

    };



  } finally {

    lock.releaseLock();

  }

}



/**

 * Hapus seluruh state APP_STATE.

 * Gunakan hanya jika memang ingin mengosongkan data aplikasi online.

 */

function clearAppState() {

  const sh = getStateSheet_();

  if (sh.getLastRow() >= 2) {

    sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();

  }

  return {ok: true};

}





/**

 * Dipanggil grafik Rencana Tagih.

 * Mengembalikan nilai kolom AF (PROYEKSI TAGIHAN) sesuai urutan baris Sheet1,

 * supaya setiap nilai tetap cocok dengan bulan pada kolom AD.

 */

function sourceRowMatchKey_(row) {
  // Stable identity shared by Sheet1's canonical data and Detail Kontrak rows.
  return [row && row[0], row && row[2], row && row[7]]
    .map(v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toUpperCase())
    .join('||');
}

/**
 * Match requested Detail Kontrak rows back to their exact Sheet1 rows.
 * Important: never take the first N values from AF, because filters can remove
 * rows from the front/middle and shift all monthly chart amounts.
 */
function getProjectionTagihanForRows(rows) {
  const sh = getMasterSheet_();
  const lastRow = sh.getLastRow();
  const count = Math.max(0, lastRow - 1);
  if (!count) return [];

  const projection = sh.getRange(2, 32, count, 1).getValues().map(r => toNumber_(r[0])); // AF
  if (!Array.isArray(rows)) return projection;

  const masterRows = getMasterData().data || [];
  const indexesByKey = {};
  masterRows.forEach((row, i) => {
    const key = sourceRowMatchKey_(row);
    if (key === '||||') return;
    if (!indexesByKey[key]) indexesByKey[key] = [];
    indexesByKey[key].push(i);
  });

  const consumed = {};
  return rows.map(row => {
    const key = sourceRowMatchKey_(row);
    const matches = indexesByKey[key];
    if (!matches || !matches.length) return 0;
    const offset = consumed[key] || 0;
    const index = matches[Math.min(offset, matches.length - 1)];
    consumed[key] = offset + 1;
    return projection[index] == null ? 0 : projection[index];
  });
}

function getPaidMonthlySummary(rows) {
  const sh = getMasterSheet_();
  const lastRow = sh.getLastRow();
  const totals = Array(12).fill(0);
  if (lastRow < 2) return totals;

  const count = lastRow - 1;
  const amounts = sh.getRange(2, 21, count, 1).getValues().map(r => toNumber_(r[0])); // U
  const dates = sh.getRange(2, 33, count, 1).getValues().map(r => r[0]); // AG
  let indexes;

  if (Array.isArray(rows)) {
    const masterRows = getMasterData().data || [];
    const indexesByKey = {};
    masterRows.forEach((row, i) => {
      const key = sourceRowMatchKey_(row);
      if (key === '||||') return;
      if (!indexesByKey[key]) indexesByKey[key] = [];
      indexesByKey[key].push(i);
    });
    const consumed = {};
    indexes = rows.map(row => {
      const key = sourceRowMatchKey_(row);
      const matches = indexesByKey[key];
      if (!matches || !matches.length) return -1;
      const offset = consumed[key] || 0;
      consumed[key] = offset + 1;
      return matches[Math.min(offset, matches.length - 1)];
    }).filter(i => i >= 0);
  } else {
    indexes = Array.from({length: count}, (_, i) => i);
  }

  const aliases = {
    januari:0, jan:0, january:0,
    februari:1, feb:1, february:1,
    maret:2, mar:2, march:2,
    april:3, apr:3,
    mei:4, may:4,
    juni:5, jun:5, june:5,
    juli:6, jul:6, july:6,
    agustus:7, agu:7, ags:7, aug:7, august:7,
    september:8, sep:8, sept:8,
    oktober:9, okt:9, oct:9, october:9,
    november:10, nov:10,
    desember:11, des:11, dec:11, december:11
  };

  indexes.forEach(i => {
    const amount = amounts[i] || 0;
    const raw = dates[i];
    if (!amount || raw === '' || raw === null || raw === undefined) return;

    let month = -1;
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      month = raw.getMonth();
    } else {
      const value = String(raw).trim().toLowerCase().replace(/\./g, '');
      if (Object.prototype.hasOwnProperty.call(aliases, value)) {
        month = aliases[value];
      } else {
        let m = value.match(/^(\d{1,2})[-/ ]([a-z]+|\d{1,2})[-/ ](\d{2,4})$/i);
        const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) {
          const key = m[2];
          if (Object.prototype.hasOwnProperty.call(aliases, key)) month = aliases[key];
          else if (/^\d{1,2}$/.test(key)) month = Number(key) - 1;
        } else if (iso) {
          month = Number(iso[2]) - 1;
        } else {
          const parsed = new Date(raw);
          if (!isNaN(parsed.getTime())) month = parsed.getMonth();
        }
      }
    }
    if (month >= 0 && month < 12) totals[month] += amount;
  });

  return totals;
}

/* =========================================================
   MON TIBET — API tambahan (baseline asli tetap dipertahankan)
   Sumber data: sheet Tibet pada spreadsheet MONITORING AI BARA.
   Membaca seluruh kolom A:J dan mengembalikan baris asli agar Nomor PK
   yang berada di bawah setiap Nomor KR tetap ikut ditampilkan.
   ========================================================= */
function getMonTibetData() {
  const ss = getDb_();
  const sh = ss.getSheetByName('Tibet');
  if (!sh) throw new Error('Sheet "Tibet" tidak ditemukan pada spreadsheet MONITORING AI BARA.');
  const lastRow = sh.getLastRow();
  const lastCol = Math.max(10, Math.min(sh.getLastColumn() || 10, 10));
  if (lastRow < 1) return {headers: [], rows: []};
  const rows = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  return {headers: rows[0] || [], rows: rows};
}

/* =========================================================
   STOCK GUDANG — API untuk menu Stock Gudang
   Sumber: sheet STOCK GUDANG, kolom A:J; data SPB hanya untuk referensi.
   ========================================================= */
function getStockGudangData() {
  const ss = getDb_();
  const stockSh = ss.getSheetByName('STOCK GUDANG');
  if (!stockSh) throw new Error('Sheet "STOCK GUDANG" tidak ditemukan pada spreadsheet MONITORING AI BARA.');

  const lastRow = stockSh.getLastRow();
  const headers = lastRow >= 1 ? stockSh.getRange(1, 1, 1, 10).getDisplayValues()[0] : [];
  const data = lastRow >= 2
    ? stockSh.getRange(2, 1, lastRow - 1, 10).getDisplayValues()
        .filter(row => row.some(v => String(v == null ? '' : v).trim() !== ''))
    : [];

  let spbData = [];
  const spbSh = ss.getSheetByName('SPB');
  if (spbSh && spbSh.getLastRow() >= 2) {
    const lastCol = Math.max(19, spbSh.getLastColumn());
    spbData = spbSh.getRange(2, 1, spbSh.getLastRow() - 1, lastCol).getDisplayValues()
      .filter(row => row.some(v => String(v == null ? '' : v).trim() !== ''));
  }
  return {headers, data, spbData};
}

/* =========================================================
   MON BEBAN — API untuk menu Monitoring Beban
   Sumber: sheet BEBAN GI DAN PYL (kolom A:Y).
   Kontrak data disesuaikan dengan renderer di Index.html:
   A UP3, B PENYULANG, C:N bulanan, O:P beban siang/malam,
   S % pembebanan penyulang, T GI, W beban GI bulan berjalan.
   ========================================================= */
function monBebanNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  let s = String(value == null ? '' : value).trim();
  if (!s || s === '-') return null;
  s = s.replace(/\s/g, '');
  if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function getMonBebanData() {
  const ss = getDb_();
  const sh = ss.getSheetByName('BEBAN GI DAN PYL');
  if (!sh) throw new Error('Sheet "BEBAN GI DAN PYL" tidak ditemukan pada spreadsheet MONITORING AI BARA.');

  const lastRow = sh.getLastRow();
  const lastCol = Math.max(25, sh.getLastColumn());
  if (lastRow < 1) {
    return {headers: [], rows: [], up3Names: [], giNames: [], penyulangNames: [], blocks: {gi: [], penyulang: []}};
  }

  const values = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const headers = values[0] || [];
  const rows = values.filter((row, i) => i === 0 || row.some(v => String(v == null ? '' : v).trim() !== ''));
  const body = rows.slice(1);
  const unique = arr => [...new Set(arr.map(v => String(v == null ? '' : v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id', {numeric: true, sensitivity: 'base'}));

  const penyulang = body.map(r => ({
    up3: String(r[0] == null ? '' : r[0]).trim(),
    name: String(r[1] == null ? '' : r[1]).trim(),
    months: Array.from({length: 12}, (_, i) => monBebanNumber_(r[i + 2])),
    siang: monBebanNumber_(r[14]),
    malam: monBebanNumber_(r[15]),
    max: monBebanNumber_(r[16]),
    pctPyl: monBebanNumber_(r[18]),
    gi: String(r[19] == null ? '' : r[19]).trim(),
    daya: monBebanNumber_(r[20]),
    iNom: monBebanNumber_(r[21]),
    bebanGI: monBebanNumber_(r[22]),
    pctGI: monBebanNumber_(r[23]),
    keterangan: String(r[24] == null ? '' : r[24]).trim()
  })).filter(x => x.name || x.up3 || x.gi);

  const giMap = new Map();
  penyulang.forEach(item => {
    if (!item.gi) return;
    if (!giMap.has(item.gi)) {
      giMap.set(item.gi, {
        name: item.gi,
        up3s: [],
        feederNames: [],
        months: Array(12).fill(0),
        actualSep: null,
        siang: null,
        malam: null
      });
    }
    const gi = giMap.get(item.gi);
    if (item.up3 && !gi.up3s.includes(item.up3)) gi.up3s.push(item.up3);
    if (item.name && !gi.feederNames.includes(item.name)) gi.feederNames.push(item.name);
    item.months.forEach((v, i) => { if (v != null) gi.months[i] += v; });
    if (item.bebanGI != null) gi.actualSep = (gi.actualSep || 0) + item.bebanGI;
    if (item.siang != null) gi.siang = (gi.siang || 0) + item.siang;
    if (item.malam != null) gi.malam = (gi.malam || 0) + item.malam;
  });

  return {
    headers,
    rows,
    up3Names: unique(penyulang.map(x => x.up3)),
    giNames: unique(penyulang.map(x => x.gi)),
    penyulangNames: unique(penyulang.map(x => x.name)),
    blocks: {gi: Array.from(giMap.values()), penyulang}
  };
}

/* =========================================================
   MON KONTRAK VENDOR — tambahan terisolasi
   ========================================================= */
function getMonKontrakVendorData() {
  const ss = getDb_();
  const sh = ss.getSheetByName('MON KONTRAK VENDOR');
  if (!sh) throw new Error('Sheet "MON KONTRAK VENDOR" tidak ditemukan.');
  const lastRow = sh.getLastRow();
  const lastCol = Math.max(29, sh.getLastColumn());
  if (lastRow < 1) return {headers: [], rows: [], vendors: []};
  const values = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const headers = values[0].map(v => String(v == null ? '' : v).trim());
  const rows = values.slice(1).filter(r => r.some(v => String(v == null ? '' : v).trim() !== ''));
  // STATUS KONTRAK — sumber kolom AC (index 28), kelompok berdasarkan
  // Nomor Kontrak di kolom A (index 0). Status utama diambil dari baris
  // Nomor Kontrak. Jika AC pada baris induk kosong, cari status OPEN/CLOSE
  // pada baris lain di kelompok yang sama sebagai fallback. Setelah status
  // ditemukan, terapkan ke semua baris detail kelompok tersebut.
  rows.forEach(r => { while (r.length < 29) r.push(''); });
  const normalizeStatus = value => {
    const v = String(value == null ? '' : value).trim().toUpperCase();
    if (/\bOPEN\b/.test(v)) return 'OPEN';
    if (/\bCLOSE\b/.test(v)) return 'CLOSE';
    return '';
  };
  let group = [];
  const applyParentStatus = list => {
    if (!list.length) return;
    const parent = list.find(r => String(r[0] == null ? '' : r[0]).trim() !== '');
    if (!parent) return;
    // Prioritas: status AC di baris yang berisi Nomor Kontrak; jika kosong,
    // gunakan status AC eksplisit pertama yang ditemukan pada baris detail.
    const parentStatus = normalizeStatus(parent[28]);
    const detailStatus = list.map(r => normalizeStatus(r[28])).find(Boolean) || '';
    const status = parentStatus || detailStatus;
    list.forEach(r => { r[28] = status; });
  };
  rows.forEach(r => {
    const contract = String(r[0] == null ? '' : r[0]).trim();
    if (contract !== '') {
      applyParentStatus(group);
      group = [r];
    } else if (group.length) {
      group.push(r);
    }
  });
  applyParentStatus(group);
  const matSh = ss.getSheetByName('DATA WO DAN MIMS');
  if (matSh && matSh.getLastRow() >= 2) {
    const materialRows = matSh.getRange(2, 1, matSh.getLastRow() - 1, Math.max(5, matSh.getLastColumn())).getDisplayValues();
    const norm = v => String(v == null ? '' : v).trim().replace(/\s+/g, '');
    rows.forEach(r => {
      const key = norm(r[23]); // X = nomor WO atau MIMS
      if (!key) return;
      const found = materialRows.filter(m => norm(m[0]) === key || norm(m[1]) === key);
      if (!found.length) return;
      // Bila satu WO/MIMS mempunyai banyak material, simpan semua hasil pada sel
      // yang sama dipisahkan baris baru, tanpa menambah/menggeser baris template.
      // Pertahankan satu-ke-satu per baris sumber supaya SAP, nama, dan volume
      // tetap sejajar; jangan deduplikasi kolom secara terpisah.
      r[24] = found.map(m => String(m[2] || '').trim()).join('\n');
      r[25] = found.map(m => String(m[3] || '').trim()).join('\n');
      r[26] = found.map(m => String(m[4] || '').trim()).join('\n');
    });
  }
  // Simpan hasil lookup ke Y:AA agar kolom template terisi otomatis.
  if (rows.length && matSh) {
    const write = rows.map(r => [r[24] || '', r[25] || '', r[26] || '']);
    // Tulis hanya baris data yang benar-benar ada, sesuai urutan baris sumber.
    const sourceRows = values.slice(1).map((r, i) => ({r, rowNum: i + 2}))
      .filter(x => x.r.some(v => String(v == null ? '' : v).trim() !== ''));
    sourceRows.forEach((x, i) => {
      const r = rows[i] || [];
      if (String(x.r[23] || '').trim()) {
        sh.getRange(x.rowNum, 25, 1, 3).setValues([[r[24] || '', r[25] || '', r[26] || '']]);
      }
    });
  }
  const vendors = [...new Set(rows.map(r => String(r[1] || '').trim()).filter(Boolean))];
  // Diagnostics to distinguish an empty source sheet from a status-filter mismatch.
  const contractStatus = new Map();
  rows.forEach(r => {
    const contract = String(r[0] == null ? '' : r[0]).trim();
    if (!contract) return;
    const status = normalizeStatus(r[28]);
    if (status) contractStatus.set(contract, status);
  });
  const openContractCount = [...contractStatus.values()].filter(v => v === 'OPEN').length;
  const closeContractCount = [...contractStatus.values()].filter(v => v === 'CLOSE').length;
  const nonEmptySourceRows = values.slice(1).map((r, i) => ({r, rowNum: i + 2}))
    .filter(x => x.r.some(v => String(v == null ? '' : v).trim() !== ''));
  rows.forEach((r, i) => { r[29] = nonEmptySourceRows[i] ? nonEmptySourceRows[i].rowNum : 0; });
  return {headers, rows, vendors, sourceRowCount: rows.length,
    openContractCount, closeContractCount};
}


/* MON KONTRAK VENDOR — CRUD baris terisolasi */
function addMonKontrakVendorRow() {
  const sh = getDb_().getSheetByName('MON KONTRAK VENDOR');
  if (!sh) throw new Error('Sheet "MON KONTRAK VENDOR" tidak ditemukan.');
  const rowNum = Math.max(2, sh.getLastRow() + 1);
  sh.getRange(rowNum, 1, 1, 29).setValues([Array(29).fill('')]);
  return {ok:true, rowNum};
}
function saveMonKontrakVendorRow(payload) {
  if (!payload || !Array.isArray(payload.values)) throw new Error('Data baris tidak valid.');
  const sh = getDb_().getSheetByName('MON KONTRAK VENDOR');
  if (!sh) throw new Error('Sheet "MON KONTRAK VENDOR" tidak ditemukan.');
  const rowNum = Number(payload.rowNum);
  if (!Number.isInteger(rowNum) || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Nomor baris tidak valid.');
  const values = Array.from({length:29}, (_, i) => payload.values[i] == null ? '' : String(payload.values[i]));
  sh.getRange(rowNum, 1, 1, 29).setValues([values]);
  return {ok:true, rowNum};
}
function deleteMonKontrakVendorRow(rowNum) {
  const sh = getDb_().getSheetByName('MON KONTRAK VENDOR');
  if (!sh) throw new Error('Sheet "MON KONTRAK VENDOR" tidak ditemukan.');
  const n = Number(rowNum);
  if (!Number.isInteger(n) || n < 2 || n > sh.getLastRow()) throw new Error('Nomor baris tidak valid.');
  sh.deleteRow(n);
  return {ok:true, rowNum:n};
}


/* =========================================================
   MON KEBUTUHAN PELANGGAN — modul tambahan terisolasi
   Tidak mengubah fungsi/menu yang sudah ada.
   ========================================================= */
const MKP_SHEET_NAME = 'MON KEBUTUHAN PELANGGAN';
const MKP_HEADERS = [
  'NO','NAMA','TARIF','JENIS PLG','DAYA','PK','PROGRESS','NO PK','NO KONTRAK','ULP','KETERANGAN KENDALA',
  'TIANG 13','TIANG 9','A3CS 150','MVTIC','KABEL TANAM','TRF 400','TRF 250','TRF 200','TRF 160','TRF 100','TRF 50',
  'KONS A1','KONS A2','KONS A3','KONS B1','KONS B3','ISO TUMPU','ISO TARIK','SUSP','LA','DE','ADE',
  'PHBTR 1 TIANG','PHBTR 2 TIANG','FCO','ARRESTER','CUBICLE','NYY 70','NYY 150','LVTC',
  'KWH UKUR LANGSUNG','KWH UKUR TAK LANGSUNG','Pasca Bayar','Pra Bayar'
];
function getMKPSheet_(){
  const ss=getDb_(); let sh=ss.getSheetByName(MKP_SHEET_NAME);
  let created=false;
  if(!sh){
    sh=ss.insertSheet(MKP_SHEET_NAME); created=true;
    sh.getRange(1,1,1,MKP_HEADERS.length).setValues([MKP_HEADERS]);
    sh.setFrozenRows(1); sh.getRange(1,1,1,MKP_HEADERS.length).setFontWeight('bold');
  } else if(sh.getLastRow()<1){
    sh.getRange(1,1,1,MKP_HEADERS.length).setValues([MKP_HEADERS]);
    sh.setFrozenRows(1); sh.getRange(1,1,1,MKP_HEADERS.length).setFontWeight('bold');
  }
  // Migrasi satu kali: salin data lama dari MON PLG PERLUASAN hanya jika
  // sheet template masih kosong (header saja). Data yang sudah ada di template
  // tidak pernah ditimpa atau digandakan oleh refresh berikutnya.
  if(sh.getLastRow()<=1){
    const source=ss.getSheetByName('MON PLG PERLUASAN');
    if(source && source.getLastRow()>1){
      const sourceWidth=Math.max(source.getLastColumn(), MKP_HEADERS.length);
      const sourceValues=source.getRange(1,1,source.getLastRow(),sourceWidth).getDisplayValues();
      const norm=v=>String(v==null?'':v).trim().toUpperCase().replace(/\s+/g,' ').replace(/[._]/g,'');
      const srcHeaders=sourceValues[0].map(norm);
      const aliases={
        'JENIS PLG':['JENIS PELANGGAN'],
        'PK':['SPK'],
        'NO PK':['NOMOR PK'],
        'NO KONTRAK':['NOMOR KONTRAK'],
        'KETERANGAN KENDALA':['KETERANGAN KENDALA','KETERANGAN KEND'],
        'KWH UKUR LANGSUNG':['KWH UKUR LANGSUNG'],
        'KWH UKUR TAK LANGSUNG':['KWH UKUR TAK LANGSUNG'],
        'PASCA BAYAR':['PASCA BAYAR'],
        'PRA BAYAR':['PRA BAYAR']
      };
      const sourceIndexes=MKP_HEADERS.map(h=>{
        const candidates=[norm(h),...(aliases[h]||[]).map(norm)];
        return srcHeaders.findIndex(sh=>candidates.includes(sh));
      });
      const imported=sourceValues.slice(1)
        .filter(r=>r.some(v=>String(v==null?'':v).trim()!==''))
        .map(r=>MKP_HEADERS.map((h,i)=>{
          const si=sourceIndexes[i];
          let value=si>=0?String(r[si]??'').trim():'';
          if(h==='ULP' && value){
            const u=value.toUpperCase().replace(/^ULP\s*/, '').trim();
            const map={'NEGARA':'ULP Negara','GILIMANUK':'ULP Gilimanuk','SERIRIT':'ULP Seririt','SINGARAJA':'ULP Singaraja','TEJAKULA':'ULP Tejakula'};
            value=map[u]||value;
          }
          return value;
        }));
      if(imported.length){
        sh.getRange(2,1,imported.length,MKP_HEADERS.length).setValues(imported);
        sh.getRange(1,1,1,MKP_HEADERS.length).setFontWeight('bold');
        sh.setFrozenRows(1);
      }
    }
  }
  return sh;
}
function getMonKebutuhanPelangganData(){
  const sh=getMKPSheet_(), lastRow=sh.getLastRow();
  if(lastRow<2) return {headers:MKP_HEADERS,rows:[]};
  const raw=sh.getRange(1,1,lastRow,MKP_HEADERS.length).getDisplayValues();
  const headers=raw[0].map((v,i)=>String(v||MKP_HEADERS[i]).trim());
  const rows=raw.slice(1).map((r,i)=>Array.from({length:MKP_HEADERS.length},(_,j)=>r[j]??'').concat(i+2)).filter(r=>r.slice(0,MKP_HEADERS.length).some(v=>String(v??'').trim()!==''));
  return {headers,rows};
}
function addMonKebutuhanPelangganRow(){
  const sh=getMKPSheet_(), rowNum=Math.max(2,sh.getLastRow()+1);
  sh.getRange(rowNum,1,1,MKP_HEADERS.length).setValues([Array(MKP_HEADERS.length).fill('')]);
  return {ok:true,rowNum};
}
function saveMonKebutuhanPelangganRow(payload){
  if(!payload||!Array.isArray(payload.values)) throw new Error('Data baris tidak valid.');
  const sh=getMKPSheet_(), rowNum=Number(payload.rowNum);
  if(!Number.isInteger(rowNum)||rowNum<2||rowNum>sh.getLastRow()) throw new Error('Nomor baris tidak valid.');
  const values=Array.from({length:MKP_HEADERS.length},(_,i)=>payload.values[i]==null?'':String(payload.values[i]));
  sh.getRange(rowNum,1,1,MKP_HEADERS.length).setValues([values]);
  return {ok:true,rowNum};
}
function deleteMonKebutuhanPelangganRow(rowNum){
  const sh=getMKPSheet_(), n=Number(rowNum);
  if(!Number.isInteger(n)||n<2||n>sh.getLastRow()) throw new Error('Nomor baris tidak valid.');
  sh.deleteRow(n); return {ok:true,rowNum:n};
}
