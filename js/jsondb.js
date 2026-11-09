// jsondb.js - Pure JavaScript fallback database adapter for Netlify & Serverless runtimes
const fs = require('fs');
const path = require('path');
const os = require('os');

const isNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

const candidatePaths = [
    path.resolve(__dirname, '..', 'database.json'),
    path.resolve(process.cwd(), 'database.json'),
    path.resolve(__dirname, '../../database.json')
];
const sourceJsonPath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];

let targetJsonPath = sourceJsonPath;
if (isNetlify) {
    targetJsonPath = path.join(os.tmpdir(), 'database.json');
    if (!fs.existsSync(targetJsonPath)) {
        try {
            if (fs.existsSync(sourceJsonPath)) {
                fs.copyFileSync(sourceJsonPath, targetJsonPath);
            }
        } catch (e) {
            console.error('Failed copying database.json to tmpdir:', e);
        }
    }
}

let store = { users: [], reports: [] };

function loadStore() {
    try {
        if (fs.existsSync(targetJsonPath)) {
            const raw = fs.readFileSync(targetJsonPath, 'utf8');
            store = JSON.parse(raw);
            if (!Array.isArray(store.users)) store.users = [];
            if (!Array.isArray(store.reports)) store.reports = [];
        }
    } catch (e) {
        console.error('Error loading database.json:', e);
    }
}

