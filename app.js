/**
 * BBC 6 Minute English – Karaoke subtitle player
 */

// ─── State ────────────────────────────────────────────────────────────────────
let episodes       = [];
let currentIdx     = -1;
let playMode       = 'sequential';   // sequential | loop | random
let isPlaying      = false;
let subtitleCues   = [];             // [{start, end, text}]
let activeCueIdx   = -1;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const audioEl      = document.getElementById('audioEl');
const btnPlay      = document.getElementById('btnPlay');
const progressBar  = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressThumb= document.getElementById('progressThumb');
const timeCurrent  = document.getElementById('timeCurrent');
const timeTotal    = document.getElementById('timeTotal');
const episodesGrid = document.getElementById('episodesGrid');
const playerTitle  = document.getElementById('playerTitle');
const playerDesc   = document.getElementById('playerDesc');
const playerImage  = document.getElementById('playerImage');
const playerNum    = document.getElementById('playerNum');
const playerDate   = document.getElementById('playerDate');
const linkBBC      = document.getElementById('linkBBC');
const linkPDF      = document.getElementById('linkPDF');
const lyricsBox    = document.getElementById('lyricsBox');
const episodeCount = document.getElementById('episodeCount');

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch('episodes.json');
        episodes = await res.json();
        episodeCount.textContent = episodes.length;
        renderEpisodes(episodes);

        // deep link ?ep=XXXXXX
        const ep = new URLSearchParams(location.search).get('ep');
        if (ep) {
            const idx = episodes.findIndex(e => e.id === ep);
            if (idx !== -1) selectEpisode(idx);
        }

        setupAudio();
        
        // Auto-select first episode if not specified
        if (!ep && episodes.length) {
            updateEpisodeUI(0);
        }
    } catch (e) {
        episodesGrid.innerHTML = '<p style="color:#f66;padding:40px">Failed to load episodes.</p>';
    }
}

// ─── Episode list ─────────────────────────────────────────────────────────────
window.filterEpisodes = q => {
    q = q.toLowerCase();
    renderEpisodes(episodes.filter(e =>
        e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    ));
};

function renderEpisodes(items) {
    if (!items.length) {
        episodesGrid.innerHTML = '<p style="padding:40px;color:var(--text-dim)">No episodes found.</p>';
        return;
    }
    episodesGrid.innerHTML = items.map(ep => {
        const gi = episodes.indexOf(ep);
        return `
        <div class="episode-card ${gi===currentIdx?'active':''}" onclick="selectEpisode(${gi})">
          <img class="card-img" src="${ep.image||''}" alt="${ep.title}" loading="lazy">
          <div class="card-active-indicator">▶</div>
          <div class="card-content">
            <div class="card-meta">
              <span>${ep.date||''}</span><span>EP ${ep.num||''}</span>
            </div>
            <h3 class="card-title">${ep.title}</h3>
            <p class="card-desc">${ep.description}</p>
          </div>
        </div>`;
    }).join('');
}

// ─── Select & play ────────────────────────────────────────────────────────────
window.selectEpisode = idx => {
    updateEpisodeUI(idx);
    audioEl.play().catch(() => {
        console.log("Auto-play blocked, user must click play.");
    });
    isPlaying = true;
    updatePlayBtn();
    
    if (window.innerWidth < 768)
        document.getElementById('player-section').scrollIntoView({behavior:'smooth'});
};

function updateEpisodeUI(idx) {
    if (idx < 0 || idx >= episodes.length) return;
    const ep = episodes[idx];
    currentIdx = idx;
    
    playerTitle.textContent = ep.title;
    playerDesc.textContent  = ep.description;
    playerImage.src         = ep.image || '';
    playerNum.textContent   = `Ep. ${ep.num || (episodes.length - idx)}`;
    playerDate.textContent  = ep.date || '';
    linkBBC.href            = ep.link;
    linkPDF.href            = ep.pdf || '#';
    
    // Reset lyrics
    subtitleCues = [];
    activeCueIdx = -1;
    showLyricsLoading();
    
    // Load audio without auto-playing (just prepare it)
    audioEl.src = ep.mp3;
    audioEl.load();
    loadVTT(ep.id);
    
    // Highlighting cards
    document.querySelectorAll('.episode-card').forEach(card => card.classList.remove('active'));
    renderEpisodes(episodes.filter(e => {
        const q = document.getElementById('searchInput').value.toLowerCase();
        return !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    }));
}

// ─── VTT loader ───────────────────────────────────────────────────────────────
async function loadVTT(epId) {
    try {
        const res = await fetch(`vtt/${epId}.vtt`);
        if (!res.ok) throw new Error('not found');
        const text = await res.text();
        subtitleCues = parseVTT(text);
        activeCueIdx = -1;
        if (subtitleCues.length) {
            renderLyrics();
        } else {
            showLyricsMessage('Subtitles unavailable for this episode.');
        }
    } catch {
        showLyricsMessage('Subtitles are being generated. Check back soon! 🎙️');
    }
}

