import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA9FiNMZI50q6AeTS0Fiw1Qs-VVMmVI4Os",
    authDomain: "aircross-odyssey-f6e2f.firebaseapp.com",
    projectId: "aircross-odyssey-f6e2f",
    storageBucket: "aircross-odyssey-f6e2f.firebasestorage.app",
    messagingSenderId: "641282553954",
    appId: "1:641282553954:web:4b3fa456d9eda8adf2393b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "aircross-odyssey-main";

// ==========================================
// GLOBAL STATE VARIABLES
// ==========================================
let publicBanners = [];
let publicGallery = [];
let publicComms = [];
let publicNotes = [];
let publicCrew = [];
let isAuthenticated = false;

// Banner State
let activeBannerIndex = 0;
let bannerInterval = null;

// Audio Recording State
let mediaRecorder;
let audioChunks = [];
let audioBase64 = null;
let recordingTimer = null;

// Routing Context Checks
const isMainPage = !!document.getElementById('public-view');
const isNotesPage = !!document.getElementById('newNoteInput');
const isCommsPage = !!document.getElementById('commMessage');
const isGalleryPage = !!document.getElementById('gallery-dynamic-container');
let mapInitialized = false;

// Hyperdrive Easter Egg State
let hyperdriveMode = false;
let logoClicks = 0;
let clickTimer = null;

// ==========================================
// FIREBASE REAL-TIME LISTENERS
// ==========================================
let listenersSetup = false;

function setupFirestoreListeners() {
    if (listenersSetup) return;
    listenersSetup = true;
    
    // 1. CREW ROSTER
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'crew'), (snapshot) => {
        publicCrew = snapshot.docs.map(d => d.data()).sort((a, b) => a.crewId.localeCompare(b.crewId));
        if (isMainPage) {
            renderPublicCrew();
            if (isAuthenticated) renderAdminCrew();
            updateDriverDropdown();
        }
        if (isCommsPage || isMainPage) {
            updateCommsAuthorDropdown();
        }
    });

    // 2. MAIN PAGE SPECIFIC LISTENERS
    if (isMainPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'banners'), (snapshot) => {
            publicBanners = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderPublicBanners();
            if (isAuthenticated) renderAdminBanners();
        });

        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (document.getElementById('tel-driver')) document.getElementById('tel-driver').innerText = data.driver || 'AWAITING';
                if (document.getElementById('tel-distance')) document.getElementById('tel-distance').innerText = (data.distance || 0) + ' KM';
                if (document.getElementById('tel-vibe')) document.getElementById('tel-vibe').innerText = data.vibe || 'UNKNOWN';

                if (document.getElementById('adminDist')) {
                    document.getElementById('adminDriver').value = data.driver || 'AWAITING';
                    document.getElementById('adminDist').value = data.distance || '';
                    document.getElementById('adminVibe').value = data.vibe || '';
                }
            }
        });
    }

    // 3. GALLERY LISTENER (For Admin Panel and Dedicated Gallery Page)
    if (isMainPage || isGalleryPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'gallery'), (snapshot) => {
            publicGallery = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            if (isGalleryPage) renderDedicatedGallery();
            if (isMainPage && isAuthenticated) renderAdminGallery();
        });
    }

    // 4. COMMS LISTENER
    if (isCommsPage || isMainPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'comms'), (snapshot) => {
            publicComms = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            if (isCommsPage || isMainPage) renderPublicComms();
            if (isAuthenticated && isMainPage) renderAdminComms();
        });
    }

    // 5. NOTES LISTENER
    if (isNotesPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), (snapshot) => {
            publicNotes = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderNotes();
        });
    }
}

// Initialize Listeners
setupFirestoreListeners();

// Handle Authentication State
onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
        isAuthenticated = true;
        if (isMainPage) {
            renderAdminBanners();
            renderAdminGallery();
            renderAdminComms();
            renderAdminCrew();
        }
    } else {
        isAuthenticated = false;
    }
});

// Auto-Login Anonymously so public visitors can write to database
const initAuth = async () => {
    try {
        await signInAnonymously(auth);
    } catch (error) {
        console.error("Anonymous Auth Error:", error);
    }
};
initAuth();


// ==========================================
// DEDICATED GALLERY (GRID/LIST VIEWS)
// ==========================================
window.toggleGalleryView = (viewType) => {
    if (!isGalleryPage) return;
    
    document.getElementById('gallery-view-state').value = viewType;
    
    // Update Button Styling
    const btnGrid = document.getElementById('btn-view-grid');
    const btnList = document.getElementById('btn-view-list');
    
    if (viewType === 'grid') {
        btnGrid.className = "p-2.5 rounded-lg bg-slate-800 text-purple-400 shadow-sm transition-all";
        btnList.className = "p-2.5 rounded-lg text-slate-500 hover:text-slate-300 transition-all";
    } else {
        btnList.className = "p-2.5 rounded-lg bg-slate-800 text-purple-400 shadow-sm transition-all";
        btnGrid.className = "p-2.5 rounded-lg text-slate-500 hover:text-slate-300 transition-all";
    }
    
    renderDedicatedGallery();
};

