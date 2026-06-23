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

// Audio Recording State
let mediaRecorder; 
let audioChunks = []; 
let audioBase64 = null; 
let recordingTimer = null;
let tempCrewPhoto = null;
let editingCrewId = null; 

// Routing Context Checks
const isMainPage = !!document.getElementById('public-view');
const isNotesPage = !!document.getElementById('newNoteInput');
const isCommsPage = !!document.getElementById('commMessage');
const isGalleryPage = !!document.getElementById('gallery-dynamic-container');

// Map Control Variables
let mapInitialized = false;
let realMapInstance = null;
let mapMarkersLayer = null;

// Global Departure Date for Countdown
window.missionDepartureDate = "2026-07-11T10:30:00Z";

// FOUC & Loader Synchronization Variables
let metadataLoaded = false;
let initialLoadComplete = false;

// Easter Egg
let hyperdriveMode = false; 
let logoClicks = 0; 
let clickTimer = null;

let listenersSetup = false;

// --- DYNAMIC ROUTE AUTOCOMPLETE VARIABLES ---
let currentRoutePoints = [];
let searchTimeout = null;

// ==========================================
// UTILITY: HEX TO RGB FOR DYNAMIC THEME
// ==========================================
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return "56, 189, 248";
}

// ==========================================
// FIREBASE REAL-TIME LISTENERS
// ==========================================
function setupFirestoreListeners() {
    if (listenersSetup) return;
    listenersSetup = true;
    
    // 1. Crew Roster
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'crew'), (snapshot) => {
        publicCrew = snapshot.docs.map(d => d.data()).sort((a, b) => a.crewId.localeCompare(b.crewId));
        
        if (isMainPage) { 
            renderPublicCrew(); 
            if (isAuthenticated) {
                renderAdminCrew(); 
            }
            updateDriverDropdown(); 
        }
        
        if (isCommsPage || isMainPage) { 
            updateCommsAuthorDropdown(); 
        }
    });

    if (isMainPage) {
        // --- 2. TRIP METADATA LISTENER ---
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'trip_meta', 'latest'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // --- APPLY DYNAMIC THEME COLOR ---
                const root = document.documentElement;
                const activeColor = data.themeColor || '#38bdf8';
                root.style.setProperty('--theme-hex', activeColor);
                root.style.setProperty('--theme-rgb', hexToRgb(activeColor));

                // --- APPLY DYNAMIC BACKGROUND IMAGE ---
                const bgLayer = document.getElementById('global-bg-layer');
                if (bgLayer && data.bgImage) {
                    bgLayer.style.backgroundImage = `url('${data.bgImage}')`;
                }
                
                // Update HTML DOM Elements dynamically
                if (document.getElementById('meta-loader-name')) {
                    document.getElementById('meta-loader-name').innerText = data.projectName || 'VOYAGER';
                }
                if (document.getElementById('meta-nav-name')) {
                    document.getElementById('meta-nav-name').innerText = data.projectName || 'VOYAGER';
                }
                if (document.getElementById('meta-hero-title')) {
                    document.getElementById('meta-hero-title').innerText = data.heroTitle || 'AIRCROSS ODYSSEY';
                }
                
                // Set the global departure date for the independent countdown timer
                if (data.departureDate) {
                    window.missionDepartureDate = data.departureDate;
                }

                // Format and display the new datetime-local string beautifully
                if (document.getElementById('meta-hero-date')) {
                    const dStr = data.departureDate;
                    if (dStr) {
                        const dateObj = new Date(dStr);
                        if (!isNaN(dateObj.getTime())) {
                            const formatted = dateObj.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                            document.getElementById('meta-hero-date').innerText = formatted.toUpperCase();
                        } else {
                            document.getElementById('meta-hero-date').innerText = '11 JULY 2026, 10:30 AM';
                        }
                    } else {
                        document.getElementById('meta-hero-date').innerText = '11 JULY 2026, 10:30 AM';
                    }
                }

                if (document.getElementById('meta-hero-desc')) {
                    document.getElementById('meta-hero-desc').innerText = data.heroDesc || '6 friends, 1 magnificent Citroën Aircross, and hundreds of kilometers mapped beautifully into one experience.';
                }
                if (document.getElementById('meta-machine-name')) {
                    document.getElementById('meta-machine-name').innerText = data.chariotName || 'Citroën Aircross';
                }
                if (document.getElementById('meta-machine-platform')) {
                    document.getElementById('meta-machine-platform').innerText = data.chariotPlatform || 'AX-7 PLATFORM';
                }
                
                // Set Dynamic Section Titles
                if (document.getElementById('meta-countdown-title')) {
                    document.getElementById('meta-countdown-title').innerText = data.countdownTitle || 'T-Minus Launch';
                }
                if (document.getElementById('meta-map-title')) {
                    document.getElementById('meta-map-title').innerText = data.mapTitle || 'Trajectory Map';
                }
                if (document.getElementById('meta-roster-title')) {
                    document.getElementById('meta-roster-title').innerText = data.rosterTitle || 'Squadron Roster';
                }

                if (document.getElementById('meta-footer-title')) {
                    document.getElementById('meta-footer-title').innerText = data.projectName || 'VOYAGER';
                }
                if (document.getElementById('meta-footer-tagline')) {
                    document.getElementById('meta-footer-tagline').innerText = data.footerTagline || 'MAPPING THE UNKNOWN // EMBRACING THE JOURNEY // CHASING THE HORIZON';
                }
                
                // Read and set the active route array fetched from Firebase
                currentRoutePoints = data.routePoints || [];
                
                // Populate Admin Form Fields to match database state
                if (document.getElementById('adminMetaProj')) {
                    document.getElementById('adminMetaProj').value = data.projectName || '';
                    document.getElementById('adminMetaTitle').value = data.heroTitle || '';
                    document.getElementById('adminMetaDate').value = data.departureDate || ''; 
                    document.getElementById('adminMetaDesc').value = data.heroDesc || '';
                    document.getElementById('adminMetaChariot').value = data.chariotName || '';
                    document.getElementById('adminMetaPlatform').value = data.chariotPlatform || '';
                    document.getElementById('adminThemeColor').value = activeColor;
                    
                    document.getElementById('adminMetaCountdownTitle').value = data.countdownTitle || '';
                    document.getElementById('adminMetaMapTitle').value = data.mapTitle || '';
                    document.getElementById('adminMetaRosterTitle').value = data.rosterTitle || '';
                    
                    document.getElementById('adminMetaTagline').value = data.footerTagline || '';
                    
                    // We don't refill the file input programmatically for security reasons,
                    // but we store the base64 value in a hidden input so we don't overwrite it with null if unchanged
                    document.getElementById('adminMetaBgBase64').value = data.bgImage || '';

                    renderAdminRouteTags();
                }

                // Update Hero Section Chevrons
                const routeContainer = document.getElementById('meta-hero-route');
                if (routeContainer && currentRoutePoints.length > 0) {
                    let routeHtml = '';
                    currentRoutePoints.forEach((point, index) => {
                        routeHtml += `<span class="hover:text-white cursor-default transition-colors">${point.name}</span>`;
                        if (index < currentRoutePoints.length - 1) {
                            routeHtml += `<i data-lucide="chevron-right" class="w-3 h-3 theme-text"></i>`;
                        }
                    });
                    routeContainer.innerHTML = routeHtml;
                    lucide.createIcons();
                }

                // Call dynamic weather and update map if already initialized
                fetchDynamicWeather();
                
                if (mapInitialized) {
                    updatePublicMap(currentRoutePoints);
                }

                // FOUC Fix: Hide Loader only after metadata has fully populated the HTML
                metadataLoaded = true;
                checkAndHideLoader();
            } else {
                metadataLoaded = true;
                checkAndHideLoader();
            }
        });

        // 3. Banners Listener
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'banners'), (snapshot) => {
            publicBanners = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderPublicBanners(); 
            if (isAuthenticated) {
                renderAdminBanners();
            }
        });

        // 4. Telemetry Listener
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'telemetry', 'latest'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (document.getElementById('tel-driver')) {
                    document.getElementById('tel-driver').innerText = data.driver || 'AWAITING';
                }
                if (document.getElementById('tel-distance')) {
                    document.getElementById('tel-distance').innerText = (data.distance || 0) + ' KM';
                }
                if (document.getElementById('tel-vibe')) {
                    document.getElementById('tel-vibe').innerText = data.vibe || 'UNKNOWN';
                }
                
                if (document.getElementById('adminDist')) {
                    document.getElementById('adminDriver').value = data.driver || 'AWAITING';
                    document.getElementById('adminDist').value = data.distance || '';
                    document.getElementById('adminVibe').value = data.vibe || '';
                }
            }
        });
    }

    // 5. Gallery Listener
    if (isMainPage || isGalleryPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'gallery'), (snapshot) => {
            publicGallery = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            if (isGalleryPage) {
                renderDedicatedGallery(); 
            }
            if (isMainPage && isAuthenticated) {
                renderAdminGallery();
            }
        });
    }

    // 6. Comms Listener
    if (isCommsPage || isMainPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'comms'), (snapshot) => {
            publicComms = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            if (isCommsPage || isMainPage) {
                renderPublicComms(); 
            }
            if (isAuthenticated && isMainPage) {
                renderAdminComms();
            }
        });
    }

    // 7. Notes Listener
    if (isNotesPage) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), (snapshot) => {
            publicNotes = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
            renderNotes();
        });
    }
}

