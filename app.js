// Firebase Configuration
const DEFAULT_FIREBASE_URL = "https://tobalscandb-default-rtdb.firebaseio.com/";

let mockCards = [];
let mockAgents = [];
let isFetchingCards = false;
let currentUser = localStorage.getItem('loggedUser') || null;
function cleanFirebaseUrl(url) {
    if (!url) return DEFAULT_FIREBASE_URL;
    let cleaned = url.trim();
    // Fix common copy-paste errors (double https, etc)
    if (cleaned.includes('https://') && cleaned.lastIndexOf('https://') > 0) {
        cleaned = cleaned.substring(cleaned.lastIndexOf('https://'));
    }
    if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
    if (!cleaned.endsWith('/')) cleaned += '/';
    return cleaned;
}

let firebaseDbUrl = cleanFirebaseUrl(localStorage.getItem('firebaseUrl') || DEFAULT_FIREBASE_URL);

document.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized");
    
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

    // --- Core Functions ---
    
    async function fetchCards() {
        if (isFetchingCards) return;
        isFetchingCards = true;
        try {
            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            // Use Firebase API if URL contains firebaseio, otherwise use local API
            const isFirebase = url.includes('firebaseio.com');
            const fetchUrl = isFirebase ? `${url}/records.json` : `${url}/api/cards`;
            
            const res = await fetch(fetchUrl);
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    if (Array.isArray(data)) {
                        mockCards = data;
                    } else {
                        // Firebase format: { "key1": { ... }, "key2": { ... } }
                        mockCards = Object.keys(data).map(key => ({
                            ...data[key],
                            fbKey: key
                        }));
                    }

                    if (currentUser && currentUser.toLowerCase() !== 'admin') {
                        mockCards = mockCards.filter(c => c.agent && c.agent.toLowerCase() === currentUser.toLowerCase());
                    }
                    mockCards.sort((a, b) => new Date(b.date) - new Date(a.date));
                } else {
                    mockCards = [];
                }
                if (totalCountEl) totalCountEl.textContent = mockCards.length;
                renderFolders();
            }
        } catch (e) { console.error("Fetch Error:", e); }
        finally { isFetchingCards = false; }
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
        } catch (e) { console.error("Agents Error:", e); }
    }

    function switchView(viewId) {
        viewSections.forEach(s => s.classList.remove('active'));
        const target = document.getElementById(viewId);
        if (target) {
            target.classList.add('active');
            if (viewId === 'home-view') {
                foldersContainer.style.display = 'block';
                folderDetailView.style.display = 'none';
            }
        }
        
        if (viewId === 'settings-view' && firebaseInput) {
            firebaseInput.value = firebaseDbUrl;
        }
    }

    // --- Simple Router ---
    
    function router() {
        if (!currentUser) return;
        
        const hash = window.location.hash || '#home';
        
        if (hash === '#home') {
            switchView('home-view');
        } else if (hash === '#folders') {
            window.showFolders();
        } else if (hash.startsWith('#folder/')) {
            const folderName = decodeURIComponent(hash.replace('#folder/', ''));
            openFolder(folderName);
        } else if (hash === '#search') {
            switchView('search-view');
        } else if (hash === '#agents') {
            switchView('agents-view');
        } else if (hash === '#settings') {
            switchView('settings-view');
        }
    }

    function openFolder(name) {
        if (isFetchingCards) {
            // Wait for data if still fetching
            setTimeout(() => openFolder(name), 100);
            return;
        }
        
        if (!mockCards || mockCards.length === 0) {
            console.log("No cards available to open folder");
            switchView('folders-view');
            return;
        }
        
        switchView('folders-view');
        
        // Immediate UI update
        if (foldersContainer) foldersContainer.style.display = 'none';
        if (folderDetailView) folderDetailView.style.display = 'block';
        if (currentFolderNameEl) currentFolderNameEl.textContent = name;
        
        // Filter logic must match renderFolders (handling 'Sans Dossier')
        const filtered = mockCards.filter(c => (c.packet || 'Sans Dossier') === name);
        if (cardsTbody) {
            if (filtered.length > 0) {
                cardsTbody.innerHTML = filtered.map(c => renderRecordRow(c)).join('');
            } else {
                cardsTbody.innerHTML = '<p style="padding:20px; text-align:center; color:gray;">Aucun code dans ce dossier</p>';
            }
        }
        console.log(`Folder "${name}" opened with ${filtered.length} cards`);
    }

    window.addEventListener('hashchange', router);

    function renderFolders() {
        if (!foldersGrid) return;
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
            
            const isAdmin = currentUser && currentUser.toLowerCase() === 'admin';
            
            div.innerHTML = `
                ${isAdmin ? `<div class="folder-delete-btn" onclick="window.confirmDeletePacket(event, '${f.name}')"><ion-icon name="trash-outline" style="font-size: 1.5rem;"></ion-icon></div>` : ''}
                <ion-icon name="folder" style="font-size: 3.5rem;"></ion-icon>
                <div style="font-weight: 900; font-size: 1.2rem; margin-top:10px;">${f.name}</div>
                <div style="font-size: 0.9rem; color: gray;">${f.count} codes total</div>
            `;
            div.onclick = (e) => {
                if (e.target.closest('.folder-delete-btn')) return;
                const targetHash = `#folder/${encodeURIComponent(f.name)}`;
                window.location.hash = targetHash;
                openFolder(f.name); // Call directly for immediate response
            };
            foldersGrid.appendChild(div);
        });
    }

    function renderRecordRow(c) {
        const imgSource = c.imageBase64 || '';
        const isAdmin = currentUser && currentUser.toLowerCase() === 'admin';
        return `
            <div class="record-row">
                ${imgSource ? `<img src="${imgSource}" onclick="window.openImageModal('${imgSource}')">` : '<div style="width:60px; height:40px; background:#eee; border-radius:8px; display:flex; align-items:center; justify-content:center;"><ion-icon name="image-outline" style="color:#ccc"></ion-icon></div>'}
                <div class="record-info">
                    <div class="record-code">${c.code}</div>
                    <div class="record-meta">${c.brand || 'MOBILIS'} • ${c.amount || '0'} DA • ${c.date || ''}</div>
                </div>
                ${isAdmin ? `
                    <div class="btn-delete" onclick="window.confirmDeleteCard('${c.fbKey || ''}', '${c.code}')">
                        <ion-icon name="trash-outline"></ion-icon>
                    </div>
                ` : ''}
                <ion-icon name="chevron-forward-outline" style="color: #ccc;"></ion-icon>
            </div>
        `;
    }

    function renderAgents() {
        if (!agentsGrid) return;
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

    function showDashboard() {
        if (!loginScreen || !dashboardScreen) return;
        loginScreen.classList.remove('active');
        dashboardScreen.classList.add('active');
        if (loggedUserEl) loggedUserEl.textContent = currentUser;
        if (userGreetingEl) userGreetingEl.textContent = currentUser;
        
        const isAdmin = currentUser && currentUser.toLowerCase() === 'admin';
        const agentsCard = document.getElementById('agents-card');
        if (agentsCard) agentsCard.style.display = isAdmin ? 'flex' : 'none';

        fetchCards().then(() => router());
        fetchAgents();
    }

    // --- Listeners ---

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
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
                    if (loginError) loginError.textContent = "Identifiants incorrects";
                }
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('loggedUser');
            location.reload();
        });
    }

    actionCards.forEach(card => {
        card.addEventListener('click', () => {
            const target = card.getAttribute('data-target');
            if (target) {
                const route = target.replace('-view', '');
                window.location.hash = route === 'home' ? 'home' : route;
            }
        });
    });

    if (mainSearchBtn) {
        mainSearchBtn.addEventListener('click', () => {
            const q = mainSearchInput.value.trim();
            if (!q) return;
            const results = mockCards.filter(c => c.code.includes(q));
            if (searchResultsContainer) {
                searchResultsContainer.innerHTML = results.length ? results.map(c => renderRecordRow(c)).join('') : '<p style="padding:20px; text-align:center; color:gray;">Aucun résultat</p>';
            }
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = firebaseInput.value.trim();
            if (val) {
                firebaseDbUrl = cleanFirebaseUrl(val);
                localStorage.setItem('firebaseUrl', firebaseDbUrl);
                if (firebaseInput) firebaseInput.value = firebaseDbUrl; // Update input field
                if (settingsMsg) {
                    settingsMsg.textContent = "Mis à jour avec succès !";
                    settingsMsg.style.color = "green";
                }
                fetchCards();
            }
        });
    }

    // Global Modal Function
    window.openImageModal = (src) => {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('enlarged-image');
        if (modal && img) {
            img.src = src;
            modal.style.display = 'flex';
        }
    };

    // --- Deletion Logic ---

    window.confirmDeleteCard = async (fbKey, code) => {
        if (!confirm(`Voulez-vous vraiment supprimer le code ${code} ?`)) return;
        
        try {
            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            const isFirebase = url.includes('firebaseio.com');
            
            let res;
            if (!isFirebase) {
                res = await fetch(`${url}/api/cards?code=${code}`, { method: 'DELETE' });
            } else if (fbKey) {
                res = await fetch(`${url}/records/${fbKey}.json`, { method: 'DELETE' });
            }

            if (res && res.ok) {
                alert("Supprimé avec succès");
                fetchCards();
            } else {
                alert("Erreur lors de la suppression");
            }
        } catch (e) { console.error(e); }
    };

    window.confirmDeletePacket = async (event, name) => {
        event.stopPropagation();
        if (!confirm(`Voulez-vous supprimer tout le dossier "${name}" (${mockCards.filter(c => c.packet === name).length} codes) ?`)) return;

        try {
            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            const isFirebase = url.includes('firebaseio.com');

            if (!isFirebase) {
                const res = await fetch(`${url}/api/packets?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
                if (res.ok) {
                    alert("Dossier supprimé");
                    fetchCards();
                }
            } else {
                // Firebase: delete cards one by one (or filtered if structure allowed, but REST DELETE is by key)
                const toDelete = mockCards.filter(c => c.packet === name);
                for (const c of toDelete) {
                    if (c.fbKey) {
                        await fetch(`${url}/records/${c.fbKey}.json`, { method: 'DELETE' });
                    }
                }
                alert("Dossier supprimé");
                fetchCards();
            }
        } catch (e) { console.error(e); }
    };

    // Global Home navigation
    window.showHome = () => {
        window.location.hash = '#home';
    };
    window.showFolders = () => {
        window.location.hash = '#folders';
        // Ensure UI state is reset
        if (foldersContainer) foldersContainer.style.display = 'block';
        if (folderDetailView) folderDetailView.style.display = 'none';
    };

    // Start App
    if (currentUser) {
        showDashboard();
    } else {
        // Just in case, fetch agents to allow agent login
        fetchAgents();
    }
});
