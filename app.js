/* =========================================================
   QuizBattle — Lógica principal (anfitrión + jugador)
   Red: PeerJS (WebRTC P2P) + respaldo BroadcastChannel
   ========================================================= */
'use strict';

/* ---------------- Constantes ---------------- */
const ANSWERS = [
  { cls: 'c-red', shape: '▲', name: 'Rojo' },
  { cls: 'c-blue', shape: '◆', name: 'Azul' },
  { cls: 'c-yellow', shape: '●', name: 'Amarillo' },
  { cls: 'c-green', shape: '■', name: 'Verde' }
];
const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐵', '🐯', '🐧', '🐨', '🦖', '👽', '🤖', '🐲', '🦉', '🐳'];
const BADGES = ['#E21B3C', '#1368CE', '#D89E00', '#26890C', '#864CBF', '#0AA3A3', '#E2611B', '#C2185B'];
const PEER_PREFIX = 'quizbattle-v1-';
const STORAGE_QUIZ = 'quizbattle.quiz';
const STORAGE_MUSIC = 'quizbattle.music';
const ROW_H = 72;
const CIRC = 2 * Math.PI * 45;

/* ---------------- Utilidades ---------------- */
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
  window.scrollTo(0, 0);
}

let toastTimer = null;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function genPin() { return String(Math.floor(100000 + Math.random() * 900000)); }
function genId() { return 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function formatPin(pin) { return pin.slice(0, 3) + ' ' + pin.slice(3); }
function baseUrl() { return location.origin + location.pathname; }
function badgeFor(avatar) { const i = AVATARS.indexOf(avatar); return BADGES[(i < 0 ? 0 : i) % BADGES.length]; }

/* Ilustración SVG inline (nunca falla en GitHub Pages) */
function svgImg(emoji, c1, c2) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 240'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs>` +
    `<rect width='400' height='240' rx='22' fill='url(#g)'/>` +
    `<circle cx='60' cy='55' r='34' fill='rgba(255,255,255,0.16)'/>` +
    `<rect x='300' y='150' width='70' height='70' rx='10' transform='rotate(20 335 185)' fill='rgba(255,255,255,0.13)'/>` +
    `<polygon points='330,30 370,95 290,95' fill='rgba(255,255,255,0.12)'/>` +
    `<text x='200' y='160' font-size='118' text-anchor='middle'>${emoji}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* ---------------- Quiz precargado ---------------- */
function defaultQuiz() {
  return {
    title: 'Cultura General',
    questions: [
      { text: '¿Cuál es el planeta más grande del sistema solar?', options: ['Saturno', 'Júpiter', 'Neptuno', 'Tierra'], correct: 1, time: 20, image: svgImg('🪐', '#1368CE', '#46178F') },
      { text: '¿En qué continente está Egipto?', options: ['Asia', 'Europa', 'África', 'Oceanía'], correct: 2, time: 20, image: svgImg('🐫', '#D89E00', '#E2611B') },
      { text: '¿Cuántas patas tiene una araña?', options: ['6', '8', '10', '12'], correct: 1, time: 10, image: svgImg('🕷️', '#26890C', '#0AA3A3') },
      { text: '¿Quién pintó la Mona Lisa?', options: ['Miguel Ángel', 'Picasso', 'Van Gogh', 'Leonardo da Vinci'], correct: 3, time: 20, image: svgImg('🎨', '#E21B3C', '#864CBF') },
      { text: '¿Cuál es el océano más grande del mundo?', options: ['Pacífico', 'Atlántico', 'Índico', 'Ártico'], correct: 0, time: 30, image: svgImg('🌊', '#0AA3A3', '#1368CE') }
    ]
  };
}

function normalizeQuiz(data) {
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) throw new Error('El archivo no contiene preguntas.');
  return {
    title: String(data.title || 'Mi quiz').slice(0, 60),
    questions: data.questions.map((q) => {
      const opts = Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => String(o == null ? '' : o).slice(0, 75)) : [];
      while (opts.length < 4) opts.push('');
      const time = [10, 20, 30].includes(Number(q.time)) ? Number(q.time) : 20;
      const correct = Number.isInteger(Number(q.correct)) && q.correct >= 0 && q.correct < 4 ? Number(q.correct) : 0;
      return { text: String(q.text || '').slice(0, 160), options: opts, correct, time, image: typeof q.image === 'string' ? q.image : '' };
    })
  };
}

function loadQuiz() {
  try {
    const raw = localStorage.getItem(STORAGE_QUIZ);
    if (raw) return normalizeQuiz(JSON.parse(raw));
  } catch (e) { /* usar ejemplo */ }
  return defaultQuiz();
}

function saveQuiz() {
  try { localStorage.setItem(STORAGE_QUIZ, JSON.stringify(H.quiz)); } catch (e) { /* storage lleno o bloqueado */ }
}

function activeOpts(q) { return [0, 1, 2, 3].filter((i) => q.options[i] && q.options[i].trim()); }
function questionValid(q) { return !!q.text.trim() && activeOpts(q).length >= 2 && !!(q.options[q.correct] || '').trim(); }

/* =========================================================
   ANFITRIÓN
   ========================================================= */
const H = {
  quiz: null, sel: 0, pin: null,
  peer: null, bc: null, conns: {}, peerOk: false,
  players: {}, order: 0,
  qi: -1, phase: 'idle', qStart: 0, timerId: null, answers: {}, lastSec: null,
  seq: 0, prevRanks: {}, countsCache: [0, 0, 0, 0]
};

/* ---------- Música de fondo ---------- */
const M = { mode: 'synth', url: '', name: '', volume: 60, previewing: false, objUrl: null };

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('quizbattle', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const r = db.transaction('files').objectStore('files').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function saveMusic() {
  try { localStorage.setItem(STORAGE_MUSIC, JSON.stringify({ mode: M.mode, url: M.url, name: M.name, volume: M.volume })); } catch (e) { /* ignorar */ }
}

function loadMusicSettings() {
  try { Object.assign(M, JSON.parse(localStorage.getItem(STORAGE_MUSIC) || '{}')); } catch (e) { /* ignorar */ }
}

async function applyMusic() {
  audio.setCustomVolume(M.volume / 100);
  let src = null;
  if (M.mode === 'file') {
    const blob = await idbGet('music').catch(() => null);
    if (blob) {
      if (M.objUrl) URL.revokeObjectURL(M.objUrl);
      M.objUrl = URL.createObjectURL(blob);
      src = M.objUrl;
    }
  } else if (M.mode === 'url' && M.url) {
    src = M.url;
  }
  audio.setCustomTrack(src);
  renderMusicUI();
}

function renderMusicUI() {
  $('#musicMode').value = M.mode;
  $('#musicVol').value = M.volume;
  $('#musicFileBtn').classList.toggle('hidden', M.mode !== 'file');
  $('#musicUrl').classList.toggle('hidden', M.mode !== 'url');
  $('#musicUrl').value = M.url || '';
  const nameEl = $('#musicName');
  nameEl.classList.toggle('hidden', M.mode !== 'file');
  nameEl.textContent = M.mode === 'file' ? (M.name ? '🎶 ' + M.name : 'Ninguna canción elegida') : '';
  $('#musicPreview').textContent = M.previewing ? '⏹ Detener' : '▶ Probar';
}

function stopPreview() {
  if (!M.previewing) return;
  M.previewing = false;
  audio.stopMusic(true);
  renderMusicUI();
}

function bindMusic() {
  $('#musicMode').addEventListener('change', async (e) => {
    stopPreview();
    M.mode = e.target.value;
    saveMusic();
    await applyMusic();
  });
  $('#musicFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast('Elige un archivo de audio (MP3, WAV, OGG, M4A…)'); return; }
    stopPreview();
    try {
      await idbPut('music', file);
      M.name = file.name;
      saveMusic();
      await applyMusic();
      toast('Canción guardada ✔ Sonará durante la partida');
    } catch (err) {
      toast('No se pudo guardar la canción en este navegador');
    }
  });
  $('#musicUrl').addEventListener('change', async (e) => {
    const v = e.target.value.trim();
    if (v && !/^https?:\/\//i.test(v)) { toast('El enlace debe empezar por http:// o https://'); return; }
    stopPreview();
    M.url = v;
    saveMusic();
    await applyMusic();
  });
  $('#musicVol').addEventListener('input', (e) => {
    M.volume = Number(e.target.value);
    audio.setCustomVolume(M.volume / 100);
    saveMusic();
  });
  $('#musicPreview').addEventListener('click', () => {
    audio.init();
    if (M.previewing) { stopPreview(); return; }
    if (M.mode !== 'synth' && !audio.hasCustom()) { toast(M.mode === 'file' ? 'Primero elige una canción' : 'Primero pega el enlace del MP3'); return; }
    M.previewing = true;
    audio.startMusic('lobby');
    renderMusicUI();
  });
  window.addEventListener('quizbattle-music-error', () => {
    toast('No se pudo reproducir la canción; se usará la música sintetizada.', 4000);
  });
}

/* ---------- Editor ---------- */
function openEditor() {
  if (!H.quiz) H.quiz = loadQuiz();
  if (H.sel >= H.quiz.questions.length) H.sel = 0;
  $('#quizTitle').value = H.quiz.title;
  renderQList();
  renderQForm();
  show('editor');
}

function renderQList() {
  const list = $('#qList');
  list.innerHTML = '';
  H.quiz.questions.forEach((q, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-item' + (i === H.sel ? ' active' : '') + (questionValid(q) ? '' : ' invalid');
    b.innerHTML = `<span class="q-num">${i + 1}</span><span class="q-item-text">${esc(q.text || 'Pregunta sin texto')}</span>`;
    b.addEventListener('click', () => { H.sel = i; renderQList(); renderQForm(); });
    list.appendChild(b);
  });
}

function renderQForm() {
  const q = H.quiz.questions[H.sel];
  $('#qFormTitle').textContent = `Pregunta ${H.sel + 1} de ${H.quiz.questions.length}`;
  $('#qText').value = q.text;
  $('#qTime').value = String(q.time);
  $('#qImage').value = q.image && q.image.startsWith('data:') ? '' : q.image;
  $('#qImage').placeholder = q.image && q.image.startsWith('data:') ? 'Ilustración incluida (pega una URL para cambiarla)' : 'https://… o déjalo vacío';
  updatePreview(q.image);
  const box = $('#qOptions');
  box.innerHTML = '';
  ANSWERS.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'opt-edit ' + a.cls;
    row.innerHTML = `<span class="shape-ic">${a.shape}</span>
      <input type="text" maxlength="75" placeholder="Respuesta ${i + 1}${i >= 2 ? ' (opcional)' : ''}" value="${esc(q.options[i])}">
      <button type="button" class="correct-toggle ${q.correct === i ? 'on' : ''}" title="Marcar como correcta">✔</button>`;
    row.querySelector('input').addEventListener('input', (e) => { q.options[i] = e.target.value; saveQuiz(); renderQList(); });
    row.querySelector('.correct-toggle').addEventListener('click', () => { q.correct = i; saveQuiz(); renderQForm(); });
    box.appendChild(row);
  });
  $('#btnDelQ').disabled = H.quiz.questions.length <= 1;
}

function updatePreview(src) {
  const img = $('#qImgPreview');
  const empty = $('#qImgEmpty');
  if (!src) { img.classList.remove('show'); img.removeAttribute('src'); empty.style.display = ''; empty.textContent = 'Sin imagen'; return; }
  img.onload = () => { img.classList.add('show'); empty.style.display = 'none'; };
  img.onerror = () => { img.classList.remove('show'); empty.style.display = ''; empty.textContent = '⚠ No se pudo cargar la imagen'; };
  img.src = src;
}

function bindEditor() {
  $('#quizTitle').addEventListener('input', (e) => { H.quiz.title = e.target.value; saveQuiz(); });
  $('#qText').addEventListener('input', (e) => { H.quiz.questions[H.sel].text = e.target.value; saveQuiz(); renderQList(); });
  $('#qTime').addEventListener('change', (e) => { H.quiz.questions[H.sel].time = Number(e.target.value); saveQuiz(); });
  $('#qImage').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    const q = H.quiz.questions[H.sel];
    if (v && !/^https?:\/\//i.test(v)) { toast('La URL debe empezar por http:// o https://'); return; }
    q.image = v;
    saveQuiz();
    updatePreview(v);
  });
  $('#btnAddQ').addEventListener('click', () => {
    H.quiz.questions.push({ text: '', options: ['', '', '', ''], correct: 0, time: 20, image: '' });
    H.sel = H.quiz.questions.length - 1;
    saveQuiz(); renderQList(); renderQForm();
    $('#qText').focus();
  });
  $('#btnDelQ').addEventListener('click', () => {
    if (H.quiz.questions.length <= 1) return;
    if (!confirm('¿Eliminar esta pregunta?')) return;
    H.quiz.questions.splice(H.sel, 1);
    H.sel = Math.max(0, H.sel - 1);
    saveQuiz(); renderQList(); renderQForm();
  });
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(H.quiz, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (H.quiz.title || 'quiz').toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').replace(/^-|-$/g, '') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Quiz exportado ✔');
  });
  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        H.quiz = normalizeQuiz(JSON.parse(reader.result));
        H.sel = 0; saveQuiz(); openEditor();
        toast(`Quiz importado: ${H.quiz.questions.length} preguntas ✔`);
      } catch (err) { toast('Archivo no válido: ' + err.message); }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
  $('#btnResetQuiz').addEventListener('click', () => {
    if (!confirm('¿Reemplazar el quiz actual por el quiz de ejemplo?')) return;
    H.quiz = defaultQuiz(); H.sel = 0; saveQuiz(); openEditor();
  });
  $('#btnEditorBack').addEventListener('click', () => { stopPreview(); show('home'); });
  $('#btnLaunch').addEventListener('click', () => {
    const bad = H.quiz.questions.findIndex((q) => !questionValid(q));
    if (bad >= 0) {
      H.sel = bad; renderQList(); renderQForm();
      toast(`Pregunta ${bad + 1}: escribe el enunciado, al menos 2 respuestas y marca una correcta con texto.`);
      return;
    }
    if (!H.quiz.title.trim()) H.quiz.title = 'QuizBattle';
    audio.init();
    if (M.previewing) { M.previewing = false; renderMusicUI(); }
    openLobby();
  });
}

/* ---------- Red del anfitrión ---------- */
function hostSend(pid, msg) {
  const m = Object.assign({}, msg, { from: 'host', to: pid, seq: ++H.seq });
  const c = H.conns[pid];
  if (c && c.open) { try { c.send(m); } catch (e) { /* conexión caída */ } }
  if (H.bc) { try { H.bc.postMessage(m); } catch (e) { /* canal cerrado */ } }
}

function hostBroadcast(msg) {
  const m = Object.assign({}, msg, { from: 'host', to: '*', seq: ++H.seq });
  Object.values(H.conns).forEach((c) => { if (c && c.open) { try { c.send(m); } catch (e) { /* ignorar */ } } });
  if (H.bc) { try { H.bc.postMessage(m); } catch (e) { /* ignorar */ } }
}

function closeHostNetwork() {
  Object.values(H.conns).forEach((c) => { try { c.close(); } catch (e) { /* ignorar */ } });
  H.conns = {};
  if (H.peer) { try { H.peer.destroy(); } catch (e) { /* ignorar */ } }
  H.peer = null; H.peerOk = false;
  if (H.bc) { try { H.bc.close(); } catch (e) { /* ignorar */ } }
  H.bc = null;
}

function setNetStatus(text, cls) {
  const el = $('#netStatus');
  el.textContent = text;
  el.className = 'net-status ' + (cls || '');
}

function startHostNetwork() {
  closeHostNetwork();
  try {
    H.bc = new BroadcastChannel(PEER_PREFIX + H.pin);
    H.bc.onmessage = (e) => { const m = e.data; if (m && m.from === 'player') hostHandle(m, null); };
  } catch (e) { H.bc = null; }

  if (!window.Peer) {
    setNetStatus('💻 Modo local: solo pestañas de este navegador (PeerJS no cargó)', 'warn');
    return;
  }
  setNetStatus('⏳ Abriendo sala en línea…');
  const peer = new Peer(PEER_PREFIX + H.pin, { debug: 0 });
  H.peer = peer;
  peer.on('open', () => { H.peerOk = true; setNetStatus('🌐 Sala en línea (P2P) — los celulares pueden unirse', 'ok'); });
  peer.on('connection', (conn) => {
    conn.on('data', (m) => { if (m && m.from === 'player') hostHandle(m, conn); });
    conn.on('close', () => {
      Object.keys(H.conns).forEach((pid) => { if (H.conns[pid] === conn) delete H.conns[pid]; });
    });
  });
  peer.on('disconnected', () => { if (!peer.destroyed) { try { peer.reconnect(); } catch (e) { /* ignorar */ } } });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      // PIN ocupado por otra sala: generar otro
      H.pin = genPin();
      renderLobbyHeader();
      startHostNetwork();
      return;
    }
    if (!H.peerOk) setNetStatus('💻 Sin conexión P2P: funciona entre pestañas de este navegador', 'warn');
  });
}

function hostHandle(m, conn) {
  if (!m.id) return;
  if (m.type === 'join') {
    if (conn) H.conns[m.id] = conn;
    const name = String(m.name || 'Jugador').slice(0, 15);
    const avatar = AVATARS.includes(m.avatar) ? m.avatar : AVATARS[0];
    let p = H.players[m.id];
    const isNew = !p;
    if (isNew) {
      p = { id: m.id, name, avatar, score: 0, streak: 0, lastPoints: 0, order: H.order++ };
      H.players[m.id] = p;
    } else {
      p.name = name; p.avatar = avatar;
    }
    hostSend(m.id, { type: 'welcome', name: p.name, avatar: p.avatar, score: p.score, phase: H.phase, title: H.quiz.title });
    // Si se reincorpora durante una pregunta, le reenviamos la pregunta
    if (H.phase === 'question' && !H.answers[m.id]) {
      const q = H.quiz.questions[H.qi];
      hostSend(m.id, { type: 'question', qi: H.qi, total: H.quiz.questions.length, time: q.time, score: p.score, opts: activeOpts(q) });
    }
    if (isNew) {
      audio.pop();
      renderLobbyPlayers(m.id);
      if (H.phase === 'question') updateAnswerCount();
    }
    return;
  }
  if (m.type === 'answer') {
    if (H.phase !== 'question' || m.qi !== H.qi || H.answers[m.id] || !H.players[m.id]) return;
    const choice = Number(m.choice);
    if (!activeOpts(H.quiz.questions[H.qi]).includes(choice)) return;
    H.answers[m.id] = { choice, t: Date.now() - H.qStart };
    hostSend(m.id, { type: 'received', qi: H.qi });
    updateAnswerCount(true);
    if (Object.keys(H.answers).length >= Object.keys(H.players).length) closeQuestion();
    return;
  }
  if (m.type === 'leave') {
    if (H.players[m.id] && H.phase === 'lobby') {
      delete H.players[m.id];
      delete H.conns[m.id];
      renderLobbyPlayers();
    }
  }
}

/* ---------- Lobby ---------- */
function openLobby() {
  H.pin = genPin();
  H.players = {}; H.order = 0; H.answers = {}; H.qi = -1; H.prevRanks = {};
  H.phase = 'lobby';
  renderLobbyHeader();
  renderLobbyPlayers();
  startHostNetwork();
  show('lobby');
  audio.startMusic('lobby');
}

function renderLobbyHeader() {
  const url = baseUrl() + '?pin=' + H.pin;
  $('#lobbyPin').textContent = formatPin(H.pin);
  $('#lobbyUrl').textContent = location.host + location.pathname;
  $('#lobbyTitle').textContent = H.quiz.title;
  const box = $('#qrBox');
  box.innerHTML = '';
  if (window.QRCode) {
    try {
      new QRCode(box, { text: url, width: 190, height: 190, colorDark: '#2f0f63', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } catch (e) { box.textContent = url; }
  } else {
    box.innerHTML = `<small style="word-break:break-all">${esc(url)}</small>`;
  }
  box.title = url;
}

function renderLobbyPlayers(newId) {
  const list = Object.values(H.players).sort((a, b) => a.order - b.order);
  $('#playerCount').textContent = list.length;
  $('#btnStart').disabled = list.length === 0;
  const box = $('#lobbyPlayers');
  if (list.length === 0) { box.innerHTML = '<p class="waiting-text">Esperando jugadores…</p>'; return; }
  if (newId && box.querySelector('.waiting-text') === null && H.phase === 'lobby') {
    const p = H.players[newId];
    box.appendChild(playerChip(p));
    return;
  }
  box.innerHTML = '';
  list.forEach((p) => box.appendChild(playerChip(p)));
}

function playerChip(p) {
  const d = document.createElement('div');
  d.className = 'lobby-player';
  d.title = 'Clic para expulsar';
  d.innerHTML = `<span class="lp-av" style="background:${badgeFor(p.avatar)}">${p.avatar}</span><span>${esc(p.name)}</span>`;
  d.addEventListener('click', () => {
    if (H.phase !== 'lobby' || !confirm(`¿Expulsar a ${p.name}?`)) return;
    hostSend(p.id, { type: 'kicked' });
    delete H.players[p.id];
    delete H.conns[p.id];
    renderLobbyPlayers();
  });
  return d;
}

/* ---------- Ronda de pregunta ---------- */
async function nextQuestion() {
  H.qi++;
  if (H.qi >= H.quiz.questions.length) { showPodium(); return; }
  const q = H.quiz.questions[H.qi];
  const total = H.quiz.questions.length;
  H.phase = 'countdown';
  H.answers = {};
  audio.stopMusic();
  hostBroadcast({ type: 'countdown', qi: H.qi, total });

  $('#cdLabel').textContent = `Pregunta ${H.qi + 1} de ${total}`;
  $('#cdQuestion').textContent = q.text;
  show('countdown');
  audio.whoosh();
  const num = $('#cdNumber');
  for (let n = 3; n >= 1; n--) {
    num.textContent = n;
    num.classList.remove('anim'); void num.offsetWidth; num.classList.add('anim');
    audio.countBeep(false);
    await sleep(1000);
  }
  audio.countBeep(true);
  startQuestion();
}

function startQuestion() {
  const q = H.quiz.questions[H.qi];
  H.phase = 'question';
  $('#hqText').textContent = q.text;
  const img = $('#hqImage');
  img.style.display = 'none';
  if (q.image) {
    img.onload = () => { img.style.display = ''; };
    img.onerror = () => { img.style.display = 'none'; };
    img.src = q.image;
  } else {
    img.removeAttribute('src');
  }
  $('#hqOptions').innerHTML = activeOpts(q).map((i) => { const a = ANSWERS[i];
    return `<div class="answer ${a.cls}"><span class="shape-ic">${a.shape}</span><span class="ans-text">${esc(q.options[i])}</span></div>`; }).join('');
  updateAnswerCount();
  show('hostq');

  H.qStart = Date.now();
  H.lastSec = null;
  hostBroadcast({ type: 'question', qi: H.qi, total: H.quiz.questions.length, time: q.time, opts: activeOpts(q) });
  audio.startMusic('tension');

  const ring = $('#timerRing');
  const txt = $('#timerText');
  const timerBox = document.querySelector('.timer');
  ring.classList.remove('urgent');
  timerBox.classList.remove('pulse');
  clearInterval(H.timerId);
  const tick = () => {
    const elapsed = (Date.now() - H.qStart) / 1000;
    const remaining = Math.max(0, q.time - elapsed);
    const sec = Math.ceil(remaining);
    ring.style.strokeDashoffset = String(CIRC * (1 - remaining / q.time));
    if (sec !== H.lastSec) {
      H.lastSec = sec;
      txt.textContent = sec;
      if (sec <= 5 && sec > 0) {
        ring.classList.add('urgent');
        timerBox.classList.add('pulse');
        audio.tick(true);
        if (sec <= 3) setTimeout(() => { if (H.phase === 'question') audio.tick(true); }, 500);
      }
    }
    if (remaining <= 0) closeQuestion();
  };
  tick();
  H.timerId = setInterval(tick, 100);
}

function updateAnswerCount(bump) {
  const el = $('#answerCount');
  el.textContent = Object.keys(H.answers).length;
  if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

function sortedPlayers() {
  return Object.values(H.players).sort((a, b) => b.score - a.score || a.order - b.order);
}

function closeQuestion() {
  if (H.phase !== 'question') return;
  H.phase = 'results';
  clearInterval(H.timerId);
  audio.stopMusic();
  audio.gong();
  hostBroadcast({ type: 'closed', qi: H.qi });

  const q = H.quiz.questions[H.qi];
  // Ranking previo para animar el marcador
  H.prevRanks = {};
  sortedPlayers().forEach((p, i) => { H.prevRanks[p.id] = i; });

  const counts = [0, 0, 0, 0];
  Object.values(H.players).forEach((p) => {
    const a = H.answers[p.id];
    p.lastPoints = 0;
    if (a) counts[a.choice]++;
    if (a && a.choice === q.correct) {
      p.streak++;
      const ratio = Math.min(1, a.t / 1000 / q.time);
      const base = Math.round(1000 * (1 - ratio / 2));        // 500–1000 por rapidez
      const bonus = p.streak >= 2 ? Math.min((p.streak - 1) * 100, 500) : 0;
      p.lastPoints = base + bonus;
      p.lastBonus = bonus;
      p.score += p.lastPoints;
    } else {
      p.streak = 0;
      p.lastBonus = 0;
    }
  });
  H.countsCache = counts;

  const ranked = sortedPlayers();
  ranked.forEach((p, i) => {
    const a = H.answers[p.id];
    const ahead = i > 0 ? ranked[i - 1] : null;
    hostSend(p.id, {
      type: 'result', qi: H.qi,
      answered: !!a, correct: !!a && a.choice === q.correct,
      points: p.lastPoints, bonus: p.lastBonus, streak: p.streak, score: p.score,
      rank: i + 1, total: ranked.length,
      aheadName: ahead ? ahead.name : null, aheadGap: ahead ? ahead.score - p.score : 0,
      correctText: q.options[q.correct], correctIndex: q.correct
    });
  });
  renderResults(q, counts);
}

function renderResults(q, counts) {
  $('#resText').textContent = q.text;
  const max = Math.max(1, ...counts);
  const chart = $('#barChart');
  const act = activeOpts(q);
  chart.innerHTML = act.map((i) => { const a = ANSWERS[i]; return `
    <div class="bar-col ${i === q.correct ? '' : 'dim'}">
      <div class="bar-count">${i === q.correct ? '<span class="tick">✔</span>' : ''}<span>${counts[i]}</span></div>
      <div class="bar ${a.cls}" data-h="${Math.round((counts[i] / max) * 100)}"></div>
      <div class="bar-base ${a.cls}">${a.shape}</div>
    </div>`; }).join('');
  $('#resOptions').innerHTML = act.map((i) => { const a = ANSWERS[i]; return `<div class="answer ${a.cls} ${i === q.correct ? '' : 'dim'}"><span class="shape-ic">${a.shape}</span><span class="ans-text">${esc(q.options[i])}</span>${i === q.correct ? '<span class="ans-check">✔</span>' : ''}</div>`; }).join('');
  $('#btnToBoard').textContent = 'Siguiente ▶';
  show('results');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const maxPx = Math.max(60, chart.clientHeight - 130);
    chart.querySelectorAll('.bar').forEach((b) => { b.style.height = Math.round(maxPx * b.dataset.h / 100) + 'px'; });
  }));
}

function showBoard() {
  H.phase = 'board';
  const top = sortedPlayers().slice(0, 5);
  const list = $('#boardList');
  list.innerHTML = '';
  list.style.height = Math.max(1, top.length) * ROW_H + 'px';
  const isLast = H.qi >= H.quiz.questions.length - 1;
  $('#btnNext').textContent = isLast ? '🏆 Ver podio' : 'Siguiente ▶';
  if (top.length === 0) { list.innerHTML = '<p class="waiting-text">Sin jugadores</p>'; show('board'); return; }

  top.forEach((p, i) => {
    const prev = H.prevRanks[p.id];
    const start = prev !== undefined ? Math.min(prev, 5) : 5;
    const row = document.createElement('div');
    row.className = 'board-row' + (i === 0 ? ' leader' : '');
    row.style.transform = `translateY(${start * ROW_H}px)`;
    row.style.zIndex = String(10 - i);
    const moved = prev !== undefined && prev > i ? `<span class="br-up">▲${prev - i}</span>` : '';
    row.innerHTML = `<span class="br-rank">${i + 1}</span><span class="br-av">${p.avatar}</span>
      <span class="br-name">${esc(p.name)} ${moved}</span>
      ${p.streak >= 2 ? `<span class="br-streak">🔥${p.streak}</span>` : ''}
      <span class="br-score" data-from="${p.score - p.lastPoints}" data-to="${p.score}">${p.score - p.lastPoints}</span>`;
    list.appendChild(row);
  });
  show('board');
  audio.whoosh();
  setTimeout(() => {
    list.querySelectorAll('.board-row').forEach((row, i) => { row.style.transform = `translateY(${i * ROW_H}px)`; });
    animateScores(list);
  }, 400);
}

function animateScores(root) {
  const els = root.querySelectorAll('.br-score');
  const t0 = performance.now();
  const dur = 1100;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    els.forEach((el) => {
      const from = Number(el.dataset.from); const to = Number(el.dataset.to);
      el.textContent = Math.round(from + (to - from) * e);
    });
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Podio ---------- */
async function showPodium() {
  H.phase = 'podium';
  audio.stopMusic(true);
  const ranked = sortedPlayers();
  ranked.forEach((p, i) => hostSend(p.id, { type: 'end', rank: i + 1, total: ranked.length, score: p.score }));

  $('#podiumTitle').textContent = H.quiz.title;
  [1, 2, 3].forEach((n) => {
    const el = $('#p' + n);
    const p = ranked[n - 1];
    el.classList.remove('revealed');
    el.classList.toggle('empty', !p);
    el.querySelector('.pp-avatar').textContent = p ? p.avatar : '';
    el.querySelector('.pp-name').textContent = p ? p.name : '';
    el.querySelector('.pp-score').textContent = p ? p.score + ' pts' : '';
  });
  $('.podium-buttons').classList.remove('show');
  show('podium');

  audio.drumroll(1.2);
  await sleep(1300);
  $('#p3').classList.add('revealed'); audio.pop();
  await sleep(1300);
  $('#p2').classList.add('revealed'); audio.pop();
  audio.drumroll(1.6);
  await sleep(1900);
  $('#p1').classList.add('revealed');
  audio.fanfare();
  confetti.start(7000);
  await sleep(1500);
  $('.podium-buttons').classList.add('show');
}

function replay() {
  Object.values(H.players).forEach((p) => { p.score = 0; p.streak = 0; p.lastPoints = 0; p.lastBonus = 0; });
  H.qi = -1; H.answers = {}; H.prevRanks = {};
  H.phase = 'lobby';
  confetti.stop();
  hostBroadcast({ type: 'lobby' });
  renderLobbyPlayers();
  show('lobby');
  audio.startMusic('lobby');
}

function bindHost() {
  $('#btnLobbyBack').addEventListener('click', () => {
    if (Object.keys(H.players).length && !confirm('Los jugadores conectados serán desconectados. ¿Volver al editor?')) return;
    hostBroadcast({ type: 'kicked' });
    audio.stopMusic(true);
    closeHostNetwork();
    H.phase = 'idle';
    openEditor();
  });
  $('#btnStart').addEventListener('click', () => {
    if (Object.keys(H.players).length === 0) { toast('Espera a que se una al menos un jugador'); return; }
    audio.click();
    nextQuestion();
  });
  $('#btnSkip').addEventListener('click', () => closeQuestion());
  $('#btnToBoard').addEventListener('click', () => showBoard());
  $('#btnNext').addEventListener('click', () => nextQuestion());
  $('#btnReplay').addEventListener('click', () => replay());
  $('#btnPodiumEdit').addEventListener('click', () => {
    confetti.stop();
    hostBroadcast({ type: 'kicked' });
    closeHostNetwork();
    H.phase = 'idle';
    openEditor();
  });
}

/* =========================================================
   JUGADOR
   ========================================================= */
const P = {
  pin: null, id: null, name: '', avatar: AVATARS[0],
  peer: null, conn: null, bc: null, seen: new Set(),
  joined: false, score: 0, qi: -1, answered: false, joinTimer: null, retryTimer: null
};

function initPlayerId() {
  try {
    P.id = sessionStorage.getItem('quizbattle.pid');
    if (!P.id) { P.id = genId(); sessionStorage.setItem('quizbattle.pid', P.id); }
  } catch (e) { P.id = genId(); }
}

function openNick(pin) {
  P.pin = pin;
  $('#nickPin').textContent = pin;
  try {
    const saved = JSON.parse(localStorage.getItem('quizbattle.player') || '{}');
    if (saved.name) $('#nickInput').value = saved.name;
    if (AVATARS.includes(saved.avatar)) P.avatar = saved.avatar;
  } catch (e) { /* ignorar */ }
  renderAvatars();
  show('nick');
  setTimeout(() => $('#nickInput').focus(), 300);
}

function renderAvatars() {
  const grid = $('#avatarGrid');
  grid.innerHTML = '';
  AVATARS.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'avatar-opt' + (a === P.avatar ? ' selected' : '');
    b.innerHTML = `${a}<span class="badge" style="background:${badgeFor(a)}"></span>`;
    b.addEventListener('click', () => { P.avatar = a; audio.init(); audio.click(); renderAvatars(); });
    grid.appendChild(b);
  });
}

function playerSend(msg) {
  const m = Object.assign({}, msg, { from: 'player', id: P.id });
  if (P.conn && P.conn.open) { try { P.conn.send(m); } catch (e) { /* ignorar */ } }
  if (P.bc) { try { P.bc.postMessage(m); } catch (e) { /* ignorar */ } }
}

function sendJoin() { playerSend({ type: 'join', name: P.name, avatar: P.avatar }); }

function closePlayerNetwork() {
  clearTimeout(P.joinTimer); clearInterval(P.retryTimer);
  if (P.conn) { try { P.conn.close(); } catch (e) { /* ignorar */ } }
  if (P.peer) { try { P.peer.destroy(); } catch (e) { /* ignorar */ } }
  if (P.bc) { try { P.bc.close(); } catch (e) { /* ignorar */ } }
  P.conn = null; P.peer = null; P.bc = null; P.joined = false;
}

function startPlayerNetwork() {
  closePlayerNetwork();
  P.seen = new Set();
  try {
    P.bc = new BroadcastChannel(PEER_PREFIX + P.pin);
    P.bc.onmessage = (e) => onHostMessage(e.data);
  } catch (e) { P.bc = null; }

  if (window.Peer) {
    const peer = new Peer(undefined, { debug: 0 });
    P.peer = peer;
    peer.on('open', () => connectToHost());
    peer.on('disconnected', () => { if (!peer.destroyed) { try { peer.reconnect(); } catch (e) { /* ignorar */ } } });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable' && !P.joined) {
        $('#pwaitMsg').textContent = 'Buscando la sala… verifica el PIN.';
      }
    });
  }
  sendJoin(); // vía BroadcastChannel (mismo navegador)
  // Reintentos hasta recibir bienvenida
  P.retryTimer = setInterval(() => {
    if (P.joined) { clearInterval(P.retryTimer); return; }
    if (P.peer && P.peer.open && (!P.conn || !P.conn.open)) connectToHost();
    sendJoin();
  }, 3000);
  P.joinTimer = setTimeout(() => {
    if (!P.joined) $('#pwaitMsg').textContent = 'No encontramos la sala con ese PIN. Revisa el número o pide al anfitrión que lo verifique.';
  }, 12000);
}

function connectToHost() {
  if (!P.peer || P.peer.destroyed) return;
  if (P.conn) { try { P.conn.close(); } catch (e) { /* ignorar */ } }
  const conn = P.peer.connect(PEER_PREFIX + P.pin, { reliable: true });
  P.conn = conn;
  conn.on('open', () => sendJoin());
  conn.on('data', (m) => onHostMessage(m));
  conn.on('close', () => {
    if (P.conn === conn && P.joined) {
      // Intentar reconectar en silencio
      setTimeout(() => { if (P.peer && !P.peer.destroyed && (!P.conn || !P.conn.open)) connectToHost(); }, 1500);
    }
  });
}

function onHostMessage(m) {
  if (!m || m.from !== 'host') return;
  if (m.to !== '*' && m.to !== P.id) return;
  const key = m.seq + ':' + m.type;
  if (P.seen.has(key)) return;
  P.seen.add(key);
  if (P.seen.size > 500) P.seen = new Set([...P.seen].slice(-200));

  switch (m.type) {
    case 'welcome': {
      const first = !P.joined;
      P.joined = true;
      clearTimeout(P.joinTimer);
      P.score = m.score || 0;
      if (first) {
        audio.pop();
        $('#pwaitMsg').textContent = m.phase === 'lobby' ? '¡Estás dentro! ¿Ves tu nombre en la pantalla?' : '¡Estás dentro! Entrarás en la siguiente pregunta.';
        if (navigator.vibrate) navigator.vibrate(60);
      }
      break;
    }
    case 'countdown':
      if (!P.joined) return;
      P.answered = false;
      $('#pwaitMsg').textContent = `¡Prepárate! Pregunta ${m.qi + 1} de ${m.total}`;
      show('pwait');
      break;
    case 'question':
      if (!P.joined) return;
      P.qi = m.qi; P.answered = false;
      $('#pqInfo').textContent = `${m.qi + 1} de ${m.total}`;
      $('#pqScore').textContent = `${P.score} pts`;
      renderPlayerButtons(Array.isArray(m.opts) ? m.opts : [0, 1, 2, 3]);
      show('pq');
      break;
    case 'received':
      break;
    case 'closed':
      if (!P.answered && P.joined && document.querySelector('#screen-pq.active')) {
        $('#pwaitMsg').textContent = '¡Se acabó el tiempo! ⏰';
        show('pwait');
      }
      break;
    case 'result':
      showFeedback(m);
      break;
    case 'end':
      showPlayerEnd(m);
      break;
    case 'lobby':
      P.score = 0;
      confetti.stop();
      $('#pwaitMsg').textContent = '¡Nueva partida! Espera a que el anfitrión empiece.';
      show('pwait');
      break;
    case 'kicked':
      closePlayerNetwork();
      toast('El anfitrión cerró la sala o te desconectó.');
      goHome();
      break;
    default:
      break;
  }
}

function renderPlayerButtons(opts) {
  const box = $('#pqButtons');
  box.innerHTML = '';
  box.className = 'answer-grid player n' + opts.length;
  opts.forEach((i) => {
    const a = ANSWERS[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'answer ' + a.cls;
    b.setAttribute('aria-label', a.name);
    b.innerHTML = `<span class="shape-ic">${a.shape}</span>`;
    b.addEventListener('click', () => submitAnswer(i));
    box.appendChild(b);
  });
}

function submitAnswer(choice) {
  if (P.answered) return;
  P.answered = true;
  audio.answerSent();
  if (navigator.vibrate) navigator.vibrate(40);
  playerSend({ type: 'answer', qi: P.qi, choice });
  show('pans');
}

function showFeedback(m) {
  P.score = m.score;
  const scr = $('#screen-pfb');
  scr.classList.toggle('correct', m.correct);
  scr.classList.toggle('wrong', !m.correct);
  $('#pfbTitle').textContent = m.correct ? '¡Correcto!' : (m.answered ? 'Incorrecto' : '¡Se acabó el tiempo!');
  $('#pfbIcon').textContent = m.correct ? '✔' : (m.answered ? '✖' : '⏰');
  $('#pfbStreak').textContent = m.correct && m.streak >= 2 ? `Racha de ${m.streak} 🔥${m.bonus ? ' (+' + m.bonus + ' bono)' : ''}` : '';
  $('#pfbPoints').textContent = m.correct ? `+${m.points} pts` : `Era: ${ANSWERS[m.correctIndex].shape} ${m.correctText}`;
  let rankText = `Vas en el puesto #${m.rank} de ${m.total} · ${m.score} pts`;
  if (m.rank === 1) rankText += ' · ¡Lideras! 🏆';
  else if (m.aheadName) rankText += ` · a ${m.aheadGap} pts de ${m.aheadName}`;
  $('#pfbRank').textContent = rankText;
  show('pfb');
  if (m.correct) { audio.correct(); if (navigator.vibrate) navigator.vibrate([40, 40, 40]); }
  else { audio.wrong(); if (navigator.vibrate) navigator.vibrate(200); }
}

