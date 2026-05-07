// ── GUN.JS CONFIG ────────────────────────────────────────────────────────────
// Relays publics gratuits, zéro compte requis
const RELAYS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://relay.peer.ooo/gun',
];

// Préfixe unique pour isoler cette app sur les relays publics
const APP_KEY = 'waitlist-app-v1';

let gun;
function getGun() {
  if (!gun) gun = Gun(RELAYS);
  return gun;
}
function db() { return getGun().get(APP_KEY); }

// ── UTILITAIRES ───────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.32, 0.64].forEach(t => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0.4, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.25);
    });
  } catch {}
}

// Gun stocke des objets plats — on sérialise les tableaux en objets indexés
function gunToArray(obj) {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([k, v]) => k !== '_' && v && typeof v === 'object')
    .map(([, v]) => v);
}

const getToken  = () => localStorage.getItem('wl_token');
const setToken  = t  => localStorage.setItem('wl_token', t);
const clearToken = () => localStorage.removeItem('wl_token');

// ════════════════════════════════════════════════════════════════════════════
//  DASHBOARD  (index.html)
// ════════════════════════════════════════════════════════════════════════════
function initDashboard() {
  let currentQueueId = null;
  let queues = [];
  let clients = [];

  const queueTabs      = document.getElementById('queueTabs');
  const queueList      = document.getElementById('queueList');
  const countBadge     = document.getElementById('countBadge');
  const queueLabel     = document.getElementById('currentQueueLabel');
  const addForm        = document.getElementById('addForm');
  const btnNewQueue    = document.getElementById('btnNewQueue');
  const modalOverlay   = document.getElementById('modalOverlay');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnCreateQueue = document.getElementById('btnCreateQueue');
  const newQueueName   = document.getElementById('newQueueName');
  const linkSelect     = document.getElementById('linkQueue');

  // Écoute les files en temps réel
  db().get('queues').map().on((data, id) => {
    if (!data) return;
    const idx = queues.findIndex(q => q.id === id);
    if (idx !== -1) queues[idx] = { ...data, id };
    else queues.push({ ...data, id });
    render();
  });

  // Écoute les clients en temps réel
  db().get('clients').map().on((data, id) => {
    if (!data) return;
    const idx = clients.findIndex(c => c.id === id);
    if (idx !== -1) clients[idx] = { ...data, id };
    else clients.push({ ...data, id });
    render();
  });

  function resolveGroup(queueId) {
    const q = queues.find(q => q.id === queueId);
    if (!q) return [queueId];
    const root = q.linkedTo || q.id;
    return queues.filter(q => q.id === root || q.linkedTo === root).map(q => q.id);
  }

  function waitingIn(queueId) {
    const ids = resolveGroup(queueId);
    return clients
      .filter(c => ids.includes(c.queueId) && c.status === 'waiting')
      .sort((a, b) => a.position - b.position);
  }

  function nextPosition(queueId) {
    const list = waitingIn(queueId);
    return list.length > 0 ? list[list.length - 1].position + 1 : 1;
  }

  function render() {
    // Tabs
    queueTabs.innerHTML = '';
    queues.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (q.id === currentQueueId ? ' active' : '');
      btn.textContent = q.name;
      btn.onclick = () => { currentQueueId = q.id; render(); };
      queueTabs.appendChild(btn);
    });
    if (!currentQueueId && queues.length > 0) { currentQueueId = queues[0].id; render(); return; }

    // Modal link select
    linkSelect.innerHTML = '<option value="">— Indépendante —</option>';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id; o.textContent = q.name;
      linkSelect.appendChild(o);
    });

    if (!currentQueueId) {
      queueList.innerHTML = '<li class="empty-state">Créez une file d\'attente</li>';
      return;
    }

    const q = queues.find(q => q.id === currentQueueId);
    queueLabel.textContent = q?.name || '';

    const list = waitingIn(currentQueueId);
    countBadge.textContent = list.length;
    queueList.innerHTML = '';

    if (list.length === 0) {
      queueList.innerHTML = '<li class="empty-state">Aucun client en attente</li>';
      return;
    }

    list.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      li.innerHTML = `
        <span class="q-pos">${i + 1}</span>
        <span class="q-name">${escHtml(c.name)}${c.service ? ' <small>'+escHtml(c.service)+'</small>' : ''}</span>
        <div class="q-actions">
          <button class="btn btn-sm btn-primary" data-id="${c.id}" data-action="call">Appeler</button>
          <button class="btn btn-sm btn-danger"  data-id="${c.id}" data-action="remove">✕</button>
        </div>`;
      queueList.appendChild(li);
    });
  }

  queueList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'remove') {
      db().get('clients').get(id).put({ status: 'done' });
    } else if (btn.dataset.action === 'call') {
      db().get('clients').get(id).put({ status: 'called' });
    }
  });

  addForm.addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('clientName').value.trim();
    const service = document.getElementById('clientService').value.trim();
    if (!name || !currentQueueId) return;
    const id    = uid();
    const token = uid();
    const client = { id, name, service, queueId: currentQueueId, position: nextPosition(currentQueueId), status: 'waiting', token };
    db().get('clients').get(id).put(client);
    addForm.reset();
  });

  btnNewQueue.onclick    = () => { modalOverlay.classList.add('open'); newQueueName.focus(); };
  btnCancelModal.onclick = () => modalOverlay.classList.remove('open');
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

  btnCreateQueue.onclick = () => {
    const name = newQueueName.value.trim();
    if (!name) return;
    const id = uid();
    db().get('queues').get(id).put({ id, name, linkedTo: linkSelect.value || '' });
    newQueueName.value = ''; linkSelect.value = '';
    modalOverlay.classList.remove('open');
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  DISPLAY / DIAPO  (display.html)
// ════════════════════════════════════════════════════════════════════════════
function initDisplay() {
  let queues = [];
  let clients = [];
  let currentQueueId = null;
  let slideIndex = 0;

  const queueSelect    = document.getElementById('displayQueueSelect');
  const displayName    = document.getElementById('displayQueueName');
  const displayCount   = document.getElementById('displayCount');
  const currentName    = document.getElementById('displayCurrentName');
  const currentService = document.getElementById('displayCurrentService');
  const track          = document.getElementById('carouselTrack');

  db().get('queues').map().on((data, id) => {
    if (!data) return;
    const idx = queues.findIndex(q => q.id === id);
    if (idx !== -1) queues[idx] = { ...data, id };
    else queues.push({ ...data, id });
    populateSelect();
    render();
  });

  db().get('clients').map().on((data, id) => {
    if (!data) return;
    const idx = clients.findIndex(c => c.id === id);
    if (idx !== -1) clients[idx] = { ...data, id };
    else clients.push({ ...data, id });
    render();
  });

  function resolveGroup(queueId) {
    const q = queues.find(q => q.id === queueId);
    if (!q) return [queueId];
    const root = q.linkedTo || q.id;
    return queues.filter(q => q.id === root || q.linkedTo === root).map(q => q.id);
  }

  function waitingIn(queueId) {
    const ids = resolveGroup(queueId);
    return clients
      .filter(c => ids.includes(c.queueId) && c.status === 'waiting')
      .sort((a, b) => a.position - b.position);
  }

  function populateSelect() {
    const val = queueSelect.value;
    queueSelect.innerHTML = '';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id; o.textContent = q.name;
      queueSelect.appendChild(o);
    });
    if (val) queueSelect.value = val;
    if (!currentQueueId && queues.length > 0) currentQueueId = queues[0].id;
    queueSelect.value = currentQueueId || '';
  }

  function render() {
    const q = queues.find(q => q.id === currentQueueId);
    displayName.textContent = q?.name || 'File d\'attente';

    const list = currentQueueId ? waitingIn(currentQueueId) : [];
    displayCount.textContent = list.length;

    if (list.length === 0) {
      currentName.textContent = '—'; currentService.textContent = '';
      track.innerHTML = '<div class="carousel-empty">Aucun client en attente</div>';
      return;
    }
    if (slideIndex >= list.length) slideIndex = 0;
    const main = list[slideIndex];
    currentName.textContent    = main.name;
    currentService.textContent = main.service || '';

    track.innerHTML = '';
    list.filter((_, i) => i !== slideIndex).slice(0, 6).forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'carousel-item';
      div.style.animationDelay = (i * 0.08) + 's';
      div.innerHTML = `<span class="ci-pos">${list.indexOf(c) + 1}</span><span class="ci-n">${escHtml(c.name)}</span>`;
      track.appendChild(div);
    });
  }

  setInterval(() => {
    const list = currentQueueId ? (() => {
      const ids = resolveGroup2(queues, currentQueueId);
      return clients.filter(c => ids.includes(c.queueId) && c.status === 'waiting').sort((a,b) => a.position - b.position);
    })() : [];
    if (list.length > 1) { slideIndex = (slideIndex + 1) % list.length; render(); }
  }, 3000);

  function resolveGroup2(queues, queueId) {
    const q = queues.find(q => q.id === queueId);
    if (!q) return [queueId];
    const root = q.linkedTo || q.id;
    return queues.filter(q => q.id === root || q.linkedTo === root).map(q => q.id);
  }

  queueSelect.addEventListener('change', () => { currentQueueId = queueSelect.value; slideIndex = 0; render(); });
}

