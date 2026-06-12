import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Setup
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
let isAuthenticated = false;
let mapInitialized = false;

let activeBannerIndex = 0;
let bannerInterval = null;

// Hyperdrive Variables
let hyperdriveMode = false;
let logoClicks = 0;
let clickTimer = null;

// Audio Variables
let mediaRecorder;
let audioChunks = [];
let audioBase64 = null;
let recordingTimer = null;

// 1. Setup Realtime Listeners
let listenersSetup = false;
function setupFirestoreListeners() {
    if (listenersSetup) return;
    listenersSetup = true;
    
    const bannersRef = collection(db, 'artifacts', appId, 'public', 'data', 'banners');
    const galleryRef = collection(db, 'artifacts', appId, 'public', 'data', 'gallery');
    const commsRef = collection(db, 'artifacts', appId, 'public', 'data', 'comms');
    const telemetryRef = doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest');

    onSnapshot(bannersRef, (snapshot) => {
        publicBanners = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
        renderPublicBanners();
        if(isAuthenticated) renderAdminBanners();
    });

    onSnapshot(galleryRef, (snapshot) => {
        publicGallery = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
        renderPublicGallery();
        if(isAuthenticated) renderAdminGallery();
    });

    onSnapshot(commsRef, (snapshot) => {
        publicComms = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
        renderPublicComms();
        if(isAuthenticated) renderAdminComms();
    });

    onSnapshot(telemetryRef, (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            const dEl = document.getElementById('tel-driver');
            const distEl = document.getElementById('tel-distance');
            const vEl = document.getElementById('tel-vibe');
            if(dEl) dEl.innerText = data.driver || 'UNKNOWN';
            if(distEl) distEl.innerText = (data.distance || 0) + ' KM';
            if(vEl) vEl.innerText = data.vibe || 'UNKNOWN';

            if(document.getElementById('adminDist')) {
                document.getElementById('adminDriver').value = data.driver || 'ANOOP';
                document.getElementById('adminDist').value = data.distance || '';
                document.getElementById('adminVibe').value = data.vibe || '';
            }
        }
    });
}

setupFirestoreListeners();

onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
        isAuthenticated = true;
        renderAdminBanners();
        renderAdminGallery();
        renderAdminComms();
    } else {
        isAuthenticated = false;
    }
});

const initAuth = async () => {
    try { await signInAnonymously(auth); } catch (error) { console.log(error); }
};
initAuth();

// ==========================================
// EXTERNAL APIS (Weather)
// ==========================================
async function fetchWeather() {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=10.2191,12.2958,12.9716&longitude=76.2506,76.6394,77.5946&current_weather=true');
        const data = await res.json();
        const cities = ['ANGAMALY', 'MYSORE', 'BANGALORE'];
        let html = '';
        
        if(data && data.length || (data.current_weather && Array.isArray(data))) {
             data.forEach((d, i) => {
                 const temp = d.current_weather ? d.current_weather.temperature : '--';
                 const wind = d.current_weather ? d.current_weather.windspeed : '--';
                 html += `
                    <div class="flex justify-between items-center gap-6">
                        <span class="text-xs font-space font-bold text-slate-300">${cities[i]}</span>
                        <span class="text-xs font-space text-cyan-300 font-bold">${temp}°C <span class="text-slate-500 ml-1 opacity-50">|</span> <span class="text-cyan-600 ml-1">${wind}km/h</span></span>
                    </div>
                 `;
             });
        } else {
             html = `<div class="text-xs text-cyan-400 font-space font-bold">ATMOSPHERIC DATA ACQUIRED</div>`;
        }
        
        const wBox = document.getElementById('weather-hud');
        if(wBox) wBox.innerHTML = html || `<div class="text-xs text-cyan-400 font-space font-bold">SYS ONLINE: 28°C AVG</div>`;
    } catch(e) {
        const wBox = document.getElementById('weather-hud');
        if(wBox) wBox.innerHTML = `<div class="text-xs text-cyan-400 font-space font-bold">SYS ONLINE: 28°C AVG</div>`;
    }
}
setTimeout(fetchWeather, 2000);

// ==========================================
// PUBLIC VIEW RENDERING
// ==========================================
function renderPublicBanners() {
    const activeBanners = publicBanners.filter(b => b.visible);
    const bannerElement = document.getElementById('event-banner');
    clearInterval(bannerInterval);
    if (activeBanners.length === 0) { bannerElement.style.display = 'none'; return; }
    bannerElement.style.display = 'block';
    activeBannerIndex = 0;
    updateBannerUI(activeBanners);
    if (activeBanners.length > 1) {
        bannerInterval = setInterval(() => {
            activeBannerIndex = (activeBannerIndex + 1) % activeBanners.length;
            updateBannerUI(activeBanners);
        }, 6000);
    }
}

