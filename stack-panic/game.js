/* ===================================================
   STACK PANIC v2 — Rebalanced & Intuitive
   =================================================== */

const State = {
  screen: 'home',
  score: 0, height: 0, combo: 0, bestCombo: 0,
  bestScore:  parseInt(localStorage.getItem('sp_best_score')  || '0'),
  bestHeight: parseInt(localStorage.getItem('sp_best_height') || '0'),
  coins:      parseInt(localStorage.getItem('sp_coins')       || '0'),
  firstPlay:  localStorage.getItem('sp_first_play') !== 'done',
  selectedSkin:   localStorage.getItem('sp_skin')  || 'default',
  unlockedSkins:  JSON.parse(localStorage.getItem('sp_skins') || '["default"]'),
  paused: false, running: false,
};

const save = () => {
  localStorage.setItem('sp_best_score',  State.bestScore);
  localStorage.setItem('sp_best_height', State.bestHeight);
  localStorage.setItem('sp_coins',       State.coins);
  localStorage.setItem('sp_skin',        State.selectedSkin);
  localStorage.setItem('sp_skins',       JSON.stringify(State.unlockedSkins));
};

// ── Skins ────────────────────────────────────────────
const SKINS = [
  { id:'default', name:'Violet',  cost:0,   colors:['#7c3aed','#a855f7','#c084fc'], glow:'#a855f7' },
  { id:'fire',    name:'Fire',    cost:50,  colors:['#dc2626','#f97316','#fbbf24'], glow:'#f97316' },
  { id:'ice',     name:'Ice',     cost:80,  colors:['#0ea5e9','#38bdf8','#bae6fd'], glow:'#38bdf8' },
  { id:'neon',    name:'Neon',    cost:120, colors:['#10b981','#34d399','#6ee7b7'], glow:'#34d399' },
  { id:'gold',    name:'Gold',    cost:200, colors:['#f59e0b','#fbbf24','#fde68a'], glow:'#fbbf24' },
  { id:'dark',    name:'Dark',    cost:150, colors:['#374151','#6b7280','#9ca3af'], glow:'#6b7280' },
  { id:'sakura',  name:'Sakura',  cost:180, colors:['#ec4899','#f472b6','#fbcfe8'], glow:'#f472b6' },
  { id:'galaxy',  name:'Galaxy',  cost:300, colors:['#4c1d95','#7c3aed','#e879f9'], glow:'#e879f9', special:true },
  { id:'rainbow', name:'Rainbow', cost:500, colors:null, glow:'#fff', special:true },
];

const getSkin = () => SKINS.find(s => s.id === State.selectedSkin) || SKINS[0];
const getBlockColors = (skin, idx) => {
  if (skin.id === 'rainbow') {
    const h = (Date.now()/20 + idx*30) % 360;
    return [`hsl(${h},90%,55%)`,`hsl(${h+15},85%,65%)`,`hsl(${h+30},95%,70%)`];
  }
  return skin.colors;
};

// ── Difficulté — courbe douce ────────────────────────
// Vitesse démarre très lente, monte progressivement sur ~30 blocs
const getSpeed = (blockCount) => {
  const base = 3.0;
  const max  = 8.0;
  const t = Math.min(blockCount / 25, 1);
  return base + (max - base) * (t * t);
};

// ── Particule background ─────────────────────────────
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx    = bgCanvas.getContext('2d');
const bgParts  = [];
const resizeBg = () => { bgCanvas.width = innerWidth; bgCanvas.height = innerHeight; };
resizeBg(); addEventListener('resize', resizeBg);
for (let i = 0; i < 55; i++) bgParts.push({
  x: Math.random()*innerWidth, y: Math.random()*innerHeight,
  r: Math.random()*1.4+0.3, vx:(Math.random()-.5)*.18, vy:(Math.random()-.5)*.18,
  a: Math.random()*.4+.08,
});
const animBg = () => {
  bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
  for (const p of bgParts) {
    p.x+=p.vx; p.y+=p.vy;
    if (p.x<0) p.x=bgCanvas.width;  if (p.x>bgCanvas.width)  p.x=0;
    if (p.y<0) p.y=bgCanvas.height; if (p.y>bgCanvas.height) p.y=0;
    bgCtx.beginPath(); bgCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
    bgCtx.fillStyle=`rgba(168,85,247,${p.a})`; bgCtx.fill();
  }
  requestAnimationFrame(animBg);
};
animBg();

