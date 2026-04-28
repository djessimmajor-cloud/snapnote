/* ===================================================
   STACK PANIC — Game Engine
   =================================================== */

const State = {
  screen: 'home',
  score: 0, height: 0, combo: 0, bestCombo: 0,
  bestScore: parseInt(localStorage.getItem('sp_best_score') || '0'),
  bestHeight: parseInt(localStorage.getItem('sp_best_height') || '0'),
  coins: parseInt(localStorage.getItem('sp_coins') || '0'),
  streak: parseInt(localStorage.getItem('sp_streak') || '0'),
  selectedSkin: localStorage.getItem('sp_skin') || 'default',
  unlockedSkins: JSON.parse(localStorage.getItem('sp_skins') || '["default"]'),
  paused: false, running: false,
};

const save = () => {
  localStorage.setItem('sp_best_score', State.bestScore);
  localStorage.setItem('sp_best_height', State.bestHeight);
  localStorage.setItem('sp_coins', State.coins);
  localStorage.setItem('sp_streak', State.streak);
  localStorage.setItem('sp_skin', State.selectedSkin);
  localStorage.setItem('sp_skins', JSON.stringify(State.unlockedSkins));
};

const SKINS = [
  { id: 'default', name: 'Violet', cost: 0,   colors: ['#7c3aed','#a855f7','#c084fc'], glow: '#a855f7' },
  { id: 'fire',    name: 'Fire',   cost: 50,  colors: ['#dc2626','#f97316','#fbbf24'], glow: '#f97316' },
  { id: 'ice',     name: 'Ice',    cost: 80,  colors: ['#0ea5e9','#38bdf8','#bae6fd'], glow: '#38bdf8' },
  { id: 'neon',    name: 'Neon',   cost: 120, colors: ['#10b981','#34d399','#6ee7b7'], glow: '#34d399' },
  { id: 'gold',    name: 'Gold',   cost: 200, colors: ['#f59e0b','#fbbf24','#fde68a'], glow: '#fbbf24' },
  { id: 'dark',    name: 'Dark',   cost: 150, colors: ['#374151','#6b7280','#9ca3af'], glow: '#6b7280' },
  { id: 'sakura',  name: 'Sakura', cost: 180, colors: ['#ec4899','#f472b6','#fbcfe8'], glow: '#f472b6' },
  { id: 'galaxy',  name: 'Galaxy', cost: 300, colors: ['#4c1d95','#7c3aed','#e879f9'], glow: '#e879f9', special: true },
  { id: 'rainbow', name: 'Rainbow',cost: 500, colors: null, glow: '#fff', special: true },
];

const getSkin = () => SKINS.find(s => s.id === State.selectedSkin) || SKINS[0];
const getBlockColors = (skin, idx) => {
  if (skin.id === 'rainbow') {
    const hue = (Date.now() / 20 + idx * 30) % 360;
    return [`hsl(${hue},90%,55%)`, `hsl(${hue+15},85%,65%)`, `hsl(${hue+30},95%,70%)`];
  }
  return skin.colors;
};

// Particle background
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const bgParticles = [];
const resizeBg = () => { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; };
resizeBg();
window.addEventListener('resize', resizeBg);
for (let i = 0; i < 60; i++) {
  bgParticles.push({
    x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
    r: Math.random() * 1.5 + 0.3, vx: (Math.random()-0.5)*0.2, vy: (Math.random()-0.5)*0.2,
    alpha: Math.random() * 0.4 + 0.1,
  });
}
const animBg = () => {
  bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
  for (const p of bgParticles) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = bgCanvas.width;   if (p.x > bgCanvas.width) p.x = 0;
    if (p.y < 0) p.y = bgCanvas.height;  if (p.y > bgCanvas.height) p.y = 0;
    bgCtx.beginPath();
    bgCtx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    bgCtx.fillStyle = `rgba(168,85,247,${p.alpha})`;
    bgCtx.fill();
  }
  requestAnimationFrame(animBg);
};
animBg();

