

    // ===== STATE =====
    let currentServer = null;
    let currentPath = '';
    let logIntervals = {};
    let managerLogInterval = null;
    let currentEditFile = { name: '', path: '' };
    let currentTheme = '{{ config.theme }}';
    
    // ===== MATRIX BACKGROUND =====
    (function() {
        const canvas = document.getElementById('matrixCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const fontSize = 14;
        const columns = Math.floor(canvas.width / fontSize);
        const drops = Array(columns).fill(1);
        
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#38bdf8';
        function draw() {
            ctx.fillStyle = 'rgba(12, 20, 69, 0.12)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = primary + '55';
            ctx.font = fontSize + 'px monospace';
            
            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        }
        setInterval(draw, 50);
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
    })();
    
    // ===== LIVE CLOCK =====
    function updateClock() {
        const now = new Date();
        const el = document.getElementById('live-clock');
        if (el) el.textContent = now.toLocaleTimeString();
    }
    setInterval(updateClock, 1000);
    updateClock();
    
    // ===== SIDEBAR =====
    // Self-heal guard: sidebar/overlay কখনোই load-এ stuck open থাকবে না।
    // (টাচ browser-এর swipe-back বা ক্যাশিং সমস্যায় overlay 'open' থেকে যায়)
    document.addEventListener('DOMContentLoaded', () => {
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('sidebarOverlay');
        if (sb) sb.classList.remove('open');
        if (ov) ov.classList.remove('open');
    });
    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('open');
    }
    
    // ===== VIEW SWITCHING =====
    function switchView(view) {
        document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById('view-' + view);
        if (target) target.classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const nav = document.getElementById('nav-' + view);
        if (nav) nav.classList.add('active');
        
        // Close sidebar on mobile only if it's open
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
        
        // Load data for specific views
        if (view === 'activity') loadActivity();
        if (view === 'processes') loadProcesses();
        if (view === 'ports') loadPorts();
        if (view === 'backup') loadBackups();
        if (view === 'terminal') terminalInitOnSwitch();
        if (view === 'health') loadHealthScores();
        if (view === 'users') loadUsersList();
        if (view === 'devices') refreshDevices();
        if (view === 'firewall') refreshFirewall();
        if (view === 'webhooks') loadWebhookSettings();
        
        // Update URL hash
        window.location.hash = view;
    }
    
    // Check URL hash on load
    window.addEventListener('load', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash && document.getElementById('view-' + hash)) {
            switchView(hash);
        }
        loadActivity();
    });
    // দুইবার গ্যারান্টি: ক্লাসিক script-এ DOMContentLoaded কখনো কখনো দেরিতে ফায়ার হয়;
    // load event-এও sidebar/overlay বন্ধ করে দেওয়া হয়।
    window.addEventListener('load', () => {
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('sidebarOverlay');
        if (sb) sb.classList.remove('open');
        if (ov) ov.classList.remove('open');
    });
    
    // ===== TOAST NOTIFICATIONS =====
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        
        const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle' };
        toast.innerHTML = '<i class="fas fa-' + icons[type] + ' mr-2"></i>' + message;
        
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // ===== SERVER ACTIONS =====
    async function serverAction(serverId, action) {
        if (action === 'delete') {
            if (!confirm('Are you sure you want to delete server "' + serverId + '"? This cannot be undone!')) {
                return;
            }
        }
        try {
            const res = await fetch('/api/server/' + serverId + '/' + action, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Server ' + action + 'ed successfully');
                // Stop log refresh if stopping
                if (action === 'stop' && logIntervals[serverId]) {
                    clearInterval(logIntervals[serverId]);
                    delete logIntervals[serverId];
                }
                // Refresh after action
                setTimeout(() => location.reload(), 500);
            } else {
                showToast(data.error || 'Action failed', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    
    // ===== CREATE SERVER =====
    function openCreateServerModal() {
        document.getElementById('createServerModal').classList.add('active');
    }
    
    async function createServer() {
        const name = document.getElementById('new-server-name').value.trim();
        const cmd = document.getElementById('new-server-cmd').value.trim();
        const group = document.getElementById('new-server-group').value.trim() || 'default';
        const notes = document.getElementById('new-server-notes').value.trim();
        const fileInput = document.getElementById('new-server-file');
        
        if (!name) { showToast('Server name is required', 'error'); return; }
        
        try {
            if (fileInput.files.length > 0) {
                const formData = new FormData();
                formData.append('server_name', name);
                formData.append('start_command', cmd);
                formData.append('group', group);
                formData.append('notes', notes);
                formData.append('file', fileInput.files[0]);
                
                const res = await fetch('/api/server/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.status === 'ok') {
                    showToast('Server created with file upload!');
                    closeModal('createServerModal');
                    setTimeout(() => location.reload(), 500);
                } else {
                    showToast(data.error || 'Failed to create server', 'error');
                }
            } else {
                const res = await fetch('/api/server/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ server_name: name, start_command: cmd, group: group, notes: notes })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    showToast('Server created successfully!');
                    closeModal('createServerModal');
                    setTimeout(() => location.reload(), 500);
                } else {
                    showToast(data.error || 'Failed to create server', 'error');
                }
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    
    // ===== CLONE SERVER =====
    async function cloneServer(serverId) {
        const newName = prompt('Enter new name for cloned server:');
        if (!newName) return;
        try {
            const res = await fetch('/api/server/' + serverId + '/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: newName })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Server cloned successfully!');
                setTimeout(() => location.reload(), 500);
            } else {
                showToast(data.error || 'Clone failed', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    
    // ===== SERVER LOGS =====
    function toggleServerLog(serverId) {
        const panel = document.getElementById('log-panel-' + serverId);
        if (!panel) return;
        panel.classList.toggle('hidden');
        
        if (!panel.classList.contains('hidden')) {
            fetchLogs(serverId);
            // Auto-refresh
            if (logIntervals[serverId]) clearInterval(logIntervals[serverId]);
            logIntervals[serverId] = setInterval(() => fetchLogs(serverId), 2000);
        } else {
            if (logIntervals[serverId]) {
                clearInterval(logIntervals[serverId]);
                delete logIntervals[serverId];
            }
        }
    }
    
    // লগ টেক্সট সিলেক্ট করা অবস্থায় আপডেট freeze (কপি চাপচায় না)
    function isSelectingLogs() {
        const sel = document.getSelection();
        return sel && sel.toString().length > 0;
    }
    async function fetchLogs(serverId) {
        if (isSelectingLogs()) return; // সিলেক্ট চলছে — টেক্সট ধরে রাখুন
        try {
            const res = await fetch('/api/server/' + serverId + '/logs');
            const data = await res.json();
            const el = document.getElementById('log-content-' + serverId);
            if (el && data.logs) {
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                el.textContent = data.logs;
                if (atBottom) el.scrollTop = el.scrollHeight; // ইউজার উপরে স্ক্রল করলে জাম্প করবে না
            }
        } catch (e) {}
    }
    function logSelectAll() {
        const el = document.getElementById('manager-log');
        if (!el) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        showToast('All logs selected — now copy with Ctrl+C / Copy button');
    }
    function copyManagerLog() {
        const el = document.getElementById('manager-log');
        if (!el) return showToast('No logs', 'error');
        navigator.clipboard.writeText(el.textContent).then(() => showToast('All logs copied!')).catch(() => {
            const range = document.createRange(); range.selectNodeContents(el);
            window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            showToast('Logs copied!');
        });
    }
    
    function copyLog(serverId) {
        const el = document.getElementById('log-content-' + serverId);
        if (el) {
            navigator.clipboard.writeText(el.textContent).then(() => {
                showToast('Logs copied to clipboard!');
            }).catch(() => {
                // Fallback
                const range = document.createRange();
                range.selectNode(el);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                document.execCommand('copy');
                window.getSelection().removeAllRanges();
                showToast('Logs copied!');
            });
        }
    }
    
    async function clearLog(serverId) {
        try {
            await fetch('/api/server/' + serverId + '/clear_logs', { method: 'POST' });
            fetchLogs(serverId);
            showToast('Logs cleared');
        } catch (e) {
            showToast('Failed to clear logs', 'error');
        }
    }
    
    // ===== SEARCH & FILTER =====
    function searchServers() {
        const query = document.getElementById('server-search').value.toLowerCase();
        document.querySelectorAll('#servers-container .server-card').forEach(card => {
            const name = card.dataset.serverName.toLowerCase();
            card.style.display = name.includes(query) ? '' : 'none';
        });
    }
    
    function filterServers() {
        const group = document.getElementById('group-filter').value;
        document.querySelectorAll('#servers-container .server-card').forEach(card => {
            const cardGroup = card.dataset.group;
            const matchesGroup = !group || cardGroup === group;
            card.style.display = matchesGroup ? '' : 'none';
        });
    }
    
    // ===== SERVER MANAGER =====
    function openServerManager(serverId) {
        currentServer = serverId;
        currentPath = '';
        document.getElementById('manager-title').innerHTML = '<i class="fas fa-cog"></i> ' + serverId;
        document.getElementById('manager-id').textContent = 'ID: ' + serverId;
        document.getElementById('manager-console-title').textContent = serverId + '@mahir:~$';
        document.getElementById('serverManagerModal').classList.add('active');
        
        // Reset overview UI + chart BEFORE the first fetch resolves, so switching
        // between servers never shows the previous server's stale endpoint/stats.
        resetOverviewUI();
        
        // Load config
        loadServerConfig(serverId);
        // Start on the Overview tab (Address/Uptime/CPU/Memory/Disk/Network + Live Endpoint)
        switchManagerTab('overview');
    }
    
    function switchManagerTab(tab) {
        document.querySelectorAll('.manager-tab').forEach(t => t.classList.add('hidden'));
        const target = document.getElementById('manager-' + tab);
        if (target) target.classList.remove('hidden');
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('tab-' + tab);
        if (btn) btn.classList.add('active');
        
        if (tab === 'console') {
            refreshManagerLog();
            if (managerLogInterval) clearInterval(managerLogInterval);
            managerLogInterval = setInterval(refreshManagerLog, 2000);
        } else {
            if (managerLogInterval) clearInterval(managerLogInterval);
        }
        
        if (tab === 'files') loadFiles();
        
        if (tab === 'overview') {
            refreshServerOverview();
            if (managerOverviewInterval) clearInterval(managerOverviewInterval);
            managerOverviewInterval = setInterval(refreshServerOverview, 3000);
        } else {
            if (managerOverviewInterval) clearInterval(managerOverviewInterval);
        }
    }
    
    // ===== OVERVIEW TAB (auto-detected live endpoint + stat cards) =====
    let managerOverviewInterval = null;
    let ovCpuChart = null;
    let ovCpuHistory = [];
    let lastEndpointUrl = null;
    let lastEndpointShortUrl = null;
    
    function resetOverviewUI() {
        // Called the instant a (possibly different) server is opened, so the
        // previous server's endpoint URL / stats never flash on screen.
        ovCpuHistory = [];
        lastEndpointUrl = null;
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
        setText('ov-address', '—');
        setText('ov-uptime', '—');
        setHtml('ov-cpu', '— <small>process</small>');
        setHtml('ov-mem', '— <small>MiB</small>');
        setHtml('ov-disk', '— <small>/ — GiB</small>');
        setHtml('ov-netin', '— <small>MiB</small>');
        const dot = document.getElementById('endpoint-dot');
        const label = document.getElementById('endpoint-label');
        const urlEl = document.getElementById('endpoint-url');
        const openBtn = document.getElementById('endpoint-open-btn');
        const copyBtn = document.getElementById('endpoint-copy-btn');
        const shortRow = document.getElementById('endpoint-short-row');
        const shortUrlEl = document.getElementById('endpoint-short-url');
        if (dot) dot.classList.remove('on');
        if (label) label.textContent = 'Checking for a live app port…';
        if (urlEl) urlEl.textContent = '—';
        if (openBtn) { openBtn.classList.add('hidden'); openBtn.href = '#'; }
        if (copyBtn) copyBtn.classList.add('hidden');
        if (shortRow) shortRow.classList.add('hidden');
        if (shortUrlEl) shortUrlEl.textContent = '—';
        lastEndpointShortUrl = null;
        if (ovCpuChart) {
            ovCpuChart.data.datasets[0].data = Array(20).fill(0);
            ovCpuChart.update('none');
        }
    }
    
    function initOverviewChart() {
        const ctx = document.getElementById('ov-cpu-chart');
        if (!ctx || ovCpuChart) return;
        const style = getComputedStyle(document.documentElement);
        const primary = style.getPropertyValue('--primary').trim() || '#00ff00';
        ovCpuChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    data: Array(20).fill(0),
                    borderColor: primary,
                    backgroundColor: primary + '22',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { beginAtZero: true, suggestedMax: 100, ticks: { color: '#ffffff88', font: { size: 9 } }, grid: { color: '#ffffff10' } }
                }
            }
        });
    }
    
    async function refreshServerOverview() {
        if (!currentServer) return;
        const requestedServer = currentServer; // snapshot to guard against race conditions below
        initOverviewChart();
        let d;
        try {
            const res = await fetch('/api/server/' + requestedServer + '/overview');
            d = await res.json();
        } catch (e) {
            return; // network hiccup - keep last known values, next poll retries
        }
        // If the user switched to a different server (or closed the modal) while
        // this request was in flight, discard the response instead of painting
        // stale/wrong data over the currently open server.
        if (requestedServer !== currentServer || d.error) return;
        
        document.getElementById('ov-address').textContent = d.address || '—';
        document.getElementById('ov-uptime').textContent = d.status === 'running' ? d.uptime : 'offline';
        document.getElementById('ov-cpu').innerHTML = (d.cpu_percent ?? 0) + '% <small>process</small>';
        document.getElementById('ov-mem').innerHTML = (d.mem_mb ?? 0) + ' <small>MiB</small>';
        document.getElementById('ov-disk').innerHTML = (d.disk_used ?? 0) + ' <small>/ ' + (d.disk_total ?? 0) + ' GiB</small>';
        document.getElementById('ov-netin').innerHTML = (d.net_recv ?? 0) + ' <small>MiB</small>';
        
        // Live endpoint card
        const dot = document.getElementById('endpoint-dot');
        const label = document.getElementById('endpoint-label');
        const urlEl = document.getElementById('endpoint-url');
        const openBtn = document.getElementById('endpoint-open-btn');
        const copyBtn = document.getElementById('endpoint-copy-btn');
        const ep = d.endpoint || { live: false };
        const shortRow = document.getElementById('endpoint-short-row');
        const shortUrlEl = document.getElementById('endpoint-short-url');
        if (ep.live && ep.url) {
            dot.classList.add('on');
            label.textContent = 'Live — app detected on port ' + ep.port;
            urlEl.textContent = ep.url;
            openBtn.href = ep.url;
            openBtn.setAttribute('rel', 'noopener');
            openBtn.classList.remove('hidden');
            copyBtn.classList.remove('hidden');
            lastEndpointUrl = ep.url;
            if (shortRow && shortUrlEl && ep.port) {
                const shortUrl = window.location.origin + '/' + ep.port + '/';
                shortUrlEl.textContent = shortUrl;
                lastEndpointShortUrl = shortUrl;
                shortRow.classList.remove('hidden');
            }
        } else {
            dot.classList.remove('on');
            label.textContent = d.status === 'running' ? 'Waiting for the app to open a port…' : 'Server is offline';
            urlEl.textContent = '—';
            openBtn.classList.add('hidden');
            copyBtn.classList.add('hidden');
            lastEndpointUrl = null;
            if (shortRow) shortRow.classList.add('hidden');
            lastEndpointShortUrl = null;
        }
        
        // CPU chart
        if (ovCpuChart) {
            ovCpuHistory.push(d.cpu_percent ?? 0);
            if (ovCpuHistory.length > 20) ovCpuHistory.shift();
            ovCpuChart.data.datasets[0].data = ovCpuHistory;
            ovCpuChart.update('none');
        }
    }
    
    function copyEndpointUrl() {
        if (!lastEndpointUrl) return;
        const fallbackCopy = () => {
            // Works even without HTTPS / Clipboard permission (common on Termux http:// panels)
            const ta = document.createElement('textarea');
            ta.value = lastEndpointUrl;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try {
                document.execCommand('copy');
                showToast('Endpoint URL copied!');
            } catch (e) {
                showToast('Copy failed — long-press the URL to copy manually', 'error');
            }
            document.body.removeChild(ta);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(lastEndpointUrl).then(() => showToast('Endpoint URL copied!')).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
    }
    
    function copyEndpointShortUrl() {
        if (!lastEndpointShortUrl) return;
        const fallbackCopy = () => {
            const ta = document.createElement('textarea');
            ta.value = lastEndpointShortUrl;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try {
                document.execCommand('copy');
                showToast('Short link copied!');
            } catch (e) {
                showToast('Copy failed — long-press the URL to copy manually', 'error');
            }
            document.body.removeChild(ta);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(lastEndpointShortUrl).then(() => showToast('Short link copied!')).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
    }
    
    async function refreshManagerLog() {
        if (!currentServer) return;
        try {
            const res = await fetch('/api/server/' + currentServer + '/logs');
            const data = await res.json();
            const el = document.getElementById('manager-log');
            if (el && data.logs && !isSelectingLogs()) {
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                el.textContent = data.logs;
                if (atBottom) el.scrollTop = el.scrollHeight;
            }
        } catch (e) {}
    }
    
    async function sendManagerCommand() {
        const input = document.getElementById('manager-input');
        const cmd = input.value.trim();
        if (!cmd || !currentServer) return;
        try {
            await fetch('/api/server/' + currentServer + '/input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
            });
            input.value = '';
            setTimeout(refreshManagerLog, 300);
        } catch (err) {
            showToast('Error sending command', 'error');
        }
    }
    
    async function managerAction(action) {
        if (!currentServer) return;
        try {
            const res = await fetch('/api/server/' + currentServer + '/' + action, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Server ' + action + 'ed');
                setTimeout(refreshManagerLog, 600);
            } else {
                showToast(data.error || 'Action failed', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    
    async function loadServerConfig(serverId) {
        try {
            const res = await fetch('/api/server/' + serverId + '/config');
            const data = await res.json();
            document.getElementById('config-cmd').value = data.cmd || '';
            document.getElementById('config-cwd').value = data.cwd || '';
            document.getElementById('config-group').value = data.group || 'default';
            document.getElementById('config-notes').value = data.notes || '';
            document.getElementById('config-auto-restart').checked = data.auto_restart;
            document.getElementById('config-interval').value = data.restart_interval || '1h';
        } catch (e) {}
    }
    
    async function saveServerConfig() {
        if (!currentServer) return;
        try {
            const res = await fetch('/api/server/' + currentServer + '/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cmd: document.getElementById('config-cmd').value,
                    cwd: document.getElementById('config-cwd').value,
                    group: document.getElementById('config-group').value,
                    notes: document.getElementById('config-notes').value,
                    auto_restart: document.getElementById('config-auto-restart').checked,
                    restart_interval: document.getElementById('config-interval').value
                })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Configuration saved!');
            } else {
                showToast(data.error || 'Failed to save', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    
    // ===== FILE MANAGER =====
    async function loadFiles() {
        if (!currentServer) return;
        try {
            const res = await fetch('/api/files/' + currentServer + '?path=' + encodeURIComponent(currentPath || '') + '&_=' + Date.now(), { cache: 'no-store' });
            const data = await res.json();
            
            document.getElementById('file-path').textContent = '/' + currentPath;
            
            let html = '';
            if (currentPath) {
                html += '<div class="file-item" onclick="goUp()">' +
                    '<i class="fas fa-level-up-alt" style="color: var(--primary);"></i>' +
                    '<span>..</span></div>';
            }
            
            (data.files || []).forEach(file => {
                const icon = file.type === 'dir' ? 'fa-folder' : getFileIcon(file.ext);
                const color = file.type === 'dir' ? 'var(--warning)' : 'var(--primary)';
                const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const fullPath = (currentPath ? currentPath + '/' : '') + file.name;
                // folder → navigate, file → select (single click); edit via pencil button
                const clickAction = file.type === 'dir'
                    ? "navigateTo('" + esc(fullPath) + "')"
                    : "selectFile('" + esc(file.name) + "', this.closest('.file-item'))";
                const dlLabel = file.type === 'dir' ? 'Download as ZIP' : 'Download';

                html += '<div class="file-item flex justify-between group">' +
                    '<div class="flex items-center gap-3 flex-1 cursor-pointer min-w-0" onclick="' + clickAction + '">' +
                    '<i class="fas ' + icon + '" style="color: ' + color + ';"></i>' +
                    '<span class="truncate text-sm">' + file.name + '</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-3 text-[10px] opacity-50">' +
                    '<span class="hidden sm:inline">' + file.size + '</span>' +
                    '<span class="hidden md:inline">' + file.modified + '</span>' +
                    '<div class="opacity-0 group-hover:opacity-100 transition flex gap-1">' +
                    (file.type !== 'dir' ? '<button title="Edit" onclick="event.stopPropagation(); editFile(\'' + esc(file.name) + '\')" class="p-1 hover:text-green-400"><i class="fas fa-pen"></i></button>' : '') +
                    '<button title="' + dlLabel + '" onclick="event.stopPropagation(); downloadFile(\'' + esc(file.name) + '\')" class="p-1 hover:text-blue-400"><i class="fas fa-download"></i></button>' +
                    (file.type !== 'dir' ? '<button onclick="event.stopPropagation(); renameFile(\'' + esc(file.name) + '\')" class="p-1 hover:text-yellow-400"><i class="fas fa-edit"></i></button>' : '') +
                    '<button onclick="event.stopPropagation(); deleteFile(\'' + esc(file.name) + '\')" class="p-1 hover:text-red-400"><i class="fas fa-trash"></i></button>' +
                    '</div></div></div>';
            });
            
            document.getElementById('file-list').innerHTML = html || '<div class="text-center py-8 opacity-50">Empty folder</div>';
        } catch (e) {
            document.getElementById('file-list').innerHTML = '<div class="text-center py-8 opacity-50">Failed to load files</div>';
        }
    }
    
    function getFileIcon(ext) {
        const icons = {
            '.py': 'fa-file-code', '.js': 'fa-file-code', '.html': 'fa-file-code', '.css': 'fa-file-code',
            '.json': 'fa-file-code', '.txt': 'fa-file-alt', '.md': 'fa-file-alt', '.log': 'fa-file-alt',
            '.zip': 'fa-file-archive', '.7z': 'fa-file-archive', '.rar': 'fa-file-archive',
            '.tar': 'fa-file-archive', '.gz': 'fa-file-archive', '.tgz': 'fa-file-archive', '.bz2': 'fa-file-archive', '.xz': 'fa-file-archive',
            '.jpg': 'fa-file-image', '.png': 'fa-file-image', '.gif': 'fa-file-image', '.svg': 'fa-file-image',
            '.mp4': 'fa-file-video', '.mp3': 'fa-file-audio', '.pdf': 'fa-file-pdf',
            '.sh': 'fa-terminal', '.bash': 'fa-terminal'
        };
        return icons[ext] || 'fa-file';
    }
    
    function navigateTo(path) {
        clearFileSelection();
        currentPath = path;
        loadFiles();
    }
    
    function goUp() {
        clearFileSelection();
        const parts = currentPath.split('/');
        parts.pop();
        currentPath = parts.join('/');
        loadFiles();
    }
    
    // ── File Selection & Set as Command ──
    let _selectedFile = null;
    let _selectedEl = null;

    function selectFile(filename, el) {
        // একই file আবার click করলে deselect
        if (_selectedFile === filename) {
            clearFileSelection();
            return;
        }
        // আগেরটা deselect
        if (_selectedEl) {
            _selectedEl.style.outline = '';
            _selectedEl.style.background = '';
        }
        _selectedFile = filename;
        _selectedEl = el;
        // highlight
        if (el) {
            el.style.outline = '1px solid var(--primary)';
            el.style.background = 'rgba(0,0,0,0.6)';
        }
        // bar দেখাও
        document.getElementById('set-cmd-filename').textContent = filename;
        document.getElementById('set-cmd-bar').classList.remove('hidden');

        // archive হলে Extract বাটন দেখাও
        const extractBtn = document.getElementById('set-cmd-extract-btn');
        if (extractBtn) {
            const lower = filename.toLowerCase();
            const isArchive = ['.zip', '.7z', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.gz']
                .some(ext => lower.endsWith(ext));
            extractBtn.classList.toggle('hidden', !isArchive);
        }
    }

    function clearFileSelection() {
        if (_selectedEl) {
            _selectedEl.style.outline = '';
            _selectedEl.style.background = '';
        }
        _selectedFile = null;
        _selectedEl = null;
        const bar = document.getElementById('set-cmd-bar');
        if (bar) bar.classList.add('hidden');
        const extractBtn = document.getElementById('set-cmd-extract-btn');
        if (extractBtn) extractBtn.classList.add('hidden');
    }

    async function extractSelectedFile() {
        if (!_selectedFile || !currentServer) return;
        const filename = _selectedFile;
        try {
            showToast('Extracting "' + filename + '"...');
            const res = await fetch('/api/files/' + currentServer + '/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filename, path: currentPath })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Extracted "' + filename + '" successfully!');
            } else {
                showToast(data.error || 'Extract failed', 'error');
            }
            clearFileSelection();
            loadFiles();
        } catch (err) {
            showToast('Extract error: ' + err.message, 'error');
        }
    }

    function applySetAsCommand() {
        if (!_selectedFile) return;
        const fn = _selectedFile;
        let cmd = '';
        if (fn.endsWith('.py'))       cmd = 'python3 ' + fn;
        else if (fn.endsWith('.js'))  cmd = 'node ' + fn;
        else if (fn.endsWith('.ts'))  cmd = 'npx ts-node ' + fn;
        else if (fn.endsWith('.sh'))  cmd = 'bash ' + fn;
        else if (fn.endsWith('.rb'))  cmd = 'ruby ' + fn;
        else if (fn.endsWith('.php')) cmd = 'php ' + fn;
        else                          cmd = './' + fn;

        // Start Command set করো
        const cmdEl = document.getElementById('config-cmd');
        if (cmdEl) cmdEl.value = cmd;
        // Working Directory set করো (current path)
        const cwdEl = document.getElementById('config-cwd');
        if (cwdEl) cwdEl.value = currentPath;

        clearFileSelection();
        // CONFIG tab এ যাও
        switchManagerTab('config');
        showToast('Command set: ' + cmd);
    }
    // ── End File Selection ──

    async function editFile(filename) {
        if (!currentServer) return;
        try {
            const res = await fetch('/api/files/' + currentServer + '/content?filename=' + encodeURIComponent(filename) + '&path=' + encodeURIComponent(currentPath));
            const data = await res.json();
            if (data.error) {
                showToast(data.error, 'error');
                return;
            }
            currentEditFile = { name: filename, path: currentPath };
            document.getElementById('editor-filename').textContent = 'Editing: ' + filename;
            document.getElementById('editor-content').value = data.content;
            resetEditorSearch();
            document.getElementById('fileEditorModal').classList.add('active');
        } catch (err) {
            showToast('Error loading file', 'error');
        }
    }

    function resetEditorSearch() {
        const bar = document.getElementById('editor-search-bar');
        if (bar) bar.classList.add('hidden');
        const searchInput = document.getElementById('editor-search-input');
        const replaceInput = document.getElementById('editor-replace-input');
        if (searchInput) searchInput.value = '';
        if (replaceInput) replaceInput.value = '';
        _editorMatches = [];
        _editorMatchIndex = -1;
        const countEl = document.getElementById('editor-search-count');
        if (countEl) countEl.textContent = '0/0';
    }
    
    async function saveFileContent() {
        if (!currentServer || !currentEditFile.name) return;
        try {
            const res = await fetch('/api/files/' + currentServer + '/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: currentEditFile.name,
                    path: currentEditFile.path,
                    content: document.getElementById('editor-content').value
                })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('File saved successfully!');
                closeModal('fileEditorModal');
            } else {
                showToast(data.error || 'Failed to save', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }

    // ===== FILE EDITOR: SEARCH / REPLACE =====
    let _editorMatches = [];
    let _editorMatchIndex = -1;

    function toggleEditorSearch() {
        const bar = document.getElementById('editor-search-bar');
        const willShow = bar.classList.contains('hidden');
        bar.classList.toggle('hidden');
        if (willShow) {
            document.getElementById('editor-search-input').focus();
            editorSearchUpdate();
        } else {
            _editorMatches = [];
            _editorMatchIndex = -1;
            document.getElementById('editor-search-count').textContent = '0/0';
        }
    }

    function editorSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) editorSearchPrev();
            else editorSearchNext();
        } else if (e.key === 'Escape') {
            toggleEditorSearch();
        }
    }

    function editorSearchUpdate() {
        const query = document.getElementById('editor-search-input').value;
        const textarea = document.getElementById('editor-content');
        const caseSensitive = document.getElementById('editor-search-casesensitive').checked;
        _editorMatches = [];
        _editorMatchIndex = -1;

        if (!query) {
            document.getElementById('editor-search-count').textContent = '0/0';
            return;
        }

        const content = textarea.value;
        const haystack = caseSensitive ? content : content.toLowerCase();
        const needle = caseSensitive ? query : query.toLowerCase();

        let idx = 0;
        while (true) {
            const found = haystack.indexOf(needle, idx);
            if (found === -1) break;
            _editorMatches.push(found);
            idx = found + needle.length;
        }

        document.getElementById('editor-search-count').textContent =
            (_editorMatches.length ? 1 : 0) + '/' + _editorMatches.length;

        if (_editorMatches.length) {
            _editorMatchIndex = 0;
            editorGoToMatch();
        }
    }

    function editorGoToMatch() {
        if (!_editorMatches.length || _editorMatchIndex < 0) return;
        const textarea = document.getElementById('editor-content');
        const query = document.getElementById('editor-search-input').value;
        const start = _editorMatches[_editorMatchIndex];
        const end = start + query.length;
        textarea.focus();
        textarea.setSelectionRange(start, end);

        // scroll match into view (approximate, based on line count)
        const before = textarea.value.substring(0, start);
        const lineNum = before.split('\n').length;
        const totalLines = textarea.value.split('\n').length;
        const lineHeight = textarea.scrollHeight / totalLines;
        textarea.scrollTop = Math.max(0, (lineNum - 3) * lineHeight);

        document.getElementById('editor-search-count').textContent =
            (_editorMatchIndex + 1) + '/' + _editorMatches.length;
    }

    function editorSearchNext() {
        if (!_editorMatches.length) { editorSearchUpdate(); return; }
        _editorMatchIndex = (_editorMatchIndex + 1) % _editorMatches.length;
        editorGoToMatch();
    }

    function editorSearchPrev() {
        if (!_editorMatches.length) { editorSearchUpdate(); return; }
        _editorMatchIndex = (_editorMatchIndex - 1 + _editorMatches.length) % _editorMatches.length;
        editorGoToMatch();
    }

    function editorReplaceOne() {
        if (!_editorMatches.length || _editorMatchIndex < 0) return;
        const textarea = document.getElementById('editor-content');
        const query = document.getElementById('editor-search-input').value;
        const replacement = document.getElementById('editor-replace-input').value;
        const start = _editorMatches[_editorMatchIndex];
        const end = start + query.length;
        const content = textarea.value;
        textarea.value = content.substring(0, start) + replacement + content.substring(end);
        editorSearchUpdate();
    }

    function editorReplaceAll() {
        const query = document.getElementById('editor-search-input').value;
        if (!query) return;
        const replacement = document.getElementById('editor-replace-input').value;
        const caseSensitive = document.getElementById('editor-search-casesensitive').checked;
        const textarea = document.getElementById('editor-content');

        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(escaped, flags);
        const count = (textarea.value.match(regex) || []).length;
        textarea.value = textarea.value.replace(regex, replacement);
        showToast('Replaced ' + count + ' occurrence(s)');
        editorSearchUpdate();
    }

    function editorSyncHighlightScroll() {
        // reserved for future overlay-based highlighting sync
    }

    async function uploadFile(input) {
        if (!input.files.length || !currentServer) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);
        formData.append('path', currentPath || '');
        try {
            const res = await fetch('/api/files/' + currentServer + '/upload', { method: 'POST', body: formData, cache: 'no-store' });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast(data.message || 'File uploaded!');
                // Force fresh listing so size/mtime reflect the new file
                await loadFiles();
                // If editor is open on the same filename, reload content from disk
                if (currentEditFile && currentEditFile.name && data.filename
                    && currentEditFile.name === data.filename) {
                    try {
                        const r2 = await fetch('/api/files/' + currentServer + '/content?filename='
                            + encodeURIComponent(data.filename) + '&path=' + encodeURIComponent(currentPath || '')
                            + '&_=' + Date.now(), { cache: 'no-store' });
                        const d2 = await r2.json();
                        if (d2.content !== undefined) {
                            const ed = document.getElementById('editor-content');
                            if (ed) ed.value = d2.content;
                        }
                    } catch (e) {}
                }
            } else {
                showToast(data.error || 'Upload failed', 'error');
            }
        } catch (err) {
            showToast('Upload error: ' + (err.message || err), 'error');
        }
        input.value = '';
    }
    
    async function deleteFile(filename) {
        if (!confirm('Delete "' + filename + '"?')) return;
        try {
            const res = await fetch('/api/files/' + currentServer + '/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filename, path: currentPath })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Deleted successfully');
            } else {
                showToast(data.error || 'Delete failed', 'error');
            }
            loadFiles();
        } catch (e) {
            showToast('Delete failed', 'error');
        }
    }
    
    async function renameFile(filename) {
        const newName = prompt('New name:', filename);
        if (!newName || newName === filename) return;
        try {
            const res = await fetch('/api/files/' + currentServer + '/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_name: filename, new_name: newName, path: currentPath })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Renamed successfully');
            } else {
                showToast(data.error || 'Rename failed', 'error');
            }
            loadFiles();
        } catch (e) {
            showToast('Rename failed', 'error');
        }
    }
    
    async function downloadFile(filename) {
        if (!currentServer) return;
        window.open('/api/files/' + currentServer + '/download?filename=' + encodeURIComponent(filename) + '&path=' + encodeURIComponent(currentPath));
    }
    
    function showCreateFileModal() {
        const name = prompt('Enter filename:');
        if (!name) return;
        currentEditFile = { name: name, path: currentPath };
        document.getElementById('editor-filename').textContent = 'Creating: ' + name;
        document.getElementById('editor-content').value = '';
        resetEditorSearch();
        document.getElementById('fileEditorModal').classList.add('active');
    }
    
    async function showCreateFolderModal() {
        const name = prompt('Enter folder name:');
        if (!name) return;
        try {
            const res = await fetch('/api/files/' + currentServer + '/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, path: currentPath })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Folder created');
            } else {
                showToast(data.error || 'Failed to create folder', 'error');
            }
            loadFiles();
        } catch (e) {
            showToast('Failed to create folder', 'error');
        }
    }
    
    // ===== TERMINAL (TERMUX-LIKE) =====
    const termHistory = [];
    let termHistIdx = -1;
    let termCwd = window.__BASE_DIR;
    let termRunning = false;
    let tabCompleteMatches = [];
    let tabCompleteIdx = 0;
    let lastTabPrefix = '';

    // ANSI escape code parser → HTML
    function ansiToHtml(text) {
        const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        // Map ANSI codes to HTML spans
        return esc
            .replace(/\x1b\[0m/g, '</span><span>')
            .replace(/\x1b\[1m/g, '<span class="ansi-bold">')
            .replace(/\x1b\[31m/g, '<span class="ansi-red">')
            .replace(/\x1b\[32m/g, '<span class="ansi-green">')
            .replace(/\x1b\[33m/g, '<span class="ansi-yellow">')
            .replace(/\x1b\[34m/g, '<span class="ansi-blue">')
            .replace(/\x1b\[35m/g, '<span class="ansi-magenta">')
            .replace(/\x1b\[36m/g, '<span class="ansi-cyan">')
            .replace(/\x1b\[37m/g, '<span class="ansi-white">')
            .replace(/\x1b\[90m/g, '<span class="ansi-bright-black">')
            .replace(/\x1b\[91m/g, '<span class="ansi-bright-red">')
            .replace(/\x1b\[92m/g, '<span class="ansi-bright-green">')
            .replace(/\x1b\[93m/g, '<span class="ansi-bright-yellow">')
            .replace(/\x1b\[94m/g, '<span class="ansi-bright-blue">')
            .replace(/\x1b\[95m/g, '<span class="ansi-bright-magenta">')
            .replace(/\x1b\[96m/g, '<span class="ansi-bright-cyan">')
            .replace(/\x1b\[97m/g, '<span class="ansi-bright-white">')
            .replace(/\x1b\[[0-9;]*m/g, '');  // strip remaining ANSI
    }

    function termPrint(html, className='') {
        const out = document.getElementById('terminal-output');
        if (!out) return;
        const line = document.createElement('div');
        if (className) line.className = className;
        line.innerHTML = html;
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
    }

    function updateTermPrompt() {
        const el = document.getElementById('term-prompt');
        const badge = document.getElementById('term-cwd-badge');
        let shortCwd = termCwd || '/root';
        const home = '/root';
        if (shortCwd.startsWith(home)) shortCwd = '~' + shortCwd.slice(home.length);
        if (el) el.textContent = 'fx@hosting:' + (shortCwd||'~') + '$';
        if (badge) badge.textContent = shortCwd || '~';
    }

    function terminalPrintBanner() {
        termPrint(`<span style="color:var(--primary);font-weight:bold;">╔══════════════════════════════════════════════════════════╗
║   MAHIR HOSTING TERMINAL  ·  Termux Mode  v5.0.0           ║
║   Type <span style="color:var(--warning);">help</span> for commands  ·  <span style="color:var(--info);">TAB</span> for autocomplete       ║
╚══════════════════════════════════════════════════════════╝</span>`);
    }

    function terminalInit() {
        const out = document.getElementById('terminal-output');
        if (!out) return;
        out.innerHTML = '';
        terminalPrintBanner();
        updateTermPrompt();
    }

    async function executeTerminal() {
        if (termRunning) return;
        const input = document.getElementById('terminal-input');
        const cmd = input.value.trim();
        if (!cmd) return;

        termHistory.unshift(cmd);
        if (termHistory.length > 200) termHistory.pop();
        termHistIdx = -1;
        input.value = '';
        hideTabComplete();

        // Print prompt + command
        const shortCwd = (() => { let c = termCwd || '/root'; const h='/root'; return c.startsWith(h)?'~'+c.slice(h.length):c; })();
        termPrint(`<span style="color:var(--primary);">fx@hosting:<span style="color:var(--info);">${shortCwd}</span>$</span> <span style="color:#fff;">${ansiToHtml(cmd)}</span>`);

        // Handle built-ins
        if (cmd === 'clear' || cmd === 'cls') { terminalClear(); return; }
        if (cmd === 'reset') { terminalReset(); return; }
        if (cmd === 'help') { termPrintHelp(); return; }
        if (cmd === 'history') { termPrintHistory(); return; }
        if (cmd === 'exit') { switchView('dashboard'); return; }

        termRunning = true;
        input.disabled = true;
        // Spinner
        const spinEl = document.createElement('div');
        spinEl.innerHTML = '<span style="color:var(--warning);opacity:.7;">⠋ running...</span>';
        spinEl.id = 'term-spinner';
        document.getElementById('terminal-output').appendChild(spinEl);

        try {
            const res = await fetch('/api/terminal/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd, cwd: termCwd })
            });
            const data = await res.json();
            // Remove spinner
            const sp = document.getElementById('term-spinner');
            if (sp) sp.remove();

            if (data.error && !data.output) {
                termPrint(`<span class="ansi-red">Error: ${ansiToHtml(data.error)}</span>`);
            } else {
                const out = (data.output || '').trimEnd();
                if (out) {
                    const colorClass = (data.returncode && data.returncode !== 0) ? 'ansi-red' : '';
                    termPrint(`<span class="${colorClass}">${ansiToHtml(out)}</span>`);
                }
            }
            // Update CWD
            if (data.cwd && typeof data.cwd === 'string') {
                termCwd = data.cwd;
                updateTermPrompt();
            }
        } catch (err) {
            const sp = document.getElementById('term-spinner');
            if (sp) sp.remove();
            termPrint(`<span class="ansi-red">Network error: ${ansiToHtml(err.message)}</span>`);
        }
        termRunning = false;
        input.disabled = false;
        input.focus();
        const out = document.getElementById('terminal-output');
        if (out) out.scrollTop = out.scrollHeight;
    }

    function termPrintHelp() {
        termPrint(`<span style="color:var(--primary);font-weight:bold;">MAHIR HOSTING Terminal — Available Features</span>
<span style="color:var(--warning);">Navigation:</span>  cd, ls, pwd, find
<span style="color:var(--warning);">System:</span>      ps aux, top, free -h, df -h, uname -a, whoami, uptime
<span style="color:var(--warning);">Network:</span>     netstat, ping, curl, wget
<span style="color:var(--warning);">Files:</span>       cat, nano, vi, mkdir, rm, cp, mv, chmod, chown
<span style="color:var(--warning);">Packages:</span>    pip install, npm install, apt install
<span style="color:var(--warning);">Python:</span>      python3, pip, virtualenv
<span style="color:var(--warning);">Built-ins:</span>   help, history, clear, reset, exit
<span style="color:var(--info);">Shortcuts:</span>   ↑/↓ history · TAB autocomplete · Ctrl+C cancel`);
    }

    function termPrintHistory() {
        if (!termHistory.length) { termPrint('<span class="ansi-bright-black">No history yet.</span>'); return; }
        let html = '<span style="color:var(--primary);">Command History:</span>\n';
        termHistory.slice(0,50).forEach((c,i) => {
            html += `<span class="ansi-bright-black">${String(termHistory.length-i).padStart(4)}  </span><span style="color:#fff;">${ansiToHtml(c)}</span>\n`;
        });
        termPrint(html);
    }

    function terminalClear() {
        const out = document.getElementById('terminal-output');
        if (out) { out.innerHTML = ''; terminalPrintBanner(); }
        document.getElementById('terminal-input').focus();
    }

    function terminalReset() {
        termHistory.length = 0; termHistIdx = -1;
        termCwd = window.__BASE_DIR;
        const out = document.getElementById('terminal-output');
        if (out) out.innerHTML = '';
        terminalPrintBanner();
        updateTermPrompt();
        document.getElementById('terminal-input').focus();
    }

    function termQuickCmd(cmd) {
        const input = document.getElementById('terminal-input');
        if (input) { input.value = cmd; input.focus(); }
        switchView('terminal');
        executeTerminal();
    }

    function handleTerminalKey(e) {
        const input = e.target;
        if (e.key === 'Enter') {
            e.preventDefault();
            hideTabComplete();
            executeTerminal();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (termHistIdx < termHistory.length - 1) {
                termHistIdx++;
                input.value = termHistory[termHistIdx];
                setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (termHistIdx > 0) {
                termHistIdx--;
                input.value = termHistory[termHistIdx];
            } else {
                termHistIdx = -1;
                input.value = '';
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            handleTabCompletion(input);
        } else if (e.key === 'c' && e.ctrlKey) {
            e.preventDefault();
            if (termRunning) {
                termPrint('<span class="ansi-red">^C</span>');
                termRunning = false;
                const inp = document.getElementById('terminal-input');
                if (inp) { inp.disabled = false; inp.value = ''; inp.focus(); }
            } else {
                termPrint(`<span style="color:var(--primary);">fx@hosting:${termCwd}$</span> <span class="ansi-bright-black">^C</span>`);
                input.value = '';
            }
        } else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            terminalClear();
        } else {
            hideTabComplete();
        }
    }

    function handleTerminalInput(e) {
        // Reset tab state on normal input
        tabCompleteMatches = [];
        tabCompleteIdx = 0;
        lastTabPrefix = '';
    }

    async function handleTabCompletion(input) {
        const val = input.value;
        const words = val.split(' ');
        const lastWord = words[words.length - 1];
        if (!lastWord) return;

        // If same prefix repeated, cycle through matches
        if (lastWord === lastTabPrefix && tabCompleteMatches.length > 1) {
            tabCompleteIdx = (tabCompleteIdx + 1) % tabCompleteMatches.length;
            const chosen = tabCompleteMatches[tabCompleteIdx];
            words[words.length - 1] = chosen;
            input.value = words.join(' ');
            showTabComplete(tabCompleteMatches, tabCompleteIdx);
            return;
        }

        lastTabPrefix = lastWord;
        try {
            const res = await fetch('/api/terminal/autocomplete', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ prefix: lastWord, cwd: termCwd })
            });
            const data = await res.json();
            tabCompleteMatches = data.matches || [];
            tabCompleteIdx = 0;
            if (tabCompleteMatches.length === 0) return;
            if (tabCompleteMatches.length === 1) {
                words[words.length - 1] = tabCompleteMatches[0];
                input.value = words.join(' ');
                hideTabComplete();
            } else {
                words[words.length - 1] = tabCompleteMatches[0];
                input.value = words.join(' ');
                showTabComplete(tabCompleteMatches, 0);
            }
        } catch(e) {}
    }

    function showTabComplete(matches, activeIdx) {
        const list = document.getElementById('tab-complete-list');
        if (!list) return;
        const inputEl = document.getElementById('terminal-input');
        const rect = inputEl ? inputEl.getBoundingClientRect() : null;
        if (rect) {
            list.style.left = rect.left + 'px';
            list.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
            list.style.position = 'fixed';
        }
        list.innerHTML = matches.map((m, i) =>
            `<div class="px-3 py-1 cursor-pointer hover:bg-white hover:bg-opacity-10 ${i === activeIdx ? 'font-bold' : 'opacity-70'}" 
              style="${i === activeIdx ? 'color:var(--primary);background:rgba(255,255,255,0.05)' : ''}"
              onclick="tabSelectItem('${m.replace(/'/g,"\\u0027")}')">
              <i class="fas ${m.endsWith('/') ? 'fa-folder' : 'fa-file'} mr-1 text-[9px] opacity-50"></i>${m}</div>`
        ).join('');
        list.classList.remove('hidden');
    }

    function tabSelectItem(item) {
        const input = document.getElementById('terminal-input');
        if (!input) return;
        const words = input.value.split(' ');
        words[words.length - 1] = item;
        input.value = words.join(' ');
        hideTabComplete();
        input.focus();
    }

    function hideTabComplete() {
        const list = document.getElementById('tab-complete-list');
        if (list) list.classList.add('hidden');
    }

    function termKeyInsert(key) {
        const input = document.getElementById('terminal-input');
        if (!input) return;
        input.focus();
        if (key === 'Tab') {
            handleTabCompletion(input);
        } else if (key === 'Ctrl+C') {
            const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true });
            input.dispatchEvent(event);
        } else if (key === 'Ctrl+L') {
            terminalClear();
        } else {
            const pos = input.selectionStart;
            const val = input.value;
            input.value = val.slice(0, pos) + key + val.slice(pos);
            input.selectionStart = input.selectionEnd = pos + key.length;
        }
    }

    function termKeyHistUp() {
        const input = document.getElementById('terminal-input');
        if (!input) return;
        if (termHistIdx < termHistory.length - 1) {
            termHistIdx++;
            input.value = termHistory[termHistIdx];
        }
        input.focus();
    }
    function termKeyHistDown() {
        const input = document.getElementById('terminal-input');
        if (!input) return;
        if (termHistIdx > 0) { termHistIdx--; input.value = termHistory[termHistIdx]; }
        else { termHistIdx = -1; input.value = ''; }
        input.focus();
    }

    // Initialize terminal when switching to it
    // (integrated into main switchView below)
    function terminalInitOnSwitch() {
        const out = document.getElementById('terminal-output');
        if (out && out.children.length === 0) terminalInit();
        setTimeout(() => { const inp = document.getElementById('terminal-input'); if (inp) inp.focus(); }, 100);
    }

    // ===== BULK OPERATIONS =====
    let bulkUploadFile = null;

    function handleBulkFileSelect(input) {
        if (input.files.length > 0) {
            bulkUploadFile = input.files[0];
            document.getElementById('bulk-upload-label').textContent = bulkUploadFile.name;
            document.getElementById('bulk-upload-label').classList.remove('opacity-60');
            document.getElementById('bulk-upload-btn').disabled = false;
        }
    }

    async function executeBulkUpload() {
        if (!bulkUploadFile) { showToast('ফাইল সিলেক্ট করুন', 'error'); return; }
        const prog = document.getElementById('bulk-upload-progress');
        const bar = document.getElementById('bulk-upload-bar');
        const status = document.getElementById('bulk-upload-status');
        prog.classList.remove('hidden');
        bar.style.width = '20%';
        status.textContent = 'Uploading...';
        document.getElementById('bulk-upload-btn').disabled = true;
        try {
            const formData = new FormData();
            formData.append('file', bulkUploadFile);
            const res = await fetch('/api/bulk/upload', { method: 'POST', body: formData });
            const data = await res.json();
            bar.style.width = '100%';
            if (data.status === 'ok') {
                const ok = Object.values(data.results).filter(r => r.status === 'ok').length;
                const fail = data.total - ok;
                status.textContent = `✓ ${ok} server সফল` + (fail ? ` · ✗ ${fail} ব্যর্থ` : '');
                status.style.color = fail ? 'var(--warning)' : 'var(--primary)';
                showToast(`Bulk upload: ${ok}/${data.total} server সফল!`, fail ? 'warning' : 'success');
            } else {
                status.textContent = data.error || 'Failed';
                showToast('Bulk upload ব্যর্থ', 'error');
            }
        } catch (e) {
            status.textContent = 'Error: ' + e.message;
            showToast('Upload error', 'error');
        }
        document.getElementById('bulk-upload-btn').disabled = false;
    }

    async function executeBulkCommand() {
        const cmd = document.getElementById('bulk-cmd-input').value.trim();
        if (!cmd) { showToast('Command দিন', 'error'); return; }
        const resultEl = document.getElementById('bulk-cmd-result');
        resultEl.innerHTML = '<span class="opacity-50">Setting...</span>';
        resultEl.classList.remove('hidden');
        try {
            const res = await fetch('/api/bulk/start_command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                let html = '';
                for (const [sid, r] of Object.entries(data.results)) {
                    const ok = r.status === 'ok';
                    html += `<div style="color:${ok?'var(--primary)':'var(--danger)'};">${ok?'✓':'✗'} <span class="opacity-70">${sid}</span></div>`;
                }
                resultEl.innerHTML = html;
                showToast(`${data.total} server এ command set হয়েছে!`);
            } else {
                resultEl.innerHTML = `<span class="ansi-red">${data.error||'Failed'}</span>`;
                showToast('Bulk command ব্যর্থ', 'error');
            }
        } catch(e) {
            resultEl.innerHTML = `<span class="ansi-red">Error: ${e.message}</span>`;
            showToast('Error', 'error');
        }
    }
    
    // ===== PROCESSES =====
    async function loadProcesses() {
        try {
            const res = await fetch('/api/system/processes');
            const data = await res.json();
            const tbody = document.getElementById('processes-table');
            
            if (data.error) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 opacity-50">' + data.error + '</td></tr>';
                return;
            }
            
            let html = '';
            (data.processes || []).forEach(p => {
                const cpu = p.cpu_percent || 0;
                const ram = p.memory_percent ? p.memory_percent.toFixed(1) : 0;
                const cpuColor = cpu > 50 ? 'var(--danger)' : cpu > 20 ? 'var(--warning)' : 'var(--primary)';
                html += '<tr class="border-b border-opacity-5 hover:bg-white hover:bg-opacity-5 transition" style="border-color: var(--primary);">' +
                    '<td class="p-3 font-mono">' + p.pid + '</td>' +
                    '<td class="p-3">' + (p.name || '-') + '</td>' +
                    '<td class="p-3 font-mono" style="color: ' + cpuColor + '">' + cpu.toFixed(1) + '%</td>' +
                    '<td class="p-3 font-mono">' + ram + '%</td>' +
                    '<td class="p-3"><span class="px-2 py-0.5 rounded text-[9px] status-' + (p.status === 'running' ? 'running' : 'stopped') + '">' + p.status + '</span></td>' +
                    '<td class="p-3 opacity-60">' + (p.create_time || '-') + '</td>' +
                    '<td class="p-3"><button onclick="killProcess(' + p.pid + ')" class="text-red-400 hover:text-red-300 text-xs"><i class="fas fa-skull"></i></button></td>' +
                    '</tr>';
            });
            
            tbody.innerHTML = html || '<tr><td colspan="7" class="text-center py-8 opacity-50">No processes found</td></tr>';
        } catch (e) {
            document.getElementById('processes-table').innerHTML = '<tr><td colspan="7" class="text-center py-8 opacity-50">Failed to load processes</td></tr>';
        }
    }
    
    async function killProcess(pid) {
        if (!confirm('Kill process ' + pid + '?')) return;
        try {
            const res = await fetch('/api/system/kill_process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: pid })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Process killed');
                loadProcesses();
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    // ===== PACKAGES =====
    async function installPackage() {
        const type = document.getElementById('pkg-type').value;
        const name = document.getElementById('pkg-name').value.trim();
        const target = document.getElementById('pkg-target').value;
        if (!name) { showToast('Package name required', 'error'); return; }
        if (!target) { showToast('Select a target server', 'error'); return; }
        
        try {
            const res = await fetch('/api/packages/' + target + '/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, name: name })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Installing ' + name + '...');
                document.getElementById('pkg-name').value = '';
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    async function uninstallPackage() {
        const type = document.getElementById('pkg-uninstall-type').value;
        const name = document.getElementById('pkg-uninstall-name').value.trim();
        const target = document.getElementById('pkg-uninstall-target').value;
        if (!name) { showToast('Package name required', 'error'); return; }
        if (!target) { showToast('Select a target server', 'error'); return; }
        
        try {
            const res = await fetch('/api/packages/' + target + '/uninstall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, name: name })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Uninstalling ' + name + '...');
                document.getElementById('pkg-uninstall-name').value = '';
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    // ===== BACKUPS =====
    async function loadBackups() {
        try {
            const res = await fetch('/api/backup/list');
            const data = await res.json();
            const container = document.getElementById('backup-list');
            
            if (!data.backups || data.backups.length === 0) {
                container.innerHTML = '<div class="p-6 text-center opacity-50">No backups found</div>';
                return;
            }
            
            let html = '';
            data.backups.forEach(b => {
                html += '<div class="flex items-center justify-between p-3 hover:bg-white hover:bg-opacity-5 transition">' +
                    '<div class="flex items-center gap-3">' +
                    '<i class="fas fa-file-archive" style="color: var(--primary);"></i>' +
                    '<div>' +
                    '<div class="text-sm font-mono">' + b.name + '</div>' +
                    '<div class="text-[10px] opacity-50">' + b.date + ' | ' + b.size + '</div>' +
                    '</div></div>' +
                    '<div class="flex gap-2">' +
                    '<button onclick="restoreBackup(\'' + b.name + '\')" class="fx-btn py-1 px-2 text-[10px]"><i class="fas fa-undo"></i> Restore</button>' +
                    '<button onclick="deleteBackup(\'' + b.name + '\')" class="fx-btn fx-btn-danger py-1 px-2 text-[10px]"><i class="fas fa-trash"></i></button>' +
                    '</div></div>';
            });
            container.innerHTML = html;
        } catch (e) {
            document.getElementById('backup-list').innerHTML = '<div class="p-6 text-center opacity-50">Failed to load backups</div>';
        }
    }
    
    async function createBackup() {
        const target = document.getElementById('backup-target').value;
        if (!target) {
            // Backup all
            showToast('Creating backups for all servers...');
            for (const sid in window.__SERVERS) {
                try {
                    await fetch('/api/backup/' + sid + '/create', { method: 'POST' });
                } catch (e) {}
            }
            showToast('All backups created!');
            loadBackups();
            return;
        }
        try {
            const res = await fetch('/api/backup/' + target + '/create', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Backup created: ' + data.backup_name);
                loadBackups();
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    async function restoreBackup(name) {
        const target = prompt('Enter server name to restore to:');
        if (!target) return;
        try {
            const res = await fetch('/api/backup/' + target + '/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backup_name: name })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Backup restored!');
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    async function deleteBackup(name) {
        if (!confirm('Delete backup "' + name + '"?')) return;
        try {
            await fetch('/api/backup/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backup_name: name })
            });
            showToast('Backup deleted');
            loadBackups();
        } catch (e) {
            showToast('Error', 'error');
        }
    }

    // ===== FULL SYSTEM BACKUP / RESTORE =====
    function downloadFullBackup() {
        showToast('Preparing full system backup...');
        window.location.href = '/api/backup/full/download';
    }

    async function restoreFullBackup(file) {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.zip')) {
            showToast('Please select a .zip full backup file', 'error');
            return;
        }
        if (!confirm('This will REPLACE all current servers (files, start command, restart settings, env vars, etc.) with the contents of this backup. Continue?')) {
            document.getElementById('full-restore-input').value = '';
            return;
        }
        const progressEl = document.getElementById('full-restore-progress');
        progressEl.style.display = 'block';
        progressEl.textContent = 'Uploading and restoring... this can take a while for large backups.';
        try {
            const formData = new FormData();
            formData.append('backup_file', file);
            formData.append('replace_all', 'true');
            const res = await fetch('/api/backup/full/restore', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.status === 'ok') {
                progressEl.textContent = 'Restored ' + data.restored + ' server(s) successfully. Reloading...';
                showToast('Full backup restored! (' + data.restored + ' servers)');
                setTimeout(() => location.reload(), 1200);
            } else {
                progressEl.style.display = 'none';
                showToast(data.error || 'Restore failed', 'error');
            }
        } catch (e) {
            progressEl.style.display = 'none';
            showToast('Error restoring backup', 'error');
        } finally {
            document.getElementById('full-restore-input').value = '';
        }
    }
    
    async function backupCurrentServer() {
        if (!currentServer) return;
        try {
            const res = await fetch('/api/backup/' + currentServer + '/create', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Backup created!');
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    // ===== PORTS =====
    async function loadPorts() {
        try {
            const res = await fetch('/api/system/ports');
            const data = await res.json();
            const tbody = document.getElementById('ports-table');
            
            if (data.error) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 opacity-50">' + data.error + '</td></tr>';
                return;
            }
            
            let html = '';
            (data.ports || []).forEach(p => {
                const statusColor = p.status === 'LISTEN' ? 'var(--primary)' : p.status === 'ESTABLISHED' ? 'var(--success)' : 'var(--warning)';
                html += '<tr class="border-b border-opacity-5 hover:bg-white hover:bg-opacity-5 transition" style="border-color: var(--primary);">' +
                    '<td class="p-3 font-mono">' + p.port + '</td>' +
                    '<td class="p-3 font-mono text-[10px]">' + p.address + '</td>' +
                    '<td class="p-3"><span style="color: ' + statusColor + '">' + p.status + '</span></td>' +
                    '<td class="p-3 font-mono">' + (p.pid || '-') + '</td>' +
                    '<td class="p-3">' + (p.name || '-') + '</td></tr>';
            });
            
            tbody.innerHTML = html || '<tr><td colspan="5" class="text-center py-8 opacity-50">No ports found</td></tr>';
        } catch (e) {
            document.getElementById('ports-table').innerHTML = '<tr><td colspan="5" class="text-center py-8 opacity-50">Failed to load ports</td></tr>';
        }
    }
    
    // ===== TELEGRAM =====
    async function deployTelegramBot() {
        const token = document.getElementById('bot-token').value.trim();
        const name = document.getElementById('bot-name').value.trim() || 'TelegramBot';
        if (!token || !token.includes(':')) {
            showToast('Invalid bot token', 'error');
            return;
        }
        try {
            const res = await fetch('/api/telegram/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, name: name })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Telegram bot deployed!');
                document.getElementById('bot-token').value = '';
                document.getElementById('bot-name').value = '';
                setTimeout(() => location.reload(), 500);
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    // ===== ACTIVITY LOG =====
    async function loadActivity() {
        try {
            const res = await fetch('/api/activity');
            const data = await res.json();
            
            const formatLog = (logs) => {
                if (!logs || logs.length === 0) return '<div class="text-center py-4 opacity-50">No activity recorded</div>';
                return logs.map(l => {
                    const color = l.action.includes('Fail') ? 'var(--danger)' : l.action.includes('Delete') ? 'var(--warning)' : 'var(--primary)';
                    return '<div class="log-entry py-1 border-b border-opacity-5" style="border-color: var(--primary);">' +
                        '<span class="log-timestamp">' + l.time + '</span>' +
                        '<span style="color: ' + color + ';">[' + l.action + ']</span> ' +
                        '<span class="opacity-70">' + (l.details || '') + '</span></div>';
                }).join('');
            };
            
            const listEl = document.getElementById('activity-list');
            const fullEl = document.getElementById('activity-full-list');
            
            if (listEl) listEl.innerHTML = formatLog((data.logs || []).slice(0, 10));
            if (fullEl) fullEl.innerHTML = formatLog(data.logs);
        } catch (e) {}
    }
    
    // ===== SETTINGS =====
    async function saveGeneralSettings() {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_title: document.getElementById('set-title').value,
                    site_header: document.getElementById('set-header').value,
                    icon_url: document.getElementById('set-icon').value
                })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Settings saved!');
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    function previewTheme(theme) {
        currentTheme = theme;
        const t = THEMES[theme];
        if (!t) return;
        document.documentElement.style.setProperty('--primary', t.primary);
        document.documentElement.style.setProperty('--secondary', t.secondary);
        document.documentElement.style.setProperty('--accent', t.accent);
        document.documentElement.style.setProperty('--bg', t.bg);
        document.documentElement.style.setProperty('--card-bg', t.card_bg);
        document.documentElement.style.setProperty('--text', t.text);
        document.documentElement.style.setProperty('--danger', t.danger);
        document.documentElement.style.setProperty('--warning', t.warning);
        document.documentElement.style.setProperty('--info', t.info);
        
        document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
        event.target.classList.add('active');
    }
    
    async function saveThemeSettings() {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    theme: currentTheme,
                    font_family: document.getElementById('set-font').value
                })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Theme saved! Reloading...');
                setTimeout(() => location.reload(), 500);
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    async function changePassword() {
        const current = document.getElementById('set-current-pass').value;
        const newPass = document.getElementById('set-new-pass').value;
        const target = document.getElementById('set-pass-target').value;
        if (!current || !newPass) { showToast('Fill all fields', 'error'); return; }
        try {
            const res = await fetch('/api/settings/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current: current, new: newPass, target: target })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Password changed!');
                document.getElementById('set-current-pass').value = '';
                document.getElementById('set-new-pass').value = '';
            } else {
                showToast(data.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    }
    
    async function loadSystemInfo() {
        try {
            const res = await fetch('/api/system/info');
            const data = await res.json();
            if (data.error) {
                showToast(data.error, 'error');
                return;
            }
            let info = '<div class="space-y-2 text-xs">';
            for (const [key, value] of Object.entries(data)) {
                info += '<div class="flex justify-between py-1 border-b border-opacity-10" style="border-color: var(--primary);">' +
                    '<span class="opacity-60 capitalize">' + key.replace(/_/g, ' ') + '</span>' +
                    '<span class="font-mono">' + JSON.stringify(value) + '</span></div>';
            }
            info += '</div>';
            
            // Show in a simple alert-like display
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = '<div class="modal-content" style="max-width: 500px;"><div class="p-4 border-b border-opacity-20 flex justify-between items-center" style="border-color: var(--primary);">' +
                '<h3 class="font-bold" style="color: var(--primary);"><i class="fas fa-info-circle mr-2"></i>System Information</h3>' +
                '<button onclick="this.closest(\'.modal-overlay\').remove()" class="text-lg opacity-50 hover:opacity-100"><i class="fas fa-times"></i></button></div>' +
                '<div class="p-5">' + info + '</div></div>';
            document.body.appendChild(modal);
        } catch (e) {
            showToast('Failed to load system info', 'error');
        }
    }
    
    // ===== MODAL UTILITIES =====
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
        if (id === 'serverManagerModal') {
            if (managerLogInterval) { clearInterval(managerLogInterval); managerLogInterval = null; }
            if (managerOverviewInterval) { clearInterval(managerOverviewInterval); managerOverviewInterval = null; }
            currentServer = null;
            currentPath = '';
        }
    }
    
    // Close modals on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            if (managerLogInterval) clearInterval(managerLogInterval);
            if (managerOverviewInterval) clearInterval(managerOverviewInterval);
        }
        // Ctrl+F / Cmd+F opens search inside the file editor when it's open
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            const editorModal = document.getElementById('fileEditorModal');
            if (editorModal && editorModal.classList.contains('active')) {
                e.preventDefault();
                const bar = document.getElementById('editor-search-bar');
                if (bar.classList.contains('hidden')) toggleEditorSearch();
                document.getElementById('editor-search-input').focus();
                document.getElementById('editor-search-input').select();
            }
        }
    });
    
    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                if (overlay.id === 'serverManagerModal' && managerLogInterval) {
                    clearInterval(managerLogInterval);
                }
                if (overlay.id === 'serverManagerModal' && managerOverviewInterval) {
                    clearInterval(managerOverviewInterval);
                }
            }
        });
    });
    
    // ===== REAL-TIME STATS UPDATE =====
    async function updateStats() {
        try {
            const res = await fetch('/api/system/stats');
            const data = await res.json();
            
            // Update header
            const cpuEl = document.getElementById('header-cpu');
            const ramEl = document.getElementById('header-ram');
            const diskEl = document.getElementById('header-disk');
            if (cpuEl) cpuEl.textContent = data.cpu + '%';
            if (ramEl) ramEl.textContent = data.ram_percent + '%';
            if (diskEl) diskEl.textContent = data.disk_percent + '%';
            
            // Update dashboard
            const dashCpu = document.getElementById('dash-cpu');
            const dashRam = document.getElementById('dash-ram');
            const barCpu = document.getElementById('bar-cpu');
            const barRam = document.getElementById('bar-ram');
            if (dashCpu) dashCpu.textContent = data.cpu + '%';
            if (dashRam) dashRam.textContent = data.ram_percent + '%';
            if (barCpu) barCpu.style.width = data.cpu + '%';
            if (barRam) barRam.style.width = data.ram_percent + '%';
            
            // Update resources section
            const resCpu = document.getElementById('res-cpu');
            const resRam = document.getElementById('res-ram');
            const resDisk = document.getElementById('res-disk');
            const resBarCpu = document.getElementById('res-bar-cpu');
            const resBarRam = document.getElementById('res-bar-ram');
            const resBarDisk = document.getElementById('res-bar-disk');
            if (resCpu) resCpu.textContent = data.cpu + '%';
            if (resRam) resRam.textContent = data.ram_percent + '%';
            if (resDisk) resDisk.textContent = data.disk_percent + '%';
            if (resBarCpu) resBarCpu.style.width = data.cpu + '%';
            if (resBarRam) resBarRam.style.width = data.ram_percent + '%';
            if (resBarDisk) resBarDisk.style.width = data.disk_percent + '%';
        } catch (e) {}
    }
    
    // Update stats every 3 seconds
    setInterval(updateStats, 3000);
    
    // ===== UPTIME COUNTER =====
    let appStartTime = 0;
    function updateUptime() {
        appStartTime++;
        const days = Math.floor(appStartTime / 86400);
        const hours = Math.floor((appStartTime % 86400) / 3600);
        const minutes = Math.floor((appStartTime % 3600) / 60);
        const parts = [];
        if (days > 0) parts.push(days + 'd');
        if (hours > 0) parts.push(hours + 'h');
        parts.push(minutes + 'm');
        
        const el = document.getElementById('settings-uptime');
        if (el) el.textContent = parts.join(' ');
    }
    setInterval(updateUptime, 60000);
    
    // =============================================================================
    // MAHIR HOSTING v5.0 - NEW FEATURES JS
    // =============================================================================

    // ----- HEALTH SCORE -----
    async function loadHealthScores() {
        const container = document.getElementById('health-list');
        if (!container) return;
        try {
            const res = await fetch('/api/health/all');
            const data = await res.json();
            const health = data.health || {};
            const ids = Object.keys(health);
            if (ids.length === 0) {
                container.innerHTML = '<div class="fx-card p-8 text-center opacity-50 text-sm col-span-2"><i class="fas fa-server text-3xl mb-3 block"></i>No servers yet.</div>';
                return;
            }
            let html = '';
            for (const sid of ids) {
                const h = health[sid];
                const color = h.score >= 80 ? 'var(--primary)' : h.score >= 60 ? 'var(--info)' : h.score >= 35 ? 'var(--warning)' : 'var(--danger)';
                html += `
                <div class="fx-card p-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="font-bold text-sm">${sid}</span>
                        <span class="text-xs px-2 py-0.5 rounded font-bold" style="background:${color}22; color:${color}; border:1px solid ${color}50;">${h.status}</span>
                    </div>
                    <div class="flex items-center gap-3 mb-2">
                        <div style="flex:1; height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
                            <div style="width:${h.score}%; height:100%; background:${color}; transition: width 0.5s;"></div>
                        </div>
                        <span class="text-xs font-mono" style="color:${color};">${h.score}/100</span>
                    </div>
                    <div class="text-[10px] opacity-50 mb-3">Crashes (24h): ${h.crashes_24h}</div>
                    <canvas id="chart-${sid}" height="60"></canvas>
                </div>`;
            }
            container.innerHTML = html;
            // Load resource graphs
            for (const sid of ids) {
                loadResourceGraph(sid);
            }
        } catch (e) {
            container.innerHTML = '<div class="text-center opacity-50 py-4 col-span-2">Failed to load health data</div>';
        }
    }

    const _resourceCharts = {};
    async function loadResourceGraph(serverId) {
        try {
            const res = await fetch('/api/resource_history/' + serverId);
            const data = await res.json();
            const hist = data.history || [];
            const canvas = document.getElementById('chart-' + serverId);
            if (!canvas || typeof Chart === 'undefined') return;
            if (_resourceCharts[serverId]) { _resourceCharts[serverId].destroy(); }
            const labels = hist.map(h => h.t);
            const cpuData = hist.map(h => h.cpu);
            const ramData = hist.map(h => h.ram_mb);
            _resourceCharts[serverId] = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'CPU %', data: cpuData, borderColor: '#00ff80', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
                        { label: 'RAM MB', data: ramData, borderColor: '#4d88ff', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#999', font: { size: 9 } } } },
                    scales: {
                        x: { display: false },
                        y: { ticks: { color: '#666', font: { size: 8 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                        y1: { position: 'right', ticks: { color: '#666', font: { size: 8 } }, grid: { display: false } }
                    }
                }
            });
        } catch (e) { /* silent */ }
    }

    // ----- DOMAINS -----
    async function addDomainMapping() {
        const serverId = document.getElementById('domain-server-select').value;
        const domain = document.getElementById('domain-input').value.trim();
        const port = document.getElementById('domain-port-input').value.trim();
        const ssl = document.getElementById('domain-ssl-input').checked;
        if (!serverId || !domain || !port) { showToast('Fill all fields', 'error'); return; }
        try {
            const res = await fetch('/api/domains/' + serverId, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ domain, port, ssl })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('Domain mapped successfully');
                setTimeout(() => location.reload(), 600);
            } else {
                showToast(data.error || 'Failed to map domain', 'error');
            }
        } catch (e) { showToast('Request failed', 'error'); }
    }

    async function deleteDomainMapping(serverId) {
        if (!confirm('Remove domain mapping for "' + serverId + '"?')) return;
        try {
            const res = await fetch('/api/domains/' + serverId + '/delete', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') { showToast('Domain mapping removed'); setTimeout(() => location.reload(), 500); }
        } catch (e) { showToast('Failed', 'error'); }
    }

    async function viewNginxConfig(serverId) {
        try {
            const res = await fetch('/api/domains/' + serverId + '/nginx_config');
            const data = await res.json();
            if (data.config) {
                showCodeModal('Nginx Reverse Proxy Config', data.config);
            } else {
                showToast(data.error || 'No config found', 'error');
            }
        } catch (e) { showToast('Failed to load config', 'error'); }
    }

    function showCodeModal(title, code) {
        const existing = document.getElementById('fx-code-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'fx-code-modal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;  padding:20px;';
        modal.innerHTML = `
            <div style="background: var(--card-bg); border:1px solid var(--primary); border-radius:12px; max-width:700px; width:100%; max-height:80vh; display:flex; flex-direction:column;">
                <div style="padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:var(--primary); font-size:13px;"><i class="fas fa-file-code mr-2"></i>${title}</span>
                    <button onclick="document.getElementById('fx-code-modal').remove()" style="background:none; border:none; color:#888; cursor:pointer; font-size:16px;">&times;</button>
                </div>
                <pre style="flex:1; overflow:auto; padding:16px 20px; margin:0; font-size:11px; color:#ccc; font-family:monospace; white-space:pre-wrap;">${code.replace(/</g,'&lt;')}</pre>
                <div style="padding:12px 20px; border-top:1px solid rgba(255,255,255,0.08);">
                    <button onclick="navigator.clipboard.writeText(${JSON.stringify(code)}); showToast('Copied to clipboard')" class="fx-btn py-2 px-3 text-[11px] w-full">
                        <i class="fas fa-copy"></i> Copy Config
                    </button>
                </div>
            </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    // ----- WEBHOOKS -----
    async function loadWebhookSettings() {
        try {
            const res = await fetch('/api/webhooks');
            const wh = await res.json();
            document.getElementById('wh-discord-url').value = wh.discord_url || '';
            document.getElementById('wh-tg-token').value = wh.telegram_bot_token || '';
            document.getElementById('wh-tg-chatid').value = wh.telegram_chat_id || '';
            document.getElementById('wh-notify-crash').checked = !!wh.notify_on_crash;
            document.getElementById('wh-notify-start').checked = !!wh.notify_on_start;
            document.getElementById('wh-notify-stop').checked = !!wh.notify_on_stop;
            document.getElementById('wh-notify-cpu').checked = !!wh.notify_on_high_cpu;
            document.getElementById('wh-cpu-threshold').value = wh.cpu_alert_threshold || 90;
            document.getElementById('wh-ram-threshold').value = wh.ram_alert_threshold || 90;
        } catch (e) { /* silent */ }
    }

    async function saveWebhookSettings() {
        const payload = {
            discord_url: document.getElementById('wh-discord-url').value.trim(),
            telegram_bot_token: document.getElementById('wh-tg-token').value.trim(),
            telegram_chat_id: document.getElementById('wh-tg-chatid').value.trim(),
            notify_on_crash: document.getElementById('wh-notify-crash').checked,
            notify_on_start: document.getElementById('wh-notify-start').checked,
            notify_on_stop: document.getElementById('wh-notify-stop').checked,
            notify_on_high_cpu: document.getElementById('wh-notify-cpu').checked,
            cpu_alert_threshold: document.getElementById('wh-cpu-threshold').value,
            ram_alert_threshold: document.getElementById('wh-ram-threshold').value
        };
        try {
            const res = await fetch('/api/webhooks', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'ok') showToast('Webhook settings saved');
            else showToast(data.error || 'Failed to save', 'error');
        } catch (e) { showToast('Request failed', 'error'); }
    }

    async function testWebhook(type) {
        try {
            const res = await fetch('/api/webhooks/test', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ type })
            });
            const data = await res.json();
            if (data.status === 'ok') showToast(data.message || 'Test sent');
            else showToast(data.error || 'Test failed', 'error');
        } catch (e) { showToast('Request failed', 'error'); }
    }

function refreshFirewall() {
    fetch('/api/firewall', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(d => {
            const tb = document.getElementById('firewall-tbody');
            if (!tb) return;
            if (!d.banned || d.banned.length === 0) {
                tb.innerHTML = '<tr><td colspan="4" class="py-6 text-center opacity-60">No banned IPs — firewall clean</td></tr>';
                return;
            }
            tb.innerHTML = d.banned.map(b => `<tr>
                <td class="py-2.5 pr-3 font-mono">${b.ip}</td>
                <td class="py-2.5 pr-3">${b.until}</td>
                <td class="py-2.5 pr-3">${b.left_hours}</td>
                <td class="py-2.5">
                    <button onclick="unbanIp('${b.ip}')" class="fx-btn fx-btn-success" style="padding:5px 10px;font-size:10px;">Unban</button>
                </td>
            </tr>`).join('');
        })
        .catch(() => {
            const tb = document.getElementById('firewall-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="4" class="py-6 text-center opacity-60">Failed to load</td></tr>';
        });
}
function unbanIp(ip) {
    if (!confirm('Unban IP ' + ip + '?')) return;
    fetch('/api/firewall', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ip })
    }).then(r => r.json()).then(d => {
        if (d.ok) refreshFirewall();
    });
}

function refreshDevices() {
        const tbody = document.getElementById('devices-tbody');
        const slot = document.getElementById('devices-slotinfo');
        if (!tbody) return;
        (async function() {
            try {
                const res = await fetch('/api/devices');
                const data = await res.json();
                const dev = data.devices || [];
                if (slot) {
                    const pct = dev.filter(d => d.trusted).length;
                    slot.innerHTML = `<i class="fas fa-mobile-alt"></i> Trusted slots: <b>${pct} / ${data.max_trust || 2}</b>` +
                        (pct < (data.max_trust || 2) ? ' &nbsp;·&nbsp; নতুন ফোন login করলে auto trusted হবে (টিক দিলে)' : ' &nbsp;·&nbsp; সব slot ভরতি — নতুন ফোন Approve করতে হবে');
                }
                if (dev.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center opacity-60">কোনো device নেই</td></tr>'; return; }
                let html = '';
                for (const d of dev) {
                    const status = d.trusted
                        ? `<span class="px-2 py-0.5 rounded text-[9px] font-bold" style="background:rgba(52,211,153,.15);color:#6ee7b7;"><i class="fas fa-check-circle mr-1"></i>TRUSTED</span>`
                        : `<span class="px-2 py-0.5 rounded text-[9px] font-bold" style="background:rgba(251,191,36,.15);color:#fcd34d;"><i class="fas fa-hourglass-half mr-1"></i>PENDING</span>`;
                    html += `<tr class="border-b" style="border-color:var(--hairline)">
                        <td class="py-2 pr-3"><div class="font-bold">${d.label}</div><div class="text-[9px] opacity-50">${d.browser}</div></td>
                        <td class="py-2 pr-3 text-[10px]">${d.username}</td>
                        <td class="py-2 pr-3 text-[10px]">${d.first_seen}</td>
                        <td class="py-2 pr-3">${status}</td>
                        <td class="py-2 pr-3 text-right">
                            ${d.pending ? `<button onclick="approveDevice('${d.id}')" class="fx-btn fx-btn-success py-1 px-2 text-[9px]"><i class="fas fa-check"></i> Approve</button>` : ''}
                            <button onclick="removeDevice('${d.id}')" class="fx-btn fx-btn-danger py-1 px-2 text-[9px]"><i class="fas fa-trash"></i> Remove</button>
                        </td>
                    </tr>`;
                }
                tbody.innerHTML = html;
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center opacity-60">Load failed</td></tr>';
            }
        })();
    }

    async function approveDevice(id) {
        try {
            const res = await fetch('/api/devices/' + id + '/approve', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') { showToast('Device approved — এখন password ছাড়া login হবে'); refreshDevices(); }
            else showToast(data.error || 'Approve failed', 'error');
        } catch (e) { showToast('Request failed', 'error'); }
    }
    async function removeDevice(id) {
        if (!confirm('এই device remove করলে তার login-এ আবার password লাগবে।')) return;
        try {
            const res = await fetch('/api/devices/' + id + '/remove', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') { showToast('Device removed'); refreshDevices(); }
            else showToast(data.error || 'Remove failed', 'error');
        } catch (e) { showToast('Request failed', 'error'); }
    }

    // ----- MULTI-USER MANAGEMENT -----
    async function loadUsersList() {
        const container = document.getElementById('users-list');
        if (!container) return;
        try {
            const res = await fetch('/api/users');
            const data = await res.json();
            const users = data.users || {};
            const ids = Object.keys(users);
            if (ids.length === 0) { container.innerHTML = '<div class="opacity-50 text-center py-6 text-sm">No users found</div>'; return; }
            let html = '';
            for (const uid of ids) {
                const u = users[uid];
                html += `
                <div class="fx-card p-4 flex items-center justify-between flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-shield-alt" style="color:var(--primary);"></i>
                        <div>
                            <div class="font-bold text-sm">${u.username} ${u.is_builtin ? '<span class="text-[9px] opacity-40">(built-in)</span>' : ''}</div>
                            <div class="text-[10px] opacity-50">Role: <span style="color:var(--primary);">ADMIN</span> &nbsp;|&nbsp; Created: ${u.created_at}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="resetUserPassword('${uid}', '${u.username}')" class="fx-btn fx-btn-warning py-1.5 px-3 text-[10px]">
                            <i class="fas fa-key"></i> Reset Pass
                        </button>
                        ${!u.is_builtin ? `<button onclick="deleteUser('${uid}', '${u.username}')" class="fx-btn fx-btn-danger py-1.5 px-3 text-[10px]"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </div>`;
            }
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<div class="opacity-50 text-center py-6 text-sm">Failed to load users</div>';
        }
    }

    async function createUser() {
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value.trim();
        if (!username || !password) { showToast('Username and password required', 'error'); return; }
        try {
            const res = await fetch('/api/users/create', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username, password, role: 'admin' })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast('User created successfully');
                document.getElementById('new-user-username').value = '';
                document.getElementById('new-user-password').value = '';
                loadUsersList();
            } else {
                showToast(data.error || 'Failed to create user', 'error');
            }
        } catch (e) { showToast('Request failed', 'error'); }
    }

    async function deleteUser(uid, username) {
        if (!confirm('Delete user "' + username + '"? This cannot be undone.')) return;
        try {
            const res = await fetch('/api/users/' + uid + '/delete', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'ok') { showToast('User deleted'); loadUsersList(); }
            else showToast(data.error || 'Failed', 'error');
        } catch (e) { showToast('Request failed', 'error'); }
    }

    async function resetUserPassword(uid, username) {
        const newPass = prompt('Enter new password for "' + username + '" (min 4 characters):');
        if (!newPass) return;
        if (newPass.length < 4) { showToast('Password too short', 'error'); return; }
        try {
            const res = await fetch('/api/users/' + uid + '/password', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ password: newPass })
            });
            const data = await res.json();
            if (data.status === 'ok') showToast('Password reset successfully');
            else showToast(data.error || 'Failed', 'error');
        } catch (e) { showToast('Request failed', 'error'); }
    }

    // ===== THEME OBJECT =====
    const THEMES = window.__THEMES;

    // ===== SINGLE ROLE - MAHIR HOSTING v6.0 =====
    // Every logged-in session has full access. Show a simple ADMIN badge only.
    document.addEventListener('DOMContentLoaded', function() {
        const roleDiv = document.createElement('div');
        roleDiv.id = 'fx-role-badge';
        roleDiv.style.cssText = `
            position: fixed; top: 12px; right: 16px; z-index: 9999;
            background: rgba(0,255,0,0.15);
            border: 1px solid #00ff00;
            color: #00ff00;
            padding: 4px 12px; border-radius: 20px;
            font-family: monospace; font-size: 11px; font-weight: bold;
            box-shadow: 0 0 12px #00ff0030;
        `;
        roleDiv.innerHTML = `<i class="fas fa-shield-alt" style="margin-right:5px;"></i>ADMIN`;
        document.body.appendChild(roleDiv);
    });

    // ===== PACKAGE INSTALLER (console tab) =====
    function pkgAppend(line) {
        const el = document.getElementById('pkg-log');
        if (!el) return;
        el.textContent = (el.textContent.replace(/^Ready.*$/,'') + '\n' + line).slice(-3000);
        el.scrollTop = el.scrollHeight;
    }
    function pkgQuick(mgr, name) {
        const m = document.getElementById('pkg-c-manager'); if (m) m.value = mgr;
        const n = document.getElementById('pkg-c-name'); if (n) n.value = name;
        installQuickPackage();
    }
    async function installQuickPackage() {
        const sid = typeof currentServer !== 'undefined' ? currentServer : '';
        const mgrEl = document.getElementById('pkg-c-manager');
        const nameEl = document.getElementById('pkg-c-name');
        const mgr = mgrEl ? mgrEl.value : 'pip';
        const name = nameEl ? nameEl.value.trim() : '';
        if (!sid) return showToast('Open a server first', 'error');
        if (!name) return showToast('Package name required', 'error');
        pkgAppend('>>> [PKG] Installing ' + name + ' via ' + mgr + ' ...');
        try {
            const res = await fetch('/api/packages/' + sid + '/install', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({type: mgr, name: name})
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); pkgAppend('ERROR: ' + data.error); return; }
            pkgAppend('>>> [PKG] Install started. Check server console log.');
            showToast('Installing ' + name + '...');
            if (nameEl) nameEl.value = '';
        } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }
    async function uninstallQuickPackage() {
        const sid = typeof currentServer !== 'undefined' ? currentServer : '';
        const mgrEl = document.getElementById('pkg-c-manager');
        const nameEl = document.getElementById('pkg-c-name');
        const mgr = mgrEl ? mgrEl.value : 'pip';
        const name = nameEl ? nameEl.value.trim() : '';
        if (!sid) return showToast('Open a server first', 'error');
        if (!name) return showToast('Package name required', 'error');
        pkgAppend('>>> [PKG] Uninstalling ' + name + ' ...');
        try {
            const res = await fetch('/api/packages/' + sid + '/uninstall', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({type: mgr, name: name})
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            pkgAppend('>>> [PKG] Uninstall started.');
            showToast('Uninstalling ' + name + '...');
            if (nameEl) nameEl.value = '';
        } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }
    async function listQuickPackages() {
        const sid = typeof currentServer !== 'undefined' ? currentServer : '';
        if (!sid) return showToast('Open a server first', 'error');
        pkgAppend('>>> [PKG] Listing installed packages ...');
        try {
            const mgrEl = document.getElementById('pkg-c-manager');
            const res = await fetch('/api/packages/' + sid + '/list?type=' + (mgrEl ? mgrEl.value : 'pip'));
            const data = await res.json();
            pkgAppend('=== INSTALLED ===');
            pkgAppend(String(data.output || 'none').slice(0, 2500));
            pkgAppend('=== END ===');
        } catch (e) { pkgAppend('ERROR: ' + e.message); }
    }
    function pkgSelectAll() {
        const el = document.getElementById('pkg-log');
        if (!el) return;
        const range = document.createRange(); range.selectNodeContents(el);
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
        navigator.clipboard.writeText(el.textContent).then(()=>showToast('Copied!')).catch(()=>{ document.execCommand('copy'); showToast('Copied!'); });
    }

    // ===== EDITOR ACTION ALIASES (onclick handlers) =====
    function editorSelectAll() {
        const ta = document.getElementById('editor-content');
        if (ta) { ta.focus(); ta.setSelectionRange(0, ta.value.length); }
    }
    function editorCopyAll() {
        const ta = document.getElementById('editor-content');
        if (!ta) return;
        const ok = () => showToast('Copied!');
        navigator.clipboard.writeText(ta.value).then(ok).catch(() => {
            ta.focus(); ta.setSelectionRange(0, ta.value.length);
            document.execCommand('copy'); ok();
        });
    }
    function nextMatch() { editorSearchNext(); }
    function prevMatch() { editorSearchPrev(); }
    function replaceNext() { editorReplaceOne(); }
    function replaceAll() { editorReplaceAll(); }
    /* ===== GLOBAL EXPORTS (onclick handlers need globals) ===== */
    window.addDomainMapping = addDomainMapping;
    window.applySetAsCommand = applySetAsCommand;
    window.approveDevice = approveDevice;
    window.backupCurrentServer = backupCurrentServer;
    window.changePassword = changePassword;
    window.clearFileSelection = clearFileSelection;
    window.clearLog = clearLog;
    window.cloneServer = cloneServer;
    window.closeModal = closeModal;
    window.copyEndpointShortUrl = copyEndpointShortUrl;
    window.copyEndpointUrl = copyEndpointUrl;
    window.copyLog = copyLog;
    window.copyManagerLog = copyManagerLog;
    window.createBackup = createBackup;
    window.createServer = createServer;
    window.createUser = createUser;
    window.deleteBackup = deleteBackup;
    window.deleteDomainMapping = deleteDomainMapping;
    window.deleteFile = deleteFile;
    window.deleteUser = deleteUser;
    window.deployTelegramBot = deployTelegramBot;
    window.downloadFile = downloadFile;
    window.downloadFullBackup = downloadFullBackup;
    window.editFile = editFile;
    window.executeBulkCommand = executeBulkCommand;
    window.executeBulkUpload = executeBulkUpload;
    window.executeTerminal = executeTerminal;
    window.extractSelectedFile = extractSelectedFile;
    window.goUp = goUp;
    window.installPackage = installPackage;
    window.installQuickPackage = installQuickPackage;
    window.killProcess = killProcess;
    window.listQuickPackages = listQuickPackages;
    window.loadActivity = loadActivity;
    window.loadBackups = loadBackups;
    window.loadHealthScores = loadHealthScores;
    window.loadPorts = loadPorts;
    window.loadProcesses = loadProcesses;
    window.loadSystemInfo = loadSystemInfo;
    window.logSelectAll = logSelectAll;
    window.managerAction = managerAction;
    window.openCreateServerModal = openCreateServerModal;
    window.openServerManager = openServerManager;
    window.pkgQuick = pkgQuick;
    window.pkgSelectAll = pkgSelectAll;
    window.previewTheme = previewTheme;
    window.refreshDevices = refreshDevices;
    window.refreshFirewall = refreshFirewall;
    window.removeDevice = removeDevice;
    window.renameFile = renameFile;
    window.resetUserPassword = resetUserPassword;
    window.restoreBackup = restoreBackup;
    window.saveFileContent = saveFileContent;
    window.saveGeneralSettings = saveGeneralSettings;
    window.saveServerConfig = saveServerConfig;
    window.saveThemeSettings = saveThemeSettings;
    window.saveWebhookSettings = saveWebhookSettings;
    window.sendManagerCommand = sendManagerCommand;
    window.serverAction = serverAction;
    window.showCreateFileModal = showCreateFileModal;
    window.showCreateFolderModal = showCreateFolderModal;
    window.showToast = showToast;
    window.switchManagerTab = switchManagerTab;
    window.switchView = switchView;
    window.tabSelectItem = tabSelectItem;
    window.termKeyHistDown = termKeyHistDown;
    window.termKeyHistUp = termKeyHistUp;
    window.termKeyInsert = termKeyInsert;
    window.terminalClear = terminalClear;
    window.terminalReset = terminalReset;
    window.testWebhook = testWebhook;
    window.toggleEditorSearch = toggleEditorSearch;
    window.toggleServerLog = toggleServerLog;
    window.toggleSidebar = toggleSidebar;
    window.unbanIp = unbanIp;
    window.uninstallPackage = uninstallPackage;
    window.uninstallQuickPackage = uninstallQuickPackage;
    window.viewNginxConfig = viewNginxConfig;
    window.editorSelectAll = editorSelectAll;
    window.editorCopyAll = editorCopyAll;
    window.nextMatch = nextMatch;
    window.prevMatch = prevMatch;
    window.replaceNext = replaceNext;
    window.replaceAll = replaceAll;
    


// =====================================================================
// MAHIR HOSTING — ENHANCED FEATURES v2.0
// Sound + Upload Loading + Fullscreen Logs + Termux Updater
// =====================================================================

(function() {
    'use strict';

    // ─── SOUND ENGINE ────────────────────────────────────────────────
    const _AudioCtx = window.AudioContext || window.webkitAudioContext;
    let _actx = null;

    function _getCtx() {
        if (!_actx) {
            try { _actx = new _AudioCtx(); } catch(e) { return null; }
        }
        return _actx;
    }

    function playClickSound() {
        const ctx = _getCtx(); if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.12);
        } catch(e) {}
    }

    function playSuccessSound() {
        const ctx = _getCtx(); if (!ctx) return;
        try {
            [523, 659, 784].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = ctx.currentTime + i * 0.1;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                osc.start(t); osc.stop(t + 0.18);
            });
        } catch(e) {}
    }

    function playErrorSound() {
        const ctx = _getCtx(); if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        } catch(e) {}
    }

    // Attach click sound to ALL buttons
    function attachButtonSounds() {
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('button, .nav-item, .tab-btn, .fx-btn, [onclick]');
            if (btn && !btn.dataset.noSound) {
                playClickSound();
            }
        }, true);
    }

    // ─── UPLOAD LOADING MODAL ────────────────────────────────────────
    function showUploadModal(filename) {
        const modal = document.getElementById('upload-loading-modal');
        if (!modal) return;
        document.getElementById('upload-modal-title').textContent = 'Uploading...';
        document.getElementById('upload-modal-file').textContent = filename || 'file';
        document.getElementById('upload-modal-bar').style.width = '0%';
        document.getElementById('upload-modal-pct').textContent = '0%';
        modal.style.display = 'flex';
        // Animate progress bar
        let pct = 0;
        modal._timer = setInterval(() => {
            pct = Math.min(pct + Math.random() * 12, 85);
            document.getElementById('upload-modal-bar').style.width = pct + '%';
            document.getElementById('upload-modal-pct').textContent = Math.floor(pct) + '%';
        }, 200);
    }

    function hideUploadModal(success) {
        const modal = document.getElementById('upload-loading-modal');
        if (!modal) return;
        clearInterval(modal._timer);
        const bar = document.getElementById('upload-modal-bar');
        const pctEl = document.getElementById('upload-modal-pct');
        const title = document.getElementById('upload-modal-title');
        bar.style.width = '100%';
        pctEl.textContent = '100%';
        if (success !== false) {
            title.textContent = '✅ Upload Complete!';
            bar.style.background = 'var(--primary)';
            playSuccessSound();
        } else {
            title.textContent = '❌ Upload Failed!';
            bar.style.background = 'var(--danger)';
            playErrorSound();
        }
        setTimeout(() => {
            modal.style.display = 'none';
            bar.style.background = '';
        }, 1500);
    }

    // Patch the original uploadFile function
    const _origUploadFile = window.uploadFile;
    window.uploadFile = async function(input) {
        if (!input.files.length) return;
        const fname = input.files[0].name;
        showUploadModal(fname);
        try {
            await (_origUploadFile ? _origUploadFile.call(this, input) : _fallbackUploadFile(input));
            hideUploadModal(true);
            if (window.showToast) showToast('✅ ' + fname + ' uploaded!', 'success');
        } catch(e) {
            hideUploadModal(false);
        }
    };

    async function _fallbackUploadFile(input) {
        if (!input.files.length || !window.currentServer) throw new Error('No server');
        const formData = new FormData();
        formData.append('file', input.files[0]);
        formData.append('path', window.currentPath || '');
        const res = await fetch('/api/files/' + window.currentServer + '/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status !== 'ok') throw new Error(data.error || 'Failed');
        if (window.loadFiles) await window.loadFiles();
    }

    // Patch executeBulkUpload for loading modal
    const _origBulkUpload = window.executeBulkUpload;
    window.executeBulkUpload = async function() {
        const fileEl = document.getElementById('bulk-upload-label');
        const fname = fileEl ? fileEl.textContent.trim() : 'bulk upload';
        if (fname && fname !== 'ফাইল বাছাই করুন...') showUploadModal(fname);
        try {
            await (_origBulkUpload ? _origBulkUpload.call(this) : Promise.resolve());
            hideUploadModal(true);
        } catch(e) {
            hideUploadModal(false);
        }
    };

    // ─── FULLSCREEN LOGS ─────────────────────────────────────────────
    let _fsLogsRunning = true;
    let _fsLogsInterval = null;
    let _fsAutoScroll = true;

    window.openFullscreenLogs = function() {
        const modal = document.getElementById('fullscreen-logs-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        // Copy current logs
        const srcLog = document.getElementById('manager-log');
        const destLog = document.getElementById('fs-logs-content');
        if (srcLog && destLog) {
            destLog.textContent = srcLog.textContent;
        }
        document.getElementById('fs-logs-title').textContent = '📋 Logs — ' + (window.currentServer || '?');
        _fsLogsRunning = true;
        _fsAutoScroll = true;
        _startFsLogPolling();
        playClickSound();
    };

    window.closeFullscreenLogs = function() {
        const modal = document.getElementById('fullscreen-logs-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
        }
        _stopFsLogPolling();
        playClickSound();
    };

    window.fsToggleLogsStream = function() {
        const btn = document.getElementById('fs-logs-stop-btn');
        if (_fsLogsRunning) {
            _stopFsLogPolling();
            _fsLogsRunning = false;
            if (btn) btn.innerHTML = '<i class="fas fa-play mr-1"></i>Resume';
        } else {
            _fsLogsRunning = true;
            _startFsLogPolling();
            if (btn) btn.innerHTML = '<i class="fas fa-stop mr-1"></i>Stop';
        }
    };

    window.fsToggleAutoscroll = function() {
        _fsAutoScroll = !_fsAutoScroll;
        const btn = document.getElementById('fs-logs-autoscroll-btn');
        if (btn) {
            btn.style.borderColor = _fsAutoScroll ? 'var(--primary)' : 'var(--hairline)';
            btn.style.color = _fsAutoScroll ? 'var(--primary)' : 'rgba(255,255,255,.4)';
        }
    };

    window.fsClearLogs = async function() {
        if (!window.currentServer) return;
        try {
            await fetch('/api/server/' + window.currentServer + '/clear_logs', { method: 'POST' });
            const el = document.getElementById('fs-logs-content');
            if (el) el.textContent = '— logs cleared —\n';
            if (window.showToast) showToast('Logs cleared');
        } catch(e) {}
    };

    window.fsCopyLogs = function() {
        const el = document.getElementById('fs-logs-content');
        if (!el) return;
        navigator.clipboard.writeText(el.textContent).then(() => {
            if (window.showToast) showToast('Logs copied!');
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = el.textContent;
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            if (window.showToast) showToast('Logs copied!');
        });
    };

    window.fsSendCommand = async function() {
        const inp = document.getElementById('fs-cmd-input');
        if (!inp || !inp.value.trim() || !window.currentServer) return;
        const cmd = inp.value.trim(); inp.value = '';
        try {
            const res = await fetch('/api/server/' + window.currentServer + '/input', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ input: cmd })
            });
            const data = await res.json();
            if (data.status !== 'ok' && window.showToast) showToast(data.error || 'Sent', data.status);
        } catch(e) {}
    };

    function _startFsLogPolling() {
        _stopFsLogPolling();
        _fsLogsInterval = setInterval(async () => {
            if (!_fsLogsRunning || !window.currentServer) return;
            try {
                const res = await fetch('/api/server/' + window.currentServer + '/logs', {cache: 'no-store'});
                const data = await res.json();
                const el = document.getElementById('fs-logs-content');
                if (el && data.logs) {
                    el.textContent = data.logs;
                    const cnt = document.getElementById('fs-log-count');
                    if (cnt) cnt.textContent = data.logs.split('\n').length + ' lines';
                    if (_fsAutoScroll) el.scrollTop = el.scrollHeight;
                }
            } catch(e) {}
        }, 1500);
    }

    function _stopFsLogPolling() {
        if (_fsLogsInterval) { clearInterval(_fsLogsInterval); _fsLogsInterval = null; }
    }

    // ─── TERMUX UPDATER ──────────────────────────────────────────────
    let _termuxServer = null;
    let _termuxPolling = null;
    let _termuxLastLen = 0;

    window.openTermuxUpdater = function(serverId) {
        const modal = document.getElementById('termux-updater-modal');
        if (!modal) return;
        _termuxServer = serverId || window.currentServer || null;
        const label = document.getElementById('termux-target-label');
        if (label) label.textContent = _termuxServer ? '— ' + _termuxServer : '— (select a server first)';
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        playClickSound();
    };

    window.closeTermuxUpdater = function() {
        const modal = document.getElementById('termux-updater-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
        _termuxStopPoll();
        playClickSound();
    };

    window.termuxRun = async function(cmd) {
        if (!_termuxServer) {
            // Try to use currentServer
            _termuxServer = window.currentServer;
            if (!_termuxServer) {
                _termuxLog('⚠️ সার্ভার সিলেক্ট করুন (Server Manager থেকে খুলুন)\n');
                return;
            }
        }
        playClickSound();
        _termuxLog('$ ' + cmd + '\n');
        const statusEl = document.getElementById('termux-status-label');
        const stopBtn = document.getElementById('termux-stop-btn');
        if (statusEl) statusEl.textContent = '⏳ Running...';
        if (stopBtn) stopBtn.classList.remove('hidden');
        try {
            const res = await fetch('/api/server/' + _termuxServer + '/input', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ input: cmd })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                _termuxLog('✅ Command sent — watching logs...\n');
                _termuxStartPoll();
            } else {
                _termuxLog('❌ Error: ' + (data.error || 'unknown') + '\n');
                if (statusEl) statusEl.textContent = 'Error';
                if (stopBtn) stopBtn.classList.add('hidden');
            }
        } catch(e) {
            _termuxLog('❌ Network error: ' + e.message + '\n');
            if (statusEl) statusEl.textContent = 'Error';
            if (stopBtn) stopBtn.classList.add('hidden');
        }
    };

    window.termuxRunCustom = function() {
        const inp = document.getElementById('termux-cmd-input');
        if (!inp || !inp.value.trim()) return;
        const cmd = inp.value.trim();
        inp.value = '';
        window.termuxRun(cmd);
    };

    window.termuxStop = function() {
        _termuxStopPoll();
        const statusEl = document.getElementById('termux-status-label');
        const stopBtn = document.getElementById('termux-stop-btn');
        if (statusEl) statusEl.textContent = 'Stopped';
        if (stopBtn) stopBtn.classList.add('hidden');
        _termuxLog('⏹️ Stopped polling.\n');
        playClickSound();
    };

    window.termuxClearLog = function() {
        const el = document.getElementById('termux-log');
        if (el) el.textContent = '$ cleared\n';
        _termuxLastLen = 0;
    };

    function _termuxLog(text) {
        const el = document.getElementById('termux-log');
        if (!el) return;
        el.textContent += text;
        el.scrollTop = el.scrollHeight;
    }

    function _termuxStartPoll() {
        _termuxStopPoll();
        _termuxLastLen = 0;
        let noChangeCount = 0;
        _termuxPolling = setInterval(async () => {
            if (!_termuxServer) { _termuxStopPoll(); return; }
            try {
                const res = await fetch('/api/server/' + _termuxServer + '/logs', {cache: 'no-store'});
                const data = await res.json();
                if (data.logs) {
                    const lines = data.logs.split('\n');
                    if (lines.length > _termuxLastLen) {
                        const newLines = lines.slice(_termuxLastLen);
                        _termuxLastLen = lines.length;
                        newLines.forEach(l => _termuxLog(l + '\n'));
                        noChangeCount = 0;
                    } else {
                        noChangeCount++;
                        // Stop polling after 15s of no change
                        if (noChangeCount > 10) {
                            _termuxStopPoll();
                            const statusEl = document.getElementById('termux-status-label');
                            const stopBtn = document.getElementById('termux-stop-btn');
                            if (statusEl) statusEl.textContent = '✅ Done';
                            if (stopBtn) stopBtn.classList.add('hidden');
                            playSuccessSound();
                        }
                    }
                }
            } catch(e) {}
        }, 1500);
    }

    function _termuxStopPoll() {
        if (_termuxPolling) { clearInterval(_termuxPolling); _termuxPolling = null; }
    }

    // ─── NOTIFICATION SOUND INTEGRATION ─────────────────────────────
    // Patch showToast to play sounds
    const _origShowToast = window.showToast;
    window.showToast = function(message, type) {
        if (_origShowToast) _origShowToast(message, type);
        if (type === 'error') playErrorSound();
        else if (type === 'success' || !type) playSuccessSound();
    };

    // ─── CSS SPIN ANIMATION ──────────────────────────────────────────
    if (!document.getElementById('mahir-enhanced-css')) {
        const style = document.createElement('style');
        style.id = 'mahir-enhanced-css';
        style.textContent = `
            @keyframes spin { to { transform: rotate(360deg); } }
            #fullscreen-logs-modal { font-family: 'JetBrains Mono', monospace; }
            #fs-logs-content { line-height: 1.5; }
            #termux-log { font-size: 12px; line-height: 1.6; }
            .fx-btn:active { transform: scale(0.97); }
            #upload-loading-modal .fx-card { animation: slideUp 0.2s ease; }
            @keyframes slideUp { from { transform: translateY(20px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        `;
        document.head.appendChild(style);
    }

    // ─── INIT ────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachButtonSounds);
    } else {
        attachButtonSounds();
    }

    // Export
    window.playClickSound = playClickSound;
    window.playSuccessSound = playSuccessSound;
    window.playErrorSound = playErrorSound;
    window.showUploadModal = showUploadModal;
    window.hideUploadModal = hideUploadModal;

})();