function renderDedicatedGallery() {
    if (!isGalleryPage) return;
    
    const activeGallery = publicGallery.filter(g => g.visible);
    const container = document.getElementById('gallery-dynamic-container');
    const emptyMsg = document.getElementById('emptyGalleryMessage');
    
    if (activeGallery.length === 0) {
        container.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        emptyMsg.classList.add('block');
        return;
    }
    
    emptyMsg.classList.remove('block');
    emptyMsg.classList.add('hidden');
    
    const currentView = document.getElementById('gallery-view-state').value;
    
    if (currentView === 'grid') {
        container.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6";
        container.innerHTML = activeGallery.map(item => `
            <div class="relative group cursor-pointer overflow-hidden rounded-2xl border border-slate-700 shadow-lg bg-slate-900 aspect-square" onclick="window.openLightbox('${item.id}')">
                <img src="${item.image}" alt="Memory" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                
                <!-- Overlay -->
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <div class="flex justify-between items-end">
                        <div class="text-white text-[10px] font-space tracking-widest bg-black/50 px-2 py-1 rounded backdrop-blur-md border border-white/10">
                            ${new Date(item.timestamp).toLocaleDateString()}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.downloadImage('${item.image}', 'voyager-${item.id}.jpg'); event.stopPropagation();" class="bg-white/10 backdrop-blur-md rounded-full p-2 border border-white/20 hover:bg-white/30 transition-colors" title="Download">
                                <i data-lucide="download" class="w-4 h-4 text-white"></i>
                            </button>
                            <button onclick="window.openLightbox('${item.id}'); event.stopPropagation();" class="bg-purple-500/80 backdrop-blur-md rounded-full p-2 border border-purple-400 hover:bg-purple-500 transition-colors shadow-[0_0_15px_rgba(168,85,247,0.5)]" title="Enlarge">
                                <i data-lucide="maximize-2" class="w-4 h-4 text-white"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        container.className = "flex flex-col space-y-8 max-w-3xl mx-auto";
        container.innerHTML = activeGallery.map(item => `
            <div class="relative overflow-hidden rounded-3xl border border-slate-800 shadow-2xl bg-slate-900">
                <div class="w-full h-[300px] md:h-[500px] cursor-pointer" onclick="window.openLightbox('${item.id}')">
                    <img src="${item.image}" alt="Memory" loading="lazy" class="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-700">
                </div>
                <div class="p-6 bg-slate-900 flex justify-between items-center border-t border-slate-800">
                    <div>
                        <p class="text-xs text-purple-500 font-space font-bold tracking-widest mb-1">LOG ENTRY</p>
                        <p class="text-slate-300 font-medium">${new Date(item.timestamp).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="window.downloadImage('${item.image}', 'voyager-${item.id}.jpg')" class="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors font-space text-xs font-bold tracking-widest border border-slate-700">
                            <i data-lucide="download" class="w-4 h-4"></i> DOWNLOAD
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    lucide.createIcons();
}

window.downloadImage = (dataUrl, filename) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};


// ==========================================
// DYNAMIC CREW RENDERING
// ==========================================
function renderPublicCrew() {
    const container = document.getElementById('dynamic-crew-grid');
    if (!container) return;
    
    if (publicCrew.length === 0) {
        container.innerHTML = `
            <div class="text-center col-span-full py-10 text-slate-400 font-space text-sm">
                Awaiting Crew Roster Data...
            </div>
        `;
        return;
    }

    container.innerHTML = publicCrew.map(c => `
        <div class="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-700 backdrop-blur-xl group hover:-translate-y-2 transition-all duration-500 shadow-lg">
            <div class="absolute top-0 w-full h-1 bg-${c.color}-500 shadow-[0_0_15px_currentColor]"></div>
            <div class="p-6 md:p-8">
                <div class="flex justify-between items-start mb-8">
                    <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-${c.color}-500/10 border border-${c.color}-500/30 flex items-center justify-center text-3xl font-black font-space text-${c.color}-400 group-hover:scale-110 transition-all">
                        ${c.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] text-slate-500 font-space font-bold tracking-[0.3em] mb-1">OP-ID</div>
                        <div class="text-sm font-black text-slate-300 font-space tracking-widest bg-slate-800 px-2 py-1 rounded">${c.crewId}</div>
                    </div>
                </div>
                <div>
                    <h3 class="text-2xl md:text-3xl font-black font-space tracking-tight text-white mb-2 uppercase">${c.name}</h3>
                    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-${c.color}-500/10 border border-${c.color}-500/20 text-${c.color}-400 text-xs font-bold tracking-[0.2em] uppercase">
                        <i data-lucide="shield" class="w-3 h-3"></i> ${c.role}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function updateDriverDropdown() {
    const select = document.getElementById('adminDriver');
    if (!select) return;
    
    const currentVal = select.value;
    let html = `
        <option value="AWAITING">AWAITING</option>
        <option value="AUTOPILOT">AUTOPILOT</option>
    `;
    
    html += publicCrew.map(c => `
        <option value="${c.name.toUpperCase()}">${c.name.toUpperCase()}</option>
    `).join('');
    
    select.innerHTML = html;
    
    if (select.querySelector(`option[value="${currentVal}"]`)) {
        select.value = currentVal;
    }
}

function updateCommsAuthorDropdown() {
    const select = document.getElementById('commAuthor');
    if (!select) return;
    
    if (publicCrew.length === 0) {
        select.innerHTML = '<option value="UNKNOWN">Awaiting Roster...</option>';
        return;
    }
    
    select.innerHTML = publicCrew.map(c => `
        <option value="${c.name.toUpperCase()}">${c.name.toUpperCase()} (${c.role.substring(0,3).toUpperCase()})</option>
    `).join('');
}

window.addCrewMember = async () => {
    if (!isAuthenticated) return showToast('Not authenticated', 'error');
    
    const name = document.getElementById('crewName').value.trim();
    const role = document.getElementById('crewRole').value.trim();
    const crewId = document.getElementById('crewId').value.trim();
    const color = document.getElementById('crewColor').value;
    
    if (!name || !role || !crewId) {
        return showToast('Fill all crew fields', 'error');
    }
    
    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'crew', id), { 
            id, name, role, crewId, color 
        });
        
        document.getElementById('crewName').value = '';
        document.getElementById('crewRole').value = '';
        document.getElementById('crewId').value = '';
        
        showToast('Crew added', 'success');
    } catch (e) {
        showToast('Sync failed', 'error');
        console.error(e);
    }
};

window.deleteCrewMember = async (id) => {
    if (!isAuthenticated) return;
    if (!confirm('Remove crew member?')) return;
    
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'crew', id.toString()));
        showToast('Crew removed', 'success');
    } catch (e) {
        showToast('Failed to delete', 'error');
        console.error(e);
    }
};

function renderAdminCrew() {
    const tbody = document.getElementById('adminCrewTableBody');
    if (!tbody) return;
    
    if (publicCrew.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-6 text-slate-500">Roster Empty</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = publicCrew.map(c => `
        <tr class="border-b border-slate-800">
            <td class="py-3 text-${c.color}-400 font-bold">${c.name}</td>
            <td class="py-3 text-slate-300 text-xs">${c.role}</td>
            <td class="py-3 text-slate-500 font-space">${c.crewId}</td>
            <td class="py-3">
                <button class="text-red-400 hover:text-red-300 transition-colors" onclick="window.deleteCrewMember('${c.id}')">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    lucide.createIcons();
}

// ==========================================
// BANNER RENDERING
// ==========================================
function renderPublicBanners() {
    if (!isMainPage) return;
    
    const activeBanners = publicBanners.filter(b => b.visible);
    const bannerElement = document.getElementById('event-banner');
    
    if (activeBanners.length === 0) { 
        bannerElement.style.display = 'none'; 
        clearInterval(bannerInterval); 
        return; 
    }
    
    bannerElement.style.display = 'block';
    
    const prevBtn = document.getElementById('banner-prev-btn');
    const nextBtn = document.getElementById('banner-next-btn');
    
    if (prevBtn && nextBtn) {
        prevBtn.style.display = activeBanners.length > 1 ? 'block' : 'none';
        nextBtn.style.display = activeBanners.length > 1 ? 'block' : 'none';
    }

    if (activeBannerIndex >= activeBanners.length) activeBannerIndex = 0;
    
    updateBannerUI(activeBanners);
    startBannerTimer(activeBanners);
}

function startBannerTimer(activeBanners) {
    clearInterval(bannerInterval);
    if (activeBanners.length > 1) {
        bannerInterval = setInterval(() => { 
            window.nextBanner(); 
        }, 8000);
    }
}

window.nextBanner = () => {
    const activeBanners = publicBanners.filter(b => b.visible);
    if (activeBanners.length <= 1) return;
    
    activeBannerIndex = (activeBannerIndex + 1) % activeBanners.length;
    updateBannerUI(activeBanners); 
    startBannerTimer(activeBanners);
};

window.prevBanner = () => {
    const activeBanners = publicBanners.filter(b => b.visible);
    if (activeBanners.length <= 1) return;
    
    activeBannerIndex = (activeBannerIndex - 1 + activeBanners.length) % activeBanners.length;
    updateBannerUI(activeBanners); 
    startBannerTimer(activeBanners); 
};

function updateBannerUI(activeBanners) {
    const banner = activeBanners[activeBannerIndex];
    document.getElementById('banner-description').textContent = banner.text;
    document.getElementById('banner-meta').innerHTML = `Broadcast ${activeBannerIndex + 1} of ${activeBanners.length}`;
    
    const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const formattedDate = new Date(banner.timestamp).toLocaleString('en-US', dateOptions);
    document.getElementById('banner-timestamp').textContent = formattedDate;
    
    const container = document.getElementById('banner-content-container');
    container.classList.remove('slide-up-anim'); 
    void container.offsetWidth; 
    container.classList.add('slide-up-anim');
}

// ==========================================
// COMMS POSTING & AUDIO LOGIC
// ==========================================
window.postComm = async () => {
    const authorElement = document.getElementById('commAuthor');
    const msgElement = document.getElementById('commMessage');
    
    if (!authorElement || !msgElement) return;

    const author = authorElement.value;
    const msg = msgElement.value.trim();

    if (!msg && !audioBase64) {
        return showToast('Enter text or record audio', 'error');
    }
    
    if (audioBase64 && audioBase64.length > 900000) {
        return showToast('Audio file too large', 'error');
    }

    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comms', id), {
            id: id, 
            author: author, 
            message: msg, 
            audio: audioBase64 || null, 
            timestamp: Date.now()
        });
        
        msgElement.value = '';
        audioBase64 = null;
        
        const statusElement = document.getElementById('recordStatus');
        if (statusElement) {
            statusElement.textContent = 'Audio ready';
            statusElement.className = 'text-[10px] font-bold text-slate-400';
        }
        
        showToast('Transmission logged', 'success');
    } catch (e) {
        showToast('Transmission failed', 'error');
        console.error(e);
    }
};

