// Firebase Configuration
const DEFAULT_FIREBASE_URL = "https://tobalscandb-default-rtdb.firebaseio.com/";

let mockCards = [];
let mockAgents = [];
let currentUser = localStorage.getItem('loggedUser') || null;
let firebaseDbUrl = localStorage.getItem('firebaseUrl') || DEFAULT_FIREBASE_URL;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const totalCountEl = document.getElementById('total-count');
const foldersGrid = document.getElementById('folders-grid');
const foldersContainer = document.getElementById('folders-container');
const folderDetailView = document.getElementById('folder-detail-view');
const currentFolderNameEl = document.getElementById('current-folder-name');
const cardsTbody = document.getElementById('cards-tbody');
const agentsGrid = document.getElementById('agents-grid');
const loggedUserEl = document.getElementById('logged-user');
const userGreetingEl = document.getElementById('user-greeting');
const viewSections = document.querySelectorAll('.view-section');
const actionCards = document.querySelectorAll('.action-card');
const mainSearchInput = document.getElementById('main-search-input');
const mainSearchBtn = document.getElementById('main-search-btn');
const searchResultsContainer = document.getElementById('search-results-container');
const settingsForm = document.getElementById('settings-form');
const settingsMsg = document.getElementById('settings-msg');
const firebaseInput = document.getElementById('new-firebase-url');

// --- Initialization ---
if (currentUser) {
    showDashboard();
}

async function showDashboard() {
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    loggedUserEl.textContent = currentUser;
    userGreetingEl.textContent = currentUser;
    
    // Admin restriction
    const isAdmin = currentUser.toLowerCase() === 'admin';
    const agentsCard = document.getElementById('agents-card');
    if (agentsCard) agentsCard.style.display = isAdmin ? 'flex' : 'none';

    fetchCards();
    fetchAgents();
}

// Fetch Data
async function fetchCards() {
    try {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        const res = await fetch(`${url}/records.json`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                let allCards = Object.values(data);
                if (currentUser.toLowerCase() !== 'admin') {
                    mockCards = allCards.filter(c => c.agent && c.agent.toLowerCase() === currentUser.toLowerCase());
                } else {
                    mockCards = allCards;
                }
                mockCards.sort((a, b) => new Date(b.date) - new Date(a.date));
            } else {
                mockCards = [];
            }
            totalCountEl.textContent = mockCards.length;
            renderFolders();
        }
    } catch (e) { console.error(e); }
}

async function fetchAgents() {
    try {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        const res = await fetch(`${url}/agents.json`);
        if (res.ok) {
            const data = await res.json();
            mockAgents = data ? Object.values(data) : [];
            renderAgents();
        }
    } catch (e) { console.error(e); }
}

// Navigation
actionCards.forEach(card => {
    card.addEventListener('click', () => {
        const target = card.getAttribute('data-target');
        switchView(target);
    });
});

function switchView(viewId) {
    viewSections.forEach(s => s.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    if (viewId === 'settings-view') {
        firebaseInput.value = firebaseDbUrl;
    }
}

function showHome() {
    switchView('home-view');
}

function showFolders() {
    foldersContainer.style.display = 'block';
    folderDetailView.style.display = 'none';
    switchView('folders-view');
}

// Rendering
function renderFolders() {
    foldersGrid.innerHTML = '';
    const folders = {};
    mockCards.forEach(c => {
        const p = c.packet || 'Sans Dossier';
        if (!folders[p]) folders[p] = { name: p, count: 0 };
        folders[p].count++;
    });

    Object.values(folders).forEach(f => {
        const div = document.createElement('div');
        div.className = 'action-card';
        div.style.padding = '20px';
        div.style.borderRadius = '18px';
        div.innerHTML = `
            <ion-icon name="folder" style="font-size: 2rem;"></ion-icon>
            <div style="font-weight: bold; font-size: 0.9rem;">${f.name}</div>
            <div style="font-size: 0.7rem; color: gray;">${f.count} codes</div>
        `;
        div.onclick = () => renderFolderDetails(f.name);
        foldersGrid.appendChild(div);
    });
}

function renderFolderDetails(folderName) {
    foldersContainer.style.display = 'none';
    folderDetailView.style.display = 'block';
    currentFolderNameEl.textContent = folderName;
    
    const filtered = mockCards.filter(c => c.packet === folderName);
    cardsTbody.innerHTML = filtered.map(c => renderRecordRow(c)).join('');
}

function renderRecordRow(c) {
    const imgSource = c.imageBase64 || '';
    return `
        <div class="record-row">
            ${imgSource ? `<img src="${imgSource}" onclick="openImageModal('${imgSource}')">` : '<div style="width:60px; height:40px; background:#eee; border-radius:8px;"></div>'}
            <div class="record-info">
                <div class="record-code">${c.code}</div>
                <div class="record-meta">${c.brand} • ${c.amount} DA • ${c.date}</div>
            </div>
            <ion-icon name="chevron-forward-outline" style="color: #ccc;"></ion-icon>
        </div>
    `;
}

function renderAgents() {
    agentsGrid.innerHTML = mockAgents.map(a => `
        <div class="action-card" style="flex-direction: row; padding: 15px 25px; justify-content: flex-start; text-align: left; width: 100%;">
            <ion-icon name="person-circle" style="font-size: 2rem;"></ion-icon>
            <div style="flex: 1; margin-left: 15px;">
                <div style="font-weight: bold;">${a.name}</div>
                <div style="font-size: 0.8rem; color: gray;">PIN: ${a.pin}</div>
            </div>
        </div>
    `).join('');
}

// Search
mainSearchBtn.onclick = () => {
    const q = mainSearchInput.value.trim();
    if (!q) return;
    const results = mockCards.filter(c => c.code.includes(q));
    searchResultsContainer.innerHTML = results.length ? results.map(c => renderRecordRow(c)).join('') : '<p style="padding:20px; text-align:center; color:gray;">Aucun résultat</p>';
};

// Login
loginForm.onsubmit = (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    
    if (u === 'admin' && p === 'admin') {
        currentUser = 'Admin';
        localStorage.setItem('loggedUser', currentUser);
        showDashboard();
    } else {
        const agent = mockAgents.find(a => a.name.toLowerCase() === u.toLowerCase() && a.pin === p);
        if (agent) {
            currentUser = agent.name;
            localStorage.setItem('loggedUser', currentUser);
            showDashboard();
        } else {
            loginError.textContent = "Identifiants incorrects";
        }
    }
};

// Logout
logoutBtn.onclick = () => {
    localStorage.removeItem('loggedUser');
    location.reload();
};

// Settings
settingsForm.onsubmit = (e) => {
    e.preventDefault();
    const val = firebaseInput.value.trim();
    if (val) {
        firebaseDbUrl = val.endsWith('/') ? val : val + '/';
        localStorage.setItem('firebaseUrl', firebaseDbUrl);
        settingsMsg.textContent = "Mis à jour avec succès !";
        settingsMsg.style.color = "green";
        fetchCards();
    }
};

// Image Modal
window.openImageModal = (src) => {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('enlarged-image');
    img.src = src;
    modal.style.display = 'flex';
};

// Global helpers
window.showHome = showHome;
window.showFolders = showFolders;
