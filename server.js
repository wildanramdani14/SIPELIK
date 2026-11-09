const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

// Database Driver (Supports SQLite3 locally, with auto-fallback to JSON DB for Netlify / Serverless environments)
const isNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
let db;

if (isNetlify) {
    // Pure JavaScript adapter for Netlify Functions (eliminates GLIBC native binary errors)
    db = require('./js/jsondb.js');
} else {
    try {
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = path.resolve(__dirname, 'database.db');
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.warn('SQLite error, fallback to JSON DB:', err.message);
                db = require('./js/jsondb.js');
            } else {
                initSqliteTables(db);
            }
        });
    } catch (e) {
        db = require('./js/jsondb.js');
    }
}

function initSqliteTables(sqliteDb) {
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT,
        lat REAL,
        lng REAL,
        date TEXT,
        status TEXT,
        desc TEXT,
        img TEXT,
        assignedPetugasId INTEGER,
        assignedPetugasName TEXT,
        adminNotes TEXT,
        petugasNotes TEXT,
        petugasProofImg TEXT,
        reporterName TEXT DEFAULT 'Ahmad Mahasiswa'
    )`, () => {
        const columnsToAdd = [
            'assignedPetugasId INTEGER',
            'assignedPetugasName TEXT',
            'assignedPetugasPhone TEXT',
            'adminNotes TEXT',
            'petugasNotes TEXT',
            'petugasProofImg TEXT',
            "reporterName TEXT DEFAULT 'Ahmad Mahasiswa'"
        ];
        columnsToAdd.forEach(col => {
            sqliteDb.run(`ALTER TABLE reports ADD COLUMN ${col}`, () => {});
        });
    });

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        phone TEXT,
        specialization TEXT,
        status TEXT DEFAULT 'Aktif',
        createdAt TEXT
    )`, () => {
        sqliteDb.get("SELECT COUNT(*) as count FROM users", (err, row) => {
            if (!err && row && row.count === 0) {
                const seedUsers = [
                    ['Dr. H. Ahmad Fauzi, M.T.', 'superadmin', '123', 'superadmin', '081234567890', 'Kepala Pengelola Kampus', 'Aktif', '2026-09-01'],
                    ['Rina Kusuma, S.Kom', 'admin', '123', 'admin', '081298765432', 'Admin Layanan Pengaduan', 'Aktif', '2026-09-02'],
                    ['Bayu Pratama, S.T', 'admin2', '123', 'admin', '081255554444', 'Admin Sarana Prasarana', 'Aktif', '2026-09-03'],
                    ['Pak Joko Santoso', 'petugas1', '123', 'petugas', '081311112222', 'Kebersihan & Sanitasi Gedung', 'Aktif', '2026-09-04'],
                    ['Kang Asep Saepudin', 'petugas2', '123', 'petugas', '081333334444', 'Fasilitas & Kelistrikan', 'Aktif', '2026-09-05'],
                    ['Pak Hendra Gunawan', 'petugas3', '123', 'petugas', '081355556666', 'Sarpras & Lingkungan Luar', 'Aktif', '2026-09-06'],
                    ['Ahmad Mahasiswa', 'mahasiswa', '123', 'user', '085712345678', 'Mahasiswa', 'Aktif', '2026-09-07']
                ];
                const stmt = sqliteDb.prepare("INSERT INTO users (name, username, password, role, phone, specialization, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                seedUsers.forEach(u => stmt.run(u));
                stmt.finalize();
                console.log('Seeded default users (superadmin, admin, petugas, user)');
            }
        });
    });
}

const { checkCampusGeofence } = require('./js/geofence.js');

// --- ROUTER CONFIGURATION (Compatible with Local & Netlify Serverless) ---
const router = express.Router();

// Default accounts fallback (ensures login reliability across serverless cold starts)
const DEFAULT_AUTH_USERS = [
    { id: 1, name: 'Dr. H. Ahmad Fauzi, M.T.', username: 'superadmin', password: '123', role: 'superadmin', phone: '081234567890', specialization: 'Kepala Pengelola Kampus', status: 'Aktif' },
    { id: 2, name: 'Rina Kusuma, S.Kom', username: 'admin', password: '123', role: 'admin', phone: '081298765432', specialization: 'Admin Layanan Pengaduan', status: 'Aktif' },
    { id: 3, name: 'Bayu Pratama, S.T', username: 'admin2', password: '123', role: 'admin', phone: '081255554444', specialization: 'Admin Sarana Prasarana', status: 'Aktif' },
    { id: 7, name: 'Ahmad Mahasiswa', username: 'mahasiswa', password: '123', role: 'user', phone: '085712345678', specialization: 'Mahasiswa', status: 'Aktif' }
];

