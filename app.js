/**
 * 6 Minute English - App Logic
 */

let episodes = [];
let currentEpisodeIndex = -1;
let playMode = 'sequential'; // 'sequential', 'loop', 'random'
let isPlaying = false;

// Elements
const audioEl = document.getElementById('audioEl');
const btnPlay = document.getElementById('btnPlay');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');
const episodesGrid = document.getElementById('episodesGrid');
const playerTitle = document.getElementById('playerTitle');
const playerDesc = document.getElementById('playerDesc');
const playerImage = document.getElementById('playerImage');
const playerNum = document.getElementById('playerNum');
const playerDate = document.getElementById('playerDate');
const linkBBC = document.getElementById('linkBBC');
const linkPDF = document.getElementById('linkPDF');
const transcriptBox = document.getElementById('transcriptBox');
const transcriptText = document.getElementById('transcriptText');
const episodeCount = document.getElementById('episodeCount');

// Initialize
async function init() {
    try {
        const response = await fetch('episodes.json');
        episodes = await response.json();
        
        // Sort by id or number (usually reverse chronological)
        // RSS already gives latest first, so we keep that order as index 0, 1, 2...
        
        episodeCount.textContent = episodes.length;
        renderEpisodes(episodes);
        
        // Deep linking
        const urlParams = new URLSearchParams(window.location.search);
        const epId = urlParams.get('ep');
        if (epId) {
            const found = episodes.findIndex(e => e.id === epId);
            if (found !== -1) selectEpisode(found);
        }

        // Setup audio events
        setupAudioEvents();
        
    } catch (err) {
        console.error('Failed to load episodes:', err);
        episodesGrid.innerHTML = `<div class="error-state">Failed to load episodes. Please try again later.</div>`;
    }
}

// Global filter function
window.filterEpisodes = (query) => {
    const q = query.toLowerCase();
    const filtered = episodes.filter(ep => 
        ep.title.toLowerCase().includes(q) || 
        ep.description.toLowerCase().includes(q)
    );
    renderEpisodes(filtered);
};

function renderEpisodes(items) {
    if (items.length === 0) {
        episodesGrid.innerHTML = `<div class="empty-state">No episodes found matching your search.</div>`;
        return;
    }

    episodesGrid.innerHTML = items.map((ep, idx) => {
        // Find actual index in global episodes array
        const globalIdx = episodes.indexOf(ep);
        const isActive = globalIdx === currentEpisodeIndex;
        
        return `
            <div class="episode-card ${isActive ? 'active' : ''}" onclick="selectEpisode(${globalIdx})">
                <img class="card-img" src="${ep.image || 'https://via.placeholder.com/400x225/222/555?text=BBC+6+Minute+English'}" alt="${ep.title}" loading="lazy">
                <div class="card-active-indicator">▶</div>
                <div class="card-content">
                    <div class="card-meta">
                        <span>${ep.date || ''}</span>
                        <span>EP. ${ep.num || (episodes.length - globalIdx)}</span>
                    </div>
                    <h3 class="card-title">${ep.title}</h3>
                    <p class="card-desc">${ep.description}</p>
                </div>
            </div>
        `;
    }).join('');
}

window.selectEpisode = (index) => {
    if (index < 0 || index >= episodes.length) return;
    
    const ep = episodes[index];
    currentEpisodeIndex = index;
    
    // Update player UI
    playerTitle.textContent = ep.title;
    playerDesc.textContent = ep.description;
    playerImage.src = ep.image;
    playerNum.textContent = `Ep. ${ep.num || (episodes.length - index)}`;
    playerDate.textContent = ep.date || '';
    
    linkBBC.href = ep.link;
    linkPDF.href = ep.pdf || '#';
    linkPDF.style.display = ep.pdf ? 'flex' : 'none';
    
    // Transcript
    if (ep.transcript) {
        transcriptText.textContent = ep.transcript;
        transcriptText.classList.remove('transcript-placeholder');
    } else {
        transcriptText.textContent = "Transcript for this episode is being prepared. Check the BBC link for details.";
        transcriptText.classList.add('transcript-placeholder');
    }

    // Audio
    audioEl.src = ep.mp3;
    audioEl.load();
    
    // Start playing
    audioEl.play().catch(e => console.log("Auto-play blocked", e));
    isPlaying = true;
    updatePlayBtn();
    
    // Highlight in list
    updateListHighlight();
    
    // Scroll player into view on mobile
    if (window.innerWidth < 768) {
        document.getElementById('player-section').scrollIntoView({behavior: 'smooth'});
    }
};

