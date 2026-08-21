const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 4400;
const SONGS_SEED_FILE = path.join(__dirname, 'data', 'songs.json');
const LITURGY_SEED_FILE = path.join(__dirname, 'data', 'liturgy.json');
// If set, all write endpoints (POST/PUT/DELETE under /api) require this token
// via an "X-Auth-Token" header. Leave unset for local/LAN-only use.
const AUTH_TOKEN = process.env.LYRIC_MANAGER_PASSWORD || '';

// ---------- storage backend ----------
// Two modes:
//  - Redis (Upstash): set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
//    Data survives redeploys/restarts even on hosts with no persistent disk
//    (e.g. Render's free tier) — recommended when deploying.
//  - Local file (default): writes to DATA_DIR/songs.json and
//    DATA_DIR/liturgy.json. Fine for running on your own machine, but most
//    free hosts wipe this on redeploy/restart.
const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let redis = null;
let SONGS_DATA_FILE = null;
let LITURGY_DATA_FILE = null;

if (USE_REDIS) {
  const { Redis } = require('@upstash/redis');
  redis = Redis.fromEnv({ enableAutoPipelining: false });
} else {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  SONGS_DATA_FILE = path.join(DATA_DIR, 'songs.json');
  if (!fs.existsSync(SONGS_DATA_FILE)) {
    const seed = fs.existsSync(SONGS_SEED_FILE) ? fs.readFileSync(SONGS_SEED_FILE, 'utf-8') : '[]';
    fs.writeFileSync(SONGS_DATA_FILE, seed);
  }

  LITURGY_DATA_FILE = path.join(DATA_DIR, 'liturgy.json');
  if (!fs.existsSync(LITURGY_DATA_FILE)) {
    const seed = fs.existsSync(LITURGY_SEED_FILE) ? fs.readFileSync(LITURGY_SEED_FILE, 'utf-8') : '[]';
    fs.writeFileSync(LITURGY_DATA_FILE, seed);
  }
}