// --- AUTH ROUTES ---
router.post('/login', (req, res) => {
    let { username, password } = req.body || {};
    username = (username || '').trim();
    password = (password || '').trim();

    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password wajib diisi!' });
    }

    const query = "SELECT id, name, username, role, phone, specialization, status FROM users WHERE (LOWER(username) = LOWER(?) OR phone = ?) AND password = ?";
    const params = [username, username, password];

    db.get(query, params, (err, user) => {
        if (!err && user) {
            if (user.status !== 'Aktif') return res.status(403).json({ error: 'Akun ini dinonaktifkan oleh Super Admin.' });
            if (user.role === 'petugas') {
                return res.status(403).json({ 
                    error: 'Petugas lapangan tidak menggunakan akun login web. Seluruh penugasan kerja dikoordinasikan langsung oleh Admin Layanan via WhatsApp.' 
                });
            }
            return res.json({ message: 'Login berhasil', user });
        }

        // Fallback: periksa kredensial akun default (melindungi dari race-condition cold start serverless)
        const fallback = DEFAULT_AUTH_USERS.find(u => (u.username.toLowerCase() === username.toLowerCase() || u.phone === username) && u.password === password);
        if (fallback) {
            const { password: _, ...safeUser } = fallback;
            // Pastikan data tersimpan di tabel database
            db.run(
                "INSERT OR IGNORE INTO users (id, name, username, password, role, phone, specialization, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [fallback.id, fallback.name, fallback.username, fallback.password, fallback.role, fallback.phone, fallback.specialization, fallback.status],
                () => {}
            );
            return res.json({ message: 'Login berhasil', user: safeUser });
        }

        return res.status(401).json({ error: 'Username atau password salah! Pastikan kredensial benar.' });
    });
});

// --- USER MANAGEMENT ROUTES (Super Admin) ---
router.get('/users', (req, res) => {
    const { role } = req.query;
    let query = "SELECT id, name, username, role, phone, specialization, status, createdAt FROM users";
    let params = [];
    if (role) {
        query += " WHERE role = ?";
        params.push(role);
    }
    query += " ORDER BY id DESC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/users', (req, res) => {
    let { name, username, password, role, phone, specialization } = req.body;
    if (!name || !role) {
        return res.status(400).json({ error: 'Nama dan peran wajib diisi!' });
    }

    // Petugas lapangan adalah kontak operasional, tidak memerlukan login
    if (role === 'petugas') {
        if (!username) username = 'petugas_' + Date.now();
        if (!password) password = 'no_login_petugas';
    } else {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password wajib diisi untuk akun Admin!' });
        }
    }

    const now = new Date().toISOString().split('T')[0];
    db.run(
        "INSERT INTO users (name, username, password, role, phone, specialization, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'Aktif', ?)",
        [name, username, password, role, phone || '-', specialization || '-', now],
        function (err) {
            if (err) {
                if (err.message && err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Username sudah digunakan, silakan pilih username lain!' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, message: 'Data pengguna/kontak berhasil ditambahkan' });
        }
    );
});

router.put('/users/:id', (req, res) => {
    const { name, password, phone, specialization, status, role } = req.body;
    
    let fields = [];
    let values = [];
    if (name) { fields.push("name = ?"); values.push(name); }
    if (password) { fields.push("password = ?"); values.push(password); }
    if (phone !== undefined) { fields.push("phone = ?"); values.push(phone); }
    if (specialization !== undefined) { fields.push("specialization = ?"); values.push(specialization); }
    if (status) { fields.push("status = ?"); values.push(status); }
    if (role) { fields.push("role = ?"); values.push(role); }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada data untuk diupdate' });
    values.push(req.params.id);

    db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes, message: 'Data pengguna berhasil diperbarui' });
    });
});

router.delete('/users/:id', (req, res) => {
    db.get("SELECT role, username FROM users WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.username === 'superadmin') {
            return res.status(403).json({ error: 'Akun Super Admin utama tidak dapat dihapus!' });
        }

        db.run("DELETE FROM users WHERE id = ?", req.params.id, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ changes: this.changes, message: 'Pengguna berhasil dihapus' });
        });
    });
});

// --- REPORT ROUTES (Admin Biasa, Petugas, User) ---
router.get('/reports', (req, res) => {
    const { petugasId, status } = req.query;
    let query = `
        SELECT r.*, u.phone AS petugasPhone 
        FROM reports r 
        LEFT JOIN users u ON r.assignedPetugasId = u.id
    `;
    let params = [];
    let conditions = [];

    if (petugasId) {
        conditions.push("r.assignedPetugasId = ?");
        params.push(petugasId);
    }
    if (status) {
        conditions.push("r.status = ?");
        params.push(status);
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY r.id DESC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(row => {
            if (!row.assignedPetugasPhone && row.petugasPhone) {
                row.assignedPetugasPhone = row.petugasPhone;
            }
        });
        res.json(rows);
    });
});

