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
  // MAPA (fase 2): pueblo orgánico de 96 x 60 casillas de 8x8 píxeles.
  // Calles curvas con nombre; las casas se pegan unas a otras a lo largo
  // de ellas (manzanas) con su corral detrás. Río con puente, eras y solares.
  // =====================================================================
  const MAP_VERSION = 2;
  const T = 8, COLS = 96, ROWS = 60, W = COLS * T, H = ROWS * T;
  const GRASS = 0, PATH = 1, ROAD = 2, PLAZA = 3, FIELD = 4, BENCH = 6, TREE = 7, WATER = 8, BUILD = 9, DECOR = 10, BRIDGE = 11, YARD = 12, ERA = 13;
  const grid = new Uint8Array(COLS * ROWS);
  const streetOf = new Int16Array(COLS * ROWS).fill(-1);   // qué calle pasa por cada casilla
  function tileAt(c, r) { return (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? BUILD : grid[r * COLS + c]; }
  function setTile(c, r, v) { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) grid[r * COLS + c] = v; }
  function fillTiles(c, r, w, h, v) { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) setTile(x, y, v); }

  const RIVER_PTS = [[0, 48], [12, 50], [26, 49], [40, 52], [54, 51], [70, 54], [84, 53], [95, 55]];
  const ROAD_PTS = [[95, 33], [82, 33], [70, 32], [58, 34], [46, 35], [34, 34], [22, 36], [10, 36], [0, 37]];
  // calles: w = anchura; houses = se edifica a lo largo; el orden marca qué se construye antes
  const STREETS = [
    { name: 'Calle Mayor', w: 2, houses: true, pts: [[53, 25], [60, 27], [69, 28], [78, 31], [86, 33]] },
    { name: 'Calle de la Iglesia', w: 1, houses: true, pts: [[38, 20], [33, 17], [26, 15], [18, 12], [9, 10], [3, 10]] },
    { name: 'Calle Real', w: 2, houses: true, pts: [[45, 28], [46, 31], [46, 35]] },
    { name: 'Callejón del Pozo', w: 1, houses: true, pts: [[26, 15], [24, 21], [25, 28], [31, 31], [38, 27]] },
    { name: 'Calle del Molino', w: 1, houses: true, pts: [[52, 18], [58, 16], [65, 13], [73, 10], [81, 8]] },
    { name: 'Calle del Río', w: 1, houses: true, pts: [[38, 35], [36, 40], [28, 42], [16, 43], [8, 42]] },
    { name: 'Calle Nueva', w: 1, houses: true, pts: [[56, 34], [60, 39], [68, 41], [78, 40], [86, 38]] },
    { name: 'Camino del Puente', w: 1, pts: [[47, 36], [48, 42], [48, 47], [48, 59]] },
    { name: 'Camino de las Eras', w: 1, pts: [[65, 13], [67, 8], [71, 5]] },
    { name: 'Camino del Cementerio', w: 1, pts: [[52, 18], [52, 16]] }
  ];
  const PLAZA_T = { c: 38, r: 19, w: 15, h: 9 };
  const FOUNTAIN_T = { c: 44, r: 22, w: 2, h: 2 };
  const BENCHES_T = [[40, 22], [49, 22], [40, 25], [49, 25]];   // 2 casillas de ancho
  const STALL_COLS = [39, 41, 48, 50];                         // puestos del mercado (fila 19, 2 de ancho)
  const STALL_ROW = 19;
  const FIELDS = [{ c: 56, r: 43, w: 26, h: 7 }, { c: 6, r: 44, w: 21, h: 3 }, { c: 68, r: 15, w: 16, h: 8 }];
  const FIELD_T = FIELDS[0];
  const ERA_T = { c: 70, r: 3, w: 5, h: 4 };
  const MILL_T = { c: 82, r: 2, w: 5, h: 6 };
  const OLIVE_T = { c: 58, r: 56, w: 33, h: 3 };
  const CEMETERY_T = { c: 50, r: 9, w: 6, h: 7 };

  // Edificios fijos y solares de obras (c, r = esquina superior izquierda; door = lado de la puerta)
  const BUILDINGS = [
    { id: 'iglesia', type: 'iglesia', name: 'la iglesia', c: 40, r: 8, w: 9, h: 10, door: 's' },
    { id: 'ayuntamiento', type: 'ayuntamiento', name: 'el ayuntamiento', c: 31, r: 20, w: 7, h: 6, door: 'e' },
    { id: 'bar', type: 'bar', name: 'el bar', c: 53, r: 19, w: 6, h: 5, door: 's' },
    { id: 'panaderia', type: 'panaderia', name: 'la panadería', c: 61, r: 22, w: 6, h: 4, door: 's' },
    { id: 'tienda', type: 'tienda', name: 'la tienda', c: 70, r: 24, w: 5, h: 4, door: 's', lot: true },
    { id: 'escuela', type: 'escuela', name: 'la escuela', c: 30, r: 37, w: 7, h: 4, door: 's', lot: true },
    { id: 'consultorio', type: 'consultorio', name: 'el consultorio', c: 61, r: 35, w: 5, h: 4, door: 's', lot: true },
    { id: 'cuartel', type: 'cuartel', name: 'el cuartel', c: 86, r: 28, w: 6, h: 4, door: 's', lot: true },
    { id: 'quiosco', type: 'quiosco', name: 'el quiosco', c: 49, r: 30, w: 3, h: 2, door: 's', lot: true }
  ];

  // Niveles del pueblo según su fama, y obras que desbloquea cada nivel
  const LEVELS = [
    { at: 0, name: 'Aldea' }, { at: 60, name: 'Pueblo' }, { at: 200, name: 'Pueblo con encanto' },
    { at: 450, name: 'Villa' }, { at: 900, name: 'Villa próspera' }
  ];
  const PROJECTS = [
    { id: 'farolas', level: 2, days: 1, icon: '💡', name: 'las farolas', done: 'Ya hay farolas en la carretera y en la plaza: se acabó volver a casa a oscuras' },
    { id: 'tienda', level: 2, days: 2, icon: '🛒', name: 'la tienda de ultramarinos', done: 'Abre la tienda de ultramarinos, y Carmen ya se ha enterado de lo que compra cada uno' },
    { id: 'consultorio', level: 2, days: 2, icon: '🩺', name: 'el consultorio', done: 'Abre el consultorio médico, y llega una médica para quedarse: los mayores ya no tienen que ir a la capital' },
    { id: 'escuela', level: 3, days: 3, icon: '🏫', name: 'la escuela', done: 'Se inaugura la escuela: los críos ya no tienen que ir al pueblo de al lado' },
    { id: 'olivar', level: 3, days: 2, icon: '🫒', name: 'el olivar', done: 'Se planta el olivar comunal: dentro de unos años, aceite del pueblo' },
    { id: 'cuartel', level: 3, days: 2, icon: '🚔', name: 'el cuartel de la Guardia Civil', done: 'Abre el cuartel de la Guardia Civil, y llega un guardia que ya patrulla las calles' },
    { id: 'quiosco', level: 4, days: 2, icon: '📰', name: 'el quiosco', done: 'Abre el quiosco de prensa en la carretera' },
    { id: 'molino', level: 4, days: 2, icon: '🌬️', name: 'el molino', done: 'Se restaura el molino viejo, y vuelve a girar después de cincuenta años' },
    { id: 'plaza', level: 5, days: 3, icon: '⛲', name: 'la plaza nueva', done: 'Se estrena la plaza nueva, con naranjos, flores y la estatua del santo' }
  ];
  const HOMES = [];        // casas: las primeras 12 existen desde el principio; el resto son solares para crecer
  const LAMPS = [];        // dónde van las farolas (en píxeles)
  const INITIAL_HOMES = 12, MAX_HOMES = 46;
  const WALKABLE = {}; WALKABLE[PATH] = WALKABLE[ROAD] = WALKABLE[PLAZA] = WALKABLE[BRIDGE] = WALKABLE[ERA] = 1;

  // Recorre una polilínea casilla a casilla, sin saltos en diagonal (para que las calles se puedan andar)
  function walkLine(pts, fn) {
    let pc = null, pr = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3 || 1;
      for (let k = 0; k <= n; k++) {
        const c = Math.round(x0 + (x1 - x0) * k / n), r = Math.round(y0 + (y1 - y0) * k / n);
        if (c === pc && r === pr) continue;
        if (pc !== null && c !== pc && r !== pr) fn(pc, r, pts[i], pts[i + 1]);   // rellena la esquina
        fn(c, r, pts[i], pts[i + 1]);
        pc = c; pr = r;
      }
    }
  }
  function doorTile(b) {
    if (b.door === 'n') return { c: b.c + Math.floor(b.w / 2), r: b.r - 1, dc: 0, dr: -1 };
    if (b.door === 'e') return { c: b.c + b.w, r: b.r + Math.floor(b.h / 2), dc: 1, dr: 0 };
    if (b.door === 'w') return { c: b.c - 1, r: b.r + Math.floor(b.h / 2), dc: -1, dr: 0 };
    return { c: b.c + Math.floor(b.w / 2), r: b.r + b.h, dc: 0, dr: 1 };
  }
  function setupBuilding(b) {
    const d = doorTile(b);
    b.dc = d.c; b.dr = d.r;
    b.x = b.c * T; b.y = b.r * T; b.pw = b.w * T; b.ph = b.h * T;
    b.door = b.door || 's';
    b.doorPx = { x: d.c * T + T / 2, y: d.r * T + T / 2 };
    // camino desde la puerta hasta la calle más cercana en esa dirección
    let c = d.c, r = d.r;
    for (let k = 0; k < 8 && !WALKABLE[tileAt(c, r)]; k++) {
      const t = tileAt(c, r);
      if (t === BUILD || t === WATER) throw new Error('La puerta de ' + b.id + ' da a un edificio en ' + c + ',' + r);
      setTile(c, r, PATH); c += d.dc; r += d.dr;
    }
  }
  function rectFree(c, r, w, h) {
    if (c < 1 || r < 1 || c + w > COLS - 1 || r + h > ROWS - 1) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (tileAt(x, y) !== GRASS) return false;
    return true;
  }

  function buildMap() {
    grid.fill(GRASS);
    // río
    walkLine(RIVER_PTS, function (c, r) { for (let k = -1; k <= 1; k++) setTile(c, r + k, WATER); });
    // huertas y campos
    FIELDS.forEach(function (f) { fillTiles(f.c, f.r, f.w, f.h, FIELD); });
    // carretera (travesía)
    walkLine(ROAD_PTS, function (c, r) { setTile(c, r, ROAD); setTile(c, r + 1, ROAD); });
    // calles: sobre el agua, puente
    STREETS.forEach(function (s, si) {
      s.tiles = [];
      walkLine(s.pts, function (c, r, a, b) {
        for (let dy = 0; dy < s.w; dy++) for (let dx = 0; dx < s.w; dx++) {
          const cc = c + dx, rr = r + dy, t = tileAt(cc, rr);
          if (t === ROAD) continue;
          setTile(cc, rr, t === WATER ? BRIDGE : PATH);
          if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS) streetOf[rr * COLS + cc] = si;
        }
        s.tiles.push([c, r, b[0] - a[0], b[1] - a[1]]);
      });
    });
    // plaza mayor (esquinas recortadas), fuente, bancos y era
    fillTiles(PLAZA_T.c, PLAZA_T.r, PLAZA_T.w, PLAZA_T.h, PLAZA);
    [[PLAZA_T.c, PLAZA_T.r + PLAZA_T.h - 1], [PLAZA_T.c + PLAZA_T.w - 1, PLAZA_T.r + PLAZA_T.h - 1]].forEach(function (p) { setTile(p[0], p[1], GRASS); });
    fillTiles(FOUNTAIN_T.c, FOUNTAIN_T.r, FOUNTAIN_T.w, FOUNTAIN_T.h, WATER);
    BENCHES_T.forEach(function (p) { fillTiles(p[0], p[1], 2, 1, BENCH); });
    for (let y = ERA_T.r; y < ERA_T.r + ERA_T.h; y++) for (let x = ERA_T.c; x < ERA_T.c + ERA_T.w; x++) {
      const dx = (x + .5 - (ERA_T.c + ERA_T.w / 2)) / (ERA_T.w / 2), dy = (y + .5 - (ERA_T.r + ERA_T.h / 2)) / (ERA_T.h / 2);
      if (dx * dx + dy * dy <= 1.05) setTile(x, y, ERA);
    }
    // edificios fijos y solares de obras
    BUILDINGS.forEach(function (b) { fillTiles(b.c, b.r, b.w, b.h, BUILD); });
    BUILDINGS.forEach(setupBuilding);
    // molino, olivar y cementerio
    [MILL_T, OLIVE_T, CEMETERY_T].forEach(function (z) { fillTiles(z.c, z.r, z.w, z.h, DECOR); });
    // casas pegadas a lo largo de las calles, con su corral detrás
    const rng = seededRng(1948);
    const fronts = STREETS.filter(function (s) { return s.houses; }).map(function (s) { return { s: s, tiles: s.tiles }; });
    fronts.push({ s: { name: 'Plaza Mayor' }, tiles: (function () { const t = []; for (let c = PLAZA_T.c + 1; c < PLAZA_T.c + PLAZA_T.w - 1; c++) t.push([c, PLAZA_T.r + PLAZA_T.h - 1, 1, 0]); return t; })(), only: 's' });
    const placed = [], numbers = {};
    fronts.forEach(function (f) {
      f.tiles.forEach(function (t, i) {
        if (i % 2 && rng() < 0.5) return;
        const sc = t[0], sr = t[1], horiz = Math.abs(t[2]) >= Math.abs(t[3]);
        const sides = f.only ? [f.only] : horiz ? ['n', 's'] : ['w', 'e'];
        sides.forEach(function (side) {
          const sizes = rng() < 0.6 ? [[5, 4], [4, 4], [3, 4], [4, 3], [3, 3]] : [[4, 4], [5, 3], [4, 3], [3, 4], [3, 3]];
          for (let k = 0; k < sizes.length; k++) {
            const ww = sizes[k][0], dd = sizes[k][1];
            let c, r, w, h, door;
            if (side === 'n') { w = ww; h = dd; c = sc - Math.floor(ww / 2); r = sr - dd; door = 's'; }
            else if (side === 's') { w = ww; h = dd; c = sc - Math.floor(ww / 2); r = sr + 1; door = 'n'; }
            else if (side === 'w') { w = dd; h = ww; c = sc - dd; r = sr - Math.floor(ww / 2); door = 'e'; }
            else { w = dd; h = ww; c = sc + 1; r = sr - Math.floor(ww / 2); door = 'w'; }
            if (!rectFree(c, r, w, h)) continue;
            fillTiles(c, r, w, h, BUILD);
            numbers[f.s.name] = (numbers[f.s.name] || 0) + 1;
            const hb = { type: 'casa', c: c, r: r, w: w, h: h, door: door, street: f.s.name, num: numbers[f.s.name] };
            placed.push(hb);
            // corral o huerto detrás de la casa
            const yd = door === 's' ? [c, r - 2, w, 2] : door === 'n' ? [c, r + h, w, 2] : door === 'e' ? [c - 2, r, 2, h] : [c + w, r, 2, h];
            hb.yard = [];
            for (let y = yd[1]; y < yd[1] + yd[3]; y++) for (let x = yd[0]; x < yd[0] + yd[2]; x++) if (tileAt(x, y) === GRASS && x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1) { setTile(x, y, YARD); hb.yard.push([x, y]); }
            break;
          }
        });
      });
    });
    // las más cercanas a la plaza son las casas que ya existen; el resto, solares para crecer
    const pcx = PLAZA_T.c + PLAZA_T.w / 2, pcy = PLAZA_T.r + PLAZA_T.h / 2;
    placed.sort(function (a, b) { return Math.hypot(a.c + a.w / 2 - pcx, a.r + a.h / 2 - pcy) - Math.hypot(b.c + b.w / 2 - pcx, b.r + b.h / 2 - pcy); });
    placed.slice(MAX_HOMES).forEach(function (hb) { fillTiles(hb.c, hb.r, hb.w, hb.h, GRASS); hb.yard.forEach(function (p) { setTile(p[0], p[1], GRASS); }); });
    placed.slice(0, MAX_HOMES).forEach(function (hb, i) {
      hb.id = 'h' + i; hb.cap = Math.max(3, Math.min(6, Math.round(hb.w * hb.h / 3.2)));
      hb.initial = i < INITIAL_HOMES;
      setupBuilding(hb); HOMES.push(hb); BUILDINGS.push(hb);
    });
    // farolas cada pocas casillas por la carretera, la calle mayor y la calle real
    [{ pts: ROAD_PTS, step: 7 }, { pts: STREETS[0].pts, step: 5 }, { pts: STREETS[2].pts, step: 4 }, { pts: STREETS[1].pts, step: 6 }].forEach(function (L) {
      let k = 0;
      walkLine(L.pts, function (c, r) {
        if (k++ % L.step) return;
        const spot = [[c, r - 1], [c, r + 2], [c - 1, r], [c + 1, r]].find(function (p) { return tileAt(p[0], p[1]) === GRASS; });
        if (spot && !LAMPS.some(function (l) { return Math.abs(l[0] - spot[0] * T) < 24 && Math.abs(l[1] - spot[1] * T) < 24; })) LAMPS.push([spot[0] * T + T / 2, spot[1] * T + T - 1]);
      });
    });
    // árboles sueltos en la hierba, separados entre sí
    const trng = seededRng(2026), trees = [];
    for (let i = 0; i < 9000 && trees.length < 120; i++) {
      const c = Math.floor(trng() * COLS), r = 1 + Math.floor(trng() * (ROWS - 1));
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
        const t = tileAt(c + dx, r + dy);
        if (t !== GRASS && !(c + dx < 0 || c + dx >= COLS || r + dy >= ROWS)) ok = false;
      }
      if (!ok || trees.some(function (t) { return Math.abs(t[0] - c) < 3 && Math.abs(t[1] - r) < 3; })) continue;
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
  const ENTRY = { c: COLS - 1, r: ROAD_PTS[0][1] };
  const ROAD_ROWS = [ROAD_PTS[0][1], ROAD_PTS[0][1] + 1];
  const LANE_ROW = 0;
  function streetName(c, r) {
    for (let d = 0; d < 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const cc = c + dx, rr = r + dy;
      if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
      const s = streetOf[rr * COLS + cc];
      if (s >= 0) return STREETS[s].name;
      if (tileAt(cc, rr) === PLAZA) return 'la Plaza Mayor';
      if (tileAt(cc, rr) === ROAD) return 'la carretera';
    }
    return 'las afueras';
  }

  // ---------- Búsqueda de rutas (A*, 8 direcciones, sin cortar esquinas) ----------
  function isStall(c, r) { return r === STALL_ROW && STALL_COLS.some(function (s) { return c === s || c === s + 1; }); }
  function stepCost(S, c, r) {
    const t = tileAt(c, r);
    if (t === PATH || t === ROAD || t === BRIDGE || t === ERA) return 1;
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
    while (hp.length && iter++ < 24000) {
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
  function fiestaOn(S) { return S.time < S.fiestaUntil && S.time >= (S.fiestaFrom || 0); }
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
      villagers: [], rel: {}, events: [], nextId: 100,
      fame: 0, level: 1, fameDay: 0, builds: {}, milestones: [], faith: 50, dilemma: null, dilemmaUsed: {}, followups: []
    };
    milestone(S, '⛪', 'Se funda Pueblo Vivo: 21 vecinos, un bar, una panadería y mucha vida por delante');
    HOMES.forEach(function (b) { if (b.initial) S.houses[b.id] = 0; });
    S.map = MAP_VERSION;
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
    assignFamilies(S);
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

  // Momentos que van al libro del pueblo
  function milestone(S, icon, text) {
    S.milestones = S.milestones || [];
    S.milestones.push({ d: dayOf(S), t: Math.round(S.time), i: icon, text: text });
    if (S.milestones.length > 80) S.milestones.splice(0, S.milestones.length - 80);
  }

  // =====================================================================
  // PROGRESO DEL PUEBLO: fama, niveles y obras
  // =====================================================================
  function isBuilt(S, id) { const b = S.builds && S.builds[id]; return !!(b && b.done); }
  function buildProgress(S, id) {
    const b = S.builds && S.builds[id];
    if (!b) return 0;
    if (b.done) return 1;
    return clamp((S.time - b.start) / (b.until - b.start), 0, 1);
  }
  function building_(S) { return PROJECTS.find(function (p) { return S.builds[p.id] && !S.builds[p.id].done; }); }
  // el edificio que está en obras ahora mismo (una obra del pueblo o una casa nueva), para mandar obreros
  function obraBuilding(S) {
    const p = building_(S);
    if (p && BY_ID[p.id]) return BY_ID[p.id];
    if (S.homeObra && BY_ID[S.homeObra.id]) return BY_ID[S.homeObra.id];
    return null;
  }
  function levelFor(fame) { let l = 1; LEVELS.forEach(function (x, i) { if (fame >= x.at) l = i + 1; }); return l; }
  function moodScore(v) {
    let m = 100 - (v.needs.hunger + (100 - v.needs.energy) + v.needs.social) / 3;
    if (isAdult(v) && v.money < 12) m -= 25;
    if ((v.mem || []).some(function (x) { return x.k === 'celos' || x.k === 'rencor'; })) m -= 10;
    if (v.partner) m += 6;
    return clamp(m, 0, 100);
  }
  function happiness(S) {
    if (!S.villagers.length) return 0;
    return S.villagers.reduce(function (s, v) { return s + moodScore(v); }, 0) / S.villagers.length;
  }
  function addFame(S, n) { S.fame = (S.fame || 0) + n; S.fameToday = (S.fameToday || 0) + n; }

  function startNextBuild(S) {
    if (building_(S)) return;
    const next = PROJECTS.find(function (p) { return p.level <= S.level && !S.builds[p.id]; });
    if (!next) return;
    S.builds[next.id] = { start: Math.round(S.time), until: Math.round(S.time + next.days * DAY), done: 0 };
    log(S, 'han empezado las obras de ' + next.name, '🚧 Empiezan las obras: ' + next.name, 2);
  }
  function finishBuilds(S) {
    PROJECTS.forEach(function (p) {
      const b = S.builds[p.id];
      if (!b || b.done || S.time < b.until) return;
      b.done = Math.round(S.time);
      if (p.id === 'consultorio') stranger(S, null, 'médico');
      if (p.id === 'cuartel') stranger(S, null, 'guardia');
      if (p.id === 'tienda') {
        const owner = byId(S, 'carmen') || adults(S).filter(function (v) { return v.job === 'costurero'; })[0];
        S.biz.tienda = { owner: owner ? owner.id : null, price: 3 };
      }
      addFame(S, 15);
      log(S, p.done.charAt(0).toLowerCase() + p.done.slice(1), p.icon + ' ¡Inaugurado: ' + p.name + '!', 3, [], { build: p.id });
      milestone(S, p.icon, p.done);
    });
    startNextBuild(S);
  }
  function townDay(S) {
    const gain = Math.round(8 + happiness(S) / 5 + S.harvest / 10 + S.villagers.length / 3 +
      Object.keys(S.houses).reduce(function (s, k) { return s + S.houses[k]; }, 0));
    addFame(S, gain);
    S.fameDay = S.fameToday || gain; S.fameToday = 0;
    // fe diaria: un poco siempre, más con vecinos contentos y devotos (las misas suman aparte)
    addFaith(S, 2 + happiness(S) / 30 + S.villagers.filter(function (v) { return has(v, 'religioso'); }).length * 0.4);
    S.faithDay = Math.round(S.faithToday || 0); S.faithToday = 0;
    const lvl = levelFor(S.fame);
    while (S.level < lvl) {
      S.level++;
      const L = LEVELS[S.level - 1];
      log(S, '¡Pueblo Vivo ya es ' + (S.level === 2 ? 'un ' : S.level === 3 ? 'un ' : 'una ') + L.name.toLowerCase() + '! Lo celebran en la plaza, y la noticia ha atraído a gente de fuera',
        '🏆 ¡Pueblo Vivo sube a ' + L.name + '!', 4, [], { levelUp: S.level });
      milestone(S, '🏆', 'Pueblo Vivo pasa a ser ' + (S.level <= 3 ? 'un ' : 'una ') + L.name.toLowerCase());
      S.fiestaUntil = Math.max(S.fiestaUntil, S.time + 10 * 60 + 240); // verbena al día siguiente por la tarde
      S.fiestaFrom = S.time + 10 * 60;
      stranger(S);
    }
    finishBuilds(S);
  }

  // =====================================================================
  // CICLO DE VIDA: familias, nacimientos, vejez, muerte, herencias y éxodo
  // =====================================================================
  const SURNAMES = ['García', 'Fernández', 'López', 'Martín', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez',
    'Romero', 'Navarro', 'Torres', 'Domínguez', 'Gil', 'Vázquez', 'Serrano', 'Ramos', 'Blanco', 'Molina', 'Ortega', 'Delgado', 'Castro', 'Herrero'];
  const FAMILY_OF = { paco: 'García', carmen: 'García', dani: 'García', lucia: 'Ruiz', manolo: 'Moreno', pili: 'Moreno', quique: 'Moreno',
    julian: 'Gil', javi: 'Navarro', remedios: 'Serrano', sara: 'Serrano', irene: 'Romero', elena: 'Torres', tomas: 'Domínguez',
    antonio: 'López', rosa: 'López', marta: 'López', lola: 'Muñoz', fermin: 'Muñoz', puri: 'Vázquez', nico: 'Vázquez' };
  const PARENTS_OF = { dani: ['paco', 'carmen'], quique: ['manolo', 'pili'], marta: ['antonio', 'rosa'], sara: ['remedios'], nico: ['puri'] };
  const BABY_NAMES = {
    m: ['Martín', 'Lucas', 'Mateo', 'Leo', 'Pablo', 'Álex', 'Manuel', 'Adrián', 'Mario', 'Diego', 'Iker', 'Bruno', 'Marcos', 'Gonzalo', 'Rodrigo', 'Óscar', 'Iván', 'Joaquín', 'Rafa', 'Luis'],
    f: ['Sofía', 'Martina', 'María', 'Julia', 'Paula', 'Valeria', 'Emma', 'Daniela', 'Carla', 'Alma', 'Olivia', 'Vega', 'Claudia', 'Candela', 'Nerea', 'Aitana', 'Rocío', 'Blanca', 'Ana', 'Pilar']
  };
  const MAX_POP = 44;

  function freeSurname(S) {
    const used = {}; S.villagers.forEach(function (v) { used[v.sur] = 1; });
    const free = SURNAMES.filter(function (s) { return !used[s]; });
    return pick(S, free.length ? free : SURNAMES);
  }
  function assignFamilies(S) {
    S.villagers.forEach(function (v) {
      if (!v.sur) v.sur = FAMILY_OF[v.id] || freeSurname(S);
      if (!v.parents) v.parents = PARENTS_OF[v.id] || [];
      if (v.born === undefined) v.born = 1 - v.age * 7;
    });
    S.deceased = S.deceased || []; S.preg = S.preg || [];
    S.stats = S.stats || { births: 0, deaths: 0, left: 0 };
  }
  function fullName(v) { return v.sur && v.name.indexOf('Don ') !== 0 ? v.name + ' ' + v.sur : v.name; }
  function childrenOf(S, v) { return S.villagers.filter(function (o) { return (o.parents || []).indexOf(v.id) >= 0; }); }

  // Saca a un vecino del pueblo y limpia todas las referencias a él
  function removeVillager(S, v, died) {
    S.villagers = S.villagers.filter(function (o) { return o !== v; });
    S.villagers.forEach(function (o) {
      if (o.partner === v.id) { o.partner = null; if (died && o.married) { o.widow = true; remember(o, 'luto', v.id, 0, S.time); } o.married = false; }
      if (o.crush === v.id) o.crush = null;
      if (o.crushOut === v.id) o.crushOut = null;
    });
    S.debts = S.debts.filter(function (d) { return d.f !== v.id && d.t !== v.id; });
    S.preg = (S.preg || []).filter(function (p) { return p.a !== v.id && p.b !== v.id; });
  }

  function heirsOf(S, v) {
    const kids = childrenOf(S, v);
    if (kids.length) return kids;
    const partner = v.partner && byId(S, v.partner);
    if (partner) return [partner];
    const house = S.villagers.filter(function (o) { return o.home === v.home && o !== v; });
    if (house.length) return house;
    return S.villagers.filter(function (o) { return o.sur === v.sur && o !== v; });
  }
  function inherit(S, v) {
    const heirs = heirsOf(S, v), parts = [];
    if (heirs.length && v.money > 5) {
      const share = v.money / heirs.length;
      heirs.forEach(function (h) { h.money += share; remember(h, 'herencia', v.id, Math.round(share), S.time); });
      parts.push((heirs.length === 1 ? heirs[0].name + ' hereda ' : 'sus herederos se reparten ') + euros(v.money));
    }
    v.money = 0;
    // negocios: los hereda la pareja, un hijo adulto, alguien del oficio o, si no, quien pueda quedárselo
    Object.keys(S.biz).forEach(function (k) {
      const biz = S.biz[k];
      if (biz.owner !== v.id) return;
      const job = { panaderia: 'panadero', bar: 'tabernero', tienda: 'costurero' }[k];
      const cand = [v.partner && byId(S, v.partner)].concat(childrenOf(S, v).filter(isAdult).sort(function (a, b) { return b.age - a.age; }))
        .concat(adults(S).filter(function (o) { return o.job === job; })).concat(adults(S).filter(function (o) { return o.job !== 'cura'; }))
        .filter(function (o) { return o && o !== v && isAdult(o); });
      const nu = cand[0] || null;
      biz.owner = nu ? nu.id : null;
      if (nu) {
        if (k !== 'tienda' && nu.job !== job && nu.job !== 'jubilado') nu.job = job;
        const where = BY_ID[k] ? BY_ID[k].name : k;
        parts.push(nu.name + ' se queda con ' + where);
        log(S, nu.name + ' se queda al frente de ' + where + ' tras la muerte de ' + v.name, '🔑 ' + nu.name + ' lleva ahora ' + where, 3, [nu.id, v.id]);
      }
    });
    return parts;
  }

  function die(S, v) {
    const day = dayOf(S);
    S.deceased = S.deceased || [];
    S.deceased.push({ id: v.id, name: v.name, sur: v.sur, sex: v.sex, age: v.age, d: day, job: jobName(v) });
    if (S.deceased.length > 40) S.deceased.shift();
    const inh = inherit(S, v);
    const partner = v.partner && byId(S, v.partner);
    // los amigos lo sienten; los enemigos, menos
    S.villagers.forEach(function (o) {
      if (o === v) return;
      const r = getRel(S, o.id, v.id);
      if (r > 30 || o.partner === v.id || (o.parents || []).indexOf(v.id) >= 0) { o.needs.social = clamp(o.needs.social + 30, 0, 100); remember(o, 'luto', v.id, 0, S.time); }
    });
    removeVillager(S, v, true);
    S.stats.deaths++;
    S.funeral = { from: Math.floor(S.time / DAY) * DAY + 11 * 60, until: Math.floor(S.time / DAY) * DAY + 12.5 * 60, name: v.name };
    const tail = partner ? '. Deja ' + g(partner, 'viudo', 'viuda') + ' a ' + partner.name : '';
    log(S, v.name + ' ha fallecido a los ' + v.age + ' años' + tail + (inh.length ? '; ' + inh.join(' y ') : '') + '. A las once es el entierro, y el pueblo entero irá a despedir' + g(v, 'lo', 'la'),
      '🕯️ Fallece ' + v.name + ' (' + v.age + ' años)', 4, [v.id]);
    milestone(S, '🕯️', 'Fallece ' + fullName(v) + ' a los ' + v.age + ' años' + tail);
    if (v.job === 'cura') stranger(S, null, 'cura');
  }

  function birth(S, a, b) {
    const day = dayOf(S);
    const sex = rnd(S) < 0.5 ? 'm' : 'f';
    const used = S.villagers.map(function (v) { return v.name; }).concat((S.deceased || []).map(function (d) { return d.name; }));
    let name = null;
    S.nameQueue = S.nameQueue || [];
    if (S.nameQueue.length) name = capital(S.nameQueue.shift());
    if (!name) { const opts = BABY_NAMES[sex].filter(function (n) { return used.indexOf(n) < 0; }); name = opts.length ? pick(S, opts) : pick(S, BABY_NAMES[sex]); }
    const father = a.sex === 'm' ? a : b.sex === 'm' ? b : a;
    const home = a.home, bld = building(home);
    const palette = ['#e06666', '#6fa8dc', '#93c47d', '#ffd966', '#c27ba0', '#76a5af', '#f6b26b', '#8e7cc3'];
    const inheritT = pick(S, a.traits.concat(b.traits));
    let t2 = pick(S, ALL_TRAITS); if (t2 === inheritT) t2 = 'alegre';
    const id = 'v' + (S.nextId++);
    const v = {
      id: id, name: name, sur: father.sur, sex: sex, age: 0, job: 'niño', traits: inheritT === t2 ? [inheritT] : [inheritT, t2], home: home, money: 0,
      partner: null, married: false, crush: null, stock: 0, mem: [],
      look: { skin: pick(S, [a.look.skin, b.look.skin]), hair: pick(S, [a.look.hair, b.look.hair]), shirt: pick(S, palette), pants: pick(S, ['#3a3a52', '#2f3a55', '#5b4636']) },
      needs: { hunger: 20, energy: 80, social: 30 }, x: bld.door.x, y: bld.door.y, path: [], inside: home, act: 'en casa', actPlace: home, actUntil: S.time + 60,
      bubble: null, offset: Math.floor(rnd(S) * 40) - 20, days: {}, parents: [a.id, b.id], born: day
    };
    S.villagers.push(v);
    S.villagers.forEach(function (o) { if (o.id !== id) setRel(S, id, o.id, (v.parents.indexOf(o.id) >= 0 || o.home === home) ? 70 : 0); });
    S.stats.births++;
    addFame(S, 8);
    const adopt = a.sex === b.sex;
    log(S, adopt ? a.name + ' y ' + b.name + ' han adoptado a ' + g(v, 'un niño', 'una niña') + ': ' + g(v, 'se llama ', 'se llama ') + name
      : '¡Ha nacido ' + name + ', ' + g(v, 'el hijo', 'la hija') + ' de ' + a.name + ' y ' + b.name + '! Medio pueblo ha pasado por casa a conocer' + g(v, 'lo', 'la'),
      '👶 ' + (adopt ? 'Llega ' : 'Nace ') + name + ' ' + v.sur, 4, [a.id, b.id]);
    milestone(S, '👶', (adopt ? 'Llega a la familia ' : 'Nace ') + name + ' ' + v.sur + ', ' + g(v, 'hijo', 'hija') + ' de ' + a.name + ' y ' + b.name);
    return v;
  }

  function lifeDay(S, day, birthday) {
    if (!S.stats) assignFamilies(S);
    // cumpleaños: jubilaciones y muertes por la edad
    if (birthday) {
      S.villagers.slice().forEach(function (v) {
        if (v.age >= 67 && ['jubilado', 'cura', 'niño'].indexOf(v.job) < 0) {
          const old = jobName(v); v.job = 'jubilado';
          log(S, v.name + ' se jubila después de toda una vida de ' + old, '🎂 ' + v.name + ' se jubila', 2, [v.id]);
        }
        if (v.age >= 72 && rnd(S) < Math.min(0.9, (v.age - 70) * 0.03) * (isBuilt(S, 'consultorio') ? 0.6 : 1)) die(S, v);
      });
    }
    // partos y adopciones que tocan hoy
    S.preg = (S.preg || []).filter(function (p) {
      if (p.due > day) return true;
      const a = byId(S, p.a), b = byId(S, p.b);
      if (a && b) birth(S, a, b);
      return false;
    });
    // nuevas parejas que esperan un bebé
    if (S.villagers.length < MAX_POP) {
      const seen = {};
      S.villagers.forEach(function (a) {
        const b = a.partner && byId(S, a.partner);
        if (!b || !a.married || seen[a.id] || !isAdult(a) || !isAdult(b)) return;
        seen[a.id] = seen[b.id] = 1;
        if (S.preg.some(function (p) { return p.a === a.id || p.b === a.id; })) return;
        const kidsHome = S.villagers.filter(function (o) { return o.home === a.home && !isAdult(o); }).length;
        if (kidsHome >= 3) return;
        const last = Math.max.apply(null, [-99].concat(childrenOf(S, a).map(function (k) { return k.born; })));
        if (day - last < 12) return;
        const mixed = a.sex !== b.sex, mother = mixed ? (a.sex === 'f' ? a : b) : null;
        if (mixed && (mother.age < 20 || mother.age > 44)) return;
        if (!mixed && (a.age > 50 || b.age > 50)) return;
        const happy = (moodScore(a) + moodScore(b)) / 2 > 45 && getRel(S, a.id, b.id) > 50;
        if (!happy || rnd(S) > (mixed ? 0.05 : 0.015)) return;
        const due = day + (mixed ? 6 : 3);
        S.preg.push({ a: mixed ? mother.id : a.id, b: mixed ? (mother === a ? b.id : a.id) : b.id, due: due });
        if (mixed) log(S, mother.name + ' está embarazada: ' + (mother === a ? b.name : a.name) + ' y ella esperan un bebé, y ' + (has(a, 'cotilla') || has(b, 'cotilla') ? 'ya lo sabe todo el pueblo' : 'lo cuentan a quien quiera oírlo'),
          '🤰 ' + a.name + ' y ' + b.name + ' esperan un bebé', 3, [a.id, b.id]);
        else log(S, a.name + ' y ' + b.name + ' han empezado los papeles para adoptar', '📝 ' + a.name + ' y ' + b.name + ' quieren adoptar', 2, [a.id, b.id]);
      });
    }
    // éxodo rural: jóvenes sin pareja que no están a gusto se van a la ciudad
    if (S.villagers.length > 14) {
      S.villagers.slice().forEach(function (v) {
        if (!isAdult(v) || v.age > 32 || v.partner || v.job === 'cura') return;
        if (S.biz && Object.keys(S.biz).some(function (k) { return S.biz[k].owner === v.id; })) return;
        const unhappy = moodScore(v) < 42 || v.money < 15;
        const p = (unhappy ? 0.04 : 0.004) * (S.level >= 4 ? 0.4 : S.level >= 2 ? 0.7 : 1);
        if (rnd(S) < p) {
          const dest = pick(S, ['Madrid', 'Barcelona', 'Valencia', 'Bilbao', 'Sevilla', 'Zaragoza']);
          removeVillager(S, v, false);
          S.stats.left++;
          log(S, v.name + ' ha hecho las maletas y se ha ido a vivir a ' + dest + '. «Aquí no hay futuro», dice. En la plaza no se habla de otra cosa',
            '🚌 ' + v.name + ' se va a ' + dest, 3, [v.id]);
          milestone(S, '🚌', v.name + ' se marcha a ' + dest + ' a buscarse la vida');
        }
      });
    }
  }
  // ---------- Vivienda: cada casa tiene un tope de gente; si no caben, se construye otra ----------
  function builtHomes(S) { return HOMES.filter(function (b) { return S.houses[b.id] !== undefined; }); }
  function occupants(S, id) { return S.villagers.filter(function (v) { return v.home === id; }); }
  function freeHome(S, need, emptyOnly) {
    const c = builtHomes(S).map(function (b) { return { b: b, n: occupants(S, b.id).length }; })
      .filter(function (x) { return (emptyOnly ? x.n === 0 : true) && x.n + need <= x.b.cap; })
      .sort(function (a, b) { return a.n - b.n; });
    return c.length ? c[0].b : null;
  }
  function addressOf(b) { return b && b.street ? b.street + ', ' + b.num : null; }
  function familyOf(S, a) {
    // la pareja y sus hijos menores que viven con ellos
    const p = a.partner && byId(S, a.partner);
    return [a].concat(p ? [p] : []).concat(S.villagers.filter(function (k) {
      return !isAdult(k) && ((k.parents || []).indexOf(a.id) >= 0 || (p && (k.parents || []).indexOf(p.id) >= 0));
    }));
  }
  function whoNeedsHome(S) {
    // 1) matrimonios que no viven juntos o que comparten casa con otros adultos
    for (let i = 0; i < S.villagers.length; i++) {
      const a = S.villagers[i], b = a.partner && byId(S, a.partner);
      if (!b || !a.married || a.id > b.id) continue;
      const fam = familyOf(S, a);
      const crowd = a.home !== b.home || occupants(S, a.home).some(function (o) { return fam.indexOf(o) < 0 && isAdult(o); });
      if (crowd) return { who: fam, why: 'pareja' };
    }
    // 2) casas con más gente de la que cabe: se va el adulto joven sin pareja
    const over = builtHomes(S).find(function (b) { return occupants(S, b.id).length > b.cap; });
    if (over) {
      const young = occupants(S, over.id).filter(function (o) { return isAdult(o) && !o.partner; }).sort(function (x, y) { return x.age - y.age; })[0];
      if (young) return { who: [young], why: 'sitio' };
      const couple = occupants(S, over.id).find(function (o) { return o.married; });
      if (couple) return { who: familyOf(S, couple), why: 'sitio' };
    }
    return null;
  }
  function moveIn(S, who, b) {
    who.forEach(function (v) { v.home = b.id; if (v.inside && v.inside !== b.id && HOMES.indexOf(BY_ID[v.inside]) >= 0) v.actUntil = S.time; });
  }
  function housingDay(S) {
    const ob = S.homeObra;
    if (ob && S.time >= ob.until) {
      const b = BY_ID[ob.id];
      S.houses[ob.id] = 0; S.homeObra = null;
      const who = (ob.who || []).map(function (id) { return byId(S, id); }).filter(Boolean);
      const need = whoNeedsHome(S);
      const movers = who.length ? who : need ? need.who : [];
      if (movers.length) moveIn(S, movers, b);
      const fam = movers[0] ? (movers.length > 1 ? 'los ' + movers[0].sur : movers[0].name) : 'una familia';
      log(S, fam.charAt(0).toUpperCase() + fam.slice(1) + ' estrena' + (movers.length > 1 ? 'n' : '') + ' casa en ' + addressOf(b) + '. El pueblo crece calle a calle',
        '🏠 Casa nueva en ' + b.street, 3, movers.map(function (v) { return v.id; }), { house: b.id });
      milestone(S, '🏠', 'Se levanta una casa nueva en ' + addressOf(b) + (movers[0] ? ' para ' + fam : ''));
      addFame(S, 4);
      return;
    }
    if (ob) return;
    const need = whoNeedsHome(S);
    if (!need) return;
    const empty = freeHome(S, need.who.length, true);
    if (empty) {
      moveIn(S, need.who, empty);
      log(S, (need.who.length > 1 ? need.who[0].name + ' y familia se mudan' : need.who[0].name + ' se muda') + ' a ' + addressOf(empty), '📦 Mudanza a ' + empty.street, 2, need.who.map(function (v) { return v.id; }));
      return;
    }
    const lot = HOMES.find(function (b) { return S.houses[b.id] === undefined; });
    if (!lot) return;
    S.homeObra = { id: lot.id, start: Math.round(S.time), until: Math.round(S.time + 2 * DAY), who: need.who.map(function (v) { return v.id; }) };
    log(S, 'empiezan las obras de una casa en ' + addressOf(lot) + ' para ' + (need.who.length > 1 ? need.who[0].name + ' y familia' : need.who[0].name),
      '🚧 Se construye una casa en ' + lot.street, 2, need.who.map(function (v) { return v.id; }));
  }
  function homeProgress(S, id) {
    if (S.houses[id] !== undefined) return 1;
    const ob = S.homeObra;
    if (!ob || ob.id !== id) return 0;
    return clamp((S.time - ob.start) / (ob.until - ob.start), 0.01, 0.99);
  }

  function findDeceased(S, name) {
    const n = norm(name);
    if (!n) return null;
    return (S.deceased || []).slice().reverse().find(function (d) { const k = norm(d.name); return k === n || k.indexOf(n) === 0 || n.indexOf(k) === 0; }) || null;
  }
  function describeDeceased(S, d) {
    return d.name + ' ' + (d.sur || '') + ' murió el día ' + d.d + ', a los ' + d.age + ' años. Descanse en paz.';
  }
  function families(S) {
    const map = {};
    S.villagers.forEach(function (v) { (map[v.sur] = map[v.sur] || []).push(v); });
    return Object.keys(map).map(function (k) {
      const m = map[k].slice().sort(function (a, b) { return b.age - a.age; });
      return { sur: k, members: m, money: Math.round(m.reduce(function (s, v) { return s + v.money; }, 0)), dead: (S.deceased || []).filter(function (d) { return d.sur === k; }).length,
        biz: Object.keys(S.biz).filter(function (b) { return S.biz[b].owner && m.some(function (v) { return v.id === S.biz[b].owner; }); }) };
    }).sort(function (a, b) { return b.members.length - a.members.length || b.money - a.money; });
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
    if (place === 'campo') {
      const f = FIELDS[(v.offset + 40) % 5 < 3 ? 0 : (v.offset + 40) % 5 === 3 ? 1 : 2];
      return randomTile(S, f, function (c, r) { return tileAt(c, r) === FIELD; });
    }
    if (place === 'patrulla') {
      const s = STREETS[Math.floor(rnd(S) * 7)], t = s.tiles[Math.floor(rnd(S) * s.tiles.length)];
      return passable(S, t[0], t[1]) ? { c: t[0], r: t[1] } : placeTile(S, 'plaza', v);
    }
    if (place === 'puesto') {
      const sellers = S.villagers.filter(function (o) { return o.job === 'agricultor' && isAdult(o); });
      const i = Math.max(0, sellers.indexOf(v));
      return { c: STALL_COLS[i % STALL_COLS.length] + (i >= STALL_COLS.length ? 1 : 0), r: STALL_ROW + 1 };
    }
    if (place === 'obra') {
      const lb = obraBuilding(S);
      if (lb) {
        const spots = [[lb.c - 1, lb.dr - 1], [lb.c + lb.w, lb.dr - 1], [lb.dc - 1, lb.dr], [lb.dc + 1, lb.dr], [lb.c - 1, lb.r + 1], [lb.c + lb.w, lb.r + 1]]
          .filter(function (p) { return passable(S, p[0], p[1]); });
        if (spots.length) { const s = spots[(v.offset + 40) % spots.length]; return { c: s[0], r: s[1] }; }
        return { c: lb.dc, r: lb.dr };
      }
      return placeTile(S, 'plaza', v);
    }
    const b = building(place);
    return { c: b.dc, r: b.dr };
  }
  function isIndoor(place) { return place !== 'plaza' && place !== 'campo' && place !== 'puesto' && place !== 'obra' && place !== 'patrulla'; }

  function desired(S, v) {
    const h = hourOf(S), wd = wdOf(S), day = dayOf(S), rain = S.weather === 'lluvia';
    const o = v.offset / 60;
    const sleepStart = (v.age < 14 ? 21.5 : v.age > 70 ? 22 : has(v, 'juerguista') ? 24.5 : 23.3) + o;
    const wake = (v.age > 70 ? 7 : 7.5) + o;
    const hh = h < 5 ? h + 24 : h;
    if (hh >= sleepStart || h < wake) return { act: 'dormir', place: v.home, dur: 30 };
    if (v.age < 4) return { act: 'en casa', place: v.home, dur: 60 };
    if (S.funeral && S.time >= S.funeral.from && S.time < S.funeral.until && (isAdult(v) || v.age >= 10) && (v.offset + 40) % 4 !== 0) return { act: 'entierro', place: 'iglesia', dur: 60 };
    if (fiestaOn(S)) return { act: 'fiesta', place: 'plaza', dur: 30 };
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
    // lo que va trayendo el progreso del pueblo
    if (v.job === 'niño' && wd < 5 && h >= 9 && h < 14 && isBuilt(S, 'escuela')) return { act: 'ir al cole', place: 'escuela', dur: 60 };
    if (obraBuilding(S) && work && wd < 6 && !rain && (v.job === 'agricultor' || v.job === 'jubilado') && isAdult(v) &&
      (v.offset + dayOf(S)) % 3 === 0) return { act: 'trabajar en la obra', place: 'obra', dur: 50 };
    // servicios públicos
    if (v.job === 'médico' && work && wd < 5) return { act: 'pasar consulta', place: 'consultorio', dur: 60 };
    if (v.job === 'guardia' && ((h >= 10 && h < 14) || (h >= 17 && h < 21.5))) return { act: 'patrullar', place: 'patrulla', dur: 25 };
    if (v.age >= 65 && isBuilt(S, 'consultorio') && h >= 10 && h < 12.5 && (day + v.offset + 40) % 7 === 0 && v.days.medico !== day) { v.days.medico = day; return { act: 'ir al médico', place: 'consultorio', dur: 30 }; }
    if (isAdult(v) && wd === 0 && h >= 10 && h < 12.5 && v.days.papeles !== day && rnd(S) < 0.08) { v.days.papeles = day; return { act: 'hacer papeles', place: 'ayuntamiento', dur: 20 }; }
    if (isAdult(v) && isBuilt(S, 'quiosco') && h >= 8 && h < 11 && v.days.periodico !== day && rnd(S) < 0.12) return { act: 'comprar el periódico', place: 'quiosco', dur: 10, buy: 'periodico' };
    if (isAdult(v) && isBuilt(S, 'tienda') && ((h >= 10 && h < 13.5) || (h >= 17.5 && h < 20)) && v.days.tienda !== day && v.money > 20 &&
      (!S.biz.tienda || S.biz.tienda.owner !== v.id) && rnd(S) < 0.2) return { act: 'hacer la compra', place: 'tienda', dur: 20, buy: 'tienda' };
    if (S.biz.tienda && S.biz.tienda.owner === v.id && work && wd < 6) return { act: 'atender la tienda', place: 'tienda', dur: 60 };
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
    } else if (d.buy === 'tienda') {
      v.days.tienda = day;
      const t = S.biz.tienda;
      if (t && pay(S, v, t.owner, t.price)) { t.sales = (t.sales || 0) + 1; v.needs.hunger = clamp(v.needs.hunger - 5, 0, 100); }
    } else if (d.buy === 'periodico') {
      v.days.periodico = day;
      pay(S, v, null, 1.5);
    } else if (d.buy === 'mercado') {
      v.days.mercado = day;
      const sellers = S.villagers.filter(function (o) { return o.job === 'agricultor' && isAdult(o) && o.id !== v.id; });
      if (sellers.length) pay(S, v, pick(S, sellers).id, PRICES.mercado);
    }
  }

  function decide(S, v, teleport) {
    const d = desired(S, v);
    if (d.buy && (v.act !== d.act || v.actPlace !== d.place)) spend(S, v, d);
    if ((d.act === 'misa' || d.act === 'entierro') && v.act !== d.act) addFaith(S, d.act === 'misa' ? 0.8 : 0.4);
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
    if (Math.floor(S.time / 30) !== Math.floor(before / 30)) dilemmaTick(S, before);
  }

  function wander(S, v, place) {
    const p = placeTile(S, place, v);
    const route = findPath(S, Math.floor(v.x / T), Math.floor(v.y / T), p.c, p.r);
    if (route) v.path = route;
  }

  function weatherTick(S) {
    if (S.forceRain && dayOf(S) >= S.forceRain && hourOf(S) >= 12) {   // la lluvia que trajo la procesión
      S.forceRain = 0; S.weather = 'lluvia'; S.weatherUntil = S.time + 240; S.harvest = clamp(S.harvest + 12, 0, 100);
      log(S, 'después de la procesión, ¡ha llovido! Las beatas dicen que es un milagro, y los agricultores no las contradicen', '🙏 Llueve tras la procesión', 3);
      return;
    }
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
      const maxLvl = S.level >= 3 ? 3 : 2;
      const reformFund = lvl === 0 ? 500 : 700;
      if (lvl !== undefined && lvl < maxLvl && isHead && v.money > reformFund && (has(v, 'trabajador') || has(v, 'ahorrador') || memOf(v, 'loteria') || lvl === 0) && rnd(S) < 0.3) {
        v.money -= PRICES.reforma; S.houses[v.home] = lvl + 1;
        const what = ['puesto macetas y arreglado la fachada de su casa', 'pintado la casa y cambiado la puerta', 'hecho un balcón lleno de geranios en su casa'][lvl];
        log(S, v.name + ' ha ' + what + ', y ha quedado preciosa', '🏡 ' + v.name + ' arregla la casa', 2, [v.id], { house: v.home });
        addFame(S, 5);
        if (lvl + 1 === 3) milestone(S, '🌺', v.name + ' estrena balcón: su casa es ya de las más bonitas del pueblo');
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
    lifeDay(S, day, day % 7 === 1);
    housingDay(S);
    townDay(S);
  }

  function comeOfAge(S, v) {
    const family = S.villagers.filter(function (o) { return o.home === v.home && o !== v && isAdult(o); });
    const jobs = ['agricultor', 'costurero', 'panadero', 'tabernero'];
    v.job = family.length && family[0].job !== 'jubilado' && family[0].job !== 'cura' && rnd(S) < 0.6 ? family[0].job : pick(S, jobs);
    v.money = 30;
    log(S, v.name + ' ya es mayor de edad y empieza a trabajar de ' + jobName(v), '🎓 ' + v.name + ' empieza a trabajar', 2, [v.id]);
    milestone(S, '🎓', v.name + ' cumple 18 años y empieza a trabajar de ' + jobName(v));
  }

  // Un suceso pequeño casi cada día, para que siempre haya algo que contar
  function dailyStory(S, day) {
    const ad = adults(S), kids = S.villagers.filter(function (v) { return !isAdult(v) && v.age >= 5; });
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
        const p = 0.12 * Math.sqrt(soc(a) * soc(b)) * (fiestaOn(S) ? 2 : 1);
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
    if (fiestaOn(S)) delta += 2;
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
      const ctx = r1 < -30 ? 'roce' : a.partner === b.id ? 'pareja' : a.crush === b.id ? 'crush' : fiestaOn(S) ? 'fiesta'
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
    milestone(S, '💕', a.name + ' y ' + b.name + ' empiezan a salir');
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
    if (stake >= 16 && ((has(lose, 'gruñón') && rnd(S) < 0.5) || lose.money < 10) && !(isBuilt(S, 'cuartel') && rnd(S) < 0.5)) {
      addRel(S, a.id, b.id, -15); remember(lose, 'rencor', win.id, stake, S.time);
      log(S, 'la partida de mus entre ' + win.name + ' y ' + lose.name + ' acabó en bronca: ' + lose.name + ' perdió ' + euros(stake) + ' y dice que hubo trampa', '🃏 Bronca en el mus', 3, [win.id, lose.id]);
    } else {
      log(S, win.name + ' le ganó ' + euros(stake) + ' a ' + lose.name + ' al mus', '🃏 ' + win.name + ' gana al mus', 1, [win.id, lose.id]);
    }
  }

  function wedding(S, a, b) {
    // se van a vivir juntos a la casa de quien viva con menos gente, si caben; si no, piden casa (housingDay)
    const room = function (x, other) { const b = BY_ID[x.home]; const n = S.villagers.filter(function (v) { return v.home === x.home; }).length; return b && b.cap ? b.cap - n : 0; };
    const alone = function (x) { return S.villagers.every(function (o) { return o === x || o.home !== x.home || (o.parents || []).indexOf(x.id) >= 0; }); };
    if (alone(a) && room(a) >= 1) b.home = a.home;
    else if (alone(b) && room(b) >= 1) a.home = b.home;
    a.married = b.married = true;
    S.fiestaUntil = Math.max(S.fiestaUntil, S.time + 180); S.fiestaFrom = Math.min(S.fiestaFrom || 0, S.time);
    milestone(S, '💒', 'Boda de ' + a.name + ' y ' + b.name);
    addFame(S, 20); addFaith(S, 4);
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
  // Lo que cuesta cada poder en fe. La fe sube con las misas, las fiestas, las bodas y los vecinos contentos.
  const POWER_COST = { sol: 8, lluvia: 10, fiesta: 15, forastero: 20, bendecir: 25, loteria: 35, estrellas: 30, aparicion: 60, langostas: 0 };
  function faithOf(S) { if (S.faith === undefined) S.faith = 50; return S.faith; }
  function addFaith(S, n) { S.faith = clamp(faithOf(S) + n, 0, 100); S.faithToday = (S.faithToday || 0) + n; }
  function canAfford(S, power) { return faithOf(S) >= (POWER_COST[power] || 0); }
  function applyPower(S, power, opts) {
    const cost = POWER_COST[power] || 0;
    if (!canAfford(S, power)) {
      return 'Al santo no le queda fe suficiente: hacen falta ' + cost + ' puntos y ahora hay ' + Math.floor(faithOf(S)) + '. La fe sube con las misas, las fiestas y los vecinos contentos.';
    }
    const text = applyPowerInner(S, power, opts);
    if (text) S.faith = clamp(faithOf(S) - cost, 0, 100);
    return text;
  }
  function applyPowerInner(S, power, opts) {
    opts = opts || {};
    switch (power) {
      case 'aparicion': {
        // el santo se aparece en la plaza: todo el pueblo lo ve, nadie lo olvida
        S.apparitionUntil = S.time + 90;
        S.villagers.forEach(function (v) {
          v.needs.social = clamp(v.needs.social - 40, 0, 100); v.needs.energy = clamp(v.needs.energy + 20, 0, 100);
          remember(v, 'milagro', null, 0, S.time);
          if (v.act !== 'dormir' && !v.inside) v.actUntil = S.time;
        });
        const cura = S.villagers.find(function (o) { return o.job === 'cura'; });
        if (cura) S.villagers.forEach(function (o) { if (has(o, 'religioso')) addRel(S, o.id, cura.id, 8); });
        addFame(S, 15);
        log(S, '¡el santo se ha aparecido sobre la fuente de la plaza! Medio pueblo lo vio, y la otra mitad dice que también', '😇 ¡Aparición del santo en la plaza!', 4);
        milestone(S, '😇', 'El santo se aparece sobre la fuente de la plaza');
        return 'Una luz dorada baja sobre la fuente de la plaza. El pueblo entero se queda sin palabras.';
      }
      case 'estrellas': {
        // lluvia de estrellas: esta noche, amores
        const today = Math.floor(S.time / DAY) * DAY, from = hourOf(S) < 21 ? today + 21.5 * 60 : S.time;
        S.starsFrom = from; S.starsUntil = from + 4 * 60;
        const singles = S.villagers.filter(single);
        for (let k = 0; k < 3 && singles.length > 1; k++) {
          const a = pick(S, singles), b = pick(S, singles.filter(function (o) { return o !== a && Math.abs(o.age - a.age) <= 15; }));
          if (b) addRel(S, a.id, b.id, 15);
        }
        log(S, 'esta noche habrá lluvia de estrellas, y en el pueblo ya hay quien piensa pedir un deseo en compañía', '🌠 Lluvia de estrellas esta noche', 2);
        return 'Esta noche habrá lluvia de estrellas. Dicen que trae amores.';
      }
      case 'langostas': {
        // castigo: plaga en el campo; el miedo llena la iglesia
        S.locustUntil = S.time + 180;
        S.harvest = clamp(S.harvest - 35, 0, 100);
        S.villagers.forEach(function (v) { v.needs.social = clamp(v.needs.social + 15, 0, 100); if (v.job === 'agricultor' && isAdult(v)) v.money = Math.max(0, v.money - 20); });
        addFaith(S, 15);
        log(S, 'una plaga de langostas ha arrasado el campo. Las beatas dicen que es un castigo, y la iglesia se ha llenado de golpe', '🦗 Plaga de langostas en el campo', 3);
        return 'Una nube de langostas cae sobre los campos. Castigo divino, dicen. La iglesia se llena.';
      }
      case 'lluvia':
        S.weather = 'lluvia'; S.weatherUntil = S.time + 180; S.harvest = clamp(S.harvest + 8, 0, 100);
        if (fiestaOn(S)) {
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
        S.fiestaUntil = S.time + 240; S.fiestaFrom = S.time;
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

  // =====================================================================
  // DILEMAS DEL SANTO: casi cada mañana el pueblo pide que decidas algo
  // =====================================================================
  function later(S, text, short, imp) { S.followups.push({ day: dayOf(S) + 1, text: text, short: short, imp: imp || 2 }); }
  function adultsWhere(S, f) { return adults(S).filter(function (v) { return v.job !== 'cura' && f(v); }); }
  function orchestra(S, startH, hours) {   // fiesta de mañana a esa hora
    const tomorrow = (Math.floor(S.time / DAY) + 1) * DAY;
    S.fiestaFrom = tomorrow + startH * 60; S.fiestaUntil = S.fiestaFrom + hours * 60;
  }
  function collect(S, amount, to) {   // cada adulto con dinero pone su parte
    let total = 0;
    adultsWhere(S, function (v) { return v.money > amount * 3 && v !== to; }).forEach(function (v) { v.money -= amount; total += amount; });
    if (to) to.money += total;
    return total;
  }
  const DILEMMAS = [
    { id: 'iglesia_puente', every: 8,
      when: function (S) { return {}; },
      text: function (S, c) { return 'El tejado de la iglesia tiene goteras y el puente del río cruje. En el ayuntamiento solo hay dinero para una obra.'; },
      opts: [
        { label: 'Arreglar la iglesia', apply: function (S) { addFaith(S, 15); const cura = S.villagers.find(function (o) { return o.job === 'cura'; }); later(S, 'ya han arreglado el tejado de la iglesia' + (cura ? ': ' + cura.name + ' da misa sin goteras' : ''), '⛪ Iglesia sin goteras'); return 'Se arregla la iglesia. Los devotos te lo agradecen (+15 de fe).'; } },
        { label: 'Arreglar el puente', apply: function (S) { addFame(S, 10); adultsWhere(S, function (v) { return v.job === 'agricultor'; }).forEach(function (v) { v.needs.social = clamp(v.needs.social - 15, 0, 100); }); later(S, 'el puente del río ya no cruje: los agricultores cruzan sin miedo con el remolque', '🌉 Puente arreglado'); return 'Se arregla el puente. Los agricultores, encantados (+10 de fama).'; } }
      ], none: 'Como nadie se puso de acuerdo, no se arregló ni la iglesia ni el puente' },
    { id: 'robo', every: 6,
      when: function (S) {
        const x = adultsWhere(S, function (v) { return v.money < 25; })[0], y = x && adultsWhere(S, function (v) { return v.money > 200 && v !== x; })[0];
        return x && y ? { x: x.id, y: y.id } : null;
      },
      text: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); return 'Han pillado a ' + x.name + ' robándole gallinas a ' + y.name + '. Dice que no llega a fin de mes.'; },
      opts: [
        { label: 'Perdonarle', apply: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); addRel(S, y.id, x.id, -10); remember(x, 'favor', y.id, 0, S.time); x.needs.social = clamp(x.needs.social - 20, 0, 100); addFaith(S, 5); later(S, x.name + ' le ha devuelto las gallinas a ' + y.name + ' con una docena de huevos de propina', '🥚 ' + x.name + ' devuelve las gallinas'); return x.name + ' se libra. ' + y.name + ' refunfuña, pero el pueblo aplaude tu clemencia.'; } },
        { label: 'Que pague una multa', apply: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); if (!pay(S, x, y.id, 20)) x.money = 0; addRel(S, x.id, y.id, -15); remember(x, 'rencor', y.id, 20, S.time); addFame(S, 3); later(S, x.name + ' está trabajando en el corral de ' + y.name + ' para pagar lo que debe', '🐔 ' + x.name + ' paga su multa'); return x.name + ' paga la multa. ' + y.name + ' queda ' + g(y, 'satisfecho', 'satisfecha') + '; ' + x.name + ', no tanto.'; } }
      ], def: 1 },
    { id: 'orquesta', every: 7,
      when: function (S) { return fiestaOn(S) ? null : {}; },
      text: function () { return 'La comisión de fiestas quiere traer una orquesta mañana por la noche. Cada vecino tendría que poner 8 euros.'; },
      opts: [
        { label: 'Traer la orquesta', apply: function (S) { collect(S, 8); orchestra(S, 21, 5); S.villagers.forEach(function (v) { if (has(v, 'juerguista')) v.needs.social = clamp(v.needs.social - 20, 0, 100); }); return 'Mañana a las nueve, ¡orquesta en la plaza!'; } },
        { label: 'Ahorrar el dinero', apply: function (S) { S.villagers.forEach(function (v) { if (has(v, 'juerguista')) v.needs.social = clamp(v.needs.social + 20, 0, 100); if (has(v, 'ahorrador')) v.needs.social = clamp(v.needs.social - 10, 0, 100); }); return 'Los ahorradores respiran tranquilos. Los juerguistas, no.'; } }
      ], def: 1 },
    { id: 'temporeros', every: 10,
      when: function (S) { return S.villagers.length < 40 ? {} : null; },
      text: function () { return 'Una pareja de temporeros que vino a la vendimia pregunta si se puede quedar a vivir en el pueblo.'; },
      opts: [
        { label: 'Acogerlos', apply: function (S) { stranger(S, null, 'agricultor'); const a = S.villagers[S.villagers.length - 1]; stranger(S, null, 'agricultor'); const b = S.villagers[S.villagers.length - 1]; if (a.sex !== b.sex || rnd(S) < 0.3) { a.partner = b.id; b.partner = a.id; a.married = b.married = true; setRel(S, a.id, b.id, 80); b.home = a.home; b.sur = a.sur; } return 'Bienvenidos: ' + a.name + ' y ' + b.name + ' se quedan en el pueblo.'; } },
        { label: 'Que sigan su camino', apply: function (S) { addFaith(S, -5); return 'Los temporeros se van por la carretera. Alguno en la plaza te lo reprocha (−5 de fe).'; } }
      ], def: 1 },
    { id: 'linde', every: 8,
      when: function (S) {
        const f = adultsWhere(S, function (v) { return v.job === 'agricultor'; });
        for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) if (getRel(S, f[i].id, f[j].id) < 15 && f[i].home !== f[j].home) return { x: f[i].id, y: f[j].id };
        return null;
      },
      text: function (S, c) { return byId(S, c.x).name + ' y ' + byId(S, c.y).name + ' discuten por una linde del campo. Cada uno jura que el mojón estaba en otro sitio.'; },
      opts: [
        { label: function (S, c) { return 'Dar la razón a ' + byId(S, c.x).name; }, apply: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); x.needs.social = clamp(x.needs.social - 20, 0, 100); addRel(S, y.id, x.id, -15); remember(y, 'rencor', x.id, 0, S.time); return x.name + ' se queda con la linde. ' + y.name + ' no se lo perdona.'; } },
        { label: function (S, c) { return 'Dar la razón a ' + byId(S, c.y).name; }, apply: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); y.needs.social = clamp(y.needs.social - 20, 0, 100); addRel(S, x.id, y.id, -15); remember(x, 'rencor', y.id, 0, S.time); return y.name + ' se queda con la linde. ' + x.name + ' no se lo perdona.'; } }
      ], none: 'Como el santo no dijo nada, la linde sigue en disputa y la cosa acabó a gritos' },
    { id: 'declaracion', every: 6,
      when: function (S) {
        const s = S.villagers.filter(single);
        for (let i = 0; i < s.length; i++) for (let j = 0; j < s.length; j++) {
          const r = getRel(S, s[i].id, s[j].id);
          if (i !== j && r >= 25 && r < 60 && Math.abs(s[i].age - s[j].age) <= 15) return { x: s[i].id, y: s[j].id };
        }
        return null;
      },
      text: function (S, c) { return byId(S, c.x).name + ' quiere declararse a ' + byId(S, c.y).name + ', pero le da vergüenza. Ha encendido una vela al santo pidiendo consejo.'; },
      opts: [
        { label: 'Que se lance', apply: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); if (getRel(S, x.id, y.id) >= 35 || has(y, 'romántico') || rnd(S) < 0.5) { startDating(S, x, y, x.name + ' se le declaró a ' + y.name + ' animado por el santo, ¡y ' + y.name + ' le dijo que sí!'); return '¡' + y.name + ' le ha dicho que sí a ' + x.name + '!'; } addRel(S, x.id, y.id, -8); x.needs.social = clamp(x.needs.social + 30, 0, 100); log(S, x.name + ' se le declaró a ' + y.name + ', y ' + y.name + ' le dijo que mejor como amigos', '💔 Calabazas para ' + x.name, 3, [x.id, y.id]); return 'Calabazas. ' + y.name + ' prefiere que sean amigos.'; } },
        { label: 'Mejor esperar', apply: function (S, c) { const x = byId(S, c.x), y = byId(S, c.y); x.crush = y.id; addRel(S, x.id, y.id, 6); return x.name + ' esperará. Mientras, se hace el encontradizo con ' + y.name + '.'; } }
      ], def: 1 },
    { id: 'colecta', every: 9,
      when: function (S) { const k = Object.keys(S.biz).find(function (b) { const o = byId(S, S.biz[b].owner); return o && o.money < 120; }); return k ? { b: k } : null; },
      text: function (S, c) { const o = byId(S, S.biz[c.b].owner); return 'A ' + o.name + ' le va mal ' + (BY_ID[c.b] ? BY_ID[c.b].name : 'el negocio') + ' y no llega a pagar las facturas. Hay quien propone una colecta.'; },
      opts: [
        { label: 'Hacer una colecta', apply: function (S, c) { const o = byId(S, S.biz[c.b].owner), t = collect(S, 10, o); adults(S).forEach(function (v) { if (v !== o) addRel(S, o.id, v.id, 5); }); return 'El pueblo reúne ' + euros(t) + ' para ' + o.name + '.'; } },
        { label: 'Que se apañe', apply: function (S, c) { const biz = S.biz[c.b], o = byId(S, biz.owner); biz.price = Math.round((biz.price + 0.5) * 100) / 100; o.needs.social = clamp(o.needs.social + 25, 0, 100); later(S, o.name + ' ha tenido que subir los precios para salir adelante', '💶 ' + o.name + ' sube los precios'); return o.name + ' tendrá que subir los precios.'; } }
      ], def: 1 },
    { id: 'sequia', every: 6,
      when: function (S) { return S.harvest < 45 ? {} : null; },
      text: function () { return 'El campo se está secando. El cura propone sacar al santo en procesión; los agricultores prefieren cavar un pozo nuevo.'; },
      opts: [
        { label: 'Procesión', apply: function (S) { addFaith(S, 10); S.forceRain = dayOf(S) + 1; return 'Mañana sale la procesión. Y dicen que después lloverá…'; } },
        { label: 'Pozo nuevo', apply: function (S) { collect(S, 10); S.harvest = clamp(S.harvest + 20, 0, 100); later(S, 'ya hay pozo nuevo en el campo: el agua sale fresquísima', '💧 Pozo nuevo en el campo'); return 'Se cava el pozo: la cosecha respira (+20 %).'; } }
      ], def: 1 },
    { id: 'joven', every: 8,
      when: function (S) { const x = adultsWhere(S, function (v) { return v.age <= 30 && !v.partner && moodScore(v) < 60 && !Object.keys(S.biz).some(function (b) { return S.biz[b].owner === v.id; }); })[0]; return x && S.villagers.length > 14 ? { x: x.id } : null; },
      text: function (S, c) { return byId(S, c.x).name + ' dice que en el pueblo no hay futuro y que se quiere ir a la ciudad.'; },
      opts: [
        { label: 'Convencerle para quedarse', apply: function (S, c) { const x = byId(S, c.x); x.needs.social = clamp(x.needs.social - 40, 0, 100); x.money += 60; remember(x, 'favor', null, 0, S.time); addFaith(S, -5); later(S, x.name + ' ha encontrado trabajo en el pueblo y ya no habla de marcharse', '🙌 ' + x.name + ' se queda'); return x.name + ' se queda. Le ha salido un trabajillo (−5 de fe).'; } },
        { label: 'Dejarle marchar', apply: function (S, c) { const x = byId(S, c.x), dest = pick(S, ['Madrid', 'Barcelona', 'Valencia', 'Bilbao', 'Sevilla']); removeVillager(S, x, false); S.stats.left++; milestone(S, '🚌', x.name + ' se marcha a ' + dest + ' con la bendición del santo'); return x.name + ' se va a ' + dest + '. Le despiden en la parada del autobús.'; } }
      ], def: 1 },
    { id: 'vaquilla', every: 10,
      when: function (S) { return S.level >= 2 && !fiestaOn(S) ? {} : null; },
      text: function () { return 'Para las fiestas de mañana, unos quieren un concurso de paellas y otros, una vaquilla en la plaza.'; },
      opts: [
        { label: 'Concurso de paellas', apply: function (S) { orchestra(S, 13, 4); S.villagers.forEach(function (v) { v.needs.hunger = clamp(v.needs.hunger - 20, 0, 100); }); later(S, 'el concurso de paellas lo ganó ' + pick(S, adults(S)).name + ', y todavía hay quien dice que llevaba demasiado azafrán', '🥘 Concurso de paellas'); return 'Mañana a la una, ¡paellas en la plaza!'; } },
        { label: 'Vaquilla', apply: function (S) { orchestra(S, 18, 4); const j = S.villagers.filter(function (v) { return has(v, 'juerguista') && isAdult(v); }); j.forEach(function (v) { v.needs.social = clamp(v.needs.social - 30, 0, 100); }); if (j.length && rnd(S) < 0.4) { const h = pick(S, j); h.money = Math.max(0, h.money - 30); later(S, 'la vaquilla le dio un revolcón a ' + h.name + ', que se pasará unos días con el brazo en cabestrillo', '🐂 Revolcón para ' + h.name, 3); } else later(S, 'la vaquilla fue un éxito y nadie acabó en el consultorio', '🐂 Vaquilla sin sustos'); return 'Mañana por la tarde, ¡vaquilla! Que el santo nos pille confesados.'; } }
      ], def: 0 },
    { id: 'campanas', every: 9,
      when: function (S) { const cura = S.villagers.find(function (o) { return o.job === 'cura'; }), gr = adultsWhere(S, function (v) { return has(v, 'gruñón'); }); return cura && gr.length ? { c: cura.id, g: gr[0].id } : null; },
      text: function (S, c) { return byId(S, c.c).name + ' quiere tocar las campanas a las siete de la mañana. ' + byId(S, c.g).name + ' y otros vecinos amenazan con quejarse.'; },
      opts: [
        { label: 'Que suenen las campanas', apply: function (S, c) { addFaith(S, 8); adultsWhere(S, function (v) { return has(v, 'gruñón'); }).forEach(function (v) { addRel(S, v.id, c.c, -8); }); return 'Las campanas suenan al alba (+8 de fe). Los gruñones, más gruñones.'; } },
        { label: 'Que haya silencio', apply: function (S, c) { addFaith(S, -4); const cura = byId(S, c.c); if (cura) cura.needs.social = clamp(cura.needs.social + 20, 0, 100); return 'Silencio por las mañanas. ' + byId(S, c.c).name + ' está dolido (−4 de fe).'; } }
      ], def: 0 }
  ];
  function dilemmaDef(id) { return DILEMMAS.find(function (d) { return d.id === id; }); }
  function optLabel(S, d, o, ctx) { return typeof o.label === 'function' ? o.label(S, ctx) : o.label; }
  function ctxAlive(S, ctx) { return Object.keys(ctx || {}).every(function (k) { return k === 'b' || byId(S, ctx[k]); }); }
  function newDilemma(S) {
    const day = dayOf(S), used = S.dilemmaUsed;
    const opts = DILEMMAS.filter(function (d) { return !used[d.id] || day - used[d.id] >= d.every; })
      .map(function (d) { return { d: d, ctx: d.when(S) }; }).filter(function (x) { return x.ctx; });
    if (!opts.length) return;
    const p = pick(S, opts);
    used[p.d.id] = day;
    S.dilemma = { id: p.d.id, ctx: p.ctx, day: day, text: p.d.text(S, p.ctx), opts: p.d.opts.map(function (o) { return optLabel(S, p.d, o, p.ctx); }), until: Math.round(S.time + 13 * 60) };
    log(S, 'el pueblo le pide al santo que decida: ' + S.dilemma.text.charAt(0).toLowerCase() + S.dilemma.text.slice(1), '📜 El pueblo te pide consejo', 2);
  }
  function answerDilemma(S, idx, auto) {
    const dl = S.dilemma; if (!dl) return null;
    const d = dilemmaDef(dl.id); S.dilemma = null;
    if (!d || !ctxAlive(S, dl.ctx)) return 'Ese asunto ya se ha resuelto solo.';
    if (idx === null || idx === undefined || idx < 0) {
      if (d.none) { log(S, d.none.charAt(0).toLowerCase() + d.none.slice(1), '🤷 El santo no dijo nada', 2); return d.none + '.'; }
      idx = d.def || 0;
    }
    const o = d.opts[idx]; if (!o) return null;
    const res = o.apply(S, dl.ctx);
    const label = optLabel(S, d, o, dl.ctx);
    log(S, (auto ? 'como el santo no dijo nada, el pueblo decidió: ' : 'el santo decidió: ') + label.toLowerCase() + '. ' + res, (auto ? '🤷 Sin respuesta: ' : '📜 El santo decide: ') + label, 3);
    if (!auto) addFaith(S, 2);
    return res;
  }
  function dilemmaTick(S, before) {
    const h0 = hourOf({ time: before }), h1 = hourOf(S);
    // por la mañana: consecuencias de lo que se decidió ayer
    if (S.followups && S.followups.length && h1 >= 9) {
      const d = dayOf(S);
      S.followups = S.followups.filter(function (f) { if (f.day > d) return true; log(S, f.text, f.short, f.imp); return false; });
    }
    if (S.dilemma && S.time > S.dilemma.until) answerDilemma(S, -1, true);
    if (!S.dilemma && h0 < 10 && h1 >= 10 && S.lastDilemmaDay !== dayOf(S)) {
      S.lastDilemmaDay = dayOf(S);
      if (rnd(S) < 0.8) newDilemma(S);
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
    milestone(S, '🎟️', 'A ' + v.name + ' le toca la lotería' + tail);
    v.bubble = { text: '¡Me ha tocado!', until: S.time + 15 };
    return speech;
  }

  function stranger(S, givenName, job) {
    const used = S.villagers.map(function (v) { return v.name; });
    const needSex = job === 'médico' ? 'f' : job === 'cura' || job === 'guardia' ? 'm' : null;
    const opts = STRANGER_NAMES.filter(function (n) { return used.indexOf(n[0]) < 0 && (!needSex || n[1] === needSex); });
    const nm = opts.length ? pick(S, opts) : [needSex === 'f' ? 'Forastera ' + S.nextId : 'Forastero ' + S.nextId, needSex || 'm'];
    let name = nm[0], sex = nm[1];
    if (givenName) { name = capital(String(givenName).trim()); sex = /a$/i.test(name) ? 'f' : 'm'; }
    const homes = [freeHome(S, 1, false) || builtHomes(S).sort(function (x, y) { return occupants(S, x.id).length / x.cap - occupants(S, y.id).length / y.cap; })[0]];
    const t1 = pick(S, ALL_TRAITS); let t2 = pick(S, ALL_TRAITS); if (t2 === t1) t2 = 'alegre';
    const palette = ['#e06666', '#6fa8dc', '#93c47d', '#ffd966', '#c27ba0', '#76a5af'];
    const id = 'v' + (S.nextId++);
    const v = {
      id: id, name: name, sur: freeSurname(S), sex: job === 'cura' ? 'm' : sex, age: (job === 'cura' ? 35 : 22) + Math.floor(rnd(S) * 30), job: job || pick(S, STRANGER_JOBS), traits: job === 'cura' ? ['religioso', t1 === 'religioso' ? 'tímido' : t1] : [t1, t2],
      home: homes[0].id, money: 80 + Math.floor(rnd(S) * 200), partner: null, married: false, crush: null, stock: 0, mem: [],
      look: { skin: pick(S, ['#f0c29a', '#e8b48a', '#c98d63', '#8d5a3b']), hair: pick(S, ['#2a1a14', '#a0522d', '#d4a017', '#111111']), shirt: pick(S, palette), pants: '#3a3a52' },
      needs: { hunger: 40, energy: 70, social: 70 },
      x: ENTRY.c * T + T / 2, y: ENTRY.r * T + T / 2, path: [], inside: null, act: 'empadronarse', actPlace: 'ayuntamiento', actUntil: S.time + 70,
      bubble: { text: '¡Hola! ¿Es aquí Pueblo Vivo?', until: S.time + 12 }, offset: Math.floor(rnd(S) * 40) - 20, days: {}, parents: [], born: dayOf(S)
    };
    if (v.job === 'cura') { v.name = 'Don ' + v.name; v.look.shirt = '#1d1d24'; v.look.pants = '#1d1d24'; }
    if (v.job === 'guardia') { v.look.shirt = '#4a5a3a'; v.look.pants = '#3a4a2e'; }
    if (v.job === 'médico') v.look.shirt = '#f4f6f6';
    const p = placeTile(S, 'ayuntamiento', v);
    v.path = findPath(S, ENTRY.c, ENTRY.r, p.c, p.r) || [];
    S.villagers.push(v);
    S.villagers.forEach(function (o) { if (o.id !== id) setRel(S, id, o.id, Math.floor(rnd(S) * 20) - 5); });
    log(S, 'llegó ' + g(v, 'un forastero llamado ', 'una forastera llamada ') + name + ', ' + g(v, 'el', 'la') + ' nuevo ' + jobName(v) + ' del pueblo',
      '🧳 Llega ' + name + ' al pueblo', 3, [id]);
    milestone(S, '🧳', 'Llega ' + name + ' al pueblo para quedarse');
    addFame(S, 5);
    return 'Por el camino llega ' + g(v, 'un forastero', 'una forastera') + ': ' + name + '. Veremos qué tal ' + g(v, 'lo', 'la') + ' reciben.';
  }

  function jobName(v) {
    const f = fem(v);
    return ({ panadero: f ? 'panadera' : 'panadero', agricultor: f ? 'agricultora' : 'agricultor', costurero: f ? 'costurera' : 'costurero',
      tabernero: f ? 'tabernera' : 'tabernero', jubilado: f ? 'jubilada' : 'jubilado', cura: 'cura', niño: f ? 'niña' : 'niño',
      'médico': f ? 'médica' : 'médico', guardia: 'guardia civil' })[v.job] || v.job;
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
      return intro + (rain ? 'Ha llovido un poco, pero por lo demás todo ha estado tranquilo.' : 'Todo ha estado tranquilo: mucho paseo por la plaza y poca novedad.') + townLine(S);
    }
    const links = ['Además, ', 'Por otro lado, ', 'Y ojo: ', 'También '], k0 = Math.floor(rnd(S) * links.length);
    const parts = top.map(function (e, i) {
      const c = i === 0 ? '' : i === top.length - 1 ? 'Y por último, ' : links[(k0 + i) % links.length];
      const t = c ? c + e.text : capital(e.text);
      return /[.!?…]$/.test(t) ? t : t + '.';
    });
    return intro + parts.join(' ') + townLine(S);
  }
  // Una frase sobre cómo va el pueblo, para cerrar la crónica cuando hay algo que decir
  function townLine(S) {
    const st = townStatus(S);
    const obra = st.projects.find(function (p) { return p.state === 'obras'; });
    if (st.to !== null && st.progress >= 0.8) return ' Al pueblo le falta muy poco para convertirse en ' + (st.level + 1 <= 3 ? 'un ' : 'una ') + st.nextName.toLowerCase() + '.';
    if (obra) return ' Siguen las obras de ' + obra.name + (obra.progress >= 0.6 ? ', que ya casi están.' : '.');
    return '';
  }
  function townStatus(S) {
    const lvl = S.level || 1, L = LEVELS[lvl - 1], N = LEVELS[lvl];
    const fame = Math.round(S.fame || 0);
    return {
      level: lvl, name: L.name, nextName: N ? N.name : null, fame: fame, from: L.at, to: N ? N.at : null,
      progress: N ? clamp((fame - L.at) / (N.at - L.at), 0, 1) : 1, fameDay: S.fameDay || 0,
      pop: S.villagers.length, happy: Math.round(happiness(S)), harvest: Math.round(S.harvest),
      wealth: Math.round(adults(S).reduce(function (s, v) { return s + v.money; }, 0)),
      couples: S.villagers.filter(function (v) { return v.partner; }).length / 2,
      stats: S.stats || { births: 0, deaths: 0, left: 0 }, kids: S.villagers.filter(function (v) { return !isAdult(v); }).length,
      projects: PROJECTS.map(function (p) {
        const b = S.builds[p.id];
        return { id: p.id, name: p.name, icon: p.icon, level: p.level, progress: buildProgress(S, p.id),
          state: b && b.done ? 'hecho' : b ? 'obras' : p.level <= lvl ? 'pendiente' : 'bloqueado' };
      })
    };
  }

  // =====================================================================
  // CONSULTAS SOBRE UN VECINO
  // =====================================================================
  const ACTS = {
    dormir: 'durmiendo', trabajar: 'trabajando', coser: 'cosiendo en casa', vender: 'vendiendo en el mercado', comprar: 'de compras en el mercado',
    'comprar pan': 'comprando el pan', 'tomar algo': 'tomando algo en el bar', pasear: 'paseando por la plaza', charlar: 'charlando en el bar',
    descansar: 'descansando', siesta: 'echándose la siesta', comer: 'comiendo', misa: 'en misa', fiesta: 'de fiesta en la plaza', jugar: 'jugando',
    'ir al cole': 'en la escuela', 'hacer la compra': 'haciendo la compra en la tienda', 'atender la tienda': 'atendiendo la tienda',
    'comprar el periódico': 'comprando el periódico', 'trabajar en la obra': 'echando una mano en la obra',
    'en casa': 'en casa con la familia', entierro: 'en el entierro',
    'ir al médico': 'en el médico', 'pasar consulta': 'pasando consulta', patrullar: 'patrullando el pueblo',
    empadronarse: 'empadronándose en el ayuntamiento', 'hacer papeles': 'haciendo papeles en el ayuntamiento'
  };
  function moodOf(v) {
    const m = moodScore(v);
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
      if (m.k === 'luto' && S.time - m.t < DAY * 7) { const d = (S.deceased || []).find(function (x) { return x.id === m.o; }); if (d) notes.push('De luto por ' + d.name); }
      if (m.k === 'herencia' && S.time - m.t < DAY * 10) { const d = (S.deceased || []).find(function (x) { return x.id === m.o; }); if (d) notes.push('Heredó ' + euros(m.a) + ' de ' + d.name); }
    });
    if (S.preg && S.preg.some(function (p) { return p.a === v.id || p.b === v.id; })) notes.unshift('Espera un bebé');
    const partner = v.partner && byId(S, v.partner);
    const parents = (v.parents || []).map(function (id) { const p = byId(S, id); if (p) return p.name; const d = (S.deceased || []).find(function (x) { return x.id === id; }); return d ? d.name + ' †' : null; }).filter(Boolean);
    return {
      fullName: fullName(v), sur: v.sur || '', parents: parents, address: addressOf(BY_ID[v.home]), kids: childrenOf(S, v).map(function (k) { return k.name; }), widow: !!v.widow && !v.partner,
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
    else if (s.widow) parts.push('Es ' + g(v, 'viudo', 'viuda') + '.');
    const kids = childrenOf(S, v);
    if (kids.length) parts.push('Tiene ' + (kids.length === 1 ? g(kids[0], 'un hijo, ', 'una hija, ') : kids.length + (kids.every(fem) ? ' hijas: ' : ' hijos: ')) + s.kids.join(', ').replace(/, ([^,]*)$/, ' y $1') + '.');
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
      if (k === 'milestones') return val.slice(-50);
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
    // pueblos guardados antes de que existiera el progreso
    if (S.fame === undefined) {
      S.fame = Math.min(55, (dayOf(S) - 1) * 20); S.level = 1; S.fameDay = 0; S.builds = {};
      S.milestones = [{ d: 1, t: 0, i: '⛪', text: 'Se funda Pueblo Vivo' }];
    }
    S.builds = S.builds || {}; S.milestones = S.milestones || []; S.level = S.level || 1;
    if (S.faith === undefined) S.faith = 50;
    S.dilemmaUsed = S.dilemmaUsed || {}; S.followups = S.followups || [];
    assignFamilies(S);   // apellidos y familias para pueblos de antes del ciclo de vida
    if (S.map !== MAP_VERSION) {
      // pueblo guardado con el mapa viejo: mismas casas (h0…h11), nuevas posiciones
      S.map = MAP_VERSION; S.homeObra = null;
      Object.keys(S.houses).forEach(function (k) { if (!BY_ID[k]) delete S.houses[k]; });
      S.villagers.forEach(function (v) { if (!BY_ID[v.home]) v.home = 'h0'; decide(S, v, true); });
    }
    return S;
  }

  return {
    VERSION: VERSION, serialize: serialize, deserialize: deserialize,
    T: T, COLS: COLS, ROWS: ROWS, W: W, H: H, tileAt: tileAt, TILES: { GRASS: GRASS, PATH: PATH, ROAD: ROAD, PLAZA: PLAZA, FIELD: FIELD, BENCH: BENCH, TREE: TREE, WATER: WATER, BUILD: BUILD, DECOR: DECOR, BRIDGE: BRIDGE, YARD: YARD, ERA: ERA },
    BUILDINGS: BUILDINGS, TREES: TREES, PLAZA: PLAZA_T, FIELD: FIELD_T, FOUNTAIN: FOUNTAIN_T, BENCHES: BENCHES_T, STALL_COLS: STALL_COLS, STALL_ROW: STALL_ROW,
    DAY: DAY, createWorld: createWorld, step: step, fastForward: fastForward, applyPower: applyPower,
    chronicle: chronicle, villagerSummary: villagerSummary, describeVillager: describeVillager, findVillager: findVillager,
    clock: clock, hourOf: hourOf, byId: byId, jobName: jobName, isMarket: isMarket, findPath: findPath, passable: passable,
    // progreso (fase 1.5)
    LEVELS: LEVELS, PROJECTS: PROJECTS, MILL: MILL_T, OLIVE: OLIVE_T, LANE_ROW: LANE_ROW, ROAD_ROWS: ROAD_ROWS,
    // ciclo de vida
    CEMETERY: CEMETERY_T, families: families, findDeceased: findDeceased, describeDeceased: describeDeceased, fullName: fullName,
    // mapa de la fase 2
    MAP_VERSION: MAP_VERSION, STREETS: STREETS, HOMES: HOMES, LAMPS: LAMPS, FIELDS: FIELDS, ERA: ERA_T, RIVER_PTS: RIVER_PTS, ROAD_PTS: ROAD_PTS,
    homeProgress: homeProgress, occupants: occupants, addressOf: addressOf, streetName: streetName, building: building,
    // fe y dilemas
    POWER_COST: POWER_COST, canAfford: canAfford, faithOf: faithOf, answerDilemma: answerDilemma, DILEMMA_IDS: DILEMMAS.map(function (d) { return d.id; }),
    isBuilt: isBuilt, buildProgress: buildProgress, townStatus: townStatus, fiestaOn: fiestaOn, moodScore: moodScore, dayOf: dayOf
  };
});
