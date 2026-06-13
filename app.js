import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

let publicBanners = [];
let publicGallery = [];
let publicComms = [];
let publicNotes = [];
let isAuthenticated = false;

// Banner Rotation 
let activeBannerIndex = 0;
let bannerInterval = null;

// Audio Variables
let mediaRecorder;
let audioChunks = [];
let audioBase64 = null;
let recordingTimer = null;

// Routing Context Check
const isMainPage = !!document.getElementById('public-view');
const isNotesPage = !!document.getElementById('newNoteInput');

// ==========================================
// FIREBASE LISTENERS
// ==========================================
let listenersSetup = false;
function setupFirestoreListeners() {
    if (listenersSetup) return;
    listenersSetup = true;
    
    if(isMainPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'banners'), (snapshot) => {
            publicBanners = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderPublicBanners();
            if(isAuthenticated) renderAdminBanners();
        });

        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'gallery'), (snapshot) => {
            publicGallery = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderPublicGallery();
            if(isAuthenticated) renderAdminGallery();
        });

        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'comms'), (snapshot) => {
            publicComms = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderPublicComms();
            if(isAuthenticated) renderAdminComms();
        });

        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest'), (docSnap) => {
            if(docSnap.exists()) {
                const data = docSnap.data();
                if(document.getElementById('tel-driver')) document.getElementById('tel-driver').innerText = data.driver || 'UNKNOWN';
                if(document.getElementById('tel-distance')) document.getElementById('tel-distance').innerText = (data.distance || 0) + ' KM';
                if(document.getElementById('tel-vibe')) document.getElementById('tel-vibe').innerText = data.vibe || 'UNKNOWN';
            }
        });
    }

    if(isNotesPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), (snapshot) => {
            publicNotes = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderNotes();
        });
    }
}

setupFirestoreListeners();

onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
        isAuthenticated = true;
        if(isMainPage) { renderAdminBanners(); renderAdminGallery(); renderAdminComms(); }
    } else {
        isAuthenticated = false;
    }
});

signInAnonymously(auth).catch(e => console.log(e));

// ==========================================
// BANNER RENDERING & CONTROLS (Updated)
// ==========================================
function renderPublicBanners() {
    if(!isMainPage) return;
    const activeBanners = publicBanners.filter(b => b.visible);
    const bannerElement = document.getElementById('event-banner');
    
    if (activeBanners.length === 0) { 
        bannerElement.style.display = 'none'; 
        clearInterval(bannerInterval); 
        return; 
    }

    bannerElement.style.display = 'block';
    
    // Hide arrows if only 1 banner
    document.getElementById('banner-prev-btn').style.display = activeBanners.length > 1 ? 'block' : 'none';
    document.getElementById('banner-next-btn').style.display = activeBanners.length > 1 ? 'block' : 'none';

    if(activeBannerIndex >= activeBanners.length) activeBannerIndex = 0;
    updateBannerUI(activeBanners);
    startBannerTimer(activeBanners);
}

function startBannerTimer(activeBanners) {
    clearInterval(bannerInterval);
    if (activeBanners.length > 1) {
        bannerInterval = setInterval(() => { window.nextBanner(); }, 8000);
    }
}

window.nextBanner = () => {
    const activeBanners = publicBanners.filter(b => b.visible);
    if(activeBanners.length <= 1) return;
    activeBannerIndex = (activeBannerIndex + 1) % activeBanners.length;
    updateBannerUI(activeBanners);
    startBannerTimer(activeBanners); // Reset timer on manual click
};

window.prevBanner = () => {
    const activeBanners = publicBanners.filter(b => b.visible);
    if(activeBanners.length <= 1) return;
    activeBannerIndex = (activeBannerIndex - 1 + activeBanners.length) % activeBanners.length;
    updateBannerUI(activeBanners);
    startBannerTimer(activeBanners); // Reset timer on manual click
};

function updateBannerUI(activeBanners) {
    const banner = activeBanners[activeBannerIndex];
    document.getElementById('banner-description').textContent = banner.text;
    document.getElementById('banner-meta').innerHTML = `Broadcast ${activeBannerIndex + 1} of ${activeBanners.length}`;
    
    // Format timestamp
    const dateOpts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('banner-timestamp').textContent = new Date(banner.timestamp).toLocaleString('en-US', dateOpts);
    
    const container = document.getElementById('banner-content-container');
    container.classList.remove('slide-up-anim');
    void container.offsetWidth; 
    container.classList.add('slide-up-anim');
}