window.toggleRecord = async () => {
    const btn = document.getElementById('recordBtn');
    const status = document.getElementById('recordStatus');
    if (!btn || !status) return;

    // STOP RECORDING
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        
        btn.innerHTML = `<i data-lucide="mic" class="w-5 h-5"></i>`;
        btn.classList.remove('animate-pulse', 'bg-red-500', 'text-white', 'border-red-600');
        btn.classList.add('bg-white/50', 'text-slate-500');
        
        clearTimeout(recordingTimer); 
        lucide.createIcons();
        return;
    }

    // START RECORDING
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => {
            audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); 
            const reader = new FileReader(); 
            
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                audioBase64 = reader.result;
                status.textContent = 'Audio recorded. Ready to post.';
                status.classList.remove('text-slate-400', 'text-red-500');
                status.classList.add('text-emerald-500');
            };
            
            stream.getTracks().forEach(track => track.stop()); 
        };

        mediaRecorder.start();
        
        status.textContent = 'Recording... (Max 15s)';
        status.classList.remove('text-slate-400', 'text-emerald-500');
        status.classList.add('text-red-500');
        
        btn.innerHTML = `<i data-lucide="square" class="w-4 h-4"></i>`;
        btn.classList.remove('bg-white/50', 'text-slate-500');
        btn.classList.add('animate-pulse', 'bg-red-500', 'text-white', 'border-red-600');
        lucide.createIcons();

        recordingTimer = setTimeout(() => {
            if (mediaRecorder.state === 'recording') { 
                window.toggleRecord(); 
                showToast('Max length reached (15s)', 'success'); 
            }
        }, 15000);

    } catch (err) {
        showToast('Microphone access denied', 'error');
        console.error("Mic error:", err);
    }
};