// ==========================================
// AUTHENTICATION LOGIC (WITH RACE CONDITION FIX)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Once the user session (anonymous or admin) is ready, it is safe to read Firestore!
        isAuthenticated = !user.isAnonymous;
        
        setupFirestoreListeners();

        if (isMainPage && isAuthenticated) {
            renderAdminBanners(); 
            renderAdminGallery(); 
            renderAdminComms(); 
            renderAdminCrew();
            
            document.getElementById('loginScreen').classList.add('hidden'); 
            document.getElementById('dashboard').classList.remove('hidden');
        }
    } else {
        isAuthenticated = false;
        
        if (isMainPage) { 
            document.getElementById('loginScreen').classList.remove('hidden'); 
            document.getElementById('dashboard').classList.add('hidden'); 
        }
    }
});

const initAuth = async () => { 
    try { 
        await signInAnonymously(auth); 
    } catch (error) { 
        console.error("Anonymous Auth Error:", error); 
    } 
};

initAuth();

// ==========================================
// SYNCHRONIZED FOUC LOADER LOGIC
// ==========================================
function checkAndHideLoader() {
    if (metadataLoaded && initialLoadComplete) {
        const loader = document.getElementById('loader');
        if (loader && loader.style.display !== 'none') {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    }
}

// Fallback: if Firebase is slow, hide loader after 3.5s to prevent freezing
setTimeout(() => {
    metadataLoaded = true;
    checkAndHideLoader();
}, 3500);

// ==========================================
// INDEPENDENT COUNTDOWN TIMER LOGIC
// ==========================================
function initCountdownTimer() {
    if (document.getElementById('cd-days')) {
        setInterval(() => {
            const targetDate = new Date(window.missionDepartureDate).getTime();
            if(isNaN(targetDate)) return;
            
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
initCountdownTimer();

// ==========================================
// MOBILE MENU LOGIC (SIDE DRAWER)
// ==========================================
window.openMobileMenu = () => {
    const menu = document.getElementById('mobile-menu');
    const backdrop = document.getElementById('mobile-menu-backdrop');
    if(menu && backdrop) {
        menu.classList.remove('translate-x-full');
        backdrop.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.add('opacity-100');
        }, 10);
    }
};

window.closeMobileMenu = () => {
    const menu = document.getElementById('mobile-menu');
    const backdrop = document.getElementById('mobile-menu-backdrop');
    if(menu && backdrop) {
        menu.classList.add('translate-x-full');
        backdrop.classList.remove('opacity-100');
        setTimeout(() => {
            backdrop.classList.add('hidden');
        }, 300);
    }
};

// ==========================================
// BULLETIN BOARD SCROLL LOGIC
// ==========================================
let bulletinScrollInterval = null; 
let bulletinPauseTimeout = null; 
let isBulletinPaused = false; 
let isScrollingUp = false;

function initBulletinScroll() {
    const wrapper = document.getElementById('bulletin-scroll-wrapper');
    if (!wrapper) return;
    
    wrapper.onmouseenter = () => { isBulletinPaused = true; }; 
    wrapper.onmouseleave = () => { isBulletinPaused = false; };
    wrapper.ontouchstart = () => { isBulletinPaused = true; }; 
    wrapper.ontouchend = () => { isBulletinPaused = false; };
    
    startBulletinScroll();
}

function startBulletinScroll() {
    const wrapper = document.getElementById('bulletin-scroll-wrapper');
    if (!wrapper) return;
    
    clearInterval(bulletinScrollInterval); 
    clearTimeout(bulletinPauseTimeout);
    
    setTimeout(() => {
        if (wrapper.scrollHeight <= wrapper.clientHeight) { 
            wrapper.scrollTop = 0; 
            return; 
        }
        
        bulletinScrollInterval = setInterval(() => {
            if (isBulletinPaused || isScrollingUp) return;
            wrapper.scrollTop += 0.5;
            
            if (wrapper.scrollTop >= wrapper.scrollHeight - wrapper.clientHeight - 1) {
                clearInterval(bulletinScrollInterval);
                
                bulletinPauseTimeout = setTimeout(() => {
                    isScrollingUp = true; 
                    wrapper.scrollTo({ top: 0, behavior: 'smooth' });
                    
                    bulletinPauseTimeout = setTimeout(() => { 
                        isScrollingUp = false; 
                        startBulletinScroll(); 
                    }, 1500); 
                }, 2000); 
            }
        }, 30);
    }, 100);
}

function renderPublicBanners() {
    if (!isMainPage) return;
    
    const activeBanners = publicBanners.filter(b => b.visible);
    const container = document.getElementById('bulletin-board-container');
    const content = document.getElementById('bulletin-content');
    
    if (!container || !content) return;
    
    if (activeBanners.length === 0) { 
        container.style.display = 'none'; 
        clearInterval(bulletinScrollInterval); 
        return; 
    }
    
    container.style.display = 'block';

    const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    content.innerHTML = activeBanners.map((b, index) => {
        const formattedDate = new Date(b.timestamp).toLocaleString('en-US', dateOptions).toUpperCase();
        const isLatest = index === 0;
        
        const borderClass = isLatest ? 'border-t-theme theme-bg-10 theme-border' : 'border-white/10 bg-white/5';
        const dateColor = isLatest ? 'theme-text' : 'text-white/40';
        const textColor = isLatest ? 'text-white' : 'text-white/70';
        
        const dot = isLatest 
            ? `<span class="w-1.5 h-1.5 rounded-full theme-bg animate-pulse mr-2 inline-block theme-glow"></span>` 
            : `<span class="w-1.5 h-1.5 rounded-full bg-white/30 mr-2 inline-block"></span>`;
        
        return `
            <div class="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6 p-3 mb-3 rounded-xl border-l-2 ${borderClass} transition-colors hover:bg-white/10">
                <div class="shrink-0 text-[9px] md:text-[10px] font-space font-bold tracking-widest ${dateColor} sm:w-36 flex items-center pt-0.5">
                    ${dot} ${formattedDate}
                </div>
                <div class="text-xs md:text-sm font-medium ${textColor} leading-relaxed">
                    ${b.text}
                </div>
            </div>
        `;
    }).join('');
    
    initBulletinScroll();
}

// ==========================================
// CREW ROSTER LOGIC
// ==========================================
function renderPublicCrew() {
    const container = document.getElementById('dynamic-crew-grid');
    if (!container) return;
    
    if (publicCrew.length === 0) { 
        container.innerHTML = `
            <div class="text-center col-span-full py-20 text-white/50 font-space text-sm">
                <i data-lucide="loader" class="w-5 h-5 animate-spin mx-auto mb-2"></i> Fetching records...
            </div>
        `; 
        return; 
    }

    container.innerHTML = publicCrew.map(c => {
        const isConfirmed = c.status !== 'Pending';
        const filterClass = isConfirmed ? '' : 'style="filter: grayscale(100%); opacity: 0.6;"';
        
        const badgeHtml = isConfirmed 
            ? `<div class="crew-status-badge status-confirmed"><i data-lucide="check" class="w-3 h-3 text-white"></i></div>`
            : `<div class="crew-status-badge status-pending"><i data-lucide="help-circle" class="w-3 h-3 text-white"></i></div>`;
        
        let avatarHtml = '';
        if (c.photo) {
            avatarHtml = `<img src="${c.photo}" alt="${c.name}" class="crew-avatar-img" ${filterClass}>`;
        } else {
            avatarHtml = `<div class="crew-avatar-placeholder" ${filterClass}>${c.name.charAt(0)}</div>`;
        }
            
        return `
            <div onclick="window.openCrewDossier('${c.id}')">
                <div class="crew-avatar-wrapper">
                    ${avatarHtml}
                    ${badgeHtml}
                </div>
                <h3 style="color: ${c.color} !important;">${c.name}</h3>
                <p>${c.role}</p>
            </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

window.openCrewDossier = (id) => {
    const c = publicCrew.find(x => x.id === id); 
    if (!c) return;
    
    const modal = document.getElementById('crewDossierModal'); 
    const content = document.getElementById('crewDossierContent');
    
    content.innerHTML = `
        <div class="bg-[#0f172a]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <button onclick="window.closeCrewDossier()" class="absolute top-4 right-4 text-white/50 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
            <div class="flex gap-4 sm:gap-5 items-center relative z-10 mt-2">
                <div class="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white/20 bg-black/20 flex items-center justify-center overflow-hidden shadow-lg">
                    ${c.photo ? `<img src="${c.photo}" class="w-full h-full object-cover">` : `<span class="text-4xl font-black text-white font-space">${c.name.charAt(0).toUpperCase()}</span>`}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="inline-flex px-2 py-1 bg-white/10 border border-white/20 rounded text-[10px] text-white font-bold tracking-[0.2em] uppercase mb-1.5 items-center gap-1">
                        OP-ID: <span style="color: ${c.color};">${c.crewId}</span>
                        ${c.status === 'Pending' ? '<span class="text-amber-400 ml-2">PENDING</span>' : '<span class="text-emerald-400 ml-2">CONFIRMED</span>'}
                    </div>
                    <div class="text-xl sm:text-2xl font-black text-white font-space tracking-wider truncate uppercase">
                        ${c.name}
                    </div>
                    <div class="text-xs sm:text-sm font-bold tracking-widest uppercase truncate mt-0.5" style="color: ${c.color};">
                        <i data-lucide="shield" class="w-3 h-3 inline mr-1"></i>${c.role}
                    </div>
                </div>
            </div>
            ${c.description ? `<div class="mt-6 pt-4 border-t border-white/10 text-xs sm:text-sm text-white/70 leading-relaxed font-medium relative z-10 bg-black/20 p-4 rounded-xl">${c.description}</div>` : ''}
        </div>
    `;
    
    lucide.createIcons(); 
    modal.classList.remove('hidden'); 
    modal.classList.add('flex');
    
    setTimeout(() => { 
        content.classList.remove('opacity-0', 'scale-95'); 
        content.classList.add('opacity-100', 'scale-100'); 
    }, 10);
};

window.closeCrewDossier = () => {
    const modal = document.getElementById('crewDossierModal'); 
    const content = document.getElementById('crewDossierContent');
    
    if (!content) return;
    
    content.classList.remove('opacity-100', 'scale-100'); 
    content.classList.add('opacity-0', 'scale-95');
    
    setTimeout(() => { 
        if(modal) { 
            modal.classList.remove('flex'); 
            modal.classList.add('hidden'); 
        } 
    }, 300);
};

function updateDriverDropdown() {
    const select = document.getElementById('adminDriver'); 
    if (!select) return;
    
    const currentVal = select.value;
    let html = `
        <option value="AWAITING">AWAITING</option>
        <option value="AUTOPILOT">AUTOPILOT</option>
    `;
    
    html += publicCrew.map(c => `<option value="${c.name.toUpperCase()}">${c.name.toUpperCase()}</option>`).join('');
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
    
    select.innerHTML = publicCrew.map(c => `<option value="${c.name.toUpperCase()}">${c.name.toUpperCase()} (${c.role.substring(0,3).toUpperCase()})</option>`).join('');
}

window.handleCrewPhotoSelect = async (e) => {
    const file = e.target.files[0]; 
    if (!file) return;
    
    const btn = document.getElementById('crewPhotoBtn'); 
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin text-white"></i>`; 
    lucide.createIcons();
    
    try {
        tempCrewPhoto = await new Promise((resolve) => {
            const reader = new FileReader(); 
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image(); 
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas'); 
                    let { width, height } = img;
                    const max = 300; 
                    
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
        
        btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i> HAS PHOTO`; 
        btn.classList.add('border-emerald-500', 'text-emerald-400');
        lucide.createIcons();
    } catch(err) { 
        btn.innerHTML = `PHOTO`; 
        showToast('Photo processing failed', 'error'); 
        lucide.createIcons(); 
    }
};

window.editCrewMember = (id) => {
    if (!isAuthenticated) return;
    const c = publicCrew.find(x => x.id === id); 
    if (!c) return;

    document.getElementById('crewName').value = c.name || '';
    document.getElementById('crewRole').value = c.role || '';
    document.getElementById('crewId').value = c.crewId || '';
    document.getElementById('crewStatus').value = c.status || 'Confirmed';
    document.getElementById('crewColor').value = c.color || '#38bdf8';
    document.getElementById('crewDesc').value = c.description || '';
    
    tempCrewPhoto = c.photo || null;

    const photoBtn = document.getElementById('crewPhotoBtn');
    if (tempCrewPhoto) {
        photoBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i> HAS PHOTO`;
        photoBtn.classList.add('border-emerald-500', 'text-emerald-400');
    } else {
        photoBtn.innerHTML = `PHOTO`;
        photoBtn.classList.remove('border-emerald-500', 'text-emerald-400');
    }

    editingCrewId = id;
    
    document.getElementById('btnSaveCrew').innerText = 'UPDATE ROSTER';
    document.getElementById('btnCancelEditCrew').classList.remove('hidden');
    lucide.createIcons();
};

window.cancelEditCrew = () => {
    document.getElementById('crewName').value = '';
    document.getElementById('crewRole').value = '';
    document.getElementById('crewId').value = '';
    document.getElementById('crewStatus').value = 'Confirmed';
    document.getElementById('crewColor').value = '#38bdf8';
    document.getElementById('crewDesc').value = '';
    
    tempCrewPhoto = null;
    editingCrewId = null;

    const photoBtn = document.getElementById('crewPhotoBtn');
    photoBtn.innerHTML = `PHOTO`;
    photoBtn.classList.remove('border-emerald-500', 'text-emerald-400');

    document.getElementById('btnSaveCrew').innerText = 'ADD TO ROSTER';
    document.getElementById('btnCancelEditCrew').classList.add('hidden');
    lucide.createIcons();
};

window.saveCrewMember = async () => {
    if (!isAuthenticated) {
        return showToast('Not authenticated', 'error');
    }
    
    const name = document.getElementById('crewName').value.trim(); 
    const role = document.getElementById('crewRole').value.trim();
    const crewId = document.getElementById('crewId').value.trim(); 
    const status = document.getElementById('crewStatus').value;
    const color = document.getElementById('crewColor').value;
    const desc = document.getElementById('crewDesc').value.trim();
    
    if (!name || !role || !crewId) {
        return showToast('Fill Name, Role, and ID', 'error');
    }
    
    const id = editingCrewId ? editingCrewId : Date.now().toString();
    
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'crew', id), { 
            id: id, 
            name: name, 
            role: role, 
            crewId: crewId, 
            status: status, 
            color: color, 
            description: desc || null, 
            photo: tempCrewPhoto || null 
        }, { merge: true });
        
        const isUpdate = !!editingCrewId;
        window.cancelEditCrew(); 
        showToast(isUpdate ? 'Operative Updated' : 'Operative Added', 'success'); 
    } catch (e) { 
        showToast('Sync failed', 'error'); 
    }
};

window.deleteCrewMember = async (id) => { 
    if (!isAuthenticated) return; 
    if (!confirm('Remove crew member?')) return;
    
    try { 
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'crew', id.toString())); 
        
        if (editingCrewId === id) {
            window.cancelEditCrew();
        }
        
        showToast('Operative Removed', 'success'); 
    } catch (e) { 
        showToast('Failed to delete', 'error'); 
    }
};

function renderAdminCrew() {
    const tbody = document.getElementById('adminCrewTableBody'); 
    if (!tbody) return;
    
    if (publicCrew.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-white/50">Roster Empty</td></tr>`; 
        return; 
    }
    
    tbody.innerHTML = publicCrew.map(c => {
        const statusIcon = c.status === 'Pending' ? '<span class="text-amber-500 font-bold px-2">PENDING</span>' : '<span class="text-emerald-500 font-bold px-2">CONFIRMED</span>';
        
        return `
            <tr class="border-b border-white/5">
                <td class="py-3">
                    ${c.photo 
                        ? `<img src="${c.photo}" class="w-8 h-8 rounded-full object-cover border border-white/20">` 
                        : `<div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white border border-white/20">${c.name.charAt(0)}</div>`
                    }
                </td>
                <td class="py-3 font-bold text-xs uppercase" style="color: ${c.color};">${c.name}</td>
                <td class="py-3 text-white/50 text-[10px] uppercase">${c.role}</td>
                <td class="py-3 text-[10px]">${statusIcon}</td>
                <td class="py-3 flex gap-3 items-center">
                    <button class="text-sky-400 hover:text-sky-300 transition-colors mt-2" onclick="window.editCrewMember('${c.id}')" title="Edit">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button class="text-red-400 hover:text-red-300 transition-colors mt-2" onclick="window.deleteCrewMember('${c.id}')" title="Delete">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    lucide.createIcons();
}

// ==========================================
// RADIO / COMMS LOGIC
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
    }
};

window.toggleRecord = async () => {
    const btn = document.getElementById('recordBtn'); 
    const status = document.getElementById('recordStatus'); 
    if (!btn || !status) return;
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); 
        btn.innerHTML = `<i data-lucide="mic" class="w-5 h-5"></i>`; 
        btn.classList.remove('animate-pulse', 'bg-red-500', 'text-white', 'border-red-600'); 
        btn.classList.add('bg-white/10', 'text-white/50'); 
        clearTimeout(recordingTimer); 
        lucide.createIcons(); 
        return;
    }
    
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
                status.classList.remove('text-white/40', 'text-red-500'); 
                status.classList.add('text-emerald-400'); 
            };
            
            stream.getTracks().forEach(track => track.stop()); 
        };
        
        mediaRecorder.start(); 
        status.textContent = 'Recording... (Max 15s)'; 
        status.classList.remove('text-white/40', 'text-emerald-400'); 
        status.classList.add('text-red-500');
        
        btn.innerHTML = `<i data-lucide="square" class="w-4 h-4"></i>`; 
        btn.classList.remove('bg-white/10', 'text-white/50'); 
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
    }
};

