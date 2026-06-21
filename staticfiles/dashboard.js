// Intelligence Creation - Dashboard
window.onerror = function(msg, url, line) {
    console.error('Error:', msg, 'line:', line);
    return true;
};

let currentUser = null;
let currentFeature = null;

const FEATURES = [
    { key: 'data-collection', title: 'Data Collection', icon: '📊', desc: 'Kelola data input.', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)', endpoint: '/api/data-collection', fields: [{ name: 'title', label: 'Judul', type: 'text', required: true }, { name: 'content', label: 'Konten', type: 'textarea' }, { name: 'category', label: 'Kategori', type: 'select', options: ['umum', 'teks', 'numerik', 'gambar', 'audio'] }], titleField: 'title' },
    { key: 'analysis', title: 'Analysis', icon: '🔍', desc: 'Analisis data.', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', endpoint: '/api/analysis', fields: [{ name: 'title', label: 'Judul', type: 'text', required: true }, { name: 'method', label: 'Metode', type: 'select', options: ['statistical', 'clustering', 'regression', 'classification', 'nlp'] }], titleField: 'title' },
    { key: 'models', title: 'AI Models', icon: '🤖', desc: 'Model AI.', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', endpoint: '/api/models', fields: [{ name: 'name', label: 'Nama', type: 'text', required: true }, { name: 'model_type', label: 'Tipe', type: 'select', options: ['classification', 'regression', 'clustering', 'neural_network'] }], titleField: 'name' },
    { key: 'visualization', title: 'Visualization', icon: '📈', desc: 'Visualisasi.', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', endpoint: '/api/visualization', fields: [{ name: 'title', label: 'Judul', type: 'text', required: true }, { name: 'chart_type', label: 'Tipe Chart', type: 'select', options: ['bar', 'line', 'pie', 'scatter'] }], titleField: 'title' },
    { key: 'training', title: 'Training', icon: '🎯', desc: 'Latih AI.', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', endpoint: '/api/training', fields: [{ name: 'name', label: 'Nama', type: 'text', required: true }, { name: 'epochs', label: 'Epochs', type: 'number' }], titleField: 'name' },
    { key: 'automation', title: 'Automation', icon: '⚙️', desc: 'Otomatisasi.', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', endpoint: '/api/automation', fields: [{ name: 'name', label: 'Nama', type: 'text', required: true }, { name: 'trigger_type', label: 'Trigger', type: 'select', options: ['manual', 'scheduled', 'event'] }], titleField: 'name' },
    { key: 'collaboration', title: 'Collaboration', icon: '🤝', desc: 'Kolaborasi.', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', endpoint: '/api/collaboration', fields: [{ name: 'project_name', label: 'Proyek', type: 'text', required: true }, { name: 'visibility', label: 'Visibilitas', type: 'select', options: ['private', 'public'] }], titleField: 'project_name' },
    { key: 'insights', title: 'Insights', icon: '💡', desc: 'Wawasan.', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)', endpoint: '/api/insights', fields: [{ name: 'title', label: 'Judul', type: 'text', required: true }, { name: 'insight_type', label: 'Tipe', type: 'select', options: ['observation', 'recommendation', 'warning'] }], titleField: 'title' }
];

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard loading...');
    initSequence();
    renderFeatures();
    loadStats();
});

// =====================
// CANVAS SEQUENCE
// =====================
var frameCount = 240;
var images = [];
var currentFrame = 0;
var canvas, ctx;
var demoData = {};

function initSequence() {
    canvas = document.getElementById('sequence-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    function setupCanvas() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }
    
    setupCanvas();
    
    for (var i = 0; i < frameCount; i++) {
        var img = new Image();
        img.src = '/sequence/ezgif-frame-' + (i + 1).toString().padStart(3, '0') + '.jpg';
        images.push(img);
    }
    
    function render(frameIndex) {
        var img = images[frameIndex];
        if (!img || !img.complete || img.naturalWidth === 0) return;
        var w = window.innerWidth;
        var h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        var scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        var x = (w - img.naturalWidth * scale) / 2;
        var y = (h - img.naturalHeight * scale) / 2;
        ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
    }
    
    images[0].onload = function() { render(0); };
    
    var wheelTimeout = null;
    window.addEventListener('wheel', function(e) {
        e.preventDefault();
        if (wheelTimeout) return;
        wheelTimeout = setTimeout(function() { wheelTimeout = null; }, 16);
        if (e.deltaY > 0) currentFrame = Math.min(currentFrame + 5, frameCount - 1);
        else currentFrame = Math.max(currentFrame - 5, 0);
        render(currentFrame);
    }, { passive: false });
    
    window.addEventListener('resize', function() { setupCanvas(); render(currentFrame); });
}

// =====================
// RENDER FEATURES
// =====================
function renderFeatures() {
    var grid = document.getElementById('features-grid');
    if (!grid) return;
    
    var html = '';
    FEATURES.forEach(function(f, i) {
        html += '<div class="feature-card" onclick="openFeature(\'' + f.key + '\')" style="animation-delay:' + (i * 0.05) + 's">' +
            '<div class="feature-icon" style="background:' + f.bg + ';color:' + f.color + '">' + f.icon + 
            '<span class="feature-card-count" id="count-' + f.key + '">0</span></div>' +
            '<div class="feature-title">' + f.title + '</div>' +
            '<div class="feature-desc">' + f.desc + '</div>' +
            '</div>';
    });
    grid.innerHTML = html;
}

// =====================
// LOAD STATS
// =====================
async function loadStats() {
    try {
        var res = await fetch('/api/stats');
        var result = await res.json();
        var stats = result.stats || {};
        
        FEATURES.forEach(function(f) {
            var el = document.getElementById('count-' + f.key);
            if (el && stats[f.key] !== undefined) el.textContent = stats[f.key];
        });
        
        var total = (stats.data_collection || 0) + (stats.models || 0) + (stats.collaboration || 0);
        animateCounter('stat-total', total);
        animateCounter('stat-data', stats.data_collection || 0);
        animateCounter('stat-models', stats.models || 0);
        animateCounter('stat-collab', stats.collaboration || 0);
    } catch (err) { console.error('Stats error:', err); }
}

function animateCounter(id, target) {
    var el = document.getElementById(id);
    if (!el) return;
    var current = 0;
    var inc = Math.max(1, Math.ceil(target / 20));
    var timer = setInterval(function() {
        current += inc;
        el.textContent = current >= target ? target : current;
        if (current >= target) clearInterval(timer);
    }, 30);
}

// =====================
// MODAL - DATA ENTRY
// =====================
function openFeature(key) {
    var feature = FEATURES.find(function(f) { return f.key === key; });
    if (!feature) return;
    currentFeature = feature;
    document.getElementById('modal-title').innerHTML = feature.icon + ' ' + feature.title;
    document.getElementById('modal-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    loadFeatureItems(feature);
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget && !event.target.closest('.modal-close')) return;
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
    currentFeature = null;
}

async function loadFeatureItems(feature) {
    var body = document.getElementById('modal-body');
    body.innerHTML = '<div style="text-align:center;padding:40px;">Memuat...</div>';
    
    try {
        var res = await fetch(feature.endpoint);
        var result = await res.json();
        var data = result.data || [];
        
        var html = '<button class="btn btn-primary" onclick="showAddForm()" style="margin-bottom:20px;">+ Tambah Baru</button>' +
            '<div id="add-form-container"></div><div class="item-list">';
        
        if (!data.length) {
            html += '<div class="empty-state"><div class="empty-state-icon">' + feature.icon + '</div><p>Belum ada data. Klik "+ Tambah Baru"!</p></div>';
        } else {
            data.forEach(function(item) {
                var titleField = feature.titleField || 'title';
                var title = item[titleField] || item.name || 'Tanpa Judul';
                var date = item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '';
                var meta = date ? '<span>' + date + '</span>' : '';
                html += '<div class="item-card"><div class="item-card-header"><span class="item-card-title">' + title + '</span>' +
                    '<div class="item-card-actions"><button class="btn btn-danger btn-sm" onclick="deleteItem(' + item.id + ')">🗑️</button></div></div>' +
                    '<div class="item-card-meta">' + meta + '</div></div>';
            });
        }
        html += '</div>';
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = '<div class="empty-state"><p style="color:red;">Gagal: ' + err.message + '</p></div>';
    }
}

function showAddForm() {
    if (!currentFeature) return;
    var c = document.getElementById('add-form-container');
    var h = '<div class="modal-form"><h3>Tambah Baru</h3>';
    
    if (currentFeature.fields) {
        currentFeature.fields.forEach(function(f) {
            var id = 'f-' + f.name;
            if (f.type === 'textarea') h += '<div class="form-group"><label>' + f.label + '</label><textarea id="' + id + '" class="form-textarea"></textarea></div>';
            else if (f.type === 'select') h += '<div class="form-group"><label>' + f.label + '</label><select id="' + id + '" class="form-select">' + 
                f.options.map(function(o) { return '<option value="' + o + '">' + o + '</option>'; }).join('') + '</select></div>';
            else h += '<div class="form-group"><label>' + f.label + '</label><input type="' + (f.type || 'text') + '" id="' + id + '" class="form-input"></div>';
        });
    }
    h += '<div style="display:flex;gap:10px;margin-top:15px;"><button class="btn btn-secondary" onclick="hideAddForm()">Batal</button><button class="btn btn-primary" onclick="submitAdd()">Simpan</button></div></div>';
    c.innerHTML = h;
}

function hideAddForm() {
    document.getElementById('add-form-container').innerHTML = '';
}

async function submitAdd() {
    if (!currentFeature) return;
    var data = {};
    if (currentFeature.fields) {
        currentFeature.fields.forEach(function(f) {
            var el = document.getElementById('f-' + f.name);
            if (el) data[f.name] = f.type === 'number' ? Number(el.value) : el.value;
        });
    }
    try {
        var res = await fetch(currentFeature.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error('Gagal');
        showToast('Berhasil disimpan!', 'success');
        hideAddForm();
        await loadFeatureItems(currentFeature);
        await loadStats();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function deleteItem(id) {
    if (!currentFeature || !confirm('Hapus?')) return;
    try {
        await fetch(currentFeature.endpoint + '/' + id, { method: 'DELETE' });
        showToast('Dihapus!', 'success');
        await loadFeatureItems(currentFeature);
        await loadStats();
    } catch (err) { showToast('Gagal hapus', 'error'); }
}

function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'success');
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(function() { t.remove(); }, 3000);
}

async function logout() { 
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e) {}
    window.location.href = '/'; 
}
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(e); });