function renderPublicComms() {
    const container = document.getElementById('commsContainer');
    if (!container) return;
    
    if (publicComms.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-slate-400 font-space text-sm">
                No transmissions yet.
            </div>
        `;
        return;
    }
    
    container.innerHTML = publicComms.map(c => {
        const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' };
        const date = new Date(c.timestamp).toLocaleDateString('en-US', dateOptions);
        const audioHtml = c.audio ? `<audio src="${c.audio}" controls class="w-full h-8 mt-3 custom-audio"></audio>` : '';
        const msgHtml = c.message ? `<p class="text-sm text-slate-700 leading-relaxed font-medium">${c.message}</p>` : '';
        
        return `
        <div class="bg-white/60 backdrop-blur-sm border border-white/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start mb-2 border-b border-slate-200/50 pb-2">
                <span class="font-space font-bold text-cyan-600 text-xs tracking-widest flex items-center gap-1">
                    <i data-lucide="user" class="w-3 h-3"></i> ${c.author}
                </span>
                <span class="text-[10px] text-slate-400 font-space bg-white/50 px-2 py-0.5 rounded">
                    ${date}
                </span>
            </div>
            ${msgHtml} 
            ${audioHtml}
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

// ==========================================
// IDEAS BOARD (NOTES)
// ==========================================
window.addNote = async () => {
    const input = document.getElementById('newNoteInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return showToast('Enter an idea first', 'error');

    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id), {
            id: id, 
            text: text, 
            completed: false, 
            timestamp: Date.now()
        });
        input.value = '';
        showToast('Idea added to board', 'success');
    } catch (e) {
        showToast('Failed to add idea', 'error');
        console.error(e);
    }
};

window.toggleNoteStatus = async (id, isCompleted) => {
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id.toString()), {
            completed: !isCompleted
        }, { merge: true });
    } catch (e) {
        showToast('Failed to update', 'error');
        console.error(e);
    }
};

window.deleteNote = async (id, event) => {
    if(event) event.stopPropagation();
    
    if (!confirm('Delete this idea permanently?')) return;
    
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id.toString()));
        showToast('Idea deleted', 'success');
    } catch (e) {
        showToast('Failed to delete', 'error');
        console.error(e);
    }
};