// ==========================================
// COMMS POSTING (NO PIN REQUIRED)
// ==========================================
window.postComm = async () => {
    const author = document.getElementById('commAuthor').value;
    const msg = document.getElementById('commMessage').value.trim();

    if(!msg && !audioBase64) return showToast('Enter text or record audio', 'error');
    if (audioBase64 && audioBase64.length > 900000) return showToast('Audio file too large', 'error');

    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comms', id), {
            id: id, author: author, message: msg, audio: audioBase64 || null, timestamp: Date.now()
        });
        document.getElementById('commMessage').value = '';
        audioBase64 = null;
        if(document.getElementById('recordStatus')) {
            document.getElementById('recordStatus').textContent = 'Audio ready';
            document.getElementById('recordStatus').className = 'text-[10px] font-bold text-slate-400';
        }
        showToast('Transmission logged', 'success');
    } catch (e) { showToast('Transmission failed', 'error'); console.error(e); }
};

// ==========================================
// NEW: NOTES / IDEAS BOARD LOGIC
// ==========================================
window.addNote = async () => {
    const input = document.getElementById('newNoteInput');
    const text = input.value.trim();
    if(!text) return showToast('Enter an idea first', 'error');

    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id), {
            id: id, text: text, completed: false, timestamp: Date.now()
        });
        input.value = '';
        showToast('Idea added to board', 'success');
    } catch (e) { showToast('Failed to add idea', 'error'); }
};

window.toggleNoteStatus = async (id, isCompleted) => {
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id.toString()), {
            completed: !isCompleted
        }, { merge: true });
    } catch (e) { showToast('Failed to update', 'error'); }
};

function renderNotes() {
    const container = document.getElementById('notesContainer');
    if(!container) return;

    if(publicNotes.length === 0) {
        container.innerHTML = `<div class="text-center col-span-full py-10 text-slate-400 font-space text-sm">No ideas logged yet.</div>`;
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
                <button class="shrink-0 transition-colors ${iconColor}">
                    <i data-lucide="check-circle" class="w-6 h-6"></i>
                </button>
            </div>
            <div class="text-[10px] text-slate-400 font-space mt-4 block">
                ${new Date(n.timestamp).toLocaleDateString()}
            </div>
        </div>
    `}).join('');
    lucide.createIcons();
}

// ==========================================
// AUDIO RECORDING (Comms)
// ==========================================
window.toggleRecord = async () => {
    const btn = document.getElementById('recordBtn');
    const status = document.getElementById('recordStatus');
    if(!btn) return;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.innerHTML = `<i data-lucide="mic" class="w-5 h-5"></i>`;
        btn.classList.remove('animate-pulse', 'bg-red-500', 'text-white', 'border-red-600');
        btn.classList.add('bg-white/50', 'text-slate-500');
        clearTimeout(recordingTimer);
        lucide.createIcons();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
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
    } catch (err) { showToast('Microphone access denied', 'error'); }
};

// ==========================================
// GALLERY RENDERING
// ==========================================
function renderPublicGallery() {
    if(!isMainPage) return;
    const activeGallery = publicGallery.filter(g => g.visible);
    const grid = document.getElementById('public-gallery-grid');
    const emptyMsg = document.getElementById('emptyGalleryMessage');
    if (activeGallery.length === 0) { grid.innerHTML = ''; emptyMsg.style.display = 'block'; return; }
    emptyMsg.style.display = 'none';
    grid.innerHTML = activeGallery.map((item) => `
        <div class="gallery-item group cursor-pointer" onclick="window.openLightbox('${item.id}')">
            <img src="${item.image}" alt="Memory" loading="lazy" class="pointer-events-none">
            <div class="absolute inset-0 bg-gradient-to-t from-emerald-900/80 via-emerald-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-5 pointer-events-none">
                <div class="bg-white/20 backdrop-blur-md rounded-full p-2 border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.4)] pointer-events-auto hover:bg-white/40 transition-colors" onclick="window.openLightbox('${item.id}'); event.stopPropagation();">
                    <i data-lucide="maximize-2" class="w-5 h-5 text-white"></i>
                </div>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderPublicComms() {
    if(!isMainPage) return;
    const container = document.getElementById('commsContainer');
    if(publicComms.length === 0) { container.innerHTML = `<div class="text-center py-10 text-slate-400 font-space text-sm">No transmissions yet.</div>`; return; }
    container.innerHTML = publicComms.map(c => {
        const date = new Date(c.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
        const audioHtml = c.audio ? `<audio src="${c.audio}" controls class="w-full h-8 mt-3 custom-audio"></audio>` : '';
        const msgHtml = c.message ? `<p class="text-sm text-slate-700 leading-relaxed font-medium">${c.message}</p>` : '';
        return `
        <div class="bg-white/60 backdrop-blur-sm border border-white/80 p-4 rounded-2xl shadow-sm">
            <div class="flex justify-between items-start mb-2 border-b border-slate-200/50 pb-2">
                <span class="font-space font-bold text-cyan-600 text-xs tracking-widest flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i> ${c.author}</span>
                <span class="text-[10px] text-slate-400 font-space bg-white/50 px-2 py-0.5 rounded">${date}</span>
            </div>
            ${msgHtml} ${audioHtml}
        </div>
    `}).join('');
    lucide.createIcons();
}

// ==========================================
// GALLERY UPLOAD (Admin)
// ==========================================
window.handleImageSelect = async (e) => {
    if(!isAuthenticated) return showToast('Not authenticated', 'error');
    const file = e.target.files[0];
    if (!file) return;
    showToast('Compressing & Syncing...', 'success');
    try {
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image(); img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas'); let { width, height } = img;
                    const max = 1000; 
                    if (width > height && width > max) { height *= max / width; width = max; } 
                    else if (height > max) { width *= max / height; height = max; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
            };
        });
        const id = Date.now().toString();
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id), { id: id, image: base64, visible: true, timestamp: Date.now() });
        showToast('Securely vaulted', 'success');
    } catch(err) { showToast('Upload failed', 'error'); }
    e.target.value = '';
};

