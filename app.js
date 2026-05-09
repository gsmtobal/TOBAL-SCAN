// Firebase Configuration
const DEFAULT_FIREBASE_URL = "https://tobalscandb-default-rtdb.firebaseio.com/"; // <--- Corrected to match app

let mockCards = [];
let mockAgents = [];
let currentUser = localStorage.getItem('loggedUser') || null;
let firebaseDbUrl = localStorage.getItem('firebaseUrl') || DEFAULT_FIREBASE_URL;

// Fetch Data from Firebase
async function fetchCards() {
    if (!firebaseDbUrl) return;
    try {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        const res = await fetch(`${url}/records.json`);
        if (res.ok) {
            const data = await res.json();
            // Firebase returns an object of objects { "code": { ... }, "code2": { ... } }
            if (data) {
                let allCards = Object.values(data);
                // Filter: If not Admin, only show own cards
                if (currentUser && currentUser.toLowerCase() !== 'admin') {
                    mockCards = allCards.filter(c => c.agent && c.agent.toLowerCase() === currentUser.toLowerCase());
                } else {
                    mockCards = allCards;
                }
                // Sort by date descending
                mockCards.sort((a, b) => new Date(b.date) - new Date(a.date));
            } else {
                mockCards = [];
            }
            renderFolders();
        }
    } catch (e) { console.error("Error fetching cards:", e); }
}

async function fetchAgents() {
    if (!firebaseDbUrl) return;
    try {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        const res = await fetch(`${url}/agents.json`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                mockAgents = Object.values(data);
            } else {
                // Default agent
                mockAgents = [{ name: "Admin", pin: "0000" }];
            }
            renderAgents();
        }
    } catch (e) { console.error("Error fetching agents:", e); }
}

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const navLinks = document.querySelectorAll('.portal-menu .pill-btn[data-target]');
const viewSections = document.querySelectorAll('.view-section');
const logoutBtn = document.getElementById('logout-btn');
const cardsTbody = document.getElementById('cards-tbody');
const totalCountEl = document.getElementById('total-count');
const folderSearch = document.getElementById('folder-search');
const foldersGrid = document.getElementById('folders-grid');
const foldersContainer = document.getElementById('folders-container');
const folderDetailView = document.getElementById('folder-detail-view');
const backToFoldersBtn = document.getElementById('back-to-folders');
const currentFolderNameEl = document.getElementById('current-folder-name');
const agentsGrid = document.getElementById('agents-grid');
const addAgentBtn = document.getElementById('add-agent-btn');
const agentModal = document.getElementById('agent-modal');
const closeModalBtn = document.querySelector('.close-modal');
const agentForm = document.getElementById('agent-form');
const exportFolderCsvBtn = document.getElementById('export-folder-csv');
const exportFolderTxtBtn = document.getElementById('export-folder-txt');
const settingsForm = document.getElementById('settings-form');
const settingsMsg = document.getElementById('settings-msg');
const loggedUserEl = document.getElementById('logged-user');
const imageModal = document.getElementById('image-modal');
const enlargedImage = document.getElementById('enlarged-image');
const closeImageModalBtn = document.getElementById('close-image-modal');
const mainSearchInput = document.getElementById('main-search-input');
const mainSearchBtn = document.getElementById('main-search-btn');
const searchResultsContainer = document.getElementById('search-results-container');

let currentFolder = null;

// Set default URL if exists
if (!firebaseDbUrl) {
    firebaseDbUrl = DEFAULT_FIREBASE_URL;
}

