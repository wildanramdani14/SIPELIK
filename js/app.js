// app.js

const API_BASE = window.API_BASE || (
    (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
    ? 'http://localhost:3000/api'
    : '/api'
);

// --- MAPS GLOBALS ---
let map = null;
let marker = null;
// Default coordinate: Wilayah Rektorat (Kampus Utama)
let selectedLat = -6.73496;
let selectedLng = 108.53386;
let geofenceLayers = [];

let editingReportId = null;

// Client-side image compression helper to keep payloads fast & avoid size limits
window.compressImageFile = function(file, maxWidth = 900, quality = 0.7) {
    return new Promise((resolve) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return resolve(null);
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
};

window.closeReportModal = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.remove('active');
};

// --- WHATSAPP HELPER FUNCTIONS FOR ADMIN ---
window.formatWhatsAppTaskMessage = function(report, petugas, customNotes) {
    if (!report) return '';
    const reportId = report.id || '-';
    const location = report.location || '-';
    const desc = report.desc || '-';
    const reporter = report.reporterName || 'Mahasiswa / Pelapor';
    const date = report.date || 'Hari ini';
    const notes = customNotes || report.adminNotes || 'Mohon segera ditindaklanjuti dan kirimkan foto bukti setelah selesai.';
    const officerName = (petugas && petugas.name) ? petugas.name : (report.assignedPetugasName || 'Petugas Lapangan');
    
    let mapsLink = '';
    if (report.lat && report.lng) {
        mapsLink = `https://www.google.com/maps?q=${report.lat},${report.lng}`;
    }

    return `*PEMBERITAHUAN TUGAS LAPANGAN - SIPELIK UIN CIREBON*
--------------------------------------------------
Halo Bapak/Kang *${officerName}*,
Ada laporan pengaduan lingkungan kampus yang perlu ditangani:

📋 *No. Laporan:* #PGD-${reportId}
📅 *Waktu:* ${date}
👤 *Pelapor:* ${reporter}
📍 *Lokasi:* ${location}
⚠️ *Keluhan/Masalah:* 
"${desc}"

📌 *Instruksi Khusus Admin:*
"${notes}"
${mapsLink ? `\n🗺️ *Petunjuk Lokasi / GPS:*\n${mapsLink}\n` : ''}
--------------------------------------------------
*Instruksi Lanjutan:*
1. Harap segera menuju ke lokasi laporan.
2. Jika telah selesai, mohon kirimkan foto hasil perbaikan/pembersihan ke WhatsApp Admin ini.

Terima kasih atas kerja samanya! 🙏
_SIPELIK - UIN Siber Syekh Nurjati Cirebon_`;
};

window.sendWhatsAppToPetugas = function(phone, message) {
    if (!phone) {
        if (typeof window.showToast === 'function') {
            window.showToast('Nomor WhatsApp petugas belum terdaftar!', 'error');
        } else {
            alert('Nomor WhatsApp petugas belum terdaftar!');
        }
        return;
    }
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '62' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('8')) {
        cleanPhone = '628' + cleanPhone.slice(1);
    }
    const encoded = encodeURIComponent(message);
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
    window.open(waUrl, '_blank');
};

window.changeReportStatusQuick = async function(reportId, newStatus) {
    try {
        const res = await fetch(`${API_BASE}/reports/${reportId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            window.showToast(`Status laporan #PGD-${reportId} diubah menjadi "${newStatus}"`, 'success');
            if (typeof fetchReports === 'function') fetchReports();
        } else {
            const errData = await res.json().catch(() => ({}));
            window.showToast(errData.error || 'Gagal mengubah status laporan', 'error');
        }
    } catch (e) {
        console.error(e);
        window.showToast('Gagal menghubungi server', 'error');
    }
};