// ── Router ───────────────────────────────────────────
const screens = {};
document.querySelectorAll('.screen').forEach(el => screens[el.id.replace('screen-','')] = el);
const showScreen = (name) => {
  Object.entries(screens).forEach(([k,el]) => el.classList.toggle('active', k===name));
  State.screen = name;
};
const $ = id => document.getElementById(id);

// ── Home ─────────────────────────────────────────────
const refreshHome = () => {
  $('best-score-home').textContent  = State.bestScore.toLocaleString();
  $('best-height-home').textContent = State.bestHeight;
  $('coin-count').textContent       = State.coins;
  $('streak-banner').style.display  = 'none';
};
refreshHome();

$('btn-play').addEventListener('click', () => startGame());
$('btn-duel').addEventListener('click', () => showScreen('duel'));
$('btn-skins').addEventListener('click', () => { buildSkinsGrid(); showScreen('skins'); });
$('btn-back-skins').addEventListener('click', () => showScreen('home'));
$('btn-back-duel').addEventListener('click',  () => showScreen('home'));
$('btn-pause').addEventListener('click',      () => pauseGame());
$('btn-resume').addEventListener('click',     () => resumeGame());
$('btn-restart-pause').addEventListener('click', () => { showScreen('game'); startGame(); });
$('btn-home-pause').addEventListener('click', () => { State.running=false; showScreen('home'); });
$('btn-play-again').addEventListener('click', () => { showScreen('game'); startGame(); });
$('btn-home-go').addEventListener('click',    () => { refreshHome(); showScreen('home'); });
$('btn-drop').addEventListener('click',       () => drop());
$('btn-tuto-ok').addEventListener('click',    () => {
  $('tutorial-overlay').style.display = 'none';
  localStorage.setItem('sp_first_play','done');
  State.firstPlay = false;
});

// ── Skins ────────────────────────────────────────────
const buildSkinsGrid = () => {
  const grid = $('skins-grid');
  grid.innerHTML = '';
  $('coin-count').textContent = State.coins;
  SKINS.forEach(skin => {
    const owned    = State.unlockedSkins.includes(skin.id);
    const selected = skin.id === State.selectedSkin;
    const el = document.createElement('div');
    el.className = `skin-item ${selected?'selected':''} ${!owned&&skin.cost>0?'locked':''}`;

    const pv = document.createElement('canvas');
    pv.className='skin-preview'; pv.width=48; pv.height=24;
    drawSkinPreview(pv, skin);

    const nm = document.createElement('div');
    nm.className='skin-name'; nm.textContent=skin.name;
    el.appendChild(pv); el.appendChild(nm);

    if (!owned) {
      const co = document.createElement('div');
      co.className='skin-cost'; co.innerHTML=`<span>◆</span>${skin.cost}`;
      el.appendChild(co);
      if (skin.special) {
        const b=document.createElement('div'); b.className='skin-badge'; b.textContent='★';
        el.appendChild(b);
      }
    }
    el.addEventListener('click', () => {
      if (owned) { State.selectedSkin=skin.id; save(); buildSkinsGrid(); }
      else if (State.coins >= skin.cost) {
        State.coins -= skin.cost;
        State.unlockedSkins.push(skin.id);
        State.selectedSkin = skin.id;
        save(); buildSkinsGrid();
        spawnPopup('◆ DÉBLOQUÉ !','#fbbf24');
      }
    });
    grid.appendChild(el);
  });
};

