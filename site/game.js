(() => {
'use strict';
// ---------- Tunables ----------
const CONFIG = {
  timeLimit: 120,        // seconds per level
  gaugeMax: 6,
  vatMax: 10,
  mopRelief: 3,
  continueCost: 100,
  levelCoins: 10,
  coinPickup: 10,
  powerRate: 0.01,       // power-ups per second (mop + rainbow combined)
  coinRate: 0.006,       // coin icons per second
  gravity: 1100,
  vipFromLevel: 8,
  vipChance: 0.1,
  vipMultiplier: 3,
  speedRange: [70, 150],       // px/s for red, blue, mop, coin, rainbow
  yellowSpeedRange: [50, 115], // yellow vials are slower (middle vat, either side)
  sizeWeights: [22, 20, 18, 16, 13, 11], // vial sizes 1..6
};

// ---------- Layout ----------
const W = 360, H = 700;
const RIM_Y = [78, 146], VAT_TOP = 340, VAT_BOT = 460, VAT_W = 84;
const VAT_X = [70, 180, 290];
const BELT_Y = 480;
const SLOT_X = [60, 180, 300];
const COLORS = [
  { name: 'red', hex: '#e5383b', pat: 'stripes' },
  { name: 'yellow', hex: '#ffd60a', pat: 'dots' },
  { name: 'blue', hex: '#3a86ff', pat: 'waves' },
];

// ---------- Helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const sum = a => a.reduce((x, y) => x + y, 0);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const $ = id => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d'), overlay = $('overlay');

// ---------- Save ----------
const KEY = 'drinkDilemma.v1';
let save = { coins: 0, sound: true, run: null };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

// ---------- Sound ----------
let actx = null;
function beep(freq, dur = 0.08, type = 'sine', vol = 0.05) {
  if (!save.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) {}
}

// ---------- State ----------
let S = null; // game state; null in menus
function freshRun() { return { level: 1, vats: [0, 0, 0], gauge: 0, score: 0 }; }

function startLevel(run) {
  S = {
    level: run.level, vats: run.vats.slice(), gauge: run.gauge, score: run.score,
    snap: { level: run.level, vats: run.vats.slice(), gauge: run.gauge, score: run.score },
    timeLeft: CONFIG.timeLimit, need: 3 + run.level, served: 0, spawned: 0,
    disp: run.vats.slice(), shake: [0, 0, 0], parts: [],
    customers: [], vials: [], drinks: [], fx: [], spawnT: 1, custT: 0.5, over: false, t: 0,
  };
  overlay.hidden = true;
}

// ---------- Orders ----------
function genOrder(L) {
  const o = [0, 0, 0];
  const single = Math.min(6, 3 + Math.floor((L - 1) / 2));
  if (L >= 5 && Math.random() < 0.5) {
    const n = (L >= 10 && Math.random() < 0.5) ? 3 : 2;
    const cols = shuffle([0, 1, 2]).slice(0, n);
    const cap = Math.min(6, Math.max(2, Math.floor(L / 2)));
    do { o.fill(0); cols.forEach(c => o[c] = randInt(1, cap)); } while (sum(o) < 3);
  } else {
    o[randInt(0, 2)] = randInt(3, single);
  }
  return o;
}
function recipeCode(o) { return o[0] * 49 + o[1] * 7 + o[2]; }
function points(c) { return sum(c.order.map(n => n > 0 ? 1 : 0)) * sum(c.order) * 5 * (c.vip ? CONFIG.vipMultiplier : 1); }
const canServe = o => o.every((n, i) => S.vats[i] >= n);

// ---------- Spawning ----------
function spawnCustomer(vip) {
  const used = new Set(S.customers.map(c => c.slot));
  const slot = [0, 1, 2].find(i => !used.has(i));
  if (slot === undefined) return false;
  const order = vip ? [randInt(4, 6), randInt(4, 6), randInt(4, 6)] : genOrder(S.level);
  S.customers.push({ slot, order, vip, look: randomLook(vip), state: 'wait', t: 0, drop: 0 });
  if (!vip) S.spawned++;
  return true;
}

function spawnVial(kind, color) {
  const fromLeft = color === 0 ? false : color === 2 ? true : Math.random() < 0.5;
  const speedUp = Math.min(2, 1 + 0.05 * (S.level - 1));
  const [lo, hi] = kind === 'vial' && color === 1 ? CONFIG.yellowSpeedRange : CONFIG.speedRange;
  const speed = rand(lo, hi) * speedUp;
  const v = { kind, color, x: fromLeft ? -20 : W + 20, y: 0, row: Math.random() < 0.5 ? 0 : 1, vx: fromLeft ? speed : -speed, vy: 0, state: 'ride', size: 1, spin: Math.random() * 6 };
  if (kind === 'vial') {
    let r = Math.random() * sum(CONFIG.sizeWeights), i = 0;
    while (r > CONFIG.sizeWeights[i]) { r -= CONFIG.sizeWeights[i]; i++; }
    v.size = i + 1;
  }
  v.y = RIM_Y[v.row] + vialH(v) / 2; // hangs from the rim
  S.vials.push(v);
}
const vialH = v => v.kind === 'vial' ? 22 + v.size * 6 : v.kind === 'rainbow' ? 52 : 34;
const vialW = v => v.kind === 'vial' ? 22 + v.size * 2.5 : 34;
// layering: smaller vials sit on top of bigger ones; mop/coin on top of all, rainbow underneath
const vialRank = v => v.kind === 'vial' ? v.size : v.kind === 'rainbow' ? 7 : 0;

// ---------- Rules ----------
function addOverflow(n = 1, x = W / 2, y = 300, why = '') {
  S.gauge += n; beep(160, 0.15, 'square');
  S.fx.push({ t: 0, x, y, text: why ? why + ' +' + n : '+' + n + ' overflow', col: '#ff6b6b' });
  if (S.gauge >= CONFIG.gaugeMax) endGame('Overflow!');
}

function spill(x, y, col, n, spread = 1) {
  for (let k = 0; k < n; k++)
    S.parts.push({ x: x + rand(-8, 8), y, vx: rand(-90, 90) * spread, vy: rand(-220, -60), col, t: 0 });
}

function land(v, i) {
  const x = VAT_X[i];
  if (v.kind === 'rainbow') {
    S.vats[i] = CONFIG.vatMax; beep(880, 0.2, 'triangle');
    S.fx.push({ t: 0, x, y: VAT_TOP - 10, text: 'FULL!', col: '#fff' });
  } else if (v.color !== i) {
    S.shake[i] = 0.4; spill(x, VAT_TOP, COLORS[v.color].hex, 14);
    addOverflow(1, x, VAT_TOP - 30, 'wrong color!'); // wrong vat, vial is lost
  } else {
    const room = CONFIG.vatMax - S.vats[i];
    S.vats[i] += Math.min(room, v.size); beep(440 + v.size * 40, 0.07);
    if (v.size > room) { S.shake[i] = 0.4; spill(x, VAT_TOP, COLORS[i].hex, 8 + 2 * (v.size - room)); addOverflow(1, x, VAT_TOP - 30, 'overflow!'); }
  }
  checkServe();
}

function checkServe() {
  let c;
  while (!S.over && (c = S.customers.find(k => k.state === 'wait' && canServe(k.order)))) {
    c.order.forEach((n, i) => S.vats[i] -= n);
    c.state = 'served';
    S.drinks.push({ c, x: 0, code: recipeCode(c.order), total: sum(c.order) });
    beep(660, 0.1, 'triangle');
  }
}

function levelComplete() {
  S.over = true;
  save.coins += CONFIG.levelCoins;
  save.run = { level: S.level + 1, vats: S.vats.slice(), gauge: S.gauge, score: S.score };
  persist();
  beep(784, 0.25, 'triangle');
  show(`<h1>Level ${S.level} complete!</h1><p>+${CONFIG.levelCoins} coins &nbsp;|&nbsp; ${save.coins} total</p>`,
    [['Next level', () => startLevel(save.run)], ['Main menu', menu, 'ghost']]);
}

function endGame(reason) {
  if (S.over) return;
  S.over = true; beep(110, 0.5, 'sawtooth');
  const snap = S.snap;
  // keep the run on disk, flagged as lost: resuming it (here or from the menu) costs coins
  save.run = { level: snap.level, vats: snap.vats.slice(), gauge: snap.gauge, score: snap.score, lost: true }; persist();
  const can = save.coins >= CONFIG.continueCost;
  show(`<h1>Game over</h1><p>${reason}</p><p>Coins: ${save.coins}</p>`, [
    [`Continue level ${snap.level} (${CONFIG.continueCost} coins)`, () => payContinue(), '', !can],
    ['Restart from level 1', () => { save.run = null; persist(); startLevel(freshRun()); }],
    ['Main menu', menu, 'ghost'],
  ]);
}

// ---------- UI overlays ----------
function show(html, buttons) {
  overlay.innerHTML = html;
  buttons.forEach(([label, fn, cls, disabled]) => {
    const b = document.createElement('button');
    b.textContent = label; if (cls) b.className = cls; b.disabled = !!disabled;
    b.addEventListener('click', fn); overlay.appendChild(b);
  });
  overlay.hidden = false;
}
function payContinue() {
  const r = save.run;
  if (!r || save.coins < CONFIG.continueCost) return;
  save.coins -= CONFIG.continueCost;
  save.run = { level: r.level, vats: r.vats.slice(), gauge: r.gauge, score: r.score }; // no longer lost
  persist(); startLevel(save.run);
}
function menu() {
  S = null;
  const b = [];
  if (save.run && save.run.lost) b.push([`Continue level ${save.run.level} (${CONFIG.continueCost} coins)`, payContinue, '', save.coins < CONFIG.continueCost]);
  else if (save.run) b.push([`Continue (level ${save.run.level})`, () => startLevel(save.run)]);
  b.push(['New game', () => { save.run = null; persist(); startLevel(freshRun()); }, save.run ? 'ghost' : '']);
  b.push([`Sound: ${save.sound ? 'On' : 'Off'}`, () => { save.sound = !save.sound; persist(); beep(600); menu(); }, 'ghost']);
  show(`<h1>Drink Dilemma</h1><p>Coins: ${save.coins}</p>`, b);
}

// ---------- Input ----------
// Is the point on this vial's flask shape (neck + triangular body), with a little finger padding?
function hits(v, px, py, pad = 7) {
  if (v.kind === 'coin' || v.kind === 'mop') return Math.hypot(v.x - px, v.y - py) < 30;
  const w = vialW(v), h = vialH(v), top = v.y - h / 2, nw = Math.max(8, w * 0.3), nh = h * 0.34;
  const dy = py - top, dx = Math.abs(px - v.x);
  if (dy < -pad || dy > h + pad) return false;
  if (dy <= nh) return dx <= nw / 2 + pad;
  const f = Math.min(1, (dy - nh) / (h - nh));
  return dx <= nw / 2 + (w / 2 - nw / 2) * f + pad;
}
canvas.addEventListener('pointerdown', e => {
  if (!S || S.over) return;
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
  let best = null;
  for (const pad of [0, 8]) { // exact shape first (topmost wins); padding only if nothing was hit
    let bs = 1e9;
    for (const v of S.vials) {
      if (v.state !== 'ride' || !hits(v, px, py, pad)) continue;
      const score = vialRank(v) * 1000 + Math.hypot(v.x - px, v.y - py);
      if (score < bs) { bs = score; best = v; }
    }
    if (best) break;
  }
  if (!best) return;
  if (best.kind === 'mop') {
    S.gauge = Math.max(0, S.gauge - CONFIG.mopRelief);
    S.vials.splice(S.vials.indexOf(best), 1); beep(520, 0.2, 'triangle');
    S.fx.push({ t: 0, x: best.x, y: best.y + 20, text: '-3 overflow', col: '#7CFC9A' });
  } else if (best.kind === 'coin') {
    save.coins += CONFIG.coinPickup; persist();
    S.vials.splice(S.vials.indexOf(best), 1); beep(1000, 0.1, 'triangle');
    S.fx.push({ t: 0, x: best.x, y: best.y + 20, text: '+' + CONFIG.coinPickup + ' coins', col: '#ffd60a' });
  } else {
    best.state = 'fall'; beep(300, 0.04);
  }
});

// ---------- Update ----------
function update(dt) {
  S.t += dt;
  S.timeLeft -= dt;
  if (S.timeLeft <= 0) { S.timeLeft = 0; return endGame("Time's up!"); }

  // customers
  const maxAtOnce = Math.min(3, 2 + Math.floor(S.level / 4));
  const active = S.customers.filter(c => !c.vip && c.state !== 'gone').length;
  S.custT -= dt;
  if (S.custT <= 0 && S.spawned < S.need && active < maxAtOnce) {
    spawnCustomer(false); S.custT = rand(0.5, 2);
    if (S.level >= CONFIG.vipFromLevel && Math.random() < CONFIG.vipChance && !S.customers.some(c => c.vip)) spawnCustomer(true);
  }

  checkServe(); // serve anyone the vats already cover (e.g. on arrival)

  // vial spawning
  S.spawnT -= dt;
  if (S.spawnT <= 0) {
    spawnVial('vial', randInt(0, 2));
    S.spawnT = rand(0.8, 1.5) / (1 + 0.04 * (S.level - 1));
  }
  if (Math.random() < CONFIG.powerRate * dt) spawnVial(Math.random() < 0.5 ? 'mop' : 'rainbow', 1);
  if (Math.random() < CONFIG.coinRate * dt) spawnVial('coin', 1);

  // vials
  for (const v of S.vials.slice()) {
    v.spin += dt * 4;
    if (v.state === 'ride') {
      v.x += v.vx * dt;
      if (v.x < -40 || v.x > W + 40) S.vials.splice(S.vials.indexOf(v), 1);
    } else {
      v.vy += CONFIG.gravity * dt; v.x += v.vx * dt; v.y += v.vy * dt;
      if (v.y + vialH(v) / 2 >= VAT_TOP) {
        const i = VAT_X.findIndex(x => Math.abs(v.x - x) <= VAT_W / 2);
        if (i >= 0) { S.vials.splice(S.vials.indexOf(v), 1); land(v, i); }
        else if (v.y >= VAT_BOT - 10) {
          S.vials.splice(S.vials.indexOf(v), 1);
          spill(v.x, VAT_BOT - 10, v.kind === 'rainbow' ? '#fff' : COLORS[v.color].hex, 10, 1.5);
          addOverflow(v.kind === 'rainbow' ? 2 : 1, v.x, VAT_BOT - 30, 'missed!');
        }
        if (S.over) return;
      }
    }
  }

  // animate vat levels (fast but visible), shake, spill particles
  for (let i = 0; i < 3; i++) {
    const diff = S.vats[i] - S.disp[i], step = 9 * dt;
    S.disp[i] = Math.abs(diff) <= step ? S.vats[i] : S.disp[i] + Math.sign(diff) * step;
    S.shake[i] = Math.max(0, S.shake[i] - dt);
  }
  for (const q of S.parts) { q.t += dt; q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  S.parts = S.parts.filter(q => q.t < 0.9 && q.y < VAT_BOT + 4);

  // drinks sliding along the belt
  for (const d of S.drinks.slice()) {
    d.x += 240 * dt;
    if (d.x >= SLOT_X[d.c.slot]) {
      S.drinks.splice(S.drinks.indexOf(d), 1);
      d.c.state = 'leaving';
      const p = points(d.c); S.score += p;
      if (!d.c.vip) S.served++;
      S.fx.push({ t: 0, x: SLOT_X[d.c.slot], y: 522, text: '+' + p, col: '#fff' });
    }
  }
  for (const c of S.customers.slice()) {
    if (c.state === 'leaving') { c.drop += dt * 160; if (c.drop > 120) S.customers.splice(S.customers.indexOf(c), 1); }
  }
  S.fx.forEach(f => f.t += dt); S.fx = S.fx.filter(f => f.t < 1);

  if (S.served >= S.need && S.drinks.length === 0) levelComplete();
}

// ---------- Drawing ----------
function pattern(kind, x, y, w, h, col = 'rgba(0,0,0,.35)') {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
  if (kind === 'stripes') {
    for (let i = -h; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  } else if (kind === 'dots') {
    for (let r = 0, j = y + 4; j < y + h; j += 9, r++)
      for (let i = x + 4 + (r % 2 ? 4.5 : 0); i < x + w; i += 9) { ctx.beginPath(); ctx.arc(i, j, 1.8, 0, 7); ctx.fill(); }
  } else if (kind === 'waves') {
    for (let j = y + 5; j < y + h; j += 9) {
      ctx.beginPath();
      for (let i = 0; i <= w; i += 3) { const yy = j + Math.sin(i / 4) * 2.5; i ? ctx.lineTo(x + i, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
  }
  ctx.restore();
}
function rrp(x, y, w, h, r) { ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); } // sub-path only
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function text(s, x, y, size = 14, col = '#fff', align = 'center') {
  ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}

// vat outline: straight sides, rounded bottom
function vatPath(x, y, w, h, r = 30) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r);
  ctx.bezierCurveTo(x + w, y + h - r * 0.3, x + w - r * 0.4, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.bezierCurveTo(x + r * 0.4, y + h, x, y + h - r * 0.3, x, y + h - r); ctx.closePath();
}

function drawVial(v) {
  const h = vialH(v), w = vialW(v);
  if (v.kind === 'coin') {
    ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.arc(v.x, v.y, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 3; ctx.stroke(); text('$', v.x, v.y + 1, 18, '#7a5c00'); return;
  }
  if (v.kind === 'mop') {
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(v.x + 8, v.y - 18); ctx.lineTo(v.x - 6, v.y + 8); ctx.stroke();
    ctx.fillStyle = '#cbd5e1'; rr(v.x - 18, v.y + 4, 24, 14, 4); ctx.fill(); text('MOP', v.x - 6, v.y + 11, 8, '#334155'); return;
  }
  const hue = (S.t * 200) % 360;
  flaskPath(v.x, v.y, vialW(v), h);
  ctx.fillStyle = v.kind === 'rainbow' ? `hsl(${hue},90%,55%)` : COLORS[v.color].hex; ctx.fill();
  ctx.save(); flaskPath(v.x, v.y, vialW(v), h); ctx.clip();
  if (v.kind === 'vial') pattern(COLORS[v.color].pat, v.x - w / 2, v.y - h / 2, w, h);
  ctx.restore();
  flaskPath(v.x, v.y, vialW(v), h); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  const label = v.kind === 'rainbow' ? '★' : v.size, ly = v.y + h * 0.3;
  ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 4; ctx.strokeText(label, v.x, ly);
  text(label, v.x, ly, 15, '#111');
}

// Erlenmeyer-style flask: tube neck on a triangular body
function flaskPath(cx, cy, w, h) {
  const nw = Math.max(8, w * 0.3), nh = h * 0.34, top = cy - h / 2, bot = cy + h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - nw / 2 - 2.5, top); ctx.lineTo(cx + nw / 2 + 2.5, top);
  ctx.lineTo(cx + nw / 2, top + 3); ctx.lineTo(cx + nw / 2, top + nh);
  ctx.lineTo(cx + w / 2, bot - 5); ctx.quadraticCurveTo(cx + w / 2, bot, cx + w / 2 - 5, bot);
  ctx.lineTo(cx - w / 2 + 5, bot); ctx.quadraticCurveTo(cx - w / 2, bot, cx - w / 2, bot - 5);
  ctx.lineTo(cx - nw / 2, top + nh); ctx.lineTo(cx - nw / 2, top + 3); ctx.closePath();
}

function drawDrink(x, y, code, total, scale = 1) {
  const hue = (code * 137.508) % 360, shape = (code * 2654435761 >>> 0) % 4;
  const s = (0.85 + total / 18 * 0.45) * scale;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = `hsl(${hue},75%,55%)`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (shape === 0) { ctx.moveTo(-10, -12); ctx.lineTo(10, -12); ctx.lineTo(7, 12); ctx.lineTo(-7, 12); }
  else if (shape === 1) { ctx.rect(-6, -16, 12, 32); }
  else if (shape === 2) { ctx.moveTo(-13, -8); ctx.lineTo(13, -8); ctx.quadraticCurveTo(13, 12, 0, 12); ctx.quadraticCurveTo(-13, 12, -13, -8); }
  else { ctx.rect(-5, -4, 10, 18); ctx.rect(-2.5, -16, 5, 12); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

// ---------- Customers: simple people made of swappable parts ----------
const SKIN = ['#ffdbb4', '#f4c7a1', '#e0a97c', '#c68642', '#8d5524', '#6b4423'];
const HAIR_COL = ['#2b1b10', '#6b3e1e', '#d9a441', '#c2410c', '#9ca3af', '#111827', '#7c3aed', '#0ea5e9'];
const PANTS = ['#1e3a8a', '#374151', '#4b5563', '#7c5b3b', '#14532d', '#111827', '#9a3412'];
const pick = a => a[randInt(0, a.length - 1)];
function randomLook(vip) {
  return {
    skin: pick(SKIN), hair: pick(HAIR_COL), pants: pick(PANTS),
    shirt: `hsl(${randInt(0, 359)},${randInt(45, 80)}%,${randInt(40, 62)}%)`,
    style: vip ? pick([0, 1, 4]) : randInt(0, 6), // 0 bald 1 short 2 spiky 3 bun 4 long 5 mohawk 6 curly
    eyes: randInt(0, 4), mouth: randInt(0, 2),
  };
}
function drawPerson(x, hy, L, vip) {
  const fill = (c, fn) => { ctx.fillStyle = c; ctx.beginPath(); fn(); ctx.fill(); };
  // legs + shoes
  fill(L.pants, () => { rrp(x - 11, hy + 28, 10, 16, 2); rrp(x + 1, hy + 28, 10, 16, 2); });
  fill('#222', () => { rrp(x - 12, hy + 42, 12, 5, 2); rrp(x, hy + 42, 12, 5, 2); });
  // torso + arms
  fill(L.shirt, () => { rrp(x - 14, hy + 11, 28, 20, 6); rrp(x - 20, hy + 13, 7, 15, 3); rrp(x + 13, hy + 13, 7, 15, 3); });
  fill(L.skin, () => { ctx.arc(x - 16.5, hy + 29, 3.5, 0, 7); ctx.moveTo(x + 20, hy + 29); ctx.arc(x + 16.5, hy + 29, 3.5, 0, 7); });
  // hair behind head
  if (L.style === 4) fill(L.hair, () => rrp(x - 15, hy - 12, 30, 32, 12));
  // head
  fill(L.skin, () => ctx.arc(x, hy, 13, 0, 7));
  // front hair
  const cap = () => { ctx.arc(x, hy - 1, 14, Math.PI, 0); ctx.closePath(); };
  if (L.style === 1 || L.style === 4) fill(L.hair, cap);
  else if (L.style === 3) { fill(L.hair, cap); fill(L.hair, () => ctx.arc(x, hy - 17, 6, 0, 7)); }
  else if (L.style === 2) fill(L.hair, () => { ctx.moveTo(x - 14, hy - 3); [-14, -9, -5, 0, 5, 9, 14].forEach((px, k) => ctx.lineTo(x + px, hy - (k % 2 ? 11 : 20))); ctx.lineTo(x + 14, hy - 3); });
  else if (L.style === 5) fill(L.hair, () => rrp(x - 3, hy - 21, 6, 13, 3));
  else if (L.style === 6) fill(L.hair, () => [-10, -5, 0, 5, 10].forEach((px, k) => { ctx.moveTo(x + px + 5, hy - 10 - (k % 2) * 3); ctx.arc(x + px, hy - 10 - (k % 2) * 3, 5, 0, 7); }));
  // eyes
  ctx.fillStyle = '#222'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.6;
  const ey = hy - 1;
  [-5, 5].forEach((ox, k) => {
    const ex = x + ox;
    if (L.eyes === 0) fill('#222', () => ctx.arc(ex, ey, 1.8, 0, 7));
    else if (L.eyes === 1) fill('#222', () => ctx.ellipse(ex, ey, 1.8, 3, 0, 0, 7));
    else if (L.eyes === 2) { ctx.beginPath(); ctx.moveTo(ex - 3, ey); ctx.lineTo(ex + 3, ey); ctx.stroke(); }
    else if (L.eyes === 3) { fill('#fff', () => ctx.arc(ex, ey, 3.6, 0, 7)); fill('#222', () => ctx.arc(ex, ey, 1.7, 0, 7)); }
    else if (k === 0) fill('#222', () => ctx.arc(ex, ey, 1.8, 0, 7));
    else { ctx.beginPath(); ctx.arc(ex, ey + 1, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); } // wink
  });
  // mouth
  ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.lineWidth = 1.6; ctx.beginPath();
  if (L.mouth === 0) ctx.arc(x, hy + 3, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (L.mouth === 1) { ctx.moveTo(x - 4, hy + 7); ctx.lineTo(x + 4, hy + 7); }
  else ctx.arc(x, hy + 7, 2.4, 0, 7);
  L.mouth === 2 ? ctx.fill() : ctx.stroke();
  // VIP-only accessory: gold crown
  if (vip) {
    fill('#ffd60a', () => { ctx.moveTo(x - 10, hy - 11); ctx.lineTo(x - 10, hy - 23); ctx.lineTo(x - 5, hy - 17); ctx.lineTo(x, hy - 25); ctx.lineTo(x + 5, hy - 17); ctx.lineTo(x + 10, hy - 23); ctx.lineTo(x + 10, hy - 11); });
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

function drawOrder(c, x, y) {
  const bw = 108, bh = 96, left = x - bw / 2;
  ctx.fillStyle = '#fff'; rr(left, y, bw, bh, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 8, y + bh); ctx.lineTo(x, y + bh + 10); ctx.lineTo(x + 8, y + bh); ctx.fill();
  if (c.vip) { ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 3; rr(left, y, bw, bh, 12); ctx.stroke(); text('♛ VIP', left + 4, y + 8, 11, '#b8860b', 'left'); }
  drawDrink(x + (c.vip ? 26 : 0), y + 24, recipeCode(c.order), sum(c.order), 1.25);
  c.order.forEach((n, i) => {
    if (!n) return;
    const bx = left + 11 + i * 29, h = n * 5.5, by = y + bh - 6 - h;
    ctx.fillStyle = COLORS[i].hex; ctx.fillRect(bx, by, 25, h); pattern(COLORS[i].pat, bx, by, 25, h);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, 25, h);
    text(n, bx + 12.5, by - 7, 13, '#111');
  });
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1b1b2b'; ctx.fillRect(0, 0, W, H);
  if (!S) return;

  // HUD
  text(`Lv ${S.level}`, 12, 16, 15, '#fff', 'left');
  text(`Served ${S.served}/${S.need}`, W / 2, 16, 13, '#cbd5e1');
  text(`${save.coins} ●`, W - 12, 16, 15, '#ffd60a', 'right');
  const frac = S.timeLeft / CONFIG.timeLimit;
  ctx.fillStyle = '#333'; ctx.fillRect(12, 28, W - 24, 8);
  ctx.fillStyle = frac < 0.2 ? '#ff4d4d' : '#4ade80'; ctx.fillRect(12, 28, (W - 24) * frac, 8);
  text(`${Math.ceil(S.timeLeft)}s`, W - 14, 46, 10, '#94a3b8', 'right');
  text(`Score ${S.score}`, 12, 46, 10, '#94a3b8', 'left');
  for (let i = 0; i < CONFIG.gaugeMax; i++) {
    ctx.fillStyle = i < S.gauge ? '#ff4d4d' : '#3a3a52';
    ctx.beginPath(); ctx.arc(W / 2 - 62 + i * 25, 52, 8, 0, 7); ctx.fill();
  }
  text('overflow', W / 2, 64, 9, '#94a3b8');

  // track
  ctx.strokeStyle = '#444466'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, RIM_Y[0] - 3); ctx.lineTo(W, RIM_Y[0] - 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, RIM_Y[1] - 3); ctx.lineTo(W, RIM_Y[1] - 3); ctx.stroke();

  // vats
  VAT_X.forEach((x, i) => {
    const sh = S.shake[i] > 0 ? Math.sin(S.t * 60) * 4 * (S.shake[i] / 0.4) : 0;
    const left = x - VAT_W / 2 + sh, hgt = VAT_BOT - VAT_TOP, fill = hgt * S.disp[i] / CONFIG.vatMax;
    vatPath(left, VAT_TOP, VAT_W, hgt);
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#2a2a40'; ctx.fillRect(left, VAT_TOP, VAT_W, hgt);
    // faint tint + pattern so an empty vat still shows its color
    ctx.globalAlpha = 0.22; ctx.fillStyle = COLORS[i].hex; ctx.fillRect(left, VAT_TOP, VAT_W, hgt);
    pattern(COLORS[i].pat, left, VAT_TOP, VAT_W, hgt, 'rgba(255,255,255,.5)'); ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS[i].hex; ctx.fillRect(left, VAT_BOT - fill, VAT_W, fill);
    pattern(COLORS[i].pat, left, VAT_BOT - fill, VAT_W, fill);
    if (fill > 2) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(left, VAT_BOT - fill, VAT_W, 3); } // liquid surface
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(left + 8, VAT_TOP, 7, hgt); // glass shine
    ctx.restore();
    vatPath(left, VAT_TOP, VAT_W, hgt);
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = S.shake[i] > 0 ? '#ff4d4d' : COLORS[i].hex; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; rr(left - 5, VAT_TOP - 7, VAT_W + 10, 9, 4); ctx.fill(); // rim lip
    // label plate: color + pattern + name + count
    ctx.fillStyle = '#111'; ctx.fillRect(left + 8, VAT_TOP + 6, VAT_W - 16, 22);
    ctx.fillStyle = COLORS[i].hex; ctx.fillRect(left + 10, VAT_TOP + 8, 18, 18); pattern(COLORS[i].pat, left + 10, VAT_TOP + 8, 18, 18);
    text(COLORS[i].name.toUpperCase(), left + 32, VAT_TOP + 17, 10, '#fff', 'left');
    ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(S.vats[i] + '/' + CONFIG.vatMax, x + sh, VAT_TOP + 42);
    text(S.vats[i] + '/' + CONFIG.vatMax, x + sh, VAT_TOP + 42, 14, S.vats[i] >= CONFIG.vatMax ? '#ff8a8a' : '#fff');
  });

  // belt
  ctx.fillStyle = '#555'; ctx.fillRect(0, BELT_Y, W, 12);
  ctx.fillStyle = '#777'; for (let i = ((S.t * 40) % 20); i < W; i += 20) ctx.fillRect(i, BELT_Y + 4, 8, 4);

  // customers
  for (const c of S.customers) {
    const x = SLOT_X[c.slot], dy = c.drop;
    if (c.state !== 'leaving') drawOrder(c, x, 500);
    drawPerson(x, 634 + dy, c.look || (c.look = randomLook(c.vip)), c.vip);
  }
  for (const d of S.drinks) drawDrink(d.x, BELT_Y - 12, d.code, d.total, 0.9);

  // spill particles
  for (const q of S.parts) { ctx.globalAlpha = 1 - q.t / 0.9; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;

  // vials
  const riding = S.vials.filter(v => v.state === 'ride').sort((a, b) => vialRank(b) - vialRank(a));
  riding.forEach(drawVial);
  S.vials.filter(v => v.state !== 'ride').forEach(drawVial);

  // fx
  for (const f of S.fx) { ctx.globalAlpha = 1 - f.t; text(f.text, f.x, f.y - f.t * 30, 14, f.col); }
  ctx.globalAlpha = 1;
}

// ---------- Loop / resize ----------
function resize() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
  canvas.width = W * s * dpr; canvas.height = H * s * dpr;
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  $('wrap').style.width = W * s + 'px';
}
window.addEventListener('resize', resize); resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S && !S.over) update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__dd = { get S() { return S; }, CONFIG, save, randomLook, drawPerson, ctx };
menu();
})();
