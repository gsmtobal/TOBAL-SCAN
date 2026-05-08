// Data from Backend
let mockCards = [];
let mockAgents = [];
let currentUser = null;
let firebaseDbUrl = localStorage.getItem('firebaseUrl') || '';

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
                mockCards = Object.values(data);
                // Sort by date descending
                mockCards.sort((a, b) => new Date(b.date) - new Date(a.date));
            } else {
                mockCards = [];
            }
            renderCards();
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
const navLinks = document.querySelectorAll('.nav-links li[data-target]');
const viewSections = document.querySelectorAll('.view-section');
const logoutBtn = document.getElementById('logout-btn');
const cardsTbody = document.getElementById('cards-tbody');
const totalCountEl = document.getElementById('total-count');
const searchInput = document.getElementById('search-input');
const agentsGrid = document.getElementById('agents-grid');
const addAgentBtn = document.getElementById('add-agent-btn');
const agentModal = document.getElementById('agent-modal');
const closeModalBtn = document.querySelector('.close-modal');
const agentForm = document.getElementById('agent-form');
const exportCsvBtn = document.getElementById('export-csv-btn');
const exportTxtBtn = document.getElementById('export-txt-btn');
const loggedUserEl = document.getElementById('logged-user');

// Set default URL if exists
if (firebaseDbUrl) {
    document.getElementById('firebase-url').value = firebaseDbUrl;
}

// Login Logic
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const dbUrl = document.getElementById('firebase-url').value.trim();

    firebaseDbUrl = dbUrl;
    localStorage.setItem('firebaseUrl', dbUrl);

    // If no agents loaded yet (first login), allow admin/admin
    if (mockAgents.length === 0) {
        mockAgents = [{ name: "Admin", pin: "0000" }];
    }

    const agent = mockAgents.find(a => a.name.toLowerCase() === username.toLowerCase() && a.pin === password);
    
    if (agent || (username === 'admin' && password === 'admin')) {
        currentUser = agent ? agent.name : 'Admin';
        loggedUserEl.textContent = currentUser;
        loginScreen.classList.remove('active');
        dashboardScreen.classList.active = true;
        dashboardScreen.classList.add('active');
        renderCards();
        renderAgents();
    } else {
        loginError.textContent = "Identifiants incorrects.";
    }
});

// Logout Logic
logoutBtn.addEventListener('click', () => {
    currentUser = null;
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
        viewSections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        
        document.getElementById('page-title').textContent = link.querySelector('span').textContent;
    });
});

// Render Cards Table
function renderCards(filterText = '') {
    cardsTbody.innerHTML = '';
    
    const filtered = mockCards.filter(c => {
        const query = filterText.toLowerCase();
        return c.code.toLowerCase().includes(query) || 
               c.packet.toLowerCase().includes(query) || 
               c.agent.toLowerCase().includes(query);
    });

    totalCountEl.textContent = filtered.length;

    filtered.forEach(card => {
        const tr = document.createElement('tr');
        const badgeClass = card.brand ? card.brand.toLowerCase() : 'default';
        tr.innerHTML = `
            <td><strong>${card.code}</strong></td>
            <td><span class="badge ${badgeClass}">${card.brand}</span></td>
            <td>${card.amount} DA</td>
            <td><ion-icon name="folder-outline"></ion-icon> ${card.packet}</td>
            <td><ion-icon name="person-outline"></ion-icon> ${card.agent}</td>
            <td>${card.date}</td>
        `;
        cardsTbody.appendChild(tr);
    });
}

// Search Cards
searchInput.addEventListener('input', (e) => {
    renderCards(e.target.value);
});

// Export CSV
exportCsvBtn.addEventListener('click', () => {
    let csvContent = "data:text/csv;charset=utf-8,Code,Brand,Amount,Packet,Agent,Date\n";
    mockCards.forEach(row => {
        csvContent += `${row.code},${row.brand},${row.amount},${row.packet},${row.agent},${row.date}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "TobalScan_Export.csv");
    document.body.appendChild(link);
    link.click();
});

// Export TXT
exportTxtBtn.addEventListener('click', () => {
    let txtContent = "data:text/plain;charset=utf-8,";
    mockCards.forEach(row => {
        txtContent += `${row.code}\n`;
    });
    const encodedUri = encodeURI(txtContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "TobalScan_Codes.txt");
    document.body.appendChild(link);
    link.click();
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