const drawSkinPreview = (cv, skin) => {
  const c = cv.getContext('2d');
  const cols = skin.id==='rainbow' ? ['#f87171','#34d399','#60a5fa'] : skin.colors;
  const w = cv.width/3;
  cols.forEach((col,i) => {
    const g=c.createLinearGradient(i*w,0,i*w+w,24);
    g.addColorStop(0,col); g.addColorStop(1,col+'99');
    c.fillStyle=g; c.beginPath(); c.roundRect(i*w+1,1,w-2,22,4); c.fill();
  });
};

// ── Canvas & constants ───────────────────────────────
const canvas = $('game-canvas');
const ctx    = canvas.getContext('2d');

const BLOCK_H    = 32;
const BASE_W     = 220;
const MISS_TOL    = 18;  // tolérance game-over : si overlap > ce seuil, ça compte quand même
const PERFECT_TOL = 18;  // tolérance PERFECT
const NICE_TOL    = 45;  // tolérance NICE

let blocks=[], fallingBlock=null;
let cameraY=0, targetCameraY=0;
let animId=null, vfxParts=[], shakeAmt=0;
let perfectFlash=0; // timer glow vert sur la zone centrale

const resizeCanvas = () => {
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
};
resizeCanvas(); addEventListener('resize', resizeCanvas);

// ── Game start ───────────────────────────────────────
const startGame = () => {
  cancelAnimationFrame(animId);
  Object.assign(State, { score:0, height:0, combo:0, bestCombo:0, paused:false, running:true });
  blocks=[]; vfxParts=[]; cameraY=0; targetCameraY=0; shakeAmt=0; fallingBlock=null; perfectFlash=0;

  // Plateforme de base : positionnée aux 2/3 bas de l'écran
  blocks.push({ x:canvas.width/2-BASE_W/2, y:canvas.height - Math.round(canvas.height * 0.22), w:BASE_W, h:BLOCK_H, isBase:true });

  updateHUD();
  showScreen('game');

  // Tutoriel au premier lancement
  if (State.firstPlay) {
    $('tutorial-overlay').style.display = 'flex';
  }

  spawnFalling();
  loop();
};

// ── Spawner ──────────────────────────────────────────
const spawnFalling = () => {
  const top = blocks[blocks.length-1];
  // Le bloc tombe a exactement la même largeur que le dessus — pas de rétrécissement forcé
  const w   = top.w;
  const spd = getSpeed(blocks.length);
  const dir = Math.random()<.5 ? 1 : -1;
  // Démarre juste hors du bord visible (pas loin)
  fallingBlock = {
    x: dir>0 ? -w : canvas.width,
    y: top.y - BLOCK_H - 6,
    w, h: BLOCK_H,
    speed: spd * dir,
    idx: blocks.length,
    skin: getSkin(),
    landed: false,
  };
};

