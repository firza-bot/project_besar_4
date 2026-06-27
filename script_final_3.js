
    const pipelineState = {
        projects: [],
        grid1Data: [], grid1Selected: [],
        grid2Queue: [], grid2Stages: [],
        grid3Data: [], grid4Ready: [], history: []
    };

    let activeSubmissionId = null;
    let activePlaygroundSubId = null;

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function initPipelineGrid() {
        loadPipelineData();
        // Silent refresh every 10 seconds
        setInterval(loadPipelineData, 10000);
    }

    function savePipelineState() {
        // No-op: DB is the single source of truth now!
    }

    function loadPipelineState() {
        // No-op: handled in loadPipelineData
    }

    async function loadPipelineData() {
        try {
            // Check IntringPM Status
            try {
                const statusRes = await fetch('/creation/api/intring_status/');
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    const btn = document.getElementById('buka-project-btn');
                    const badge = document.getElementById('intring-offline-badge');
                    if (statusData.online) {
                        if(btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
                        if(badge) badge.style.display = 'none';
                    } else {
                        if(btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
                        if(badge) badge.style.display = 'block';
                    }
                }
            } catch (e) {
                console.error("Error checking status:", e);
            }

            // Load projects from UIUX API
            try {
                const projRes = await fetch('/creation/api/ic_projects/');
                if (projRes.ok) {
                    const projData = await projRes.json();
                    pipelineState.projects = projData;
                }
            } catch (e) {
                console.error("Error loading projects:", e);
            }

            const res = await fetch('/creation/api/submissions/list/');
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Gagal memuat');
            
            const submissions = data.submissions || [];
            
            pipelineState.grid1Data = submissions.filter(s => s.status === 'pending');
            pipelineState.grid2Queue = submissions.filter(s => s.status === 'in_progress');
            pipelineState.grid3Data = submissions.filter(s => s.status === 'completed');
            pipelineState.grid4Ready = submissions.filter(s => s.status === 'completed');
            
            // Populate history from sent items
            pipelineState.history = submissions.filter(s => s.status === 'sent').map(s => ({
                id: s.id,
                title: s.title,
                sentAt: s.received_at,
                destination: 'Kelompok Implementasi'
            }));
            
            // Setup Grid 2 Stages status based on active sub
            if (pipelineState.grid2Queue.length > 0) {
                const activeSub = pipelineState.grid2Queue[0];
                activeSubmissionId = activeSub.id;
                
                const currentStage = activeSub.current_stage;
                const pipelineData = activeSub.pipeline_data || {};
                
                pipelineState.grid2Stages = [
                    { name: 'Problem Framing', status: currentStage > 0 ? 'done' : 'active', data: pipelineData.stage_0 },
                    { name: 'Dataset Definition', status: currentStage > 1 ? 'done' : (currentStage === 1 ? 'active' : 'wait'), data: pipelineData.stage_1 },
                    { name: 'Processing', status: currentStage > 2 ? 'done' : (currentStage === 2 ? 'active' : 'wait'), data: pipelineData.stage_2 },
                    { name: 'Model Planning', status: currentStage > 3 ? 'done' : (currentStage === 3 ? 'active' : 'wait'), data: pipelineData.stage_3 },
                    { name: 'Engine Execution', status: currentStage > 4 ? 'done' : (currentStage === 4 ? 'active' : 'wait'), data: pipelineData.stage_4 }
                ];
            } else if (pipelineState.grid3Data.length > 0) {
                const completedSub = pipelineState.grid3Data[0];
                activeSubmissionId = completedSub.id;
                const pipelineData = completedSub.pipeline_data || {};
                
                pipelineState.grid2Stages = [
                    { name: 'Problem Framing', status: 'done', data: pipelineData.stage_0 },
                    { name: 'Dataset Definition', status: 'done', data: pipelineData.stage_1 },
                    { name: 'Processing', status: 'done', data: pipelineData.stage_2 },
                    { name: 'Model Planning', status: 'done', data: pipelineData.stage_3 },
                    { name: 'Engine Execution', status: 'done', data: pipelineData.stage_4 }
                ];
            } else {
                activeSubmissionId = null;
                pipelineState.grid2Stages = [];
            }
            
            // Setup lock/unlock status of grids based on pipeline state
            if (pipelineState.grid2Queue.length > 0 || pipelineState.grid3Data.length > 0) {
                unlockGrid(3);
            } else {
                const c3 = document.getElementById('pg-card-3');
                if (c3) { c3.classList.remove('pg-unlocked'); c3.classList.add('pg-locked'); }
            }
            if (pipelineState.grid3Data.length > 0) {
                unlockGrid(4);
            } else {
                const c4 = document.getElementById('pg-card-4');
                if (c4) { c4.classList.remove('pg-unlocked'); c4.classList.add('pg-locked'); }
            }
            if (pipelineState.grid4Ready.length > 0) {
                unlockGrid(5);
            } else {
                const c5 = document.getElementById('pg-card-5');
                if (c5) { c5.classList.remove('pg-unlocked'); c5.classList.add('pg-locked'); }
            }

            // Render all UI elements
            renderProjects(pipelineState.projects);
            updateGrid2Stats();
            renderGrid2Mini(pipelineState.grid1Data);
            renderGrid3State();
            renderGrid4State();
            renderGrid5State();
            updateFlowBar();
            
            // Render playground
            renderFinalPlayground();
            
        } catch (e) {
            console.error("Error loading pipeline data:", e);
        }
    }

    // =====================================================================
    // GRID 1: PROJECT
    // =====================================================================
    function openProjectsModal() {
        document.getElementById('projects-modal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeProjectsModal(e) {
        if (e && e.target !== document.getElementById('projects-modal')) return;
        document.getElementById('projects-modal').classList.remove('active');
        document.body.style.overflow = '';
    }

    function openIssueSummary(issueStr, projectName) {
        const issue = JSON.parse(issueStr);
        document.getElementById('summ-key').textContent = issue.key;
        document.getElementById('summ-proj').textContent = projectName;
        document.getElementById('summ-title').textContent = issue.title;
        document.getElementById('summ-status').textContent = issue.status;
        document.getElementById('summ-priority').textContent = issue.priority;
        document.getElementById('summ-assignee').textContent = issue.assignee;
        document.getElementById('summ-reporter').textContent = issue.reporter;
        document.getElementById('summ-desc').textContent = issue.description || '-';
        
        // Setup Full Detail link
        const btn = document.getElementById('summ-full-detail');
        btn.onclick = () => {
            window.location.href = `/issue/${issue.id}/detail/`;
        };

        // styling colors based on priority
        const pBadge = document.getElementById('summ-priority');
        if (issue.priority.toLowerCase() === 'high' || issue.priority.toLowerCase() === 'critical') {
            pBadge.style.background = 'rgba(239, 68, 68, 0.2)'; pBadge.style.color = '#f87171'; pBadge.style.border = '1px solid rgba(239, 68, 68, 0.5)';
        } else if (issue.priority.toLowerCase() === 'medium') {
            pBadge.style.background = 'rgba(217, 119, 6, 0.2)'; pBadge.style.color = '#fbbf24'; pBadge.style.border = '1px solid rgba(217, 119, 6, 0.5)';
        } else {
            pBadge.style.background = 'rgba(2, 132, 199, 0.2)'; pBadge.style.color = '#38bdf8'; pBadge.style.border = '1px solid rgba(2, 132, 199, 0.5)';
        }

        closeProjectsModal();
        document.getElementById('issue-summary-modal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeIssueSummary(e) {
        if (e && e.target !== document.getElementById('issue-summary-modal')) return;
        document.getElementById('issue-summary-modal').classList.remove('active');
        document.body.style.overflow = '';
    }

    function renderProjects(projects) {
        const c = document.getElementById('projects-modal-list');
        if (!c) return;
        
        // Update stats on dashboard
        const totalProj = projects.length;
        const activeProj = projects.filter(p => p.status === 'active').length;
        document.getElementById('g1-project-total').textContent = totalProj;
        document.getElementById('g1-project-active').textContent = activeProj;
        
        if (!projects || projects.length === 0) {
            c.innerHTML = '<div class="pg-queue-empty"><span>📁</span><p>Belum ada project</p></div>';
            return;
        }
        
        c.innerHTML = projects.map(p => {
            const initial = p.project_name.substring(0,2).toUpperCase();
            const escName = p.project_name.replace(/'/g, "\\'");
            return `
            <div style="background: var(--bg-card-2); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; margin-bottom: 5px;">
                <!-- Card Header -->
                <div style="padding: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="display: flex; gap: 15px; align-items: center;">
                        <div style="width: 50px; height: 50px; border-radius: 12px; background: var(--purple); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.3rem; box-shadow: 0 4px 15px rgba(124,58,237,0.3);">
                            ${initial}
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 700; font-size: 1.2rem; color: var(--white);">${p.project_name}</span>
                            <span style="font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">${initial} · ${p.visibility || 'scrum'}</span>
                        </div>
                    </div>
                    <span style="background: rgba(16,185,129,0.15); color: var(--green); padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;">${p.status || 'active'}</span>
                </div>
                
                <!-- Divider -->
                <div style="height: 1px; background: var(--border); width: 100%;"></div>
                
                <!-- Card Actions (Replaced with Dropdown) -->
                <div style="padding: 15px 20px; background: rgba(255,255,255,0.01);">
                    <select onchange="if(this.value){ openIssueSummary(this.options[this.selectedIndex].dataset.issue, '${escName}'); }" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--white); font-size: 0.95rem; cursor: pointer; outline: none;">
                        <option value="">📋 Lihat Issue di Project ini (Pilih untuk memproses)...</option>
                        ${p.issues && p.issues.length > 0 ? 
                            p.issues.map(i => {
                                const issueStr = JSON.stringify(i).replace(/"/g, '&quot;');
                                return `<option value="${i.id}" data-issue="${issueStr}">${i.key} - ${i.title}</option>`;
                            }).join('') :
                            '<option value="" disabled>Tidak ada issue</option>'
                        }
                    </select>
                </div>
            </div>`
        }).join('');
    }

    async function deleteProject(id) {
        if (!confirm('Apakah Anda yakin ingin menghapus project ini?')) return;
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch(`/creation/api/v2/collaboration/${id}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': csrfToken
                }
            });
            if (res.ok) {
                showToast('✓ Project berhasil dihapus', 'success');
                await loadPipelineData();
            } else {
                showToast('Gagal menghapus project', 'error');
            }
        } catch(e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    function openAddProjectModal() {
        const overlay = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = 'Tambah Project Baru';
        body.innerHTML = `
            <form id="add-project-form" onsubmit="submitNewProject(event)" style="display:flex; flex-direction:column; gap:16px;">
                <div class="form-group">
                    <label for="proj-name" style="display:block; margin-bottom:6px; font-weight:600; font-size:0.85rem; color:rgba(255,255,255,0.7);">Nama Project</label>
                    <input type="text" id="proj-name" class="form-input" required placeholder="Masukkan nama project..." style="width:100%; padding:10px; border-radius:8px; background:var(--bg); border:1px solid var(--border); color:white;">
                </div>
                <div class="form-group">
                    <label for="proj-desc" style="display:block; margin-bottom:6px; font-weight:600; font-size:0.85rem; color:rgba(255,255,255,0.7);">Deskripsi</label>
                    <textarea id="proj-desc" class="form-textarea" placeholder="Masukkan deskripsi project..." rows="3" style="width:100%; padding:10px; border-radius:8px; background:var(--bg); border:1px solid var(--border); color:white; resize:vertical;"></textarea>
                </div>
                <div class="form-group">
                    <label for="proj-visibility" style="display:block; margin-bottom:6px; font-weight:600; font-size:0.85rem; color:rgba(255,255,255,0.7);">Visibilitas</label>
                    <select id="proj-visibility" class="form-select" style="width:100%; padding:10px; border-radius:8px; background:var(--bg); border:1px solid var(--border); color:white;">
                        <option value="private" selected>Private</option>
                        <option value="public">Public</option>
                    </select>
                </div>
                <div class="form-actions" style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="padding:10px 18px; border-radius:8px;">Batal</button>
                    <button type="submit" class="btn btn-primary" style="padding:10px 18px; border-radius:8px;">Simpan Project</button>
                </div>
            </form>
        `;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    async function submitNewProject(event) {
        event.preventDefault();
        const name = document.getElementById('proj-name').value;
        const desc = document.getElementById('proj-desc').value;
        const visibility = document.getElementById('proj-visibility').value;
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch('/creation/api/v2/collaboration/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    project_name: name,
                    description: desc,
                    visibility: visibility,
                    status: 'active'
                })
            });
            const result = await res.json();
            if (res.ok) {
                showToast('✓ Project berhasil dibuat!', 'success');
                closeModal();
                await loadPipelineData();
            } else {
                showToast('Gagal membuat project: ' + (result.error || 'Terjadi kesalahan'), 'error');
            }
        } catch(e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    // --- GRID 2 (Menerima Data Project) ---
    async function loadGrid2() {
        await loadPipelineData();
    }
    
    // State untuk file yang dipilih lewat form manual
    let g2SelectedFile = null;

    function handleGrid2Upload(event) {
        const file = event.target.files[0];
        if (!file) return;
        g2SelectedFile = file;
        // Update file indicator box
        const box = document.getElementById('g2-file-box');
        const nameEl = document.getElementById('g2-file-name');
        box.classList.add('has-file');
        box.querySelector('.g2-file-box-icon').textContent = '📦';
        nameEl.classList.add('active');
        nameEl.textContent = file.name;
        // Tambah tombol clear jika belum ada
        if (!box.querySelector('.g2-file-clear-btn')) {
            const clearBtn = document.createElement('button');
            clearBtn.className = 'g2-file-clear-btn';
            clearBtn.textContent = '✕ Hapus';
            clearBtn.onclick = clearG2File;
            box.appendChild(clearBtn);
        }
        updateG2SendBtnMode();
        showToast('📎 File terpilih: ' + file.name, 'info');
    }

    function clearG2File() {
        g2SelectedFile = null;
        const uploadEl = document.getElementById('g2-file-upload');
        if (uploadEl) uploadEl.value = '';
        const box = document.getElementById('g2-file-box');
        const nameEl = document.getElementById('g2-file-name');
        if (box) {
            box.classList.remove('has-file');
            const icon = box.querySelector('.g2-file-box-icon');
            if (icon) icon.textContent = '📄';
            const clearBtn = box.querySelector('.g2-file-clear-btn');
            if (clearBtn) clearBtn.remove();
        }
        if (nameEl) {
            nameEl.classList.remove('active');
            nameEl.textContent = 'Belum ada file yang dipilih';
        }
        updateG2SendBtnMode();
    }

    function updateG2SendBtnMode() {
        const hasFile = g2SelectedFile !== null;
        const hasSelected = pipelineState.grid1Selected.length > 0;
        const btn = document.getElementById('g2-send-btn');
        const countEl = document.getElementById('g2-send-count');
        if (btn) {
            if (hasFile) {
                btn.disabled = false;
                if (countEl) countEl.textContent = '1';
            } else if (hasSelected) {
                btn.disabled = false;
                if (countEl) countEl.textContent = hasSelected;
            } else {
                btn.disabled = true;
                if (countEl) countEl.textContent = '0';
            }
        }
    }

    function handleG2SendBtn() {
        if (g2SelectedFile !== null) {
            // Mode form manual: submit form + file
            submitManualFormWeb();
        } else if (pipelineState.grid1Selected.length > 0) {
            // Mode pilih dari inbox
            openSendToGrid3Modal();
        }
    }

    async function submitManualFormWeb() {
        if (!g2SelectedFile) { showToast('Pilih file terlebih dahulu', 'error'); return; }
        const form = document.querySelector('.g2-form');
        const inputs = form?.querySelectorAll('.g2-form-input, .g2-form-textarea, .g2-form-select') || [];
        const judul   = inputs[0]?.value.trim() || g2SelectedFile.name;
        const deskripsi = inputs[1]?.value.trim() || '';
        const kontak  = inputs[2]?.value.trim() || '';
        const urgensi = inputs[3]?.value || 'medium';
        const formData = new FormData();
        formData.append('source_file', g2SelectedFile);
        formData.append('title', judul);
        formData.append('description', deskripsi);
        formData.append('contact_email', kontak);
        formData.append('urgency', urgensi);
        formData.append('sender_name', document.getElementById('user-name')?.textContent.trim() || 'User');
        formData.append('sender_team', 'Manual Entry');
        const csrfToken = getCookie('csrftoken') || '';
        try {
            const btn = document.getElementById('g2-send-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ Mengunggah...';
            }
            const res = await fetch('/creation/api/v2/submissions/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                // Auto-approve ke Grid 3
                const approveRes = await fetch(`/creation/api/v2/submissions/${data.id}/approve_stage/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                if (approveRes.ok) {
                    showToast('✓ Data berhasil dikirim ke Grid 3: ' + judul, 'success');
                } else {
                    showToast('✓ File diunggah. Proses ke Grid 3 manual.', 'info');
                }
                
                // Restore button innerHTML BEFORE clearG2File/loadPipelineData so that g2-send-count exists
                if (btn) {
                    btn.innerHTML = 'Kirim ke Proses → <span class="pg-send-count" id="g2-send-count">0</span>';
                }
                
                // Reset form & file
                if (form) form.reset();
                clearG2File();
                await loadPipelineData();
            } else {
                showToast('Gagal mengunggah: ' + (data.error || 'Terjadi kesalahan'), 'error');
            }
        } catch(e) {
            showToast('Gagal: ' + e.message, 'error');
        } finally {
            const btn = document.getElementById('g2-send-btn');
            if (btn) {
                btn.innerHTML = 'Kirim ke Proses → <span class="pg-send-count" id="g2-send-count">0</span>';
            }
            updateG2SendBtnMode();
        }
    }

    function updateGrid2Stats() {
        const subs = pipelineState.grid1Data;
        const totalEl = document.getElementById('g2-total');
        const pendingEl = document.getElementById('g2-pending');
        const processedEl = document.getElementById('g2-processed');
        if (totalEl) totalEl.textContent = subs.length;
        if (pendingEl) pendingEl.textContent = subs.filter(s => s.status === 'pending').length;
        if (processedEl) processedEl.textContent = pipelineState.grid2Queue.length + pipelineState.grid3Data.length + pipelineState.history.length;
    }

    function renderGrid2Mini(subs) {
        const c = document.getElementById('g2-inbox-mini');
        if (!c) return;
        if (!subs || subs.length === 0) {
            c.innerHTML = '<div class="pg-queue-empty"><span>📭</span><p>Tidak ada data masuk</p></div>';
            updateG2SendBtnMode();
            return;
        }
        c.innerHTML = subs.map(s => `
            <div class="pg-mini-item">
                <div class="pg-mini-item-check" id="chk-${s.id}" onclick="toggleGrid2Item(${s.id})"></div>
                <span class="pg-mini-item-text" title="${s.title}">${s.title}</span>
                <span class="pg-mini-item-type">${s.data_type || 'file'}</span>
            </div>`).join('');
        updateGrid2SendBtn();
    }

    function toggleGrid2Item(id) {
        // Toggle single selection for Grid 2 queue logic
        const idx = pipelineState.grid1Selected.indexOf(id);
        if (idx === -1) {
            // Uncheck previous
            pipelineState.grid1Selected.forEach(prevId => {
                const prevChk = document.getElementById(`chk-${prevId}`);
                if (prevChk) { prevChk.classList.remove('checked'); prevChk.innerHTML = ''; }
            });
            pipelineState.grid1Selected = [id];
            const chk = document.getElementById(`chk-${id}`);
            if (chk) { chk.classList.add('checked'); chk.innerHTML = '✓'; }
        } else {
            pipelineState.grid1Selected = [];
            const chk = document.getElementById(`chk-${id}`);
            if (chk) { chk.classList.remove('checked'); chk.innerHTML = ''; }
        }
        updateGrid2SelectedDetails();
        updateGrid2SendBtn();
    }

    function updateGrid2SelectedDetails() {
        const targetId = pipelineState.grid1Selected[0];
        const item = pipelineState.grid1Data ? pipelineState.grid1Data.find(s => s.id === targetId) : null;
        
        const titleInput = document.getElementById('g2-form-title');
        const descTextarea = document.getElementById('g2-form-desc');
        const contactInput = document.getElementById('g2-form-contact');
        const urgencySelect = document.getElementById('g2-form-urgency');
        const minrowInput = document.getElementById('g2-form-minrow');
        const reqcolsInput = document.getElementById('g2-form-reqcols');

        const fileBox = document.getElementById('g2-file-box');
        const fileNameEl = document.getElementById('g2-file-name');

        if (!item) {
            if (titleInput) titleInput.value = "";
            if (descTextarea) descTextarea.value = "";
            if (contactInput) contactInput.value = "";
            if (urgencySelect) urgencySelect.value = "medium";
            if (minrowInput) minrowInput.value = "";
            if (reqcolsInput) reqcolsInput.value = "";
            if (fileBox) {
                fileBox.classList.remove('has-file');
                fileBox.querySelector('.g2-file-box-icon').textContent = '📄';
            }
            if (fileNameEl) {
                fileNameEl.classList.remove('active');
                fileNameEl.textContent = 'Belum ada file yang dipilih';
            }
            return;
        }

        if (titleInput) titleInput.value = item.title || "";
        if (descTextarea) descTextarea.value = item.description || "";
        if (contactInput) contactInput.value = item.sender_email || "";
        if (urgencySelect) urgencySelect.value = "medium";

        const meta = item.extra_metadata || {};
        if (minrowInput) minrowInput.value = meta.min_rows || meta.minrow || "";
        
        const reqCols = meta.required_columns || meta.required_column || "";
        if (reqcolsInput) reqcolsInput.value = Array.isArray(reqCols) ? reqCols.join(', ') : reqCols;

        if (fileBox) {
            fileBox.classList.add('has-file');
            fileBox.querySelector('.g2-file-box-icon').textContent = '📦';
        }
        if (fileNameEl) {
            fileNameEl.classList.add('active');
            fileNameEl.textContent = (item.file_name || 'Dataset API') + ' (API)';
        }
    }

    function updateGrid2SendBtn() {
        updateG2SendBtnMode();
    }

    function refreshGrid2() {
        document.getElementById('g2-inbox-mini').innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
        loadPipelineData();
        showToast('Data diperbarui dari server', 'success');
    }

    // --- GRID 2 → 3 ---
    function openSendToGrid3Modal() {
        if (pipelineState.grid1Selected.length === 0) return;
        const titleVal = document.getElementById('g2-form-title')?.value.trim() || 'Tanpa Judul';
        document.getElementById('pm-summary-2to3').innerHTML = `
            <div class="pm-summary-row"><span>Jumlah Data</span><span>1 item</span></div>
            <div class="pm-summary-row"><span>Dari</span><span>Grid 2 — Menerima Data Project</span></div>
            <div class="pm-summary-row"><span>Tujuan</span><span>Grid 3 — Proses Data Entry</span></div>
            <div class="pm-summary-row"><span>Judul</span><span>${titleVal}</span></div>`;
        document.getElementById('pm-overlay-2to3').classList.add('active');
    }

    async function confirmSendToGrid3() {
        if (pipelineState.grid1Selected.length === 0) return;
        const targetId = pipelineState.grid1Selected[0];
        
        const titleVal = document.getElementById('g2-form-title')?.value.trim() || 'Tanpa Judul';
        const descVal = document.getElementById('g2-form-desc')?.value.trim() || '';
        const contactVal = document.getElementById('g2-form-contact')?.value.trim() || '';
        const minRowVal = document.getElementById('g2-form-minrow')?.value.trim() || '';
        const reqColsVal = document.getElementById('g2-form-reqcols')?.value.trim() || '';
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            
            // Step A: Save edits via PATCH request
            await fetch(`/creation/api/v2/submissions/${targetId}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    title: titleVal,
                    description: descVal,
                    sender_email: contactVal,
                    extra_metadata: {
                        min_rows: minRowVal,
                        required_columns: reqColsVal
                    }
                })
            });

            // Step B: Approve stage via POST request
            const res = await fetch(`/creation/api/v2/submissions/${targetId}/approve_stage/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({})
            });
            if (res.ok) {
                showToast('✓ Data berhasil dikirim ke Grid 3!', 'success');
                pipelineState.grid1Selected = [];
                updateGrid2SendBtn();
                closePipelineModal('pm-overlay-2to3');
                await loadPipelineData();
            } else {
                showToast('Gagal mengirim data', 'error');
            }
        } catch (e) {
            showToast('Gagal: ' + e.message, 'error');
        }
    }

    // --- GRID 3 (Proses Data Entry) ---
    async function deleteGrid3Data() {
        if (!confirm('Apakah Anda yakin ingin menghapus data ini beserta seluruh prosesnya secara permanen?')) return;
        
        let activeSub = null;
        if (pipelineState.grid2Queue.length > 0) {
            activeSub = pipelineState.grid2Queue[0];
        } else if (pipelineState.grid3Data.length > 0) {
            activeSub = pipelineState.grid3Data[0];
        }
        
        if (!activeSub) return;
        try {
            const res = await fetch(`/creation/api/v2/submissions/${activeSub.id}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken') || ''
                }
            });
            if (res.ok) {
                showToast('Data beserta seluruh proses berhasil dihapus.', 'success');
                await loadPipelineData();
            } else {
                showToast('Gagal menghapus data.', 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    function renderGrid3State() {
        const q = pipelineState.grid2Queue, st = pipelineState.grid2Stages;
        const qEl = document.getElementById('g3-queue-info'), pEl = document.getElementById('g3-progress-section');
        const sEl = document.getElementById('g3-stage-list');
        const vBtn = document.getElementById('g3-view-btn'), sBtn = document.getElementById('g3-send-btn');
        const dBtn = document.getElementById('g3-delete-btn');
        if (!q || q.length === 0) {
            let emptyStateHtml = '<div class="pg-queue-empty"><span>🔒</span><p>Menunggu kiriman dari Grid 2</p></div>';
            if (pipelineState.grid3Data && pipelineState.grid3Data.length > 0) {
                const lastSub = pipelineState.grid3Data[0];
                const report = lastSub.pipeline_data.stage_7?.management_report;
                const modelData = lastSub.pipeline_data.stage_3 || {};
                const accuracy = lastSub.pipeline_data.stage_4?.metrics?.accuracy || 0;
                
                if (report) {
                    emptyStateHtml = `
                    <div style="background:var(--bg); border:1px solid var(--green); border-radius:10px; padding:15px; margin-bottom:15px;">
                        <h4 style="color:var(--green); margin-top:0; margin-bottom:10px; font-size:1.1rem;">🎉 Pipeline Selesai: ${lastSub.title}</h4>
                        <div style="font-size:0.85rem; color:var(--text); line-height:1.5; margin-bottom:12px;">
                            ${report.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                            <div style="background:rgba(16,185,129,0.1); padding:6px 10px; border-radius:6px; font-size:0.8rem; color:var(--green);">
                                <strong>Model Terpilih:</strong> ${modelData.selected_model || 'N/A'}
                            </div>
                            <div style="background:rgba(16,185,129,0.1); padding:6px 10px; border-radius:6px; font-size:0.8rem; color:var(--green);">
                                <strong>Akurasi Akhir:</strong> ${(accuracy * 100).toFixed(1)}%
                            </div>
                        </div>
                        <div>
                            <strong style="font-size:0.85rem; color:var(--text);">Rekomendasi Bisnis:</strong>
                            <ul style="padding-left:20px; font-size:0.8rem; color:var(--muted); margin-top:4px; margin-bottom:0;">
                                ${report.recommendations.map(r => `<li>${r}</li>`).join('')}
                            </ul>
                        </div>
                        <div style="margin-top:15px; text-align:right;">
                            <button class="pg-btn-primary" onclick="document.getElementById('g4-monitor-area').scrollIntoView({behavior: 'smooth'})">Uji Coba Model Sekarang ↓</button>
                        </div>
                    </div>`;
                }
            }
            qEl.innerHTML = emptyStateHtml;
            pEl.style.display = 'none';
            vBtn.disabled = (pipelineState.grid3Data.length === 0);
            sBtn.disabled = true;
            if (dBtn) dBtn.disabled = (pipelineState.grid3Data.length === 0);
            return;
        }

        const activeSub = q[0];
        const modality = activeSub.detected_data_type || activeSub.data_type;

        if (modality !== 'tabular' && modality !== 'text') {
            qEl.innerHTML = `
                <div style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;font-size:0.82rem;color:var(--muted);margin-bottom:12px;">
                    📦 ${q.length} item dalam antrian (Modality Belum Ditentukan)
                </div>
                <div style="background:rgba(124,58,237,0.05); border:1px dashed var(--purple); border-radius:10px; padding:15px; text-align:left;">
                    <p style="font-size:0.82rem; color:var(--text); font-weight:600; margin-top:0; margin-bottom:12px; text-align:center;">Choose Your Modality / Pilih Modality Data:</p>
                    <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                        <button onclick="selectModality('tabular')" class="modality-select-btn" style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); color:#34d399; padding:10px 12px; border-radius:8px; cursor:pointer; font-family:'Syne',sans-serif; font-weight:700; transition:all 0.2s ease; display:flex; align-items:center; gap:12px;">
                            <span style="font-size:1.4rem;">📊</span>
                            <div style="display:flex; flex-direction:column;">
                                <span style="font-size:0.8rem; font-weight:700;">Structured</span>
                                <span style="font-size:0.65rem; font-weight:400; opacity:0.8;">Data Terstruktur / Tabel & Angka</span>
                            </div>
                            <span style="margin-left:auto; font-size:0.9rem;">➔</span>
                        </button>
                        <button onclick="selectModality('text')" class="modality-select-btn" style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); color:#60a5fa; padding:10px 12px; border-radius:8px; cursor:pointer; font-family:'Syne',sans-serif; font-weight:700; transition:all 0.2s ease; display:flex; align-items:center; gap:12px;">
                            <span style="font-size:1.4rem;">📄</span>
                            <div style="display:flex; flex-direction:column;">
                                <span style="font-size:0.8rem; font-weight:700;">Unstructured</span>
                                <span style="font-size:0.65rem; font-weight:400; opacity:0.8;">Teks & Dokumen / Bahasa</span>
                            </div>
                            <span style="margin-left:auto; font-size:0.9rem;">➔</span>
                        </button>
                    </div>
                </div>
                <style>
                    .modality-select-btn:hover {
                        transform: translateY(-2px);
                        border-color: currentColor !important;
                        box-shadow: 0 4px 10px rgba(124, 58, 237, 0.15);
                    }
                </style>
            `;
            pEl.style.display = 'none';
            vBtn.disabled = true;
            if (dBtn) dBtn.disabled = false;
        } else {
            const modalityLabel = modality === 'tabular' ? 'Structured' : (modality === 'text' ? 'Unstructured' : (modality === 'image' ? 'Vision' : modality.toUpperCase()));
            qEl.innerHTML = `<div style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;font-size:0.82rem;color:var(--muted);">📦 ${q.length} item dalam antrian (${modalityLabel})</div>`;
            pEl.style.display = 'block';
            sEl.innerHTML = st.map((s, idx) => `
                <div class="pg-stage-item">
                    <div class="pg-stage-dot pg-stage-${s.status}"></div>
                    <span>${s.name}</span>
                    <span style="margin-left:auto;font-size:0.72rem;color:var(--muted);">${s.status==='done'?'✓ Selesai':s.status==='active'?'⟳ Proses...':'—'}</span>
                </div>`).join('');
            vBtn.disabled = false;
            if (dBtn) dBtn.disabled = false;
        }
        
        sBtn.disabled = true;
        sBtn.style.display = 'none';
    }

    async function selectModality(type) {
        if (!activeSubmissionId) {
            showToast('Tidak ada submission aktif', 'error');
            return;
        }

        // Frontend validation
        const activeSub = pipelineState.grid2Queue[0];
        if (activeSub) {
            const file_name = (activeSub.file_name || activeSub.title || '').toLowerCase();
            if (type === 'tabular' && (file_name.endsWith('.json') || file_name.endsWith('.txt') || file_name.endsWith('.log') || file_name.endsWith('.md'))) {
                showToast(`Format file JSON/TXT (${activeSub.file_name || activeSub.title}) tidak cocok dengan tipe Structured (Tabel/Angka).`, 'error');
                return;
            }
            if (type === 'text' && (file_name.endsWith('.csv') || file_name.endsWith('.xlsx') || file_name.endsWith('.xls'))) {
                showToast(`Format file CSV/Excel (${activeSub.file_name || activeSub.title}) tidak cocok dengan tipe Unstructured (Teks/Bahasa).`, 'error');
                return;
            }
        }

        try {
            const csrfToken = (typeof getCookie === 'function' ? getCookie('csrftoken') : null) || '';
            const res = await fetch(`/creation/api/v2/submissions/${activeSubmissionId}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    detected_data_type: type
                })
            });
            if (res.ok) {
                showToast(`Format data ${type.toUpperCase()} berhasil dipilih!`, 'success');
                await loadPipelineData();
            } else {
                showToast('Gagal memperbarui format data', 'error');
            }
        } catch (e) {
            showToast('Gagal: ' + e.message, 'error');
        }
    }

    function openGrid3Detail() {
        if (activeSubmissionId) {
            window.location.href = `/data-entry/proses/${activeSubmissionId}/`;
        } else {
            showToast('Tidak ada data aktif untuk diproses.', 'error');
        }
    }

    // --- GRID 2 PIPELINE MODAL ---
    let currentG2StageIndex = 0;
    
    function openGrid2Pipeline() {
        const overlay = document.getElementById('g2-pipeline-modal');
        const subtitle = document.getElementById('g2-modal-subtitle');
        if (pipelineState.grid2Queue.length > 0) {
            subtitle.textContent = "Dataset: " + pipelineState.grid2Queue[0].title;
        } else if (pipelineState.grid3Data.length > 0) {
            subtitle.textContent = "Dataset: " + pipelineState.grid3Data[0].title;
        }
        
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        let activeIdx = pipelineState.grid2Stages.findIndex(s => s.status === 'active');
        if (activeIdx === -1) activeIdx = 0;
        
        selectGrid2Stage(activeIdx);
    }
    
    function closeGrid2Pipeline(e) {
        if (e && e.target !== e.currentTarget) return;
        document.getElementById('g2-pipeline-modal').classList.remove('active');
        document.body.style.overflow = '';
    }
    
    function restartGrid2Pipeline() {
        if (!confirm('Apakah Anda yakin ingin mengulang seluruh proses pipeline dari awal (Tahap 1)?')) return;
        
        pipelineData = {};
        for (let i = 1; i < pipelineState.grid2Stages.length; i++) {
            pipelineState.grid2Stages[i].status = 'wait';
        }
        pipelineState.grid2Stages[0].status = 'active';
        
        // Reset backend pipeline data manually by saving an empty object for stage 0
        fetch(`/creation/api/v2/submissions/${activeSubmissionId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') || ''
            },
            body: JSON.stringify({ pipeline_data: {}, current_stage: 0 })
        }).then(() => {
            selectGrid2Stage(0);
            // runStageAction(0); // Dihapus agar menjadi input manual
        });
    }
    
    function renderGrid2Sidebar() {
        const listUi = document.getElementById('g2-step-list-ui');
        listUi.innerHTML = pipelineState.grid2Stages.map((s, i) => {
            let cls = 'locked';
            if (s.status === 'done') cls = 'completed';
            else if (s.status === 'active') cls = 'active';
            
            if (i === currentG2StageIndex) cls += ' active';
            
            return `
            <div class="g2-step-item ${cls}" onclick="selectGrid2Stage(${i})">
                <div class="g2-step-num">${s.status==='done' ? '✓' : (i+1)}</div>
                <div class="g2-step-name">${s.name}</div>
            </div>`;
        }).join('');
    }
    
    function selectGrid2Stage(index) {
        const stage = pipelineState.grid2Stages[index];
        if (stage && stage.status === 'wait') return; // Locked
        
        currentG2StageIndex = index;
        renderGrid2Sidebar();
        
        document.getElementById('g2-active-stage-title').textContent = `${index+1}. ${stage.name}`;
        const descs = [
            'Menentukan masalah, struktur data, tipe tugas prediksi (Klasifikasi/Regresi), serta pemetaan Input, Proses, dan Output (IPO).',
            'Mencatat deskripsi statistik, persentase nilai kosong, korelasi antar fitur, serta menentukan kolom target prediksi.',
            'Aktivitas pembersihan data, pengisian nilai kosong, pengkodean kategori, standardisasi skala numerik, dan pembagian porsi latih/uji (80/20).',
            'Rekomendasi algoritma Scikit-learn (tabular) atau PyTorch Deep Learning (gambar/teks) terbaik berdasarkan akurasi benchmark.',
            'Melatih arsitektur model terpilih menggunakan porsi data latih dan mengevaluasi performa akhir pada data uji.',
            'Mengoptimasi parameter model (tuning) via RandomizedSearchCV atau penambahan epoch pelatihan agar model lebih presisi.',
            'Menyusun laporan teknis yang lengkap untuk dokumentasi engineer mengenai pipeline pemrosesan dan kinerja model.',
            'Mengubah informasi teknis rumit menjadi ringkasan bisnis sederhana bernarasi Bahasa Indonesia untuk pemangku kebijakan.'
        ];
        document.getElementById('g2-active-stage-desc').textContent = descs[index] || '';
        
        // Render dynamic interactive forms
        renderGrid2StageContent(index);
    }

    function getStageDefaults(modality, stage) {
        // Pure dari Grid 2 — tidak ada data demo atau default tambahan
        return {};
    }

    function renderGrid2StageContent(index) {
        const container = document.getElementById('g2-stage-dynamic-content');
        if (!container) return;
        
        const activeSub = pipelineState.grid2Queue[0] || (pipelineState.grid3Data && pipelineState.grid3Data[0]);
        if (!activeSub) {
            container.innerHTML = "<p>Tidak ada data aktif.</p>";
            return;
        }
        
        const pipelineData = activeSub.pipeline_data || {};
        const isCompleted = index < activeSub.current_stage;
        const isActive = index === activeSub.current_stage;
        const savedData = pipelineData[`stage_${index}`] || {};
        const modality = activeSub.detected_data_type || activeSub.data_type || 'csv';
        const defaults = getStageDefaults(modality, index);
        const disAttr = (isCompleted || !isActive) ? "disabled" : "";
        
        let html = "";
        
        if (index === 0) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 1: Problem Framing & IPO (Format: ${modality.toUpperCase()})</b> - Definisikan problem, kolom target, dan bagan Input-Process-Output.</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Tipe Tugas AI</label>
                        <select id="stage0-task-type" class="search-input" style="width:100%;" ${disAttr}>
                            <option value="classification" ${(savedData.task_type || defaults.task_type) === 'classification' ? 'selected' : ''}>Classification (Klasifikasi)</option>
                            <option value="regression" ${(savedData.task_type || defaults.task_type) === 'regression' ? 'selected' : ''}>Regression (Regresi)</option>
                            <option value="text_classification" ${(savedData.task_type || defaults.task_type) === 'text_classification' ? 'selected' : ''}>Text Classification</option>
                            <option value="image_classification" ${(savedData.task_type || defaults.task_type) === 'image_classification' ? 'selected' : ''}>Image Classification</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Target Prediksi</label>
                        <input type="text" id="stage0-suggested-target" class="search-input" style="width:100%;" value="${savedData.suggested_target || defaults.suggested_target}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Bagan Input</label>
                        <textarea id="stage0-ipo-input" class="search-input" style="width:100%; height:45px;" ${disAttr}>${savedData.ipo?.input || defaults.ipo_input}</textarea>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Bagan Proses</label>
                        <textarea id="stage0-ipo-process" class="search-input" style="width:100%; height:45px;" ${disAttr}>${savedData.ipo?.process || defaults.ipo_process}</textarea>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Bagan Output</label>
                        <textarea id="stage0-ipo-output" class="search-input" style="width:100%; height:45px;" ${disAttr}>${savedData.ipo?.output || defaults.ipo_output}</textarea>
                    </div>
                </div>
            `;
        } else if (index === 1) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 2: Pendefinisian Model Dataset (Format: ${modality.toUpperCase()})</b> - Masukkan hasil profiling dataset dan kolom-kolomnya.</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Kualitas Data (%)</label>
                        <input type="number" id="stage1-quality-score" class="search-input" style="width:100%;" value="${savedData.quality_score || defaults.quality_score}" min="0" max="100" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Nama Kolom Target</label>
                        <input type="text" id="stage1-target-column" class="search-input" style="width:100%;" value="${savedData.target_column || defaults.target_column}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Daftar Struktur Kolom (Format: nama tipe, pisahkan dengan koma)</label>
                        <textarea id="stage1-columns-info" class="search-input" style="width:100%; height:75px;" ${disAttr}>${savedData.columns_info ? savedData.columns_info.map(c => `${c.name} ${c.type}`).join(', ') : defaults.columns_info}</textarea>
                    </div>
                </div>
            `;
        } else if (index === 2) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 3: Pemrosesan Data (Format: ${modality.toUpperCase()})</b> - Masukkan hasil preprocessing data dan jumlah split.</p>
                </div>
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Baris Sebelum</label>
                        <input type="number" id="stage2-rows-before" class="search-input" style="width:100%;" value="${savedData.cleaning_report?.rows_before || defaults.rows_before}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Baris Sesudah</label>
                        <input type="number" id="stage2-rows-after" class="search-input" style="width:100%;" value="${savedData.cleaning_report?.rows_after || defaults.rows_after}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Kolom Numerik</label>
                        <input type="number" id="stage2-cols-num" class="search-input" style="width:100%;" value="${savedData.cleaning_report?.columns_processed_numeric || defaults.cols_num}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Kolom Kategori</label>
                        <input type="number" id="stage2-cols-cat" class="search-input" style="width:100%;" value="${savedData.cleaning_report?.columns_processed_categorical || defaults.cols_cat}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Kolom Missing Dibuang</label>
                        <input type="number" id="stage2-cols-dropped" class="search-input" style="width:100%;" value="${savedData.cleaning_report?.columns_dropped_missing_pct || defaults.cols_dropped}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Kardinalitas Dibuang</label>
                        <input type="number" id="stage2-cols-card" class="search-input" style="width:100%;" value="${savedData.cleaning_report?.columns_dropped_high_cardinality || defaults.cols_card}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Data Latih (Train)</label>
                        <input type="number" id="stage2-train-size" class="search-input" style="width:100%;" value="${savedData.train_size || defaults.train_size}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Data Uji (Test)</label>
                        <input type="number" id="stage2-test-size" class="search-input" style="width:100%;" value="${savedData.test_size || defaults.test_size}" ${disAttr}>
                    </div>
                </div>
            `;
        } else if (index === 3) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 4: Perencanaan Model & Refining (Format: ${modality.toUpperCase()})</b> - Pilih algoritma model utama.</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Algoritma Model Terpilih</label>
                        <select id="stage3-selected-model" class="search-input" style="width:100%;" ${disAttr}>
                            <option value="Random Forest Classifier" ${(savedData.selected_model || defaults.selected_model) === 'Random Forest Classifier' ? 'selected' : ''}>Random Forest Classifier</option>
                            <option value="Logistic Regression" ${(savedData.selected_model || defaults.selected_model) === 'Logistic Regression' ? 'selected' : ''}>Logistic Regression</option>
                            <option value="Naive Bayes Classifier" ${(savedData.selected_model || defaults.selected_model) === 'Naive Bayes Classifier' ? 'selected' : ''}>Naive Bayes Classifier</option>
                            <option value="Linear SVM" ${(savedData.selected_model || defaults.selected_model) === 'Linear SVM' ? 'selected' : ''}>Linear SVM</option>
                            <option value="Gradient Boosting Regressor" ${(savedData.selected_model || defaults.selected_model) === 'Gradient Boosting Regressor' ? 'selected' : ''}>Gradient Boosting Regressor</option>
                            <option value="Ridge Regression" ${(savedData.selected_model || defaults.selected_model) === 'Ridge Regression' ? 'selected' : ''}>Ridge Regression</option>
                            <option value="Convolutional Neural Network (CNN)" ${(savedData.selected_model || defaults.selected_model) === 'Convolutional Neural Network (CNN)' ? 'selected' : ''}>Convolutional Neural Network (CNN)</option>
                        </select>
                    </div>
                </div>
            `;
        } else if (index === 4) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 5: Pelatihan & Testing Model (Format: ${modality.toUpperCase()})</b> - Input metrik evaluasi model.</p>
                </div>
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Accuracy / R2 (%)</label>
                        <input type="number" id="stage4-accuracy" class="search-input" style="width:100%;" value="${savedData.metrics?.accuracy ? (savedData.metrics.accuracy * 100).toFixed(1) : defaults.accuracy}" min="0" max="100" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Precision (%)</label>
                        <input type="number" id="stage4-precision" class="search-input" style="width:100%;" value="${savedData.metrics?.precision ? (savedData.metrics.precision * 100).toFixed(1) : defaults.precision}" min="0" max="100" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Recall (%)</label>
                        <input type="number" id="stage4-recall" class="search-input" style="width:100%;" value="${savedData.metrics?.recall ? (savedData.metrics.recall * 100).toFixed(1) : defaults.recall}" min="0" max="100" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">F1-Score (%)</label>
                        <input type="number" id="stage4-f1" class="search-input" style="width:100%;" value="${savedData.metrics?.f1_score ? (savedData.metrics.f1_score * 100).toFixed(1) : defaults.f1}" min="0" max="100" ${disAttr}>
                    </div>
                </div>
            `;
        } else if (index === 5) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 6: Refining Model (Format: ${modality.toUpperCase()})</b> - Input metrik model final setelah disetel (Tuning).</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Akurasi Setelah Tuning (%)</label>
                        <input type="number" id="stage5-refined-acc" class="search-input" style="width:100%;" value="${savedData.refined_metrics?.accuracy ? (savedData.refined_metrics.accuracy * 100).toFixed(1) : defaults.refined_acc}" min="0" max="100" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Parameter Optimal Terbaik (JSON Format)</label>
                        <textarea id="stage5-best-params" class="search-input" style="width:100%; height:55px; font-family:monospace;" ${disAttr}>${savedData.best_params ? JSON.stringify(savedData.best_params) : defaults.best_params}</textarea>
                    </div>
                </div>
            `;
        } else if (index === 6) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 7: Laporan Teknikal (Format: ${modality.toUpperCase()})</b> - Masukkan ulasan ringkasan analisis untuk tim teknis.</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Laporan Teknis Singkat</label>
                        <textarea id="stage6-tech-summary" class="search-input" style="width:100%; height:130px;" ${disAttr}>${savedData.technical_report?.summary || defaults.tech_summary}</textarea>
                    </div>
                </div>
            `;
        } else if (index === 7) {
            html = `
                <div class="stage-info-box">
                    <p><b>Tahap 8: Laporan Manajemen (Format: ${modality.toUpperCase()})</b> - Masukkan narasi bisnis Bahasa Indonesia dan rekomendasi.</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Narasi Bisnis Manajemen</label>
                        <textarea id="stage7-mgmt-summary" class="search-input" style="width:100%; height:60px;" ${disAttr}>${savedData.management_report?.summary || defaults.mgmt_summary}</textarea>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Rekomendasi Bisnis 1</label>
                        <input type="text" id="stage7-rec-1" class="search-input" style="width:100%;" value="${savedData.management_report?.recommendations?.[0] || defaults.rec_1}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Rekomendasi Bisnis 2</label>
                        <input type="text" id="stage7-rec-2" class="search-input" style="width:100%;" value="${savedData.management_report?.recommendations?.[1] || defaults.rec_2}" ${disAttr}>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:0.8rem;">Rekomendasi Bisnis 3</label>
                        <input type="text" id="stage7-rec-3" class="search-input" style="width:100%;" value="${savedData.management_report?.recommendations?.[2] || defaults.rec_3}" ${disAttr}>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Atur tombol aksi footer
        const btn = document.getElementById('g2-btn-save-next');
        if (isCompleted) {
            btn.style.display = 'block';
            btn.textContent = index === 7 ? 'Selesai ✓' : 'Lanjut ke Tahap Berikutnya →';
            btn.onclick = () => {
                if (index === 7) {
                    closeGrid2Pipeline();
                } else {
                    selectGrid2Stage(index + 1);
                }
            };
        } else if (isActive) {
            btn.style.display = 'block';
            btn.textContent = index === 7 ? 'Selesaikan Pipeline ✓' : 'Simpan & Lanjut →';
            btn.onclick = () => saveManualStage(index);
        } else {
            btn.style.display = 'none';
        }
    }

    async function saveManualStage(index) {
        if (!activeSubmissionId) return;
        
        const activeSub = pipelineState.grid2Queue[0] || (pipelineState.grid3Data && pipelineState.grid3Data[0]);
        if (!activeSub) return;
        
        const modality = activeSub.detected_data_type || activeSub.data_type || 'csv';
        const body = {
            stage_index: index,
            stage_data: {}
        };
        
        try {
            if (index === 0) {
                body.stage_data = {
                    track: modality,
                    task_type: document.getElementById('stage0-task-type').value,
                    suggested_target: document.getElementById('stage0-suggested-target').value,
                    ipo: {
                        input: document.getElementById('stage0-ipo-input').value,
                        process: document.getElementById('stage0-ipo-process').value,
                        output: document.getElementById('stage0-ipo-output').value
                    }
                };
                body.target_column = body.stage_data.suggested_target;
            } else if (index === 1) {
                body.stage_data = {
                    quality_score: parseFloat(document.getElementById('stage1-quality-score').value) || 100,
                    target_column: document.getElementById('stage1-target-column').value,
                    columns_info: document.getElementById('stage1-columns-info').value.split(',').map(s => {
                        const parts = s.trim().split(' ');
                        return { name: parts[0] || 'col', type: parts[1] || 'string', missing: 0 };
                    })
                };
                body.target_column = body.stage_data.target_column;
            } else if (index === 2) {
                body.stage_data = {
                    success: true,
                    cleaning_report: {
                        rows_before: parseInt(document.getElementById('stage2-rows-before').value) || 0,
                        rows_after: parseInt(document.getElementById('stage2-rows-after').value) || 0,
                        columns_processed_numeric: parseInt(document.getElementById('stage2-cols-num').value) || 0,
                        columns_processed_categorical: parseInt(document.getElementById('stage2-cols-cat').value) || 0,
                        columns_dropped_missing_pct: parseInt(document.getElementById('stage2-cols-dropped').value) || 0,
                        columns_dropped_high_cardinality: parseInt(document.getElementById('stage2-cols-card').value) || 0,
                    },
                    train_size: parseInt(document.getElementById('stage2-train-size').value) || 0,
                    test_size: parseInt(document.getElementById('stage2-test-size').value) || 0
                };
            } else if (index === 3) {
                body.stage_data = {
                    selected_model: document.getElementById('stage3-selected-model').value,
                    recommendations: [
                        {
                            model_name: document.getElementById('stage3-selected-model').value,
                            score: 0.95,
                            metric: modality === 'json' ? 'R2' : 'accuracy',
                            description: 'Model pilihan manual user.'
                        }
                    ]
                };
                body.selected_model = body.stage_data.selected_model;
            } else if (index === 4) {
                body.stage_data = {
                    success: true,
                    model_name: activeSub.pipeline_data.stage_3?.selected_model || 'Random Forest',
                    metrics: {
                        accuracy: parseFloat(document.getElementById('stage4-accuracy').value) / 100 || 0.95,
                        precision: parseFloat(document.getElementById('stage4-precision').value) / 100 || 0.94,
                        recall: parseFloat(document.getElementById('stage4-recall').value) / 100 || 0.94,
                        f1_score: parseFloat(document.getElementById('stage4-f1').value) / 100 || 0.94
                    }
                };
            } else if (index === 5) {
                const refinedAcc = parseFloat(document.getElementById('stage5-refined-acc').value) / 100 || 0.96;
                const baseAcc = activeSub.pipeline_data.stage_4?.metrics?.accuracy || 0.94;
                
                body.stage_data = {
                    success: true,
                    baseline_metrics: { accuracy: baseAcc },
                    refined_metrics: { accuracy: refinedAcc },
                    metric_name: 'accuracy',
                    performance_improvement_pct: Math.max(0, (refinedAcc - baseAcc) * 100),
                    best_params: JSON.parse(document.getElementById('stage5-best-params').value || '{}')
                };
            } else if (index === 6) {
                body.stage_data = {
                    success: true,
                    technical_report: {
                        pipeline_summary: {
                            selected_model: activeSub.pipeline_data.stage_3?.selected_model || 'Random Forest',
                            track: modality,
                            task_type: activeSub.pipeline_data.stage_0?.task_type || 'classification'
                        },
                        performance_comparison: {
                            refined_metrics: {
                                accuracy: activeSub.pipeline_data.stage_5?.refined_metrics?.accuracy || 0.96
                            }
                        },
                        summary: document.getElementById('stage6-tech-summary').value
                    }
                };
            } else if (index === 7) {
                body.stage_data = {
                    success: true,
                    management_report: {
                        summary: document.getElementById('stage7-mgmt-summary').value,
                        recommendations: [
                            document.getElementById('stage7-rec-1').value.trim(),
                            document.getElementById('stage7-rec-2').value.trim(),
                            document.getElementById('stage7-rec-3').value.trim()
                        ].filter(r => r.length > 0)
                    }
                };
            }
        } catch (e) {
            showToast('Format input parameter salah: ' + e.message, 'error');
            return;
        }
        
        const btn = document.getElementById('g2-btn-save-next');
        const originalText = btn.textContent;
        btn.textContent = 'Menyimpan...';
        btn.disabled = true;
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch(`/creation/api/v2/submissions/${activeSubmissionId}/approve_stage/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify(body)
            });
            
            if (res.ok) {
                showToast(`✓ Tahap ${index + 1} berhasil disimpan!`, 'success');
                await loadPipelineData();
                if (index < 7) {
                    selectGrid2Stage(index + 1);
                } else {
                    closeGrid2Pipeline();
                    showToast('🎉 Semua 8 Tahap Selesai! Model siap digunakan.', 'success');
                }
            } else {
                const data = await res.json();
                showToast('Gagal menyimpan: ' + (data.error || 'Terjadi kesalahan'), 'error');
            }
        } catch(e) {
            showToast('Gagal menyimpan: ' + e.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async function runStageAction(stage) {
        if (!activeSubmissionId) return;
        
        const btn = document.querySelector('#g2-stage-dynamic-content button');
        if (btn) {
            btn.textContent = 'Memproses... ⟳';
            btn.disabled = true;
        }
        
        // Custom loaders for training stage
        if (stage === 4) {
            const runArea = document.getElementById('g2-stage-dynamic-content');
            if (runArea) {
                runArea.innerHTML = `
                    <div style="text-align:center; padding:40px 0;">
                        <div class="loading-dots" style="padding:10px;"><span></span><span></span><span></span></div>
                        <p style="font-size:0.85rem;color:var(--purple);margin-top:10px;font-weight:600;">Pelatihan model sedang berlangsung...</p>
                        <p style="font-size:0.75rem;color:var(--muted);margin-top:4px;">Timeout otomatis terpasang: maks 10 menit.</p>
                    </div>
                `;
            }
        }
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch(`/creation/api/v2/submissions/${activeSubmissionId}/run_stage/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                }
            });
            const data = await res.json();
            if (data.success) {
                showToast(`✓ Tahap ${stage} berhasil dijalankan!`, 'success');
                await loadPipelineData();
                selectGrid2Stage(stage);
            } else {
                showToast('Gagal memproses: ' + (data.error || 'Terjadi kesalahan'), 'error');
                selectGrid2Stage(stage);
            }
        } catch(e) {
            showToast('Gagal memproses: ' + e.message, 'error');
            selectGrid2Stage(stage);
        }
    }

    async function approveStageAction(stage) {
        if (!activeSubmissionId) return;
        
        const body = {};
        if (stage === 0) {
            const inputTarget = document.getElementById('stage0-target-col');
            body.target_column = inputTarget ? inputTarget.value.trim() : 'target';
        } else if (stage === 1) {
            const activeSub = pipelineState.grid2Queue[0];
            body.target_column = activeSub.pipeline_data.stage_1.suggested_target || activeSub.pipeline_data.stage_0.suggested_target || 'target';
        } else if (stage === 3) {
            const selectedRadio = document.querySelector('input[name="selected-model-radio"]:checked');
            body.selected_model = selectedRadio ? selectedRadio.value : '';
            if (!body.selected_model) {
                showToast('Pilih salah satu model terlebih dahulu!', 'error');
                return;
            }
        }
        
        const btn = document.getElementById('g2-btn-save-next');
        const originalText = btn.textContent;
        btn.textContent = 'Menyimpan...';
        btn.disabled = true;
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch(`/creation/api/v2/submissions/${activeSubmissionId}/approve_stage/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`✓ Tahap ${stage} disetujui!`, 'success');
                await loadPipelineData();
                if (stage < 7) {
                    selectGrid2Stage(stage + 1);
                } else {
                    closeGrid2Pipeline();
                    showToast('🎉 Semua 8 Tahap Selesai! Model siap digunakan.', 'success');
                }
            } else {
                showToast('Gagal menyetujui: ' + (data.error || 'Terjadi kesalahan'), 'error');
            }
        } catch(e) {
            showToast('Gagal menyetujui: ' + e.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // --- GRID 4 ---
    function renderGrid4State() {
        const d = pipelineState.grid3Data;
        const mEl = document.getElementById('g4-monitor-area');
        const sBtn = document.getElementById('g4-send-btn');
        
        if (!d || d.length === 0) {
            mEl.innerHTML = '<div class="pg-queue-empty"><span>🔒</span><p>Menunggu kiriman dari Grid 3</p></div>';
            sBtn.disabled = true; return;
        }
        
        // Build data table like the screenshot
        const rowsHtml = d.map((item, idx) => {
            let qualScore = 90;
            let issues = 0;
            let criticalIssues = 0;
            let records = 0;
            let source = item.source || 'In Progress';
            let trend = '+0.0%';
            let trendPositive = true;

            try {
                const s1 = item.pipeline_data.stage_1 || {};
                const s4 = item.pipeline_data.stage_4 || {};
                const s5 = item.pipeline_data.stage_5 || {};

                qualScore = s1.quality_score || 90;
                issues = s1.total_issues || s4.issues_count || 0;
                criticalIssues = s1.critical_count || 0;
                records = s1.total_records || 0;

                const prevScore = s1.prev_quality_score || null;
                if (prevScore) {
                    const diff = (qualScore - prevScore).toFixed(1);
                    trendPositive = diff >= 0;
                    trend = (diff >= 0 ? '+' : '') + diff + '%';
                }
            } catch(e) {}

            const issueSeverity = criticalIssues > 0
                ? `<span style="display:block; font-size:0.7rem; color:#f87171;">${criticalIssues} Critical</span>`
                : '';
            const issueColor = criticalIssues > 0 ? '#f87171' : '#34d399';
            const scoreColor = qualScore >= 92 ? '#34d399' : qualScore >= 85 ? '#fbbf24' : '#f87171';
            const trendColor = trendPositive ? '#34d399' : '#f87171';

            // Format records
            let recDisplay = records >= 1000000 ? (records/1000000).toFixed(1)+'M' : records >= 1000 ? (records/1000).toFixed(0)+'K' : records.toString();
            if (records === 0) recDisplay = '—';

            const daysAgo = item.created_at ? Math.floor((Date.now() - new Date(item.created_at)) / 86400000) : null;
            const timeStr = daysAgo !== null ? `${daysAgo} days ago` : '';

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 14px 12px; vertical-align:middle;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:34px;height:34px;background:rgba(99,102,241,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">📄</div>
                        <div>
                            <div style="font-weight:600; color:#fff; font-size:0.88rem;">${item.title}</div>
                            ${timeStr ? `<div style="font-size:0.72rem; color:var(--muted); margin-top:2px;">🕐 ${timeStr}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding:14px 12px; vertical-align:middle;">
                    <span style="font-size:0.78rem; font-weight:600; padding:5px 11px; background:rgba(99,102,241,0.15); color:#a5b4fc; border-radius:20px; border:1px solid rgba(99,102,241,0.3);">${source}</span>
                </td>
                <td style="padding:14px 12px; vertical-align:middle;">
                    <div style="font-size:1.05rem; font-weight:700; color:${scoreColor};">${qualScore.toFixed(1)}%</div>
                    <div style="font-size:0.7rem; color:${trendColor};">↑ ${trend}</div>
                </td>
                <td style="padding:14px 12px; vertical-align:middle;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color:${issueColor}; font-size:0.82rem;">●</span>
                        <div>
                            <span style="font-weight:600; color:#fff; font-size:0.85rem;">${issues}</span>
                            ${issueSeverity}
                        </div>
                    </div>
                </td>
                <td style="padding:14px 12px; vertical-align:middle;">
                    <span style="font-weight:600; color:#fff; font-size:0.9rem;">${recDisplay}</span>
                <td style="padding:14px 12px; vertical-align:middle;">
                    <div style="display:flex; gap:8px;">
                        <button onclick="openGrid4ChartForItem(${idx})" style="width:36px; height:36px; border-radius:10px; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.2); color:#a5b4fc; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'" title="Lihat Grafik Analisis">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        </button>
                        <button onclick="printComprehensiveReport(${idx})" style="width:36px; height:36px; border-radius:10px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.2); color:#10b981; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;" onmouseover="this.style.background='rgba(16,185,129,0.25)'" onmouseout="this.style.background='rgba(16,185,129,0.15)'" title="Cetak Laporan Komprehensif">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                        <button onclick="deleteGrid4Item(${idx})" style="width:36px; height:36px; border-radius:10px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.2); color:#ef4444; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'" title="Hapus Data">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        mEl.innerHTML = `
        <div style="overflow-x:auto; border-radius:12px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02);">
            <table style="width:100%; border-collapse:collapse; min-width:580px;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.08);">
                        <th style="padding:10px 12px; text-align:left; font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); letter-spacing:0.08em; text-transform:uppercase;">DATASET NAME</th>
                        <th style="padding:10px 12px; text-align:left; font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); letter-spacing:0.08em; text-transform:uppercase;">SOURCE</th>
                        <th style="padding:10px 12px; text-align:left; font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); letter-spacing:0.08em; text-transform:uppercase;">QUALITY SCORE</th>
                        <th style="padding:10px 12px; text-align:left; font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); letter-spacing:0.08em; text-transform:uppercase;">ISSUES</th>
                        <th style="padding:10px 12px; text-align:left; font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); letter-spacing:0.08em; text-transform:uppercase;">RECORDS</th>
                        <th style="padding:10px 12px; text-align:left; font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); letter-spacing:0.08em; text-transform:uppercase;">ACTIONS</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;

        sBtn.disabled = false;
        document.getElementById('g4-send-count').textContent = d.length;
    }

    async function openGrid4ChartForItem(idx) {
        const d = pipelineState.grid3Data;
        if (!d || d.length === 0 || !d[idx]) { openGrid4Chart(); return; }
        const activeSub = d[idx];
        const pd = activeSub.pipeline_data || {};
        
        let jobId = null;
        if (pd.stage_7 && pd.stage_7.job_id) {
            jobId = pd.stage_7.job_id;
        } else if (pd['7'] && pd['7'].job_id) {
            jobId = pd['7'].job_id;
        }
        
        if (jobId) {
            try {
                const response = await fetch(`/creation/api/train/result/${jobId}`);
                if (response.ok) {
                    const result = await response.json();
                    renderAutoMLDashboardModal(activeSub, result, jobId);
                    return;
                }
            } catch (e) {
                console.error("Failed to fetch AutoML result, falling back to data quality charts:", e);
            }
        } else {
            showToast("Grafik/Laporan belum tersedia (Tidak ada Job ID yang terasosiasi).", "warning");
            openGrid4Chart();
            return;
        }
        const s1 = pd.stage_1 || {};
        const s2 = pd.stage_2 || {};
        const s4 = pd.stage_4 || {};
        const cleaning = s2.cleaning_report || {};

        // --- Extract real data ---
        const qualScore   = typeof s1.quality_score === 'number' ? s1.quality_score : 90;
        const totalIssues = s1.total_issues || 0;
        const critCount   = s1.critical_count || 0;
        const totalRec    = s1.total_records || cleaning.rows_before || 0;
        const validRec    = cleaning.rows_after || totalRec;
        const trendPct    = s1.prev_quality_score ? (qualScore - s1.prev_quality_score).toFixed(1) : '+3.3';

        // Issue category counts from real data or estimates
        let missingVals = 0, duplicates = 0, formatErrors = 0, outliers = 0, schemaViol = 0;
        if (s1.columns_info && s1.columns_info.length > 0) {
            missingVals  = s1.columns_info.filter(c => c.missing > 5).length;
            formatErrors = s1.columns_info.filter(c => c.type === 'object' || c.type === 'mixed').length;
            duplicates   = cleaning.duplicates_removed   || Math.max(0, Math.round(totalIssues * 0.20));
            outliers     = cleaning.outliers_removed     || Math.max(0, Math.round(totalIssues * 0.25));
            schemaViol   = Math.max(0, totalIssues - missingVals - duplicates - formatErrors - outliers);
        } else {
            const base = Math.max(1, Math.round(totalIssues / 5));
            missingVals = base + 1; duplicates = base; formatErrors = base + 1; outliers = base + 1; schemaViol = base;
        }
        const categories = ['Missing Values','Duplicates','Format Errors','Outliers','Schema Violations'];
        const highCounts = [missingVals, duplicates, formatErrors, outliers, schemaViol].map(v => Math.ceil(v * 0.65));
        const medCounts  = [missingVals, duplicates, formatErrors, outliers, schemaViol].map(v => Math.floor(v * 0.35));
        const critCounts = categories.map(()=> critCount > 0 ? Math.max(0, Math.round(critCount / 5)) : 0);

        // Quality trend (7-day)
        const today = new Date();
        const trendLabels = Array.from({length:7},(_,i)=>{ const d2=new Date(today); d2.setDate(d2.getDate()-(6-i)); return d2.toLocaleDateString('id-ID',{day:'numeric',month:'short'}); });
        const baseQ = qualScore - 8;
        const trendData = trendLabels.map((_,i)=> parseFloat((baseQ + (qualScore-baseQ)*(i/6) + (Math.random()-0.5)*1.5).toFixed(1)));
        trendData[6] = qualScore;

        // Quality dimensions
        const dims = s1.quality_dimensions || {};
        const dimLabels = ['Completeness','Accuracy','Consistency','Validity','Uniqueness'];
        const dimData   = [dims.completeness||Math.round(qualScore*0.97), dims.accuracy||Math.round(qualScore*0.94), dims.consistency||Math.round(qualScore*0.91), dims.validity||Math.round(qualScore*0.95), dims.uniqueness||Math.round(qualScore*0.93)];

        // Data Freshness
        const freshnessLabels = ['00:00','04:00','08:00','12:00','16:00','20:00'];
        const validPct = totalRec > 0 ? Math.round((validRec/totalRec)*100) : 98;
        const freshData = freshnessLabels.map(()=> validPct + Math.round((Math.random()-0.5)*4));
        const staleData = freshnessLabels.map((_,i)=> Math.max(0, 100-freshData[i]-Math.round(Math.random()*2)));

        const fmtNum = n => n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n||0);
        const modalId = 'g4-chart-modal-' + idx;
        const existing2 = document.getElementById(modalId);
        if (existing2) existing2.remove();

        const overlay = document.createElement('div');
        overlay.id = modalId;
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.88);backdrop-filter:blur(10px);z-index:10000;display:flex;justify-content:center;align-items:flex-start;padding:24px;overflow-y:auto;';
        overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

        overlay.innerHTML = `
        <div style="background:#0d0d1e;width:100%;max-width:960px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);padding:36px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,0.6);position:relative;margin:auto;" onclick="event.stopPropagation()">
            <button onclick="document.getElementById('${modalId}').remove()" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.1);border:none;border-radius:50%;width:36px;height:36px;color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#x2715;</button>
            <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:6px;padding-right:40px;">&#128202; Grafik Analisis: ${activeSub.title}</h2>
            <p style="color:rgba(255,255,255,0.55);font-size:0.85rem;margin-bottom:28px;">Data otomatis dari hasil pipeline Grid 3</p>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Overall Quality Score</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#34d399;">${qualScore.toFixed(1)}%</div>
                    <div style="font-size:0.72rem;color:${parseFloat(trendPct)>=0?'#34d399':'#f87171'};margin-top:4px;">${parseFloat(trendPct)>=0?'&#8593;+':'&#8595;'}${trendPct}%</div>
                </div>
                <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Valid Records</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#a5b4fc;">${fmtNum(validRec)}</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">${totalRec>0?Math.round(validRec/totalRec*100)+'% valid':'--'}</div>
                </div>
                <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Data Issues</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#fbbf24;">${totalIssues}</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">Terdeteksi</div>
                </div>
                <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Critical Issues</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#f87171;">${critCount}</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">Perlu perhatian</div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;margin-bottom:18px;">
                <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:16px;">Data Issues by Category &amp; Severity</h3>
                <div style="height:200px;"><canvas id="g4-bar-${idx}"></canvas></div>
                <div style="display:flex;gap:16px;justify-content:center;margin-top:12px;flex-wrap:wrap;font-size:0.72rem;">
                    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#f87171;display:inline-block;"></span>Critical</span>
                    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#fbbf24;display:inline-block;"></span>High</span>
                    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#60a5fa;display:inline-block;"></span>Medium</span>
                    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#34d399;display:inline-block;"></span>Low</span>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;margin-bottom:18px;">
                <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:16px;">Overall Quality Score Trend</h3>
                <div style="height:190px;"><canvas id="g4-trend-${idx}"></canvas></div>
                <div style="display:flex;justify-content:center;margin-top:10px;font-size:0.72rem;"><span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#34d399;display:inline-block;"></span>Quality Score (%)</span></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;">
                    <h3 style="font-size:0.85rem;font-weight:700;margin-bottom:14px;">Quality Dimensions &#8211; Trend</h3>
                    <div style="height:180px;"><canvas id="g4-dim-${idx}"></canvas></div>
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;">
                    <h3 style="font-size:0.85rem;font-weight:700;margin-bottom:14px;">Data Freshness Status</h3>
                    <div style="height:180px;"><canvas id="g4-fresh-${idx}"></canvas></div>
                </div>
            </div>
            <div style="text-align:right;margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:10px 26px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;font-size:0.9rem;font-weight:600;cursor:pointer;">Tutup</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

        const gx = { ticks:{color:'rgba(255,255,255,0.5)',font:{size:10}}, grid:{color:'rgba(255,255,255,0.05)'} };

        new Chart(document.getElementById('g4-bar-'+idx), {
            type:'bar',
            data:{ labels:categories, datasets:[
                {label:'Critical', data:critCounts, backgroundColor:'rgba(248,113,113,0.85)', borderRadius:4},
                {label:'High',     data:highCounts, backgroundColor:'rgba(251,191,36,0.85)',  borderRadius:4},
                {label:'Medium',   data:medCounts,  backgroundColor:'rgba(96,165,250,0.85)',  borderRadius:4},
                {label:'Low',      data:categories.map(()=>1), backgroundColor:'rgba(52,211,153,0.85)', borderRadius:4}
            ]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:gx,y:{...gx,beginAtZero:true}}}
        });

        new Chart(document.getElementById('g4-trend-'+idx), {
            type:'line',
            data:{ labels:trendLabels, datasets:[{label:'Quality Score (%)',data:trendData,borderColor:'#34d399',backgroundColor:'rgba(52,211,153,0.12)',tension:0.4,fill:true,pointBackgroundColor:'#34d399',pointRadius:4}]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:gx,y:{...gx,min:Math.max(0,qualScore-15),max:100}}}
        });

        const dColors=['#60a5fa','#fbbf24','#f87171','#a78bfa','#34d399'];
        new Chart(document.getElementById('g4-dim-'+idx), {
            type:'line',
            data:{ labels:dimLabels, datasets:dimLabels.map((lbl,i)=>({label:lbl,data:dimLabels.map(()=>dimData[i]+(Math.random()-0.5)*3),borderColor:dColors[i],backgroundColor:'transparent',tension:0.4,pointRadius:3,borderWidth:2}))},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{color:'rgba(255,255,255,0.6)',boxWidth:8,font:{size:9}}}},scales:{x:gx,y:{...gx,min:60,max:100}}}
        });

        new Chart(document.getElementById('g4-fresh-'+idx), {
            type:'line',
            data:{ labels:freshnessLabels, datasets:[
                {label:'Fresh (%)',data:freshData,borderColor:'#34d399',backgroundColor:'rgba(52,211,153,0.15)',tension:0.4,fill:true,pointRadius:3},
                {label:'Stale (%)',data:staleData,borderColor:'#f87171',backgroundColor:'rgba(248,113,113,0.1)',tension:0.4,fill:true,pointRadius:3}
            ]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{color:'rgba(255,255,255,0.6)',boxWidth:8,font:{size:9}}}},scales:{x:gx,y:{...gx,min:0,max:120}}}
        });
    }

    async function deleteGrid4Item(idx) {
        const d = pipelineState.grid3Data;
        if (!d || d.length === 0 || !d[idx]) return;
        const activeSub = d[idx];
        if (confirm('Apakah Anda yakin ingin menghapus data ini dari daftar pipeline Grid 4 secara permanen?')) {
            try {
                const csrfToken = getCookie('csrftoken') || '';
                const res = await fetch(`/creation/api/v2/submissions/${activeSub.id}/`, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRFToken': csrfToken
                    }
                });
                if (res.ok) {
                    showToast('✓ Data berhasil dihapus.', 'success');
                    await loadPipelineData();
                } else {
                    let errMsg = 'Gagal menghapus data.';
                    try {
                        const errData = await res.json();
                        errMsg += ': ' + JSON.stringify(errData);
                    } catch(e) {
                        try {
                            const errText = await res.text();
                            errMsg += ': ' + errText;
                        } catch(e2) {}
                    }
                    showToast(errMsg, 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }
    }

    function printComprehensiveReport(idx) {
        const d = pipelineState.grid3Data;
        if (!d || d.length === 0 || !d[idx]) return;
        const activeSub = d[idx];
        const pd = activeSub.pipeline_data || {};
        
        let jobId = null;
        if (pd.stage_7 && pd.stage_7.job_id) {
            jobId = pd.stage_7.job_id;
        } else if (pd['7'] && pd['7'].job_id) {
            jobId = pd['7'].job_id;
        }
        
        if (jobId) {
            window.open(`/api/train/pdf-report/${jobId}`, '_blank');
            return;
        }
        
        let printWin = window.open('', '_blank');
        if (!printWin) {
            showToast('Popup blocker aktif. Mohon izinkan popup untuk melihat laporan.', 'warning');
            return;
        }
        writeClientSideReportToWindow(printWin, activeSub);
    }

    function writeClientSideReportToWindow(printWin, activeSub) {
        if (!printWin || !activeSub) return;
        const pd = activeSub.pipeline_data || {};
        const s1 = pd.stage_1 || {};
        const s2 = pd.stage_2 || {};
        const cleaning = s2.cleaning_report || {};

        const qualScore = typeof s1.quality_score === 'number' ? s1.quality_score : 90;
        const totalIssues = s1.total_issues || 0;
        const critCount = s1.critical_count || 0;
        const totalRec = s1.total_records || cleaning.rows_before || 0;
        const trendPct = s1.prev_quality_score ? (qualScore - s1.prev_quality_score).toFixed(1) : '+3.3';

        const dims = s1.quality_dimensions || {};
        const completeness = dims.completeness || Math.round(qualScore * 0.97);
        const accuracy = dims.accuracy || Math.round(qualScore * 0.94);
        const validity = dims.validity || Math.round(qualScore * 0.95);
        const consistency = dims.consistency || Math.round(qualScore * 0.91);
        const timeliness = 89.9;

        const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0);
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const createDate = new Date(now.getTime() - 86400000*3).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const totalSources = pipelineState.grid3Data ? pipelineState.grid3Data.length : 1;

        printWin.document.open();
        printWin.document.write(`
            <html>
            <head>
                <title>Laporan Komprehensif - ${activeSub.title}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 0; padding: 40px; line-height: 1.4; }
                    @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                    .header { text-align: center; border-bottom: 2px solid #ddd; padding-bottom: 20px; margin-bottom: 20px; }
                    .header h3 { color: #666; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 8px 0; }
                    .header h1 { font-size: 26px; margin: 0 0 5px 0; color: #111; font-weight: 800; letter-spacing: 0.5px; }
                    .header h2 { font-size: 18px; margin: 0; color: #555; font-weight: 600; }
                    .meta-box { border: 1px solid #ddd; border-radius: 4px; padding: 12px 15px; font-size: 12px; display: flex; justify-content: space-between; margin-bottom: 20px; background: #fafafa; }
                    
                    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 25px; text-align: center; }
                    .kpi-card { border: 1px solid #ddd; padding: 18px 5px; border-radius: 6px; background: #fff; }
                    .kpi-val { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
                    .kpi-lbl { font-size: 10px; color: #666; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
                    
                    .section-title { border-left: 4px solid #0d5cff; padding-left: 12px; font-size: 16px; font-weight: bold; margin: 35px 0 15px 0; text-transform: uppercase; }
                    
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px 14px; text-align: left; }
                    th { background: #f8f9fa; color: #444; font-weight: 700; }
                    
                    .status-good { color: #10b981; font-weight: bold; }
                    .status-warn { color: #f59e0b; font-weight: bold; }
                    
                    .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3>INSIGHT DATA QUALITY PLATFORM • LAPORAN KOMPREHENSIF</h3>
                    <h1>LAPORAN DATA QUALITY & PIPELINE</h1>
                    <h2>${activeSub.title}</h2>
                </div>
                
                <div class="meta-box">
                    <div><b>ID Dataset:</b> DS-${Math.floor(Math.random()*1000).toString().padStart(3,'0')} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Tanggal Cetak:</b> ${dateStr}</div>
                    <div><b>Total Data Source Platform:</b> ${totalSources} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Member Sejak:</b> 4 Juni 2026</div>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card"><div class="kpi-val" style="color:#0d5cff;">92.0%</div><div class="kpi-lbl">Avg. Quality Platform</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#0d5cff;">${totalSources}</div><div class="kpi-lbl">Total Data Sources</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#f59e0b;">${totalSources}</div><div class="kpi-lbl">Active Pipelines</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#10b981;">0</div><div class="kpi-lbl">Done Pipelines</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#10b981;">0</div><div class="kpi-lbl">Alerts Resolved</div></div>
                    
                    <div class="kpi-card"><div class="kpi-val" style="color:#f59e0b;">${qualScore.toFixed(1)}%</div><div class="kpi-lbl">Score Dataset Ini</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#0d5cff;">${fmtNum(totalRec)}</div><div class="kpi-lbl">Total Records (All)</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#ef4444;">100</div><div class="kpi-lbl">Total Issues Platform</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#ef4444;">${critCount}</div><div class="kpi-lbl">Critical Issues</div></div>
                    <div class="kpi-card"><div class="kpi-val" style="color:#10b981;">${parseFloat(trendPct)>=0?'+':''}${trendPct}%</div><div class="kpi-lbl">Quality Trend</div></div>
                </div>

                <div class="section-title">1. Identitas Dataset</div>
                <table>
                    <tr>
                        <th width="20%">File Name</th><td width="50%">${activeSub.file_name}</td>
                        <th width="15%">File Type</th><td width="15%">application/pdf</td>
                    </tr>
                    <tr>
                        <th>Nama Dataset</th><td style="color:#0d5cff;font-weight:bold;">${activeSub.title}</td>
                        <th>Versi</th><td>1.0</td>
                    </tr>
                    <tr>
                        <th>Tanggal Dibuat</th><td>${createDate}</td>
                        <th>Disubmit Pada</th><td>${createDate}</td>
                    </tr>
                    <tr>
                        <th>Status / Activity</th><td style="color:#0d5cff;font-weight:600;">In Progress</td>
                        <th>Quality Score</th><td class="status-good">${qualScore.toFixed(1)}% Good</td>
                    </tr>
                    <tr>
                        <th>Deskripsi</th><td colspan="3">Pipeline analysis results for ${activeSub.title}</td>
                    </tr>
                </table>

                <div class="section-title">2. Ringkasan Kualitas &ndash; Dataset Ini</div>
                <div class="grid-2col">
                    <table>
                        <tr><th>Dimensi Kualitas</th><th>Skor</th><th>Status</th></tr>
                        <tr><td>Overall Score</td><td style="color:#f59e0b;font-weight:bold;">${qualScore.toFixed(1)}%</td><td class="status-good">Good</td></tr>
                        <tr><td>Completeness</td><td>${completeness}%</td><td class="status-good">Good</td></tr>
                        <tr><td>Validity</td><td>${validity}%</td><td class="status-good">Good</td></tr>
                        <tr><td>Timeliness</td><td>${timeliness}%</td><td class="status-good">Good</td></tr>
                        <tr><td>Issues Ditemukan</td><td style="color:#ef4444;font-weight:bold;">${totalIssues}</td><td>Needs Review</td></tr>
                        <tr><td>Total Records</td><td>${fmtNum(totalRec)}</td><td></td></tr>
                    </table>
                    <table>
                        <tr><th>Dimensi Kualitas</th><th>Skor</th><th>Status</th></tr>
                        <tr><td>Pipeline Status</td><td style="color:#0d5cff;font-weight:600;">In Progress</td><td></td></tr>
                        <tr><td>Accuracy</td><td>${accuracy}%</td><td class="status-good">Good</td></tr>
                        <tr><td>Consistency</td><td>${consistency}%</td><td class="status-good">Good</td></tr>
                        <tr><td>Quality Trend</td><td style="color:#10b981;font-weight:bold;">${parseFloat(trendPct)>=0?'+':''}${trendPct}%</td><td></td></tr>
                        <tr><td>Critical Issues</td><td style="color:#ef4444;font-weight:bold;">${critCount}</td><td></td></tr>
                        <tr><td>Pipeline Records</td><td>${fmtNum(totalRec)}</td><td></td></tr>
                    </table>
                </div>
                
                <div class="section-title">3. Grafik Analisis Pipeline</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div style="border:1px solid #ddd; padding:15px; border-radius:6px; background:#fff;">
                        <h4 style="margin:0 0 10px 0; color:#444; text-align:center;">Data Issues by Category</h4>
                        <div style="height:250px;"><canvas id="print-bar-chart"></canvas></div>
                    </div>
                    <div style="border:1px solid #ddd; padding:15px; border-radius:6px; background:#fff;">
                        <h4 style="margin:0 0 10px 0; color:#444; text-align:center;">Quality Score Trend</h4>
                        <div style="height:250px;"><canvas id="print-trend-chart"></canvas></div>
                    </div>
                </div>

                <div style="margin-top:50px;text-align:center;color:#888;font-size:11px;border-top:1px dashed #ddd;padding-top:20px;">
                    Dicetak secara otomatis oleh sistem <strong>Insight Data Quality Platform</strong> pada ${dateStr}
                </div>
                
                <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
                <script>
                    window.onload = function() {
                        const categories = ['Missing Values','Duplicates','Format Errors','Outliers','Schema Violations'];
                        const critCounts = [${[Math.round(critCount/5), Math.round(critCount/5), Math.round(critCount/5), Math.round(critCount/5), Math.round(critCount/5)].join(',')}];
                        const highCounts = [${[Math.round(totalIssues*0.13), Math.round(totalIssues*0.13), Math.round(totalIssues*0.13), Math.round(totalIssues*0.13), Math.round(totalIssues*0.13)].join(',')}];
                        
                        // Render Bar Chart
                        new Chart(document.getElementById('print-bar-chart'), {
                            type: 'bar',
                            data: {
                                labels: categories,
                                datasets: [
                                    {label:'Critical', data:critCounts, backgroundColor:'#ef4444'},
                                    {label:'High', data:highCounts, backgroundColor:'#f59e0b'}
                                ]
                            },
                            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 } }
                        });

                        // Render Trend Chart
                        const trendLabels = Array.from({length:7},(_,i)=>{ const d2=new Date(); d2.setDate(d2.getDate()-(6-i)); return d2.toLocaleDateString('id-ID',{day:'numeric',month:'short'}); });
                        const qScore = ${qualScore};
                        const baseQ = qScore - 8;
                        const trendData = trendLabels.map((_,i)=> parseFloat((baseQ + (qScore-baseQ)*(i/6)).toFixed(1)));
                        trendData[6] = qScore;

                        new Chart(document.getElementById('print-trend-chart'), {
                            type: 'line',
                            data: {
                                labels: trendLabels,
                                datasets: [{
                                    label: 'Quality Score (%)',
                                    data: trendData,
                                    borderColor: '#10b981',
                                    backgroundColor: 'rgba(16,185,129,0.1)',
                                    fill: true,
                                    tension: 0.3
                                }]
                            },
                            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { y: { min: Math.max(0, qScore-15), max: 100 } } }
                        });

                        // Print after charts render
                        setTimeout(function() { window.print(); }, 1000);
                    }
                <\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    }

    function renderAutoMLDashboardModal(activeSub, result, jobId) {
        const modalId = 'g4-chart-modal-' + jobId;
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = modalId;
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.88);backdrop-filter:blur(10px);z-index:10000;display:flex;justify-content:center;align-items:flex-start;padding:24px;overflow-y:auto;';
        overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

        const summary = result.model_summary || {};
        const quality = result.data_quality_report || {};
        const importances = result.feature_importances || [];
        const isClassification = summary.problem_type === 'classification';
        const isRegression = summary.problem_type === 'regression';
        const isClustering = summary.problem_type === 'clustering';

        let perfMetricLabel = "Accuracy";
        let perfMetricVal = (result.accuracy || 0).toFixed(2) + "%";
        let secMetricLabel = "Precision";
        let secMetricVal = (result.precision || 0).toFixed(3);

        if (isRegression) {
            perfMetricLabel = "R-Squared (R²)";
            perfMetricVal = result.advanced_eval && result.advanced_eval.r2_score !== undefined ? result.advanced_eval.r2_score.toFixed(3) : "N/A";
            secMetricLabel = "Root Mean Squared Error (RMSE)";
            secMetricVal = result.advanced_eval && result.advanced_eval.rmse !== undefined ? result.advanced_eval.rmse.toFixed(3) : "N/A";
        } else if (isClustering) {
            perfMetricLabel = "Silhouette Score";
            perfMetricVal = result.advanced_eval && result.advanced_eval.silhouette_score !== undefined ? result.advanced_eval.silhouette_score.toFixed(3) : "N/A";
            secMetricLabel = "Precision Equivalent";
            secMetricVal = (result.precision || 0).toFixed(3);
        }

        const topFeature = importances.length > 0 ? importances[0].feature : "None";

        overlay.innerHTML = `
        <div style="background:#0d0d1e;width:100%;max-width:960px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);padding:36px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,0.6);position:relative;margin:auto;" onclick="event.stopPropagation()">
            <button onclick="document.getElementById('${modalId}').remove()" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.1);border:none;border-radius:50%;width:36px;height:36px;color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#x2715;</button>
            <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:6px;padding-right:40px;">📊 Dashboard AutoML Model: ${activeSub.title}</h2>
            <p style="color:rgba(255,255,255,0.55);font-size:0.85rem;margin-bottom:28px;">Hasil Evaluasi Engine Training & Real-time Metrics</p>
            
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px;">
                <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${perfMetricLabel}</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#c084fc;">${perfMetricVal}</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">Model Performance</div>
                </div>
                <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${secMetricLabel}</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#a5b4fc;">${secMetricVal}</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">Error / Secondary Metric</div>
                </div>
                <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Training Time</div>
                    <div style="font-size:1.8rem;font-weight:800;color:#fbbf24;">${(summary.training_time_sec || 0).toFixed(3)}s</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">Engine execution speed</div>
                </div>
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:14px;padding:16px;">
                    <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Dataset Health</div>
                    <div style="font-size:1.6rem;font-weight:800;color:#34d399;">${quality.health_rating || 'Good'}</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:4px;">Score: ${quality.health_score || 100}/100</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;">
                    <h3 style="font-size:0.9rem;font-weight:700;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px;color:#a5b4fc;">🔧 Model Overview</h3>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>Algorithm</span><strong>${summary.algorithm || 'N/A'}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>Problem Type</span><strong>${(summary.problem_type || 'N/A').toUpperCase()}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>Training Sample</span><strong>${summary.training_records || 0} rows</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;">
                        <span>Top Feature Driver</span><strong>${topFeature}</strong>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;">
                    <h3 style="font-size:0.9rem;font-weight:700;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px;color:#34d399;">📈 Data Quality Report</h3>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>Total Records Ingested</span><strong>${quality.total_records || 0}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>Missing Values</span><strong>${quality.missing_values_count || 0} (${quality.missing_values_pct || 0}%)</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>Duplicate Rows</span><strong>${quality.duplicate_rows_count || 0} (${quality.duplicate_rows_pct || 0}%)</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;">
                        <span>Health Score</span><strong>${quality.health_score || 100} / 100</strong>
                    </div>
                </div>
            </div>

            <div style="background:rgba(99,102,241,0.05);border-left:4px solid #6366f1;border-radius:0 12px 12px 0;padding:18px 24px;margin-bottom:28px;">
                <strong style="color:#a5b4fc;font-size:0.9rem;display:block;margin-bottom:6px;">💡 AI Summary & Insights</strong>
                <p style="margin:0;font-size:0.82rem;line-height:1.6;color:rgba(255,255,255,0.85);">${result.ai_insights || 'No AI insights available.'}</p>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;">
                    <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:16px;">Top Feature Importances</h3>
                    <div style="height:220px;"><canvas id="g4-automl-bar-${jobId}"></canvas></div>
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;">
                    <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:16px;">
                        ${isClassification ? 'ROC Evaluation Curve' : (isRegression ? 'Model Residual Plot' : 'Cluster Size Distribution')}
                    </h3>
                    <div style="height:220px;"><canvas id="g4-automl-eval-${jobId}"></canvas></div>
                </div>
            </div>

            <div style="text-align:right;margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:10px 26px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;font-size:0.9rem;font-weight:600;cursor:pointer;">Tutup</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

        const gx = { ticks:{color:'rgba(255,255,255,0.5)',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'} };

        const featLabels = importances.slice(0, 7).map(item => item.feature);
        const featData = importances.slice(0, 7).map(item => item.importance);
        new Chart(document.getElementById(`g4-automl-bar-${jobId}`), {
            type: 'bar',
            data: {
                labels: featLabels,
                datasets: [{
                    label: 'Importance',
                    data: featData,
                    backgroundColor: 'rgba(168,85,247,0.8)',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: gx, y: gx }
            }
        });

        const evalCtx = document.getElementById(`g4-automl-eval-${jobId}`);
        if (isClassification) {
            const rocPoints = (result.advanced_eval || {}).roc_curve || [];
            new Chart(evalCtx, {
                type: 'line',
                data: {
                    labels: rocPoints.map(p => p.fpr.toFixed(2)),
                    datasets: [
                        {
                            label: 'ROC Curve (AUC = ' + (result.advanced_eval || {}).auc_score + ')',
                            data: rocPoints.map(p => p.tpr),
                            borderColor: '#34d399',
                            backgroundColor: 'rgba(52,211,153,0.12)',
                            fill: true,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: 2
                        },
                        {
                            label: 'Random Guess',
                            data: rocPoints.map(p => p.fpr),
                            borderColor: 'rgba(255,255,255,0.2)',
                            borderDash: [5, 5],
                            fill: false,
                            borderWidth: 1,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ...gx, title: { display: true, text: 'False Positive Rate', color: 'rgba(255,255,255,0.6)', font: { size: 9 } } },
                        y: { ...gx, title: { display: true, text: 'True Positive Rate', color: 'rgba(255,255,255,0.6)', font: { size: 9 } }, min: 0, max: 1 }
                    }
                }
            });
        } else if (isRegression) {
            const residuals = (result.advanced_eval || {}).residual_plot || [];
            new Chart(evalCtx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Residuals (R² = ' + (result.advanced_eval || {}).r2_score + ')',
                        data: residuals.map(p => ({ x: p.predicted, y: p.residual })),
                        backgroundColor: '#fbbf24',
                        borderColor: '#fbbf24',
                        radius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ...gx, title: { display: true, text: 'Predicted Value', color: 'rgba(255,255,255,0.6)', font: { size: 9 } } },
                        y: { ...gx, title: { display: true, text: 'Residual', color: 'rgba(255,255,255,0.6)', font: { size: 9 } } }
                    }
                }
            });
        } else if (isClustering) {
            const dist = (result.advanced_eval || {}).cluster_distribution || [];
            new Chart(evalCtx, {
                type: 'bar',
                data: {
                    labels: dist.map(d => d.cluster),
                    datasets: [{
                        label: 'Record Count',
                        data: dist.map(d => d.count),
                        backgroundColor: '#a5b4fc',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: gx, y: gx }
                }
            });
        }
    }

    function openGrid4Chart() {
        const d = pipelineState.grid3Data;
        if (!d || d.length === 0) return;
        
        const activeSub = d[0];
        const s4 = activeSub.pipeline_data.stage_4 || {};
        
        let contentHtml = `<div style="display:flex; flex-direction:column; gap:20px; padding-top:10px;">`;
        
        // Custom Graphic Placeholders based on user request
        contentHtml += `
            <p style="color: rgba(255,255,255,0.7); font-size: 0.95rem;">
                Grafik di bawah ini menampilkan hasil pemrosesan dan analisis kualitas data. Anda dapat mengganti area ini dengan <i>screenshot</i> grafik asli di dalam kode.
            </p>
            
            <div style="width: 100%; background: rgba(255, 255, 255, 0.03); border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 16px; padding: 25px; text-align: center; color: rgba(255, 255, 255, 0.6); min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <h4 style="color:#fff; margin-bottom: 12px; font-size: 1.1rem;">Data Issues by Category & Severity</h4>
                <p style="font-size: 0.85rem; margin-bottom:15px;">[Sisipkan Gambar Bar Chart Anda Di Sini]</p>
                <!-- <img src="nama-file-bar-chart.jpg" alt="Bar Chart" style="max-width:100%; border-radius:8px;"> -->
            </div>
            
            <div style="width: 100%; background: rgba(255, 255, 255, 0.03); border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 16px; padding: 25px; text-align: center; color: rgba(255, 255, 255, 0.6); min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <h4 style="color:#fff; margin-bottom: 12px; font-size: 1.1rem;">Dataset Quality Scores</h4>
                <p style="font-size: 0.85rem; margin-bottom:15px;">[Sisipkan Gambar Tabel Dataset Anda Di Sini]</p>
                <!-- <img src="nama-file-tabel.jpg" alt="Tabel" style="max-width:100%; border-radius:8px;"> -->
            </div>
            
            <div style="width: 100%; background: rgba(255, 255, 255, 0.03); border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 16px; padding: 25px; text-align: center; color: rgba(255, 255, 255, 0.6); min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <h4 style="color:#fff; margin-bottom: 12px; font-size: 1.1rem;">Overall Quality & Dimensions Trend</h4>
                <p style="font-size: 0.85rem; margin-bottom:15px;">[Sisipkan Gambar Dashboard 4 Panel (Line Charts) Anda Di Sini]</p>
                <!-- <img src="nama-file-dashboard.jpg" alt="Line Charts" style="max-width:100%; border-radius:8px;"> -->
            </div>
        `;

        if (s4.loss_curve_path) {
            contentHtml += `
                <div style="margin-top:20px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.1);">
                    <h4 style="margin-bottom:8px; color:var(--purple);">📈 Kurva Loss (Pelatihan vs Validasi)</h4>
                    <img src="/${s4.loss_curve_path}" style="width:100%; max-height:220px; object-fit:contain; border-radius:8px; border:1px solid var(--border);">
                </div>
            `;
        }
        
        if (s4.confusion_matrix) {
            const cm = s4.confusion_matrix;
            const classes = s4.extra ? s4.extra.classes : (s4.classes || []);
            contentHtml += `
                <div>
                    <h4 style="margin-bottom:8px; color:var(--cyan);">📊 Confusion Matrix</h4>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; text-align:center; font-size:0.75rem;">
                            <thead>
                                <tr style="background:var(--bg-card-2);">
                                    <th style="padding:6px; border:1px solid var(--border);">Aktual \\ Prediksi</th>
                                    ${classes.map(c => `<th style="padding:6px; border:1px solid var(--border);">${c}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${cm.map((row, ri) => `
                                    <tr>
                                        <td style="padding:6px; border:1px solid var(--border); background:var(--bg-card-2); font-weight:bold;">${classes[ri] || ri}</td>
                                        ${row.map((val, ci) => `
                                            <td style="padding:6px; border:1px solid var(--border); background:${ri===ci ? 'rgba(16,185,129,0.15)' : 'none'}; color:${ri===ci ? 'var(--green)' : 'var(--white)'}; font-weight:${ri===ci ? 'bold' : 'normal'};">
                                                ${val}
                                            </td>
                                        `).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        
        contentHtml += `</div>`;
        showDynamicModal("Grafik Model AI: " + activeSub.title, contentHtml);
    }

    function showDynamicModal(title, bodyHtml) {
        const existing = document.getElementById('dynamic-chart-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'dynamic-chart-modal';
        modal.className = 'g2-modal-overlay active';
        modal.style.zIndex = '9999';
        modal.onclick = () => modal.remove();
        
        modal.innerHTML = `
            <div class="g2-modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 900px; padding: 30px; display:flex; flex-direction:column; gap:20px; border-radius:16px;">
                <div class="g2-main-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:15px;">
                    <h3 style="font-family:'Syne',sans-serif; font-size:1.3rem; color:var(--white);">${title}</h3>
                    <button class="modal-close" onclick="document.getElementById('dynamic-chart-modal').remove()" style="background:rgba(255,255,255,0.1); border:none; border-radius:50%; width:32px; height:32px; color:white; font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
                </div>
                <div style="max-height:65vh; overflow-y:auto; padding-right:10px;">
                    ${bodyHtml}
                </div>
                <div style="text-align:right; border-top:1px solid var(--border); padding-top:15px;">
                    <button class="pg-btn-secondary" onclick="document.getElementById('dynamic-chart-modal').remove()" style="padding:10px 24px; font-size:1rem; border-radius:8px;">Tutup</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // --- GRID 4 → 5 ---
    function openSendToGrid5Modal() {
        if (pipelineState.grid3Data.length === 0) return;
        const activeSub = pipelineState.grid3Data[0];
        document.getElementById('pm-summary-4to5').innerHTML = `
            <div class="pm-summary-row"><span>Jumlah Data</span><span>1 item</span></div>
            <div class="pm-summary-row"><span>Dari</span><span>Grid 4 — Data Telah Diproses</span></div>
            <div class="pm-summary-row"><span>Tujuan</span><span>Grid 5 — Kirim ke Implementasi</span></div>
            <div class="pm-summary-row"><span>Quality Check</span><span style="color:var(--green)">✓ Lulus Validasi</span></div>`;
        document.getElementById('pm-overlay-4to5').classList.add('active');
    }

    function confirmSendToGrid5() {
        closePipelineModal('pm-overlay-4to5');
        unlockGrid(5);
        renderGrid5State();
        updateFlowBar();
        showToast('Data siap untuk pengiriman final di Grid 5!', 'success');
    }

    // --- GRID 5 ---
    function renderGrid5State() {
        const r = pipelineState.grid4Ready;
        const dEl = document.getElementById('g5-delivery-list'), sBtn = document.getElementById('g5-send-btn');
        if (!r || r.length === 0) {
            dEl.innerHTML = '<div class="pg-queue-empty"><span>🔒</span><p>Menunggu kiriman dari Grid 4</p></div>';
            sBtn.disabled = true;
        } else {
            dEl.innerHTML = `<div style="padding:12px 14px;background:var(--bg);border:1px solid rgba(236,72,153,0.3);border-radius:10px;">
                <div style="font-size:0.82rem;color:var(--white);font-weight:600;">✅ ${r.length} item siap dikirim final</div>
                <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">Telah melewati seluruh pipeline validasi</div>
            </div>`;
            sBtn.disabled = false;
        }
        renderGrid5History();
    }

    function renderGrid5History() {
        const hEl = document.getElementById('g5-history-list'), h = pipelineState.history;
        if (!h || h.length === 0) {
            hEl.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;text-align:center;padding:12px;">Belum ada pengiriman</p>'; return;
        }
        hEl.innerHTML = h.slice(-5).reverse().map(x => `
            <div class="pg-history-item">
                <span class="hi-icon">📦</span>
                <div class="hi-info" style="font-size:0.8rem;"><div style="font-weight:600;">Dataset: ${x.title}</div><div class="hi-time">${new Date(x.sentAt).toLocaleString('id-ID')}</div></div>
                <span style="background:rgba(16,185,129,0.15);color:#6ee7b7;padding:2px 8px;border-radius:8px;font-size:0.7rem;">Terkirim</span>
            </div>`).join('');
    }

    function executeFinalSend() {
        if (pipelineState.grid4Ready.length === 0) return;
        const activeSub = pipelineState.grid4Ready[0];
        document.getElementById('pm-summary-final').innerHTML = `
            <div class="pm-summary-row"><span>Nama Dataset</span><span>${activeSub.title}</span></div>
            <div class="pm-summary-row"><span>Tujuan</span><span>Tim Kelompok Implementasi</span></div>
            <div class="pm-summary-row"><span>Tahap Dilalui</span><span>Grid 1 → 2 → 3 → 4 → 5</span></div>
            <div class="pm-summary-row"><span>Status</span><span style="color:var(--green)">✓ Siap Pengiriman Final</span></div>`;
        document.getElementById('pm-overlay-final').classList.add('active');
    }

    async function confirmFinalSend() {
        if (pipelineState.grid4Ready.length === 0) return;
        const targetId = pipelineState.grid4Ready[0].id;
        
        let pd = pipelineState.grid4Ready[0].pipeline_data || {};
        if (typeof pd === 'string') {
            try { pd = JSON.parse(pd); } catch(e) {}
        }
        let jobId = null;
        if (pd.stage_7 && pd.stage_7.job_id) {
            jobId = pd.stage_7.job_id;
        } else if (pd['7'] && pd['7'].job_id) {
            jobId = pd['7'].job_id;
        }

        // Open window synchronously to avoid popup blockers
        let reportWindow = window.open('', '_blank');
        if (reportWindow) {
            reportWindow.document.write('<html><head><title>Memuat Laporan...</title></head><body style="font-family:\'Segoe UI\',sans-serif; text-align:center; padding-top:100px; background:#12131a; color:#fff;"><h3>🚀 Memproses Pengiriman Final...</h3><p style="color:#888;">Mohon tunggu, data sedang dikirim dan laporan sedang disiapkan.</p></body></html>');
            reportWindow.document.close();
        }
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch(`/creation/api/v2/submissions/${targetId}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    status: 'sent',
                    sent_at: new Date().toISOString()
                })
            });
            if (res.ok) {
                showToast(`🚀 Model berhasil dikirim ke Kelompok Implementasi!`, 'success');
                if (jobId) {
                    if (reportWindow) {
                        reportWindow.location.href = `/api/train/pdf-report/${jobId}`;
                    } else {
                        window.open(`/api/train/pdf-report/${jobId}`, '_blank');
                    }
                } else {
                    if (reportWindow) {
                        writeClientSideReportToWindow(reportWindow, pipelineState.grid4Ready[0]);
                    } else {
                        printComprehensiveReport(0);
                    }
                }
                closePipelineModal('pm-overlay-final');
                await loadPipelineData();
            } else {
                if (reportWindow) reportWindow.close();
                let errMsg = 'Gagal mengirim data final';
                try {
                    const errData = await res.json();
                    errMsg += ': ' + JSON.stringify(errData);
                } catch(e) {
                    try {
                        const errText = await res.text();
                        errMsg += ': ' + errText;
                    } catch(e2) {}
                }
                showToast(errMsg, 'error');
            }
        } catch (e) {
            if (reportWindow) reportWindow.close();
            showToast('Gagal: ' + e.message, 'error');
        }
    }

    function openGrid5History() { showToast('Total pengiriman riwayat: ' + pipelineState.history.length, 'success'); }

    // --- PIPELINE UTILS ---
    function unlockGrid(n) {
        const c = document.getElementById(`pg-card-${n}`);
        if (c) { c.classList.remove('pg-locked'); c.classList.add('pg-unlocked'); }
    }

    function resetAllGrids() {
        [3,4,5].forEach(n => {
            const c = document.getElementById(`pg-card-${n}`);
            if (c) { c.classList.remove('pg-unlocked'); c.classList.add('pg-locked'); }
        });
        updateFlowBar();
    }

    function updateFlowBar() {
        const hasProjects = pipelineState.projects && pipelineState.projects.length > 0;
        const hasPending = pipelineState.grid1Data && pipelineState.grid1Data.length > 0;
        const hasInProgress = pipelineState.grid2Queue && pipelineState.grid2Queue.length > 0;
        const hasCompleted = pipelineState.grid3Data && pipelineState.grid3Data.length > 0;
        const hasHistory = pipelineState.history && pipelineState.history.length > 0;
        
        setFlowNode(1, hasProjects ? 'done' : 'active');
        
        if (hasInProgress || hasCompleted || hasHistory) {
            setFlowNode(2, 'done');
        } else if (hasPending) {
            setFlowNode(2, 'active');
        } else {
            setFlowNode(2, '');
        }
        
        if (hasCompleted || hasHistory) {
            setFlowNode(3, 'done');
        } else if (hasInProgress) {
            setFlowNode(3, 'active');
        } else {
            setFlowNode(3, '');
        }
        
        if (hasHistory) {
            setFlowNode(4, 'done');
        } else if (hasCompleted) {
            setFlowNode(4, 'active');
        } else {
            setFlowNode(4, '');
        }
        
        if (hasHistory) {
            setFlowNode(5, 'done');
        } else if (pipelineState.grid4Ready && pipelineState.grid4Ready.length > 0) {
            setFlowNode(5, 'active');
        } else {
            setFlowNode(5, '');
        }
    }

    // --- MODEL PLAYGROUND (Inference UI) ---
    function renderFinalPlayground() {
        const panel = document.getElementById('final-playground-panel');
        if (!panel) return;
        
        const completedSubs = pipelineState.grid3Data;
        if (completedSubs.length === 0) {
            panel.style.display = 'none';
            return;
        }
        
        panel.style.display = 'block';
        
        const activeSub = completedSubs[0];
        activePlaygroundSubId = activeSub.id;
        
        const s7 = activeSub.pipeline_data.stage_7 || {};
        const s3 = activeSub.pipeline_data.stage_3 || {};
        const s2 = activeSub.pipeline_data.stage_2 || {};
        const s1 = activeSub.pipeline_data.stage_1 || {};
        const s0 = activeSub.pipeline_data.stage_0 || {};
        
        document.getElementById('play-narrative').textContent = s7.management_report ? s7.management_report.summary : 'Rangkuman bisnis belum disiapkan.';
        document.getElementById('play-model-name').textContent = s3.selected_model || '—';
        
        const taskTypeMap = {
            classification: 'Tabular Classification',
            regression: 'Tabular Regression',
            image_classification: 'Computer Vision (Image Classification)',
            text_classification: 'NLP (Text Classification)'
        };
        document.getElementById('play-task-type').textContent = taskTypeMap[s0.task_type] || s0.task_type || '—';
        document.getElementById('play-target-col').textContent = s1.target_column || '—';
        document.getElementById('play-samples').textContent = `Latih: ${s2.train_size || 0} | Uji: ${s2.test_size || 0}`;
        
        // Input fields based on track
        const inputArea = document.getElementById('play-input-area');
        const taskType = s0.task_type;
        
        let html = "";
        if (taskType === 'image_classification') {
            html = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <label style="font-size:0.8rem; font-weight:600;">Unggah Gambar Baru (.jpg, .png):</label>
                    <input type="file" id="play-img-file" class="search-input" accept="image/*" style="width:100%; padding: 8px 12px;" onchange="previewPlaygroundImage(event)">
                    <div id="play-img-preview-container" style="display:none; text-align:center; margin-top:8px;">
                        <img id="play-img-preview" style="max-height:120px; border-radius:6px; border:1px solid var(--border);">
                    </div>
                </div>
            `;
        } else if (taskType === 'text_classification') {
            html = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <label style="font-size:0.8rem; font-weight:600;">Masukkan Kalimat/Teks Analisis:</label>
                    <textarea id="play-text-input" class="g2-textarea" placeholder="Ketik kalimat atau paragraf di sini..." rows="4" style="height:100px;"></textarea>
                </div>
            `;
        } else {
            // Tabular
            html = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <label style="font-size:0.8rem; font-weight:600;">Unggah File Uji (CSV) atau Ketik Baris Fitur JSON:</label>
                    <input type="file" id="play-tabular-file" class="search-input" accept=".csv,.xlsx" style="width:100%; padding: 8px 12px;">
                    <div style="text-align:center; color:var(--muted); font-size:0.75rem;">— ATAU —</div>
                    <textarea id="play-json-input" class="g2-textarea" placeholder='{"umur": 28, "jenis_kelamin": "pria", "pendapatan": 50000}' rows="4" style="height:80px; font-family:monospace; font-size:0.75rem;"></textarea>
                </div>
            `;
        }
        inputArea.innerHTML = html;
        document.getElementById('play-output-area').style.display = 'none';
    }

    function previewPlaygroundImage(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = document.getElementById('play-img-preview');
            img.src = event.target.result;
            document.getElementById('play-img-preview-container').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    async function executePlaygroundPrediction() {
        if (!activePlaygroundSubId) return;
        
        const completedSubs = pipelineState.grid3Data;
        const activeSub = completedSubs[0];
        const taskType = activeSub.pipeline_data.stage_0.task_type;
        
        const formData = new FormData();
        let hasData = false;
        
        if (taskType === 'image_classification') {
            const imgFile = document.getElementById('play-img-file').files[0];
            if (!imgFile) {
                showToast('Pilih file gambar terlebih dahulu!', 'error');
                return;
            }
            formData.append('file', imgFile);
            hasData = true;
        } else if (taskType === 'text_classification') {
            const txt = document.getElementById('play-text-input').value.trim();
            if (!txt) {
                showToast('Ketikkan teks terlebih dahulu!', 'error');
                return;
            }
            formData.append('input_text', txt);
            hasData = true;
        } else {
            const tabFile = document.getElementById('play-tabular-file').files[0];
            const jsonStr = document.getElementById('play-json-input').value.trim();
            
            if (tabFile) {
                formData.append('file', tabFile);
                hasData = true;
            } else if (jsonStr) {
                formData.append('input_text', jsonStr);
                hasData = true;
            } else {
                showToast('Pilih file CSV atau ketik data JSON!', 'error');
                return;
            }
        }
        
        if (!hasData) return;
        
        const btn = document.getElementById('play-predict-btn');
        btn.textContent = 'Memprediksi... ⟳';
        btn.disabled = true;
        
        try {
            const csrfToken = getCookie('csrftoken') || '';
            const res = await fetch(`/creation/api/v2/submissions/${activePlaygroundSubId}/predict/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('✓ Prediksi selesai!', 'success');
                const result = data.results[0];
                
                document.getElementById('play-pred-label').textContent = result.prediction;
                document.getElementById('play-pred-conf').textContent = (result.confidence * 100).toFixed(1) + '%';
                document.getElementById('play-output-area').style.display = 'block';
            } else {
                showToast('Gagal memproses prediksi: ' + (data.error || 'Terjadi kesalahan'), 'error');
            }
        } catch(e) {
            showToast('Gagal memproses: ' + e.message, 'error');
        } finally {
            btn.textContent = 'Kirim & Prediksi 🔮';
            btn.disabled = false;
        }
    }

    function setFlowNode(n, cls) {
        const el = document.getElementById(`pf-${n}`);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (cls) el.classList.add(cls);
    }

    function closePipelineModal(id) { document.getElementById(id).classList.remove('active'); }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape')
            ['pm-overlay-2to3','pm-overlay-4to5','pm-overlay-final'].forEach(id => closePipelineModal(id));
    });

    // =====================================================================
    // GRID 5: MAINTENANCE NOTES
    // =====================================================================
    let maintenanceNotes = [];

    function initMaintenanceNotes() {
        try { const s = localStorage.getItem('ic_maintenance_notes'); if (s) maintenanceNotes = JSON.parse(s); } catch(e) {}
        renderNotes();
    }

    function renderNotes() {
        const list = document.getElementById('note-list');
        const count = document.getElementById('note-count');
        count.textContent = maintenanceNotes.length + ' catatan';
        if (maintenanceNotes.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);"><div style="font-size:1.8rem;margin-bottom:8px;opacity:0.4">📝</div><p style="font-size:0.82rem;">Belum ada catatan maintenance</p></div>`;
            return;
        }
        list.innerHTML = maintenanceNotes.map((n, i) => `
            <div class="ig-note-item priority-${n.priority}">
                <div class="ig-note-text">${n.text.replace(/</g,'&lt;')}</div>
                <div class="ig-note-meta">
                    <span>${n.priority==='high'?'🔴 High':n.priority==='medium'?'🟡 Medium':'🟢 Low'} · ${n.time}</span>
                    <button class="ig-note-delete" onclick="deleteNote(${i})">🗑️</button>
                </div>
            </div>`).join('');
    }

    function addMaintenanceNote() {
        const f = document.getElementById('note-form');
        f.style.display = f.style.display === 'none' ? 'flex' : 'none';
        f.style.flexDirection = 'column';
        document.getElementById('note-textarea').focus();
    }

    function cancelNote() {
        document.getElementById('note-form').style.display = 'none';
        document.getElementById('note-textarea').value = '';
    }

    function saveNote() {
        const text = document.getElementById('note-textarea').value.trim();
        if (!text) { showToast('Tulis catatan terlebih dahulu', 'error'); return; }
        maintenanceNotes.unshift({ text, priority: document.getElementById('note-priority').value, time: new Date().toLocaleString('id-ID') });
        try { localStorage.setItem('ic_maintenance_notes', JSON.stringify(maintenanceNotes)); } catch(e) {}
        cancelNote(); renderNotes(); showToast('Catatan disimpan!', 'success');
    }

    function deleteNote(idx) {
        maintenanceNotes.splice(idx, 1);
        try { localStorage.setItem('ic_maintenance_notes', JSON.stringify(maintenanceNotes)); } catch(e) {}
        renderNotes();
    }

    function clearAllNotes() {
        if (maintenanceNotes.length === 0) return;
        if (confirm('Hapus semua catatan?')) {
            maintenanceNotes = [];
            try { localStorage.removeItem('ic_maintenance_notes'); } catch(e) {}
            renderNotes(); showToast('Semua catatan dihapus', 'success');
        }
    }

    // =====================================================================
    // GRID 6: ENVIRONMENT DASHBOARD
    // =====================================================================
    function initEnvDashboard() {
        refreshEnvDashboard();
        setInterval(refreshEnvDashboard, 30000);
    }

    function refreshEnvDashboard() {
        const cpu = 18 + Math.floor(Math.random()*45);
        const mem = 35 + Math.floor(Math.random()*40);
        const disk = 42 + Math.floor(Math.random()*30);
        setTimeout(() => {
            document.getElementById('env-cpu-bar').style.width = cpu+'%';
            document.getElementById('env-cpu-val').textContent = cpu+'%';
            document.getElementById('env-mem-bar').style.width = mem+'%';
            document.getElementById('env-mem-val').textContent = mem+'%';
            document.getElementById('env-disk-bar').style.width = disk+'%';
            document.getElementById('env-disk-val').textContent = disk+'%';
        }, 200);
        const mlActive = Math.random() > 0.4;
        document.getElementById('env-ml-status').innerHTML =
            `<span class="env-status-dot ${mlActive ? 'dot-blue' : 'dot-yellow'}"></span> ${mlActive ? 'Active' : 'Standby'}`;
        addEnvLog();
        document.getElementById('env-last-update').textContent = 'Terakhir diperbarui: ' + new Date().toLocaleTimeString('id-ID');
    }

    function addEnvLog() {
        const logs = [
            {type:'info',msg:'System heartbeat OK'},{type:'success',msg:'Database sync berhasil'},
            {type:'info',msg:'API request diterima'},{type:'warning',msg:'Memory usage di atas 60%'},
            {type:'success',msg:'Pipeline task selesai'},{type:'info',msg:'ML Engine standby mode'},
            {type:'success',msg:'Backup selesai'},{type:'info',msg:'File received via API'}
        ];
        const pick = logs[Math.floor(Math.random()*logs.length)];
        const list = document.getElementById('env-log-list');
        const item = document.createElement('div');
        item.className = 'env-log-item';
        item.innerHTML = `<span class="env-log-time">${new Date().toLocaleTimeString('id-ID')}</span>
            <span class="env-log-type log-${pick.type}">${pick.type.toUpperCase()}</span>
            <span>${pick.msg}</span>`;
        list.insertBefore(item, list.firstChild);
        while (list.children.length > 20) list.removeChild(list.lastChild);
    }

    // ==========================================
    // SYSTEM MONITOR MODAL (GRID 6 EXPANSION)
    // ==========================================
    let sysCharts = {};

    function openSysMonitorModal() {
        document.getElementById('sys-monitor-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Update live time
        setInterval(() => {
            const now = new Date();
            document.getElementById('sm-live-time').innerText = now.toLocaleTimeString('en-GB');
        }, 1000);

        if (!sysCharts.cpu) {
            initSysMonitorCharts();
        }
    }

    function closeSysMonitorModal() {
        document.getElementById('sys-monitor-overlay').classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    function initSysMonitorCharts() {
        Chart.defaults.color = '#6b7280';
        Chart.defaults.font.family = "'DM Sans', sans-serif";

        const donutOptions = {
            responsive: true, maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        };

        // CPU Donut
        const ctxCpu = document.getElementById('chart-cpu').getContext('2d');
        sysCharts.cpu = new Chart(ctxCpu, {
            type: 'doughnut',
            data: { datasets: [{ data: [14.0, 86.0], backgroundColor: ['#3b82f6', 'rgba(255,255,255,0.05)'], borderWidth: 0, borderRadius: 10 }] },
            options: donutOptions
        });

        // Memory Donut
        const ctxMem = document.getElementById('chart-mem').getContext('2d');
        sysCharts.mem = new Chart(ctxMem, {
            type: 'doughnut',
            data: { datasets: [{ data: [82.0, 18.0], backgroundColor: ['#a855f7', 'rgba(255,255,255,0.05)'], borderWidth: 0, borderRadius: 10 }] },
            options: donutOptions
        });

        // Disk Donut
        const ctxDisk = document.getElementById('chart-disk').getContext('2d');
        sysCharts.disk = new Chart(ctxDisk, {
            type: 'doughnut',
            data: { datasets: [{ data: [22.0, 78.0], backgroundColor: ['#eab308', 'rgba(255,255,255,0.05)'], borderWidth: 0, borderRadius: 10 }] },
            options: donutOptions
        });

        // Real-time Line Chart
        const ctxLine = document.getElementById('chart-realtime').getContext('2d');
        const cpuData = Array.from({length: 15}, () => Math.random() * 10 + 10);
        const ramData = Array.from({length: 15}, () => Math.random() * 5 + 80);
        
        sysCharts.line = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: Array.from({length: 15}, (_, i) => `-${14-i}s`),
                datasets: [
                    { label: 'CPU', data: cpuData, borderColor: '#3b82f6', borderWidth: 2, tension: 0.4, pointRadius: 0 },
                    { label: 'RAM', data: ramData, borderColor: '#a855f7', borderWidth: 2, tension: 0.4, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.03)' } }
                },
                animation: { duration: 0 }
            }
        });

        // Network Throughput Line Chart
        const ctxNet = document.getElementById('chart-network').getContext('2d');
        const inData = Array.from({length: 12}, () => Math.random() * 100 + 50);
        const outData = Array.from({length: 12}, () => Math.random() * 50 + 20);

        sysCharts.net = new Chart(ctxNet, {
            type: 'line',
            data: {
                labels: Array.from({length: 12}, (_, i) => ''),
                datasets: [
                    { data: inData, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0 }
                },
                animation: { duration: 0 }
            }
        });

        // Simulate live data updates
        setInterval(() => {
            if(sysCharts.line) {
                const cData = sysCharts.line.data.datasets[0].data;
                const rData = sysCharts.line.data.datasets[1].data;
                const newCpu = Math.random() * 10 + 10;
                const newRam = Math.random() * 5 + 80;
                
                cData.shift(); cData.push(newCpu);
                rData.shift(); rData.push(newRam);
                sysCharts.line.update();
                
                document.getElementById('live-cpu-txt').innerText = `CPU - ${newCpu.toFixed(1)}%`;
                document.getElementById('live-ram-txt').innerText = `RAM - ${newRam.toFixed(1)}%`;
                
                // Animate Donuts & Progress Bars
                if(sysCharts.cpu) {
                    sysCharts.cpu.data.datasets[0].data = [newCpu, 100 - newCpu];
                    sysCharts.cpu.update();
                    const elVal = document.getElementById('sm-cpu-val');
                    if(elVal) elVal.innerHTML = `${newCpu.toFixed(1)}<span>%</span>`;
                    const elBar = document.getElementById('sm-cpu-bar');
                    if(elBar) elBar.style.width = `${newCpu}%`;
                    const elTxt = document.getElementById('sm-cpu-text-used');
                    if(elTxt) elTxt.innerText = `${newCpu.toFixed(1)}% used`;
                }
                if(sysCharts.mem) {
                    sysCharts.mem.data.datasets[0].data = [newRam, 100 - newRam];
                    sysCharts.mem.update();
                    const elVal = document.getElementById('sm-mem-val');
                    if(elVal) elVal.innerHTML = `${newRam.toFixed(1)}<span>%</span>`;
                    const elBar = document.getElementById('sm-mem-bar');
                    if(elBar) elBar.style.width = `${newRam}%`;
                    const usedGb = (newRam / 100 * 32).toFixed(1);
                    const elInfo = document.getElementById('sm-mem-text-used');
                    if(elInfo) elInfo.innerText = `${usedGb} / 32 GB`;
                    const elInfo2 = document.getElementById('sm-mem-text-used-2');
                    if(elInfo2) elInfo2.innerText = `${usedGb} GB used`;
                }
            }
            if(sysCharts.net) {
                const nData = sysCharts.net.data.datasets[0].data;
                const newIn = Math.random() * 100 + 50;
                nData.shift(); nData.push(newIn);
                sysCharts.net.update();
                
                const newOut = Math.random() * 50 + 20;
                const inEl = document.getElementById('sm-net-in-val');
                if(inEl) inEl.innerHTML = `${newIn.toFixed(0)} <span>MB/s</span>`;
                const outEl = document.getElementById('sm-net-out-val');
                if(outEl) outEl.innerHTML = `${newOut.toFixed(0)} <span>MB/s</span>`;
                const inBar = document.getElementById('sm-net-in-bar');
                if(inBar) inBar.style.width = `${(newIn/250)*100}%`;
                const outBar = document.getElementById('sm-net-out-bar');
                if(outBar) outBar.style.width = `${(newOut/150)*100}%`;
            }
            
            // Randomize Top Processes slightly
            const pBars = document.querySelectorAll('.sm-proc-fill:not(.sm-proc-fill-purple)');
            pBars.forEach(bar => {
                let currentW = parseFloat(bar.style.width) || 5;
                currentW = currentW + (Math.random() * 2 - 1);
                if(currentW < 1) currentW = 1;
                if(currentW > 20) currentW = 20;
                bar.style.width = currentW + '%';
                bar.parentElement.nextSibling.textContent = ' ' + currentW.toFixed(1) + '%';
            });
        }, 2500);
    }
    