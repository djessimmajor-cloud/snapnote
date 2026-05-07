// ── CONFIG SUPABASE ─────────────────────────────────────────────────────────
// Remplace ces valeurs par les tiennes sur https://supabase.com
const SUPABASE_URL = 'https://VOTRE_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── SQL à exécuter UNE FOIS dans Supabase SQL Editor ────────────────────────
/*
create table queues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  linked_to uuid references queues(id) on delete set null,
  created_at timestamptz default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service text,
  queue_id uuid references queues(id) on delete cascade,
  position integer not null,
  status text default 'waiting',  -- waiting | called | done
  token text unique default gen_random_uuid()::text,
  created_at timestamptz default now()
);

alter table queues enable row level security;
alter table clients enable row level security;
create policy "public read queues" on queues for select using (true);
create policy "public write queues" on queues for all using (true);
create policy "public read clients" on clients for select using (true);
create policy "public write clients" on clients for all using (true);
*/

// ── UTILITAIRES ─────────────────────────────────────────────────────────────
function getResolvedQueueIds(queues, queueId) {
  const queue = queues.find(q => q.id === queueId);
  if (!queue) return [queueId];
  const root = queue.linked_to || queue.id;
  return queues.filter(q => q.id === root || q.linked_to === root).map(q => q.id);
}

function beep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  [0, 0.3, 0.6].forEach(t => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + 0.2);
  });
}

function getClientToken() {
  return localStorage.getItem('wl_token');
}

function setClientToken(token) {
  localStorage.setItem('wl_token', token);
}

function clearClientToken() {
  localStorage.removeItem('wl_token');
}

// ── DASHBOARD (index.html) ───────────────────────────────────────────────────
async function initDashboard() {
  let queues = [];
  let currentQueueId = null;
  let subscription = null;

  const queueTabs = document.getElementById('queueTabs');
  const queueList = document.getElementById('queueList');
  const countBadge = document.getElementById('countBadge');
  const currentQueueLabel = document.getElementById('currentQueueLabel');
  const addForm = document.getElementById('addForm');
  const btnNewQueue = document.getElementById('btnNewQueue');
  const modalOverlay = document.getElementById('modalOverlay');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnCreateQueue = document.getElementById('btnCreateQueue');
  const newQueueName = document.getElementById('newQueueName');
  const linkQueueSelect = document.getElementById('linkQueue');

  async function loadQueues() {
    const { data } = await db.from('queues').select('*').order('created_at');
    queues = data || [];
    renderTabs();
    populateLinkSelect();
    if (!currentQueueId && queues.length > 0) selectQueue(queues[0].id);
  }

  function renderTabs() {
    queueTabs.innerHTML = '';
    queues.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (q.id === currentQueueId ? ' active' : '');
      btn.textContent = q.name;
      btn.onclick = () => selectQueue(q.id);
      queueTabs.appendChild(btn);
    });
  }

  function populateLinkSelect() {
    linkQueueSelect.innerHTML = '<option value="">— Indépendante —</option>';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id;
      o.textContent = q.name;
      linkQueueSelect.appendChild(o);
    });
  }

  async function selectQueue(id) {
    currentQueueId = id;
    renderTabs();
    const q = queues.find(q => q.id === id);
    currentQueueLabel.textContent = q ? q.name : '';
    if (subscription) subscription.unsubscribe();
    await loadClients();
    subscription = db.channel('clients-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, loadClients)
      .subscribe();
  }

  async function loadClients() {
    if (!currentQueueId) return;
    const ids = getResolvedQueueIds(queues, currentQueueId);
    const { data } = await db.from('clients')
      .select('*')
      .in('queue_id', ids)
      .eq('status', 'waiting')
      .order('position');
    renderClients(data || []);
  }

  function renderClients(clients) {
    countBadge.textContent = clients.length;
    queueList.innerHTML = '';
    if (clients.length === 0) {
      queueList.innerHTML = '<li class="empty-state">Aucun client en attente</li>';
      return;
    }
    clients.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      li.innerHTML = `
        <span class="q-pos">${i + 1}</span>
        <span class="q-name">${c.name}${c.service ? ' <small>'+c.service+'</small>' : ''}</span>
        <div class="q-actions">
          <button class="btn btn-sm btn-primary" data-id="${c.id}" data-action="call">Appeler</button>
          <button class="btn btn-sm btn-danger" data-id="${c.id}" data-action="remove">✕</button>
        </div>`;
      queueList.appendChild(li);
    });
  }

  queueList.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'remove') {
      await db.from('clients').delete().eq('id', id);
    } else if (btn.dataset.action === 'call') {
      await db.from('clients').update({ status: 'called' }).eq('id', id);
    }
    await loadClients();
  });

  addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('clientName').value.trim();
    const service = document.getElementById('clientService').value.trim();
    if (!name || !currentQueueId) return;
    const ids = getResolvedQueueIds(queues, currentQueueId);
    const { data: existing } = await db.from('clients')
      .select('position')
      .in('queue_id', ids)
      .eq('status', 'waiting')
      .order('position', { ascending: false })
      .limit(1);
    const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 1;
    await db.from('clients').insert({ name, service, queue_id: currentQueueId, position: nextPos });
    addForm.reset();
    await loadClients();
  });

  btnNewQueue.onclick = () => { modalOverlay.classList.add('open'); newQueueName.focus(); };
  btnCancelModal.onclick = () => modalOverlay.classList.remove('open');
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

  btnCreateQueue.onclick = async () => {
    const name = newQueueName.value.trim();
    if (!name) return;
    const linked_to = linkQueueSelect.value || null;
    await db.from('queues').insert({ name, linked_to });
    newQueueName.value = '';
    linkQueueSelect.value = '';
    modalOverlay.classList.remove('open');
    await loadQueues();
  };

  await loadQueues();
}