// Login Logic
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    // Use default URL if not set
    if (!firebaseDbUrl) firebaseDbUrl = DEFAULT_FIREBASE_URL;
    localStorage.setItem('firebaseUrl', firebaseDbUrl);

    // If no agents loaded yet (first login), allow admin/admin
    if (mockAgents.length === 0) {
        mockAgents = [{ name: "Admin", pin: "0000" }];
    }

    const agent = mockAgents.find(a => a.name.toLowerCase() === username.toLowerCase() && a.pin === password);
    
    if (agent || (username === 'admin' && password === 'admin')) {
        currentUser = agent ? agent.name : 'Admin';
        loggedUserEl.textContent = currentUser;
        localStorage.setItem('loggedUser', currentUser); // Persistent login
        
        // UI Access Control: Hide Admin-only tabs for Agents
        const isAdmin = currentUser.toLowerCase() === 'admin';
        document.querySelectorAll('.nav-links li[data-target="agents-view"], .nav-links li[data-target="settings-view"]').forEach(li => {
            li.style.display = isAdmin ? 'flex' : 'none';
        });

        loginScreen.classList.remove('active');
        dashboardScreen.classList.add('active');
        fetchCards(); // Refetch to apply agent filter
        renderAgents();
    } else {
        loginError.textContent = "Identifiants incorrects.";
    }
});

// Logout Logic
logoutBtn.addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('loggedUser'); // Clear session
    dashboardScreen.classList.remove('active');
    loginScreen.classList.add('active');
    document.getElementById('password').value = '';
});

// Navigation Logic
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const targetId = link.getAttribute('data-target');
        if (!targetId) return;

        viewSections.forEach(sec => sec.classList.remove('active'));
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.add('active');
        
        if (targetId === 'settings-view') {
            const urlInput = document.getElementById('new-firebase-url');
            if (urlInput) urlInput.value = firebaseDbUrl;
        }
    });
});

