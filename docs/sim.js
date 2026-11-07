/*
 * Pueblo Vivo — motor de simulación (fase 1).
 * Lógica pura, sin dibujo: la usan la web (en directo) y la skill (avance sin pantalla).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PuebloSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 2;

  // =====================================================================
  // MAPA: rejilla de casillas de 8x8 píxeles (60 x 34)
  // =====================================================================
  const T = 8, COLS = 60, ROWS = 34, W = COLS * T, H = ROWS * T;
  const GRASS = 0, PATH = 1, ROAD = 2, PLAZA = 3, FIELD = 4, BENCH = 6, TREE = 7, WATER = 8, BUILD = 9;
  const grid = new Uint8Array(COLS * ROWS);
  function tileAt(c, r) { return (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? BUILD : grid[r * COLS + c]; }
  function setTile(c, r, v) { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) grid[r * COLS + c] = v; }
  function fillTiles(c, r, w, h, v) { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) setTile(x, y, v); }

  // Edificios en casillas: c, r = esquina superior izquierda; la puerta está en el centro del lado de abajo
  const BUILDINGS = [
    { id: 'h0', type: 'casa', c: 1, r: 3, w: 5, h: 4 },
    { id: 'h1', type: 'casa', c: 8, r: 2, w: 5, h: 4 },
    { id: 'h2', type: 'casa', c: 20, r: 3, w: 5, h: 4 },
    { id: 'h3', type: 'casa', c: 37, r: 3, w: 5, h: 4 },
    { id: 'h4', type: 'casa', c: 46, r: 2, w: 5, h: 4 },
    { id: 'h5', type: 'casa', c: 52, r: 3, w: 5, h: 4 },
    { id: 'h6', type: 'casa', c: 32, r: 12, w: 5, h: 4 },
    { id: 'h7', type: 'casa', c: 55, r: 12, w: 5, h: 4 },
    { id: 'h11', type: 'casa', c: 5, r: 12, w: 5, h: 4 },
    { id: 'h8', type: 'casa', c: 2, r: 22, w: 5, h: 4 },
    { id: 'h9', type: 'casa', c: 9, r: 22, w: 5, h: 4 },
    { id: 'h10', type: 'casa', c: 16, r: 23, w: 5, h: 4 },
    { id: 'iglesia', type: 'iglesia', name: 'la iglesia', c: 27, r: 1, w: 7, h: 9 },
    { id: 'bar', type: 'bar', name: 'el bar', c: 11, r: 12, w: 7, h: 5 },
    { id: 'panaderia', type: 'panaderia', name: 'la panadería', c: 41, r: 12, w: 7, h: 5 }
  ];
  const ROAD_ROWS = [19, 20];
  const LANE_ROW = 28;
  const PLAZA_T = { c: 24, r: 21, w: 12, h: 8 };
  const FIELD_T = { c: 40, r: 23, w: 19, h: 9 };
  const FOUNTAIN_T = { c: 29, r: 24, w: 2, h: 2 };
  const BENCHES_T = [[25, 23], [33, 23], [25, 27], [33, 27]]; // 2 casillas de ancho
  const STALL_COLS = [24, 27, 30, 33];                       // puestos del mercado (fila 21, 2 de ancho)
  const STALL_ROW = 21;

  function buildMap() {
    grid.fill(GRASS);
    // carretera principal
    ROAD_ROWS.forEach(function (r) { fillTiles(0, r, COLS, 1, ROAD); });
    // plaza, huerta y calle de abajo
    fillTiles(PLAZA_T.c, PLAZA_T.r, PLAZA_T.w, PLAZA_T.h, PLAZA);
    fillTiles(FIELD_T.c, FIELD_T.r, FIELD_T.w, FIELD_T.h, FIELD);
    fillTiles(1, LANE_ROW, PLAZA_T.c - 1, 1, PATH);
    fillTiles(7, 21, 1, LANE_ROW - 21, PATH);        // callejón entre la carretera y la calle de abajo
    fillTiles(PLAZA_T.c + PLAZA_T.w, 25, FIELD_T.c - PLAZA_T.c - PLAZA_T.w, 1, PATH); // plaza -> huerta
    fillTiles(49, 21, 1, FIELD_T.r - 21, PATH);      // carretera -> huerta
    // edificios y caminos rectos desde cada puerta
    BUILDINGS.forEach(function (b) {
      fillTiles(b.c, b.r, b.w, b.h, BUILD);
      b.dc = b.c + Math.floor(b.w / 2); b.dr = b.r + b.h;
      b.x = b.c * T; b.y = b.r * T; b.pw = b.w * T; b.ph = b.h * T;
      b.door = { x: b.dc * T + T / 2, y: b.dr * T + T / 2 };
    });
    BUILDINGS.forEach(function (b) {
      const below = b.dr > ROAD_ROWS[1];
      const end = below ? LANE_ROW - 1 : ROAD_ROWS[0] - 1;
      for (let r = b.dr; r <= end; r++) {
        if (tileAt(b.dc, r) === BUILD) throw new Error('Camino de ' + b.id + ' cruza un edificio en ' + b.dc + ',' + r);
        setTile(b.dc, r, PATH);
      }
    });
    // fuente y bancos
    fillTiles(FOUNTAIN_T.c, FOUNTAIN_T.r, FOUNTAIN_T.w, FOUNTAIN_T.h, WATER);
    BENCHES_T.forEach(function (p) { fillTiles(p[0], p[1], 2, 1, BENCH); });
    // árboles: solo en hierba rodeada de hierba, con separación entre ellos
    const rng = seededRng(2026);
    const trees = [];
    for (let i = 0; i < 3000 && trees.length < 46; i++) {
      const c = Math.floor(rng() * COLS), r = 1 + Math.floor(rng() * (ROWS - 1));
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
        const t = tileAt(c + dx, r + dy);
        if (t !== GRASS && !(c + dx < 0 || c + dx >= COLS || r + dy >= ROWS)) ok = false;
      }
      if (!ok) continue;
      if (trees.some(function (t) { return Math.abs(t[0] - c) < 3 && Math.abs(t[1] - r) < 3; })) continue;
      trees.push([c, r]);
    }
    trees.forEach(function (t) { setTile(t[0], t[1], TREE); });
    return trees;
  }
  function seededRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const TREES = buildMap();
  const BY_ID = {}; BUILDINGS.forEach(function (b) { BY_ID[b.id] = b; });
  function building(id) { return BY_ID[id]; }
  const ENTRY = { c: COLS - 1, r: ROAD_ROWS[0] };

  // ---------- Búsqueda de rutas (A*, 8 direcciones, sin cortar esquinas) ----------
  function isStall(c, r) { return r === STALL_ROW && STALL_COLS.some(function (s) { return c === s || c === s + 1; }); }
  function stepCost(S, c, r) {
    const t = tileAt(c, r);
    if (t === PATH || t === ROAD) return 1;
    if (t === PLAZA) return (S && isMarket(S) && isStall(c, r)) ? Infinity : 1;
    if (t === FIELD) return 1.8;
    if (t === GRASS) return 2.6;
    return Infinity;
  }
  function passable(S, c, r) { return stepCost(S, c, r) < Infinity; }

  function findPath(S, c0, r0, c1, r1) {
    const N = COLS * ROWS, start = r0 * COLS + c0, goal = r1 * COLS + c1;
    if (start === goal) return [];
    const g = new Float32Array(N), came = new Int32Array(N), closed = new Uint8Array(N);
    g.fill(Infinity); came.fill(-1);
    const hp = [], hf = [];
    function push(i, f) {
      hp.push(i); hf.push(f); let k = hp.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; swap(k, p); k = p; }
    }
    function pop() {
      const top = hp[0], lastI = hp.pop(), lastF = hf.pop();
      if (hp.length) {
        hp[0] = lastI; hf[0] = lastF; let k = 0;
        for (;;) {
          const a = 2 * k + 1, b = a + 1; let m = k;
          if (a < hp.length && hf[a] < hf[m]) m = a;
          if (b < hp.length && hf[b] < hf[m]) m = b;
          if (m === k) break; swap(k, m); k = m;
        }
      }
      return top;
    }
    function swap(a, b) { let t = hp[a]; hp[a] = hp[b]; hp[b] = t; t = hf[a]; hf[a] = hf[b]; hf[b] = t; }
    function hcost(c, r) { const dx = Math.abs(c - c1), dy = Math.abs(r - r1); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); }
    g[start] = 0; push(start, hcost(c0, r0));
    let iter = 0;
    while (hp.length && iter++ < 6000) {
      const cur = pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % COLS, cr = (cur - cc) / COLS;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nc = cc + dx, nr = cr + dy;
        const sc = stepCost(S, nc, nr);
        if (sc === Infinity) continue;
        if (dx && dy && (!passable(S, cc + dx, cr) || !passable(S, cc, cr + dy))) continue;
        const ni = nr * COLS + nc;
        if (closed[ni]) continue;
        const ng = g[cur] + sc * (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ni, ng + hcost(nc, nr)); }
      }
    }
    if (came[goal] < 0) return null;
    const out = [];
    for (let i = goal; i !== start; i = came[i]) out.push(i);
    out.reverse();
    // nos quedamos con los puntos donde cambia la dirección
    const pts = [];
    let pc = c0, pr = r0, pdx = 0, pdy = 0;
    out.forEach(function (i, k) {
      const c = i % COLS, r = (i - c) / COLS, dx = c - pc, dy = r - pr;
      if (k > 0 && (dx !== pdx || dy !== pdy)) pts.push({ x: pc * T + T / 2, y: pr * T + T / 2 });
      pdx = dx; pdy = dy; pc = c; pr = r;
    });
    pts.push({ x: c1 * T + T / 2, y: r1 * T + T / 2 });
    return pts;
  }

  // =====================================================================
  // DATOS DEL PUEBLO
  // =====================================================================
  const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DAY = 1440;
  const TRAITS = {
    alegre: { soc: 1.3, aff: 3 }, gruñón: { soc: 0.8, aff: -4 }, cotilla: { soc: 1.5, aff: 0 },
    tímido: { soc: 0.6, aff: 1 }, romántico: { soc: 1.1, aff: 2 }, trabajador: { soc: 0.9, aff: 0 },
    juerguista: { soc: 1.4, aff: 1 }, ahorrador: { soc: 1.0, aff: 0 }, religioso: { soc: 1.0, aff: 1 }
  };
  const ALL_TRAITS = Object.keys(TRAITS);
  const STRANGER_NAMES = [
    ['Álvaro', 'm'], ['Nuria', 'f'], ['Rubén', 'm'], ['Inés', 'f'], ['Sergio', 'm'], ['Marisa', 'f'],
    ['Jesús', 'm'], ['Alba', 'f'], ['Raúl', 'm'], ['Celia', 'f'], ['Hugo', 'm'], ['Noelia', 'f']
  ];
  const STRANGER_JOBS = ['agricultor', 'costurero', 'jubilado', 'agricultor', 'panadero'];
  const PRICES = { pan: 1.5, cana: 2, mercado: 4, factura: 25, pension: 90, sueldo: 25, prestamo: 60, loteria: 2000, reforma: 450 };

  // ---------- Utilidades ----------
  function rnd(S) {
    let t = (S.rng = (S.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(S, arr) { return arr[Math.floor(rnd(S) * arr.length)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function relKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function getRel(S, a, b) { const r = S.rel[relKey(a, b)]; return r === undefined ? 0 : r; }
  function setRel(S, a, b, v) { S.rel[relKey(a, b)] = clamp(Math.round(v), -100, 100); }
  function addRel(S, a, b, d) { setRel(S, a, b, getRel(S, a, b) + d); }
  function byId(S, id) { return S.villagers.find(function (v) { return v.id === id; }); }
  function hourOf(S) { return (S.time % DAY) / 60; }
  function dayOf(S) { return Math.floor(S.time / DAY) + 1; }
  function wdOf(S) { return (dayOf(S) - 1) % 7; }
  function weekdayOf(S) { return WEEKDAYS[wdOf(S)]; }
  function isAdult(v) { return v.age >= 18; }
  function soc(v) { return v.traits.reduce(function (m, t) { return m * (TRAITS[t] ? TRAITS[t].soc : 1); }, 1); }
  function has(v, t) { return v.traits.indexOf(t) >= 0; }
  function fem(v) { return v.sex === 'f'; }
  function g(v, m, f) { return fem(v) ? f : m; }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function euros(n) { n = Math.round(n); return (n >= 1000 ? n.toLocaleString('es-ES') : String(n)) + ' euros'; }
  function adults(S) { return S.villagers.filter(isAdult); }
  function isMarket(S) { const h = hourOf(S); return wdOf(S) === 5 && h >= 9 && h < 14; }
  function remember(v, k, o, a, t) {
    v.mem = v.mem || [];
    v.mem.push({ k: k, o: o, a: a || 0, t: t });
    if (v.mem.length > 6) v.mem.shift();
  }
  function memOf(v, k, o) { return (v.mem || []).find(function (m) { return m.k === k && (!o || m.o === o); }); }
  function forget(v, k, o) { v.mem = (v.mem || []).filter(function (m) { return !(m.k === k && m.o === o); }); }

  // ---------- Creación del mundo ----------
  function V(id, name, sex, age, job, traits, home, money, look) {
    const b = building(home);
    return {
      id: id, name: name, sex: sex, age: age, job: job, traits: traits, home: home, money: money,
      partner: null, married: false, crush: null, stock: 0, mem: [], look: look,
      needs: { hunger: 20, energy: 80, social: 30 },
      x: b.door.x, y: b.door.y, path: [], inside: home, act: 'dormir', actPlace: home, actUntil: 0,
      bubble: null, offset: (id.charCodeAt(0) * 7 + id.length * 13) % 40 - 20, days: {}
    };
  }

  function createWorld(seed) {
    const S = {
      v: VERSION, seed: seed || 12345, rng: seed || 12345,
      time: 7 * 60 + 30,
      weather: 'sol', weatherUntil: 12 * 60,
      fiestaUntil: 0, blessUntil: 0, rondaUntil: 0, harvest: 55,
      biz: { panaderia: { owner: 'paco', price: PRICES.pan }, bar: { owner: 'manolo', price: PRICES.cana } },
      houses: {}, debts: [], flags: {},
      villagers: [], rel: {}, events: [], nextId: 100
    };
    BUILDINGS.forEach(function (b) { if (b.type === 'casa') S.houses[b.id] = 0; });
    const L = function (skin, hair, shirt, pants) { return { skin: skin, hair: hair, shirt: shirt, pants: pants }; };
    S.villagers = [
      V('paco', 'Paco', 'm', 52, 'panadero', ['trabajador', 'gruñón'], 'h0', 380, L('#e8b48a', '#3b2a20', '#f2efe6', '#4a4f6a')),
      V('carmen', 'Carmen', 'f', 51, 'costurero', ['cotilla', 'alegre'], 'h0', 120, L('#f0c29a', '#5a2e1c', '#c0504d', '#3a3a52')),
      V('dani', 'Dani', 'm', 12, 'niño', ['alegre'], 'h0', 0, L('#f0c29a', '#3b2a20', '#4f86c6', '#2f3a55')),
      V('lucia', 'Lucía', 'f', 29, 'agricultor', ['romántico', 'tímido'], 'h1', 170, L('#e8b48a', '#a0522d', '#6aa84f', '#5b4636')),
      V('manolo', 'Manolo', 'm', 60, 'tabernero', ['juerguista', 'cotilla'], 'h2', 520, L('#d9a07a', '#9a9a9a', '#ffffff', '#222233')),
      V('pili', 'Pili', 'f', 58, 'costurero', ['alegre'], 'h2', 140, L('#f0c29a', '#2a1a14', '#8e5ea2', '#3a3a52')),
      V('quique', 'Quique', 'm', 27, 'tabernero', ['juerguista', 'romántico'], 'h2', 45, L('#e8b48a', '#2a1a14', '#e69138', '#2f3a55')),
      V('julian', 'Don Julián', 'm', 67, 'cura', ['religioso', 'tímido'], 'h3', 110, L('#f0c29a', '#bdbdbd', '#1d1d24', '#1d1d24')),
      V('javi', 'Javi', 'm', 31, 'agricultor', ['juerguista', 'romántico'], 'h4', 35, L('#c98d63', '#2a1a14', '#3d85c6', '#5b4636')),
      V('remedios', 'Remedios', 'f', 84, 'jubilado', ['cotilla', 'gruñón', 'religioso'], 'h5', 650, L('#f0c29a', '#e6e6e6', '#2b2b2b', '#2b2b2b')),
      V('sara', 'Sara', 'f', 9, 'niño', ['alegre', 'tímido'], 'h5', 0, L('#f0c29a', '#d4a017', '#ff8fb1', '#3a3a52')),
      V('irene', 'Irene', 'f', 26, 'costurero', ['juerguista', 'romántico'], 'h6', 55, L('#e8b48a', '#2a1a14', '#f6b26b', '#2f3a55')),
      V('elena', 'Elena', 'f', 35, 'costurero', ['tímido', 'romántico'], 'h7', 160, L('#f0c29a', '#111111', '#76a5af', '#3a3a52')),
      V('tomas', 'Tomás', 'm', 73, 'jubilado', ['gruñón', 'ahorrador'], 'h11', 1300, L('#e8b48a', '#cccccc', '#7f6000', '#3a3a52')),
      V('antonio', 'Antonio', 'm', 45, 'agricultor', ['trabajador', 'ahorrador'], 'h8', 420, L('#c98d63', '#3b2a20', '#93a35a', '#5b4636')),
      V('rosa', 'Rosa', 'f', 43, 'costurero', ['alegre', 'religioso'], 'h8', 130, L('#e8b48a', '#7a3b1c', '#e06666', '#3a3a52')),
      V('marta', 'Marta', 'f', 16, 'niño', ['romántico', 'juerguista'], 'h8', 0, L('#e8b48a', '#7a3b1c', '#9fc5e8', '#2f3a55')),
      V('lola', 'Lola', 'f', 38, 'agricultor', ['trabajador', 'alegre'], 'h9', 210, L('#c98d63', '#2a1a14', '#b6d7a8', '#5b4636')),
      V('fermin', 'Fermín', 'm', 41, 'agricultor', ['ahorrador', 'gruñón'], 'h9', 330, L('#d9a07a', '#3b2a20', '#a2c4c9', '#5b4636')),
      V('puri', 'Puri', 'f', 70, 'jubilado', ['cotilla', 'alegre'], 'h10', 380, L('#f0c29a', '#d9d2e9', '#674ea7', '#3a3a52')),
      V('nico', 'Nico', 'm', 24, 'panadero', ['romántico', 'tímido'], 'h10', 60, L('#f0c29a', '#a0522d', '#ffe599', '#4a4f6a'))
    ];
    const ids = S.villagers.map(function (v) { return v.id; });
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) setRel(S, ids[i], ids[j], Math.floor(rnd(S) * 30) - 10);
    S.villagers.forEach(function (a) { S.villagers.forEach(function (b) { if (a.id < b.id && a.home === b.home) setRel(S, a.id, b.id, 60); }); });
    marry(S, 'paco', 'carmen'); marry(S, 'manolo', 'pili'); marry(S, 'antonio', 'rosa'); marry(S, 'lola', 'fermin');
    setRel(S, 'paco', 'manolo', -25);     // rivalidad de toda la vida
    setRel(S, 'fermin', 'antonio', -20);  // pleito por una linde
    setRel(S, 'puri', 'remedios', -15);   // dos cotillas, un solo pueblo
    setRel(S, 'lucia', 'javi', 35);
    setRel(S, 'irene', 'quique', 30);
    setRel(S, 'nico', 'elena', 38);
    setRel(S, 'remedios', 'tomas', -15);
    S.villagers.forEach(function (v) { decide(S, v, true); });
    return S;
  }
  function marry(S, a, b) { const A = byId(S, a), B = byId(S, b); A.partner = b; B.partner = a; A.married = B.married = true; setRel(S, a, b, 80); }

  // ---------- Eventos ----------
  function log(S, text, short, imp, who, extra) {
    const e = { t: Math.round(S.time), text: text, short: short || capital(text), imp: imp || 1, who: who || [] };
    if (extra) for (const k in extra) e[k] = extra[k];
    S.events.push(e);
    if (S.events.length > 120) S.events.splice(0, S.events.length - 120);
    return e;
  }

  // ---------- Dinero ----------
  function pay(S, from, toId, amt) {
    if (!from || from.money < amt) return false;
    from.money -= amt;
    const to = toId && byId(S, toId);
    if (to) to.money += amt;
    return true;
  }

  // =====================================================================
  // DECISIONES
  // =====================================================================
  function randomTile(S, rect, ok) {
    for (let k = 0; k < 30; k++) {
      const c = rect.c + Math.floor(rnd(S) * rect.w), r = rect.r + Math.floor(rnd(S) * rect.h);
      if (ok(c, r)) return { c: c, r: r };
    }
    return { c: rect.c + 1, r: rect.r + rect.h - 1 };
  }
  function placeTile(S, place, v) {
    if (place === 'plaza') return randomTile(S, PLAZA_T, function (c, r) { return tileAt(c, r) === PLAZA && !(isMarket(S) && isStall(c, r)) && r !== STALL_ROW + 1; });
    if (place === 'campo') return randomTile(S, FIELD_T, function (c, r) { return tileAt(c, r) === FIELD; });
    if (place === 'puesto') {
      const sellers = S.villagers.filter(function (o) { return o.job === 'agricultor' && isAdult(o); });
      const i = Math.max(0, sellers.indexOf(v));
      return { c: STALL_COLS[i % STALL_COLS.length] + (i >= STALL_COLS.length ? 1 : 0), r: STALL_ROW + 1 };
    }
    const b = building(place);
    return { c: b.dc, r: b.dr };
  }
  function isIndoor(place) { return place !== 'plaza' && place !== 'campo' && place !== 'puesto'; }

  function desired(S, v) {
    const h = hourOf(S), wd = wdOf(S), day = dayOf(S), rain = S.weather === 'lluvia';
    const o = v.offset / 60;
    const sleepStart = (v.age < 14 ? 21.5 : v.age > 70 ? 22 : has(v, 'juerguista') ? 24.5 : 23.3) + o;
    const wake = (v.age > 70 ? 7 : 7.5) + o;
    const hh = h < 5 ? h + 24 : h;
    if (hh >= sleepStart || h < wake) return { act: 'dormir', place: v.home, dur: 30 };
    if (S.time < S.fiestaUntil) return { act: 'fiesta', place: 'plaza', dur: 30 };
    if (S.time < S.rondaUntil && isAdult(v)) return { act: 'tomar algo', place: 'bar', dur: 40, free: true };
    if (wd === 6 && h >= 12 && h < 13 && (has(v, 'religioso') || v.job === 'cura' || rnd(S) < 0.3)) return { act: 'misa', place: 'iglesia', dur: 60 };
    // el pan de cada mañana
    if (isAdult(v) && h >= 8.5 && h < 11.5 && v.days.pan !== day && v.job !== 'panadero' && rnd(S) < 0.5) return { act: 'comprar pan', place: 'panaderia', dur: 15, buy: 'pan' };
    if (v.needs.hunger > 80) return { act: 'comer', place: v.home, dur: 40 };
    if (h >= 14 && h < 16.5 + o) return { act: h < 15 ? 'comer' : 'siesta', place: v.home, dur: 40 };
    // mercado de los sábados
    if (isMarket(S)) {
      if (v.job === 'agricultor' && isAdult(v)) return { act: 'vender', place: 'puesto', dur: 60 };
      if (v.days.mercado !== day && v.money > 10 && rnd(S) < 0.5) return { act: 'comprar', place: 'plaza', dur: 30, buy: 'mercado' };
    }
    const work = (h >= 9 && h < 14) || (h >= 17 && h < 20);
    if (work && wd < 6) {
      if (v.job === 'panadero') return { act: 'trabajar', place: 'panaderia', dur: 60 };
      if (v.job === 'tabernero') return { act: 'trabajar', place: 'bar', dur: 60 };
      if (v.job === 'cura') return { act: 'trabajar', place: 'iglesia', dur: 60 };
      if (v.job === 'agricultor') return rain ? { act: 'descansar', place: v.home, dur: 60 } : { act: 'trabajar', place: 'campo', dur: 50 };
      if (v.job === 'costurero') return { act: 'coser', place: v.home, dur: 60 };
      if (v.job === 'niño' && h < 14) return rain ? { act: 'jugar', place: v.home, dur: 60 } : { act: 'jugar', place: 'plaza', dur: 40 };
    }
    if (v.job === 'tabernero' && h >= 20) return { act: 'trabajar', place: 'bar', dur: 60 };
    // tiempo libre: si hay alguien que le gusta, va a donde suele estar
    const crush = v.crush && byId(S, v.crush);
    if (crush && !crush.inside && crush.act !== 'dormir' && rnd(S) < 0.35) {
      if (crush.actPlace === 'bar' && isAdult(v) && v.money >= S.biz.bar.price) return { act: 'tomar algo', place: 'bar', dur: 45, buy: 'bar' };
      return { act: 'pasear', place: 'plaza', dur: 30 };
    }
    const wantSocial = v.needs.social > 50 || rnd(S) < 0.4 * soc(v);
    if (wantSocial) {
      const bar = S.biz.bar.price;
      if (rain) return isAdult(v) && v.money >= bar ? { act: 'charlar', place: 'bar', dur: 45, buy: 'bar' } : { act: 'descansar', place: v.home, dur: 45 };
      if (isAdult(v) && h >= 19 && v.money >= bar && (has(v, 'juerguista') || rnd(S) < 0.4)) return { act: 'tomar algo', place: 'bar', dur: 60, buy: 'bar' };
      return { act: 'pasear', place: 'plaza', dur: 30 };
    }
    return { act: 'descansar', place: rain || rnd(S) < 0.5 ? v.home : 'plaza', dur: 40 };
  }

  function spend(S, v, d) {
    const day = dayOf(S);
    if (d.buy === 'pan') {
      v.days.pan = day;
      if (S.flags.sinPan === day) return;
      const p = S.biz.panaderia;
      if (!pay(S, v, p.owner, p.price)) v.days.sinPan = day;
      else { v.needs.hunger = clamp(v.needs.hunger - 10, 0, 100); p.sales = (p.sales || 0) + 1; }
    } else if (d.buy === 'bar') {
      const b = S.biz.bar;
      if (pay(S, v, b.owner, b.price)) b.sales = (b.sales || 0) + 1;
    } else if (d.buy === 'mercado') {
      v.days.mercado = day;
      const sellers = S.villagers.filter(function (o) { return o.job === 'agricultor' && isAdult(o) && o.id !== v.id; });
      if (sellers.length) pay(S, v, pick(S, sellers).id, PRICES.mercado);
    }
  }

  function decide(S, v, teleport) {
    const d = desired(S, v);
    if (d.buy && (v.act !== d.act || v.actPlace !== d.place)) spend(S, v, d);
    if (d.act === 'misa' && v.act !== 'misa' && v.job !== 'cura' && isAdult(v) && v.money > 5) {
      const cura = S.villagers.find(function (o) { return o.job === 'cura'; });
      if (cura) pay(S, v, cura.id, 1);
    }
    if (d.act === 'vender' && v.days.vendio !== dayOf(S)) {
      v.days.vendio = dayOf(S);
      v.money += v.stock * 6; v.stock = 0;
    }
    v.act = d.act; v.actPlace = d.place; v.actUntil = S.time + d.dur + Math.floor(rnd(S) * 15);
    const p = placeTile(S, d.place, v);
    const px = { x: p.c * T + T / 2, y: p.r * T + T / 2 };
    if (teleport) {
      v.x = px.x; v.y = px.y; v.path = []; v.inside = isIndoor(d.place) ? d.place : null;
      return;
    }
    if (v.inside === d.place) { v.path = []; return; }
    if (v.inside) { const b = building(v.inside); v.x = b.door.x; v.y = b.door.y; v.inside = null; }
    const c0 = Math.floor(v.x / T), r0 = Math.floor(v.y / T);
    const route = findPath(S, c0, r0, p.c, p.r);
    if (route) v.path = route;
    else { v.x = px.x; v.y = px.y; v.path = []; if (isIndoor(d.place)) v.inside = d.place; }
  }

  // =====================================================================
  // PASO DEL TIEMPO
  // =====================================================================
  const SPEED = 16; // píxeles por minuto de juego

  function step(S, dt) {
    while (dt > 0) { const d = Math.min(dt, 2); tick(S, d, false); dt -= d; }
  }

  function tick(S, d, coarse) {
    const before = S.time;
    S.time += d;
    weatherTick(S);
    if (isMarket(S) && S.flags.mercado !== dayOf(S)) marketOpens(S);
    S.villagers.forEach(function (v) {
      const sleeping = v.inside === v.home && (v.act === 'dormir' || v.act === 'siesta');
      v.needs.hunger = clamp(v.needs.hunger + 0.07 * d, 0, 100);
      v.needs.energy = clamp(v.needs.energy + (sleeping ? 0.2 : -0.05) * d, 0, 100);
      v.needs.social = clamp(v.needs.social + 0.05 * d / soc(v), 0, 100);
      if (v.inside && v.act === 'comer') v.needs.hunger = clamp(v.needs.hunger - 2.5 * d, 0, 100);
      if (v.act === 'fiesta') v.needs.social = clamp(v.needs.social - 0.5 * d, 0, 100);
      // trabajo
      if (v.act === 'trabajar' || v.act === 'coser' || v.act === 'vender') v.days.trabajo = dayOf(S);
      if (v.act === 'coser') v.money += 2 / 60 * d;
      if (v.act === 'trabajar' && v.actPlace === 'campo') v.stock += S.harvest / 100 / 60 * d;
      if (v.bubble && S.time > v.bubble.until) v.bubble = null;

      if (coarse) { if (S.time >= v.actUntil) decide(S, v, true); return; }
      if (v.path.length) {
        const tgt = v.path[0];
        const dx = tgt.x - v.x, dy = tgt.y - v.y, dist = Math.hypot(dx, dy), mv = SPEED * d;
        if (dist <= mv) {
          v.x = tgt.x; v.y = tgt.y; v.path.shift();
          if (!v.path.length && isIndoor(v.actPlace)) v.inside = v.actPlace;
        } else { v.x += dx / dist * mv; v.y += dy / dist * mv; }
      } else if (S.time >= v.actUntil) {
        decide(S, v, false);
      } else if (!v.inside && (v.act === 'pasear' || v.act === 'fiesta' || v.act === 'jugar' || v.act === 'comprar') && rnd(S) < 0.02 * d) {
        wander(S, v, 'plaza');
      } else if (!v.inside && v.act === 'trabajar' && v.actPlace === 'campo' && rnd(S) < 0.01 * d) {
        wander(S, v, 'campo');
      }
    });
    if (Math.floor(S.time / 5) !== Math.floor(before / 5)) socialTick(S, coarse);
    if (Math.floor(S.time / DAY) !== Math.floor(before / DAY)) newDay(S);
  }

  function wander(S, v, place) {
    const p = placeTile(S, place, v);
    const route = findPath(S, Math.floor(v.x / T), Math.floor(v.y / T), p.c, p.r);
    if (route) v.path = route;
  }

  function weatherTick(S) {
    if (S.time < S.weatherUntil) return;
    const r = rnd(S), prev = S.weather;
    S.weather = r < 0.12 ? 'lluvia' : r < 0.35 ? 'nubes' : 'sol';
    S.weatherUntil = S.time + 120 + Math.floor(rnd(S) * 240);
    if (S.weather === 'lluvia' && prev !== 'lluvia') {
      S.harvest = clamp(S.harvest + 6, 0, 100);
      log(S, 'llovió el ' + weekdayOf(S), 'Empieza a llover', 1);
    }
  }

  function marketOpens(S) {
    S.flags.mercado = dayOf(S);
    if (S.harvest >= 75) log(S, 'el mercado del sábado fue de los buenos: con lo bien que viene la cosecha, los agricultores lo vendieron todo', '🍅 Mercado a rebosar', 2);
    else if (S.harvest < 30) log(S, 'en el mercado del sábado apenas había fruta, y los agricultores volvieron a casa con mala cara', '🥀 Mercado flojo', 2);
    else log(S, 'hubo mercado en la plaza', '🧺 Mercado en la plaza', 1);
  }

  // =====================================================================
  // CADA DÍA A MEDIANOCHE
  // =====================================================================
  function newDay(S) {
    const day = dayOf(S), wd = wdOf(S), yesterday = day - 1;
    if (day % 7 === 1) S.villagers.forEach(function (v) { v.age += 1; if (v.job === 'niño' && v.age >= 18) comeOfAge(S, v); });
    if (rnd(S) < 0.75) dailyStory(S, day);
    // el campo: el sol seca, la bendición protege
    if (S.time > S.blessUntil) S.harvest = clamp(S.harvest - (S.weather === 'lluvia' ? 0 : 3), 0, 100);
    if (S.harvest < 25 && !S.flags.sequia) { S.flags.sequia = day; log(S, 'la sequía empieza a preocupar en el campo: sin lluvia, la cosecha se pierde', '☀️ Sequía en el campo', 3); }
    if (S.harvest > 45) S.flags.sequia = 0;
    if (S.harvest > 85 && rnd(S) < 0.3) log(S, 'la cosecha está siendo de las buenas', 'Buena cosecha este año', 2);
    // sueldos de los empleados del bar y la panadería
    [['panaderia', 'panadero'], ['bar', 'tabernero']].forEach(function (pair) {
      const biz = S.biz[pair[0]], owner = byId(S, biz.owner);
      S.villagers.forEach(function (v) {
        if (v.job !== pair[1] || v.id === biz.owner || v.days.trabajo !== yesterday) return;
        if (owner && pay(S, owner, v.id, PRICES.sueldo)) return;
        if (owner && !memOf(v, 'impago', owner.id)) {
          remember(v, 'impago', owner.id, PRICES.sueldo, S.time); addRel(S, v.id, owner.id, -10);
          log(S, owner.name + ' no ha podido pagarle el jornal a ' + v.name + ', y ' + g(v, 'él', 'ella') + ' anda ' + g(v, 'mosqueado', 'mosqueada'), '💸 ' + owner.name + ' no paga a ' + v.name, 3, [owner.id, v.id]);
        }
      });
    });
    // lunes: pensiones, facturas y precios
    if (wd === 0) {
      S.villagers.forEach(function (v) {
        if (v.job === 'jubilado') v.money += PRICES.pension;
        if (v.job === 'cura') v.money += 60; // la asignación de la diócesis
        if (isAdult(v)) v.money = Math.max(0, v.money - PRICES.factura);
      });
      [['panaderia', 'pan', 0.2], ['bar', 'caña', 0.5]].forEach(function (x) {
        const biz = S.biz[x[0]], owner = byId(S, biz.owner);
        if (owner && owner.money < 150 && biz.price < (x[0] === 'bar' ? 4 : 3)) {
          biz.price = Math.round((biz.price + x[2]) * 100) / 100;
          adults(S).forEach(function (o) { if (o.id !== owner.id) addRel(S, o.id, owner.id, -2); });
          log(S, owner.name + ' ha subido ' + (x[0] === 'bar' ? 'la caña' : 'el pan') + ' a ' + biz.price.toFixed(2).replace('.', ',') + ' euros, y en el pueblo no se habla de otra cosa',
            '💶 Sube ' + (x[0] === 'bar' ? 'la caña' : 'el pan'), 2, [owner.id]);
        }
      });
    }
    debtsTick(S, day);
    S.villagers.forEach(function (v) {
      if (!isAdult(v)) return;
      // apuros: pedir un préstamo
      const owes = S.debts.some(function (dbt) { return dbt.t === v.id; });
      if (v.money < 12 && !owes) askLoan(S, v, day);
      // reformar la casa si sobra el dinero
      const lvl = S.houses[v.home];
      const isHead = S.villagers.filter(function (o) { return o.home === v.home && isAdult(o); })[0] === v;
      if (lvl !== undefined && lvl < 2 && isHead && v.money > 700 && (has(v, 'trabajador') || has(v, 'ahorrador') || memOf(v, 'loteria')) && rnd(S) < 0.3) {
        v.money -= PRICES.reforma; S.houses[v.home] = lvl + 1;
        log(S, v.name + ' ha ' + (lvl === 0 ? 'puesto macetas y arreglado la fachada de su casa' : 'pintado la casa y cambiado la puerta') + ', y ha quedado preciosa',
          '🏡 ' + v.name + ' arregla la casa', 2, [v.id]);
      }
      // los secretos no duran en un pueblo
      const secret = memOf(v, 'loteria');
      if (secret && secret.a === 1 && rnd(S) < 0.3) {
        const gossip = S.villagers.filter(function (o) { return has(o, 'cotilla') && o.id !== v.id; });
        if (gossip.length) {
          const who = pick(S, gossip);
          secret.a = 0;
          adults(S).forEach(function (o) { if (o.id !== v.id) addRel(S, o.id, v.id, -4); });
          log(S, who.name + ' se ha enterado de que a ' + v.name + ' le tocó la lotería y no dijo ni pío. Ya lo sabe todo el pueblo', '🤫 Se descubre el secreto de ' + v.name, 3, [who.id, v.id]);
        }
      }
      v.days = { trabajo: v.days.trabajo };
    });
  }

  function comeOfAge(S, v) {
    const family = S.villagers.filter(function (o) { return o.home === v.home && o !== v && isAdult(o); });
    const jobs = ['agricultor', 'costurero', 'panadero', 'tabernero'];
    v.job = family.length && family[0].job !== 'jubilado' && family[0].job !== 'cura' && rnd(S) < 0.6 ? family[0].job : pick(S, jobs);
    v.money = 30;
    log(S, v.name + ' ya es mayor de edad y empieza a trabajar de ' + jobName(v), '🎓 ' + v.name + ' empieza a trabajar', 2, [v.id]);
  }

  // Un suceso pequeño casi cada día, para que siempre haya algo que contar
  function dailyStory(S, day) {
    const ad = adults(S), kids = S.villagers.filter(function (v) { return !isAdult(v); });
    const cot = S.villagers.filter(function (v) { return has(v, 'cotilla'); });
    const opts = [];
    function add(key, fn) { if (!S.flags['s_' + key] || day - S.flags['s_' + key] >= 6) opts.push(function () { S.flags['s_' + key] = day; fn(); }); }
    const crushed = S.villagers.filter(function (v) { return v.crush && byId(S, v.crush) && v.crushOut !== v.crush; });
    if (crushed.length && cot.length) add('rumor', function () {
      const x = pick(S, crushed), y = byId(S, x.crush), gs = cot.filter(function (o) { return o !== x && o !== y; });
      if (!gs.length) return;
      const w = pick(S, gs); x.crushOut = y.id;
      log(S, w.name + ' va contando por todo el pueblo que ' + x.name + ' está ' + g(x, 'colado', 'colada') + ' por ' + y.name, '🗣️ ¡Se sabe lo de ' + x.name + '!', 3, [w.id, x.id, y.id]);
      addRel(S, x.id, w.id, -15);
      if (single(x) && single(y) && getRel(S, x.id, y.id) >= 40) startDating(S, x, y, 'y al final ' + y.name + ' se ha atrevido a dar el paso: ' + x.name + ' y ' + y.name + ' ya salen juntos');
    });
    const baker = byId(S, S.biz.panaderia.owner);
    if (baker) add('pan', function () {
      S.flags.sinPan = day;
      log(S, 'a ' + baker.name + ' se le quemó la hornada y medio pueblo se quedó sin pan', '🔥 Se quema el pan', 2, [baker.id]);
    });
    if (kids.length >= 2) add('moras', function () {
      const a = pick(S, kids), b = pick(S, kids.filter(function (k) { return k !== a; }));
      log(S, a.name + ' y ' + b.name + ' se escaparon al campo a coger moras y volvieron llenos de barro', '🫐 Travesura de ' + a.name + ' y ' + b.name, 2, [a.id, b.id]);
    });
    if (kids.length) add('cristal', function () {
      const k = pick(S, kids), owners = ad.filter(function (o) { return o.home !== k.home; });
      if (!owners.length) return;
      const o = pick(S, owners), parent = ad.find(function (p) { return p.home === k.home; });
      if (parent) addRel(S, parent.id, o.id, -5);
      log(S, k.name + ' le rompió un cristal a ' + o.name + ' con el balón, y ' + o.name + ' ha ido a quejarse a la familia', '⚽ ' + k.name + ' rompe un cristal', 2, [k.id, o.id]);
    });
    const grumpy = ad.filter(function (v) { return has(v, 'gruñón') && v.id !== S.biz.bar.owner; }), barOwner = byId(S, S.biz.bar.owner);
    if (grumpy.length && barOwner) add('queja', function () {
      const x = pick(S, grumpy); addRel(S, x.id, barOwner.id, -6);
      log(S, x.name + ' se ha quejado del ruido que sale del bar de ' + barOwner.name + ' por las noches', '🔊 Quejas por el bar', 2, [x.id, barOwner.id]);
    });
    const kind = ad.filter(function (v) { return has(v, 'alegre') || has(v, 'religioso'); });
    const needy = ad.filter(function (v) { return v.age > 75 || v.money < 20; });
    if (kind.length && needy.length) add('favor', function () {
      const b = pick(S, needy), a = pick(S, kind.filter(function (k) { return k !== b; }));
      if (!a) return;
      addRel(S, a.id, b.id, 8); remember(b, 'favor', a.id, 0, S.time);
      log(S, a.name + ' le hizo la compra a ' + b.name + ' y se quedó un buen rato de charla', '🛒 ' + a.name + ' ayuda a ' + b.name, 2, [a.id, b.id]);
    });
    const spender = ad.filter(function (v) { return (has(v, 'juerguista') || has(v, 'alegre')) && v.money > 300; });
    if (spender.length) add('enciclopedia', function () {
      const x = pick(S, spender); x.money -= 150;
      log(S, 'pasó por el pueblo un vendedor de enciclopedias y ' + x.name + ' le compró la colección entera', '📚 ' + x.name + ' y las enciclopedias', 2, [x.id]);
    });
    if (cot.length >= 2) add('cotillas', function () {
      const a = pick(S, cot), b = pick(S, cot.filter(function (c) { return c !== a; })); addRel(S, a.id, b.id, -5);
      log(S, a.name + ' y ' + b.name + ' se han vuelto a pelear por ver quién se entera antes de las cosas', '🗣️ Pique entre cotillas', 2, [a.id, b.id]);
    });
    if (opts.length) pick(S, opts)();
  }

  function askLoan(S, v, day) {
    if (S.flags['apuro_' + v.id] && day - S.flags['apuro_' + v.id] < 4) return;
    S.flags['apuro_' + v.id] = day;
    const lenders = S.villagers.filter(function (o) { return o.id !== v.id && isAdult(o) && o.money > 150 && getRel(S, v.id, o.id) > 30; })
      .sort(function (a, b) { return getRel(S, v.id, b.id) - getRel(S, v.id, a.id); });
    if (!lenders.length) {
      log(S, v.name + ' anda muy ' + g(v, 'apurado', 'apurada') + ' de dinero y no tiene a quién pedirle', v.name + ' pasa apuros', 2, [v.id]);
      return;
    }
    const l = lenders[0], amt = PRICES.prestamo;
    if (has(l, 'ahorrador') && rnd(S) < 0.5) {
      addRel(S, v.id, l.id, -8); remember(v, 'rencor', l.id, 0, S.time);
      log(S, v.name + ' le pidió dinero a ' + l.name + ', pero ' + l.name + ' le dijo que no. ' + capital(v.name) + ' no se lo perdona', l.name + ' no le presta a ' + v.name, 3, [v.id, l.id]);
      return;
    }
    pay(S, l, v.id, amt);
    S.debts.push({ f: l.id, t: v.id, a: amt, since: day, claimed: 0 });
    remember(v, 'deuda', l.id, amt, S.time); remember(l, 'prestamo', v.id, amt, S.time);
    log(S, v.name + ' le ha pedido ' + euros(amt) + ' prestados a ' + l.name, '🤝 ' + l.name + ' presta a ' + v.name, 2, [v.id, l.id]);
  }

  function debtsTick(S, day) {
    S.debts = S.debts.filter(function (d) {
      const f = byId(S, d.f), t = byId(S, d.t);
      if (!f || !t) return false;
      if (t.money >= d.a + 30) {
        t.money -= d.a; f.money += d.a; addRel(S, f.id, t.id, 6);
        forget(t, 'deuda', f.id); forget(f, 'prestamo', t.id);
        log(S, t.name + ' le ha devuelto a ' + f.name + ' el dinero que le debía', t.name + ' salda su deuda', 2, [t.id, f.id]);
        return false;
      }
      const days = day - d.since;
      if (days >= 5 && !d.claimed) {
        d.claimed = day;
        if (has(f, 'alegre')) {
          log(S, f.name + ' le ha dicho a ' + t.name + ' que no tenga prisa con el dinero', f.name + ' tiene paciencia', 1, [f.id, t.id]);
        } else {
          addRel(S, f.id, t.id, -15);
          log(S, f.name + ' le ha reclamado a ' + t.name + ' los ' + euros(d.a) + ' que le debe, y se oyeron voces hasta en la plaza', '😠 ' + f.name + ' reclama su dinero', 3, [f.id, t.id]);
        }
        return true;
      }
      if (days >= 11) {
        forget(t, 'deuda', f.id); forget(f, 'prestamo', t.id);
        if (has(f, 'alegre') || has(f, 'religioso')) {
          addRel(S, f.id, t.id, 10);
          log(S, f.name + ' le ha perdonado la deuda a ' + t.name + '. «Para eso están los vecinos»', '🙏 ' + f.name + ' perdona la deuda', 3, [f.id, t.id]);
        } else {
          setRel(S, f.id, t.id, Math.min(getRel(S, f.id, t.id), -45));
          remember(f, 'rencor', t.id, d.a, S.time);
          log(S, f.name + ' y ' + t.name + ' han roto relaciones por los ' + euros(d.a) + ' que nunca le devolvió', '💥 ' + f.name + ' y ' + t.name + ', enemigos', 3, [f.id, t.id]);
        }
        return false;
      }
      return true;
    });
  }

  // =====================================================================
  // VIDA SOCIAL
  // =====================================================================
  const LINES = {
    sol: ['¡Qué buen día!', 'Hace un sol de justicia', '¡Vaya calor!'],
    nubes: ['Se está nublando…', 'Hoy no sé qué ponerme'],
    lluvia: ['¡Menudo chaparrón!', 'Esto le viene bien al campo', 'Me he calado entero'],
    fiesta: ['¡Viva el santo!', '¡Qué verbena más buena!', '¿Bailamos?', '¡Otra ronda!'],
    trabajo: ['La cosecha viene bien', 'Hoy no paro', 'Qué cansancio…'],
    general: ['¿Viste el partido?', '¿Qué tal los tuyos?', 'Ayer no pegué ojo', '¿Has probado el pan nuevo?', 'Este pueblo ya no es lo que era'],
    pareja: ['Te he echado de menos', '¿Damos un paseo?', '¿Cenamos juntos?'],
    roce: ['Hmpf.', 'Mira quién viene…', 'No empecemos, ¿eh?'],
    mercado: ['¿A cómo están los tomates?', '¡Qué melones!', 'Póngame un kilo'],
    apuro: ['No llego a fin de mes…', 'Ando sin un duro'],
    crush: ['(Qué guapa/o está hoy…)', '(Hoy se lo digo… o no)']
  };

  function sameSpot(a, b) {
    if (a.inside || b.inside) return a.inside && a.inside === b.inside;
    if (a.path.length || b.path.length) return false;
    return Math.hypot(a.x - b.x, a.y - b.y) < 22;
  }

  function socialTick(S, coarse) {
    const vs = S.villagers;
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const a = vs[i], b = vs[j];
        if (a.act === 'dormir' || b.act === 'dormir') continue;
        const together = coarse ? a.actPlace === b.actPlace : sameSpot(a, b);
        if (!together) continue;
        const p = 0.12 * Math.sqrt(soc(a) * soc(b)) * (S.time < S.fiestaUntil ? 2 : 1);
        if (rnd(S) < p) chat(S, a, b, coarse);
        else if (a.actPlace === 'bar' && b.actPlace === 'bar' && isAdult(a) && isAdult(b) && hourOf(S) >= 19 &&
          a.job !== 'tabernero' && b.job !== 'tabernero' && rnd(S) < 0.03) mus(S, a, b);
      }
    }
  }

  function chat(S, a, b, coarse) {
    const r0 = getRel(S, a.id, b.id);
    let delta = 2 + Math.floor(rnd(S) * 5) - 2;
    a.traits.concat(b.traits).forEach(function (t) { delta += (TRAITS[t] ? TRAITS[t].aff : 0) * 0.5; });
    if (r0 < -30) delta -= 3;
    if (S.time < S.fiestaUntil) delta += 2;
    [[a, b], [b, a]].forEach(function (p) {
      if (memOf(p[0], 'rencor', p[1].id) || memOf(p[0], 'celos', p[1].id)) delta -= 2;
      if (memOf(p[0], 'favor', p[1].id)) delta += 2;
    });
    if (a.partner === b.id) {
      const stressed = a.money < 12 || b.money < 12 || ((has(a, 'gruñón') || has(b, 'gruñón')) && rnd(S) < 0.25);
      delta = stressed ? -(4 + Math.floor(rnd(S) * 4)) : Math.abs(delta) + 1;
    }
    const r1 = clamp(r0 + delta, -100, 100);
    setRel(S, a.id, b.id, r1);
    a.needs.social = clamp(a.needs.social - 15, 0, 100);
    b.needs.social = clamp(b.needs.social - 15, 0, 100);

    if (!coarse) {
      const ctx = r1 < -30 ? 'roce' : a.partner === b.id ? 'pareja' : a.crush === b.id ? 'crush' : S.time < S.fiestaUntil ? 'fiesta'
        : a.act === 'comprar' || a.act === 'vender' ? 'mercado' : a.money < 12 && isAdult(a) ? 'apuro'
          : rnd(S) < 0.35 ? S.weather : a.act === 'trabajar' ? 'trabajo' : 'general';
      let line = pick(S, LINES[ctx] || LINES.general);
      if (ctx === 'crush') line = line.replace('guapa/o', g(b, 'guapo', 'guapa'));
      if (has(a, 'cotilla')) { const gs = gossipAbout(S, a, b); if (gs) line = gs; }
      a.bubble = { text: line, until: S.time + 6 };
      b.bubble = { text: r1 < -30 ? 'Pues vale.' : pick(S, ['¡Ya ves!', 'Anda que…', 'Pues sí', '¡No me digas!', 'Jajaja']), until: S.time + 9, delay: S.time + 3 };
    }
    romance(S, a, b, r0, r1);
  }

  function single(v) { return isAdult(v) && !v.partner && v.job !== 'cura'; }
  function romance(S, a, b, r0, r1) {
    const ageOk = Math.abs(a.age - b.age) <= 15 && isAdult(a) && isAdult(b);
    // flechazo
    [[a, b], [b, a]].forEach(function (p) {
      const x = p[0], y = p[1];
      if (ageOk && single(x) && !x.crush && r0 < 42 && r1 >= 42 && (has(x, 'romántico') || rnd(S) < 0.4)) {
        x.crush = y.id;
        log(S, x.name + ' está ' + g(x, 'colado', 'colada') + ' por ' + y.name + ', aunque no se lo ha dicho a nadie', '💘 A ' + x.name + ' le gusta ' + y.name, 2, [x.id, y.id], { secretFor: y.id });
      }
    });
    const decl = a.crush === b.id ? [a, b] : b.crush === a.id ? [b, a] : null;
    if (decl && ageOk && single(a) && single(b) && r1 >= 52 && rnd(S) < 0.25) {
      const x = decl[0], y = decl[1];
      if (r1 >= 60 || y.crush === x.id || (has(y, 'romántico') && rnd(S) < 0.6)) {
        startDating(S, x, y, x.name + ' se le ha declarado a ' + y.name + ' en la plaza, ¡y ' + y.name + ' le ha dicho que sí!');
      } else {
        x.crush = null; remember(x, 'rechazo', y.id, 0, S.time); addRel(S, x.id, y.id, -6);
        x.bubble = { text: '¿Quieres salir conmigo?', until: S.time + 10 };
        y.bubble = { text: 'Ay… mejor como amigos', until: S.time + 12, delay: S.time + 4 };
        log(S, x.name + ' se le ha declarado a ' + y.name + '… y ' + y.name + ' le ha dicho que mejor como amigos', '💔 Calabazas para ' + x.name, 3, [x.id, y.id]);
      }
    } else if (r0 < 65 && r1 >= 65 && ageOk && single(a) && single(b) &&
      (a.crush === b.id || b.crush === a.id || has(a, 'romántico') || has(b, 'romántico')) && rnd(S) < (a.age > 65 || b.age > 65 ? 0.25 : 0.6)) {
      startDating(S, a, b, a.name + ' y ' + b.name + ' se han hecho novios');
      a.bubble = { text: '¿Quieres salir conmigo?', until: S.time + 10 };
      b.bubble = { text: '¡Sí! ♥', until: S.time + 12, delay: S.time + 4 };
    } else if (a.partner === b.id && !a.married && r1 >= 90 && a.home !== b.home && S.time - (a.since || 0) > DAY * 5 && rnd(S) < 0.3) {
      wedding(S, a, b);
    } else if (a.partner === b.id && !a.married && r1 < 30) {
      a.partner = b.partner = null;
      remember(a, 'rencor', b.id, 0, S.time); remember(b, 'rencor', a.id, 0, S.time);
      log(S, a.name + ' y ' + b.name + ' lo han dejado. Dicen que por dinero, aunque cada uno cuenta una versión', '💔 ' + a.name + ' y ' + b.name + ' lo dejan', 3, [a.id, b.id]);
    } else if (a.partner === b.id && a.married && r0 >= 40 && r1 < 40) {
      log(S, a.name + ' y ' + b.name + ' están pasando una mala racha en el matrimonio', '😶 Mala racha para ' + a.name + ' y ' + b.name, 3, [a.id, b.id]);
    } else if (r0 > -40 && r1 <= -40) {
      log(S, a.name + ' y ' + b.name + ' han tenido una buena bronca y ya no se hablan', a.name + ' y ' + b.name + ' han discutido', 3, [a.id, b.id]);
    } else if (r0 < 50 && r1 >= 50 && a.partner !== b.id && a.home !== b.home) {
      if (isAdult(a) && isAdult(b)) log(S, a.name + ' y ' + b.name + ' se han hecho muy amigos', a.name + ' y ' + b.name + ', inseparables', 1, [a.id, b.id]);
    }
  }

  function startDating(S, a, b, text) {
    a.partner = b.id; b.partner = a.id; a.since = b.since = S.time; a.crush = b.crush = null;
    forget(a, 'rechazo', b.id); forget(b, 'rechazo', a.id);
    log(S, text, '💕 ' + a.name + ' y ' + b.name + ' son novios', 3, [a.id, b.id]);
    // celos de quien estaba colado por alguno de los dos
    S.villagers.forEach(function (x) {
      if (x.crush !== a.id && x.crush !== b.id) return;
      const loved = byId(S, x.crush), rival = loved === a ? b : a;
      x.crush = null; remember(x, 'celos', rival.id, 0, S.time); addRel(S, x.id, rival.id, -20);
      log(S, x.name + ' no lleva nada bien que ' + loved.name + ' salga con ' + rival.name, '💔 ' + x.name + ' se queda con las ganas', 3, [x.id, loved.id, rival.id]);
    });
  }

  function mus(S, a, b) {
    const win = rnd(S) < 0.5 ? a : b, lose = win === a ? b : a;
    const stake = Math.min(Math.floor(lose.money), 5 + Math.floor(rnd(S) * 16));
    if (stake < 3) return;
    lose.money -= stake; win.money += stake;
    win.bubble = { text: '¡Órdago!', until: S.time + 8 };
    if (stake >= 16 && ((has(lose, 'gruñón') && rnd(S) < 0.5) || lose.money < 10)) {
      addRel(S, a.id, b.id, -15); remember(lose, 'rencor', win.id, stake, S.time);
      log(S, 'la partida de mus entre ' + win.name + ' y ' + lose.name + ' acabó en bronca: ' + lose.name + ' perdió ' + euros(stake) + ' y dice que hubo trampa', '🃏 Bronca en el mus', 3, [win.id, lose.id]);
    } else {
      log(S, win.name + ' le ganó ' + euros(stake) + ' a ' + lose.name + ' al mus', '🃏 ' + win.name + ' gana al mus', 1, [win.id, lose.id]);
    }
  }

  function wedding(S, a, b) {
    const count = function (h) { return S.villagers.filter(function (v) { return v.home === h; }).length; };
    const home = count(a.home) <= count(b.home) ? a.home : b.home;
    a.home = home; b.home = home; a.married = b.married = true;
    S.fiestaUntil = Math.max(S.fiestaUntil, S.time + 180);
    log(S, '¡' + a.name + ' y ' + b.name + ' se han casado! Hubo boda y verbena en la plaza', '💒 Boda de ' + a.name + ' y ' + b.name, 4, [a.id, b.id]);
  }

  function gossipAbout(S, a, b) {
    const recent = S.events.filter(function (e) {
      return e.imp >= 2 && S.time - e.t < DAY * 2 && e.who.length && e.who.indexOf(a.id) < 0 && e.who.indexOf(b.id) < 0 && !e.secretFor;
    });
    if (!recent.length || rnd(S) < 0.5) return null;
    return '¿Te has enterado? ' + capital(recent[recent.length - 1].text) + '…';
  }

  // =====================================================================
  // PODERES DEL SANTO PATRÓN
  // =====================================================================
  function applyPower(S, power, opts) {
    opts = opts || {};
    switch (power) {
      case 'lluvia':
        S.weather = 'lluvia'; S.weatherUntil = S.time + 180; S.harvest = clamp(S.harvest + 8, 0, 100);
        if (S.time < S.fiestaUntil) {
          S.fiestaUntil = S.time;
          log(S, 'un chaparrón aguó las fiestas y todo el mundo acabó en el bar', '☔ La lluvia agua la fiesta', 2);
        } else log(S, 'el santo hizo llover', 'El santo manda lluvia', 1);
        S.villagers.forEach(function (v) { if (!v.inside && v.act !== 'dormir') v.actUntil = S.time; });
        return 'Las nubes se arremolinan sobre el pueblo. ¡Que llueva, que llueva!';
      case 'sol':
        S.weather = 'sol'; S.weatherUntil = S.time + 240;
        log(S, 'salió el sol por obra del santo', 'Sale el sol', 1);
        return 'Se abren las nubes y sale el sol.';
      case 'fiesta':
        S.fiestaUntil = S.time + 240;
        S.villagers.forEach(function (v) { if (v.act !== 'dormir') v.actUntil = S.time; });
        log(S, 'hubo verbena en la plaza por las fiestas del santo', '🎉 ¡Fiestas en la plaza!', 2);
        return '¡Fiestas patronales! Todo el mundo a la plaza.';
      case 'bendecir':
        S.blessUntil = S.time + DAY; S.harvest = clamp(S.harvest + 25, 0, 100);
        S.villagers.forEach(function (v) { v.needs.social = clamp(v.needs.social - 10, 0, 100); });
        log(S, 'el santo bendijo la cosecha y en el campo no se habla de otra cosa', '✨ Cosecha bendecida', 2);
        return 'Has bendecido la cosecha. Los campos brillan este año.';
      case 'loteria':
        return lottery(S);
      case 'forastero':
        return stranger(S, opts.name);
      default:
        return null;
    }
  }

  function lottery(S) {
    const pool = adults(S);
    const v = pick(S, pool), prize = PRICES.loteria;
    v.money += prize;
    remember(v, 'loteria', null, 0, S.time);
    let tail, imp = 4, speech;
    if (has(v, 'alegre') || has(v, 'juerguista')) {
      S.rondaUntil = S.time + 150; v.money -= 120;
      adults(S).forEach(function (o) { if (o.id !== v.id) addRel(S, o.id, v.id, 5); });
      S.villagers.forEach(function (o) { if (isAdult(o) && o.act !== 'dormir') o.actUntil = S.time; });
      tail = ', ¡y ha invitado a todo el pueblo a una ronda en el bar!';
      speech = '¡Le ha tocado la lotería a ' + v.name + '! Dos mil euros. Y ' + g(v, 'él, ni corto ni perezoso', 'ella, ni corta ni perezosa') + ', invita a todo el pueblo en el bar.';
    } else if (has(v, 'ahorrador')) {
      memOf(v, 'loteria').a = 1;
      tail = ', pero no se lo ha contado a nadie';
      speech = 'Le ha tocado la lotería a ' + v.name + ': dos mil euros. Pero se lo calla. A ver cuánto tarda en saberse.';
    } else if (has(v, 'religioso')) {
      v.money -= 300; const cura = S.villagers.find(function (o) { return o.job === 'cura'; }); if (cura) cura.money += 300;
      tail = ', y ha dado una parte a la parroquia';
      speech = 'Le ha tocado la lotería a ' + v.name + ', y ha dado una parte a la parroquia. Don Julián está que no cabe en sí.';
    } else if (has(v, 'gruñón')) {
      adults(S).forEach(function (o) { if (o.id !== v.id) addRel(S, o.id, v.id, -3); });
      tail = ', y no ha invitado ni a un café';
      speech = 'Le ha tocado la lotería a ' + v.name + '. Dos mil euros, y no ha invitado ni a un café.';
    } else {
      tail = '';
      speech = '¡Le ha tocado la lotería a ' + v.name + '! Dos mil euros.';
    }
    log(S, 'a ' + v.name + ' le ha tocado la lotería: ' + euros(prize) + tail, '🎟️ ¡A ' + v.name + ' le toca la lotería!', imp, [v.id]);
    v.bubble = { text: '¡Me ha tocado!', until: S.time + 15 };
    return speech;
  }

  function stranger(S, givenName) {
    const used = S.villagers.map(function (v) { return v.name; });
    const opts = STRANGER_NAMES.filter(function (n) { return used.indexOf(n[0]) < 0; });
    const nm = opts.length ? pick(S, opts) : ['Forastero ' + S.nextId, 'm'];
    let name = nm[0], sex = nm[1];
    if (givenName) { name = capital(String(givenName).trim()); sex = /a$/i.test(name) ? 'f' : 'm'; }
    const homes = BUILDINGS.filter(function (b) { return b.type === 'casa'; }).sort(function (x, y) {
      return S.villagers.filter(function (v) { return v.home === x.id; }).length - S.villagers.filter(function (v) { return v.home === y.id; }).length;
    });
    const t1 = pick(S, ALL_TRAITS); let t2 = pick(S, ALL_TRAITS); if (t2 === t1) t2 = 'alegre';
    const palette = ['#e06666', '#6fa8dc', '#93c47d', '#ffd966', '#c27ba0', '#76a5af'];
    const id = 'v' + (S.nextId++);
    const v = {
      id: id, name: name, sex: sex, age: 22 + Math.floor(rnd(S) * 40), job: pick(S, STRANGER_JOBS), traits: [t1, t2],
      home: homes[0].id, money: 80 + Math.floor(rnd(S) * 200), partner: null, married: false, crush: null, stock: 0, mem: [],
      look: { skin: pick(S, ['#f0c29a', '#e8b48a', '#c98d63', '#8d5a3b']), hair: pick(S, ['#2a1a14', '#a0522d', '#d4a017', '#111111']), shirt: pick(S, palette), pants: '#3a3a52' },
      needs: { hunger: 40, energy: 70, social: 70 },
      x: ENTRY.c * T + T / 2, y: ENTRY.r * T + T / 2, path: [], inside: null, act: 'pasear', actPlace: 'plaza', actUntil: S.time + 60,
      bubble: { text: '¡Hola! ¿Es aquí Pueblo Vivo?', until: S.time + 12 }, offset: Math.floor(rnd(S) * 40) - 20, days: {}
    };
    const p = placeTile(S, 'plaza', v);
    v.path = findPath(S, ENTRY.c, ENTRY.r, p.c, p.r) || [];
    S.villagers.push(v);
    S.villagers.forEach(function (o) { if (o.id !== id) setRel(S, id, o.id, Math.floor(rnd(S) * 20) - 5); });
    log(S, 'llegó ' + g(v, 'un forastero llamado ', 'una forastera llamada ') + name + ', ' + g(v, 'el', 'la') + ' nuevo ' + jobName(v) + ' del pueblo',
      '🧳 Llega ' + name + ' al pueblo', 3, [id]);
    return 'Por el camino llega ' + g(v, 'un forastero', 'una forastera') + ': ' + name + '. Veremos qué tal ' + g(v, 'lo', 'la') + ' reciben.';
  }

  function jobName(v) {
    const f = fem(v);
    return ({ panadero: f ? 'panadera' : 'panadero', agricultor: f ? 'agricultora' : 'agricultor', costurero: f ? 'costurera' : 'costurero',
      tabernero: f ? 'tabernera' : 'tabernero', jubilado: f ? 'jubilada' : 'jubilado', cura: 'cura', niño: f ? 'niña' : 'niño' })[v.job] || v.job;
  }

  // =====================================================================
  // AVANCE SIN MIRAR Y CRÓNICA
  // =====================================================================
  function fastForward(S, minutes) {
    const target = S.time + minutes;
    while (S.time < target) tick(S, Math.min(10, target - S.time), true);
    S.villagers.forEach(function (v) { decide(S, v, true); v.bubble = null; });
  }

  function chronicle(S, since) {
    const evs = S.events.filter(function (e) { return e.t >= since; });
    const days = Math.floor(S.time / DAY) - Math.floor(since / DAY);
    const intro = days >= 2 ? 'Mientras no estabas han pasado ' + days + ' días en el pueblo. '
      : days === 1 ? 'Mientras no estabas ha pasado un día en el pueblo. ' : '';
    const top = evs.filter(function (e) { return e.imp >= 2; }).sort(function (x, y) { return y.imp - x.imp || y.t - x.t; }).slice(0, 5)
      .sort(function (x, y) { return x.t - y.t; });
    if (!top.length) {
      const rain = evs.some(function (e) { return e.text.indexOf('llov') >= 0; });
      return intro + (rain ? 'Ha llovido un poco, pero por lo demás todo ha estado tranquilo.' : 'Todo ha estado tranquilo: mucho paseo por la plaza y poca novedad.');
    }
    const links = ['Además, ', 'Por otro lado, ', 'Y ojo: ', 'También '], k0 = Math.floor(rnd(S) * links.length);
    const parts = top.map(function (e, i) {
      const c = i === 0 ? '' : i === top.length - 1 ? 'Y por último, ' : links[(k0 + i) % links.length];
      const t = c ? c + e.text : capital(e.text);
      return /[.!?…]$/.test(t) ? t : t + '.';
    });
    return intro + parts.join(' ');
  }

  // =====================================================================
  // CONSULTAS SOBRE UN VECINO
  // =====================================================================
  const ACTS = {
    dormir: 'durmiendo', trabajar: 'trabajando', coser: 'cosiendo en casa', vender: 'vendiendo en el mercado', comprar: 'de compras en el mercado',
    'comprar pan': 'comprando el pan', 'tomar algo': 'tomando algo en el bar', pasear: 'paseando por la plaza', charlar: 'charlando en el bar',
    descansar: 'descansando', siesta: 'echándose la siesta', comer: 'comiendo', misa: 'en misa', fiesta: 'de fiesta en la plaza', jugar: 'jugando'
  };
  function moodOf(v) {
    let m = 100 - (v.needs.hunger + (100 - v.needs.energy) + v.needs.social) / 3;
    if (isAdult(v) && v.money < 12) m -= 25;
    if ((v.mem || []).some(function (x) { return x.k === 'celos' || x.k === 'rencor'; })) m -= 10;
    return m > 68 ? 'contento' : m > 42 ? 'normal' : 'de bajón';
  }
  function villagerSummary(S, v) {
    const others = S.villagers.filter(function (o) { return o.id !== v.id && o.id !== v.partner; })
      .map(function (o) { return { o: o, r: getRel(S, v.id, o.id) }; }).sort(function (x, y) { return y.r - x.r; });
    const notes = [];
    S.debts.forEach(function (d) {
      if (d.t === v.id) notes.push('Le debe ' + euros(d.a) + ' a ' + byId(S, d.f).name);
      if (d.f === v.id) notes.push(byId(S, d.t).name + ' le debe ' + euros(d.a));
    });
    if (v.crush && byId(S, v.crush)) notes.push('Le gusta ' + byId(S, v.crush).name + ' (en secreto)');
    (v.mem || []).forEach(function (m) {
      const o = m.o && byId(S, m.o);
      if (m.k === 'celos' && o) notes.push('Tiene celos de ' + o.name);
      if (m.k === 'rencor' && o) notes.push('Guarda rencor a ' + o.name);
      if (m.k === 'loteria') notes.push(m.a ? 'Esconde un premio de lotería' : 'Le tocó la lotería');
    });
    const partner = v.partner && byId(S, v.partner);
    return {
      name: v.name, age: v.age, job: jobName(v), traits: v.traits, act: ACTS[v.act] || v.act, mood: moodOf(v),
      money: isAdult(v) ? Math.round(v.money) : null,
      partner: partner ? partner.name : null,
      partnerLabel: partner ? (v.married ? g(v, 'Casado con', 'Casada con') : g(partner, 'Novio', 'Novia')) : null,
      friend: others.length && others[0].r > 30 ? others[0].o.name : null,
      enemy: others.length && others[others.length - 1].r < -30 ? others[others.length - 1].o.name : null,
      notes: notes.slice(0, 4)
    };
  }
  function describeVillager(S, v) {
    const s = villagerSummary(S, v);
    const parts = [s.name + ' tiene ' + s.age + ' años y es ' + s.job + '.'];
    parts.push('Ahora está ' + s.act + ', y está ' + (s.mood === 'de bajón' ? 'de bajón' : s.mood === 'contento' ? g(v, 'contento', 'contenta') : 'tan normal') + '.');
    if (s.partner) parts.push(v.married ? 'Está ' + g(v, 'casado', 'casada') + ' con ' + s.partner + '.' : 'Sale con ' + s.partner + '.');
    if (s.money !== null) parts.push(s.money < 12 ? 'Anda sin un duro.' : s.money > 1000 ? 'Tiene el riñón bien cubierto.' : 'Tiene unos ' + euros(Math.round(s.money / 10) * 10) + ' ahorrados.');
    s.notes.slice(0, 2).forEach(function (n) { parts.push(n.replace(' (en secreto)', ', aunque no lo sabe nadie') + '.'); });
    if (s.enemy) parts.push('Y no traga a ' + s.enemy + '.');
    return parts.join(' ');
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(don|dona|la|el|a)\s+/, '').trim();
  }
  function findVillager(S, name) {
    const n = norm(name);
    if (!n) return null;
    const keyed = S.villagers.map(function (v) { return { v: v, k: norm(v.name) }; });
    let hit = keyed.find(function (x) { return x.k === n; });
    if (!hit) hit = keyed.find(function (x) { return x.k.indexOf(n) === 0 || n.indexOf(x.k) === 0; });
    if (!hit) hit = keyed.find(function (x) { return x.k.indexOf(n) >= 0; });
    return hit ? hit.v : null;
  }

  function clock(S) {
    const h = Math.floor(hourOf(S)), m = Math.floor(S.time % 60);
    return { day: dayOf(S), weekday: weekdayOf(S), hh: h, mm: m, label: (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m };
  }

  // ---------- Guardado compacto ----------
  function serialize(S) {
    return JSON.stringify(S, function (k, val) {
      if (k === 'path' || k === 'bubble') return undefined;
      if (k === 'events') return val.slice(-40);
      if (k === 'x' || k === 'y') return Math.round(val);
      if ((k === 'money' || k === 'stock') && typeof val === 'number') return Math.round(val * 100) / 100;
      if (k === 'time' && typeof val === 'number') return Math.round(val * 100) / 100;
      return val;
    });
  }
  function deserialize(json) {
    const S = typeof json === 'string' ? JSON.parse(json) : json;
    if (!S || !S.villagers || S.v !== VERSION) return null;
    S.villagers.forEach(function (v) { v.path = []; v.bubble = null; v.days = v.days || {}; v.mem = v.mem || []; });
    return S;
  }

  return {
    VERSION: VERSION, serialize: serialize, deserialize: deserialize,
    T: T, COLS: COLS, ROWS: ROWS, W: W, H: H, tileAt: tileAt, TILES: { GRASS: GRASS, PATH: PATH, ROAD: ROAD, PLAZA: PLAZA, FIELD: FIELD, BENCH: BENCH, TREE: TREE, WATER: WATER, BUILD: BUILD },
    BUILDINGS: BUILDINGS, TREES: TREES, PLAZA: PLAZA_T, FIELD: FIELD_T, FOUNTAIN: FOUNTAIN_T, BENCHES: BENCHES_T, STALL_COLS: STALL_COLS, STALL_ROW: STALL_ROW,
    DAY: DAY, createWorld: createWorld, step: step, fastForward: fastForward, applyPower: applyPower,
    chronicle: chronicle, villagerSummary: villagerSummary, describeVillager: describeVillager, findVillager: findVillager,
    clock: clock, hourOf: hourOf, byId: byId, jobName: jobName, isMarket: isMarket, findPath: findPath, passable: passable
  };
});