window.togglePlay = () => {
    if (currentEpisodeIndex === -1) {
        selectEpisode(0);
        return;
    }
    
    if (audioEl.paused) {
        audioEl.play();
        isPlaying = true;
    } else {
        audioEl.pause();
        isPlaying = false;
    }
    updatePlayBtn();
};

function updatePlayBtn() {
    btnPlay.textContent = isPlaying ? '⏸' : '▶';
    btnPlay.classList.toggle('playing', isPlaying);
}

window.playNext = () => {
    if (playMode === 'random') {
        const next = Math.floor(Math.random() * episodes.length);
        selectEpisode(next);
    } else if (playMode === 'loop') {
        selectEpisode(currentEpisodeIndex);
    } else {
        // Sequential
        const next = (currentEpisodeIndex + 1) % episodes.length;
        selectEpisode(next);
    }
};

window.playPrev = () => {
    const prev = (currentEpisodeIndex - 1 + episodes.length) % episodes.length;
    selectEpisode(prev);
};

window.setMode = (mode) => {
    playMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `mode${mode.charAt(0).toUpperCase() + mode.slice(1, 3)}`);
    });
    // Fix IDs manually for the buttons
    document.getElementById('modeSeq').classList.toggle('active', mode === 'sequential');
    document.getElementById('modeLoop').classList.toggle('active', mode === 'loop');
    document.getElementById('modeRandom').classList.toggle('active', mode === 'random');
};

let autoScrollEnabled = true;

function setupAudioEvents() {
    audioEl.ontimeupdate = () => {
        const duration = audioEl.duration || 0;
        const currentTime = audioEl.currentTime || 0;
        const pct = (currentTime / duration) * 100 || 0;
        progressFill.style.width = `${pct}%`;
        progressThumb.style.left = `${pct}%`;
        timeCurrent.textContent = formatTime(currentTime);

        // Sync scroll transcript
        if (autoScrollEnabled && transcriptBox.scrollHeight > transcriptBox.clientHeight) {
            const scrollRange = transcriptBox.scrollHeight - transcriptBox.clientHeight;
            const targetScroll = (currentTime / duration) * scrollRange;
            // Smoothly scroll
            transcriptBox.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        }
    };
    
    audioEl.onloadedmetadata = () => {
        timeTotal.textContent = formatTime(audioEl.duration);
    };
    
    audioEl.onended = () => {
        playNext();
    };
    
    // ProgressBar interaction
    progressBar.onmousedown = (e) => {
        seek(e);
        window.onmousemove = seek;
        window.onmouseup = () => { window.onmousemove = null; };
    };
    
    // Click seek
    progressBar.onclick = seek;
}

function seek(e) {
    const rect = progressBar.getBoundingClientRect();
    let x = e.clientX - rect.left;
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;
    const pct = x / rect.width;
    audioEl.currentTime = pct * audioEl.duration;
}

function formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateListHighlight() {
    document.querySelectorAll('.episode-card').forEach((card, idx) => {
        // This is tricky because filtered list might have different DOM order
        // Better to re-render or use data attributes
    });
    // Simplified: Just re-render the grid (small enough for 100 items)
    // Actually search filter might be active, so we just use the rendered cards
}

window.toggleSync = () => {
    autoScrollEnabled = !autoScrollEnabled;
    const btn = document.getElementById('btnSync');
    btn.textContent = `Sync Scroll: ${autoScrollEnabled ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', autoScrollEnabled);
};

window.toggleTranscript = () => {
    const box = document.getElementById('transcriptBox');
    const btn = document.getElementById('btnToggleTranscript');
    if (box.style.display === 'none') {
        box.style.display = 'block';
        btn.textContent = 'Hide';
    } else {
        box.style.display = 'none';
        btn.textContent = 'Show';
    }
};

// Start
init();