function renderNotes() {
    const container = document.getElementById('notesContainer');
    if (!container) return;

    if (publicNotes.length === 0) {
        container.innerHTML = `
            <div class="text-center col-span-full py-10 text-slate-400 font-space text-sm">
                No ideas logged yet.
            </div>
        `;
        return;
    }

    container.innerHTML = publicNotes.map(n => {
        const bgClass = n.completed ? 'bg-emerald-50 border-emerald-200 opacity-60' : 'glass-panel border-white/80';
        const textClass = n.completed ? 'line-through text-slate-400' : 'text-slate-700';
        const iconColor = n.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-400';
        
        return `
        <div class="p-6 rounded-2xl ${bgClass} shadow-sm transition-all cursor-pointer group" onclick="window.toggleNoteStatus('${n.id}', ${n.completed})">
            <div class="flex justify-between items-start gap-4">
                <p class="font-medium text-sm md:text-base leading-relaxed ${textClass}">${n.text}</p>
                <div class="flex flex-col gap-2 shrink-0">
                    <button class="transition-colors ${iconColor}" title="Mark Done">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                    </button>
                    <button onclick="window.deleteNote('${n.id}', event)" class="text-slate-300 hover:text-red-400 transition-colors" title="Delete Idea">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
            <div class="text-[10px] text-slate-400 font-space mt-4 block">
                ${new Date(n.timestamp).toLocaleDateString()}
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

// ==========================================
// WEATHER API
// ==========================================
async function fetchWeather() {
    if (!isMainPage) return;
    
    try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=10.2191,12.2958,12.9716&longitude=76.2506,76.6394,77.5946&current_weather=true';
        const res = await fetch(url);
        const data = await res.json();
        
        const cities = ['ANGAMALY', 'MYSORE', 'BANGALORE'];
        let html = '';
        
        if (data && data.length || (data.current_weather && Array.isArray(data))) {
             data.forEach((d, i) => {
                 const temp = d.current_weather ? d.current_weather.temperature : '--';
                 const wind = d.current_weather ? d.current_weather.windspeed : '--';
                 html += `
                    <div class="flex justify-between items-center gap-6">
                        <span class="text-xs font-space font-bold text-slate-300">${cities[i]}</span>
                        <span class="text-xs font-space text-cyan-300 font-bold">
                            ${temp}°C 
                            <span class="text-slate-500 ml-1 opacity-50">|</span> 
                            <span class="text-cyan-600 ml-1">${wind}km/h</span>
                        </span>
                    </div>
                 `;
             });
        } else { 
            html = `<div class="text-xs text-cyan-400 font-space font-bold">ATMOSPHERIC DATA ACQUIRED</div>`; 
        }
        
        const wBox = document.getElementById('weather-hud');
        if (wBox) wBox.innerHTML = html || `<div class="text-xs text-cyan-400 font-space font-bold">SYS ONLINE: 28°C AVG</div>`;
        
    } catch (e) {
        const wBox = document.getElementById('weather-hud');
        if (wBox) wBox.innerHTML = `<div class="text-xs text-cyan-400 font-space font-bold">SYS ONLINE: 28°C AVG</div>`;
    }
}
setTimeout(fetchWeather, 2000);


// ==========================================
// ADMIN IMAGE UPLOAD LOGIC
// ==========================================
window.handleImageSelect = async (e) => {
    if (!isAuthenticated) return showToast('Not authenticated', 'error');
    
    const file = e.target.files[0];
    if (!file) return;
    
    showToast('Compressing & Syncing...', 'success');
    
    try {
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader(); 
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image(); 
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas'); 
                    let { width, height } = img;
                    const max = 1000; 
                    
                    if (width > height && width > max) { 
                        height *= max / width; 
                        width = max; 
                    } else if (height > max) { 
                        width *= max / height; 
                        height = max; 
                    }
                    
                    canvas.width = width; 
                    canvas.height = height; 
                    
                    const ctx = canvas.getContext('2d'); 
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
            };
        });
        
        const id = Date.now().toString();
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id), { 
            id: id, 
            image: base64, 
            visible: true, 
            timestamp: Date.now() 
        });
        showToast('Memory securely vaulted', 'success');
        
    } catch(err) {
        showToast('Upload failed', 'error');
        console.error(err);
    }
    
    e.target.value = '';
};

// ==========================================
// LIGHTBOX LOGIC
// ==========================================
window.openLightbox = (id) => {
    const item = publicGallery.find(g => g.id === id);
    if (item) { 
        document.getElementById('lightboxImage').src = item.image; 
        document.getElementById('galleryLightbox').classList.add('active'); 
        document.body.style.overflow = 'hidden'; 
    }
};

window.closeLightbox = () => { 
    const lb = document.getElementById('galleryLightbox'); 
    if (lb) { 
        lb.classList.remove('active'); 
        document.body.style.overflow = 'auto'; 
    } 
};

window.nextGalleryImage = () => { 
    const active = publicGallery.filter(g => g.visible); 
    const currentSrc = document.getElementById('lightboxImage').src;
    const currentItem = active.find(g => currentSrc.includes(g.image));
    
    if (currentItem) {
        const idx = active.findIndex(g => g.id === currentItem.id);
        if (idx !== -1 && active.length > 0) {
            window.openLightbox(active[(idx + 1) % active.length].id);
        }
    }
};

window.previousGalleryImage = () => { 
    const active = publicGallery.filter(g => g.visible); 
    const currentSrc = document.getElementById('lightboxImage').src;
    const currentItem = active.find(g => currentSrc.includes(g.image));
    
    if (currentItem) {
        const idx = active.findIndex(g => g.id === currentItem.id);
        if (idx !== -1 && active.length > 0) {
            window.openLightbox(active[(idx - 1 + active.length) % active.length].id);
        }
    }
};

document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('galleryLightbox');
    if (lb && lb.classList.contains('active')) {
        if (e.key === 'ArrowRight') window.nextGalleryImage();
        if (e.key === 'ArrowLeft') window.previousGalleryImage();
        if (e.key === 'Escape') window.closeLightbox();
    }
});

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================
window.authenticateAdmin = async () => {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('passwordInput').value;
    const btn = document.querySelector('#loginScreen .btn-admin-primary');
    
    if (!email || !pwd) { 
        showToast('Enter both Email and Access Code.', 'error'); 
        return; 
    }
    
    const originalText = btn.innerHTML; 
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> AUTHENTICATING...`;
    
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').classList.add('active');
        lucide.createIcons();
    } catch (error) { 
        showToast('Access Denied. Invalid credentials.', 'error'); 
    } finally { 
        btn.innerHTML = originalText; 
        lucide.createIcons(); 
    }
};

window.logoutAdmin = async () => {
    try { 
        await signOut(auth); 
    } catch (e) { 
        console.error("Logout error", e); 
    }
    window.location.hash = ''; 
    window.location.reload();
};

// ==========================================
// ADMIN CONTROLS (Banners, Telemetry, Moderation)
// ==========================================
window.addBanner = async () => {
    if (!isAuthenticated) return showToast('Not authenticated', 'error');
    const text = document.getElementById('bannerText').value.trim();
    if (!text) return showToast('Enter text to broadcast', 'error');
    
    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id), { 
            id: id, 
            text: text, 
            visible: true, 
            timestamp: Date.now() 
        });
        document.getElementById('bannerText').value = ''; 
        showToast('Broadcast live synced', 'success');
    } catch (e) { 
        showToast('Sync failed', 'error'); 
    }
};