// ── DISPLAY / DIAPO (display.html) ──────────────────────────────────────────
async function initDisplay() {
  let queues = [];
  let clients = [];
  let currentIndex = 0;
  let carouselInterval = null;
  let currentQueueId = null;

  const displayQueueSelect = document.getElementById('displayQueueSelect');
  const displayQueueName = document.getElementById('displayQueueName');
  const displayCount = document.getElementById('displayCount');
  const displayCurrentName = document.getElementById('displayCurrentName');
  const displayCurrentService = document.getElementById('displayCurrentService');
  const carouselTrack = document.getElementById('carouselTrack');

  async function loadQueues() {
    const { data } = await db.from('queues').select('*').order('created_at');
    queues = data || [];
    displayQueueSelect.innerHTML = '';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id;
      o.textContent = q.name;
      displayQueueSelect.appendChild(o);
    });
    if (queues.length > 0) selectQueue(queues[0].id);
  }

  async function selectQueue(id) {
    currentQueueId = id;
    const q = queues.find(q => q.id === id);
    displayQueueName.textContent = q ? q.name : '';
    displayQueueSelect.value = id;
    await loadClients();
    db.channel('display-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, loadClients)
      .subscribe();
  }

  async function loadClients() {
    if (!currentQueueId) return;
    const ids = getResolvedQueueIds(queues, currentQueueId);
    const { data } = await db.from('clients')
      .select('*')
      .in('queue_id', ids)
      .eq('status', 'waiting')
      .order('position');
    clients = data || [];
    displayCount.textContent = clients.length;
    startCarousel();
  }

  function startCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
    renderCarousel();
    carouselInterval = setInterval(() => {
      if (clients.length === 0) return;
      currentIndex = (currentIndex + 1) % clients.length;
      renderCarousel();
    }, 3000);
  }

  function renderCarousel() {
    if (clients.length === 0) {
      displayCurrentName.textContent = '—';
      displayCurrentService.textContent = '';
      carouselTrack.innerHTML = '<div class="carousel-empty">Aucun client en attente</div>';
      return;
    }
    const main = clients[currentIndex] || clients[0];
    displayCurrentName.textContent = main.name;
    displayCurrentService.textContent = main.service || '';

    carouselTrack.innerHTML = '';
    const next = clients.filter((_, i) => i !== currentIndex).slice(0, 6);
    next.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'carousel-item';
      div.style.animationDelay = (i * 0.1) + 's';
      div.innerHTML = `<span class="ci-pos">${clients.indexOf(c) + 1}</span><span class="ci-n">${c.name}</span>`;
      carouselTrack.appendChild(div);
    });
  }

  displayQueueSelect.addEventListener('change', () => selectQueue(displayQueueSelect.value));
  await loadQueues();
}

