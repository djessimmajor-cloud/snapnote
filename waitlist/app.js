// ── STOCKAGE & SYNC ─────────────────────────────────────────────────────────
// Toutes les données vivent dans localStorage.
// BroadcastChannel synchronise les onglets/fenêtres ouverts sur le même origin.

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('waitlist') : null;

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  bc?.postMessage({ key, value });
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function onSync(cb) {
  bc?.addEventListener('message', e => cb(e.data.key, e.data.value));
  window.addEventListener('storage', e => {
    try { cb(e.key, JSON.parse(e.newValue)); } catch {}
  });
}

// ── QUEUES ───────────────────────────────────────────────────────────────────
function getQueues()         { return load('wl_queues', []); }
function saveQueues(queues)  { save('wl_queues', queues); }

function getClients()        { return load('wl_clients', []); }
function saveClients(c)      { save('wl_clients', c); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// Retourne tous les ids de files liées (même groupe)
function resolveGroup(queues, queueId) {
  const q = queues.find(q => q.id === queueId);
  if (!q) return [queueId];
  const root = q.linkedTo || q.id;
  return queues.filter(q => q.id === root || q.linkedTo === root).map(q => q.id);
}

// Clients en attente d'un groupe de files, triés par position
function waitingClients(queues, queueId) {
  const ids = resolveGroup(queues, queueId);
  return getClients()
    .filter(c => ids.includes(c.queueId) && c.status === 'waiting')
    .sort((a, b) => a.position - b.position);
}

function nextPosition(queues, queueId) {
  const list = waitingClients(queues, queueId);
  return list.length > 0 ? list[list.length - 1].position + 1 : 1;
}

// ── BIP ──────────────────────────────────────────────────────────────────────
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

// ── TOKEN CLIENT ─────────────────────────────────────────────────────────────
const getToken  = () => localStorage.getItem('wl_my_token');
const setToken  = t  => localStorage.setItem('wl_my_token', t);
const clearToken = () => localStorage.removeItem('wl_my_token');

// ════════════════════════════════════════════════════════════════════════════
//  DASHBOARD  (index.html)
// ════════════════════════════════════════════════════════════════════════════
function initDashboard() {
  let currentQueueId = null;

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

  function render() {
    const queues = getQueues();
    // Tabs
    queueTabs.innerHTML = '';
    queues.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (q.id === currentQueueId ? ' active' : '');
      btn.textContent = q.name;
      btn.onclick = () => { currentQueueId = q.id; render(); };
      queueTabs.appendChild(btn);
    });
    // Auto-select first
    if (!currentQueueId && queues.length > 0) { currentQueueId = queues[0].id; render(); return; }

    // Link select in modal
    linkSelect.innerHTML = '<option value="">— Indépendante —</option>';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id; o.textContent = q.name;
      linkSelect.appendChild(o);
    });

    if (!currentQueueId) { queueList.innerHTML = '<li class="empty-state">Créez une file d\'attente</li>'; return; }
    const q = queues.find(q => q.id === currentQueueId);
    queueLabel.textContent = q?.name || '';

    const clients = waitingClients(queues, currentQueueId);
    countBadge.textContent = clients.length;
    queueList.innerHTML = '';
    if (clients.length === 0) {
      queueList.innerHTML = '<li class="empty-state">Aucun client en attente</li>'; return;
    }
    clients.forEach((c, i) => {
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
    const clients = getClients();
    if (btn.dataset.action === 'remove') {
      saveClients(clients.filter(c => c.id !== btn.dataset.id));
    } else if (btn.dataset.action === 'call') {
      const idx = clients.findIndex(c => c.id === btn.dataset.id);
      if (idx !== -1) { clients[idx].status = 'called'; saveClients(clients); }
    }
    render();
  });

  addForm.addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('clientName').value.trim();
    const service = document.getElementById('clientService').value.trim();
    if (!name || !currentQueueId) return;
    const queues = getQueues();
    const client = { id: uid(), name, service, queueId: currentQueueId, position: nextPosition(queues, currentQueueId), status: 'waiting', token: uid() };
    saveClients([...getClients(), client]);
    addForm.reset();
    render();
  });

  btnNewQueue.onclick    = () => { modalOverlay.classList.add('open'); newQueueName.focus(); };
  btnCancelModal.onclick = () => modalOverlay.classList.remove('open');
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

  btnCreateQueue.onclick = () => {
    const name = newQueueName.value.trim();
    if (!name) return;
    const queues = getQueues();
    queues.push({ id: uid(), name, linkedTo: linkSelect.value || null });
    saveQueues(queues);
    newQueueName.value = ''; linkSelect.value = '';
    modalOverlay.classList.remove('open');
    render();
  };

  onSync(() => render());
  render();
}