// ==========================================
// ADMIN CONTROLS
// ==========================================
window.authenticateAdmin = async () => {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('passwordInput').value;
    const btn = document.querySelector('#loginScreen .btn-admin-primary');
    if(!email || !pwd) { showToast('Enter Email and Code.', 'error'); return; }
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> AUTHENTICATING...`;
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').classList.add('active');
    } catch (e) { showToast('Access Denied', 'error'); btn.innerHTML = `UNLOCK PORTAL`; }
    lucide.createIcons();
};

window.logoutAdmin = async () => {
    await signOut(auth);
    window.location.hash = ''; window.location.reload();
};

window.addBanner = async () => {
    const text = document.getElementById('bannerText').value.trim();
    if (!text) return;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', Date.now().toString()), { id: Date.now().toString(), text: text, visible: true, timestamp: Date.now() });
    document.getElementById('bannerText').value = ''; showToast('Broadcasted', 'success');
};

window.toggleBannerVisibility = async (id, v) => await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id.toString()), { visible: !v }, { merge: true });
window.deleteBanner = async (id) => { if(confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id.toString())); };
window.toggleGalleryVisibility = async (id, v) => await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id.toString()), { visible: !v }, { merge: true });
window.deleteGalleryItem = async (id) => { if(confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id.toString())); };
window.deleteComm = async (id) => { if(confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comms', id.toString())); };

window.updateTelemetry = async () => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest'), {
        driver: document.getElementById('adminDriver').value,
        distance: document.getElementById('adminDist').value,
        vibe: document.getElementById('adminVibe').value.trim(),
        timestamp: Date.now()
    });
    showToast('Telemetry updated', 'success');
};

function renderAdminBanners() {
    const tbody = document.getElementById('bannersTableBody');
    if(!tbody) return;
    tbody.innerHTML = publicBanners.map(b => `<tr class="border-b border-slate-800"><td class="py-3 text-slate-300 truncate">${b.text}</td><td class="py-3"><label class="toggle-admin"><input type="checkbox" ${b.visible ? 'checked' : ''} onchange="window.toggleBannerVisibility('${b.id}', ${b.visible})"><span class="toggle-slider"></span></label></td><td class="py-3"><button class="text-red-400" onclick="window.deleteBanner('${b.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('');
    lucide.createIcons();
}
function renderAdminGallery() {
    const tbody = document.getElementById('galleryTableBody');
    if(!tbody) return;
    tbody.innerHTML = publicGallery.map(g => `<tr class="border-b border-slate-800"><td class="py-3"><img src="${g.image}" class="w-10 h-10 rounded object-cover"></td><td class="py-3"><label class="toggle-admin"><input type="checkbox" ${g.visible ? 'checked' : ''} onchange="window.toggleGalleryVisibility('${g.id}', ${g.visible})"><span class="toggle-slider"></span></label></td><td class="py-3"><button class="text-red-400" onclick="window.deleteGalleryItem('${g.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('');
    lucide.createIcons();
}
function renderAdminComms() {
    const tbody = document.getElementById('adminCommsTableBody');
    if(!tbody) return;
    tbody.innerHTML = publicComms.map(c => `<tr class="border-b border-slate-800"><td class="py-3 text-cyan-400 text-xs">${c.author}</td><td class="py-3 text-slate-300 truncate">${c.message||'AUDIO'}</td><td class="py-3 text-slate-500 text-xs">${new Date(c.timestamp).toLocaleDateString()}</td><td class="py-3"><button class="text-red-400" onclick="window.deleteComm('${c.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('');
    lucide.createIcons();
}

// ==========================================
// UTILS & MAP INIT
// ==========================================
function showToast(msg, type) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type} flex items-center gap-3`; 
    t.innerHTML = `<i data-lucide="${type==='success'?'check-circle':'alert-circle'}" class="w-5 h-5"></i><span>${msg}</span>`;
    c.appendChild(t); lucide.createIcons();
    setTimeout(() => { t.style.animation = 'slideIn 0.3s ease reverse'; setTimeout(()=>t.remove(), 300); }, 3000);
}

function handleRoute() {
    if(!isMainPage) return;
    const hash = window.location.hash;
    if (hash === '#admin') {
        document.getElementById('public-view').style.display = 'none';
        document.getElementById('admin-view').style.display = 'block';
        window.scrollTo(0, 0);
    } else {
        document.getElementById('admin-view').style.display = 'none';
        document.getElementById('public-view').style.display = 'block';
        if(!mapInitialized) { setTimeout(initMapAndGraphics, 100); mapInitialized = true; }
    }
}
window.addEventListener('hashchange', handleRoute);

window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 800); }
        if(isMainPage) handleRoute();
        lucide.createIcons();
    }, 1000);
});

// Lightbox
window.openLightbox = (id) => { currentGalleryId = id; const item = publicGallery.find(g => g.id === id); if(item) { document.getElementById('lightboxImage').src = item.image; document.getElementById('galleryLightbox').classList.add('active'); } };
window.closeLightbox = () => { document.getElementById('galleryLightbox').classList.remove('active'); };

function initMapAndGraphics() {
    if(!document.getElementById('real-map')) return;
    
    // MAP
    const mapData = [
        { id: "001", name: "ANGAMALY", status: "DEPARTURE", desc: "Origin.", coords: [10.2191, 76.2506], markerHex: '#ec4899'},
        { id: "002", name: "MYSORE", status: "WAYPOINT", desc: "Mid-point.", coords: [12.2958, 76.6394], markerHex: '#f97316'},
        { id: "003", name: "BANGALORE", status: "DESTINATION", desc: "Final target.", coords: [12.9716, 77.5946], markerHex: '#8b5cf6'}
    ];
    const realMap = L.map('real-map', { zoomControl: false }).setView([11.6, 76.8], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(realMap);
    const forwardCoords = mapData.map(d=>d.coords);
    L.polyline(forwardCoords, { color: '#ec4899', weight: 6, opacity: 0.8 }).addTo(realMap);
    L.polyline(forwardCoords, { color: '#ffffff', weight: 2, className: 'route-flow-forward' }).addTo(realMap);
    L.polyline([mapData[2].coords, mapData[0].coords], { color: '#8b5cf6', weight: 4, opacity: 0.5, dashArray: '5, 5' }).addTo(realMap);
    L.polyline([mapData[2].coords, mapData[0].coords], { color: '#06b6d4', weight: 3, className: 'route-flow-return' }).addTo(realMap);
    mapData.forEach((loc, index) => {
        L.marker(loc.coords, { icon: L.divIcon({ className: 'custom-vibrant-marker', html: `<div class="relative flex items-center justify-center"><div class="absolute w-12 h-12 rounded-full animate-ping" style="background-color: ${loc.markerHex}; opacity: 0.4;"></div><div class="w-6 h-6 rounded-full border-4 border-white shadow-lg z-10" style="background-color: ${loc.markerHex};"></div></div>`, iconSize: [48, 48] }) }).addTo(realMap);
    });

    // THREE.JS
    const container = document.getElementById('hero-canvas-container');
    if(container && !container.hasChildNodes()) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.set(0, 8, 25);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); container.appendChild(renderer.domElement);
        const geo = new THREE.PlaneGeometry(200, 200, 60, 60); const plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x059669, wireframe: true, transparent: true, opacity: 0.7 })); plane.rotation.x = -Math.PI / 2; plane.position.y = -8; scene.add(plane);
        function animate() {
            requestAnimationFrame(animate);
            const time = Date.now() * 0.001; const positions = plane.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getX(i) * 0.1 + time) * 1.5 + Math.cos(positions.getY(i) * 0.1 + time) * 1.5);
            positions.needsUpdate = true; plane.position.z += 0.02; if (plane.position.z > 5) plane.position.z = 0; 
            renderer.render(scene, camera);
        }
        animate();
    }
}