function updateBannerUI(activeBanners) {
    const banner = activeBanners[activeBannerIndex];
    const descEl = document.getElementById('banner-description');
    const metaEl = document.getElementById('banner-meta');
    const container = document.getElementById('banner-content-container');
    container.classList.remove('slide-up-anim');
    void container.offsetWidth; 
    descEl.textContent = banner.text;
    metaEl.innerHTML = `<i data-lucide="radio" class="w-3 h-3 text-emerald-500 animate-pulse"></i><span>Broadcast ${activeBannerIndex + 1} of ${activeBanners.length}</span>`;
    container.classList.add('slide-up-anim');
    lucide.createIcons();
}

function renderPublicGallery() {
    const activeGallery = publicGallery.filter(g => g.visible);
    const grid = document.getElementById('public-gallery-grid');
    const emptyMsg = document.getElementById('emptyGalleryMessage');
    if (activeGallery.length === 0) {
        grid.innerHTML = ''; emptyMsg.style.display = 'block'; return;
    }
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
    const container = document.getElementById('commsContainer');
    if(!container) return;
    if(publicComms.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-400 font-space text-sm">No transmissions yet.</div>`;
        return;
    }
    container.innerHTML = publicComms.map(c => {
        const date = new Date(c.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
        const audioHtml = c.audio ? `<audio src="${c.audio}" controls class="w-full h-8 mt-3 custom-audio"></audio>` : '';
        const msgHtml = c.message ? `<p class="text-sm text-slate-700 leading-relaxed font-medium">${c.message}</p>` : '';
        return `
        <div class="bg-white/60 backdrop-blur-sm border border-white/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start mb-2 border-b border-slate-200/50 pb-2">
                <span class="font-space font-bold text-cyan-600 text-xs tracking-widest flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i> ${c.author}</span>
                <span class="text-[10px] text-slate-400 font-space bg-white/50 px-2 py-0.5 rounded">${date}</span>
            </div>
            ${msgHtml}
            ${audioHtml}
        </div>
    `}).join('');
    lucide.createIcons();
}

window.scrollGallery = (direction) => {
    const grid = document.getElementById('public-gallery-grid');
    grid.scrollBy({ left: direction * 320, behavior: 'smooth' });
};

// ==========================================
// CREW COMMS AUDIO RECORDING
// ==========================================
window.toggleRecord = async () => {
    const btn = document.getElementById('recordBtn');
    const status = document.getElementById('recordStatus');

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
                showToast('Max audio length reached (15s)', 'success');
            }
        }, 15000);
    } catch (err) { console.error("Mic error:", err); showToast('Microphone access denied', 'error'); }
};

window.postComm = async () => {
    const author = document.getElementById('commAuthor').value;
    const msg = document.getElementById('commMessage').value.trim();
    const pin = document.getElementById('commPin').value;

    if(!msg && !audioBase64) return showToast('Enter text or record audio', 'error');
    if(pin !== '2026') return showToast('AUTH FAILED: Invalid PIN', 'error');
    if (audioBase64 && audioBase64.length > 900000) return showToast('Audio file too large', 'error');

    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comms', id), {
            id: id, author: author, message: msg, audio: audioBase64 || null, timestamp: Date.now()
        });
        document.getElementById('commMessage').value = '';
        document.getElementById('commPin').value = '';
        audioBase64 = null;
        const status = document.getElementById('recordStatus');
        status.textContent = 'Audio ready';
        status.className = 'text-[10px] font-bold text-slate-400';
        showToast('Transmission logged', 'success');
    } catch (e) { showToast('Transmission failed', 'error'); }
};

// ==========================================
// HYPERDRIVE EASTER EGG
// ==========================================
window.triggerHyperdrive = () => {
    logoClicks++;
    clearTimeout(clickTimer);
    if(logoClicks >= 3 && !hyperdriveMode) {
        activateHyperdrive();
        logoClicks = 0;
    } else {
        clickTimer = setTimeout(()=> { logoClicks=0; }, 1000);
    }
};