// ── CLIENT (client.html) ─────────────────────────────────────────────────────
async function initClient() {
  let queues = [];
  let myClient = null;
  let subscription = null;

  const viewJoin = document.getElementById('viewJoin');
  const viewWaiting = document.getElementById('viewWaiting');
  const viewYourTurn = document.getElementById('viewYourTurn');
  const joinForm = document.getElementById('joinForm');
  const joinQueueSelect = document.getElementById('joinQueue');
  const clientPosition = document.getElementById('clientPosition');
  const clientNameDisplay = document.getElementById('clientNameDisplay');
  const clientQueueDisplay = document.getElementById('clientQueueDisplay');
  const clientBefore = document.getElementById('clientBefore');
  const btnEnableNotif = document.getElementById('btnEnableNotif');
  const notifHint = document.getElementById('notifHint');
  const btnLeaveQueue = document.getElementById('btnLeaveQueue');
  const btnDone = document.getElementById('btnDone');

  async function loadQueues() {
    const { data } = await db.from('queues').select('*').order('created_at');
    queues = data || [];
    joinQueueSelect.innerHTML = '';
    queues.forEach(q => {
      const o = document.createElement('option');
      o.value = q.id;
      o.textContent = q.name;
      joinQueueSelect.appendChild(o);
    });
  }

  async function restoreSession() {
    const token = getClientToken();
    if (!token) return;
    const { data } = await db.from('clients').select('*').eq('token', token).single();
    if (data && (data.status === 'waiting' || data.status === 'called')) {
      myClient = data;
      if (data.status === 'called') showYourTurn();
      else await showWaiting();
    } else {
      clearClientToken();
    }
  }

  function showJoin() {
    viewJoin.classList.remove('hidden');
    viewWaiting.classList.add('hidden');
    viewYourTurn.classList.add('hidden');
  }

  async function showWaiting() {
    viewJoin.classList.add('hidden');
    viewWaiting.classList.remove('hidden');
    viewYourTurn.classList.add('hidden');
    await updatePosition();
    subscribeToUpdates();
  }

  function showYourTurn() {
    viewJoin.classList.add('hidden');
    viewWaiting.classList.add('hidden');
    viewYourTurn.classList.remove('hidden');
    beep();
    if (Notification.permission === 'granted') {
      new Notification('WaitList', { body: "C'est votre tour ! Présentez-vous à l'accueil.", icon: 'icons/icon-192.png' });
    }
  }

  async function updatePosition() {
    if (!myClient) return;
    const { data: me } = await db.from('clients').select('*').eq('id', myClient.id).single();
    if (!me) { clearClientToken(); showJoin(); return; }
    myClient = me;
    if (me.status === 'called') { showYourTurn(); return; }
    if (me.status === 'done') { clearClientToken(); showJoin(); return; }

    const ids = getResolvedQueueIds(queues, me.queue_id);
    const { data: ahead } = await db.from('clients')
      .select('id')
      .in('queue_id', ids)
      .eq('status', 'waiting')
      .lt('position', me.position);
    const pos = (ahead?.length || 0) + 1;

    clientPosition.textContent = pos;
    clientNameDisplay.textContent = me.name;
    const q = queues.find(q => q.id === me.queue_id);
    clientQueueDisplay.textContent = q ? q.name : '—';
    clientBefore.textContent = ahead?.length || 0;
  }

  function subscribeToUpdates() {
    if (subscription) subscription.unsubscribe();
    if (!myClient) return;
    subscription = db.channel('client-me-' + myClient.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients', filter: `id=eq.${myClient.id}` }, async payload => {
        myClient = payload.new;
        if (payload.new.status === 'called') showYourTurn();
        else await updatePosition();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, updatePosition)
      .subscribe();
  }

  joinForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('joinName').value.trim();
    const queueId = joinQueueSelect.value;
    if (!name || !queueId) return;
    const ids = getResolvedQueueIds(queues, queueId);
    const { data: existing } = await db.from('clients')
      .select('position')
      .in('queue_id', ids)
      .eq('status', 'waiting')
      .order('position', { ascending: false })
      .limit(1);
    const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 1;
    const token = crypto.randomUUID();
    const { data } = await db.from('clients').insert({ name, queue_id: queueId, position: nextPos, token }).select().single();
    myClient = data;
    setClientToken(token);
    await showWaiting();
  });

  btnEnableNotif.addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      notifHint.textContent = '✅ Notifications activées !';
      btnEnableNotif.style.display = 'none';
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'SUBSCRIBE' });
      }
    }
  });

  btnLeaveQueue.addEventListener('click', async () => {
    if (!myClient) return;
    await db.from('clients').delete().eq('id', myClient.id);
    clearClientToken();
    myClient = null;
    showJoin();
  });

  btnDone.addEventListener('click', async () => {
    if (!myClient) return;
    await db.from('clients').update({ status: 'done' }).eq('id', myClient.id);
    clearClientToken();
    myClient = null;
    showJoin();
  });

  if (Notification.permission === 'granted') {
    notifHint.textContent = '✅ Notifications activées !';
    btnEnableNotif.style.display = 'none';
  }

  await loadQueues();
  await restoreSession();
  if (!myClient) showJoin();
}
