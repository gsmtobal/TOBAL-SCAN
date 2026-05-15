// Firebase Configuration
const DEFAULT_FIREBASE_URL = "https://tobalscandb-default-rtdb.firebaseio.com/";

// Auto-detect local server
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const LOCAL_SERVER_URL = isLocal ? `http://${window.location.hostname}:5000/` : "http://localhost:5000/";

let mockCards = [];
let mockAgents = [];
let isFetchingCards = false;
let currentUser = localStorage.getItem('loggedUser') || null;

// --- IndexedDB Cache ---
const DB_NAME = 'TobalScanDB';
const STORE_NAME = 'cardsCache';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToCache(data) {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, 'mockCards');
    } catch (e) { console.error("Cache save error", e); }
}

async function loadFromCache() {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get('mockCards');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
}

function cleanFirebaseUrl(url) {
    if (!url) return DEFAULT_FIREBASE_URL;
    let cleaned = url.trim();
    if (cleaned.includes('https://') && cleaned.lastIndexOf('https://') > 0) {
        cleaned = cleaned.substring(cleaned.lastIndexOf('https://'));
    }
    if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
    if (!cleaned.endsWith('/')) cleaned += '/';
    return cleaned;
}

// If on local, default to local server instead of a placeholder Firebase
let storedUrl = localStorage.getItem('firebaseUrl');
let firebaseDbUrl = isLocal && !storedUrl ? LOCAL_SERVER_URL : cleanFirebaseUrl(storedUrl || DEFAULT_FIREBASE_URL);

