
        // =====================================================================
        // CONFIG
        // =====================================================================
        const FRAME_COUNT = 240;

        // =====================================================================
        // 6 TAHAPAN ML PIPELINE
        // =====================================================================
        const FEATURES = [
            {
                key: 'problem-framing',
                title: 'Problem Framing & IPO',
                icon: '🎯',
                desc: 'Rekam hasil problem framing dan model perangkat lunak dalam model Input, Proses, Output.',
                color: '#7c3aed',
                bg: 'rgba(124,58,237,0.12)',
                endpoint: '/api/data-collection',
                titleField: 'title',
                statKey: 'data-collection'
            },
            {
                key: 'dataset-definition',
                title: 'Definisi Dataset',
                icon: '🗄️',
                desc: 'Rekam pendefinisian model dataset yang perlu dibangun untuk kebutuhan training.',
                color: '#06b6d4',
                bg: 'rgba(6,182,212,0.12)',
                endpoint: '/api/analysis',
                titleField: 'title',
                statKey: 'analysis'
            },
            {
                key: 'data-processing',
                title: 'Pemrosesan Data',
                icon: '⚙️',
                desc: 'Rekam aktivitas univariate, multivariate, rekayasa fitur, penyiapan dataset pelatihan, evaluasi, dan test.',
                color: '#f59e0b',
                bg: 'rgba(245,158,11,0.12)',
                endpoint: '/api/visualization',
                titleField: 'title',
                statKey: 'visualization'
            },
            {
                key: 'model-planning',
                title: 'Perencanaan Model',
                icon: '🧠',
                desc: 'Rekam perencanaan model cerdas dan perencanaan refining model AI.',
                color: '#10b981',
                bg: 'rgba(16,185,129,0.12)',
                endpoint: '/api/models',
                titleField: 'name',
                statKey: 'models'
            },
            {
                key: 'training-testing',
                title: 'Pelatihan & Testing',
                icon: '🚀',
                desc: 'Rekam hasil pelatihan dan pengujian model dengan metrik akurasi dan performa.',
                color: '#ef4444',
                bg: 'rgba(239,68,68,0.12)',
                endpoint: '/api/training',
                titleField: 'name',
                statKey: 'training'
            },
            {
                key: 'model-refining',
                title: 'Refining Model',
                icon: '✨',
                desc: 'Rekam hasil refining model — peningkatan performa, tuning hyperparameter, dan iterasi perbaikan.',
                color: '#ec4899',
                bg: 'rgba(236,72,153,0.12)',
                endpoint: '/api/insights',
                titleField: 'title',
                statKey: 'insights'
            }
        ];

        // =====================================================================
        // CANVAS SEQUENCE
        // =====================================================================
        let canvas, ctx, images = [], currentFrame = 0;
        let seqDone = false;

        function initSequence() {
            canvas = document.getElementById('sequence-canvas');
            if (!canvas) return;
            ctx = canvas.getContext('2d');

            function resize() {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = window.innerWidth * dpr;
                canvas.height = window.innerHeight * dpr;
                canvas.style.width = window.innerWidth + 'px';
                canvas.style.height = window.innerHeight + 'px';
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
            }
            resize();
            window.addEventListener('resize', () => { resize(); renderFrame(currentFrame); });

            // Preload images
            let loaded = 0;
            for (let i = 0; i < FRAME_COUNT; i++) {
                const img = new Image();
                img.src = '/static/sequence/ezgif-frame-' + String(i + 1).padStart(3, '0') + '.jpg';
                img.onload = () => { loaded++; if (i === 0) renderFrame(0); };
                images.push(img);
            }

            // Scroll handler — smooth with RAF
            let rafId = null;
            let targetFrame = 0;
            let animFrame = 0;

            function animateToFrame() {
                if (Math.abs(animFrame - targetFrame) < 0.5) {
                    animFrame = targetFrame;
                    renderFrame(Math.round(animFrame));
                    rafId = null;
                    return;
                }
                animFrame += (targetFrame - animFrame) * 0.12;
                renderFrame(Math.round(animFrame));
                rafId = requestAnimationFrame(animateToFrame);
            }

            function updateProgress() {
                const pct = (targetFrame / (FRAME_COUNT - 1)) * 100;
                document.getElementById('seq-progress').style.width = pct + '%';
            }

            function handleScroll(e) {
                if (seqDone) return;
                e.preventDefault();

                const delta = e.deltaY || e.detail || (-e.wheelDelta);
                const step = delta > 0 ? 4 : -4;
                targetFrame = Math.min(Math.max(targetFrame + step, 0), FRAME_COUNT - 1);
                currentFrame = targetFrame;

                updateProgress();

                // Hide hint after first scroll
                if (targetFrame > 2) {
                    const hint = document.getElementById('scroll-hint');
                    if (hint) hint.style.opacity = '0';
                } else {
                    const hint = document.getElementById('scroll-hint');
                    if (hint) hint.style.opacity = '1';
                }

                if (!rafId) rafId = requestAnimationFrame(animateToFrame);

                // Trigger exit when reaching end
                if (targetFrame >= FRAME_COUNT - 1) {
                    seqDone = true;
                    setTimeout(exitSequence, 400);
                }
            }

            window.addEventListener('wheel', handleScroll, { passive: false });

            // Touch support
            let touchStartY = 0;
            window.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
            window.addEventListener('touchmove', e => {
                if (seqDone) return;
                const dy = touchStartY - e.touches[0].clientY;
                touchStartY = e.touches[0].clientY;
                targetFrame = Math.min(Math.max(targetFrame + Math.round(dy / 4), 0), FRAME_COUNT - 1);
                currentFrame = targetFrame;
                updateProgress();
                if (!rafId) rafId = requestAnimationFrame(animateToFrame);
                if (targetFrame >= FRAME_COUNT - 1) { seqDone = true; setTimeout(exitSequence, 400); }
            }, { passive: true });

            images[0].onload = () => renderFrame(0);
        }

        // Called from dashboard scroll-up to re-enter sequence
        function enterSequence() {
            seqDone = false;
            currentFrame = FRAME_COUNT - 1;
            // reset internal RAF targets
            const overlay = document.getElementById('sequence-overlay');
            overlay.style.display = 'flex';
            overlay.style.animation = '';
            overlay.style.opacity = '1';
            overlay.style.transform = 'scale(1)';
            overlay.classList.remove('hidden');

            const main = document.getElementById('main-content');
            main.classList.remove('visible');
            setTimeout(() => { main.style.display = 'none'; }, 400);

            renderFrame(FRAME_COUNT - 1);
            document.getElementById('seq-progress').style.width = '100%';
            const hint = document.getElementById('scroll-hint');
            if (hint) hint.style.opacity = '0';
        }

        function renderFrame(index) {
            const img = images[index];
            if (!img || !img.complete || !img.naturalWidth) return;
            const w = window.innerWidth, h = window.innerHeight;
            const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
            const x = (w - img.naturalWidth * scale) / 2;
            const y = (h - img.naturalHeight * scale) / 2;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
        }

        function exitSequence() {
            const overlay = document.getElementById('sequence-overlay');
            overlay.classList.add('hidden');

            const main = document.getElementById('main-content');
            main.style.display = 'flex';
            main.style.flexDirection = 'column';

            setTimeout(() => {
                main.classList.add('visible');
                overlay.style.pointerEvents = 'none';
            }, 100);

            setTimeout(() => {
                overlay.style.display = 'none';
            }, 1300);

            loadStats();

            // Listen for scroll-up at top of dashboard to re-enter sequence
            function onDashScrollUp(e) {
                if (!seqDone) return;
                const atTop = window.scrollY <= 0;
                if (atTop && e.deltaY < 0) {
                    window.removeEventListener('wheel', onDashScrollUp);
                    enterSequence();
                }
            }
            setTimeout(() => {
                window.addEventListener('wheel', onDashScrollUp, { passive: true });
            }, 1500);
        }

        // =====================================================================
        // RENDER FEATURES
        // =====================================================================
        function renderFeatures() {
            const grid = document.getElementById('features-grid');
            if (!grid) return;
            grid.innerHTML = FEATURES.map((f, i) => `
            <div class="feature-card" onclick="openFeature('${f.key}')" style="transition-delay: ${i * 0.06}s">
                <div class="feature-icon-wrap" style="background:${f.bg}">
                    ${f.icon}
                    <span class="feature-badge" id="count-${f.key}">0</span>
                </div>
                <div class="feature-title">${f.title}</div>
                <div class="feature-desc">${f.desc}</div>
                <div class="feature-cta">
                    Lihat data
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
            </div>
        `).join('');

            // Staggered appear animation
            setTimeout(() => {
                document.querySelectorAll('.feature-card').forEach((card, i) => {
                    setTimeout(() => card.classList.add('appeared'), i * 70);
                });
            }, 100);
        }

        // =====================================================================
        // STATS
        // =====================================================================
        async function loadStats() {
            try {
                const res = await fetch('/creation/api/stats');
                const result = await res.json();
                const stats = result.stats || {};
                FEATURES.forEach(f => {
                    const el = document.getElementById('count-' + f.key);
                    if (el && stats[f.statKey] !== undefined) el.textContent = stats[f.statKey];
                });
                const total = FEATURES.reduce((acc, f) => acc + (stats[f.statKey] || 0), 0);
                animateCounter('stat-total', total);
                animateCounter('stat-framing', stats['data-collection'] || 0);
                animateCounter('stat-processing', stats['visualization'] || 0);
                animateCounter('stat-training', stats['training'] || 0);
            } catch (err) { console.warn('Stats unavailable'); }
        }

        function animateCounter(id, target) {
            const el = document.getElementById(id);
            if (!el) return;
            let cur = 0, inc = Math.max(1, Math.ceil(target / 25));
            const t = setInterval(() => {
                cur = Math.min(cur + inc, target);
                el.textContent = cur;
                if (cur >= target) clearInterval(t);
            }, 28);
        }

        // =====================================================================
        // MODAL
        // =====================================================================
        let currentFeature = null;

        function openFeature(key) {
            if (key === 'training-testing') {
                window.location.href = '/creation/ml_pipeline.html';
                return;
            }

            currentFeature = FEATURES.find(f => f.key === key);
            if (!currentFeature) return;

            // Pakai wizard sekuensial untuk semua fitur
            openWizard();
        }

        function closeModal(event) {
            if (event && event.target !== event.currentTarget && !event.target.closest('.modal-close')) return;
            document.getElementById('modal-overlay').classList.remove('active');
            document.body.style.overflow = '';
            currentFeature = null;
        }

        async function loadFeatureItems(feature) {
            const body = document.getElementById('modal-body');
            body.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
            try {
                const res = await fetch(feature.endpoint);
                const result = await res.json();
                const data = result.data || [];

                let html = `
                <button class="btn btn-primary" onclick="showAddForm()" style="margin-bottom:20px; width:100%; justify-content:center;">
                    + Tambah ${feature.title}
                </button>
                <div id="add-form-container"></div>
                <div class="items-list">
            `;

                if (!data.length) {
                    html += `<div class="empty-state"><div class="empty-icon">${feature.icon}</div><p>Belum ada data. Klik tombol di atas untuk menambahkan.</p></div>`;
                } else {
                    data.forEach(item => {
                        const title = item[feature.titleField] || item.name || item.title || 'Tanpa Judul';
                        const date = item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                        html += `
                        <div class="item-card">
                            <div class="item-info">
                                <div class="item-title">${title}</div>
                                ${date ? `<div class="item-meta">${date}</div>` : ''}
                            </div>
                            <button class="btn btn-danger" onclick="deleteItem(${item.id})">Hapus</button>
                        </div>
                    `;
                    });
                }

                html += '</div>';
                body.innerHTML = html;
            } catch (err) {
                body.innerHTML = `<div class="empty-state"><p style="color:#f87171">Gagal memuat data: ${err.message}</p></div>`;
            }
        }

        function showAddForm() {
            if (!currentFeature) return;
            const c = document.getElementById('add-form-container');
            let h = '<div class="add-form-panel"><h3>Tambah ' + currentFeature.title + '</h3>';
            currentFeature.fields.forEach(f => {
                const id = 'f-' + f.name;
                h += `<div class="form-group"><label>${f.label}${f.required ? ' *' : ''}</label>`;
                if (f.type === 'textarea') h += `<textarea id="${id}" class="form-textarea" placeholder="${f.label}..."></textarea>`;
                else if (f.type === 'select') h += `<select id="${id}" class="form-select">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
                else h += `<input type="${f.type || 'text'}" id="${id}" class="form-input" placeholder="${f.label}...">`;
                h += '</div>';
            });
            h += '<div class="form-actions"><button class="btn btn-secondary" onclick="hideAddForm()">Batal</button><button class="btn btn-primary" onclick="submitAdd()">Simpan</button></div></div>';
            c.innerHTML = h;
            c.querySelector('.form-input, .form-select, .form-textarea')?.focus();
        }

        function hideAddForm() {
            document.getElementById('add-form-container').innerHTML = '';
        }

        async function submitAdd() {
            if (!currentFeature) return;
            const data = {};
            currentFeature.fields.forEach(f => {
                const el = document.getElementById('f-' + f.name);
                if (el) data[f.name] = f.type === 'number' ? Number(el.value) : el.value;
            });
            // Validate required
            const reqField = currentFeature.fields.find(f => f.required);
            if (reqField && !data[reqField.name]?.trim()) {
                showToast(reqField.label + ' wajib diisi', 'error'); return;
            }
            try {
                const res = await fetch(currentFeature.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (!res.ok) throw new Error('Gagal menyimpan');
                showToast('Berhasil disimpan!', 'success');
                hideAddForm();
                await loadFeatureItems(currentFeature);
                await loadStats();
            } catch (err) { showToast('Error: ' + err.message, 'error'); }
        }

        async function deleteItem(id) {
            if (!currentFeature || !confirm('Hapus item ini?')) return;
            try {
                await fetch(currentFeature.endpoint + '/' + id, { method: 'DELETE' });
                showToast('Item dihapus', 'success');
                await loadFeatureItems(currentFeature);
                await loadStats();
            } catch (err) { showToast('Gagal menghapus', 'error'); }
        }

        // =====================================================================
        // TOAST
        // =====================================================================
        function showToast(msg, type = 'success') {
            const t = document.createElement('div');
            t.className = 'toast toast-' + type;
            t.textContent = msg;
            document.getElementById('toast-container').appendChild(t);
            setTimeout(() => t.remove(), 3500);
        }

        // =====================================================================
        // MISC
        // =====================================================================
        async function logout() {
            try {
                await fetch('/creation/api/auth/logout', { method: 'POST' });
            } catch (e) { }
            // Hapus semua data lokal agar tidak ada sisa session di browser
            try { localStorage.removeItem('ic_profile'); } catch (e) { }
            // Redirect ke halaman login (bukan landing page)
            window.location.href = '/creation/login.html';
        }

        // =====================================================================
        // WIZARD: DATA ENTRY SEKUENSIAL
        // =====================================================================
        let wzStep = 1;
        let wzData = { category: '', dataType: '', title: '', content: '', tags: [], extra: {} };

        function openWizard() {
            wzStep = 1;
            wzData = { category: '', dataType: '', title: '', content: '', tags: [], extra: {} };
            document.getElementById('wizard-overlay').classList.add('active');
            document.body.style.overflow = 'hidden';
            renderWizardStep();
        }

        function closeWizard(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('wizard-overlay').classList.remove('active');
            document.body.style.overflow = '';
        }

        function updateWizardNav() {
            const backBtn = document.getElementById('wz-btn-back');
            const nextBtn = document.getElementById('wz-btn-next');
            const stepLbl = document.getElementById('wz-step-label');
            const dots = [null, 'wz-dot-1', 'wz-dot-2', 'wz-dot-3'];
            const fills = [null, 'wz-fill-1', 'wz-fill-2'];

            backBtn.style.display = wzStep > 1 ? 'inline-flex' : 'none';
            stepLbl.textContent = `Langkah ${wzStep} dari 3`;
            nextBtn.textContent = wzStep === 3 ? '✅ Simpan Data' : 'Lanjut →';

            for (let i = 1; i <= 3; i++) {
                const el = document.getElementById(dots[i]);
                el.classList.remove('active', 'done');
                if (i < wzStep) el.classList.add('done');
                else if (i === wzStep) el.classList.add('active');
            }
            for (let i = 1; i <= 2; i++) {
                document.getElementById(fills[i]).style.width = wzStep > i ? '100%' : '0%';
            }
        }

        // =====================================================================
        // WIZARD STEPS CONFIG — 6 ML PIPELINE STAGES
        // =====================================================================
        const FEATURE_STEPS = {

            // 1. Problem Framing & IPO Model
            'problem-framing': {
                s1_title: 'Jenis Problem',
                s1_desc: 'Tentukan jenis masalah yang akan dipecahkan oleh model AI',
                categories: [
                    { key: 'klasifikasi', icon: '🏷️', name: 'Klasifikasi', desc: 'Memprediksi kategori/kelas data' },
                    { key: 'regresi', icon: '📉', name: 'Regresi', desc: 'Memprediksi nilai numerik kontinu' },
                    { key: 'klasterisasi', icon: '🔵', name: 'Klasterisasi', desc: 'Mengelompokkan data tanpa label' }
                ],
                s2_label1: 'Nama Proyek / Problem Statement',
                s2_label2: 'Deskripsi Model IPO (Input → Proses → Output)',
                s2_extra: [
                    { id: 'wz-input-ipo', label: 'INPUT — Data masukan yang digunakan', placeholder: 'Contoh: Dataset gambar 28x28 pixel, data teks ulasan...' },
                    { id: 'wz-proses-ipo', label: 'PROSES — Algoritma / transformasi yang diterapkan', placeholder: 'Contoh: CNN, preprocessing normalisasi, tokenisasi...' },
                    { id: 'wz-output-ipo', label: 'OUTPUT — Keluaran / prediksi yang diharapkan', placeholder: 'Contoh: Label kelas, nilai harga, cluster ID...' }
                ]
            },

            // 2. Definisi Dataset
            'dataset-definition': {
                s1_title: 'Sumber Dataset',
                s1_desc: 'Dari mana dataset yang akan dibangun berasal?',
                categories: [
                    { key: 'publik', icon: '🌐', name: 'Dataset Publik', desc: 'Kaggle, UCI, HuggingFace, dll.' },
                    { key: 'primer', icon: '🎙️', name: 'Data Primer', desc: 'Dikumpulkan sendiri / survei' },
                    { key: 'sintesis', icon: '🧬', name: 'Data Sintetis', desc: 'Dibuat secara programatik / augmentasi' }
                ],
                s2_label1: 'Nama / Judul Dataset',
                s2_label2: 'Deskripsi Dataset & Fitur Utama',
                s2_extra: [
                    { id: 'wz-jumlah-sampel', label: 'Jumlah Sampel / Baris Data', placeholder: 'Contoh: 10.000 sampel, 500 gambar...' },
                    { id: 'wz-fitur-target', label: 'Fitur Target / Label (jika ada)', placeholder: 'Contoh: kolom "label", "harga", "kategori"...' },
                    { id: 'wz-format-dataset', label: 'Format & Lokasi Dataset', placeholder: 'Contoh: CSV di /data/raw, JPEG di /images/...' }
                ]
            },

            // 3. Pemrosesan Data
            'data-processing': {
                s1_title: 'Tahap Pemrosesan',
                s1_desc: 'Pilih aktivitas utama pemrosesan data yang dilakukan',
                categories: [
                    { key: 'univariate', icon: '📊', name: 'Univariate Analysis', desc: 'Analisis distribusi satu variabel' },
                    { key: 'multivariate', icon: '🔗', name: 'Multivariate Analysis', desc: 'Korelasi & hubungan antar variabel' },
                    { key: 'feature-engineering', icon: '🛠️', name: 'Feature Engineering', desc: 'Rekayasa & seleksi fitur baru' }
                ],
                s2_label1: 'Nama Sesi Pemrosesan Data',
                s2_label2: 'Ringkasan Temuan Analisis',
                s2_extra: [
                    { id: 'wz-univariate', label: 'Hasil Univariate Analysis', placeholder: 'Contoh: distribusi normal, outlier pada kolom usia...' },
                    { id: 'wz-multivariate', label: 'Hasil Multivariate Analysis', placeholder: 'Contoh: korelasi tinggi antara X dan Y (r=0.87)...' },
                    { id: 'wz-feature-eng', label: 'Rekayasa Fitur yang Dilakukan', placeholder: 'Contoh: normalisasi Min-Max, one-hot encoding kategori...' },
                    { id: 'wz-split-dataset', label: 'Pembagian Dataset (Train/Val/Test)', placeholder: 'Contoh: 70% train, 15% val, 15% test...' }
                ]
            },

            // 4. Perencanaan Model
            'model-planning': {
                s1_title: 'Arsitektur Model',
                s1_desc: 'Pilih pendekatan arsitektur model cerdas yang direncanakan',
                categories: [
                    { key: 'deep-learning', icon: '🧠', name: 'Deep Learning', desc: 'CNN, RNN, Transformer' },
                    { key: 'classical-ml', icon: '🌳', name: 'Classical ML', desc: 'SVM, Random Forest, XGBoost' },
                    { key: 'ensemble', icon: '🔀', name: 'Ensemble / Hybrid', desc: 'Kombinasi beberapa model' }
                ],
                s2_label1: 'Nama Rencana Model',
                s2_label2: 'Deskripsi Arsitektur & Alasan Pemilihan',
                s2_extra: [
                    { id: 'wz-baseline', label: 'Baseline Model (jika ada)', placeholder: 'Contoh: Logistic Regression sebagai baseline awal...' },
                    { id: 'wz-hyperparams', label: 'Hyperparameter yang Direncanakan', placeholder: 'Contoh: lr=0.001, batch_size=32, dropout=0.3...' },
                    { id: 'wz-refining-plan', label: 'Rencana Refining Model', placeholder: 'Contoh: Grid search tuning, early stopping, regularisasi L2...' }
                ]
            },

            // 5. Pelatihan & Testing
            'training-testing': {
                s1_title: 'Mode Pelatihan',
                s1_desc: 'Pilih paradigma pembelajaran yang digunakan',
                categories: [
                    { key: 'supervised', icon: '👨‍🏫', name: 'Supervised', desc: 'Belajar dengan data berlabel' },
                    { key: 'transfer-learning', icon: '🔄', name: 'Transfer Learning', desc: 'Gunakan model pretrained' },
                    { key: 'semi-supervised', icon: '🔍', name: 'Semi-Supervised', desc: 'Sebagian data tidak berlabel' }
                ],
                s2_label1: 'Nama Sesi Pelatihan',
                s2_label2: 'Konfigurasi Training (Epochs, Optimizer, dll.)',
                s2_extra: [
                    { id: 'wz-train-accuracy', label: 'Hasil Training Accuracy / Loss', placeholder: 'Contoh: Epoch 50 — accuracy: 94.2%, loss: 0.18...' },
                    { id: 'wz-test-accuracy', label: 'Hasil Testing / Evaluasi Model', placeholder: 'Contoh: Test accuracy: 91.5%, F1-score: 0.91...' },
                    { id: 'wz-confusion', label: 'Catatan Confusion Matrix / Metrik Lain', placeholder: 'Contoh: Precision 0.93, Recall 0.90, ROC-AUC: 0.97...' }
                ]
            },

            // 6. Refining Model
            'model-refining': {
                s1_title: 'Strategi Refining',
                s1_desc: 'Pilih pendekatan yang digunakan untuk meningkatkan performa model',
                categories: [
                    { key: 'hyperparameter-tuning', icon: '🎛️', name: 'Hyperparameter Tuning', desc: 'Grid search, random search, Bayesian' },
                    { key: 'architecture-change', icon: '🏗️', name: 'Ubah Arsitektur', desc: 'Tambah/kurangi layer, attention head' },
                    { key: 'data-augmentation', icon: '🔁', name: 'Augmentasi Data', desc: 'Perbanyak data training sintetis' }
                ],
                s2_label1: 'Nama Sesi Refining',
                s2_label2: 'Perubahan yang Dilakukan',
                s2_extra: [
                    { id: 'wz-before-metric', label: 'Performa SEBELUM Refining', placeholder: 'Contoh: accuracy: 88.0%, F1: 0.87...' },
                    { id: 'wz-after-metric', label: 'Performa SETELAH Refining', placeholder: 'Contoh: accuracy: 93.5%, F1: 0.93...' },
                    { id: 'wz-refining-notes', label: 'Catatan Iterasi & Lesson Learned', placeholder: 'Contoh: Dropout 0.4 lebih baik dari 0.2, batch 64 optimal...' }
                ]
            }
        };

        function renderWizardStep() {
            const body = document.getElementById('wz-body');
            const fKey = currentFeature ? currentFeature.key : 'problem-framing';
            const stepConfig = FEATURE_STEPS[fKey] || FEATURE_STEPS['problem-framing'];

            const titles = ['', stepConfig.s1_title, 'Isi Detail & Dokumentasi', 'Review & Konfirmasi'];
            const subs = ['', stepConfig.s1_desc, 'Lengkapi seluruh informasi yang diperlukan', 'Pastikan semua data sudah benar sebelum disimpan'];

            document.getElementById('wz-title').textContent = titles[wzStep];
            document.getElementById('wz-subtitle').textContent = subs[wzStep];
            updateWizardNav();

            if (wzStep === 1) {
                let uploadHtml = '';
                if (fKey === 'problem-framing') {
                    uploadHtml = `
                    <label style="display:block; background:rgba(168, 85, 247, 0.05); border: 2px dashed rgba(168, 85, 247, 0.5); border-radius: 12px; padding: 30px; text-align: center; cursor: pointer; margin-bottom: 20px; transition: 0.3s;" onmouseover="this.style.borderColor='#a855f7'" onmouseout="this.style.borderColor='rgba(168, 85, 247, 0.5)'">
                        <div style="font-size: 2.5rem; margin-bottom: 10px;">🤖</div>
                        <h3 style="margin:0 0 5px 0;">Auto-Framing dengan AI</h3>
                        <p style="color:#94a3b8; font-size:0.85rem; margin:0;">Upload Gambar atau File (CSV/Teks) untuk otomatis membuat kerangka IPO</p>
                        <input type="file" id="framing-file" style="display:none" onchange="handleFramingUpload(event)">
                        <div id="framing-loading" style="display:none; margin-top:15px; color:#38bdf8; font-weight:bold;">Menganalisis file...</div>
                    </label>
                    <div style="text-align:center; margin-bottom: 15px; color:#94a3b8; font-size:0.85rem;">— ATAU PILIH MANUAL —</div>
                    `;
                }

                body.innerHTML = uploadHtml + `<div class="cat-grid">
                    ${stepConfig.categories.map(c => `
                    <div class="cat-card ${wzData.category === c.key ? 'selected' : ''}" onclick="selectCategory('${c.key}', '${c.name}')">
                        <div class="cat-check">✓</div>
                        <div class="cat-icon">${c.icon}</div>
                        <div class="cat-name">${c.name}</div>
                        <div class="cat-desc">${c.desc}</div>
                    </div>`).join('')}
                </div>`;
            }

            else if (wzStep === 2) {
                const cat = stepConfig.categories.find(c => c.key === wzData.category) || stepConfig.categories[0];
                const extraFields = stepConfig.s2_extra || [];

                let extraHtml = extraFields.map(ef => `
                <div class="wz-form-group">
                    <label class="wz-label">${ef.label}</label>
                    <textarea class="wz-textarea" id="${ef.id}" placeholder="${ef.placeholder}" oninput="wzData.extra['${ef.id}']=this.value" style="min-height:72px;">${wzData.extra[ef.id] || ''}</textarea>
                </div>`).join('');

                body.innerHTML = `
                <div class="wz-form-group">
                    <label class="wz-label">${stepConfig.s2_label1} <span>*</span></label>
                    <input class="wz-input" id="wz-title-input" placeholder="Masukkan judul..." value="${wzData.title}" oninput="wzData.title=this.value">
                </div>
                <div class="wz-form-group">
                    <label class="wz-label">${stepConfig.s2_label2}</label>
                    <textarea class="wz-textarea" id="wz-content-input" placeholder="Deskripsi umum..." oninput="wzData.content=this.value">${wzData.content}</textarea>
                </div>
                ${extraHtml}
                <div class="wz-form-group">
                    <label class="wz-label">Tags <span style="color:var(--muted);font-weight:400;">(opsional)</span></label>
                    <div class="wz-tags-input" id="wz-tags-wrap" onclick="document.getElementById('wz-tag-input').focus()">
                        ${wzData.tags.map(t => `<span class="wz-tag">${t}<button onclick="removeWzTag('${t}')" type="button">×</button></span>`).join('')}
                        <input class="wz-tag-bare-input" id="wz-tag-input" placeholder="Ketik tag, tekan Enter..." onkeydown="handleTagKey(event)">
                    </div>
                    <p class="wz-hint">💡 Tekan Enter atau koma untuk menambah tag</p>
                </div>
                <div style="padding:12px 16px;border-radius:12px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;gap:10px;">
                    <span style="font-size:1.4rem">${cat.icon}</span>
                    <span style="font-size:0.85rem;color:#c4b5fd;">Terpilih: <strong>${cat.name}</strong> — ${cat.desc}</span>
                </div>`;
                setTimeout(() => document.getElementById('wz-title-input')?.focus(), 50);
            }

            else if (wzStep === 3) {
                const cat = stepConfig.categories.find(c => c.key === wzData.category) || stepConfig.categories[0];
                const tagsHtml = wzData.tags.length
                    ? wzData.tags.map(t => `<span class="wz-tag">${t}</span>`).join(' ')
                    : '<span style="color:var(--muted);font-size:0.85rem;">—</span>';
                const extraFields = stepConfig.s2_extra || [];
                const extraReviewRows = extraFields.map(ef => `
                    <div class="review-row">
                        <div class="review-key" style="width:140px;font-size:0.72rem;">${ef.label.split('—')[0].trim()}</div>
                        <div class="review-val" style="color:rgba(255,255,255,0.75);font-size:0.85rem;">${wzData.extra[ef.id] || '<em style="color:var(--muted)">—</em>'}</div>
                    </div>`).join('');

                body.innerHTML = `
                <div class="review-success-icon">${currentFeature ? currentFeature.icon : '🎯'}</div>
                <p style="text-align:center;color:var(--muted);font-size:0.85rem;margin-bottom:20px;">Periksa ringkasan dokumentasi Anda sebelum disimpan</p>
                <div class="review-card">
                    <div class="review-row">
                        <div class="review-key">Kategori</div>
                        <div class="review-val"><span class="review-badge">${cat.icon} ${cat.name}</span></div>
                    </div>
                    <div class="review-row">
                        <div class="review-key">${stepConfig.s2_label1}</div>
                        <div class="review-val" style="font-weight:600;">${wzData.title || '—'}</div>
                    </div>
                    <div class="review-row">
                        <div class="review-key" style="width:140px;">Deskripsi</div>
                        <div class="review-val" style="color:rgba(255,255,255,0.75);font-size:0.85rem;">${wzData.content || '<em style="color:var(--muted)">Tidak ada deskripsi</em>'}</div>
                    </div>
                    ${extraReviewRows}
                    <div class="review-row">
                        <div class="review-key">Tags</div>
                        <div class="review-val">${tagsHtml}</div>
                    </div>
                </div>`;
            }
        }

        function selectCategory(key, type) {
            wzData.category = key;
            wzData.dataType = type;
            document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
        }

        function handleTagKey(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = e.target.value.trim().replace(',', '');
                if (val && !wzData.tags.includes(val)) {
                    wzData.tags.push(val);
                    renderWizardStep();
                } else { e.target.value = ''; }
            }
        }

        function removeWzTag(tag) {
            wzData.tags = wzData.tags.filter(t => t !== tag);
            renderWizardStep();
        }

        async function wizardNext() {
            if (wzStep === 1) {
                if (!wzData.category) { showToast('Pilih kategori terlebih dahulu', 'error'); return; }
                wzStep = 2;
                renderWizardStep();
            } else if (wzStep === 2) {
                if (!wzData.title.trim()) { showToast('Judul tidak boleh kosong', 'error'); return; }
                wzStep = 3;
                renderWizardStep();
            } else if (wzStep === 3) {
                await saveWizardData();
            }
        }

        function wizardBack() {
            if (wzStep > 1) { wzStep--; renderWizardStep(); }
        }

        const PIPELINE_ORDER = [
            'problem-framing', 'dataset-definition', 'data-processing',
            'model-planning', 'training-testing', 'model-refining'
        ];

        async function handleFramingUpload(e) {
            const file = e.target.files[0];
            if (!file) return;

            document.getElementById('framing-loading').style.display = 'block';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/creation/api/ml/framing', { method: 'POST', body: formData });
                const contentType = res.headers.get("content-type");

                if (!contentType || !contentType.includes("application/json")) {
                    console.error("Non-JSON response received:", await res.text());
                    throw new Error("Sistem API gagal merespons. Pastikan Anda membuka web ini melalui http://localhost:8000 (Django Server) atau http://localhost:3000 (Node.js Server), BUKAN dari Live Server VS Code.");
                }

                const data = await res.json();

                if (!res.ok) throw new Error(data.error || 'Gagal memproses file');

                // Auto-fill form
                wzData.category = data.category || 'klasifikasi';
                wzData.title = data.title;
                if (!wzData.extra) wzData.extra = {};
                wzData.extra['wz-input-ipo'] = data.input;
                wzData.extra['wz-proses-ipo'] = data.process;
                wzData.extra['wz-output-ipo'] = data.output;

                showToast('✅ AI Framing Berhasil!', 'success');

                // Lanjut ke step 2 otomatis
                wzStep = 2;
                renderWizardStep();

            } catch (err) {
                showToast(err.message, 'error');
                document.getElementById('framing-loading').style.display = 'none';
            }
        }

        // Build full content string from extra fields
        function buildFullContent(stepConfig) {
            const parts = [];
            if (wzData.content) parts.push('=== Deskripsi Umum ===\n' + wzData.content);
            const extraFields = stepConfig.s2_extra || [];
            extraFields.forEach(ef => {
                const val = wzData.extra[ef.id] || '';
                if (val) parts.push('\n=== ' + ef.label.split('—')[0].trim() + ' ===\n' + val);
            });
            if (wzData.tags && wzData.tags.length) parts.push('\n=== Tags ===\n' + wzData.tags.join(', '));
            return parts.join('\n');
        }

        async function saveWizardData() {
            const btn = document.getElementById('wz-btn-next');
            btn.disabled = true;
            btn.textContent = 'Menyimpan...';
            try {
                const key = currentFeature.key;
                const fKey = currentFeature.key;
                const stepConfig = FEATURE_STEPS[fKey];
                const fullContent = buildFullContent(stepConfig);
                let payload = {};

                // Map 6 ML pipeline stages to existing API endpoints
                if (key === 'problem-framing') {
                    // → /api/data-collection
                    payload = {
                        title: wzData.title,
                        content: fullContent,
                        category: wzData.category,
                        data_type: 'problem-framing',
                        tags: wzData.tags
                    };
                } else if (key === 'dataset-definition') {
                    // → /api/analysis
                    payload = {
                        title: wzData.title,
                        method: wzData.category || 'statistical',
                        data_entry_id: null
                    };
                    // Append extra to title as analysis title includes all info
                    payload.title = wzData.title;
                } else if (key === 'data-processing') {
                    // → /api/visualization (used as processing log)
                    payload = {
                        title: wzData.title,
                        data_source: fullContent,
                        chart_type: wzData.category || 'bar'
                    };
                } else if (key === 'model-planning') {
                    // → /api/models
                    payload = {
                        name: wzData.title,
                        description: fullContent,
                        model_type: wzData.category === 'deep-learning' ? 'neural_network'
                            : wzData.category === 'classical-ml' ? 'classification' : 'classification'
                    };
                } else if (key === 'training-testing') {
                    // → /api/training
                    payload = {
                        name: wzData.title,
                        dataset: wzData.content,
                        epochs: 50
                    };
                } else if (key === 'model-refining') {
                    // → /api/insights
                    payload = {
                        title: wzData.title,
                        content: fullContent,
                        insight_type: 'recommendation'
                    };
                } else {
                    payload = { title: wzData.title, content: fullContent };
                }

                const res = await fetch(currentFeature.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Gagal menyimpan data');
                }

                const nextIdx = PIPELINE_ORDER.indexOf(key) + 1;

                if (nextIdx > 0 && nextIdx < PIPELINE_ORDER.length) {
                    const nextKey = PIPELINE_ORDER[nextIdx];
                    const nextFeature = FEATURES.find(f => f.key === nextKey);
                    showToast('✅ Tersimpan! Lanjut ke: ' + nextFeature.title, 'success');
                    setTimeout(() => {
                        currentFeature = nextFeature;
                        wzStep = 1;
                        wzData = { category: '', dataType: '', title: '', content: '', tags: [], extra: {} };
                        renderWizardStep();
                    }, 1200);
                } else {
                    showToast('🎉 Seluruh 6 tahap ML Pipeline telah terdokumentasi!', 'success');
                    document.getElementById('wizard-overlay').classList.remove('active');
                    document.body.style.overflow = '';
                }

                await loadStats();
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '✅ Simpan Data';
            }
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(e); });


        // =====================================================================
        // PROFILE
        // =====================================================================
        let profileData = {
            name: 'User',
            email: '',
            role: 'Member',
            location: '',
            memberSince: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            photoUrl: null
        };
        let profileEditMode = false;

        function openProfile() {
            renderProfileView();
            document.getElementById('profile-overlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeProfile(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('profile-overlay').classList.remove('active');
            document.body.style.overflow = '';
            if (profileEditMode) cancelProfileEdit();
        }

        function renderProfileView() {
            const grid = document.getElementById('profile-info-grid');
            grid.innerHTML = `
            <div class="profile-field">
                <div class="profile-field-label"><span>👤</span> Full Name</div>
                <div class="profile-field-value">${profileData.name || '—'}</div>
            </div>
            <div class="profile-field">
                <div class="profile-field-label"><span>✉️</span> Email Address</div>
                <div class="profile-field-value" style="font-size:0.9rem">${profileData.email || '—'}</div>
            </div>
            <div class="profile-field">
                <div class="profile-field-label"><span>💼</span> Role</div>
                <div class="profile-field-value">${profileData.role || '—'}</div>
            </div>
            <div class="profile-field">
                <div class="profile-field-label"><span>📍</span> Location</div>
                <div class="profile-field-value">${profileData.location || '—'}</div>
            </div>
        `;
            document.getElementById('profile-member-since').textContent = 'Member since ' + profileData.memberSince;
            document.getElementById('profile-save-btns').style.display = 'none';
            document.getElementById('profile-edit-toggle').style.display = 'inline-flex';
            renderProfileAvatar();
        }

        function renderProfileEditMode() {
            const grid = document.getElementById('profile-info-grid');
            grid.innerHTML = `
            <div class="profile-field">
                <div class="profile-field-label"><span>👤</span> Full Name</div>
                <input class="profile-edit-input" id="edit-name" value="${profileData.name}" placeholder="Nama lengkap">
            </div>
            <div class="profile-field">
                <div class="profile-field-label"><span>✉️</span> Email Address</div>
                <input class="profile-edit-input" id="edit-email" type="email" value="${profileData.email}" placeholder="Email">
            </div>
            <div class="profile-field">
                <div class="profile-field-label"><span>💼</span> Role</div>
                <input class="profile-edit-input" id="edit-role" value="${profileData.role}" placeholder="Role / Jabatan">
            </div>
            <div class="profile-field">
                <div class="profile-field-label"><span>📍</span> Location</div>
                <input class="profile-edit-input" id="edit-location" value="${profileData.location}" placeholder="Kota, Negara">
            </div>
        `;
            document.getElementById('profile-save-btns').style.display = 'flex';
            document.getElementById('profile-edit-toggle').style.display = 'none';
        }

        function toggleProfileEdit() {
            profileEditMode = true;
            renderProfileEditMode();
        }

        function cancelProfileEdit() {
            profileEditMode = false;
            renderProfileView();
        }

        function saveProfile() {
            const name = document.getElementById('edit-name')?.value.trim();
            const email = document.getElementById('edit-email')?.value.trim();
            const role = document.getElementById('edit-role')?.value.trim();
            const location = document.getElementById('edit-location')?.value.trim();

            if (!name) { showToast('Nama tidak boleh kosong', 'error'); return; }

            profileData.name = name || profileData.name;
            profileData.email = email || profileData.email;
            profileData.role = role || profileData.role;
            profileData.location = location || profileData.location;

            profileEditMode = false;
            renderProfileView();
            updateHeaderChip();
            saveProfileLocal();
            showToast('Profil berhasil disimpan!', 'success');
        }

        function triggerPhotoUpload() {
            document.getElementById('photo-file-input').click();
        }

        let cameraStream = null;
        let snapshotDataUrl = null;

        async function openCameraModal() {
            const overlay = document.getElementById('camera-overlay');
            overlay.style.display = 'flex';
            document.getElementById('cam-live-view').style.display = 'flex';
            document.getElementById('cam-preview-view').style.display = 'none';
            document.getElementById('cam-countdown').style.display = 'none';
            document.getElementById('cam-status').textContent = 'Posisikan wajah Anda di dalam bingkai';
            document.getElementById('cam-capture-btn').disabled = false;
            document.body.style.overflow = 'hidden';

            const video = document.getElementById('camera-video');
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
                });
                video.srcObject = cameraStream;
                video.play();
                document.getElementById('cam-status').textContent = 'Kamera aktif — siap untuk mengambil foto';
            } catch (err) {
                showToast('❌ Kamera tidak dapat diakses. Pastikan izin kamera sudah diberikan.', 'error');
                overlay.style.display = 'none';
                document.body.style.overflow = '';
                console.error(err);
            }
        }

        function closeCameraModal() {
            const overlay = document.getElementById('camera-overlay');
            overlay.style.display = 'none';
            document.body.style.overflow = '';
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                cameraStream = null;
            }
            snapshotDataUrl = null;
        }

        function startCountdown() {
            const btn = document.getElementById('cam-capture-btn');
            btn.disabled = true;
            const countdownEl = document.getElementById('cam-countdown');
            const numEl = document.getElementById('cam-countdown-num');
            const statusEl = document.getElementById('cam-status');
            countdownEl.style.display = 'flex';

            let count = 3;
            numEl.textContent = count;
            numEl.style.animation = 'none';
            void numEl.offsetWidth; // reflow
            numEl.style.animation = 'countPulse 1s ease';
            statusEl.textContent = 'Bersiap...';

            const interval = setInterval(() => {
                count--;
                if (count <= 0) {
                    clearInterval(interval);
                    countdownEl.style.display = 'none';
                    takeSnapshot();
                    return;
                }
                numEl.textContent = count;
                numEl.style.animation = 'none';
                void numEl.offsetWidth;
                numEl.style.animation = 'countPulse 1s ease';
            }, 1000);
        }

        function takeSnapshot() {
            const video = document.getElementById('camera-video');
            const canvas = document.getElementById('camera-canvas');
            if (!cameraStream || !video.videoWidth) {
                showToast('Kamera belum siap, coba lagi.', 'error');
                document.getElementById('cam-capture-btn').disabled = false;
                return;
            }

            // Mirror-flip to match the CSS transform:scaleX(-1)
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            snapshotDataUrl = canvas.toDataURL('image/jpeg', 0.92);

            // Show preview
            document.getElementById('cam-live-view').style.display = 'none';
            document.getElementById('cam-preview-view').style.display = 'flex';
            document.getElementById('cam-preview-img').src = snapshotDataUrl;
        }

        function retakePhoto() {
            snapshotDataUrl = null;
            document.getElementById('cam-preview-view').style.display = 'none';
            document.getElementById('cam-live-view').style.display = 'flex';
            document.getElementById('cam-capture-btn').disabled = false;
            document.getElementById('cam-status').textContent = 'Kamera aktif — siap untuk mengambil foto';
        }

        function confirmSnapshot() {
            if (!snapshotDataUrl) return;
            profileData.photoUrl = snapshotDataUrl;
            renderProfileAvatar();
            updateHeaderChip();
            saveProfileLocal();
            showToast('✅ Foto profil dari kamera berhasil diperbarui!', 'success');
            closeCameraModal();
        }

        function handlePhotoChange(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar', 'error'); return; }
            if (file.size > 5 * 1024 * 1024) { showToast('Ukuran file maks 5MB', 'error'); return; }

            const reader = new FileReader();
            reader.onload = function (e) {
                profileData.photoUrl = e.target.result;
                renderProfileAvatar();
                updateHeaderChip();
                saveProfileLocal();
                showToast('Foto profil diperbarui!', 'success');
            };
            reader.readAsDataURL(file);
            // Reset input so same file can be re-selected
            event.target.value = '';
        }

        function renderProfileAvatar() {
            const img = document.getElementById('profile-avatar-img');
            const placeholder = document.getElementById('profile-avatar-placeholder');
            if (profileData.photoUrl) {
                img.src = profileData.photoUrl;
                img.style.display = 'block';
                placeholder.style.display = 'none';
            } else {
                img.style.display = 'none';
                placeholder.style.display = 'flex';
            }
        }

        function updateHeaderChip() {
            const avatar = document.getElementById('user-avatar');
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.textContent = profileData.name;

            if (profileData.photoUrl) {
                avatar.innerHTML = '';
                avatar.style.background = 'none';
                avatar.style.padding = '0';
                avatar.style.overflow = 'hidden';
                const img = document.createElement('img');
                img.src = profileData.photoUrl;
                img.className = 'user-chip-img';
                avatar.appendChild(img);
            } else {
                avatar.innerHTML = (profileData.name || 'U')[0].toUpperCase();
                avatar.style.background = 'linear-gradient(135deg, var(--purple), var(--pink))';
            }
        }

        function saveProfileLocal() {
            try { localStorage.setItem('ic_profile', JSON.stringify(profileData)); } catch (e) { }
        }

        async function fetchUserProfile() {
            try {
                const res = await fetch('/creation/api/auth/me');
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        profileData.name = data.user.name || 'User';
                        profileData.email = data.user.email || '';
                        if (data.user.created_at) {
                            profileData.memberSince = new Date(data.user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                        }
                        updateHeaderChip();
                    }
                }
            } catch (e) {
                console.error("Error fetching profile from backend:", e);
            }
        }

        function loadProfileLocal() {
            try {
                const saved = localStorage.getItem('ic_profile');
                if (saved) {
                    profileData = { ...profileData, ...JSON.parse(saved) };
                    updateHeaderChip();
                }
            } catch (e) { }
            fetchUserProfile();
        }

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.getElementById('profile-overlay').classList.contains('active')) {
                closeProfile();
            }
        });

        // Initial loading sequence
        function startSequence() {
            // Sequence disabled, immediately show main content
            const main = document.getElementById('main-content');
            main.style.display = 'flex';
            main.style.flexDirection = 'column';
            main.style.opacity = '1';
            main.style.transform = 'none';
            main.classList.add('visible');

            const overlay = document.getElementById('sequence-overlay');
            if (overlay) overlay.style.display = 'none';

            loadStats();

            // Setup scroll to re-enter sequence (disabled)
        }

        window.onload = () => {
            const overlay = document.getElementById('sequence-overlay');
            if(overlay) overlay.style.display = 'none';

            const main = document.getElementById('main-content');
            main.style.display = 'flex';
            main.style.opacity = '1';
            main.style.transform = 'none';

            loadProfileLocal();
            renderFeatures();
            startSequence();

            // ⭐ Init 6 Grid Pipeline
            initPipelineGrid();
            initMaintenanceNotes();
            initEnvDashboard();

            // Greet user
            const hour = new Date().getHours();
            const greet = hour < 12 ? 'Selamat pagi' : hour < 17 ? 'Selamat siang' : 'Selamat malam';
            const el = document.getElementById('hero-greeting');
            if (el) el.textContent = greet;
         };
    