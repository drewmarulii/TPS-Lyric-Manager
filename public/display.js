const verseEl = document.getElementById('verse');
let lastKey = '';

function render(data) {
  const key = data.songTitle + '|' + data.verseIndex + '|' + data.blanked;
  if (data.blanked || !data.songTitle) {
    verseEl.classList.remove('visible');
    setTimeout(() => { if (key === lastKey) verseEl.textContent = ''; }, 350);
    lastKey = key;
    return;
  }
  if (key !== lastKey) {
    verseEl.classList.remove('visible');
    setTimeout(() => {
      verseEl.textContent = data.verseText;
      void verseEl.offsetWidth;
      verseEl.classList.add('visible');
    }, 180);
    lastKey = key;
  }
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (evt) => render(JSON.parse(evt.data));
  ws.onclose = () => setTimeout(connectWS, 1500);
}

connectWS();