function renderPublicComms() {
    const container = document.getElementById('commsContainer'); 
    if (!container) return;
    
    if (publicComms.length === 0) { 
        container.innerHTML = `<div class="text-center py-10 text-white/50 font-space text-sm">No transmissions yet.</div>`; 
        return; 
    }
    
    container.innerHTML = publicComms.map(c => {
        const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }; 
        const date = new Date(c.timestamp).toLocaleDateString('en-US', dateOptions);
        
        const audioHtml = c.audio ? `<audio src="${c.audio}" controls class="w-full h-8 mt-3 custom-audio"></audio>` : '';
        const msgHtml = c.message ? `<p class="text-sm text-white/80 leading-relaxed font-medium">${c.message}</p>` : '';
        
        return `
        <div class="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-sm hover:bg-white/10 transition-colors">
            <div class="flex justify-between items-start mb-2 border-b border-white/10 pb-2">
                <span class="font-space font-bold theme-text text-xs tracking-widest flex items-center gap-1">
                    <i data-lucide="user" class="w-3 h-3"></i> ${c.author}
                </span>
                <span class="text-[10px] text-white/40 font-space bg-black/20 px-2 py-0.5 rounded border border-white/5">
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
// IDEAS / NOTES LOGIC
// ==========================================
window.addNote = async () => {
    const input = document.getElementById('newNoteInput'); 
    if (!input) return;
    
    const text = input.value.trim(); 
    if (!text) {
        return showToast('Enter an idea first', 'error');
    }
    
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
    }
};

window.toggleNoteStatus = async (id, isCompleted) => { 
    try { 
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id.toString()), { 
            completed: !isCompleted 
        }, { merge: true }); 
    } catch (e) { 
        showToast('Failed to update', 'error'); 
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
    } 
};

function renderNotes() {
    const container = document.getElementById('notesContainer'); 
    if (!container) return;
    
    if (publicNotes.length === 0) { 
        container.innerHTML = `<div class="text-center col-span-full py-10 text-white/50 font-space text-sm">No ideas logged yet.</div>`; 
        return; 
    }
    
    container.innerHTML = publicNotes.map(n => {
        const bgClass = n.completed ? 'bg-emerald-500/10 border-emerald-500/20 opacity-60' : 'bg-white/5 border-white/10';
        const textClass = n.completed ? 'line-through text-white/40' : 'text-white/80';
        const iconColor = n.completed ? 'text-emerald-400' : 'text-white/30 hover:text-emerald-400';
        
        return `
        <div class="p-6 rounded-2xl ${bgClass} shadow-sm transition-all cursor-pointer group hover:bg-white/10" onclick="window.toggleNoteStatus('${n.id}', ${n.completed})">
            <div class="flex justify-between items-start gap-4">
                <p class="font-medium text-sm md:text-base leading-relaxed ${textClass}">${n.text}</p>
                <div class="flex flex-col gap-2 shrink-0">
                    <button class="transition-colors ${iconColor}" title="Mark Done">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                    </button>
                    <button onclick="window.deleteNote('${n.id}', event)" class="text-white/20 hover:text-red-400 transition-colors" title="Delete Idea">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
            <div class="text-[10px] text-white/30 font-space mt-4 block">
                ${new Date(n.timestamp).toLocaleDateString()}
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

// ==========================================
// DYNAMIC WEATHER API
// ==========================================
async function fetchDynamicWeather() {
    if (!isMainPage) return;
    
    const wBox = document.getElementById('weather-hud');
    
    if (currentRoutePoints.length === 0) {
        if (wBox) wBox.innerHTML = `<div class="text-[10px] theme-text font-space font-bold">AWAITING NAV DATA</div>`;
        return;
    }

    try {
        const displayPoints = currentRoutePoints; 
        const lats = displayPoints.map(p => p.lat).join(',');
        const lngs = displayPoints.map(p => p.lng).join(',');

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current_weather=true`;
        const res = await fetch(url);
        const data = await res.json();

        let html = '';
        const results = Array.isArray(data) ? data : [data];

        results.forEach((d, i) => {
            const temp = d.current_weather ? d.current_weather.temperature : '--';
            const wind = d.current_weather ? d.current_weather.windspeed : '--';
            const cityName = displayPoints[i].name;
            
            html += `
            <div class="flex justify-between items-center gap-6 border-b border-white/10 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                <span class="text-[10px] md:text-xs font-space font-bold text-white/60 uppercase truncate max-w-[100px]">${cityName}</span>
                <span class="text-[10px] md:text-xs font-space theme-text font-bold whitespace-nowrap">
                    ${temp}°C 
                    <span class="text-white/20 mx-1 opacity-50">|</span> 
                    <span class="theme-text opacity-70">${wind}km/h</span>
                </span>
            </div>`;
        });
        
        if (wBox) {
            wBox.innerHTML = html;
            wBox.classList.add('max-h-[150px]', 'overflow-y-auto', 'custom-scrollbar', 'pr-2');
        }
        
    } catch (e) {
        console.error("Weather API Error:", e);
        if (wBox) wBox.innerHTML = `<div class="text-[10px] theme-text font-space font-bold">SYS ONLINE: 28°C AVG</div>`;
    }
}

// ==========================================
// GALLERY LOGIC
// ==========================================
window.toggleGalleryView = (viewType) => {
    if (!isGalleryPage) return; 
    
    document.getElementById('gallery-view-state').value = viewType;
    const btnGrid = document.getElementById('btn-view-grid'); 
    const btnList = document.getElementById('btn-view-list');
    
    if (viewType === 'grid') { 
        btnGrid.className = "p-2.5 rounded-lg bg-white/10 theme-text border border-white/10 shadow-sm transition-all"; 
        btnList.className = "p-2.5 rounded-lg text-white/40 hover:text-white/80 transition-all"; 
    } else { 
        btnList.className = "p-2.5 rounded-lg bg-white/10 theme-text border border-white/10 shadow-sm transition-all"; 
        btnGrid.className = "p-2.5 rounded-lg text-white/40 hover:text-white/80 transition-all"; 
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
        container.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6";
        container.innerHTML = activeGallery.map(item => `
            <div class="relative group cursor-pointer overflow-hidden rounded-[2rem] border border-white/10 shadow-lg bg-black/20 aspect-square" onclick="window.openLightbox('${item.id}')">
                <img src="${item.image}" alt="Memory" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5">
                    <div class="flex justify-between items-end">
                        <div class="text-white text-[9px] md:text-[10px] font-space tracking-widest bg-black/50 px-2.5 py-1.5 rounded-md backdrop-blur-md border border-white/10">
                            ${new Date(item.timestamp).toLocaleDateString()}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.downloadImage('${item.image}', 'voyager-${item.id}.jpg'); event.stopPropagation();" class="bg-white/10 backdrop-blur-md rounded-full p-2 border border-white/20 hover:bg-white/30 transition-colors" title="Download">
                                <i data-lucide="download" class="w-4 h-4 text-white"></i>
                            </button>
                            <button onclick="window.openLightbox('${item.id}'); event.stopPropagation();" class="theme-bg opacity-80 backdrop-blur-md rounded-full p-2 theme-border hover:opacity-100 transition-colors theme-glow" title="Enlarge">
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
            <div class="relative overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl bg-black/20">
                <div class="w-full h-[300px] md:h-[500px] cursor-pointer" onclick="window.openLightbox('${item.id}')">
                    <img src="${item.image}" alt="Memory" loading="lazy" class="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-700">
                </div>
                <div class="p-6 bg-black/40 backdrop-blur-md flex justify-between items-center border-t border-white/10">
                    <div>
                        <p class="text-[10px] theme-text font-space font-bold tracking-widest mb-1 uppercase">LOG ENTRY</p>
                        <p class="text-white/80 font-medium text-xs md:text-sm">
                            ${new Date(item.timestamp).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="window.downloadImage('${item.image}', 'voyager-${item.id}.jpg')" class="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors font-space text-[10px] font-bold tracking-widest border border-white/20 uppercase">
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

window.handleMetaBgSelect = async (e) => {
    if (!isAuthenticated) return showToast('Not authenticated', 'error');
    const file = e.target.files[0]; 
    if (!file) return;
    
    showToast('Compressing BG Image...', 'success');
    
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
                    const max = 1920; 
                    
                    if (width > height && width > max) { 
                        height *= max / width; width = max; 
                    } else if (height > max) { 
                        width *= max / height; height = max; 
                    }
                    
                    canvas.width = width; 
                    canvas.height = height; 
                    const ctx = canvas.getContext('2d'); 
                    ctx.drawImage(img, 0, 0, width, height); 
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
            };
        });
        
        document.getElementById('adminMetaBgBase64').value = base64;
        showToast('Ready to Save', 'success');
    } catch(err) { 
        showToast('Upload failed', 'error'); 
    }
};

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
                        height *= max / width; width = max; 
                    } else if (height > max) { 
                        width *= max / height; height = max; 
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
    }
    
    e.target.value = '';
};

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
    const btn = document.querySelector('#loginScreen button');
    
    if (!email || !pwd) { 
        showToast('Enter both Email and Access Code.', 'error'); 
        return; 
    }
    
    const originalText = btn.innerHTML; 
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> AUTHENTICATING...`;
    
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
        document.getElementById('loginScreen').classList.add('hidden'); 
        document.getElementById('dashboard').classList.remove('hidden'); 
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

// ==========================================
// DYNAMIC ROUTE AUTOCOMPLETE LOGIC (PHOTON API)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('adminRouteSearch');
    const dropdown = document.getElementById('adminRouteDropdown');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                dropdown.classList.add('hidden');
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
                    const data = await res.json();
                    
                    dropdown.innerHTML = '';
                    if (data.features.length === 0) {
                        dropdown.innerHTML = `<div class="p-3 text-[10px] text-white/50">No locations found.</div>`;
                    } else {
                        data.features.forEach(feat => {
                            const props = feat.properties;
                            const name = props.name;
                            const state = props.state ? `, ${props.state}` : '';
                            const country = props.country ? `, ${props.country}` : '';
                            const formattedName = `${name}${state}${country}`;
                            
                            const div = document.createElement('div');
                            div.className = 'p-3 text-[10px] text-white hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 uppercase tracking-widest';
                            div.innerText = formattedName;
                            
                            div.onclick = () => {
                                currentRoutePoints.push({
                                    name: name,
                                    formattedName: formattedName,
                                    lat: feat.geometry.coordinates[1],
                                    lng: feat.geometry.coordinates[0]
                                });
                                renderAdminRouteTags();
                                searchInput.value = '';
                                dropdown.classList.add('hidden');
                            };
                            dropdown.appendChild(div);
                        });
                    }
                    dropdown.classList.remove('hidden');
                } catch(err) {
                    console.error("Photon API Error:", err);
                }
            }, 500); 
        });
    }
});

function renderAdminRouteTags() {
    const container = document.getElementById('adminRouteTags');
    if(!container) return;
    
    container.innerHTML = currentRoutePoints.map((pt, i) => `
        <div class="flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full">
            <span class="text-[9px] font-bold text-white uppercase tracking-widest">${pt.name}</span>
            <button onclick="window.removeRoutePoint(${i})" class="text-white/50 hover:text-red-400 transition-colors"><i data-lucide="x" class="w-3 h-3"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