// ── Drop logic ───────────────────────────────────────
const drop = () => {
  if (!State.running || State.paused || !fallingBlock || fallingBlock.landed) return;
  fallingBlock.landed = true;

  const top = blocks[blocks.length-1];
  const fb  = fallingBlock;

  // Calcul overlap
  const overlapLeft  = Math.max(0, top.x + top.w - fb.x);
  const overlapRight = Math.max(0, fb.x + fb.w - (top.x + top.w));
  const overlap = fb.w - overlapLeft - overlapRight;

  // MISS = game over (avec tolérance de MISS_TOL px pour éviter les faux positifs)
  if (overlap <= -MISS_TOL) {
    shakeAmt = 16;
    spawnBreakFx(fb.x+fb.w/2, fb.y, fb.skin.colors||['#7c3aed'], 14);
    gameOver(); return;
  }

  // Si overlap est légèrement négatif mais dans la tolérance, on le traite comme 0
  const safeOverlap = Math.max(1, overlap);

  // Bloc posé : même largeur si overlap > 85% (tolérance visuelle)
  const newX = Math.max(fb.x, top.x);
  const newW = safeOverlap > fb.w * 0.85 ? fb.w : safeOverlap;
  const finalX = safeOverlap > fb.w * 0.85 ? top.x + top.w/2 - newW/2 : newX;

  const offCenter = Math.abs((finalX + newW/2) - (top.x + top.w/2));

  let points = 15 + Math.round(newW * 0.4);
  let label = null, labelColor = '#fff';

  if (offCenter <= PERFECT_TOL) {
    State.combo++; points += 20 + State.combo * 10;
    label = State.combo >= 3 ? `✦ PERFECT x${State.combo}` : '✦ PERFECT!';
    labelColor = '#fbbf24'; perfectFlash = 18;
    if (State.combo > State.bestCombo) State.bestCombo = State.combo;
  } else if (offCenter <= NICE_TOL) {
    State.combo++; points += 8 + State.combo * 4;
    label = `NICE +${State.combo}`; labelColor = '#34d399';
    if (State.combo > State.bestCombo) State.bestCombo = State.combo;
  } else {
    State.combo = 0;
  }

  State.score  += points;
  State.height++;
  shakeAmt = 3;

  blocks.push({ x:finalX, y:fb.y, w:newW, h:BLOCK_H, skin:fb.skin, idx:fb.idx, bounceOffset:10 });

  // Particules de découpe si nécessaire
  if (overlapLeft  > 4) spawnTrimFx(fb.x, fb.y, overlapLeft,  fb.skin.colors||['#7c3aed']);
  if (overlapRight > 4) spawnTrimFx(top.x+top.w-overlapRight, fb.y, overlapRight, fb.skin.colors||['#7c3aed']);

  // Caméra : montre les 10 derniers blocs
  targetCameraY = Math.max(0, (blocks.length - 9) * (BLOCK_H + 6));

  updateHUD();
  if (label) spawnPopup(label, labelColor);
  spawnFalling();
};

// ── Game over ────────────────────────────────────────
const gameOver = () => {
  State.running = false;
  const isRecord = State.score > State.bestScore || State.height > State.bestHeight;
  if (State.score  > State.bestScore)  State.bestScore  = State.score;
  if (State.height > State.bestHeight) State.bestHeight = State.height;
  const coins = Math.floor(State.score / 8);
  State.coins += coins; save();

  $('go-score').textContent  = State.score.toLocaleString();
  $('go-height').textContent = State.height;
  $('go-combo').textContent  = State.bestCombo;
  $('go-coins-earned').textContent = `+${coins}`;
  $('go-record').style.display = isRecord ? 'block' : 'none';

  if      (State.height >= 25) { $('go-emoji').textContent='🏆'; $('go-title').textContent='INCROYABLE !'; }
  else if (State.height >= 12) { $('go-emoji').textContent='⭐'; $('go-title').textContent='BIEN JOUÉ !';  }
  else                         { $('go-emoji').textContent='💥'; $('go-title').textContent='RATÉ !';      }

  setTimeout(() => showScreen('gameover'), 700);
};

const pauseGame  = () => { if (!State.running) return; State.paused=true;  showScreen('pause'); };
const resumeGame = () => { State.paused=false; showScreen('game'); };

const updateHUD = () => {
  $('hud-score').textContent  = State.score.toLocaleString();
  $('hud-height').textContent = State.height;
  $('combo-display').textContent = State.combo >= 2 ? `✦ x${State.combo} COMBO` : '';
};

// ── VFX ──────────────────────────────────────────────
const spawnTrimFx = (x,y,w,cols) => {
  for (let i=0;i<7;i++) vfxParts.push({
    x:x+Math.random()*w, y:y+Math.random()*BLOCK_H,
    vx:(Math.random()-.5)*4, vy:-(Math.random()*4+1),
    size:Math.random()*6+2, color:cols[~~(Math.random()*cols.length)], life:1,
  });
};
const spawnBreakFx = (x,y,cols,n) => {
  for (let i=0;i<n;i++) {
    const a=(Math.PI*2*i/n)+Math.random()*.5;
    vfxParts.push({
      x, y:y+BLOCK_H/2,
      vx:Math.cos(a)*(Math.random()*6+2), vy:Math.sin(a)*(Math.random()*6+2)-3,
      size:Math.random()*9+3, color:cols[~~(Math.random()*cols.length)], life:1,
    });
  }
};
const spawnPopup = (text, color) => {
  const el = document.createElement('div');
  el.className  = 'score-popup';
  el.style.color = color;
  el.style.left  = `${Math.random()*35+30}%`;
  el.style.top   = `${Math.random()*15+25}%`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
};