function activateHyperdrive() {
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
// ADMIN AUTHENTICATION & ACTIONS
// ==========================================
window.authenticateAdmin = async () => {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('passwordInput').value;
    const btn = document.querySelector('#loginScreen .btn-admin-primary');
    
    if(!email || !pwd) { showToast('Enter both Email and Access Code.', 'error'); return; }
    
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
    try { await signOut(auth); } catch (e) {}
    window.location.hash = '';
    window.location.reload();
};

window.addBanner = async () => {
    if(!isAuthenticated) return showToast('Not authenticated', 'error');
    const text = document.getElementById('bannerText').value.trim();
    if (!text) return showToast('Enter text to broadcast', 'error');
    const id = Date.now().toString();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id), { id: id, text: text, visible: true, timestamp: Date.now() });
        document.getElementById('bannerText').value = '';
        showToast('Broadcast live synced', 'success');
    } catch (e) { showToast('Sync failed', 'error'); }
};

window.toggleBannerVisibility = async (id, currentVis) => { if(!isAuthenticated) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id.toString()), { visible: !currentVis }, { merge: true }); };
window.deleteBanner = async (id) => { if(!isAuthenticated || !confirm('Delete transmission from cloud?')) return; await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banners', id.toString())); showToast('Transmission deleted', 'success'); };
window.toggleGalleryVisibility = async (id, currentVis) => { if(!isAuthenticated) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id.toString()), { visible: !currentVis }, { merge: true }); };
window.deleteGalleryItem = async (id) => { if(!isAuthenticated || !confirm('Delete memory from cloud?')) return; await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id.toString())); showToast('Memory wiped', 'success'); };
window.deleteComm = async (id) => { if(!isAuthenticated || !confirm('Delete this crew comm?')) return; await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comms', id.toString())); showToast('Comm deleted', 'success'); };

window.updateTelemetry = async () => {
    if(!isAuthenticated) return;
    const driver = document.getElementById('adminDriver').value;
    const dist = document.getElementById('adminDist').value;
    const vibe = document.getElementById('adminVibe').value.trim();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest'), { driver: driver, distance: dist, vibe: vibe, timestamp: Date.now() });
        showToast('Telemetry updated', 'success');
    } catch (e) { showToast('Update failed', 'error'); }
};

// ADMIN RENDERING
function renderAdminBanners() {
    const tbody = document.getElementById('bannersTableBody');
    if(publicBanners.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-slate-500"><i data-lucide="radio" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>No active broadcasts.</td></tr>'; lucide.createIcons(); return; }
    tbody.innerHTML = publicBanners.map(b => `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td class="max-w-xs truncate py-3 font-medium text-slate-300">${b.text}</td>
            <td class="py-3"><label class="toggle-admin"><input type="checkbox" ${b.visible ? 'checked' : ''} onchange="window.toggleBannerVisibility('${b.id}', ${b.visible})"><span class="toggle-slider"></span></label></td>
            <td class="py-3"><button class="btn-admin-danger rounded" onclick="window.deleteBanner('${b.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `).join(''); lucide.createIcons();
}

function renderAdminGallery() {
    const tbody = document.getElementById('galleryTableBody');
    if(publicGallery.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-slate-500"><i data-lucide="image-off" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>Vault is empty.</td></tr>'; lucide.createIcons(); return; }
    tbody.innerHTML = publicGallery.map(g => `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td class="py-3"><img src="${g.image}" class="w-14 h-14 rounded-lg object-cover border border-slate-700 shadow-md"></td>
            <td class="py-3"><label class="toggle-admin"><input type="checkbox" ${g.visible ? 'checked' : ''} onchange="window.toggleGalleryVisibility('${g.id}', ${g.visible})"><span class="toggle-slider"></span></label></td>
            <td class="py-3"><button class="btn-admin-danger rounded" onclick="window.deleteGalleryItem('${g.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `).join(''); lucide.createIcons();
}

function renderAdminComms() {
    const tbody = document.getElementById('adminCommsTableBody');
    if(!tbody) return;
    if(publicComms.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-slate-500">No comms logged.</td></tr>'; lucide.createIcons(); return; }
    tbody.innerHTML = publicComms.map(c => {
        const date = new Date(c.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit'});
        const audioLabel = c.audio ? '<span class="text-emerald-400 font-bold ml-2 text-[10px] bg-emerald-900/30 px-1 py-0.5 rounded">[AUDIO]</span>' : '';
        return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td class="py-3 text-cyan-400 font-bold text-xs">${c.author}</td>
            <td class="py-3 text-slate-300 max-w-xs truncate">${c.message || '---'} ${audioLabel}</td>
            <td class="py-3 text-slate-500 text-xs">${date}</td>
            <td class="py-3"><button class="btn-admin-danger rounded" onclick="window.deleteComm('${c.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `}).join(''); lucide.createIcons();
}

// IMAGE COMPRESSION & UPLOAD
const dropZone = document.getElementById('dropZone');
const imageInput = document.getElementById('imageInput');
dropZone.addEventListener('click', () => imageInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); dropZone.style.borderColor = '#06b6d4'; });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); dropZone.style.borderColor = ''; });
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); dropZone.style.borderColor = ''; window.handleImageSelect({target: {files: e.dataTransfer.files}}); });

