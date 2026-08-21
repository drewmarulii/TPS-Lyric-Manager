const worshipListEl = document.getElementById('worshipList');
const newWorshipBtn = document.getElementById('newWorshipBtn');
const programsHeadingEl = document.getElementById('programsHeading');
const programFlagsEl = document.getElementById('programFlags');
const nowWorshipEl = document.getElementById('nowWorship');
const nowProgramEl = document.getElementById('nowProgram');
const nowParticipantEl = document.getElementById('nowParticipant');
const blankBtn = document.getElementById('blankBtn');
const obsUrlEl = document.getElementById('obsUrl');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const itemProgramInput = document.getElementById('itemProgramInput');
const itemParticipantInput = document.getElementById('itemParticipantInput');
const itemSaveBtn = document.getElementById('itemSaveBtn');
const itemCancelBtn = document.getElementById('itemCancelBtn');

let liturgy = [];          
let selectedWorship = null; 
let editingIndex = null;
let state = { worship: null, programName: null, participantName: null, blanked: true };

const obsUrl = `${location.origin}/liturgy-display.html`;
obsUrlEl.textContent = obsUrl;
copyUrlBtn.onclick = () => {
  navigator.clipboard.writeText(obsUrl);
  copyUrlBtn.textContent = 'Copied!';
  setTimeout(() => (copyUrlBtn.textContent = 'Copy'), 1200);
};

function worshipLabel(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'worship';
}

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
    const token = prompt('Editing the liturgy is password-protected.\nEnter the password:');
    if (token !== null) {
      setAuthToken(token);
      return api(path, opts);
    }
    throw new Error('Unauthorized');
  }
  return res.json();
}

async function saveLiturgyToServer() {
  await api('/api/liturgy', { method: 'PUT', body: JSON.stringify(liturgy) });
}

async function loadLiturgy() {
  liturgy = await api('/api/liturgy');
  if (selectedWorship && !liturgy.some(w => w.worship === selectedWorship)) {
    selectedWorship = null;
  }
  if (!selectedWorship && liturgy.length) selectedWorship = liturgy[0].worship;
  renderWorshipList();
  renderProgramFlags();
}

function renderWorshipList() {
  worshipListEl.innerHTML = '';
  if (liturgy.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No worship services yet — add one below.';
    worshipListEl.appendChild(li);
    return;
  }
  liturgy.forEach(w => {
    const li = document.createElement('li');
    li.className = w.worship === selectedWorship ? 'active' : '';
    li.innerHTML = `
      <span>${escapeHtml(worshipLabel(w.worship))}</span>
      <span class="row-actions">
        <span class="count">${w.detail.length}</span>
        <button class="icon-btn delete-worship-btn" title="Delete worship">✕</button>
      </span>
    `;
    li.onclick = () => {
      selectedWorship = w.worship;
      editingIndex = null;
      clearItemForm();
      renderWorshipList();
      renderProgramFlags();
    };
    li.querySelector('.delete-worship-btn').onclick = (e) => {
      e.stopPropagation();
      deleteWorship(w.worship);
    };
    worshipListEl.appendChild(li);
  });
}

newWorshipBtn.onclick = async () => {
  const name = prompt('Name of the new worship service (e.g. "Evening Service"):');
  if (!name || !name.trim()) return;
  let slug = slugify(name);
  let suffix = 2;
  while (liturgy.some(w => w.worship === slug)) {
    slug = `${slugify(name)}-${suffix++}`;
  }
  liturgy.push({ worship: slug, detail: [] });
  try {
    await saveLiturgyToServer();
  } catch (e) {
    return; 
  }
  selectedWorship = slug;
  renderWorshipList();
  renderProgramFlags();
};

async function deleteWorship(worship) {
  const section = liturgy.find(w => w.worship === worship);
  if (!section) return;
  if (!confirm(`Delete "${worshipLabel(worship)}" and all ${section.detail.length} program item(s) in it?`)) return;
  const previous = liturgy;
  liturgy = liturgy.filter(w => w.worship !== worship);
  try {
    await saveLiturgyToServer();
  } catch (e) {
    liturgy = previous;
    return;
  }
  if (selectedWorship === worship) {
    selectedWorship = liturgy.length ? liturgy[0].worship : null;
    editingIndex = null;
    clearItemForm();
  }
  renderWorshipList();
  renderProgramFlags();
}