function saveStore() {
    try {
        fs.writeFileSync(targetJsonPath, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving database.json:', e);
    }
}

loadStore();

// Default seed users if empty
if (store.users.length === 0) {
    store.users = [
        { id: 1, name: 'Dr. H. Ahmad Fauzi, M.T.', username: 'superadmin', password: '123', role: 'superadmin', phone: '081234567890', specialization: 'Kepala Pengelola Kampus', status: 'Aktif', createdAt: '2026-09-01' },
        { id: 2, name: 'Rina Kusuma, S.Kom', username: 'admin', password: '123', role: 'admin', phone: '081298765432', specialization: 'Admin Layanan Pengaduan', status: 'Aktif', createdAt: '2026-09-02' },
        { id: 3, name: 'Bayu Pratama, S.T', username: 'admin2', password: '123', role: 'admin', phone: '081255554444', specialization: 'Admin Sarana Prasarana', status: 'Aktif', createdAt: '2026-09-03' },
        { id: 4, name: 'Pak Joko Santoso', username: 'petugas1', password: '123', role: 'petugas', phone: '081311112222', specialization: 'Kebersihan & Sanitasi Gedung', status: 'Aktif', createdAt: '2026-09-04' },
        { id: 5, name: 'Kang Asep Saepudin', username: 'petugas2', password: '123', role: 'petugas', phone: '081333334444', specialization: 'Fasilitas & Kelistrikan', status: 'Aktif', createdAt: '2026-09-05' },
        { id: 6, name: 'Pak Hendra Gunawan', username: 'petugas3', password: '123', role: 'petugas', phone: '081355556666', specialization: 'Sarpras & Lingkungan Luar', status: 'Aktif', createdAt: '2026-09-06' },
        { id: 7, name: 'Ahmad Mahasiswa', username: 'mahasiswa', password: '123', role: 'user', phone: '085712345678', specialization: 'Mahasiswa', status: 'Aktif', createdAt: '2026-09-07' }
    ];
    saveStore();
}

const dbAdapter = {
    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        callback = callback || (() => {});
        params = params || [];
        loadStore();

        const s = sql.toLowerCase();

        // 1. Login query: SELECT ... FROM users WHERE (LOWER(username) = LOWER(?) OR phone = ?) AND password = ?
        if (s.includes('from users') && s.includes('password = ?')) {
            const usernameInput = (params[0] || '').toString().toLowerCase();
            const phoneInput = (params[1] || '').toString();
            const passwordInput = (params[2] || '').toString();

            const found = store.users.find(u =>
                (u.username.toLowerCase() === usernameInput || (u.phone && u.phone === phoneInput)) &&
                u.password === passwordInput
            );
            return callback(null, found ? { ...found } : undefined);
        }

        // 2. Count users: SELECT COUNT(*) as count FROM users
        if (s.includes('count(*)') && s.includes('users')) {
            return callback(null, { count: store.users.length });
        }

        // 3. User by ID: SELECT ... FROM users WHERE id = ?
        if (s.includes('from users') && s.includes('id = ?')) {
            const id = parseInt(params[0]);
            const found = store.users.find(u => u.id === id);
            return callback(null, found ? { ...found } : undefined);
        }

        // 4. Report by ID: SELECT ... FROM reports WHERE id = ?
        if (s.includes('from reports') && s.includes('id = ?')) {
            const id = parseInt(params[0]);
            const found = store.reports.find(r => r.id === id);
            return callback(null, found ? { ...found } : undefined);
        }

        callback(null, undefined);
    },

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        callback = callback || (() => {});
        params = params || [];
        loadStore();

        const s = sql.toLowerCase();

        // 1. List users: SELECT ... FROM users [WHERE role = ?] ORDER BY id DESC
        if (s.includes('from users')) {
            let list = store.users.slice();
            if (s.includes('role = ?') && params[0]) {
                list = list.filter(u => u.role === params[0]);
            }
            list.sort((a, b) => (b.id || 0) - (a.id || 0));
            return callback(null, list.map(u => ({ ...u })));
        }

        // 2. List reports: SELECT r.*, u.phone AS petugasPhone FROM reports r LEFT JOIN users u ...
        if (s.includes('from reports')) {
            let list = store.reports.map(r => {
                const assignedPetugas = r.assignedPetugasId ? store.users.find(u => u.id === r.assignedPetugasId) : null;
                return {
                    ...r,
                    petugasPhone: assignedPetugas ? assignedPetugas.phone : (r.assignedPetugasPhone || null)
                };
            });

            if (s.includes('assignedpetugasid = ?') && params[0]) {
                const pid = parseInt(params[0]);
                list = list.filter(r => r.assignedPetugasId === pid);
            }
            if (s.includes('status = ?')) {
                const statusIdx = s.includes('assignedpetugasid = ?') ? 1 : 0;
                if (params[statusIdx]) {
                    list = list.filter(r => r.status === params[statusIdx]);
                }
            }

            list.sort((a, b) => (b.id || 0) - (a.id || 0));
            return callback(null, list);
        }

        callback(null, []);
    },

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        callback = callback || (() => {});
        params = params || [];
        loadStore();

        const s = sql.toLowerCase();
        const ctx = { lastID: 0, changes: 0 };

        // 1. DDL Statements (CREATE TABLE, ALTER TABLE, VACUUM)
        if (s.startsWith('create table') || s.startsWith('alter table') || s.startsWith('vacuum')) {
            return callback.call(ctx, null);
        }

        // 2. INSERT into users
        if (s.startsWith('insert into users') || s.startsWith('insert or ignore into users')) {
            const username = params[1];
            if (store.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                if (s.includes('ignore')) {
                    return callback.call(ctx, null);
                }
                const err = new Error('UNIQUE constraint failed: users.username');
                return callback.call(ctx, err);
            }

            const maxId = store.users.reduce((m, u) => Math.max(m, u.id || 0), 0);
            const newId = maxId + 1;
            const newUser = {
                id: newId,
                name: params[0],
                username: params[1],
                password: params[2],
                role: params[3],
                phone: params[4] || '-',
                specialization: params[5] || '-',
                status: params[6] || 'Aktif',
                createdAt: params[7] || new Date().toISOString().split('T')[0]
            };
            store.users.push(newUser);
            saveStore();
            ctx.lastID = newId;
            ctx.changes = 1;
            return callback.call(ctx, null);
        }

        // 3. INSERT into reports
        if (s.startsWith('insert into reports')) {
            const maxId = store.reports.reduce((m, r) => Math.max(m, r.id || 0), 0);
            const newId = maxId + 1;
            const newReport = {
                id: newId,
                location: params[0],
                lat: params[1],
                lng: params[2],
                date: params[3],
                status: params[4] || 'Menunggu',
                desc: params[5],
                img: params[6],
                reporterName: params[7] || 'Ahmad Mahasiswa',
                assignedPetugasId: null,
                assignedPetugasName: null,
                assignedPetugasPhone: null,
                adminNotes: null,
                petugasNotes: null,
                petugasProofImg: null
            };
            store.reports.push(newReport);
            saveStore();
            ctx.lastID = newId;
            ctx.changes = 1;
            return callback.call(ctx, null);
        }

        // 4. UPDATE users
        if (s.startsWith('update users')) {
            const id = parseInt(params[params.length - 1]);
            const user = store.users.find(u => u.id === id);
            if (user) {
                // Dynamically update based on fields in SQL
                if (s.includes('name = ?')) { const idx = getParamIndex(sql, 'name'); if (idx !== -1) user.name = params[idx]; }
                if (s.includes('password = ?')) { const idx = getParamIndex(sql, 'password'); if (idx !== -1) user.password = params[idx]; }
                if (s.includes('phone = ?')) { const idx = getParamIndex(sql, 'phone'); if (idx !== -1) user.phone = params[idx]; }
                if (s.includes('specialization = ?')) { const idx = getParamIndex(sql, 'specialization'); if (idx !== -1) user.specialization = params[idx]; }
                if (s.includes('status = ?')) { const idx = getParamIndex(sql, 'status'); if (idx !== -1) user.status = params[idx]; }
                if (s.includes('role = ?')) { const idx = getParamIndex(sql, 'role'); if (idx !== -1) user.role = params[idx]; }
                saveStore();
                ctx.changes = 1;
            }
            return callback.call(ctx, null);
        }

        // 5. UPDATE reports (assign)
        if (s.startsWith('update reports set') && s.includes('assignedpetugasid = ?')) {
            const id = parseInt(params[4]);
            const report = store.reports.find(r => r.id === id);
            if (report) {
                report.assignedPetugasId = params[0];
                report.assignedPetugasName = params[1];
                report.assignedPetugasPhone = params[2];
                report.adminNotes = params[3];
                report.status = 'Diproses';
                saveStore();
                ctx.changes = 1;
            }
            return callback.call(ctx, null);
        }

        // 6. UPDATE reports (progress)
        if (s.startsWith('update reports set') && s.includes('petugasnotes = coalesce')) {
            const id = parseInt(params[3]);
            const report = store.reports.find(r => r.id === id);
            if (report) {
                if (params[0] !== null && params[0] !== undefined) report.petugasNotes = params[0];
                if (params[1] !== null && params[1] !== undefined) report.petugasProofImg = params[1];
                if (params[2] !== null && params[2] !== undefined) report.status = params[2];
                saveStore();
                ctx.changes = 1;
            }
            return callback.call(ctx, null);
        }

        // 7. General UPDATE reports
        if (s.startsWith('update reports')) {
            const id = parseInt(params[params.length - 1]);
            const report = store.reports.find(r => r.id === id);
            if (report) {
                if (s.includes('location = ?')) { const idx = getParamIndex(sql, 'location'); if (idx !== -1) report.location = params[idx]; }
                if (s.includes('lat = ?')) { const idx = getParamIndex(sql, 'lat'); if (idx !== -1) report.lat = params[idx]; }
                if (s.includes('lng = ?')) { const idx = getParamIndex(sql, 'lng'); if (idx !== -1) report.lng = params[idx]; }
                if (s.includes('status = ?')) { const idx = getParamIndex(sql, 'status'); if (idx !== -1) report.status = params[idx]; }
                if (s.includes('desc = ?')) { const idx = getParamIndex(sql, 'desc'); if (idx !== -1) report.desc = params[idx]; }
                if (s.includes('adminnotes = ?')) { const idx = getParamIndex(sql, 'adminnotes'); if (idx !== -1) report.adminNotes = params[idx]; }
                if (s.includes('petugasnotes = ?')) { const idx = getParamIndex(sql, 'petugasnotes'); if (idx !== -1) report.petugasNotes = params[idx]; }
                if (s.includes('petugasproofimg = ?')) { const idx = getParamIndex(sql, 'petugasproofimg'); if (idx !== -1) report.petugasProofImg = params[idx]; }
                if (s.includes('assignedpetugasid = ?')) { const idx = getParamIndex(sql, 'assignedpetugasid'); if (idx !== -1) report.assignedPetugasId = params[idx]; }
                if (s.includes('assignedpetugasname = ?')) { const idx = getParamIndex(sql, 'assignedpetugasname'); if (idx !== -1) report.assignedPetugasName = params[idx]; }
                saveStore();
                ctx.changes = 1;
            }
            return callback.call(ctx, null);
        }

        // 8. DELETE from users
        if (s.startsWith('delete from users')) {
            const id = parseInt(params[0]);
            const initialLen = store.users.length;
            store.users = store.users.filter(u => u.id !== id);
            saveStore();
            ctx.changes = initialLen - store.users.length;
            return callback.call(ctx, null);
        }

        // 9. DELETE from reports
        if (s.startsWith('delete from reports')) {
            const id = parseInt(params[0]);
            const initialLen = store.reports.length;
            store.reports = store.reports.filter(r => r.id !== id);
            saveStore();
            ctx.changes = initialLen - store.reports.length;
            return callback.call(ctx, null);
        }

        callback.call(ctx, null);
    },

    prepare(sql) {
        return {
            run(...args) {},
            finalize() {}
        };
    },

    close(cb) {
        if (cb) cb(null);
    }
};

function getParamIndex(sql, fieldName) {
    const setPart = sql.slice(sql.toLowerCase().indexOf('set') + 3, sql.toLowerCase().indexOf('where'));
    const parts = setPart.split(',').map(p => p.trim().toLowerCase());
    return parts.findIndex(p => p.startsWith(fieldName.toLowerCase()));
}

module.exports = dbAdapter;