function showPlayerEnd(m) {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  $('#pendMedal').textContent = medals[m.rank] || '🎉';
  $('#pendRank').textContent = m.rank <= 3 ? `¡Puesto #${m.rank}!` : `Puesto #${m.rank} de ${m.total}`;
  $('#pendScore').textContent = `${m.score} puntos`;
  show('pend');
  if (m.rank <= 3) {
    setTimeout(() => { audio.fanfare(); confetti.start(5000); }, 4200);
  } else {
    audio.correct();
  }
}

function goHome() {
  audio.stopMusic(true);
  confetti.stop();
  history.replaceState(null, '', baseUrl());
  show('home');
}

function bindPlayer() {
  const pinInput = $('#pinInput');
  pinInput.addEventListener('input', () => { pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6); });
  const goPin = () => {
    audio.init();
    const pin = pinInput.value.trim();
    if (!/^\d{6}$/.test(pin)) { toast('El PIN tiene 6 dígitos'); pinInput.focus(); return; }
    history.replaceState(null, '', baseUrl() + '?pin=' + pin);
    openNick(pin);
  };
  $('#btnJoinPin').addEventListener('click', goPin);
  pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') goPin(); });

  const enter = () => {
    audio.init();
    const name = $('#nickInput').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) { toast('Escribe un apodo de al menos 2 letras'); $('#nickInput').focus(); return; }
    P.name = name.slice(0, 15);
    try { localStorage.setItem('quizbattle.player', JSON.stringify({ name: P.name, avatar: P.avatar })); } catch (e) { /* ignorar */ }
    $('#pwaitAvatar').textContent = P.avatar;
    $('#pwaitAvatar').style.boxShadow = `0 0 0 6px ${badgeFor(P.avatar)}, 0 6px 0 rgba(0,0,0,.22)`;
    $('#pwaitName').textContent = P.name;
    $('#pwaitMsg').textContent = 'Conectando con la sala…';
    show('pwait');
    startPlayerNetwork();
  };
  $('#btnEnter').addEventListener('click', enter);
  $('#nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  $('#btnNickBack').addEventListener('click', () => goHome());
  $('#btnPendHome').addEventListener('click', () => { closePlayerNetwork(); goHome(); });

  window.addEventListener('beforeunload', () => {
    if (P.joined) playerSend({ type: 'leave' });
    if (H.phase !== 'idle') hostBroadcast({ type: 'kicked' });
  });
}