window.removeRoutePoint = (index) => {
    currentRoutePoints.splice(index, 1);
    renderAdminRouteTags();
};

window.updateTripMetadata = async () => {
    if (!isAuthenticated) {
        return showToast('Not authenticated', 'error');
    }
    try {
        const bgVal = document.getElementById('adminMetaBgBase64').value;
        const payload = {
            projectName: document.getElementById('adminMetaProj').value.trim(),
            heroTitle: document.getElementById('adminMetaTitle').value.trim(),
            departureDate: document.getElementById('adminMetaDate').value.trim(),
            heroDesc: document.getElementById('adminMetaDesc').value.trim(),
            chariotName: document.getElementById('adminMetaChariot').value.trim(),
            chariotPlatform: document.getElementById('adminMetaPlatform').value.trim(),
            themeColor: document.getElementById('adminThemeColor').value,
            
            countdownTitle: document.getElementById('adminMetaCountdownTitle').value.trim(),
            mapTitle: document.getElementById('adminMetaMapTitle').value.trim(),
            rosterTitle: document.getElementById('adminMetaRosterTitle').value.trim(),
            
            footerTagline: document.getElementById('adminMetaTagline').value.trim(),
            routePoints: currentRoutePoints, 
            timestamp: Date.now()
        };
        
        if (bgVal && bgVal.length > 100) {
            payload.bgImage = bgVal;
        }

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trip_meta', 'latest'), payload, { merge: true });
        
        document.getElementById('adminMetaBgInput').value = '';
        
        showToast('Global Settings Updated', 'success');
    } catch (e) {
        showToast('Failed to sync metadata', 'error');
        console.error(e);
    }
};