function compressImage(file) {
    return new Promise((resolve) => {
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
}

window.handleImageSelect = async (e) => {
    if(!isAuthenticated) return showToast('Not authenticated', 'error');
    const file = e.target.files[0];
    if (!file) return;
    showToast('Compressing & Syncing data...', 'success');
    try {
        const base64 = await compressImage(file);
        const id = Date.now().toString();
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gallery', id), { id: id, image: base64, visible: true, timestamp: Date.now() });
        showToast('Memory securely vaulted', 'success');
    } catch(err) { showToast('Upload failed', 'error'); }
    e.target.value = '';
};

// LIGHTBOX
let currentGalleryId = null;
window.openLightbox = (id) => {
    currentGalleryId = id;
    const item = publicGallery.find(g => g.id === id);
    if(item) {
        document.getElementById('lightboxImage').src = item.image;
        document.getElementById('galleryLightbox').classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};
window.closeLightbox = () => { document.getElementById('galleryLightbox').classList.remove('active'); document.body.style.overflow = 'auto'; };
window.nextGalleryImage = () => {
    const active = publicGallery.filter(g => g.visible);
    const idx = active.findIndex(g => g.id === currentGalleryId);
    if(idx !== -1 && active.length > 0) window.openLightbox(active[(idx + 1) % active.length].id);
};
window.previousGalleryImage = () => {
    const active = publicGallery.filter(g => g.visible);
    const idx = active.findIndex(g => g.id === currentGalleryId);
    if(idx !== -1 && active.length > 0) window.openLightbox(active[(idx - 1 + active.length) % active.length].id);
};

document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('galleryLightbox');
    if(lb && lb.classList.contains('active')) {
        if(e.key === 'ArrowRight') window.nextGalleryImage();
        if(e.key === 'ArrowLeft') window.previousGalleryImage();
        if(e.key === 'Escape') window.closeLightbox();
    }
});

// UTILS & ROUTING
function showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type} flex items-center gap-3`; 
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    t.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i> <span>${msg}</span>`;
    container.appendChild(t);
    lucide.createIcons();
    setTimeout(() => { t.style.animation = 'slideIn 0.3s ease reverse'; setTimeout(()=>t.remove(), 300); }, 3000);
}

function handleRoute() {
    const hash = window.location.hash;
    if (hash === '#admin') {
        document.getElementById('public-view').style.display = 'none';
        document.getElementById('admin-view').style.display = 'block';
        document.body.style.overflow = 'auto';
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
        handleRoute();
        lucide.createIcons();
    }, 1000);
});