// ── Draw ─────────────────────────────────────────────
const drawBlock = (b, camY) => {
  const x=b.x, y=b.y-camY+(b.bounceOffset||0), w=b.w, h=b.h;
  ctx.save();
  if (b.isBase) {
    // Base visible et reconnaissable
    const g=ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,'#2a2a3e'); g.addColorStop(1,'#1a1a2e');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.fill();
    ctx.strokeStyle='rgba(168,85,247,0.6)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.stroke();
    // Label "DÉPART"
    ctx.fillStyle='rgba(168,85,247,0.5)';
    ctx.font='bold 10px Orbitron, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('DÉPART', x+w/2, y+h/2+4);
    ctx.restore(); return;
  }

  const skin=b.skin, c=getBlockColors(skin,b.idx);
  ctx.shadowColor=skin.glow; ctx.shadowBlur=18; ctx.shadowOffsetY=3;

  const gr=ctx.createLinearGradient(x,y,x+w,y+h);
  gr.addColorStop(0,c[0]); gr.addColorStop(.5,c[1]); gr.addColorStop(1,c[2]);
  ctx.fillStyle=gr;
  ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.fill();
  ctx.shadowBlur=0; ctx.shadowOffsetY=0;

  // Reflet haut
  const hl=ctx.createLinearGradient(x,y,x,y+h*.45);
  hl.addColorStop(0,'rgba(255,255,255,0.25)'); hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=hl;
  ctx.beginPath(); ctx.roundRect(x+2,y+2,w-4,h*.45,[6,6,0,0]); ctx.fill();

  ctx.strokeStyle=c[1]+'88'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.stroke();
  ctx.restore();
};