// ==========================================
// GENERAL ADMIN WRITE FUNCTIONS
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
// ADMIN TABLE RENDERERS
// ==========================================
function renderAdminBanners() {
    const tbody = document.getElementById('bannersTableBody'); 
    if (!tbody) return;
    
    if (publicBanners.length === 0) { 
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-6 text-white/50">
                    <i data-lucide="radio" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>
                    No active broadcasts.
                </td>
            </tr>
        `; 
        lucide.createIcons(); 
        return; 
    }
    
    tbody.innerHTML = publicBanners.map(b => `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
            <td class="max-w-xs truncate py-3 font-medium text-white/80">${b.text}</td>
            <td class="py-3">
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only peer" ${b.visible ? 'checked' : ''} onchange="window.toggleBannerVisibility('${b.id}', ${b.visible})">
                    <div class="w-9 h-5 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all theme-bg"></div>
                </label>
            </td>
            <td class="py-3">
                <button class="text-red-400 hover:text-red-300 rounded" onclick="window.deleteBanner('${b.id}')">
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
                <td colspan="3" class="text-center py-6 text-white/50">
                    <i data-lucide="image-off" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>
                    Vault is empty.
                </td>
            </tr>
        `; 
        lucide.createIcons(); 
        return; 
    }
    
    tbody.innerHTML = publicGallery.map(g => `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
            <td class="py-3">
                <img src="${g.image}" class="w-14 h-14 rounded-lg object-cover border border-white/10 shadow-md">
            </td>
            <td class="py-3">
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only peer" ${g.visible ? 'checked' : ''} onchange="window.toggleGalleryVisibility('${g.id}', ${g.visible})">
                    <div class="w-9 h-5 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all theme-bg"></div>
                </label>
            </td>
            <td class="py-3">
                <button class="text-red-400 hover:text-red-300 rounded" onclick="window.deleteGalleryItem('${g.id}')">
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
                <td colspan="4" class="text-center py-6 text-white/50">
                    No comms logged.
                </td>
            </tr>
        `; 
        lucide.createIcons(); 
        return; 
    }
    
    tbody.innerHTML = publicComms.map(c => { 
        const dateOptions = { month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit' }; 
        const date = new Date(c.timestamp).toLocaleDateString('en-US', dateOptions); 
        const audioLabel = c.audio ? '<span class="text-emerald-400 font-bold ml-2 text-[10px] bg-emerald-900/30 px-1 py-0.5 rounded border border-emerald-500/30">[AUDIO]</span>' : ''; 
        
        return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
            <td class="py-3 theme-text font-bold text-xs uppercase">${c.author}</td>
            <td class="py-3 text-white/80 max-w-xs truncate text-xs">${c.message || '---'} ${audioLabel}</td>
            <td class="py-3 text-white/50 text-[10px] uppercase tracking-widest">${date}</td>
            <td class="py-3">
                <button class="text-red-400 hover:text-red-300 rounded" onclick="window.deleteComm('${c.id}')">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>`; 
    }).join('');
    
    lucide.createIcons();
}

