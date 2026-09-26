# RAB Monitor

Dashboard rekap dan monitoring RAB berbasis React, Vite, Tailwind CSS, Google Sheets, dan Google Apps Script. Aplikasi ini tidak menangani tender maupun penerbitan kontrak; nomor, vendor, dan nilai kontrak dicatat manual untuk kebutuhan rekap.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Tanpa konfigurasi cloud, perubahan tersimpan di browser yang sedang digunakan. Untuk mengaktifkan Google Sheets saat pengembangan lokal, salin `.env.example` menjadi `.env.local`, isi URL Web App Apps Script, lalu mulai ulang Vite.

## Menyiapkan Google Sheets

1. Buat Google Spreadsheet untuk basis data.
2. Buka Extensions > Apps Script, salin isi `apps-script/Code.gs`, lalu simpan.
3. Di Apps Script, buka Project Settings > Script Properties dan buat `SPREADSHEET_ID` dengan ID spreadsheet.
4. Deploy sebagai Web app. Jalankan sebagai akun pemilik dan atur akses sesuai kebijakan organisasi Anda.
5. Salin URL berakhiran `/exec`.
6. Jika `apps-script/Code.gs` diperbarui, buka Deploy > Manage deployments, pilih Edit, pilih New version, lalu deploy ulang. URL `/exec` pada deployment yang sama biasanya tetap digunakan.

Akses web app Apps Script harus mengikuti kebijakan keamanan organisasi. Siapa pun yang dapat mengakses endpoint dapat membaca dan menulis rekap; pembatasan pengguna perlu ditambahkan sebelum data operasional sensitif dipublikasikan.

## Deploy ke GitHub dan Vercel

1. Buat repository GitHub, lalu push folder `rab-dashboard` sebagai root repository.
2. Import repository tersebut ke Vercel; framework Vite akan terdeteksi otomatis.
3. Tambahkan environment variable `APPS_SCRIPT_URL` di Vercel dengan URL Web App `/exec`, lalu redeploy.

File `api/apps-script.js` meneruskan permintaan browser ke Apps Script dari sisi server, sehingga URL spreadsheet tidak ditanam dalam bundle frontend.

## Impor workbook

Pilih file `.xlsx`. Aplikasi mencari sheet `DATA ANGGARAN INVESTASI` atau `DATA PENGADAAN` dengan header `NO.PRK`, `URAIAN`, `TOTAL RAB`, dan `NILAI KONTRAK`; sheet lain dengan header yang sama juga dapat digunakan. Impor mengganti seluruh dataset aktif. Ekspor menghasilkan workbook rekap A-Z.

Kolom yang dipetakan meliputi No. PRK, No. PRK SKKI/Fix, No. WBS, Pos Anggaran, No. RAB, No. PA, Uraian, Total PRK, Relokasi, Revisi SKKI, Total Akhir, Total RAB/PA, No. Kontrak, Vendor, Nilai Kontrak, Pengembalian PA, Penggantian Biaya, Tagihan, Total Bayar, Sisa PRK, Program, Tahun Anggaran, dan Keterangan.

## Alur Input RAB dan Realisasi

1. **Input Material**: buat master material dengan kriteria TM/TR, satuan, harga material, jasa pasang/bongkar, dan jenis MDU/NON MDU.
2. **RAB Komponen**: kelompokkan komponen berdasarkan kriteria dan nama kegiatan; pilih material dari master atau masukkan harga manual serta kebutuhan per satuan kegiatan.
3. **RAB Kegiatan**: pilih PRK dari hasil impor, kriteria, kegiatan, satuan, dan volume. Nilai RAB dihitung dari jumlah (kebutuhan komponen x harga material/jasa) x volume kegiatan.
4. **Rekap Material**: kebutuhan dihitung dari volume RAB x kebutuhan material per satuan, lalu dibandingkan dengan pemakaian aktual.
5. **Realisasi**: catat tanggal, volume terlaksana, nilai tagihan, dan nilai dibayar. Sisa volume ditampilkan pada tabel RAB Kegiatan.

Workflow memakai tab terpisah yang dibuat otomatis oleh Apps Script: `RAB_MATERIAL`, `RAB_KOMPONEN`, `RAB_KEGIATAN`, `REKAP_MATERIAL`, dan `REALISASI`. Data hasil impor rekap tetap berada di tab `RABData`.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