const drawFalling = (camY) => {
  if (!fallingBlock || fallingBlock.landed) return;
  const fb=fallingBlock, skin=fb.skin, c=getBlockColors(skin,fb.idx);
  const x=fb.x, y=fb.y-camY, w=fb.w, h=fb.h;

  // Zone cible : rectangle en pointillés sous le bloc tombant
  if (blocks.length > 0) {
    const top = blocks[blocks.length-1];
    const ty  = top.y - camY;
    // Zone verte si proche du centre, rouge sinon
    const centerFb  = x + w/2;
    const centerTop = top.x + top.w/2;
    const dist = Math.abs(centerFb - centerTop);
    const zoneColor = dist < PERFECT_TOL ? 'rgba(34,197,94,0.35)' :
                      dist < NICE_TOL    ? 'rgba(251,191,36,0.25)' :
                                           'rgba(239,68,68,0.2)';
    // Ombre de destination
    ctx.save();
    ctx.fillStyle=zoneColor;
    const shadowX = Math.max(fb.x, top.x);
    const shadowW = Math.max(0, Math.min(fb.x+fb.w, top.x+top.w) - shadowX);
    if (shadowW > 0) {
      ctx.beginPath(); ctx.roundRect(shadowX, ty+h+2, shadowW, 6, 3); ctx.fill();
    }
    // Ligne pointillée
    ctx.strokeStyle = `${dist < NICE_TOL ? '#22c55e' : '#ef4444'}55`;
    ctx.lineWidth=1; ctx.setLineDash([5,7]);
    ctx.beginPath(); ctx.moveTo(x+w/2, y+h); ctx.lineTo(x+w/2, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor=skin.glow; ctx.shadowBlur=22;
  const gr=ctx.createLinearGradient(x,y,x+w,y+h);
  gr.addColorStop(0,c[0]); gr.addColorStop(.5,c[1]); gr.addColorStop(1,c[2]);
  ctx.fillStyle=gr;
  ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.fill();
  ctx.shadowBlur=0;
  // Reflet
  const hl=ctx.createLinearGradient(x,y,x,y+h*.45);
  hl.addColorStop(0,'rgba(255,255,255,0.22)'); hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=hl;
  ctx.beginPath(); ctx.roundRect(x+2,y+2,w-4,h*.45,[6,6,0,0]); ctx.fill();
  ctx.restore();
};

// ── Perfect zone glow on tower top ───────────────────
const drawPerfectZone = (camY) => {
  if (blocks.length < 2) return;
  const top = blocks[blocks.length-1];
  if (top.isBase) return;
  const cx = top.x + top.w/2;
  const ty = top.y - camY;
  const halfW = PERFECT_TOL + 4;

  const alpha = perfectFlash > 0 ? 0.6 : 0.18;
  const col   = perfectFlash > 0 ? '#fbbf24' : '#22c55e';
  if (perfectFlash > 0) perfectFlash--;

  ctx.save();
  ctx.fillStyle = col.replace('#','') === col ? col : col + Math.round(alpha*255).toString(16).padStart(2,'0');
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.roundRect(cx-halfW, ty-4, halfW*2, 6, 3); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
};

// ── Main loop ─────────────────────────────────────────
const loop = () => {
  if (!State.running) return;
  animId = requestAnimationFrame(loop);
  if (State.paused) return;

  cameraY += (targetCameraY - cameraY) * 0.09;
  shakeAmt *= 0.82;
  const sx = shakeAmt>.6?(Math.random()-.5)*shakeAmt:0;
  const sy = shakeAmt>.6?(Math.random()-.5)*shakeAmt:0;

  ctx.save();
  ctx.translate(sx,sy);
  ctx.clearRect(-20,-20,canvas.width+40,canvas.height+40);

  // Fond
  const bg=ctx.createLinearGradient(0,0,0,canvas.height);
  bg.addColorStop(0,'#08080f'); bg.addColorStop(1,'#12121e');
  ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

  // Grille subtile
  const off=cameraY%64; ctx.strokeStyle='rgba(168,85,247,0.04)'; ctx.lineWidth=1;
  for (let y=-off;y<canvas.height;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  for (let x=0;x<canvas.width;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}

  // Bounce update
  for (const b of blocks) if (b.bounceOffset) { b.bounceOffset*=.68; if(Math.abs(b.bounceOffset)<.1)b.bounceOffset=0; }

  // Dessiner les blocs
  for (const b of blocks) drawBlock(b, cameraY);

  // Zone PERFECT sur le dessus de la tour
  drawPerfectZone(cameraY);

  // Bloc qui glisse
  if (fallingBlock && !fallingBlock.landed) {
    fallingBlock.x += fallingBlock.speed;
    if (fallingBlock.x > canvas.width+20)       fallingBlock.speed = -Math.abs(fallingBlock.speed);
    if (fallingBlock.x+fallingBlock.w < -20)     fallingBlock.speed =  Math.abs(fallingBlock.speed);
    drawFalling(cameraY);
  }

  // Particules
  for (let i=vfxParts.length-1;i>=0;i--) {
    const p=vfxParts[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=.18; p.life-=.03;
    if (p.life<=0){vfxParts.splice(i,1);continue;}
    ctx.save(); ctx.globalAlpha=Math.max(0,p.life);
    ctx.shadowColor=p.color; ctx.shadowBlur=8; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.roundRect(p.x-p.size/2,p.y-p.size/2-cameraY,p.size,p.size,2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
};

// ── Input ─────────────────────────────────────────────
const handleInput = () => {
  if (State.screen !== 'game' || State.paused) return;
  // Si le tuto est visible, ignorer le drop
  if ($('tutorial-overlay').style.display !== 'none') return;
  drop();
};

canvas.addEventListener('pointerdown', handleInput);
document.addEventListener('keydown', e => {
  if (e.code==='Space'||e.code==='ArrowDown') { e.preventDefault(); handleInput(); }
  if (e.code==='Escape' && State.screen==='game') pauseGame();
});

// ── Init ──────────────────────────────────────────────
showScreen('home');