// MAP & GRAPHICS INIT
function initMapAndGraphics() {
    function reveal() {
        var reveals = document.querySelectorAll(".reveal");
        for (var i = 0; i < reveals.length; i++) {
            var windowHeight = window.innerHeight;
            var elementTop = reveals[i].getBoundingClientRect().top;
            var elementVisible = 100;
            if (elementTop < windowHeight - elementVisible) reveals[i].classList.add("active");
        }
    }
    window.addEventListener("scroll", reveal);
    reveal();

    const mapData = [
        { id: "001", name: "ANGAMALY", status: "DEPARTURE", desc: "Origin point. Systems initialized.", color: "text-pink-500", bg: "bg-pink-100", coords: [10.2191, 76.2506], markerHex: '#ec4899'},
        { id: "002", name: "MYSORE", status: "WAYPOINT", desc: "Mid-point coordinates reached.", color: "text-orange-500", bg: "bg-orange-100", coords: [12.2958, 76.6394], markerHex: '#f97316'},
        { id: "003", name: "BANGALORE", status: "DESTINATION", desc: "Final target acquired.", color: "text-violet-500", bg: "bg-violet-100", coords: [12.9716, 77.5946], markerHex: '#8b5cf6'}
    ];
    const realMap = L.map('real-map', { zoomControl: false }).setView([11.6, 76.8], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap', subdomains: 'abcd', maxZoom: 20 }).addTo(realMap);
    L.control.zoom({ position: 'bottomright' }).addTo(realMap);

    const forwardCoords = mapData.map(d=>d.coords);
    L.polyline(forwardCoords, { color: '#ec4899', weight: 6, opacity: 0.8 }).addTo(realMap);
    L.polyline(forwardCoords, { color: '#ffffff', weight: 2, className: 'route-flow-forward' }).addTo(realMap);

    const returnCoords = [mapData[2].coords, mapData[0].coords];
    L.polyline(returnCoords, { color: '#8b5cf6', weight: 4, opacity: 0.5, dashArray: '5, 5' }).addTo(realMap);
    L.polyline(returnCoords, { color: '#06b6d4', weight: 3, className: 'route-flow-return' }).addTo(realMap);
    
    function updateMapInfo(index) {
        const hud = document.getElementById('map-hud');
        const data = mapData[index];
        hud.innerHTML = `
            <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                <div class="font-space font-bold text-xs tracking-[0.2em] text-slate-400">NAV PNT ${data.id}</div>
                <div class="${data.color} ${data.bg} text-[10px] tracking-widest font-bold px-3 py-1.5 rounded-md shadow-sm border border-white">${data.status}</div>
            </div>
            <h3 class="text-3xl font-black font-space mb-3 tracking-tight text-slate-800">${data.name}</h3>
            <p class="text-sm text-slate-500 leading-relaxed font-medium mb-6">${data.desc}</p>
            <div class="flex items-center gap-2 text-xs font-space font-bold text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">
                <i data-lucide="crosshair" class="w-4 h-4"></i> LAT: ${data.coords[0].toFixed(4)} LNG: ${data.coords[1].toFixed(4)}
            </div>
        `;
        lucide.createIcons();
        realMap.setView(data.coords, 8, { animate: true });
    }
    mapData.forEach((loc, index) => {
        const vibrantIcon = L.divIcon({
            className: 'custom-vibrant-marker',
            html: `<div class="relative flex items-center justify-center"><div class="absolute w-12 h-12 rounded-full animate-ping" style="background-color: ${loc.markerHex}; opacity: 0.4;"></div><div class="w-6 h-6 rounded-full border-4 border-white shadow-lg z-10" style="background-color: ${loc.markerHex};"></div></div>`,
            iconSize: [48, 48], iconAnchor: [24, 24]
        });
        const marker = L.marker(loc.coords, { icon: vibrantIcon }).addTo(realMap);
        marker.on('click', () => updateMapInfo(index));
    });
    updateMapInfo(0);

    // Three.js Dynamic Wavy Grid
    const container = document.getElementById('hero-canvas-container');
    if(container && !container.hasChildNodes()) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 8, 25);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        
        // MAIN EMERALD GRID
        const geo = new THREE.PlaneGeometry(200, 200, 60, 60);
        const mat = new THREE.MeshBasicMaterial({ color: 0x059669, wireframe: true, transparent: true, opacity: 0.7 });
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = -Math.PI / 2; plane.position.y = -8;
        scene.add(plane);

        // SECONDARY CYAN GRID 
        const geo2 = new THREE.PlaneGeometry(200, 200, 40, 40);
        const mat2 = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.3 });
        const plane2 = new THREE.Mesh(geo2, mat2);
        plane2.rotation.x = -Math.PI / 2; plane2.position.y = -10;
        scene.add(plane2);
        
        // FLOATING DATA PARTICLES
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 500;
        const posArray = new Float32Array(starsCount * 3);
        for(let i=0; i<starsCount*3; i++) { posArray[i] = (Math.random() - 0.5) * 150; }
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
            
            plane.position.z += 0.02 * speedMod; if (plane.position.z > 5) plane.position.z = 0; 
            plane2.position.z += 0.01 * speedMod; if (plane2.position.z > 5) plane2.position.z = 0; 

            starPoints.rotation.y += 0.0005 * speedMod;
            starPoints.position.y += 0.02 * speedMod;
            if(starPoints.position.y > 20) starPoints.position.y = -10;

            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // Countdown Setup
    const targetDate = new Date("2026-07-11T00:30:00Z").getTime();
    setInterval(() => {
        const now = new Date().getTime();
        const dist = targetDate - now;
        if(dist < 0) return;
        const d = document.getElementById('cd-days');
        if(d) {
            d.innerText = Math.floor(dist / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
            document.getElementById('cd-hours').innerText = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0');
            document.getElementById('cd-minutes').innerText = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
            document.getElementById('cd-seconds').innerText = Math.floor((dist % (1000 * 60)) / 1000).toString().padStart(2, '0');
        }
    }, 1000);
