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
5. Di Script Properties, buat `ADMIN_SETUP_KEY` dengan nilai rahasia acak panjang untuk setup akun admin pertama. Nilai ini dihapus otomatis setelah admin pertama berhasil dibuat.
6. Salin URL berakhiran `/exec`.
7. Jika `apps-script/Code.gs` diperbarui, buka Deploy > Manage deployments, pilih Edit, pilih New version, lalu deploy ulang. URL `/exec` pada deployment yang sama biasanya tetap digunakan.

Apps Script memeriksa sesi untuk semua operasi tulis dan pembacaan workflow. Endpoint dashboard publik mengembalikan ringkasan per program/tahun serta daftar terbatas kolom `NO.PRK`, `NO.RAB`, `URAIAN`, program, tahun, keterangan, angka rekap, dan proyeksi tagih. No. RAB disertakan agar baris RAB tanpa No. PRK tetap dapat dikenali. Nomor kontrak, nama vendor, tanggal jadwal, dan rincian workflow tidak dipublikasikan. Pastikan kebijakan organisasi mengizinkan publik melihat No. PRK, No. RAB, dan uraian sebelum mengaktifkan akses anonim.

Jika kolom `TOTAL PA` kosong tetapi transfer Finalisasi ke PA tersimpan, dashboard memakai saldo kumulatif dari riwayat transfer untuk mengisi tampilan. Pencocokan dilakukan dengan ID data, lalu nomor RAB atau PRK sebagai cadangan. Baris finalisasi tetap ditampilkan meskipun `TOTAL AKHIR` kosong; baris rincian RAB tanpa transfer yang cocok tetap dikecualikan. Data publik hanya menyertakan penanda boolean `paFinalized`, bukan rincian transfer. Deploy ulang versi Apps Script setelah perubahan pada `apps-script/Code.gs` agar pemulihan saldo ini aktif pada endpoint publik.

## Sinkronisasi Dashboard AI

Tombol **Sinkron DATA AI** pada Dashboard membaca tab `DATA AI` dari spreadsheet sumber `1E330xkEvgia8w4n43eWIg8_854sX3VS7zqcrO5rXdWc` dan mengganti daftar baris di `RABData` pada spreadsheet tujuan yang ditentukan oleh Script Property `SPREADSHEET_ID`. Jika diperlukan, ID spreadsheet sumber dapat diubah lewat Script Property `DASHBOARD_SOURCE_SPREADSHEET_ID`. Kolom dicocokkan berdasarkan nama header, bukan urutan, sehingga perbedaan posisi `RECORD ID` tidak menggeser data.

Setelah konfirmasi, nilai kolom yang tersedia pada sumber mengikuti `DATA AI` (termasuk nilai kosong). Untuk baris yang cocok melalui No. RAB, No. PA, No. WBS, atau kombinasi PRK/uraian/pos anggaran, aplikasi mempertahankan `RECORD ID` serta kolom aplikasi yang tidak tersedia pada sumber. Baris baru memperoleh ID baru; baris tujuan yang tidak memiliki pasangan di sumber tidak ikut dipertahankan. Deploy ulang Apps Script sebagai versi baru sebelum menggunakan tombol.

Pada kunjungan pertama, dashboard publik menampilkan tombol **Setup Admin**. Isi `ADMIN_SETUP_KEY`, nama, username, dan kata sandi admin minimal 12 karakter. Setelah admin dibuat, kunci setup dihapus dari Script Properties. Admin kemudian dapat membuat akun **Tim Perencanaan** dan **Viewer** pada menu Manajemen User. Viewer hanya dapat membaca; semua perubahan juga ditolak oleh server, bukan sekadar disembunyikan di antarmuka.

## Deploy ke GitHub dan Vercel

1. Buat repository GitHub, lalu push folder `rab-dashboard` sebagai root repository.
2. Import repository tersebut ke Vercel; framework Vite akan terdeteksi otomatis.
3. Tambahkan environment variable `APPS_SCRIPT_URL` di Vercel dengan URL Web App `/exec`, lalu redeploy.

File `api/apps-script.js` meneruskan permintaan browser ke Apps Script dari sisi server, sehingga URL spreadsheet tidak ditanam dalam bundle frontend.

## Impor workbook