// ==========================================
// LAZY LOAD HEAVY ASSETS (MAP & 3D MODEL)
// ==========================================
function lazyLoadHeavyAssets() {
    const triggerSection = document.getElementById('machine');
    if (!triggerSection) return;

    const assetObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !mapInitialized) {
                initMapAndGraphics();
                mapInitialized = true;
                observer.disconnect(); 
            }
        });
    }, { rootMargin: '400px 0px' }); 

    assetObserver.observe(triggerSection);
}

// ==========================================
// UTILITY LOGIC & ROUTING
// ==========================================
function showToast(msg, type) {
    const container = document.getElementById('toastContainer'); 
    if (!container) return;
    
    const t = document.createElement('div'); 
    t.className = `flex items-center gap-3 px-4 py-3 rounded-xl backdrop-blur-xl border shadow-2xl text-xs font-space font-bold tracking-widest uppercase transition-all transform duration-300 ${type === 'success' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-red-500/20 border-red-500/50 text-red-400'}`;
    t.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}" class="w-4 h-4"></i> <span>${msg}</span>`;
    
    container.appendChild(t); 
    lucide.createIcons();
    
    setTimeout(() => { 
        t.style.opacity = '0'; 
        t.style.transform = 'translateY(20px)'; 
        setTimeout(() => t.remove(), 300); 
    }, 3000);
}

