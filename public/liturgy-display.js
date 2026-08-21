const textBlockEl = document.getElementById('textBlock');
const participantEl = document.getElementById('participantName');
const programEl = document.getElementById('programName');
let lastKey = '';

function render(data) {
  const key = data.worship + '|' + data.programName + '|' + data.participantName + '|' + data.blanked;
  if (data.blanked || !data.programName) {
    textBlockEl.classList.remove('visible');
    lastKey = key;
    return;
  }
  if (key !== lastKey) {
    textBlockEl.classList.remove('visible');
    setTimeout(() => {
      participantEl.textContent = data.participantName;
      programEl.textContent = data.programName;
      void textBlockEl.offsetWidth;
      textBlockEl.classList.add('visible');
    }, 180);
    lastKey = key;
  }
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    if (data.channel !== 'liturgy') return;
    render(data);
  };
  ws.onclose = () => setTimeout(connectWS, 1500);
}

connectWS();