// --- Folder Logic ---
function renderFolders(filterText = '') {
    foldersGrid.innerHTML = '';
    foldersContainer.style.display = 'block';
    folderDetailView.style.display = 'none';

    // Group by packet
    const folders = {};
    mockCards.forEach(c => {
        const p = c.packet || 'Sans Dossier';
        if (!folders[p]) folders[p] = { name: p, count: 0, lastUpdate: c.date };
        folders[p].count++;
    });

    const folderList = Object.values(folders).filter(f => f.name.toLowerCase().includes(filterText.toLowerCase()));
    totalCountEl.textContent = mockCards.length;

    folderList.forEach(folder => {
        const div = document.createElement('div');
        div.className = 'folder-card';
        const isAdmin = currentUser && currentUser.toLowerCase() === 'admin';
        
        div.innerHTML = `
            <div class="btn-folder-download-group">
                <button class="btn-folder-download csv" title="CSV" data-folder="${folder.name}">
                    <ion-icon name="download-outline"></ion-icon>
                </button>
                <button class="btn-folder-download txt" title="TXT" data-folder="${folder.name}">
                    <ion-icon name="document-text-outline"></ion-icon>
                </button>
                ${isAdmin ? `
                <button class="btn-folder-download delete" title="Supprimer Dossier" style="background: rgba(255, 59, 48, 0.1); color: #FF3B30;">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>` : ''}
            </div>
            <div class="folder-icon"><ion-icon name="folder"></ion-icon></div>
            <div class="folder-info">
                <h4>${folder.name}</h4>
                <div class="folder-stats">${folder.count} codes • ${folder.lastUpdate}</div>
            </div>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.btn-folder-download')) return;
            showFolderDetail(folder.name);
        });
        div.querySelector('.btn-folder-download.csv').addEventListener('click', () => exportFolderToCsv(folder.name));
        div.querySelector('.btn-folder-download.txt').addEventListener('click', () => exportFolderToTxt(folder.name));
        if (isAdmin) {
            div.querySelector('.btn-folder-download.delete').addEventListener('click', () => deleteFolder(folder.name));
        }
        foldersGrid.appendChild(div);
    });
}

function showFolderDetail(folderName) {
    currentFolder = folderName;
    foldersContainer.style.display = 'none';
    folderDetailView.style.display = 'block';
    currentFolderNameEl.textContent = `Dossier: ${folderName}`;
    renderFolderCards(folderName);
}

function renderFolderCards(folderName) {
    cardsTbody.innerHTML = '';
    const filtered = mockCards.filter(c => c.packet === folderName);

    filtered.forEach(card => {
        const tr = document.createElement('tr');
        const badgeClass = card.brand ? card.brand.toLowerCase() : 'default';
        
        // Show real card image from cloud
        const imgSource = card.imageBase64 || '';
        const imgHtml = imgSource ? `<img src="${imgSource}" class="card-thumbnail" onclick="openImageModal('${imgSource}')">` : '<div class="card-thumbnail" style="display:flex;align-items:center;justify-content:center;color:gray;"><ion-icon name="image-outline"></ion-icon></div>';
        
        const isAdmin = currentUser && currentUser.toLowerCase() === 'admin';

        tr.innerHTML = `
            <td>${imgHtml}</td>
            <td><strong>${card.code}</strong></td>
            <td><span class="badge ${badgeClass}">${card.brand}</span></td>
            <td>${card.amount} DA</td>
            <td>${card.agent}</td>
            <td>${card.date}</td>
            <td style="text-align: right;">
                ${isAdmin ? `
                <button class="btn-delete-card" onclick="deleteCard('${card.code}')" title="Supprimer">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>` : ''}
            </td>
        `;
        cardsTbody.appendChild(tr);
    });
}

backToFoldersBtn.addEventListener('click', () => {
    renderFolders();
});

folderSearch.addEventListener('input', (e) => {
    renderFolders(e.target.value);
});

function exportFolderToCsv(folderName) {
    const filtered = mockCards.filter(c => c.packet === folderName);
    let csvContent = "data:text/csv;charset=utf-8,Code,Brand,Amount,Packet,Agent,Date\n";
    filtered.forEach(row => {
        csvContent += `${row.code},${row.brand},${row.amount},${row.packet},${row.agent},${row.date}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TobalScan_${folderName}.csv`);
    document.body.appendChild(link);
    link.click();
}

function exportFolderToTxt(folderName) {
    const filtered = mockCards.filter(c => c.packet === folderName);
    let txtContent = "data:text/plain;charset=utf-8,";
    filtered.forEach(row => {
        txtContent += `${row.code}\n`;
    });
    const encodedUri = encodeURI(txtContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TobalScan_${folderName}.txt`);
    document.body.appendChild(link);
    link.click();
}

exportFolderCsvBtn.addEventListener('click', () => {
    if (currentFolder) exportFolderToCsv(currentFolder);
});

exportFolderTxtBtn.addEventListener('click', () => {
    if (currentFolder) exportFolderToTxt(currentFolder);
});

// --- Deletion Logic ---
async function deleteCard(code) {
    if (!confirm(`Voulez-vous vraiment supprimer le code ${code} ?`)) return;
    if (!firebaseDbUrl) return;

    try {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        const res = await fetch(`${url}/records/${code}.json`, {
            method: 'DELETE'
        });
        if (res.ok) {
            mockCards = mockCards.filter(c => c.code !== code);
            if (currentFolder) {
                renderFolderCards(currentFolder);
            } else {
                renderFolders();
            }
        }
    } catch (e) { console.error("Error deleting card:", e); }
}

async function deleteFolder(folderName) {
    if (!confirm(`Voulez-vous vraiment supprimer TOUT le dossier "${folderName}" ?`)) return;
    if (!firebaseDbUrl) return;

    try {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        const cardsToDelete = mockCards.filter(c => c.packet === folderName);
        
        // Firebase doesn't support bulk delete by value, so we map them to null in a single PATCH
        const patchData = {};
        cardsToDelete.forEach(c => {
            patchData[c.code] = null;
        });

        const res = await fetch(`${url}/records.json`, {
            method: 'PATCH',
            body: JSON.stringify(patchData)
        });

        if (res.ok) {
            mockCards = mockCards.filter(c => c.packet !== folderName);
            renderFolders();
        }
    } catch (e) { console.error("Error deleting folder:", e); }
}

// Profile Settings Logic
settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('new-username').value.trim();
    const newPin = document.getElementById('new-password').value.trim();
    const newUrl = document.getElementById('new-firebase-url').value.trim();

    if (newName || newPin || newUrl) {
        settingsMsg.textContent = "Mise à jour...";
        settingsMsg.style.color = "var(--primary)";
        
        try {
            // Update URL in localStorage if provided
            if (newUrl) {
                firebaseDbUrl = newUrl.endsWith('/') ? newUrl : newUrl + '/';
                localStorage.setItem('firebaseUrl', firebaseDbUrl);
            }

            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            
            if (newName || newPin) {
                // Update Admin in agents list
                const updateData = { name: newName || currentUser, pin: newPin || "0000" };
                const res = await fetch(`${url}/agents/${updateData.name}.json`, {
                    method: 'PUT',
                    body: JSON.stringify(updateData)
                });

                if (res.ok) {
                    currentUser = updateData.name;
                    loggedUserEl.textContent = currentUser;
                    localStorage.setItem('loggedUser', currentUser);
                }
            }

            settingsMsg.textContent = "Profil mis à jour avec succès !";
            fetchCards();
            fetchAgents();
        } catch (e) {
            settingsMsg.textContent = "Erreur de mise à jour.";
            settingsMsg.style.color = "var(--error)";
        }
    }
});