function handleRoute() {
    if (!isMainPage) return; 
    const hash = window.location.hash;
    
    if (hash === '#admin') { 
        document.getElementById('public-view').classList.add('hidden'); 
        document.getElementById('admin-view').classList.remove('hidden'); 
        document.body.style.overflow = 'auto'; 
        window.scrollTo(0, 0); 
    } else { 
        document.getElementById('admin-view').classList.add('hidden'); 
        document.getElementById('public-view').classList.remove('hidden'); 
        lazyLoadHeavyAssets(); 
    }
}

window.addEventListener('hashchange', handleRoute);

window.addEventListener('load', () => {
    // Ensures that the UI loads if Firebase hasn't already fired
    if (!metadataLoaded) {
        checkAndHideLoader();
    }
    if (isMainPage) handleRoute(); 
    lucide.createIcons();
});

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
    pv.style.filter = 'hue-rotate(90deg) contrast(150%)'; 
    pv.style.transform = 'scale(1.02)'; 
    pv.style.transition = 'all 0.1s infinite'; 
    
    setTimeout(() => { 
        pv.style.filter = ''; 
        pv.style.transform = ''; 
        pv.style.transition = 'all 0.3s'; 
        hyperdriveMode = false; 
        showToast('ORBIT STABILIZED', 'success'); 
    }, 4000); 
}

