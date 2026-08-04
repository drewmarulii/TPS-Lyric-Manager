const songListEl = document.getElementById('songList');
const nowPlayingTitleEl = document.getElementById('nowPlayingTitle');
const versePreviewEl = document.getElementById('versePreview');
const verseCounterEl = document.getElementById('verseCounter');
const verseJumpEl = document.getElementById('verseJump');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const blankBtn = document.getElementById('blankBtn');
const newSongBtn = document.getElementById('newSongBtn');
const editTitle = document.getElementById('editTitle');
const editVerses = document.getElementById('editVerses');
const editorHeading = document.getElementById('editorHeading');
const saveSongBtn = document.getElementById('saveSongBtn');
const deleteSongBtn = document.getElementById('deleteSongBtn');
const obsUrlEl = document.getElementById('obsUrl');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const songSearchInput = document.getElementById('songSearchInput');
const songSearchBtn = document.getElementById('songSearchBtn');
const songResetBtn = document.getElementById('songResetBtn');

let songs = [];
let songFilter = '';
let activeEditId = null; // song currently open in editor
let state = { songId: null, verseIndex: 0, blanked: true, songTitle: null, totalVerses: 0 };
let currentSongCache = null; // full song object for the loaded (live) song

const obsUrl = `${location.origin}/display.html`;
obsUrlEl.textContent = obsUrl;
copyUrlBtn.onclick = () => {
  navigator.clipboard.writeText(obsUrl);
  copyUrlBtn.textContent = 'Copied!';
  setTimeout(() => (copyUrlBtn.textContent = 'Copy'), 1200);
};

function getAuthToken() {
  return localStorage.getItem('lyricManagerToken') || '';
}
function setAuthToken(token) {
  localStorage.setItem('lyricManagerToken', token);
}

async function api(path, opts = {}) {
  const isWrite = opts.method && opts.method !== 'GET';
  const headers = { 'Content-Type': 'application/json' };
  if (isWrite) headers['X-Auth-Token'] = getAuthToken();
  const res = await fetch(path, { headers, ...opts });
  if (res.status === 401) {
    const token = prompt('This control panel is password-protected.\nEnter the show password:');
    if (token !== null) {
      setAuthToken(token);
      return api(path, opts); // retry once with the new token
    }
    throw new Error('Unauthorized');
  }
  return res.json();
}

async function loadSongList() {
  songs = await api('/api/songs');
  renderSongList();
}

function renderSongList() {
  songListEl.innerHTML = '';
  const filtered = songFilter
    ? songs.filter(s => s.title.toLowerCase().includes(songFilter.toLowerCase()))
    : songs;
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = songFilter ? 'No songs match your search.' : 'No songs yet.';
    songListEl.appendChild(li);
    return;
  }
  filtered.forEach(s => {
    const li = document.createElement('li');
    li.className = s.id === state.songId ? 'active' : '';
    li.innerHTML = `<span>${escapeHtml(s.title)}</span><span class="count">${s.verseCount}v</span>`;
    li.onclick = () => {
      loadIntoShow(s.id);
      openEditor(s.id);
    };
    songListEl.appendChild(li);
  });
}

songSearchBtn.onclick = () => {
  songFilter = songSearchInput.value.trim();
  renderSongList();
};
songResetBtn.onclick = () => {
  songFilter = '';
  songSearchInput.value = '';
  renderSongList();
};
songSearchInput.addEventListener('input', () => {
  songFilter = songSearchInput.value.trim();
  renderSongList();
});
songSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') songSearchBtn.click();
  if (e.key === 'Escape') songResetBtn.click();
});

async function loadIntoShow(songId) {
  await api('/api/control/load', { method: 'POST', body: JSON.stringify({ songId }) });
}

async function openEditor(songId) {
  const song = await api(`/api/songs/${songId}`);
  activeEditId = songId;
  editorHeading.textContent = `Edit: ${song.title}`;
  editTitle.value = song.title;
  editVerses.value = song.verses.join('\n\n');
}

newSongBtn.onclick = () => {
  activeEditId = null;
  editorHeading.textContent = 'New Song';
  editTitle.value = '';
  editVerses.value = '';
  editTitle.focus();
};

saveSongBtn.onclick = async () => {
  const title = editTitle.value.trim();
  const verses = editVerses.value
    .split(/\n\s*\n/)
    .map(v => v.trim())
    .filter(v => v.length > 0);
  if (!title || verses.length === 0) {
    alert('Please provide a title and at least one verse.');
    return;
  }
  if (activeEditId) {
    await api(`/api/songs/${activeEditId}`, { method: 'PUT', body: JSON.stringify({ title, verses }) });
  } else {
    const created = await api('/api/songs', { method: 'POST', body: JSON.stringify({ title, verses }) });
    activeEditId = created.id;
  }
  await loadSongList();
  openEditor(activeEditId);
};

deleteSongBtn.onclick = async () => {
  if (!activeEditId) return;
  if (!confirm('Delete this song? This cannot be undone.')) return;
  await api(`/api/songs/${activeEditId}`, { method: 'DELETE' });
  activeEditId = null;
  editTitle.value = '';
  editVerses.value = '';
  editorHeading.textContent = 'Edit Song';
  await loadSongList();
};

prevBtn.onclick = () => api('/api/control/prev', { method: 'POST' });
nextBtn.onclick = () => api('/api/control/next', { method: 'POST' });
blankBtn.onclick = () => api('/api/control/blank', { method: 'POST', body: JSON.stringify({ blanked: !state.blanked }) });

document.addEventListener('keydown', (e) => {
  if (document.activeElement === editTitle || document.activeElement === editVerses) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextBtn.click(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevBtn.click(); }
  if (e.key.toLowerCase() === 'b') { blankBtn.click(); }
});

function renderVerseJump() {
  verseJumpEl.innerHTML = '';
  for (let i = 0; i < state.totalVerses; i++) {
    const b = document.createElement('button');
    b.textContent = i + 1;
    if (i === state.verseIndex) b.classList.add('active');
    b.onclick = () => api('/api/control/goto', { method: 'POST', body: JSON.stringify({ index: i }) });
    verseJumpEl.appendChild(b);
  }
}

function renderLive() {
  nowPlayingTitleEl.textContent = state.songTitle
    ? state.songTitle + (state.blanked ? '  (blanked)' : '')
    : 'No song loaded';
  versePreviewEl.textContent = state.songTitle ? state.verseText : '—';
  verseCounterEl.textContent = state.totalVerses ? `${state.verseIndex + 1} / ${state.totalVerses}` : '0 / 0';
  prevBtn.disabled = state.verseIndex <= 0;
  nextBtn.disabled = state.verseIndex >= state.totalVerses - 1;
  blankBtn.textContent = state.blanked ? 'Show Lyrics' : 'Blank Lyrics';
  renderVerseJump();
  renderSongList();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    state = { ...state, ...data };
    renderLive();
  };
  ws.onclose = () => setTimeout(connectWS, 1500);
}

(async function init() {
  await loadSongList();
  connectWS();
})();