window.toggleBannerVisibility = async (id, currentVis) => { 
    if (!isAuthenticated) return; 
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id.toString()), { 
        visible: !currentVis 
    }, { merge: true }); 
};

window.deleteBanner = async (id) => { 
    if (!isAuthenticated || !confirm('Delete transmission from cloud?')) return; 
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id.toString())); 
    showToast('Transmission deleted', 'success'); 
};

window.toggleGalleryVisibility = async (id, currentVis) => { 
    if (!isAuthenticated) return; 
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id.toString()), { 
        visible: !currentVis 
    }, { merge: true }); 
};

window.deleteGalleryItem = async (id) => { 
    if (!isAuthenticated || !confirm('Delete memory from cloud?')) return; 
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id.toString())); 
    showToast('Memory wiped', 'success'); 
};

window.deleteComm = async (id) => { 
    if (!isAuthenticated || !confirm('Delete this crew comm?')) return; 
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comms', id.toString())); 
    showToast('Comm deleted', 'success'); 
};

window.updateTelemetry = async () => {
    if (!isAuthenticated) return;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest'), {
            driver: document.getElementById('adminDriver').value,
            distance: document.getElementById('adminDist').value,
            vibe: document.getElementById('adminVibe').value.trim(),
            timestamp: Date.now()
        });
        showToast('Telemetry updated', 'success');
    } catch (e) { 
        showToast('Update failed', 'error'); 
    }
};

// ==========================================
// ADMIN RENDERING FUNCTIONS
// ==========================================
function renderAdminBanners() {
    const tbody = document.getElementById('bannersTableBody');
    if (!tbody) return;
    
    if (publicBanners.length === 0) { 
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-6 text-slate-500">
                    <i data-lucide="radio" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>No active broadcasts.
                </td>
            </tr>
        `; 
        lucide.createIcons(); 
        return; 
    }
    
    tbody.innerHTML = publicBanners.map(b => `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td class="max-w-xs truncate py-3 font-medium text-slate-300">${b.text}</td>
            <td class="py-3">
                <label class="toggle-admin">
                    <input type="checkbox" ${b.visible ? 'checked' : ''} onchange="window.toggleBannerVisibility('${b.id}', ${b.visible})">
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td class="py-3">
                <button class="btn-admin-danger rounded" onclick="window.deleteBanner('${b.id}')">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    lucide.createIcons();
}

function renderAdminGallery() {
    const tbody = document.getElementById('galleryTableBody');
    if (!tbody) return;
    
    if (publicGallery.length === 0) { 
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-6 text-slate-500">
                    <i data-lucide="image-off" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>Vault is empty.
                </td>
            </tr>
        `; 
        lucide.createIcons(); 
        return; 
    }
    
    tbody.innerHTML = publicGallery.map(g => `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td class="py-3">
                <img src="${g.image}" class="w-14 h-14 rounded-lg object-cover border border-slate-700 shadow-md">
            </td>
            <td class="py-3">
                <label class="toggle-admin">
                    <input type="checkbox" ${g.visible ? 'checked' : ''} onchange="window.toggleGalleryVisibility('${g.id}', ${g.visible})">
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td class="py-3">
                <button class="btn-admin-danger rounded" onclick="window.deleteGalleryItem('${g.id}')">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    lucide.createIcons();
}

function renderAdminComms() {
    const tbody = document.getElementById('adminCommsTableBody');
    if (!tbody) return;
    
    if (publicComms.length === 0) { 
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-6 text-slate-500">No comms logged.</td>
            </tr>
        `; 
        lucide.createIcons(); 
        return; 
    }
    
    tbody.innerHTML = publicComms.map(c => {
        const dateOptions = { month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit' };
        const date = new Date(c.timestamp).toLocaleDateString('en-US', dateOptions);
        const audioLabel = c.audio ? '<span class="text-emerald-400 font-bold ml-2 text-[10px] bg-emerald-900/30 px-1 py-0.5 rounded">[AUDIO]</span>' : '';
        
        return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td class="py-3 text-cyan-400 font-bold text-xs">${c.author}</td>
            <td class="py-3 text-slate-300 max-w-xs truncate">${c.message || '---'} ${audioLabel}</td>
            <td class="py-3 text-slate-500 text-xs">${date}</td>
            <td class="py-3">
                <button class="btn-admin-danger rounded" onclick="window.deleteComm('${c.id}')">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
    
    lucide.createIcons();
}

// ==========================================
// UTILITIES & ROUTING
// ==========================================
function showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const t = document.createElement('div');
    t.className = `toast ${type} flex items-center gap-3`; 
    t.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}" class="w-5 h-5"></i> 
        <span>${msg}</span>
    `;
    
    container.appendChild(t); 
    lucide.createIcons();
    
    setTimeout(() => { 
        t.style.animation = 'slideIn 0.3s ease reverse'; 
        setTimeout(() => t.remove(), 300); 
    }, 3000);
}

function handleRoute() {
    if (!isMainPage) return;
    
    const hash = window.location.hash;
    if (hash === '#admin') {
        document.getElementById('public-view').style.display = 'none';
        document.getElementById('admin-view').style.display = 'block';
        document.body.style.overflow = 'auto';
        window.scrollTo(0, 0);
    } else {
        document.getElementById('admin-view').style.display = 'none';
        document.getElementById('public-view').style.display = 'block';
        if (!mapInitialized) { 
            setTimeout(initMapAndGraphics, 100); 
            mapInitialized = true; 
        }
    }
}

window.addEventListener('hashchange', handleRoute);

window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) { 
            loader.style.opacity = '0'; 
            setTimeout(() => loader.style.display = 'none', 800); 
        }
        if (isMainPage) handleRoute();
        lucide.createIcons();
    }, 1000);
});