document.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized");

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.log('SW Error', err));
    }
    
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

        if (mockCards.length === 0) {
            const cachedData = await loadFromCache();
            if (cachedData && cachedData.length > 0) {
                mockCards = cachedData;
                if (currentUser && currentUser.toLowerCase() !== 'admin') {
                    mockCards = mockCards.filter(c => c.agent && c.agent.toLowerCase() === currentUser.toLowerCase());
                }
                if (totalCountEl) totalCountEl.textContent = mockCards.length;
                renderFolders();
            } else {
                if (totalCountEl) totalCountEl.innerHTML = '<ion-icon name="sync" class="spin"></ion-icon>';
                if (foldersGrid) foldersGrid.innerHTML = '<div style="text-align:center; padding: 30px; color: gray;"><ion-icon name="sync" class="spin" style="font-size: 2.5rem;"></ion-icon><p style="margin-top: 10px; font-weight: bold;">جاري تحميل البيانات من الخادم...</p></div>';
            }
        }

        try {
            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            // Use Firebase API if URL contains firebaseio, otherwise use local API
            const isFirebase = url.includes('firebaseio.com');
            const fetchUrl = isFirebase ? `${url}/records.json` : `${url}/api/cards`;
            
            const res = await fetch(fetchUrl);
            if (res.ok) {
                const data = await res.json();
                let newCards = [];
                if (data) {
                    if (Array.isArray(data)) {
                        newCards = data;
                    } else {
                        // Firebase format: { "key1": { ... }, "key2": { ... } }
                        newCards = Object.keys(data).map(key => ({
                            ...data[key],
                            fbKey: key
                        }));
                    }
                    newCards.sort((a, b) => new Date(b.date) - new Date(a.date));
                }
                
                // Save to IndexedDB Cache
                saveToCache(newCards);

                if (currentUser && currentUser.toLowerCase() !== 'admin') {
                    newCards = newCards.filter(c => c.agent && c.agent.toLowerCase() === currentUser.toLowerCase());
                }
                
                mockCards = newCards;
                if (totalCountEl) totalCountEl.textContent = mockCards.length;
                renderFolders();
                
                // Auto refresh opened folder
                if (folderDetailView && folderDetailView.style.display === 'block') {
                    const currentFolder = currentFolderNameEl ? currentFolderNameEl.textContent : null;
                    if (currentFolder) openFolder(currentFolder, true);
                }
            }
        } catch (e) { 
            console.error("Fetch Error:", e);
            if (mockCards.length === 0 && totalCountEl) {
                totalCountEl.textContent = "Erreur";
                if (foldersGrid) foldersGrid.innerHTML = '<div style="text-align:center; color: red;">فشل الاتصال بقاعدة البيانات</div>';
            }
        }
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
            switchView('folders-view');
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

    function openFolder(name, silentUpdate = false) {
        if (isFetchingCards && !silentUpdate) {
            // Wait for data if still fetching
            setTimeout(() => openFolder(name), 100);
            return;
        }
        
        if (!mockCards || mockCards.length === 0) {
            console.log("No cards available to open folder");
            if (!silentUpdate) switchView('folders-view');
            return;
        }
        
        if (!silentUpdate) {
            switchView('folders-view');
            // Immediate UI update
            if (foldersContainer) foldersContainer.style.display = 'none';
            if (folderDetailView) folderDetailView.style.display = 'block';
            if (currentFolderNameEl) currentFolderNameEl.textContent = name;
        }
        
        const isAdmin = currentUser && currentUser.toLowerCase() === 'admin';
        const verifyBtn = document.getElementById('verify-folder-btn');
        if (verifyBtn) {
            verifyBtn.style.display = isAdmin ? 'flex' : 'none';
        }
        
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
        const escapedCode = (c.code || '').replace(/'/g, "\\'");
        const escapedFbKey = (c.fbKey || '').replace(/'/g, "\\'");
        return `
            <div class="record-card" id="card-${escapedCode}">
                <div class="record-card-header">
                    <div class="record-info">
                        <div class="record-code" id="code-display-${escapedCode}">${c.code}</div>
                        <div class="record-meta">${c.brand || 'MOBILIS'} • ${c.amount || '0'} DA • ${c.date || ''}</div>
                    </div>
                    <div class="record-actions">
                        ${isAdmin ? `
                            <button class="btn-action btn-edit" onclick="window.editCode('${escapedCode}')" title="تعديل">
                                <ion-icon name="create-outline" style="font-size:1.3rem;"></ion-icon>
                            </button>
                            <button class="btn-action btn-delete" onclick="window.confirmDeleteCard('${escapedFbKey}', '${escapedCode}')" title="حذف">
                                <ion-icon name="trash-outline" style="font-size:1.3rem;"></ion-icon>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="record-card-image">
                    ${imgSource ? `<img src="${imgSource}" onclick="window.openImageModal('${imgSource}')">` : '<div class="no-image-placeholder"><ion-icon name="image-outline"></ion-icon></div>'}
                </div>
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
                return; // Stop here
            }
            
            const agent = mockAgents.find(a => a.name.toLowerCase() === u.toLowerCase() && a.pin === p);
            if (agent) {
                currentUser = agent.name;
                localStorage.setItem('loggedUser', currentUser);
                showDashboard();
            } else {
                if (loginError) loginError.textContent = "Identifiants incorrects";
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

    // --- Edit Code Logic ---
    window.editCode = (oldCode) => {
        const codeEl = document.getElementById(`code-display-${oldCode}`);
        if (!codeEl) return;
        
        const currentCode = codeEl.textContent;
        codeEl.innerHTML = `
            <input type="text" class="record-code-input" id="code-input-${oldCode}" value="${currentCode}">
        `;
        
        // Replace edit button with save button
        const card = codeEl.closest('.record-card');
        const editBtn = card.querySelector('.btn-edit');
        if (editBtn) {
            editBtn.className = 'btn-action btn-save';
            editBtn.setAttribute('onclick', `window.saveCode('${oldCode}')`);
            editBtn.innerHTML = '<ion-icon name="checkmark-outline" style="font-size:1.3rem;"></ion-icon>';
            editBtn.title = 'حفظ';
        }
        
        // Focus input
        const input = document.getElementById(`code-input-${oldCode}`);
        if (input) {
            input.focus();
            input.select();
            // Allow save on Enter
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') window.saveCode(oldCode);
            });
        }
    };

    window.saveCode = async (oldCode) => {
        const input = document.getElementById(`code-input-${oldCode}`);
        if (!input) return;
        
        const newCode = input.value.trim();
        if (!newCode) {
            alert('الكود لا يمكن أن يكون فارغاً');
            return;
        }
        if (newCode === oldCode) {
            // No change, just restore display
            fetchCards();
            return;
        }

        try {
            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            const isFirebase = url.includes('firebaseio.com');
            
            const card = mockCards.find(c => c.code === oldCode);
            if (!card) return;

            if (isFirebase && card.fbKey) {
                // Update in Firebase
                await fetch(`${url}/records/${card.fbKey}/code.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newCode)
                });
            } else if (!isFirebase) {
                // Update on local server
                await fetch(`${url}/api/cards/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldCode, newCode })
                });
            }
            
            alert('تم تعديل الكود بنجاح');
            fetchCards();
        } catch (e) {
            console.error('Edit Error:', e);
            alert('حدث خطأ أثناء التعديل');
        }
    };

    // --- Export Logic ---
    window.exportFolderToText = () => {
        const folderName = document.getElementById('current-folder-name').textContent;
        const folderCards = mockCards.filter(c => (c.packet || 'Sans Dossier') === folderName);
        
        if (folderCards.length === 0) {
            alert("لا توجد أكواد للتحميل");
            return;
        }
        
        let textContent = `Dossier: ${folderName}\n`;
        textContent += `Total: ${folderCards.length} codes\n`;
        textContent += `-------------------\n\n`;
        
        folderCards.forEach(c => {
            if (c.code) textContent += `${c.code}\n`;
        });
        
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Codes_${folderName.replace(/\s+/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Verification Flow ---
    let verifyQueue = [];
    let verifyIndex = 0;

    window.startFolderVerification = () => {
        const folderName = document.getElementById('current-folder-name').textContent;
        verifyQueue = mockCards.filter(c => (c.packet || 'Sans Dossier') === folderName);
        
        if (verifyQueue.length === 0) {
            alert("لا توجد أكواد للمراجعة");
            return;
        }
        
        verifyIndex = 0;
        document.getElementById('verification-modal').style.display = 'flex';
        renderVerifyStep();
    };

    window.closeVerification = () => {
        document.getElementById('verification-modal').style.display = 'none';
        fetchCards(); // Refresh UI in case of edits
    };

    function renderVerifyStep() {
        if (verifyIndex >= verifyQueue.length) {
            alert("✅ تمت مراجعة جميع الأكواد بنجاح!");
            window.closeVerification();
            return;
        }

        const card = verifyQueue[verifyIndex];
        document.getElementById('verify-progress').textContent = `${verifyIndex + 1} / ${verifyQueue.length}`;
        
        const imgEl = document.getElementById('verify-image');
        const noImgEl = document.getElementById('verify-no-image');
        
        if (card.imageBase64) {
            imgEl.src = card.imageBase64;
            imgEl.style.display = 'inline-block';
            noImgEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            noImgEl.style.display = 'block';
        }

        const inputEl = document.getElementById('verify-code-input');
        inputEl.value = card.code || '';
        inputEl.style.borderColor = '#333';
        inputEl.style.color = 'white';
        inputEl.focus();
        
        // Remove old listeners to avoid duplicates
        const newEl = inputEl.cloneNode(true);
        inputEl.parentNode.replaceChild(newEl, inputEl);
        
        newEl.addEventListener('input', function() {
            this.style.borderColor = '#ff9500';
            this.style.color = '#ff9500';
        });
        
        newEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') window.nextVerify();
        });
    }

    window.nextVerify = async () => {
        const card = verifyQueue[verifyIndex];
        const inputEl = document.getElementById('verify-code-input');
        const newCode = inputEl.value.trim();
        
        if (!newCode) {
            alert("الكود لا يمكن أن يكون فارغاً!");
            return;
        }

        // Disable button temporarily
        const btn = document.querySelector('#verification-modal button[onclick="window.nextVerify()"]');
        if (btn) btn.disabled = true;

        if (newCode !== card.code) {
            try {
                const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
                const isFirebase = url.includes('firebaseio.com');
                
                if (isFirebase && card.fbKey) {
                    await fetch(`${url}/records/${card.fbKey}/code.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newCode)
                    });
                } else if (!isFirebase) {
                    await fetch(`${url}/api/cards/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ oldCode: card.code, newCode })
                    });
                }
                card.code = newCode;
            } catch (e) {
                console.error("Failed to save correction:", e);
                alert("فشل في حفظ التعديل، الرجاء المحاولة مرة أخرى.");
                if (btn) btn.disabled = false;
                return;
            }
        }

        if (btn) btn.disabled = false;
        verifyIndex++;
        renderVerifyStep();
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
