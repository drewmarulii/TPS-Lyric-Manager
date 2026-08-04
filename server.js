const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 4400;
// DATA_DIR lets you point storage at a persistent volume when deployed
// (e.g. Railway's mounted volume path). Defaults to the bundled ./data
// folder for local use. The songs file is created automatically if the
// directory is empty/new.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'songs.json');
const SEED_FILE = path.join(__dirname, 'data', 'songs.json');
// If set, all write endpoints (POST/PUT/DELETE under /api) require this token
// via an "X-Auth-Token" header. Leave unset for local/LAN-only use.
const AUTH_TOKEN = process.env.LYRIC_MANAGER_PASSWORD || '';

// Make sure the data directory exists, and seed it with the example songs
// on first run (e.g. a freshly mounted, empty volume) so the app isn't blank.
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  const seed = fs.existsSync(SEED_FILE) ? fs.readFileSync(SEED_FILE, 'utf-8') : '[]';
  fs.writeFileSync(DATA_FILE, seed);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- optional auth ----------
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next(); // no password configured -> open (fine for LAN-only use)
  const supplied = req.get('X-Auth-Token');
  if (supplied === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------- storage helpers ----------
function loadSongs() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}
function saveSongs(songs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(songs, null, 2));
}
function nextId(songs) {
  const max = songs.reduce((m, s) => Math.max(m, parseInt(s.id, 10) || 0), 0);
  return String(max + 1);
}

// ---------- live show state ----------
let state = {
  songId: null,
  verseIndex: 0,
  blanked: true
};

function currentSong() {
  const songs = loadSongs();
  return songs.find(s => s.id === state.songId) || null;
}

function buildBroadcastPayload() {
  const song = currentSong();
  if (!song) {
    return {
      blanked: true,
      songTitle: null,
      verseIndex: 0,
      totalVerses: 0,
      verseText: ''
    };
  }
  return {
    blanked: state.blanked,
    songTitle: song.title,
    verseIndex: state.verseIndex,
    totalVerses: song.verses.length,
    verseText: song.verses[state.verseIndex] || ''
  };
}

function broadcast() {
  const payload = buildBroadcastPayload();
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(buildBroadcastPayload()));
});

// ---------- song CRUD ----------
app.get('/api/songs', (req, res) => {
  const songs = loadSongs().map(s => ({ id: s.id, title: s.title, verseCount: s.verses.length }));
  res.json(songs);
});

app.get('/api/songs/:id', (req, res) => {
  const song = loadSongs().find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(song);
});

app.post('/api/songs', requireAuth, (req, res) => {
  const { title, verses } = req.body;
  if (!title || !Array.isArray(verses)) {
    return res.status(400).json({ error: 'title and verses[] are required' });
  }
  const songs = loadSongs();
  const song = { id: nextId(songs), title, verses };
  songs.push(song);
  saveSongs(songs);
  res.json(song);
});

app.put('/api/songs/:id', requireAuth, (req, res) => {
  const { title, verses } = req.body;
  const songs = loadSongs();
  const idx = songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });
  if (title !== undefined) songs[idx].title = title;
  if (Array.isArray(verses)) songs[idx].verses = verses;
  saveSongs(songs);
  if (state.songId === req.params.id) {
    if (state.verseIndex >= songs[idx].verses.length) state.verseIndex = 0;
    broadcast();
  }
  res.json(songs[idx]);
});

app.delete('/api/songs/:id', requireAuth, (req, res) => {
  let songs = loadSongs();
  const existed = songs.some(s => s.id === req.params.id);
  songs = songs.filter(s => s.id !== req.params.id);
  saveSongs(songs);
  if (state.songId === req.params.id) {
    state = { songId: null, verseIndex: 0, blanked: true };
    broadcast();
  }
  res.json({ deleted: existed });
});

// ---------- live control ----------
app.get('/api/state', (req, res) => {
  res.json(buildBroadcastPayload());
});

app.post('/api/control/load', requireAuth, (req, res) => {
  const { songId } = req.body;
  const song = loadSongs().find(s => s.id === songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  state = { songId, verseIndex: 0, blanked: false };
  broadcast();
  res.json(buildBroadcastPayload());
});

app.post('/api/control/goto', requireAuth, (req, res) => {
  const { index } = req.body;
  const song = currentSong();
  if (!song) return res.status(400).json({ error: 'No song loaded' });
  const clamped = Math.max(0, Math.min(index, song.verses.length - 1));
  state.verseIndex = clamped;
  broadcast();
  res.json(buildBroadcastPayload());
});

app.post('/api/control/next', requireAuth, (req, res) => {
  const song = currentSong();
  if (!song) return res.status(400).json({ error: 'No song loaded' });
  state.verseIndex = Math.min(state.verseIndex + 1, song.verses.length - 1);
  broadcast();
  res.json(buildBroadcastPayload());
});

app.post('/api/control/prev', requireAuth, (req, res) => {
  const song = currentSong();
  if (!song) return res.status(400).json({ error: 'No song loaded' });
  state.verseIndex = Math.max(state.verseIndex - 1, 0);
  broadcast();
  res.json(buildBroadcastPayload());
});

app.post('/api/control/blank', requireAuth, (req, res) => {
  const { blanked } = req.body;
  state.blanked = !!blanked;
  broadcast();
  res.json(buildBroadcastPayload());
});

server.listen(PORT, () => {
  console.log(`Lyric Manager running at http://localhost:${PORT}`);
  console.log(`  Control panel : http://localhost:${PORT}/control.html`);
  console.log(`  OBS display   : http://localhost:${PORT}/display.html`);
});