Pilih file `.xlsx`. Aplikasi mencari sheet `DATA ANGGARAN INVESTASI` atau `DATA PENGADAAN` dengan header `NO.PRK`, `URAIAN`, `TOTAL RAB`, dan `NILAI KONTRAK`; sheet lain dengan header yang sama juga dapat digunakan. Impor mengganti seluruh dataset aktif. Ekspor menghasilkan workbook rekap A-AG.

Kolom yang dipetakan meliputi No. PRK, No. PRK SKKI/Fix, No. WBS, Pos Anggaran, No. RAB, No. PA, Uraian, Total PRK, Relokasi, Revisi SKKI, Total Akhir, Total RAB/PA, No. Kontrak, Vendor, Nilai Kontrak, Pengembalian PA, Penggantian Biaya, Tagihan, Total Bayar, Sisa PRK, Program, Tahun Anggaran, Keterangan, serta kolom AA-AG: Tanggal Awal, Tanggal Akhir, Rencana Kontrak, Rencana Tagih, Progress, Proyeksi Tagih, dan Tanggal Bayar.

Tombol **Impor Master** mengimpor hanya sheet `FORM MATERIAL & HARGA` dan/atau `DATABASE KEGIATAN`; file tidak perlu berisi sheet RAB. Impor ini hanya menyimpan master ke tab workflow masing-masing, tidak menulis `RABData` dan tidak menjalankan sinkronisasi atau hitung ulang total RAB. Data master manual tetap dipertahankan, sedangkan master hasil impor sebelumnya diperbarui dengan isi workbook terbaru. Perubahan master dapat memengaruhi pilihan material/kegiatan untuk entri berikutnya.

Dashboard setelah login menampilkan AI Total dan ringkasan total RAB, PA, kontrak, tagihan, pembayaran, serta sisa PRK. Rincian Murni dan Lanjutan/Luncuran ditampilkan di bawah ringkasan utama dengan persentase dua desimal. Dashboard publik memakai tata letak ringkasan dan kartu program pada gambar revisi. Kedua dashboard hanya menghitung baris PRK yang memiliki nilai `TOTAL AKHIR` (kolom L), sehingga baris detail yang mengulang angka tidak terhitung ganda; tagihan dan pembayaran dibandingkan dengan nilai kontrak. Sisa PRK hanya dihitung dan dijumlahkan pada baris yang memiliki `NO.PRK`, dengan rumus `TOTAL AKHIR - TOTAL RAB - TOTAL PA`; baris detail tanpa No. PRK tidak menambah nilai sisa.

## Alur Input RAB dan Realisasi

1. **Input Material**: buat master material dengan kriteria TM/TR, satuan, harga material, satu tarif jasa per satuan, dan jenis MDU/NON MDU. Impor workbook juga mengambil daftar harga dari `FORM MATERIAL & HARGA`.
2. **Master Kegiatan**: kelola paket pekerjaan, nama komponen pekerjaan, satuan, kriteria, dan PRK acuan; data impor `DATABASE KEGIATAN` menjadi sumber pilihan PRK dan komponen pekerjaan.
3. **RAB Komponen**: pilih PRK, pilih kegiatan, lalu pilih komponen pekerjaan dari `DATABASE KEGIATAN`. Filter keterangan, kriteria, dan MDU/NON MDU serta material, satuan, dan harga terkait muncul otomatis. Isi volume setiap material untuk menyimpan RAB Komponen per PRK.
4. **RAB Kegiatan**: pilih PRK lalu kegiatan. Daftar komponen pekerjaan dan jumlah material/jasanya direkap dari RAB Komponen; tidak ada input volume pada tahap ini. Simpan rekap untuk mencatatnya ke Google Sheets; pajak dihitung dari subtotal rekap.
4. **Finalisasi PA**: setelah RAB kegiatan disepakati, alihkan saldo RAB ke PA.
5. **Realisasi**: catat tanggal, volume terlaksana, nilai tagihan, dan nilai dibayar. Sisa volume ditampilkan pada tabel RAB Kegiatan.

Workflow memakai tab terpisah yang dibuat otomatis oleh Apps Script: `RAB_MATERIAL`, `DATABASE_KEGIATAN`, `RAB_KOMPONEN`, `RAB_KEGIATAN`, `REKAP_MATERIAL`, `PA_TRANSFERS`, dan `REALISASI`. Data hasil impor rekap tetap berada di tab `RABData`.