// ---------- songs storage ----------
async function loadSongs() {
  if (USE_REDIS) {
    const data = await redis.get('songs');
    if (data === null || data === undefined) {
      const seed = fs.existsSync(SONGS_SEED_FILE) ? JSON.parse(fs.readFileSync(SONGS_SEED_FILE, 'utf-8')) : [];
      await redis.set('songs', seed);
      return seed;
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  try {
    return JSON.parse(fs.readFileSync(SONGS_DATA_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}
async function saveSongs(songs) {
  if (USE_REDIS) {
    await redis.set('songs', songs);
    return;
  }
  fs.writeFileSync(SONGS_DATA_FILE, JSON.stringify(songs, null, 2));
}
function nextId(songs) {
  const max = songs.reduce((m, s) => Math.max(m, parseInt(s.id, 10) || 0), 0);
  return String(max + 1);
}

// ---------- liturgy storage ----------
// Shape: [ { worship: "sabbath-school", detail: [ { "program-name": "...", "participant-name": "..." }, ... ] }, ... ]
async function loadLiturgy() {
  if (USE_REDIS) {
    const data = await redis.get('liturgy');
    if (data === null || data === undefined) {
      const seed = fs.existsSync(LITURGY_SEED_FILE) ? JSON.parse(fs.readFileSync(LITURGY_SEED_FILE, 'utf-8')) : [];
      await redis.set('liturgy', seed);
      return seed;
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  try {
    return JSON.parse(fs.readFileSync(LITURGY_DATA_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}
async function saveLiturgy(liturgy) {
  if (USE_REDIS) {
    await redis.set('liturgy', liturgy);
    return;
  }
  fs.writeFileSync(LITURGY_DATA_FILE, JSON.stringify(liturgy, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- optional auth ----------
// Gates song-library management (create/edit/delete) and liturgy editing.
// Live show control (load/next/prev/blank, liturgy show/blank) stays open
// so performing/running the service isn't interrupted by auth prompts.
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next(); // no password configured -> open (fine for LAN-only use)
  const supplied = req.get('X-Auth-Token');
  if (supplied === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------- lyric live show state ----------
let lyricState = {
  songId: null,
  verseIndex: 0,
  blanked: true
};

async function currentSong() {
  const songs = await loadSongs();
  return songs.find(s => s.id === lyricState.songId) || null;
}

async function buildLyricPayload() {
  const song = await currentSong();
  if (!song) {
    return { blanked: true, songTitle: null, verseIndex: 0, totalVerses: 0, verseText: '' };
  }
  return {
    blanked: lyricState.blanked,
    songTitle: song.title,
    verseIndex: lyricState.verseIndex,
    totalVerses: song.verses.length,
    verseText: song.verses[lyricState.verseIndex] || ''
  };
}

async function broadcastLyric() {
  const payload = await buildLyricPayload();
  const msg = JSON.stringify({ channel: 'lyric', ...payload });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// ---------- liturgy live show state ----------
let liturgyState = {
  worship: null,
  programName: null,
  participantName: null,
  blanked: true
};

function buildLiturgyPayload() {
  return {
    blanked: liturgyState.blanked,
    worship: liturgyState.worship,
    programName: liturgyState.programName,
    participantName: liturgyState.participantName
  };
}

function broadcastLiturgy() {
  const payload = buildLiturgyPayload();
  const msg = JSON.stringify({ channel: 'liturgy', ...payload });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', async (ws) => {
  ws.send(JSON.stringify({ channel: 'lyric', ...(await buildLyricPayload()) }));
  ws.send(JSON.stringify({ channel: 'liturgy', ...buildLiturgyPayload() }));
});

// ================= SONGS (lyrics) =================

app.get('/api/songs', async (req, res) => {
  const songs = (await loadSongs()).map(s => ({ id: s.id, title: s.title, verseCount: s.verses.length }));
  res.json(songs);
});

app.get('/api/songs/:id', async (req, res) => {
  const song = (await loadSongs()).find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(song);
});

app.post('/api/songs', requireAuth, async (req, res) => {
  const { title, verses } = req.body;
  if (!title || !Array.isArray(verses)) {
    return res.status(400).json({ error: 'title and verses[] are required' });
  }
  const songs = await loadSongs();
  const song = { id: nextId(songs), title, verses };
  songs.push(song);
  await saveSongs(songs);
  res.json(song);
});

app.put('/api/songs/:id', requireAuth, async (req, res) => {
  const { title, verses } = req.body;
  const songs = await loadSongs();
  const idx = songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });
  if (title !== undefined) songs[idx].title = title;
  if (Array.isArray(verses)) songs[idx].verses = verses;
  await saveSongs(songs);
  if (lyricState.songId === req.params.id) {
    if (lyricState.verseIndex >= songs[idx].verses.length) lyricState.verseIndex = 0;
    await broadcastLyric();
  }
  res.json(songs[idx]);
});

app.delete('/api/songs/:id', requireAuth, async (req, res) => {
  let songs = await loadSongs();
  const existed = songs.some(s => s.id === req.params.id);
  songs = songs.filter(s => s.id !== req.params.id);
  await saveSongs(songs);
  if (lyricState.songId === req.params.id) {
    lyricState = { songId: null, verseIndex: 0, blanked: true };
    await broadcastLyric();
  }
  res.json({ deleted: existed });
});

app.get('/api/state', async (req, res) => {
  res.json(await buildLyricPayload());
});

app.post('/api/control/load', async (req, res) => {
  const { songId } = req.body;
  const song = (await loadSongs()).find(s => s.id === songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  lyricState = { songId, verseIndex: 0, blanked: false };
  await broadcastLyric();
  res.json(await buildLyricPayload());
});

app.post('/api/control/goto', async (req, res) => {
  const { index } = req.body;
  const song = await currentSong();
  if (!song) return res.status(400).json({ error: 'No song loaded' });
  lyricState.verseIndex = Math.max(0, Math.min(index, song.verses.length - 1));
  await broadcastLyric();
  res.json(await buildLyricPayload());
});

app.post('/api/control/next', async (req, res) => {
  const song = await currentSong();
  if (!song) return res.status(400).json({ error: 'No song loaded' });
  lyricState.verseIndex = Math.min(lyricState.verseIndex + 1, song.verses.length - 1);
  await broadcastLyric();
  res.json(await buildLyricPayload());
});

app.post('/api/control/prev', async (req, res) => {
  const song = await currentSong();
  if (!song) return res.status(400).json({ error: 'No song loaded' });
  lyricState.verseIndex = Math.max(lyricState.verseIndex - 1, 0);
  await broadcastLyric();
  res.json(await buildLyricPayload());
});

app.post('/api/control/blank', async (req, res) => {
  const { blanked } = req.body;
  lyricState.blanked = !!blanked;
  await broadcastLyric();
  res.json(await buildLyricPayload());
});

// ================= LITURGY (program / participant) =================

app.get('/api/liturgy', async (req, res) => {
  res.json(await loadLiturgy());
});

// Replace the whole liturgy structure (e.g. after editing in the panel).
// Expects the same shape as data/liturgy.json.
app.put('/api/liturgy', requireAuth, async (req, res) => {
  const liturgy = req.body;
  if (!Array.isArray(liturgy)) {
    return res.status(400).json({ error: 'Body must be an array of { worship, detail[] }' });
  }
  await saveLiturgy(liturgy);
  res.json(liturgy);
});

app.get('/api/liturgy-state', (req, res) => {
  res.json(buildLiturgyPayload());
});

// Show one program/participant flag from a given worship's detail list.
app.post('/api/liturgy-control/show', async (req, res) => {
  const { worship, index } = req.body;
  const liturgy = await loadLiturgy();
  const section = liturgy.find(w => w.worship === worship);
  if (!section) return res.status(404).json({ error: 'Worship not found' });
  const item = section.detail[index];
  if (!item) return res.status(404).json({ error: 'Program item not found' });
  liturgyState = {
    worship,
    programName: item['program-name'],
    participantName: item['participant-name'],
    blanked: false
  };
  broadcastLiturgy();
  res.json(buildLiturgyPayload());
});

app.post('/api/liturgy-control/blank', (req, res) => {
  const { blanked } = req.body;
  liturgyState.blanked = !!blanked;
  broadcastLiturgy();
  res.json(buildLiturgyPayload());
});

server.listen(PORT, () => {
  console.log(`Lyric Manager running at http://localhost:${PORT}`);
  console.log(`  Storage             : ${USE_REDIS ? 'Upstash Redis (persistent)' : 'local file (data/*.json)'}`);
  console.log(`  Lyrics control      : http://localhost:${PORT}/control.html`);
  console.log(`  Lyrics OBS display  : http://localhost:${PORT}/display.html`);
  console.log(`  Liturgy control     : http://localhost:${PORT}/liturgy-control.html`);
  console.log(`  Liturgy OBS display : http://localhost:${PORT}/liturgy-display.html`);
});
