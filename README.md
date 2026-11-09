# SIPELIK - Sistem Pengaduan & Layanan Kampus
**UIN Siber Syekh Nurjati Cirebon**

SIPELIK adalah platform web responsif terpadu untuk pelaporan fasilitas kampus berbasis titik koordinat peta (Geofencing Kampus) dan integrasi langsung ke WhatsApp Petugas Lapangan.

---

## 🚀 Fitur Utama

- 📍 **Peta & Geofencing Kampus**: Validasi pelaporan mahasiswa wajib berada di dalam area batas wilayah kampus UIN Siber Syekh Nurjati Cirebon (Rektorat, FTIK, FUAD, FEBI, Pascasarjana, dll).
- 💬 **Disposisi Cepat via WhatsApp**: Admin layanan dapat langsung meneruskan penugasan laporan kepada Petugas Lapangan melalui WhatsApp lengkap dengan draf pesan otomatis dan lokasi.
- 📸 **Verifikasi & Bukti Lapangan**: Petugas dan Admin dapat mengunggah foto bukti penanganan selesai secara langsung di sistem.
- 📊 **Dashboard & Statistik**: Pantau status laporan (Menunggu, Diproses, Selesai) lengkap dengan filter dan visualisasi grafik Chart.js.
- 🖨️ **Cetak Laporan**: Fitur cetak laporan formal per halaman siap cetak/PDF dengan kop resmi dan kolom tanda tangan.
- 📱 **Desain Responsif**: Nyaman diakses dari perangkat mobile (smartphone) maupun desktop.

---

## 👥 Akun Login Uji Coba

| Peran | Username | Password | Keterangan |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin` | `123` | Akses penuh ringkasan sistem, kelola admin, kelola petugas & monitoring pengaduan |
| **Admin Layanan** | `admin` | `123` | Verifikasi laporan masuk, teruskan tugas ke WhatsApp petugas, update status |
| **Mahasiswa / User**| `mahasiswa` | `123` | Buat laporan baru dengan foto bukti & titik peta |

*Catatan: Petugas lapangan dikoordinasikan langsung melalui nomor WhatsApp tanpa perlu login akun web.*

---

## 💻 Menjalankan di Komputer Lokal

1. Pastikan Anda telah menginstal **Node.js** (versi 18+ disarankan).
2. Install dependensi:
   ```bash
   npm install
   ```
3. Jalankan server:
   ```bash
   npm start
   ```
4. Buka browser di `http://localhost:3000`

---

## ☁️ Panduan Deploy ke Netlify

Projek ini sudah dilengkapi dengan konfigurasi **Netlify Serverless Functions** (`netlify/functions/api.js` & `netlify.toml`):

1. Masuk ke akun **[Netlify](https://app.netlify.com/)**.
2. Klik **"Add new site"** ➔ **"Import an existing project"**.
3. Pilih penyedia **GitHub** dan pilih repository **`wildanramdani14/SIPELIK`**.
4. Netlify akan membaca file konfigurasi `netlify.toml` secara otomatis:
   - **Build command**: `npm run build`
   - **Publish directory**: `.`
   - **Functions directory**: `netlify/functions`
5. Klik **"Deploy SIPELIK"**. Netlify akan membuat URL live (contoh: `https://sipelik.netlify.app`).