router.post('/reports', (req, res) => {
    const { location, lat, lng, date, status, desc, img, reporterName } = req.body;

    // Validasi Geofence wilayah kampus
    const geo = checkCampusGeofence(lat, lng);
    if (!geo.inside) {
        return res.status(400).json({ 
            error: 'Lokasi pengaduan berada di luar wilayah kampus! Laporan hanya dapat dikirim dari area kampus yang telah ditentukan.' 
        });
    }

    db.run(
        "INSERT INTO reports (location, lat, lng, date, status, desc, img, reporterName) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [location, lat, lng, date, status || 'Menunggu', desc, img, reporterName || 'Ahmad Mahasiswa'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, zone: geo.zoneName });
        }
    );
});

// Disposisi / Penugasan oleh Admin Biasa ke Petugas
router.put('/reports/:id/assign', (req, res) => {
    const { assignedPetugasId, assignedPetugasName, assignedPetugasPhone, adminNotes } = req.body;
    if (!assignedPetugasId || !assignedPetugasName) {
        return res.status(400).json({ error: 'Pilih petugas yang akan ditugaskan!' });
    }

    db.run(
        `UPDATE reports SET 
            assignedPetugasId = ?,
            assignedPetugasName = ?,
            assignedPetugasPhone = ?,
            adminNotes = ?,
            status = 'Diproses'
         WHERE id = ?`,
        [assignedPetugasId, assignedPetugasName, assignedPetugasPhone || '', adminNotes || 'Segera ditindaklanjuti oleh petugas.', req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Laporan berhasil ditugaskan ke petugas!', changes: this.changes });
        }
    );
});

// Update Progres & Bukti Pengerjaan oleh Petugas Lapangan
router.put('/reports/:id/progress', (req, res) => {
    const { petugasNotes, petugasProofImg, status } = req.body;

    db.run(
        `UPDATE reports SET 
            petugasNotes = COALESCE(?, petugasNotes),
            petugasProofImg = COALESCE(?, petugasProofImg),
            status = COALESCE(?, status)
         WHERE id = ?`,
        [petugasNotes, petugasProofImg, status || 'Selesai', req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Progres penanganan berhasil dilaporkan!', changes: this.changes });
        }
    );
});

router.put('/reports/:id', (req, res) => {
    const { location, lat, lng, status, desc, adminNotes, petugasNotes, petugasProofImg, assignedPetugasId, assignedPetugasName } = req.body;

    // Validasi Geofence jika koordinat diperbarui
    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
        const geo = checkCampusGeofence(lat, lng);
        if (!geo.inside) {
            return res.status(400).json({ 
                error: 'Lokasi pembaruan berada di luar wilayah kampus yang telah ditentukan!' 
            });
        }
    }

    let fields = [];
    let values = [];

    if (location !== undefined) { fields.push("location = ?"); values.push(location); }
    if (lat !== undefined) { fields.push("lat = ?"); values.push(lat); }
    if (lng !== undefined) { fields.push("lng = ?"); values.push(lng); }
    if (status !== undefined) { fields.push("status = ?"); values.push(status); }
    if (desc !== undefined) { fields.push("desc = ?"); values.push(desc); }
    if (adminNotes !== undefined) { fields.push("adminNotes = ?"); values.push(adminNotes); }
    if (petugasNotes !== undefined) { fields.push("petugasNotes = ?"); values.push(petugasNotes); }
    if (petugasProofImg !== undefined) { fields.push("petugasProofImg = ?"); values.push(petugasProofImg); }
    if (assignedPetugasId !== undefined) { fields.push("assignedPetugasId = ?"); values.push(assignedPetugasId); }
    if (assignedPetugasName !== undefined) { fields.push("assignedPetugasName = ?"); values.push(assignedPetugasName); }

    if (fields.length === 0) {
        return res.json({ message: 'Tidak ada perubahan data' });
    }

    values.push(req.params.id);
    db.run(`UPDATE reports SET ${fields.join(', ')} WHERE id = ?`, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes, message: 'Laporan berhasil diperbarui' });
    });
});

router.delete('/reports/:id', (req, res) => {
    db.run("DELETE FROM reports WHERE id = ?", req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes, message: 'Laporan berhasil dihapus' });
    });
});

// Mount Routes (Supports Local /api, Netlify Functions, and Root)
app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/', router);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = app;