// ════════════════════════════════════════════════════════════════════════════
//  DISPLAY / DIAPO  (display.html)
// ════════════════════════════════════════════════════════════════════════════
function initDisplay() {
  let currentQueueId = null;
  let slideIndex = 0;
  let timer = null;

  const queueSelect    = document.getElementById('displayQueueSelect');
  const displayName    = document.getElementById('displayQueueName');
  const displayCount   = document.getElementById('displayCount');
  const currentName    = document.getElementById('displayCurrentName');
  const currentService = document.getElementById('displayCurrentService');
  const track          = document.getElementById('carouselTrack');

  function populateSelect() {
    const queues = getQueues();
    queueSelect.innerHTML = '';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id; o.textContent = q.name;
      queueSelect.appendChild(o);
    });
    if (!currentQueueId && queues.length > 0) currentQueueId = queues[0].id;
    queueSelect.value = currentQueueId || '';
  }

  function render() {
    populateSelect();
    const queues = getQueues();
    const q = queues.find(q => q.id === currentQueueId);
    displayName.textContent = q?.name || 'File d\'attente';

    const clients = currentQueueId ? waitingClients(queues, currentQueueId) : [];
    displayCount.textContent = clients.length;

    if (clients.length === 0) {
      currentName.textContent = '—'; currentService.textContent = '';
      track.innerHTML = '<div class="carousel-empty">Aucun client en attente</div>';
      return;
    }
    if (slideIndex >= clients.length) slideIndex = 0;
    const main = clients[slideIndex];
    currentName.textContent = main.name;
    currentService.textContent = main.service || '';

    track.innerHTML = '';
    clients.filter((_, i) => i !== slideIndex).slice(0, 6).forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'carousel-item';
      div.style.animationDelay = (i * 0.08) + 's';
      div.innerHTML = `<span class="ci-pos">${clients.indexOf(c) + 1}</span><span class="ci-n">${escHtml(c.name)}</span>`;
      track.appendChild(div);
    });
  }

  function startCarousel() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const queues = getQueues();
      const clients = currentQueueId ? waitingClients(queues, currentQueueId) : [];
      if (clients.length > 1) { slideIndex = (slideIndex + 1) % clients.length; render(); }
    }, 3000);
  }

  queueSelect.addEventListener('change', () => { currentQueueId = queueSelect.value; slideIndex = 0; render(); });
  onSync(() => render());
  render();
  startCarousel();
}

// ════════════════════════════════════════════════════════════════════════════
//  CLIENT  (client.html)
// ════════════════════════════════════════════════════════════════════════════
function initClient() {
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

  function populateQueues() {
    joinQueue.innerHTML = '';
    getQueues().forEach(q => {
      const o = document.createElement('option');
      o.value = q.id; o.textContent = q.name;
      joinQueue.appendChild(o);
    });
  }

  function getMyClient() {
    const token = getToken();
    if (!token) return null;
    return getClients().find(c => c.token === token) || null;
  }

  function showJoin()    { viewJoin.classList.remove('hidden'); viewWaiting.classList.add('hidden'); viewYourTurn.classList.add('hidden'); }
  function showWaiting() { viewJoin.classList.add('hidden'); viewWaiting.classList.remove('hidden'); viewYourTurn.classList.add('hidden'); updateWaiting(); }
  function showTurn()    {
    viewJoin.classList.add('hidden'); viewWaiting.classList.add('hidden'); viewYourTurn.classList.remove('hidden');
    beep();
    if (Notification.permission === 'granted')
      new Notification('WaitList', { body: "C'est votre tour ! Présentez-vous.", icon: 'icons/icon-192.png' });
  }

  function updateWaiting() {
    const c = getMyClient();
    if (!c) { clearToken(); showJoin(); return; }
    if (c.status === 'called') { showTurn(); return; }
    if (c.status === 'done')   { clearToken(); showJoin(); return; }

    const queues  = getQueues();
    const ids     = resolveGroup(queues, c.queueId);
    const all     = getClients().filter(cl => ids.includes(cl.queueId) && cl.status === 'waiting').sort((a,b) => a.position - b.position);
    const pos     = all.findIndex(cl => cl.id === c.id) + 1;
    elPos.textContent    = pos || '—';
    elName.textContent   = c.name;
    elQueue.textContent  = queues.find(q => q.id === c.queueId)?.name || '—';
    elBefore.textContent = Math.max(0, pos - 1);
  }

  function restore() {
    const c = getMyClient();
    if (!c) { showJoin(); return; }
    if (c.status === 'called') showTurn();
    else showWaiting();
  }

  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('joinName').value.trim();
    const queueId = joinQueue.value;
    if (!name || !queueId) return;
    const queues = getQueues();
    const token  = uid();
    const client = { id: uid(), name, service: '', queueId, position: nextPosition(queues, queueId), status: 'waiting', token };
    saveClients([...getClients(), client]);
    setToken(token);
    showWaiting();
  });

  btnLeave.addEventListener('click', () => {
    const c = getMyClient();
    if (c) saveClients(getClients().filter(cl => cl.id !== c.id));
    clearToken(); showJoin();
  });

  btnDone.addEventListener('click', () => {
    const c = getMyClient();
    if (c) {
      const clients = getClients();
      const idx = clients.findIndex(cl => cl.id === c.id);
      if (idx !== -1) { clients[idx].status = 'done'; saveClients(clients); }
    }
    clearToken(); showJoin();
  });

  btnNotif.addEventListener('click', async () => {
    const p = await Notification.requestPermission();
    if (p === 'granted') { notifHint.textContent = '✅ Notifications activées !'; btnNotif.style.display = 'none'; }
  });

  if (Notification.permission === 'granted') { notifHint.textContent = '✅ Notifications activées !'; btnNotif.style.display = 'none'; }

  onSync(() => {
    const c = getMyClient();
    if (!c) return;
    if (c.status === 'called' && !viewYourTurn.classList.contains('hidden') === false) showTurn();
    else updateWaiting();
  });

  populateQueues();
  restore();
}

// ── HELPER ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