function parseVTT(text) {
    const cues = [];
    const normalized = text.replace(/\r\n/g, '\n').trim();
    const blocks = normalized.split(/\n\n+/);
    
    for (const block of blocks) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
        if (lines.length < 2) continue;
        
        const timeLine = lines.find(l => l.includes('-->'));
        if (!timeLine) continue;
        
        const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
        const timeIdx = lines.indexOf(timeLine);
        
        // Everything after timeLine is the subtitle text
        let textContent = lines.slice(timeIdx + 1).join(' ');
        // Strip common VTT tags like <c.xxx> or <i>
        textContent = textContent.replace(/<[^>]+>/g, '').trim();
        
        if (!textContent) continue;
        
        cues.push({
            start: vttTimeToSec(startStr),
            end:   vttTimeToSec(endStr),
            text:  textContent
        });
    }
    return cues;
}

function vttTimeToSec(t) {
    // HH:MM:SS.mmm or MM:SS.mmm
    const parts = t.split(':').map(Number);
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    return parts[0]*60 + parts[1];
}

// ─── Lyrics / subtitle rendering ──────────────────────────────────────────────
function renderLyrics() {
    lyricsBox.innerHTML = subtitleCues.map((cue, i) =>
        `<div class="lyric-line" id="cue-${i}" data-idx="${i}">${cue.text}</div>`
    ).join('');
    activeCueIdx = -1;
}

function showLyricsLoading() {
    lyricsBox.innerHTML = `
      <div class="lyric-status">
        <div class="lyric-spinner"></div>
        <p>Loading subtitles…</p>
      </div>`;
}

function showLyricsMessage(msg) {
    lyricsBox.innerHTML = `<p class="lyric-status">${msg}</p>`;
}

function syncLyrics(currentTime) {
    if (!subtitleCues.length) return;

    // Find current cue
    let found = -1;
    for (let i = 0; i < subtitleCues.length; i++) {
        if (currentTime >= subtitleCues[i].start && currentTime < subtitleCues[i].end) {
            found = i;
            break;
        }
    }

    if (found === activeCueIdx) return; // no change
    activeCueIdx = found;

    // Highlight
    document.querySelectorAll('.lyric-line').forEach((el, i) => {
        if (i < found) {
            el.className = 'lyric-line past';
        } else if (i === found) {
            el.className = 'lyric-line active';
        } else {
            el.className = 'lyric-line';
        }
    });

    // Scroll active line to center
    if (found >= 0) {
        const el = document.getElementById(`cue-${found}`);
        if (el) {
            const elCenter = el.offsetTop + (el.offsetHeight / 2);
            const boxCenter = lyricsBox.offsetHeight / 2;
            const targetScroll = elCenter - boxCenter;
            
            lyricsBox.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        }
    }
}

// ─── Audio events ─────────────────────────────────────────────────────────────
function setupAudio() {
    audioEl.addEventListener('timeupdate', () => {
        const t  = audioEl.currentTime || 0;
        const d  = audioEl.duration || 0;
        const pct = d ? (t / d) * 100 : 0;
        progressFill.style.width  = `${pct}%`;
        progressThumb.style.left  = `${pct}%`;
        timeCurrent.textContent   = fmt(t);
        syncLyrics(t);
    });

    audioEl.addEventListener('loadedmetadata', () => {
        timeTotal.textContent = fmt(audioEl.duration);
    });

    audioEl.addEventListener('ended', () => playNext());

    audioEl.addEventListener('pause', () => { isPlaying = false; updatePlayBtn(); });
    audioEl.addEventListener('play',  () => { isPlaying = true;  updatePlayBtn(); });

    // Click progress bar
    progressBar.addEventListener('click', seekTo);
    progressBar.addEventListener('mousedown', e => {
        seekTo(e);
        const move = e => seekTo(e);
        const up   = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    });
}

function seekTo(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioEl.currentTime = pct * (audioEl.duration || 0);
}

// ─── Controls ─────────────────────────────────────────────────────────────────
window.togglePlay = () => {
    if (currentIdx === -1) { selectEpisode(0); return; }
    audioEl.paused ? audioEl.play() : audioEl.pause();
};

window.playNext = () => {
    if (playMode === 'random') selectEpisode(Math.floor(Math.random() * episodes.length));
    else if (playMode === 'loop') selectEpisode(currentIdx);
    else selectEpisode((currentIdx + 1) % episodes.length);
};

window.playPrev = () => selectEpisode((currentIdx - 1 + episodes.length) % episodes.length);

window.setMode = mode => {
    // Standardize 'sequential' to 'seq'
    if (mode === 'sequential') mode = 'seq';
    playMode = mode;
    ['Seq','Loop','Random'].forEach(k => {
        const btn = document.getElementById(`mode${k}`);
        if (btn) btn.classList.toggle('active', mode === k.toLowerCase());
    });
};

window.toggleLyrics = () => {
    const box = document.getElementById('lyricsSection');
    const btn = document.getElementById('btnToggleLyrics');
    if (box.style.display === 'none') {
        box.style.display = '';
        btn.textContent = 'Hide';
    } else {
        box.style.display = 'none';
        btn.textContent = 'Show';
    }
};

function updatePlayBtn() {
    btnPlay.innerHTML = isPlaying ? '⏸' : '▶';
}

function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