// Screen router
const screens = {};
document.querySelectorAll('.screen').forEach(el => { screens[el.id.replace('screen-','')] = el; });
const showScreen = (name) => {
  Object.entries(screens).forEach(([k,el]) => el.classList.toggle('active', k === name));
  State.screen = name;
};

const $ = id => document.getElementById(id);
const hudScore  = $('hud-score');
const hudHeight = $('hud-height');
const comboDisp = $('combo-display');

const refreshHomeStats = () => {
  $('best-score-home').textContent = State.bestScore.toLocaleString();
  $('best-height-home').textContent = State.bestHeight;
  $('coin-count').textContent = State.coins;
  const sb = $('streak-banner');
  if (State.streak > 1) { $('streak-text').textContent = `${State.streak} day streak!`; sb.style.display='flex'; }
  else sb.style.display = 'none';
};
refreshHomeStats();

$('btn-play').addEventListener('click', () => startGame());
$('btn-duel').addEventListener('click', () => showScreen('duel'));
$('btn-skins').addEventListener('click', () => { buildSkinsGrid(); showScreen('skins'); });
$('btn-back-skins').addEventListener('click', () => showScreen('home'));
$('btn-back-duel').addEventListener('click', () => showScreen('home'));
$('btn-pause').addEventListener('click', () => pauseGame());
$('btn-resume').addEventListener('click', () => resumeGame());
$('btn-restart-pause').addEventListener('click', () => { showScreen('game'); startGame(); });
$('btn-home-pause').addEventListener('click', () => { State.running=false; showScreen('home'); });
$('btn-play-again').addEventListener('click', () => { showScreen('game'); startGame(); });
$('btn-home-go').addEventListener('click', () => { refreshHomeStats(); showScreen('home'); });

// Skins
const buildSkinsGrid = () => {
  const grid = $('skins-grid');
  grid.innerHTML = '';
  $('coin-count').textContent = State.coins;
  SKINS.forEach(skin => {
    const owned = State.unlockedSkins.includes(skin.id);
    const selected = skin.id === State.selectedSkin;
    const el = document.createElement('div');
    el.className = `skin-item ${selected?'selected':''} ${(!owned&&skin.cost>0)?'locked':''}`;

    const preview = document.createElement('canvas');
    preview.className = 'skin-preview';
    preview.width = 48; preview.height = 24;
    drawSkinPreview(preview, skin);

    const name = document.createElement('div');
    name.className = 'skin-name';
    name.textContent = skin.name;
    el.appendChild(preview);
    el.appendChild(name);

    if (!owned) {
      const cost = document.createElement('div');
      cost.className = 'skin-cost';
      cost.innerHTML = `<span>◆</span>${skin.cost}`;
      el.appendChild(cost);
      if (skin.special) {
        const badge = document.createElement('div');
        badge.className = 'skin-badge'; badge.textContent = '★';
        el.appendChild(badge);
      }
    }

    el.addEventListener('click', () => {
      if (owned) { State.selectedSkin = skin.id; save(); buildSkinsGrid(); }
      else if (State.coins >= skin.cost) {
        State.coins -= skin.cost;
        State.unlockedSkins.push(skin.id);
        State.selectedSkin = skin.id;
        save(); buildSkinsGrid();
        spawnScorePopup('◆ UNLOCKED!', '#fbbf24');
      }
    });
    grid.appendChild(el);
  });
};

const drawSkinPreview = (canvas, skin) => {
  const ctx = canvas.getContext('2d');
  const colors = skin.id==='rainbow' ? ['#f87171','#34d399','#60a5fa'] : skin.colors;
  const w = canvas.width / 3;
  colors.forEach((c,i) => {
    const gr = ctx.createLinearGradient(i*w,0,i*w+w,24);
    gr.addColorStop(0,c); gr.addColorStop(1,c+'99');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.roundRect(i*w+1,1,w-2,22,4); ctx.fill();
  });
};