window.openWhatsAppTaskForReport = async function(reportId) {
    const rep = (window.currentReports || []).find(r => r.id === reportId);
    if (!rep) return;
    
    // Jika belum ada petugas yang dipilih, buka modal WhatsApp penugasan
    if (!rep.assignedPetugasName) {
        if (typeof window.openAssignModal === 'function') {
            window.openAssignModal(reportId);
        } else {
            window.showToast('Silakan pilih petugas lapangan terlebih dahulu!', 'warning');
        }
        return;
    }

    let phone = rep.assignedPetugasPhone;
    let petugasObj = { name: rep.assignedPetugasName, phone: phone };

    if (!phone && window.availablePetugas) {
        const found = window.availablePetugas.find(p => p.id === rep.assignedPetugasId || p.name === rep.assignedPetugasName);
        if (found) {
            phone = found.phone;
            petugasObj = found;
        }
    }

    if (!phone) {
        window.showToast(`Nomor WhatsApp untuk ${rep.assignedPetugasName} tidak ditemukan. Silakan periksa di Direktori Petugas.`, 'error');
        return;
    }

    // Otomatis ubah status laporan menjadi 'Diproses' saat diteruskan ke WhatsApp
    if (rep.status !== 'Diproses') {
        try {
            await fetch(`${API_BASE}/reports/${reportId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Diproses' })
            });
            rep.status = 'Diproses';
            if (typeof fetchReports === 'function') fetchReports();
        } catch (e) {
            console.error('Error auto-updating status to Diproses:', e);
        }
    }

    const message = window.formatWhatsAppTaskMessage(rep, petugasObj, rep.adminNotes);
    window.sendWhatsAppToPetugas(phone, message);
    window.showToast(`Meneruskan pesan ke WhatsApp ${rep.assignedPetugasName}... Status otomatis: Diproses`, 'success');
};

window.copyWhatsAppTaskForReport = function(reportId) {
    const rep = (window.currentReports || []).find(r => r.id === reportId);
    if (!rep) return;

    let phone = rep.assignedPetugasPhone;
    let petugasObj = { name: rep.assignedPetugasName, phone: phone };

    if (!phone && window.availablePetugas) {
        const found = window.availablePetugas.find(p => p.id === rep.assignedPetugasId || p.name === rep.assignedPetugasName);
        if (found) {
            petugasObj = found;
        }
    }

    const message = window.formatWhatsAppTaskMessage(rep, petugasObj, rep.adminNotes);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message).then(() => {
            window.showToast('Pesan penugasan WhatsApp berhasil disalin ke clipboard!', 'success');
        }).catch(err => {
            console.error(err);
            window.showToast('Gagal menyalin teks ke clipboard.', 'error');
        });
    } else {
        window.showToast('Browser tidak mendukung copy otomatis. Gunakan tombol chat WhatsApp.', 'info');
    }
};

window.updateGeofenceUI = function(lat, lng) {
    const statusEl = document.getElementById('geofenceStatus');
    const textEl = document.getElementById('geofenceText');
    if (!statusEl || !textEl) return;

    if (typeof window.checkCampusGeofence === 'function') {
        const geo = window.checkCampusGeofence(lat, lng);
        if (geo.inside) {
            statusEl.className = 'geofence-alert valid';
            statusEl.innerHTML = `<i class="ph-fill ph-check-circle"></i> <div id="geofenceText"><strong>Lokasi Valid:</strong> Berada di dalam wilayah kampus (<b>${geo.zoneName}</b>).</div>`;
        } else {
            statusEl.className = 'geofence-alert invalid';
            statusEl.innerHTML = `<i class="ph-fill ph-warning-circle"></i> <div id="geofenceText"><strong>Di Luar Wilayah Kampus:</strong> Titik ini di luar wilayah kampus! Silakan geser pin ke dalam area hijau kampus.</div>`;
        }
    }
};

window.jumpToZone = function(shortName) {
    if (!window.CAMPUS_GEOFENCE_ZONES) return;
    const zone = window.CAMPUS_GEOFENCE_ZONES.find(z => z.shortName.toLowerCase() === shortName.toLowerCase());
    if (zone) {
        selectedLat = zone.center[0];
        selectedLng = zone.center[1];
        if (marker) marker.setLatLng([selectedLat, selectedLng]);
        if (map) map.setView([selectedLat, selectedLng], 17);
        window.updateGeofenceUI(selectedLat, selectedLng);
    }
};

window.openReportModal = function(isEdit = false) {
    if(!isEdit) {
        editingReportId = null;
        selectedLat = -6.73496;
        selectedLng = 108.53386;
        const form = document.getElementById('reportForm');
        if(form) form.reset();
    }
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.add('active');
    window.updateGeofenceUI(selectedLat, selectedLng);
    
    setTimeout(() => {
        const container = document.getElementById('reportMap');
        if (!container) return;

        if (map) {
            map.invalidateSize();
            if (marker) marker.setLatLng([selectedLat, selectedLng]);
            map.setView([selectedLat, selectedLng], 17);
            window.updateGeofenceUI(selectedLat, selectedLng);
            return;
        }

        try {
            if (container._leaflet_id) {
                container._leaflet_id = null;
            }

            map = L.map('reportMap').setView([selectedLat, selectedLng], 17);
            
            L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps'
            }).addTo(map);

            // Render 5 Poligon Geofence Kampus
            if (window.CAMPUS_GEOFENCE_ZONES) {
                window.CAMPUS_GEOFENCE_ZONES.forEach(zone => {
                    const poly = L.polygon(zone.coordinates, {
                        color: '#0B5C3A',
                        fillColor: '#10B981',
                        fillOpacity: 0.3,
                        weight: 2
                    }).addTo(map);

                    poly.bindTooltip(`<b>${zone.name}</b><br><small style="color: #0B5C3A;">Area Resmi Kampus</small>`, { sticky: true });

                    poly.on('click', function(e) {
                        selectedLat = e.latlng.lat;
                        selectedLng = e.latlng.lng;
                        if (marker) marker.setLatLng(e.latlng);
                        window.updateGeofenceUI(selectedLat, selectedLng);
                    });

                    geofenceLayers.push(poly);
                });
            }
            
            marker = L.marker([selectedLat, selectedLng], {draggable: true}).addTo(map);
            
            marker.on('dragend', function(event) {
                var position = marker.getLatLng();
                selectedLat = position.lat;
                selectedLng = position.lng;
                window.updateGeofenceUI(selectedLat, selectedLng);
            });

            map.on('click', function(e) {
                selectedLat = e.latlng.lat;
                selectedLng = e.latlng.lng;
                marker.setLatLng(e.latlng);
                window.updateGeofenceUI(selectedLat, selectedLng);
            });

            window.updateGeofenceUI(selectedLat, selectedLng);
        } catch(err) {
            console.error("Map initialization error:", err);
        }
    }, 150);
};

document.addEventListener('DOMContentLoaded', () => {
    // Inject Toast Container
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    // Inject Confirm Modal
    const confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'confirm-overlay';
    document.body.appendChild(confirmOverlay);

    const confirmModal = document.createElement('div');
    confirmModal.className = 'confirm-modal';
    confirmModal.innerHTML = `
        <h3 id="confirmTitle" style="margin-bottom: 1rem; color: var(--text-main);">Konfirmasi</h3>
        <p id="confirmMessage" style="margin-bottom: 2rem; color: var(--text-muted);"></p>
        <div style="display: flex; gap: 1rem; justify-content: center;">
            <button class="btn btn-outline" id="confirmCancelBtn">Batal</button>
            <button class="btn btn-primary" id="confirmOkBtn" style="background: var(--danger); border-color: var(--danger);">Hapus</button>
        </div>
    `;
    document.body.appendChild(confirmModal);

    // Inject Success Modal
    const successModal = document.createElement('div');
    successModal.className = 'confirm-modal'; // reuse style
    successModal.innerHTML = `
        <div style="text-align: center;">
            <i class="ph-fill ph-check-circle" style="font-size: 4rem; color: var(--success); margin-bottom: 1rem;"></i>
            <h3 style="margin-bottom: 1rem; color: var(--text-main);">Berhasil!</h3>
            <p id="successMessage" style="margin-bottom: 2rem; color: var(--text-muted);"></p>
            <button class="btn btn-primary" id="successOkBtn" style="background: var(--success); border-color: var(--success); width: 100%;">Tutup</button>
        </div>
    `;
    document.body.appendChild(successModal);

    window.showToast = function(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'ph-info';
        if(type === 'success') icon = 'ph-check-circle';
        if(type === 'error') icon = 'ph-warning-circle';
        
        toast.innerHTML = `
            <div class="toast-icon"><i class="ph-fill ${icon}"></i></div>
            <div style="font-weight: 500;">${message}</div>
        `;
        
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    };

    window.showConfirm = function(message, onConfirm) {
        document.getElementById('confirmMessage').innerText = message;
        confirmOverlay.classList.add('active');
        confirmModal.classList.add('active');
        
        document.getElementById('confirmCancelBtn').onclick = () => {
            confirmOverlay.classList.remove('active');
            confirmModal.classList.remove('active');
        };
        
        document.getElementById('confirmOkBtn').onclick = () => {
            confirmOverlay.classList.remove('active');
            confirmModal.classList.remove('active');
            if(onConfirm) onConfirm();
        };
    };

    window.showSuccessPopup = function(message) {
        document.getElementById('successMessage').innerText = message;
        confirmOverlay.classList.add('active');
        successModal.classList.add('active');
        
        document.getElementById('successOkBtn').onclick = () => {
            confirmOverlay.classList.remove('active');
            successModal.classList.remove('active');
        };
    };

    // Add micro-animations for buttons on click
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.addEventListener('mousedown', function() {
            this.style.transform = 'scale(0.95)';
        });
        
        btn.addEventListener('mouseup', function() {
            this.style.transform = '';
        });
        
        btn.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });

    // Close modals on clicking outside
    const overlays = document.querySelectorAll('.overlay');
    overlays.forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if(e.target === this) {
                this.classList.remove('active');
            }
        });
    });

    // Handle File Upload Drag & Drop Styling
    let selectedImageBase64 = null;
    const uploadArea = document.querySelector('.upload-area');
    if(uploadArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, unhighlight, false);
        });

        function highlight(e) {
            uploadArea.style.borderColor = 'var(--primary)';
            uploadArea.style.background = 'rgba(11, 92, 58, 0.05)';
        }

        function unhighlight(e) {
            uploadArea.style.borderColor = 'var(--border)';
            uploadArea.style.background = 'transparent';
        }
        
        uploadArea.addEventListener('drop', async function(e) {
            let dt = e.dataTransfer;
            let files = dt.files;
            if(files.length) {
                const p = this.querySelector('p');
                p.textContent = `Mengompres & memproses: ${files[0].name}...`;
                p.style.color = 'var(--primary)';
                selectedImageBase64 = await window.compressImageFile(files[0]);
                p.textContent = `Foto terpilih: ${files[0].name} (Siap)`;
            }
        });
        
        uploadArea.addEventListener('click', function() {
            // Simulate file dialog
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async e => { 
                const files = e.target.files;
                if(files.length) {
                    const p = this.querySelector('p');
                    p.textContent = `Mengompres & memproses: ${files[0].name}...`;
                    p.style.color = 'var(--primary)';
                    selectedImageBase64 = await window.compressImageFile(files[0]);
                    p.textContent = `Foto terpilih: ${files[0].name} (Siap)`;
                }
            };
            input.click();
        });
    }

    // --- REPORT LOGIC (Functional API State) ---
    let reports = [];

    window.filterAdminReports = function() {
        renderReports();
    };

    async function fetchReports() {
        try {
            const res = await fetch(`${API_BASE}/reports?_t=${Date.now()}`);
            if (res.ok) {
                reports = await res.json();
                window.currentReports = reports;
                renderReports();
            }
        } catch(err) {
            console.error("Error fetching reports:", err);
            window.showToast("Gagal terhubung ke server database", "error");
        }
    }

    window.openDescModal = function(repId) {
        const rep = (reports || window.currentReports || []).find(r => r.id === repId);
        if (!rep) return;
        const cleanName = (rep.reporterName || 'Ahmad').replace(/\s*\(?Mahasiswa\)?/gi, '').trim() || 'Ahmad';
        const sub = document.getElementById('descModalSubtitle');
        if (sub) sub.textContent = `Laporan #PGD-${rep.id} • Pelapor: ${cleanName} (Mahasiswa)`;
        const loc = document.getElementById('descModalLocation');
        if (loc) loc.textContent = rep.location || '-';
        const fullText = document.getElementById('descModalFullText');
        if (fullText) fullText.textContent = rep.desc || 'Tidak ada deskripsi keluhan tambahan.';
        const modal = document.getElementById('descViewModal');
        if (modal) modal.classList.add('active');
    };

    window.closeDescModal = function() {
        const modal = document.getElementById('descViewModal');
        if (modal) modal.classList.remove('active');
    };

    function renderReports() {
        let total = reports.length;
        let proses = 0;
        let selesai = 0;
        let menunggu = 0;

        reports.forEach(r => {
            if(r.status === 'Diproses') proses++;
            if(r.status === 'Selesai') selesai++;
            if(r.status === 'Menunggu') menunggu++;
        });

        // UPDATE STATS GLOBALLY (works on both user & admin pages)
        const elTotal = document.getElementById('statTotal');
        const elProses = document.getElementById('statProses');
        const elSelesai = document.getElementById('statSelesai');
        const elMenunggu = document.getElementById('statMenunggu'); // Admin specific
        if(elTotal) elTotal.innerText = total;
        if(elProses) elProses.innerText = proses;
        if(elSelesai) elSelesai.innerText = selesai;
        if(elMenunggu) elMenunggu.innerText = menunggu;

        // USER PAGE RENDER
        const activeGrid = document.getElementById('activeReportGrid');
        const historyGrid = document.getElementById('historyReportGrid');
        if(activeGrid || historyGrid) {
            if(activeGrid) activeGrid.innerHTML = '';
            if(historyGrid) historyGrid.innerHTML = '';
            
            reports.forEach(report => {
                let badgeClass = 'badge-process';
                if(report.status === 'Selesai') badgeClass = 'badge-success';
                if(report.status === 'Menunggu') badgeClass = 'badge-warning';

                const assignedBadge = report.assignedPetugasName ? `
                    <div style="font-size: 0.8rem; font-weight: 600; color: #7B5024; background: rgba(193,147,59,0.1); padding: 0.3rem 0.6rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.5rem;">
                        <i class="ph-bold ph-hard-hat"></i> Ditugaskan ke: ${report.assignedPetugasName}
                    </div>
                ` : `
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
                        <i class="ph-bold ph-clock"></i> Menunggu verifikasi admin
                    </div>
                `;

                const htmlStr = `
                    <div class="card report-card">
                        <img src="${report.img}" alt="Report Image" class="report-img">
                        <div>
                            <div class="report-header">
                                <div>
                                    <div class="report-location"><i class="ph-fill ph-map-pin" style="color: var(--primary);"></i> ${report.location}</div>
                                    <div class="report-date"><i class="ph ph-calendar-blank"></i> ${report.date}</div>
                                </div>
                                <span class="badge ${badgeClass}">${report.status}</span>
                            </div>
                            ${assignedBadge}
                            <p class="report-desc" style="margin-top: 0.75rem;">${report.desc}</p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                            <button class="btn btn-outline detail-btn" data-id="${report.id}" style="flex: 1; padding: 0.5rem;">
                                <i class="ph-bold ph-eye"></i> Detail Laporan
                            </button>
                            ${report.status === 'Menunggu' ? `
                            <button class="btn btn-outline edit-btn" data-id="${report.id}" style="padding: 0.5rem;" title="Edit"><i class="ph-bold ph-pencil-simple"></i></button>
                            <button class="btn btn-outline delete-btn" data-id="${report.id}" style="padding: 0.5rem; color: var(--danger); border-color: var(--danger);" title="Hapus"><i class="ph-bold ph-trash"></i></button>
                            ` : ''}
                        </div>
                    </div>
                `;
                
                if (report.status === 'Selesai') {
                    if (historyGrid) historyGrid.innerHTML += htmlStr;
                } else {
                    if (activeGrid) activeGrid.innerHTML += htmlStr;
                }
            });
            
            if (activeGrid && activeGrid.innerHTML === '') {
                activeGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1; padding: 1rem 0;">Belum ada laporan aktif.</p>';
            }
            if (historyGrid && historyGrid.innerHTML === '') {
                historyGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1; padding: 1rem 0;">Belum ada riwayat laporan yang selesai.</p>';
            }
        }

        // ADMIN PAGE RENDER (Penghubung User & Petugas)
        const tbody = document.getElementById('adminTableBody');
        if(tbody) {
            tbody.innerHTML = '';

            const searchInput = document.getElementById('adminSearchInput')?.value.toLowerCase() || '';
            const statusFilter = document.getElementById('adminStatusFilter')?.value || 'all';

            let filteredReports = reports.filter(r => {
                const matchSearch = r.location.toLowerCase().includes(searchInput) || 
                                    (r.reporterName || '').toLowerCase().includes(searchInput) ||
                                    (r.assignedPetugasName || '').toLowerCase().includes(searchInput);
                const matchStatus = statusFilter === 'all' || r.status === statusFilter;
                return matchSearch && matchStatus;
            });

            if (filteredReports.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Tidak ada laporan pengaduan yang sesuai.</td></tr>`;
            } else {
                filteredReports.forEach(report => {
                    let badgeClass = 'badge-process';
                    if(report.status === 'Selesai') badgeClass = 'badge-success';
                    if(report.status === 'Menunggu') badgeClass = 'badge-pending';

                    const dateParts = report.date ? report.date.split(',') : ['-'];
                    const dateOnly = dateParts[0].trim();
                    const timeOnly = dateParts[1] ? dateParts[1].trim() : '';

                    const petugasCellContent = report.assignedPetugasName ? `
                        <div class="table-cell-list">
                            <div class="table-list-item worker-name">
                                <i class="ph-bold ph-hard-hat"></i>
                                <span>${report.assignedPetugasName}</span>
                            </div>
                            <div class="table-list-item" style="margin-top: 0.15rem;">
                                <button type="button" class="wa-table-badge" onclick="openWhatsAppTaskForReport(${report.id})" title="Kirim/Buka Penugasan WhatsApp">
                                    <i class="ph-bold ph-whatsapp-logo" style="color: #25D366;"></i> Chat WA
                                </button>
                            </div>
                        </div>
                    ` : `
                        <div class="table-cell-list">
                            <span class="badge badge-pending nowrap" style="font-size: 0.74rem; display: inline-block; width: fit-content;">
                                <i class="ph-bold ph-clock"></i> Belum Ditugaskan
                            </span>
                        </div>
                    `;

                    const cleanReporter = (report.reporterName || 'Ahmad').replace(/\s*\(?Mahasiswa\)?/gi, '').trim() || 'Ahmad';

                    tbody.innerHTML += `
                        <tr>
                            <td class="nowrap"><strong>#PGD-${report.id}</strong></td>
                            <td>
                                <div class="table-cell-list">
                                    <div class="table-list-item main-title">
                                        <i class="ph-bold ph-user"></i>
                                        <span>${cleanReporter}</span>
                                    </div>
                                    <div class="table-list-item text-sub">
                                        <span class="role-tag-mini pelapor">Mahasiswa</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="table-cell-list">
                                    <div class="table-list-item main-title primary">
                                        <i class="ph-fill ph-map-pin"></i>
                                        <span>${report.location}</span>
                                    </div>
                                    ${report.desc ? `
                                    <div>
                                        <button type="button" class="btn-view-desc" onclick="openDescModal(${report.id})" title="Lihat Deskripsi Lengkap">
                                            <i class="ph-bold ph-chat-text"></i> View Deskripsi
                                        </button>
                                    </div>` : ''}
                                </div>
                            </td>
                            <td class="nowrap">
                                <div class="table-cell-list">
                                    <div class="table-list-item nowrap">
                                        <i class="ph-bold ph-calendar-blank"></i>
                                        <span>${dateOnly}</span>
                                    </div>
                                    ${timeOnly ? `
                                    <div class="table-list-item text-sub nowrap">
                                        <i class="ph-bold ph-clock"></i>
                                        <span>${timeOnly}</span>
                                    </div>` : ''}
                                </div>
                            </td>
                            <td>${petugasCellContent}</td>
                            <td class="nowrap">
                                <select class="status-select-badge ${badgeClass} no-print" onchange="changeReportStatusQuick(${report.id}, this.value)" title="Klik untuk edit status secara manual">
                                    <option value="Menunggu" ${report.status === 'Menunggu' ? 'selected' : ''}>Menunggu</option>
                                    <option value="Diproses" ${report.status === 'Diproses' ? 'selected' : ''}>Diproses</option>
                                    <option value="Selesai" ${report.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                                </select>
                                <span class="badge ${badgeClass} print-only">${report.status}</span>
                            </td>
                            <td class="nowrap">
                                <div class="action-btns" style="justify-content: flex-end;">
                                    <button class="action-btn" title="Teruskan Tugas via WhatsApp" onclick="openWhatsAppTaskForReport(${report.id})" style="color: #25D366; background: rgba(37, 211, 102, 0.1);">
                                        <i class="ph-bold ph-whatsapp-logo"></i>
                                    </button>
                                    <button class="action-btn btn-view admin-detail-btn" data-id="${report.id}" title="Detail & Edit Status">
                                        <i class="ph-bold ph-pencil-simple"></i>
                                    </button>
                                    <button class="action-btn admin-delete-btn" data-id="${report.id}" title="Hapus Laporan" style="color: var(--danger);">
                                        <i class="ph-bold ph-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            }
            
            const displayCount = document.getElementById('displayCount');
            if(displayCount) displayCount.innerText = `Menampilkan ${filteredReports.length} dari total ${reports.length} data pengaduan`;
        }

        bindEvents();
        
        // Update Chart if exists
        if(window.adminChart) {
            window.adminChart.data.datasets[0].data = [total, menunggu, proses, selesai];
            window.adminChart.update();
        }
        // Update Admin Map if exists
        if(window.adminMap && window.adminMarkersLayer) {
            window.adminMarkersLayer.clearLayers();
            reports.forEach(r => {
                if(r.lat && r.lng) {
                    L.marker([r.lat, r.lng]).bindPopup(`<b>${r.location}</b><br>${r.status}${r.assignedPetugasName ? '<br>Petugas: ' + r.assignedPetugasName : ''}`).addTo(window.adminMarkersLayer);
                }
            });
        }
    }

    function bindEvents() {
        // Event listener Detail (User & Admin)
        document.querySelectorAll('.detail-btn, .admin-detail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                const rep = reports.find(r => r.id === id);
                if(rep) {
                    let badgeClass = 'badge-process';
                    if(rep.status === 'Selesai') badgeClass = 'badge-success';
                    if(rep.status === 'Menunggu') badgeClass = 'badge-warning';
                    
                    // Admin Modal Injection
                    const adminModal = document.getElementById('adminDetailContent');
                    if(adminModal) {
                        const subtitleEl = document.getElementById('detailModalSubtitle');
                        if (subtitleEl) subtitleEl.textContent = `Laporan #PGD-${rep.id} • Masuk: ${rep.date || '-'}`;

                        let currentAdminProofBase64 = rep.petugasProofImg || null;

                        window.removeAdminProof = function() {
                            currentAdminProofBase64 = null;
                            const wrapper = document.getElementById('adminProofPreviewWrapper');
                            const uploadZone = document.getElementById('adminProofUploadZone');
                            const fileInput = document.getElementById('adminProofFileInput');
                            if (fileInput) fileInput.value = '';
                            if (wrapper) wrapper.style.display = 'none';
                            if (uploadZone) uploadZone.style.display = 'flex';
                            if (typeof window.showToast === 'function') {
                                window.showToast('Foto bukti dihapus (Klik "Simpan Pembaruan" untuk konfirmasi).', 'warning');
                            }
                        };

                        window.handleAdminProofFileChange = async function(e) {
                            const file = e.target.files[0];
                            if (!file) return;
                            if (file.size > 10 * 1024 * 1024) {
                                window.showToast('Ukuran foto maksimal 10MB', 'error');
                                return;
                            }
                            window.showToast('Memproses dan mengompres foto bukti...', 'info');
                            currentAdminProofBase64 = await window.compressImageFile(file);
                            const wrapper = document.getElementById('adminProofPreviewWrapper');
                            const uploadZone = document.getElementById('adminProofUploadZone');
                            const imgEl = document.getElementById('adminProofPreviewImg');
                            if (imgEl) imgEl.src = currentAdminProofBase64;
                            if (wrapper) wrapper.style.display = 'block';
                            if (uploadZone) uploadZone.style.display = 'none';

                            const statusSelect = document.getElementById('adminStatusSelect');
                            if (statusSelect && statusSelect.value !== 'Selesai') {
                                statusSelect.value = 'Selesai';
                            }
                            window.showToast('Foto bukti berhasil dipilih! Klik "Simpan Pembaruan" untuk menyimpan.', 'info');
                        };

                        adminModal.innerHTML = `
                            <div class="modal-grid-2col">
                                <div>
                                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.35rem;">Foto Bukti Pelapor (Mahasiswa):</div>
                                    <img src="${rep.img}" style="width: 100%; height: 160px; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--border);">
                                </div>
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                        <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-muted);">Foto Bukti Pengerjaan (Petugas):</div>
                                        <span style="font-size: 0.75rem; color: var(--primary); font-weight: 600;"><i class="ph-bold ph-upload-simple"></i> Bisa Upload Foto</span>
                                    </div>

                                    <input type="file" id="adminProofFileInput" accept="image/*" style="display: none;" onchange="window.handleAdminProofFileChange(event)">

                                    <div id="adminProofUploadZone" class="proof-upload-box" style="${rep.petugasProofImg ? 'display: none;' : ''}" onclick="document.getElementById('adminProofFileInput').click()">
                                        <i class="ph-bold ph-camera-plus" style="font-size: 2.2rem; color: var(--primary); margin-bottom: 0.35rem;"></i>
                                        <div style="font-weight: 600; font-size: 0.88rem; color: var(--primary);">Upload Foto Bukti Petugas</div>
                                        <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.2rem;">Klik untuk pilih foto kiriman WA petugas (JPG/PNG)</div>
                                    </div>

                                    <div id="adminProofPreviewWrapper" class="proof-preview-wrapper" style="${rep.petugasProofImg ? '' : 'display: none;'}">
                                        <img id="adminProofPreviewImg" src="${rep.petugasProofImg || ''}">
                                        <div class="proof-preview-overlay">
                                            <span><i class="ph-bold ph-check-circle" style="color: #34D399;"></i> Foto Bukti Petugas</span>
                                            <div style="display: flex; gap: 0.35rem;">
                                                <button type="button" class="btn-proof-action" onclick="document.getElementById('adminProofFileInput').click()">
                                                    <i class="ph-bold ph-arrows-clockwise"></i> Ganti
                                                </button>
                                                <button type="button" class="btn-proof-action danger" onclick="window.removeAdminProof()">
                                                    <i class="ph-bold ph-trash"></i> Hapus
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style="background: var(--bg-color); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong>Pelapor:</strong> ${rep.reporterName || 'Ahmad Mahasiswa'} (Mahasiswa)
                                    </div>
                                    <span class="badge ${badgeClass}">${rep.status}</span>
                                </div>
                                <div>
                                    <strong>Lokasi Kejadian:</strong> <i class="ph-fill ph-map-pin" style="color: var(--primary);"></i> ${rep.location}
                                </div>
                                <div>
                                    <strong>Keluhan:</strong> ${rep.desc}
                                </div>
                                <div style="border-top: 1px solid var(--border); padding-top: 0.65rem;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                                        <div>
                                            <strong>Petugas Lapangan:</strong> 
                                            ${rep.assignedPetugasName ? `<span style="color: #7B5024; font-weight: 700;">👷 ${rep.assignedPetugasName} ${rep.assignedPetugasPhone ? '(' + rep.assignedPetugasPhone + ')' : ''}</span>` : '<span style="color: var(--warning); font-weight: 600;">Belum Ditugaskan</span>'}
                                        </div>
                                        <div style="display: flex; gap: 0.4rem; align-items: center;">
                                            <button class="btn btn-whatsapp" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="document.getElementById('detailModal').classList.remove('active'); openAssignModal(${rep.id});" title="Teruskan Laporan ke WhatsApp Petugas">
                                                <i class="ph-fill ph-whatsapp-logo"></i> ${rep.assignedPetugasName ? 'Teruskan Ulang WA' : 'Teruskan ke WhatsApp'}
                                            </button>
                                            ${rep.assignedPetugasName ? `
                                                <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;" onclick="copyWhatsAppTaskForReport(${rep.id})" title="Salin Format Pesan WhatsApp">
                                                    <i class="ph-bold ph-copy"></i> Salin Pesan
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <strong>Catatan / Instruksi Petugas:</strong> 
                                    <span style="font-style: italic; color: var(--text-muted);">${rep.adminNotes || 'Belum ada catatan instruksi.'}</span>
                                </div>
                                <div>
                                    <strong>Laporan Hasil Lapangan dari Petugas:</strong> 
                                    <span style="font-style: italic; color: #065F46; font-weight: 500;">${rep.petugasNotes || 'Belum dilaporkan.'}</span>
                                </div>
                            </div>
                        `;
                        // set current status dropdown & notes input
                        document.getElementById('adminStatusSelect').value = rep.status;
                        const notesInput = document.getElementById('adminPetugasNotesInput');
                        if (notesInput) notesInput.value = rep.petugasNotes || '';

                        document.getElementById('adminStatusSave').onclick = async function() {
                            const newStatus = document.getElementById('adminStatusSelect').value;
                            const notesVal = document.getElementById('adminPetugasNotesInput')?.value || '';
                            const btn = document.getElementById('adminStatusSave');
                            btn.disabled = true;
                            btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> Menyimpan...';

                            try {
                                const res = await fetch(`${API_BASE}/reports/${rep.id}`, {
                                    method: 'PUT', 
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({ 
                                        status: newStatus,
                                        petugasProofImg: currentAdminProofBase64,
                                        petugasNotes: notesVal
                                    })
                                });
                                if (!res.ok) throw new Error('Gagal simpan data ke server');
                                document.getElementById('detailModal').classList.remove('active');
                                window.showToast('Laporan & foto bukti berhasil diperbarui!', 'success');
                                fetchReports();
                            } catch(err) {
                                window.showToast('Gagal update laporan: ' + err.message, 'error');
                            } finally {
                                btn.disabled = false;
                                btn.innerHTML = '<i class="ph-bold ph-floppy-disk"></i> Simpan Pembaruan';
                            }
                        };
                    } else {
                        // User Modal Injection
                        const assignedInfo = rep.assignedPetugasName ? `
                            <div style="background: #FEF3C7; border: 1px solid #FCD34D; border-radius: var(--radius-md); padding: 0.75rem 1rem; margin: 0.75rem 0; font-size: 0.88rem;">
                                <div style="font-weight: 700; color: #92400E; display: flex; align-items: center; gap: 0.35rem;">
                                    <i class="ph-fill ph-hard-hat"></i> Ditugaskan ke Petugas:
                                </div>
                                <div style="color: #78350F; margin-top: 0.2rem;">
                                    <strong>${rep.assignedPetugasName}</strong> (Telah didisposisikan oleh Admin Layanan)
                                </div>
                                ${rep.adminNotes ? `<div style="font-size: 0.82rem; color: #92400E; margin-top: 0.25rem;"><em>Instruksi: "${rep.adminNotes}"</em></div>` : ''}
                            </div>
                        ` : `
                            <div style="background: rgba(0,0,0,0.03); border-radius: var(--radius-md); padding: 0.5rem 0.75rem; margin: 0.75rem 0; font-size: 0.85rem; color: var(--text-muted);">
                                <i class="ph-bold ph-clock"></i> Laporan Anda sedang dalam antrean verifikasi dan penugasan oleh Admin Layanan.
                            </div>
                        `;

                        const completionProof = rep.petugasProofImg ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1rem;">
                                <h4 style="font-size: 0.95rem; color: var(--success); display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.5rem;">
                                    <i class="ph-fill ph-check-circle"></i> Bukti Penyelesaian dari Petugas Lapangan:
                                </h4>
                                <img src="${rep.petugasProofImg}" style="width: 100%; height: 180px; object-fit: cover; border-radius: var(--radius-md); border: 2px solid var(--success); margin-bottom: 0.5rem;">
                                <p style="font-size: 0.88rem; color: var(--text-main); font-style: italic;">
                                    "${rep.petugasNotes || 'Penanganan telah diselesaikan di lokasi.'}"
                                </p>
                            </div>
                        ` : '';

                        document.getElementById('detailContent').innerHTML = `
                            <img src="${rep.img}" style="width: 100%; height: 200px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                <span class="badge ${badgeClass}">${rep.status}</span>
                                <span style="color: var(--text-muted); font-size: 0.85rem;"><i class="ph ph-calendar"></i> ${rep.date}</span>
                            </div>
                            <h4 style="margin-bottom: 0.5rem; color: var(--text-main);"><i class="ph-fill ph-map-pin" style="color: var(--primary);"></i> ${rep.location}</h4>
                            <p style="color: var(--text-main); line-height: 1.5; font-size: 0.95rem;">${rep.desc}</p>
                            ${assignedInfo}
                            ${completionProof}
                        `;
                    }
                    
                    document.getElementById('detailModal').classList.add('active');
                }
            });
        });

        // Event listener untuk tombol Edit (User)
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                const rep = reports.find(r => r.id === id);
                if(rep) {
                    editingReportId = id;
                    document.getElementById('reportLocation').value = rep.location;
                    document.getElementById('reportDescription').value = rep.desc;
                    selectedLat = rep.lat || selectedLat;
                    selectedLng = rep.lng || selectedLng;
                    
                    if(marker) marker.setLatLng([selectedLat, selectedLng]);
                    if(map) map.setView([selectedLat, selectedLng], 16);
                    
                    window.openReportModal(true);
                }
            });
        });

        // Event listener untuk tombol Hapus (User & Admin)
        document.querySelectorAll('.delete-btn, .admin-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                window.showConfirm('Apakah Anda yakin ingin menghapus laporan ini?', async () => {
                    try {
                        const res = await fetch(`${API_BASE}/reports/${id}`, { method: 'DELETE' });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) {
                            window.showToast(data.message || 'Laporan berhasil dihapus', 'success');
                        } else {
                            window.showToast(data.error || 'Gagal menghapus laporan', 'error');
                        }
                        await fetchReports();
                    } catch(err) {
                        window.showToast('Gagal menghapus laporan', 'error');
                    }
                });
            });
        });
    }

    // Initial render from API
    fetchReports();

    // Form submission
    const form = document.getElementById('reportForm');
    if(form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const location = document.getElementById('reportLocation').value;
            const desc = document.getElementById('reportDescription').value;

            // Validasi Geofence wilayah kampus
            if (typeof window.checkCampusGeofence === 'function') {
                const geo = window.checkCampusGeofence(selectedLat, selectedLng);
                if (!geo.inside) {
                    window.showToast('Gagal: Lokasi berada di luar wilayah kampus! Silakan tentukan titik di dalam wilayah kampus yang telah ditentukan.', 'error');
                    if (window.updateGeofenceUI) window.updateGeofenceUI(selectedLat, selectedLng);
                    return;
                }
            }
            
            if(editingReportId) {
                const rep = reports.find(r => r.id === editingReportId);
                if(rep) {
                    try {
                        const res = await fetch(`${API_BASE}/reports/${editingReportId}`, {
                            method: 'PUT', headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ location, desc, lat: selectedLat, lng: selectedLng })
                        });
                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            window.showToast(errData.error || 'Gagal update laporan', 'error');
                            return;
                        }
                        editingReportId = null;
                        window.showSuccessPopup('Data laporan pengaduan Anda berhasil diperbarui!');
                        fetchReports();
                        this.reset();
                        selectedImageBase64 = null;
                        if (typeof window.closeReportModal === 'function') {
                            window.closeReportModal();
                        } else {
                            document.getElementById('reportModal').classList.remove('active');
                        }
                    } catch(err) {
                        window.showToast('Gagal update laporan', 'error');
                    }
                }
            } else {
                if(!selectedImageBase64) {
                    window.showToast('Harap lampirkan foto/gambar bukti kejadian!', 'warning');
                    return;
                }

                const activeReportsCount = reports.filter(r => r.status !== 'Selesai').length;
                if(activeReportsCount >= 3 && !document.getElementById('adminOverviewMap')) {
                    window.showToast('Batas maksimal laporan aktif tercapai! Selesaikan laporan Anda terlebih dahulu (maksimal 3).', 'warning');
                    return;
                }
                const now = new Date();
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sept', 'Okt', 'Nov', 'Des'];
                const dateString = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} WIB`;

                let reporterName = 'Ahmad Mahasiswa';
                const userStr = localStorage.getItem('sipelik_user');
                if (userStr) {
                    try {
                        const u = JSON.parse(userStr);
                        if (u.name) reporterName = u.name;
                    } catch(e) {}
                }

                const newReport = {
                    location: location,
                    lat: selectedLat,
                    lng: selectedLng,
                    date: dateString,
                    status: 'Menunggu',
                    desc: desc,
                    img: selectedImageBase64 || 'https://images.unsplash.com/photo-1595278069441-2f29f7c001eb?auto=format&fit=crop&q=80&w=400',
                    reporterName: reporterName
                };

                try {
                    const res = await fetch(`${API_BASE}/reports`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(newReport)
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        window.showToast(errData.error || 'Gagal submit laporan', 'error');
                        return;
                    }
                    const data = await res.json();
                    selectedImageBase64 = null;
                    window.showToast(`Laporan berhasil disubmit (${data.zone || 'Area Kampus'})!`, 'success');
                    fetchReports();

                    // Reset and close modal
                    this.reset();
                    selectedImageBase64 = null;
                    const uploadP = document.querySelector('.upload-area p');
                    if(uploadP) { uploadP.textContent = 'Klik atau drag gambar ke sini'; uploadP.style.color = 'var(--text-main)'; }
                    if (typeof window.closeReportModal === 'function') {
                        window.closeReportModal();
                    } else {
                        document.getElementById('reportModal').classList.remove('active');
                    }
                } catch(err) {
                    window.showToast('Gagal submit laporan', 'error');
                }
            }
        });
    }
});