// ════════════════════════════════════════════════════════════════════════════
//  CLIENT  (client.html)
// ════════════════════════════════════════════════════════════════════════════
function initClient() {
  let queues = [];
  let clients = [];
  let prevStatus = null;

  const viewJoin     = document.getElementById('viewJoin');
  const viewWaiting  = document.getElementById('viewWaiting');
  const viewYourTurn = document.getElementById('viewYourTurn');
  const joinForm     = document.getElementById('joinForm');
  const joinQueue    = document.getElementById('joinQueue');
  const elPos        = document.getElementById('clientPosition');
  const elName       = document.getElementById('clientNameDisplay');
  const elQueue      = document.getElementById('clientQueueDisplay');
  const elBefore     = document.getElementById('clientBefore');
  const btnNotif     = document.getElementById('btnEnableNotif');
  const notifHint    = document.getElementById('notifHint');
  const btnLeave     = document.getElementById('btnLeaveQueue');
  const btnDone      = document.getElementById('btnDone');

  db().get('queues').map().on((data, id) => {
    if (!data) return;
    const idx = queues.findIndex(q => q.id === id);
    if (idx !== -1) queues[idx] = { ...data, id };
    else queues.push({ ...data, id });
    populateQueues();
  });

  db().get('clients').map().on((data, id) => {
    if (!data) return;
    const idx = clients.findIndex(c => c.id === id);
    if (idx !== -1) clients[idx] = { ...data, id };
    else clients.push({ ...data, id });
    const mine = getMyClient();
    if (mine) {
      if (mine.status === 'called' && prevStatus !== 'called') { prevStatus = 'called'; showTurn(); }
      else if (mine.status === 'waiting') updateWaiting();
    }
  });

  function populateQueues() {
    joinQueue.innerHTML = '';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id; o.textContent = q.name;
      joinQueue.appendChild(o);
    });
  }

  function getMyClient() {
    const token = getToken();
    if (!token) return null;
    return clients.find(c => c.token === token) || null;
  }

  function resolveGroup(queueId) {
    const q = queues.find(q => q.id === queueId);
    if (!q) return [queueId];
    const root = q.linkedTo || q.id;
    return queues.filter(q => q.id === root || q.linkedTo === root).map(q => q.id);
  }

  function showJoin()   { viewJoin.classList.remove('hidden'); viewWaiting.classList.add('hidden'); viewYourTurn.classList.add('hidden'); }
  function showTurn()   {
    viewJoin.classList.add('hidden'); viewWaiting.classList.add('hidden'); viewYourTurn.classList.remove('hidden');
    beep();
    if (Notification.permission === 'granted')
      new Notification('WaitList', { body: "C'est votre tour ! Présentez-vous.", icon: 'icons/icon-192.png' });
  }

  function updateWaiting() {
    const c = getMyClient();
    if (!c) { clearToken(); showJoin(); return; }
    viewJoin.classList.add('hidden'); viewWaiting.classList.remove('hidden'); viewYourTurn.classList.add('hidden');

    const ids  = resolveGroup(c.queueId);
    const all  = clients.filter(cl => ids.includes(cl.queueId) && cl.status === 'waiting').sort((a,b) => a.position - b.position);
    const pos  = all.findIndex(cl => cl.id === c.id) + 1;
    elPos.textContent    = pos || '—';
    elName.textContent   = c.name;
    elQueue.textContent  = queues.find(q => q.id === c.queueId)?.name || '—';
    elBefore.textContent = Math.max(0, pos - 1);
  }

  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('joinName').value.trim();
    const queueId = joinQueue.value;
    if (!name || !queueId) return;
    const ids     = resolveGroup(queueId);
    const waiting = clients.filter(c => ids.includes(c.queueId) && c.status === 'waiting').sort((a,b) => a.position - b.position);
    const pos     = waiting.length > 0 ? waiting[waiting.length - 1].position + 1 : 1;
    const id      = uid();
    const token   = uid();
    const client  = { id, name, service: '', queueId, position: pos, status: 'waiting', token };
    db().get('clients').get(id).put(client);
    setToken(token);
    prevStatus = 'waiting';
    updateWaiting();
  });

  btnLeave.addEventListener('click', () => {
    const c = getMyClient();
    if (c) db().get('clients').get(c.id).put({ status: 'done' });
    clearToken(); showJoin();
  });

  btnDone.addEventListener('click', () => {
    const c = getMyClient();
    if (c) db().get('clients').get(c.id).put({ status: 'done' });
    clearToken(); showJoin();
  });

  btnNotif.addEventListener('click', async () => {
    const p = await Notification.requestPermission();
    if (p === 'granted') { notifHint.textContent = '✅ Notifications activées !'; btnNotif.style.display = 'none'; }
  });

  if (Notification.permission === 'granted') { notifHint.textContent = '✅ Notifications activées !'; btnNotif.style.display = 'none'; }

  // Restore session
  const mine = getMyClient();
  if (mine) { prevStatus = mine.status; if (mine.status === 'called') showTurn(); else updateWaiting(); }
  else showJoin();
}