// Game engine
const canvas = $('game-canvas');
const ctx = canvas.getContext('2d');
const BLOCK_H = 28;
const BASE_W = 200;
const SPEED_INIT = 2.2;
const SPEED_MAX = 7;

let blocks = [], fallingBlock = null;
let cameraY = 0, targetCameraY = 0;
let animId = null, vfxParticles = [], shakeAmt = 0;

const resizeCanvas = () => {
  canvas.width = Math.min(window.innerWidth, 480);
  canvas.height = window.innerHeight;
};
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const startGame = () => {
  cancelAnimationFrame(animId);
  State.score = 0; State.height = 0; State.combo = 0; State.bestCombo = 0;
  State.paused = false; State.running = true;
  blocks = []; vfxParticles = [];
  cameraY = 0; targetCameraY = 0; shakeAmt = 0; fallingBlock = null;
  blocks.push({ x: canvas.width/2-BASE_W/2, y: canvas.height-80, w: BASE_W, h: BLOCK_H, isBase:true });
  updateHUD();
  showScreen('game');
  spawnFalling();
  loop();
};

const spawnFalling = () => {
  const top = blocks[blocks.length-1];
  const w = Math.max(top.w-4, 40);
  const dir = Math.random()<0.5 ? 1 : -1;
  fallingBlock = {
    x: dir>0 ? -w-10 : canvas.width+10,
    y: top.y - BLOCK_H - 4,
    w, h: BLOCK_H,
    speed: Math.min(SPEED_INIT + blocks.length*0.08, SPEED_MAX) * dir,
    idx: blocks.length,
    skin: getSkin(),
    landed: false,
  };
};

const drop = () => {
  if (!State.running || State.paused || !fallingBlock || fallingBlock.landed) return;
  fallingBlock.landed = true;
  const top = blocks[blocks.length-1];
  const fb = fallingBlock;
  const leftOverlap  = Math.max(0, top.x+top.w - fb.x);
  const rightOverlap = Math.max(0, fb.x+fb.w - (top.x+top.w));
  const overlap = fb.w - leftOverlap - rightOverlap;

  if (overlap <= 0) { shakeAmt=14; spawnBreakFx(fb.x+fb.w/2, fb.y, fb.skin.colors||['#7c3aed'],12); gameOver(); return; }

  const newX = Math.max(fb.x, top.x);
  const newW = overlap;
  const offCenter = Math.abs((newX+newW/2)-(top.x+top.w/2));

  let points = Math.round(10 + newW*0.3);
  let label = null, labelColor = '#fff';

  if (offCenter < 4) {
    State.combo++; points += State.combo*8;
    label = State.combo>=3 ? `PERFECT x${State.combo}` : 'PERFECT!';
    labelColor = '#fbbf24';
    if (State.combo>State.bestCombo) State.bestCombo=State.combo;
  } else if (offCenter < 14) {
    State.combo++; points += State.combo*4;
    label = `NICE +${State.combo}`; labelColor = '#34d399';
    if (State.combo>State.bestCombo) State.bestCombo=State.combo;
  } else { State.combo=0; }

  State.score += points; State.height++; shakeAmt=4;

  blocks.push({ x:newX, y:fb.y, w:newW, h:BLOCK_H, skin:fb.skin, idx:fb.idx, bounceOffset:8 });

  if (leftOverlap>2)  spawnTrimFx(fb.x, fb.y, leftOverlap, fb.skin.colors||['#7c3aed']);
  if (rightOverlap>2) spawnTrimFx(top.x+top.w-rightOverlap, fb.y, rightOverlap, fb.skin.colors||['#7c3aed']);

  targetCameraY = Math.max(0, (blocks.length-8)*(BLOCK_H+4));
  updateHUD();
  if (label) spawnScorePopup(label, labelColor);
  spawnFalling();
};