Setiap tab workflow menyimpan nilai dalam kolom terpisah agar mudah dibaca dan difilter di Google Sheets. Setelah memperbarui dan men-deploy Apps Script, pemuatan workflow pertama akan mengonversi baris lama berformat `DATA_JSON` menjadi kolom tanpa membuang datanya.

## Penyimpanan Monitoring

Menu Monitoring membaca dan menyimpan data terpusat di spreadsheet yang sama dengan `SPREADSHEET_ID`. Setelah perubahan `apps-script/Code.gs` di-deploy sebagai versi baru, tab Monitoring dibuat otomatis ketika data pertama kali disimpan: `MON_SPB`, `MON_STOCK_GUDANG`, `MON_BEBAN`, `MON_DATABASE_RAB`, `MON_TIBET`, `MON_KONTRAK_VENDOR`, dan `MON_KEBUTUHAN_PELANGGAN`. Tidak perlu membuat tab tersebut secara manual.

Impor workbook Monitoring menyimpan ketujuh dataset ke tab masing-masing. Tambah kontrak, tambah kebutuhan pelanggan, dan simpan material RAB juga langsung memperbarui Google Sheets. Jika data lama masih hanya ada di localStorage browser, gunakan tombol **Simpan data browser ke Google Sheets** yang tampil saat tab Monitoring di Google Sheets belum berisi data. Pemuatan ulang menu selanjutnya membaca data dari spreadsheet.

Menu **Monitoring Tibet** mengambil data dari sheet `MONITORING TIBET` pada spreadsheet sumber `1E330xkEvgia8w4n43eWIg8_854sX3VS7zqcrO5rXdWc`. Saat menu dibuka, aplikasi otomatis menarik data terbaru dan menyimpannya pada tab `MON_TIBET` di spreadsheet aplikasi. Tombol **Sinkronkan Data** mengulangi proses tersebut kapan saja. Menu ini juga dapat mengimpor workbook Excel yang hanya berisi sheet `MONITORING TIBET`; menu lain tetap dapat mengimpor workbook lengkap. Dashboard menyediakan filter No KR, ringkasan 8 kartu, grafik volume KR/PK ukuran 9 dan 13 per program, serta grafik volume KR ukuran 9 dan 13 per vendor. Kartu Sisa PK menghitung jumlah KR tanpa nomor PK yang valid; kartu Belum Terpasang menjumlahkan kolom `BLM PSG`.

Sebelum sinkronisasi pertama, deploy versi terbaru `apps-script/Code.gs` sebagai versi baru Web App. Jika deployment lama masih aktif, aplikasi menampilkan pesan bahwa konfigurasi sheet sumber/header belum cocok.

Setelah RAB kegiatan disepakati, **Finalisasi RAB ke PA** meminta konfirmasi, menolak transfer di atas saldo RAB, mengurangi `TOTAL RAB`, menambah `TOTAL PA`, dan mengisi `NILAI KONTRAK` dengan saldo PA terbaru. Nomor kontrak dan vendor pemenang dilengkapi melalui menu **Data Kontrak**; nilai kontrak dapat diedit di sana. Pembatalan transfer mengembalikan saldo RAB, PA, dan nilai kontrak ke posisi sebelumnya. Setiap transfer dicatat di `PA_TRANSFERS` dengan saldo sebelum/sesudah.

Realisasi volume, tagihan, dan pembayaran tersimpan di tab `REALISASI`. Total tagihan dan pembayaran dari seluruh entri kegiatan pada PRK yang sama otomatis dijumlahkan ke kolom `TAGIHAN` dan `TOTAL BAYAR` di `RABData`, serta diperbarui kembali ketika entri realisasi diedit atau dihapus. Aplikasi tidak menjalankan proses tender atau menerbitkan kontrak.

Setiap baris impor memakai ID internal berbasis sheet dan nomor baris, termasuk baris yang hanya memiliki No. RAB. Apps Script menyimpan ID tersebut pada kolom `RECORD ID` agar total RAB, referensi kegiatan, dan transfer tetap mengarah ke record yang sama. Sebelum deployment, jalankan `npm run lint` dan `npm run build`; setelah mengubah Apps Script, deploy sebagai versi baru dan uji endpoint `?action=health` serta satu transfer pada spreadsheet uji.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