// HYPERDRIVE EASTER EGG
window.triggerHyperdrive = () => {
    logoClicks++; 
    clearTimeout(clickTimer);
    
    if (logoClicks >= 3 && !hyperdriveMode) { 
        activateHyperdrive(); 
        logoClicks = 0; 
    } else { 
        clickTimer = setTimeout(() => { logoClicks = 0; }, 1000); 
    }
};

function activateHyperdrive() {
    if (!isMainPage) return;
    
    hyperdriveMode = true; 
    showToast('WARNING: HYPERDRIVE ENGAGED', 'error'); 
    
    const pv = document.getElementById('public-view'); 
    pv.classList.add('hyperdrive-active', 'hyperdrive-shake');
    
    setTimeout(() => { 
        pv.classList.remove('hyperdrive-active', 'hyperdrive-shake'); 
        hyperdriveMode = false; 
        showToast('ORBIT STABILIZED', 'success'); 
    }, 4000);
}

// ==========================================
// MAP & GRAPHICS INIT
// ==========================================
window.closeMapHud = () => {
    const hud = document.getElementById('map-hud');
    if (hud) {
        hud.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
        hud.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    }
};

function initMapAndGraphics() {
    // Scroll Reveal Animation Initialization
    function reveal() {
        const reveals = document.querySelectorAll(".reveal");
        for (let i = 0; i < reveals.length; i++) {
            const windowHeight = window.innerHeight;
            const elementTop = reveals[i].getBoundingClientRect().top;
            const elementVisible = 100;
            if (elementTop < windowHeight - elementVisible) {
                reveals[i].classList.add("active");
            }
        }
    }
    window.addEventListener("scroll", reveal);
    reveal();

    const mapData = [
        { id: "001", name: "ANGAMALY", status: "DEPARTURE", desc: "Origin point. Systems initialized.", color: "text-pink-500", bg: "bg-pink-100", coords: [10.2191, 76.2506], markerHex: '#ec4899'},
        { id: "002", name: "MYSORE", status: "WAYPOINT", desc: "Mid-point coordinates reached.", color: "text-orange-500", bg: "bg-orange-100", coords: [12.2958, 76.6394], markerHex: '#f97316'},
        { id: "003", name: "BANGALORE", status: "DESTINATION", desc: "Final target acquired.", color: "text-violet-500", bg: "bg-violet-100", coords: [12.9716, 77.5946], markerHex: '#8b5cf6'}
    ];
    
    // Leaflet Map Initialization
    if (document.getElementById('real-map')) {
        const realMap = L.map('real-map', { zoomControl: false }).setView([11.6, 76.8], 7);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
            attribution: '&copy; OpenStreetMap', 
            subdomains: 'abcd', 
            maxZoom: 20 
        }).addTo(realMap);
        
        L.control.zoom({ position: 'bottomright' }).addTo(realMap);

        const forwardCoords = mapData.map(d => d.coords);
        
        L.polyline(forwardCoords, { color: '#ec4899', weight: 6, opacity: 0.8 }).addTo(realMap);
        L.polyline(forwardCoords, { color: '#ffffff', weight: 2, className: 'route-flow-forward' }).addTo(realMap);

        const returnCoords = [mapData[2].coords, mapData[0].coords];
        L.polyline(returnCoords, { color: '#8b5cf6', weight: 4, opacity: 0.5, dashArray: '5, 5' }).addTo(realMap);
        L.polyline(returnCoords, { color: '#06b6d4', weight: 3, className: 'route-flow-return' }).addTo(realMap);
        
        function updateMapInfo(index) {
            const hud = document.getElementById('map-hud');
            const data = mapData[index];
            
            hud.innerHTML = `
                <button onclick="window.closeMapHud()" class="absolute top-3 right-3 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="flex justify-between items-center mb-3 border-b border-slate-100 pb-3 pr-6">
                    <div class="font-space font-bold text-[10px] tracking-[0.2em] text-slate-400">NAV PNT ${data.id}</div>
                    <div class="${data.color} ${data.bg} text-[9px] tracking-widest font-bold px-2 py-1 rounded shadow-sm border border-white">${data.status}</div>
                </div>
                <h3 class="text-xl font-black font-space mb-1 tracking-tight text-slate-800">${data.name}</h3>
                <p class="text-xs text-slate-500 leading-relaxed font-medium mb-4">${data.desc}</p>
                <div class="flex items-center gap-2 text-[10px] font-space font-bold text-slate-400 bg-slate-50 px-2 py-1.5 rounded-md">
                    <i data-lucide="crosshair" class="w-3 h-3"></i> LAT: ${data.coords[0].toFixed(4)} LNG: ${data.coords[1].toFixed(4)}
                </div>
            `;
            lucide.createIcons();
            
            // Show the HUD with transition
            hud.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
            hud.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
            
            realMap.setView(data.coords, 8, { animate: true });
        }
        
        mapData.forEach((loc, index) => {
            const vibrantIcon = L.divIcon({
                className: 'custom-vibrant-marker',
                html: `
                    <div class="relative flex items-center justify-center cursor-pointer group">
                        <div class="absolute w-12 h-12 rounded-full animate-ping" style="background-color: ${loc.markerHex}; opacity: 0.4;"></div>
                        <div class="w-6 h-6 rounded-full border-4 border-white shadow-lg z-10 group-hover:scale-125 transition-transform duration-300" style="background-color: ${loc.markerHex};"></div>
                    </div>
                `,
                iconSize: [48, 48], 
                iconAnchor: [24, 24]
            });
            const marker = L.marker(loc.coords, { icon: vibrantIcon }).addTo(realMap);
            marker.on('click', () => updateMapInfo(index));
        });
    }

    // Three.js Background Initialization
    const container = document.getElementById('hero-canvas-container');
    if (container && !container.hasChildNodes()) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 8, 25);
        
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        
        const geo = new THREE.PlaneGeometry(200, 200, 60, 60);
        const mat = new THREE.MeshBasicMaterial({ color: 0x059669, wireframe: true, transparent: true, opacity: 0.7 });
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = -Math.PI / 2; 
        plane.position.y = -8;
        scene.add(plane);

        const geo2 = new THREE.PlaneGeometry(200, 200, 40, 40);
        const mat2 = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.3 });
        const plane2 = new THREE.Mesh(geo2, mat2);
        plane2.rotation.x = -Math.PI / 2; 
        plane2.position.y = -10;
        scene.add(plane2);
        
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 500;
        const posArray = new Float32Array(starsCount * 3);
        
        for (let i = 0; i < starsCount * 3; i++) { 
            posArray[i] = (Math.random() - 0.5) * 150; 
        }
        
        starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const starsMat = new THREE.PointsMaterial({ size: 0.2, color: 0x10b981, transparent: true, opacity: 0.9 });
        const starPoints = new THREE.Points(starsGeo, starsMat);
        starPoints.position.y = -10;
        scene.add(starPoints);

        const count = geo.attributes.position.count;
        
        function animate() {
            requestAnimationFrame(animate);
            const time = Date.now() * 0.001;
            const speedMod = hyperdriveMode ? 25 : 1;
            
            const positions = plane.geometry.attributes.position;
            for (let i = 0; i < count; i++) {
                const x = positions.getX(i);
                const y = positions.getY(i);
                positions.setZ(i, Math.sin(x * 0.1 + (time * speedMod)) * 1.5 + Math.cos(y * 0.1 + (time * speedMod)) * 1.5);
            }
            positions.needsUpdate = true;

            const positions2 = plane2.geometry.attributes.position;
            for (let i = 0; i < positions2.count; i++) {
                const x = positions2.getX(i);
                const y = positions2.getY(i);
                positions2.setZ(i, Math.sin(x * 0.08 - (time * speedMod)) * 2 + Math.cos(y * 0.08 - (time * speedMod)) * 2);
            }
            positions2.needsUpdate = true;
            
            plane.position.z += 0.02 * speedMod; 
            if (plane.position.z > 5) plane.position.z = 0; 
            
            plane2.position.z += 0.01 * speedMod; 
            if (plane2.position.z > 5) plane2.position.z = 0; 

            starPoints.rotation.y += 0.0005 * speedMod;
            starPoints.position.y += 0.02 * speedMod;
            
            if (starPoints.position.y > 20) starPoints.position.y = -10;

            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // Countdown Timer Initialization
    if (document.getElementById('cd-days')) {
        const targetDate = new Date("2026-07-11T00:30:00Z").getTime();
        
        setInterval(() => {
            const now = new Date().getTime();
            const dist = targetDate - now;
            
            if (dist < 0) return;
            
            const d = document.getElementById('cd-days');
            if (d) {
                d.innerText = Math.floor(dist / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
                document.getElementById('cd-hours').innerText = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0');
                document.getElementById('cd-minutes').innerText = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
                document.getElementById('cd-seconds').innerText = Math.floor((dist % (1000 * 60)) / 1000).toString().padStart(2, '0');
            }
        }, 1000);
    }
}