const gameOver = () => {
  State.running = false;
  const isRecord = State.score>State.bestScore || State.height>State.bestHeight;
  if (State.score>State.bestScore) State.bestScore=State.score;
  if (State.height>State.bestHeight) State.bestHeight=State.height;
  const coins = Math.floor(State.score/10);
  State.coins += coins; save();

  $('go-score').textContent = State.score.toLocaleString();
  $('go-height').textContent = State.height;
  $('go-combo').textContent = State.bestCombo;
  $('go-coins-earned').textContent = `+${coins}`;
  $('go-record').style.display = isRecord ? 'block' : 'none';

  if (State.height>=20) { $('go-emoji').textContent='🏆'; $('go-title').textContent='IMPRESSIVE!'; }
  else if (State.height>=10) { $('go-emoji').textContent='⭐'; $('go-title').textContent='WELL DONE!'; }
  else { $('go-emoji').textContent='💥'; $('go-title').textContent='STACK BROKEN!'; }

  setTimeout(() => showScreen('gameover'), 600);
};

const pauseGame = () => { if (!State.running) return; State.paused=true; showScreen('pause'); };
const resumeGame = () => { State.paused=false; showScreen('game'); };

const updateHUD = () => {
  hudScore.textContent = State.score.toLocaleString();
  hudHeight.textContent = State.height;
  comboDisp.textContent = State.combo>=2 ? `✦ x${State.combo} COMBO` : '';
};

// VFX
const spawnTrimFx = (x,y,w,colors) => {
  for (let i=0;i<6;i++) vfxParticles.push({
    x:x+Math.random()*w, y:y+Math.random()*BLOCK_H,
    vx:(Math.random()-0.5)*3, vy:-(Math.random()*3+1),
    size:Math.random()*5+2, color:colors[Math.floor(Math.random()*colors.length)], life:1,
  });
};
const spawnBreakFx = (x,y,colors,n) => {
  for (let i=0;i<n;i++) {
    const a = (Math.PI*2*i/n)+Math.random()*0.4;
    vfxParticles.push({
      x, y:y+BLOCK_H/2,
      vx:Math.cos(a)*(Math.random()*5+2), vy:Math.sin(a)*(Math.random()*5+2)-2,
      size:Math.random()*8+3, color:colors[Math.floor(Math.random()*colors.length)], life:1,
    });
  }
};

const spawnScorePopup = (text, color) => {
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.style.color = color;
  el.style.left = `${Math.random()*40+30}%`;
  el.style.top  = `${Math.random()*20+20}%`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
};

// Draw
const drawBlock = (b, camY) => {
  const x=b.x, y=b.y-camY+(b.bounceOffset||0), w=b.w, h=b.h;
  ctx.save();
  if (b.isBase) {
    ctx.fillStyle='#1e1e30'; ctx.strokeStyle='rgba(168,85,247,0.5)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(x,y,w,h,6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(168,85,247,0.15)'; ctx.lineWidth=1;
    for (let gx=x+16;gx<x+w;gx+=16) { ctx.beginPath();ctx.moveTo(gx,y);ctx.lineTo(gx,y+h);ctx.stroke(); }
    ctx.restore(); return;
  }
  const skin=b.skin, c=getBlockColors(skin,b.idx);
  ctx.shadowColor=skin.glow; ctx.shadowBlur=16; ctx.shadowOffsetY=4;
  const gr=ctx.createLinearGradient(x,y,x+w,y+h);
  gr.addColorStop(0,c[0]);gr.addColorStop(0.5,c[1]);gr.addColorStop(1,c[2]);
  ctx.fillStyle=gr; ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.fill();
  ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  const hl=ctx.createLinearGradient(x,y,x,y+h*0.4);
  hl.addColorStop(0,'rgba(255,255,255,0.22)');hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=hl; ctx.beginPath(); ctx.roundRect(x+2,y+2,w-4,h*0.45,[5,5,0,0]); ctx.fill();
  ctx.strokeStyle=`${c[1]}99`; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.stroke();
  ctx.restore();
};