function renderProgramFlags() {
  const section = liturgy.find(w => w.worship === selectedWorship);
  programsHeadingEl.textContent = section ? `Program Items — ${worshipLabel(section.worship)}` : 'Program Items';
  programFlagsEl.innerHTML = '';

  if (!section) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Select or add a worship service first.';
    programFlagsEl.appendChild(hint);
    return;
  }
  if (section.detail.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'No program items yet — add one below.';
    programFlagsEl.appendChild(hint);
  }

  section.detail.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'flag-row';

    const isActive = !state.blanked
      && state.worship === section.worship
      && state.programName === item['program-name']
      && state.participantName === item['participant-name'];

    const btn = document.createElement('button');
    btn.className = 'flag-btn' + (isActive ? ' active' : '');
    btn.innerHTML = `
      <span class="flag-program">${escapeHtml(item['program-name'])}</span>
      <span class="flag-participant">${escapeHtml(item['participant-name'])}</span>
    `;
    btn.onclick = () => showProgram(section.worship, index);

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      startEditItem(index, item);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteItem(index);
    };

    row.appendChild(btn);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);
    programFlagsEl.appendChild(row);
  });
}

function clearItemForm() {
  editingIndex = null;
  itemProgramInput.value = '';
  itemParticipantInput.value = '';
  itemSaveBtn.textContent = '+ Add Item';
  itemCancelBtn.hidden = true;
}

function startEditItem(index, item) {
  editingIndex = index;
  itemProgramInput.value = item['program-name'];
  itemParticipantInput.value = item['participant-name'];
  itemSaveBtn.textContent = 'Save Changes';
  itemCancelBtn.hidden = false;
  itemProgramInput.focus();
}

itemCancelBtn.onclick = () => {
  clearItemForm();
};

itemSaveBtn.onclick = async () => {
  const section = liturgy.find(w => w.worship === selectedWorship);
  if (!section) {
    alert('Select or add a worship service first.');
    return;
  }
  const programName = itemProgramInput.value.trim();
  const participantName = itemParticipantInput.value.trim();
  if (!programName || !participantName) {
    alert('Please fill in both program name and participant name.');
    return;
  }

  const previous = JSON.parse(JSON.stringify(liturgy));
  if (editingIndex !== null) {
    section.detail[editingIndex] = { 'program-name': programName, 'participant-name': participantName };
  } else {
    section.detail.push({ 'program-name': programName, 'participant-name': participantName });
  }
  try {
    await saveLiturgyToServer();
  } catch (e) {
    liturgy = previous;
    return;
  }
  clearItemForm();
  renderProgramFlags();
};

async function deleteItem(index) {
  const section = liturgy.find(w => w.worship === selectedWorship);
  if (!section) return;
  if (!confirm(`Delete "${section.detail[index]['program-name']}"?`)) return;
  const previous = JSON.parse(JSON.stringify(liturgy));
  section.detail.splice(index, 1);
  try {
    await saveLiturgyToServer();
  } catch (e) {
    liturgy = previous;
    return;
  }
  if (editingIndex === index) clearItemForm();
  renderProgramFlags();
}

async function showProgram(worship, index) {
  await api('/api/liturgy-control/show', {
    method: 'POST',
    body: JSON.stringify({ worship, index })
  });
}

blankBtn.onclick = () => api('/api/liturgy-control/blank', { method: 'POST', body: JSON.stringify({ blanked: !state.blanked }) });

function renderNowShowing() {
  if (!state.worship || state.blanked) {
    nowWorshipEl.textContent = state.worship
      ? `${worshipLabel(state.worship)} (blanked)`
      : 'No worship selected';
  } else {
    nowWorshipEl.textContent = worshipLabel(state.worship);
  }
  nowProgramEl.textContent = state.programName || '—';
  nowParticipantEl.textContent = state.participantName || '—';
  blankBtn.textContent = state.blanked ? 'Show' : 'Blank';
  renderProgramFlags();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    if (data.channel !== 'liturgy') return;
    state = { ...state, ...data };
    renderNowShowing();
  };
  ws.onclose = () => setTimeout(connectWS, 1500);
}

(async function init() {
  await loadLiturgy();
  connectWS();
})();