// Render Agents
function renderAgents() {
    agentsGrid.innerHTML = '';
    mockAgents.forEach(agent => {
        const div = document.createElement('div');
        div.className = 'agent-card';
        div.innerHTML = `
            <div class="agent-avatar"><ion-icon name="person"></ion-icon></div>
            <div class="agent-name">${agent.name}</div>
            <div class="agent-pin">PIN: ${agent.pin}</div>
        `;
        agentsGrid.appendChild(div);
    });
}

// Agent Modal Logic
addAgentBtn.addEventListener('click', () => {
    agentModal.classList.add('active');
});

closeModalBtn.addEventListener('click', () => {
    agentModal.classList.remove('active');
});

agentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('agent-name').value.trim();
    const pin = document.getElementById('agent-pin').value.trim();
    
    if (name && pin && firebaseDbUrl) {
        try {
            const newAgent = { name, pin };
            const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
            
            // Generate a unique ID for the agent or use the name
            const res = await fetch(`${url}/agents/${name}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAgent)
            });
            
            if (res.ok) {
                agentModal.classList.remove('active');
                document.getElementById('agent-name').value = '';
                document.getElementById('agent-pin').value = '';
                fetchAgents();
            }
        } catch(e) { console.error(e); }
    }
});

// Refresh Button
document.getElementById('refresh-btn').addEventListener('click', () => {
    fetchCards();
    fetchAgents();
});

// Initial Render (Hidden until login, but we fetch to have them ready)
fetchCards();
fetchAgents();

// --- Image Lightbox Logic ---
function openImageModal(src) {
    enlargedImage.src = src;
    imageModal.classList.add('active');
}

closeImageModalBtn.addEventListener('click', () => {
    imageModal.classList.remove('active');
});

// Close modal when clicking outside the image
imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) {
        imageModal.classList.remove('active');
    }
});

// Auto-Login Check (Moved to end for stability)
console.log("Checking session:", { currentUser, firebaseDbUrl });
if (currentUser) {
    if (!firebaseDbUrl) firebaseDbUrl = DEFAULT_FIREBASE_URL;
    loggedUserEl.textContent = currentUser;
    
    // UI Access Control
    const isAdmin = currentUser.toLowerCase() === 'admin';
    document.querySelectorAll('.nav-links li[data-target="agents-view"], .nav-links li[data-target="settings-view"]').forEach(li => {
        li.style.display = isAdmin ? 'flex' : 'none';
    });

    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
}

// --- Enhanced Search Logic ---
function performSearch() {
    const q = mainSearchInput.value.trim();
    if (!q) {
        searchResultsContainer.innerHTML = '';
        return;
    }
    
    const results = mockCards.filter(c => c.code.includes(q));
    renderSearchResults(results);
}

mainSearchBtn.addEventListener('click', performSearch);

mainSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

function renderSearchResults(results) {
    if (results.length === 0) {
        searchResultsContainer.innerHTML = '<p style="text-align:center; color:gray; margin-top:20px;">Aucune carte trouvée.</p>';
        return;
    }

    searchResultsContainer.innerHTML = results.map(card => `
        <div class="search-result-card">
            <div class="result-img-side">
                ${card.imageBase64 ? `<img src="${card.imageBase64}">` : '<div style="width:250px; height:150px; background:#111; border-radius:15px; display:flex; align-items:center; justify-content:center; color:gray;">Pas d\'image</div>'}
            </div>
            <div class="result-info-side">
                <div class="edit-group" style="margin-bottom: 20px;">
                    <label>Code de la carte (15 chiffres)</label>
                    <input type="text" id="edit-code-${card.code}" value="${card.code}" style="font-size: 1.8rem; font-weight: bold; color: var(--primary);">
                </div>
                <div class="edit-row">
                    <div class="edit-group">
                        <label>Opérateur</label>
                        <select id="edit-brand-${card.code}">
                            <option value="MOBILIS" ${card.brand === 'MOBILIS' ? 'selected' : ''}>MOBILIS</option>
                            <option value="DJEZZY" ${card.brand === 'DJEZZY' ? 'selected' : ''}>DJEZZY</option>
                            <option value="OOREDOO" ${card.brand === 'OOREDOO' ? 'selected' : ''}>OOREDOO</option>
                            <option value="IDOOM" ${card.brand === 'IDOOM' ? 'selected' : ''}>IDOOM</option>
                        </select>
                    </div>
                    <div class="edit-group">
                        <label>Montant (DA)</label>
                        <input type="number" id="edit-amount-${card.code}" value="${card.amount}">
                    </div>
                </div>
                <p style="font-size:0.8rem; color:gray; margin-bottom:15px;">Dossier: ${card.packet} • Agent: ${card.agent}</p>
                <button class="btn-save-search" onclick="saveSearchEdit('${card.code}')">
                    <ion-icon name="save-outline"></ion-icon> ENREGISTRER LES MODIFICATIONS
                </button>
            </div>
        </div>
    `).join('<hr style="border:0; border-top:1px solid #222; margin:20px 0;">');
}

async function saveSearchEdit(oldCode) {
    const newCode = document.getElementById(`edit-code-${oldCode}`).value.trim();
    const brand = document.getElementById(`edit-brand-${oldCode}`).value;
    const amount = document.getElementById(`edit-amount-${oldCode}`).value;
    
    if (newCode.length !== 15) {
        alert("Le code doit contenir 15 chiffres.");
        return;
    }

    const cardIdx = mockCards.findIndex(c => c.code === oldCode);
    if (cardIdx === -1) return;

    const updatedCard = { ...mockCards[cardIdx], code: newCode, brand, amount };
    
    // Update Firebase
    if (firebaseDbUrl) {
        const url = firebaseDbUrl.endsWith('/') ? firebaseDbUrl.slice(0, -1) : firebaseDbUrl;
        
        try {
            if (newCode !== oldCode) {
                // 1. Create new entry
                await fetch(`${url}/records/${newCode}.json`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedCard)
                });
                // 2. Delete old entry
                await fetch(`${url}/records/${oldCode}.json`, {
                    method: 'DELETE'
                });
            } else {
                // Just patch existing
                await fetch(`${url}/records/${oldCode}.json`, {
                    method: 'PATCH',
                    body: JSON.stringify({ brand, amount })
                });
            }
            
            mockCards[cardIdx] = updatedCard;
            alert("Modifications enregistrées !");
            renderFolders();
            
            // Do NOT clear search results anymore. 
            // If code changed, re-render to update IDs for next edit
            if (newCode !== oldCode) {
                renderSearchResults([updatedCard]);
            }
            
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la sauvegarde.");
        }
    }
}

// Global Exports
window.saveSearchEdit = saveSearchEdit;