/* =========================================================
   CONFETI (Canvas)
   ========================================================= */
const confetti = (() => {
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  const colors = ['#E21B3C', '#1368CE', '#D89E00', '#26890C', '#ffd23f', '#ffffff', '#864CBF'];
  let parts = [];
  let raf = null;
  let endAt = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn(n) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
        w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
        vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
        color: colors[(Math.random() * colors.length) | 0],
        shape: Math.random() < 0.3 ? 'circle' : (Math.random() < 0.5 ? 'tri' : 'rect'),
        sway: Math.random() * Math.PI * 2
      });
    }
  }
  function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (now < endAt && parts.length < 320) spawn(6);
    parts.forEach((p) => {
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 1.2;
      p.y += p.vy;
      p.vy = Math.min(p.vy + 0.05, 7);
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (p.shape === 'tri') { ctx.beginPath(); ctx.moveTo(0, -p.h / 2); ctx.lineTo(p.w / 2, p.h / 2); ctx.lineTo(-p.w / 2, p.h / 2); ctx.closePath(); ctx.fill(); }
      else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot))); }
      ctx.restore();
    });
    parts = parts.filter((p) => p.y < innerHeight + 30);
    if (parts.length || now < endAt) raf = requestAnimationFrame(frame);
    else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  window.addEventListener('resize', resize);
  resize();
  return {
    start(ms = 5000) { endAt = performance.now() + ms; spawn(150); if (!raf) raf = requestAnimationFrame(frame); },
    stop() { endAt = 0; parts = []; if (raf) cancelAnimationFrame(raf); raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  };
})();

/* =========================================================
   ARRANQUE
   ========================================================= */
function updateMuteIcon() { $('#muteBtn').textContent = audio.muted ? '🔇' : '🔊'; }

document.addEventListener('DOMContentLoaded', () => {
  initPlayerId();
  bindEditor();
  bindHost();
  bindPlayer();
  bindMusic();
  loadMusicSettings();
  applyMusic();
  updateMuteIcon();

  $('#muteBtn').addEventListener('click', () => { audio.init(); audio.toggleMute(); updateMuteIcon(); });
  $('#btnHost').addEventListener('click', () => { audio.init(); audio.click(); H.phase = 'idle'; openEditor(); });

  // Desbloquear audio con el primer gesto
  const unlock = () => { audio.init(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);

  // ¿Viene con ?pin=XXXXXX en la URL?
  const pin = new URLSearchParams(location.search).get('pin');
  if (pin && /^\d{6}$/.test(pin)) openNick(pin);
  else show('home');
});