const drawFalling = (camY) => {
  if (!fallingBlock||fallingBlock.landed) return;
  const fb=fallingBlock, skin=fb.skin, c=getBlockColors(skin,fb.idx);
  const x=fb.x, y=fb.y-camY, w=fb.w, h=fb.h;
  ctx.save();
  ctx.shadowColor=skin.glow; ctx.shadowBlur=20;
  const gr=ctx.createLinearGradient(x,y,x+w,y+h);
  gr.addColorStop(0,c[0]);gr.addColorStop(0.5,c[1]);gr.addColorStop(1,c[2]);
  ctx.fillStyle=gr; ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.fill();
  ctx.shadowBlur=0;
  if (blocks.length>0) {
    const top=blocks[blocks.length-1];
    ctx.strokeStyle=`${c[1]}44`; ctx.lineWidth=1; ctx.setLineDash([4,6]);
    ctx.beginPath(); ctx.moveTo(x+w/2,y+h); ctx.lineTo(x+w/2,top.y-camY); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
};

const loop = () => {
  if (!State.running) return;
  animId = requestAnimationFrame(loop);
  if (State.paused) return;

  cameraY += (targetCameraY-cameraY)*0.08;
  shakeAmt *= 0.85;
  const sx = shakeAmt>0.5?(Math.random()-0.5)*shakeAmt:0;
  const sy = shakeAmt>0.5?(Math.random()-0.5)*shakeAmt:0;

  ctx.save();
  ctx.translate(sx,sy);
  ctx.clearRect(-20,-20,canvas.width+40,canvas.height+40);

  const bgGr=ctx.createLinearGradient(0,0,0,canvas.height);
  bgGr.addColorStop(0,'#0a0a12');bgGr.addColorStop(1,'#12121e');
  ctx.fillStyle=bgGr; ctx.fillRect(0,0,canvas.width,canvas.height);

  const gridOff=cameraY%60;
  ctx.strokeStyle='rgba(168,85,247,0.04)'; ctx.lineWidth=1;
  for (let gy=-gridOff;gy<canvas.height;gy+=60){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(canvas.width,gy);ctx.stroke();}
  for (let gx=0;gx<canvas.width;gx+=60){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,canvas.height);ctx.stroke();}

  for (const b of blocks) {
    if (b.bounceOffset) { b.bounceOffset*=0.7; if(Math.abs(b.bounceOffset)<0.1)b.bounceOffset=0; }
  }

  for (const b of blocks) drawBlock(b, cameraY);

  if (fallingBlock && !fallingBlock.landed) {
    fallingBlock.x += fallingBlock.speed;
    if (fallingBlock.x > canvas.width+20)  fallingBlock.speed = -Math.abs(fallingBlock.speed);
    if (fallingBlock.x+fallingBlock.w < -20) fallingBlock.speed = Math.abs(fallingBlock.speed);
    drawFalling(cameraY);
  }

  for (let i=vfxParticles.length-1;i>=0;i--) {
    const p=vfxParticles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life-=0.035;
    if (p.life<=0){vfxParticles.splice(i,1);continue;}
    ctx.save();
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.shadowColor=p.color; ctx.shadowBlur=8;
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.roundRect(p.x-p.size/2,p.y-p.size/2-cameraY,p.size,p.size,2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

// Input
const handleInput = () => { if (State.screen!=='game'||State.paused) return; drop(); };
canvas.addEventListener('pointerdown', handleInput);
document.addEventListener('keydown', e => {
  if (e.code==='Space'||e.code==='ArrowDown') { e.preventDefault(); handleInput(); }
  if (e.code==='Escape'&&State.screen==='game') pauseGame();
});

showScreen('home');