// ==========================================
// DYNAMIC LEAFLET MAP ENGINE
// ==========================================
function updatePublicMap(routeArray) {
    if (!realMapInstance || !routeArray || routeArray.length === 0) return;

    // Clear existing markers and lines
    mapMarkersLayer.clearLayers();

    const rootStyles = getComputedStyle(document.documentElement);
    const themeHex = rootStyles.getPropertyValue('--theme-hex').trim() || '#38bdf8';

    // Map dynamic data to UI formatting
    const mapData = routeArray.map((point, index) => {
        let status = "WAYPOINT";
        let hex = themeHex;
        
        if (index === 0) { 
            status = "DEPARTURE"; 
        } else if (index === routeArray.length - 1) { 
            status = "DESTINATION"; 
        }

        return {
            id: String(index + 1).padStart(3, '0'),
            name: point.name.toUpperCase(),
            status: status,
            desc: point.formattedName,
            markerHex: hex,
            coords: [point.lat, point.lng]
        };
    });

    const forwardCoords = mapData.map(d => d.coords);
    
    // Draw connecting lines using the theme color
    L.polyline(forwardCoords, { color: themeHex, weight: 6, opacity: 0.8 }).addTo(mapMarkersLayer);
    L.polyline(forwardCoords, { color: '#ffffff', weight: 2, dashArray: '10, 10' }).addTo(mapMarkersLayer);

    // DYNAMIC RETURN ROUTE LINE (Dashed Purple/Theme Line from End back to Start)
    if (forwardCoords.length > 1) {
        const returnCoords = [forwardCoords[forwardCoords.length - 1], forwardCoords[0]];
        L.polyline(returnCoords, { color: '#a855f7', weight: 4, opacity: 0.6, dashArray: '5, 10' }).addTo(mapMarkersLayer);
    }

    // Draw glowing pins using theme color
    mapData.forEach((loc) => {
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
        
        const marker = L.marker(loc.coords, { icon: vibrantIcon }).addTo(mapMarkersLayer); 
        
        marker.on('click', () => {
            const hud = document.getElementById('map-hud');
            hud.innerHTML = `
                <button onclick="window.closeMapHud()" class="absolute top-3 right-3 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="flex justify-between items-center mb-3 border-b border-white/10 pb-3 pr-6">
                    <div class="font-space font-bold text-[10px] tracking-[0.2em] text-white/50">NAV PNT ${loc.id}</div>
                    <div class="theme-text theme-bg-10 theme-border-30 border text-[9px] tracking-widest font-bold px-2 py-1 rounded shadow-sm">
                        ${loc.status}
                    </div>
                </div>
                <h3 class="text-xl font-black font-space mb-1 tracking-tight text-white">${loc.name}</h3>
                <p class="text-[10px] text-white/60 leading-relaxed font-medium mb-4">${loc.desc}</p>
                <div class="flex items-center gap-2 text-[10px] font-space font-bold text-white/50 bg-black/40 px-2 py-1.5 rounded-md border border-white/10">
                    <i data-lucide="crosshair" class="w-3 h-3"></i> LAT: ${loc.coords[0].toFixed(4)} LNG: ${loc.coords[1].toFixed(4)}
                </div>
            `;
            lucide.createIcons(); 
            hud.classList.remove('opacity-0', 'scale-95', 'pointer-events-none'); 
            hud.classList.add('opacity-100', 'scale-100', 'pointer-events-auto'); 
            realMapInstance.setView(loc.coords, 8, { animate: true });
        });
    });

    if (forwardCoords.length > 0) {
        realMapInstance.fitBounds(L.latLngBounds(forwardCoords), { padding: [50, 50] });
    }
}

function initMapAndGraphics() {
    if (document.getElementById('real-map') && !realMapInstance) {
        realMapInstance = L.map('real-map', { zoomControl: false }).setView([11.6, 76.8], 7);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
            attribution: '&copy; OpenStreetMap', 
            subdomains: 'abcd', 
            maxZoom: 20 
        }).addTo(realMapInstance);
        
        L.control.zoom({ position: 'bottomright' }).addTo(realMapInstance);
        
        mapMarkersLayer = L.layerGroup().addTo(realMapInstance);
        
        // If dynamic data loaded before map initialized, draw it now
        if (currentRoutePoints.length > 0) {
            updatePublicMap(currentRoutePoints);
        }
    }
}
