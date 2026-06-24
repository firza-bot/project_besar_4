
    window.loadIssues = async function(projectId, projectName) {
        try {
            const res = await fetch('/api/projects/' + projectId + '/issues');
            const data = await res.json();
            const c = document.getElementById('g2-inbox-mini');
            document.getElementById('g2-total').textContent = data.issues.length;
            document.querySelector('#pg-card-2 .pg-card-title').innerHTML = `Menerima Data Project <span style="font-size:0.9rem; color:var(--purple);">(${projectName})</span>`;
            
            if (data.issues.length === 0) {
                c.innerHTML = '<div class="pg-queue-empty"><span>📭</span><p>Tidak ada issue untuk project ini</p></div>';
                return;
            }
            
            c.innerHTML = data.issues.map(issue => {
                const isDone = issue.realization === 100;
                return `
                <div class="pg-mini-item" style="padding:15px; border-radius:12px; border:1px solid var(--border); background:rgba(255,255,255,0.02); margin-bottom:10px; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; font-size:0.95rem; color:var(--white);">${issue.key}: ${issue.title}</span>
                        <span style="font-size:0.75rem; font-weight:600; padding:4px 10px; border-radius:6px; background:${isDone ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}; color:${isDone ? 'var(--green)' : 'var(--amber)'};">${isDone ? 'Done' : 'In Progress'}</span>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:5px;">
                        <span style="font-size:0.75rem; color:var(--muted);">Realisasi: ${issue.realization || 0}%</span>
                        <div style="width: 150px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow:hidden;">
                            <div style="height: 100%; background: ${isDone ? 'var(--green)' : 'var(--purple)'}; width: ${issue.realization || 0}%;"></div>
                        </div>
                    </div>
                </div>`
            }).join('');
        } catch(e) { console.error(e); }
    };
