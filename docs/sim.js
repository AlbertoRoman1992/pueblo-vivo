/*
 * Pueblo Vivo — motor de simulación.
 * Lógica pura, sin dibujo: la usan la web (en directo) y la skill (avance sin pantalla).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PuebloSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Mapa (coordenadas en píxeles de un lienzo de 480x270) ----------
  const ROAD_Y = 156;
  const BUILDINGS = [
    // casas
    { id: 'h0', type: 'casa', x: 24, y: 34, w: 34, h: 28 },
    { id: 'h1', type: 'casa', x: 74, y: 24, w: 34, h: 28 },
    { id: 'h2', type: 'casa', x: 128, y: 36, w: 34, h: 28 },
    { id: 'h3', type: 'casa', x: 322, y: 30, w: 34, h: 28 },
    { id: 'h4', type: 'casa', x: 374, y: 22, w: 34, h: 28 },
    { id: 'h5', type: 'casa', x: 428, y: 38, w: 34, h: 28 },
    { id: 'h6', type: 'casa', x: 28, y: 196, w: 34, h: 28 },
    { id: 'h7', type: 'casa', x: 84, y: 208, w: 34, h: 28 },
    { id: 'h8', type: 'casa', x: 140, y: 200, w: 34, h: 28 },
    // edificios públicos
    { id: 'iglesia', type: 'iglesia', name: 'Iglesia', x: 214, y: 26, w: 52, h: 62 },
    { id: 'bar', type: 'bar', name: 'Bar Manolo', x: 116, y: 100, w: 56, h: 40 },
    { id: 'panaderia', type: 'panaderia', name: 'Panadería', x: 308, y: 100, w: 56, h: 40 }
  ];
  BUILDINGS.forEach(function (b) { b.door = { x: Math.round(b.x + b.w / 2), y: b.y + b.h + 2 }; });
  const PLAZA = { x: 192, y: 112, w: 96, h: 80 };
  const FOUNTAIN = { x: 240, y: 152, r: 11 };
  const FIELDS = { x: 300, y: 198, w: 168, h: 62 };
  const ENTRY = { x: 478, y: ROAD_Y };

  const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DAY = 1440;

  const TRAITS = {
    alegre: { soc: 1.3, aff: 3 },
    gruñón: { soc: 0.8, aff: -4 },
    cotilla: { soc: 1.5, aff: 0 },
    tímido: { soc: 0.6, aff: 1 },
    romántico: { soc: 1.1, aff: 2 },
    trabajador: { soc: 0.9, aff: 0 },
    juerguista: { soc: 1.4, aff: 1 },
    ahorrador: { soc: 1.0, aff: 0 },
    religioso: { soc: 1.0, aff: 1 }
  };

  const STRANGER_NAMES = [
    ['Álvaro', 'm'], ['Nuria', 'f'], ['Rubén', 'm'], ['Inés', 'f'], ['Sergio', 'm'], ['Marisa', 'f'],
    ['Jesús', 'm'], ['Alba', 'f'], ['Raúl', 'm'], ['Celia', 'f'], ['Hugo', 'm'], ['Noelia', 'f']
  ];
  const STRANGER_JOBS = ['agricultor', 'costurero', 'jubilado', 'agricultor', 'panadero'];
  const ALL_TRAITS = Object.keys(TRAITS);

  // ---------- Utilidades ----------
  function rnd(S) { // generador con semilla guardada en el estado (mulberry32)
    let t = (S.rng = (S.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(S, arr) { return arr[Math.floor(rnd(S) * arr.length)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function building(id) { return BUILDINGS.find(function (b) { return b.id === id; }); }
  function relKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function getRel(S, a, b) { const r = S.rel[relKey(a, b)]; return r === undefined ? 0 : r; }
  function setRel(S, a, b, v) { S.rel[relKey(a, b)] = clamp(Math.round(v), -100, 100); }
  function byId(S, id) { return S.villagers.find(function (v) { return v.id === id; }); }
  function hourOf(S) { return (S.time % DAY) / 60; }
  function dayOf(S) { return Math.floor(S.time / DAY) + 1; }
  function weekdayOf(S) { return WEEKDAYS[(dayOf(S) - 1) % 7]; }
  function isAdult(v) { return v.age >= 18; }
  function soc(v) { return v.traits.reduce(function (m, t) { return m * (TRAITS[t] ? TRAITS[t].soc : 1); }, 1); }
  function has(v, t) { return v.traits.indexOf(t) >= 0; }
  function art(v) { return v.sex === 'f' ? 'la' : 'el'; }

  // ---------- Creación del mundo ----------
  function V(id, name, sex, age, job, traits, home, look) {
    return {
      id: id, name: name, sex: sex, age: age, job: job, traits: traits, home: home,
      partner: null, look: look,
      needs: { hunger: 20, energy: 80, social: 30 },
      x: building(home).door.x, y: building(home).door.y,
      path: [], inside: home, act: 'dormir', actPlace: home, actUntil: 0,
      bubble: null, offset: (id.charCodeAt(0) * 7 + id.length * 13) % 40 - 20
    };
  }

  function createWorld(seed) {
    const S = {
      v: 1, seed: seed || 12345, rng: seed || 12345,
      time: 7 * 60 + 30, // día 1, 07:30
      weather: 'sol', weatherUntil: 12 * 60,
      fiestaUntil: 0, blessUntil: 0, harvest: 50,
      villagers: [], rel: {}, events: [], nextId: 100,
      lastSeen: 0
    };
    const L = function (skin, hair, shirt, pants) { return { skin: skin, hair: hair, shirt: shirt, pants: pants }; };
    S.villagers = [
      V('paco', 'Paco', 'm', 52, 'panadero', ['trabajador', 'gruñón'], 'h0', L('#e8b48a', '#3b2a20', '#f2efe6', '#4a4f6a')),
      V('carmen', 'Carmen', 'f', 51, 'costurero', ['cotilla', 'alegre'], 'h0', L('#f0c29a', '#5a2e1c', '#c0504d', '#3a3a52')),
      V('dani', 'Dani', 'm', 12, 'niño', ['alegre'], 'h0', L('#f0c29a', '#3b2a20', '#4f86c6', '#2f3a55')),
      V('lucia', 'Lucía', 'f', 29, 'agricultor', ['romántico', 'tímido'], 'h1', L('#e8b48a', '#a0522d', '#6aa84f', '#5b4636')),
      V('manolo', 'Manolo', 'm', 60, 'tabernero', ['juerguista', 'cotilla'], 'h2', L('#d9a07a', '#9a9a9a', '#ffffff', '#222233')),
      V('pili', 'Pili', 'f', 58, 'costurero', ['alegre'], 'h2', L('#f0c29a', '#2a1a14', '#8e5ea2', '#3a3a52')),
      V('quique', 'Quique', 'm', 27, 'tabernero', ['juerguista', 'romántico'], 'h2', L('#e8b48a', '#2a1a14', '#e69138', '#2f3a55')),
      V('julian', 'Don Julián', 'm', 67, 'cura', ['religioso', 'tímido'], 'h3', L('#f0c29a', '#bdbdbd', '#1d1d24', '#1d1d24')),
      V('javi', 'Javi', 'm', 31, 'agricultor', ['juerguista', 'romántico'], 'h4', L('#c98d63', '#2a1a14', '#3d85c6', '#5b4636')),
      V('remedios', 'Remedios', 'f', 84, 'jubilado', ['cotilla', 'gruñón', 'religioso'], 'h5', L('#f0c29a', '#e6e6e6', '#2b2b2b', '#2b2b2b')),
      V('sara', 'Sara', 'f', 9, 'niño', ['alegre', 'tímido'], 'h5', L('#f0c29a', '#d4a017', '#ff8fb1', '#3a3a52')),
      V('antonio', 'Antonio', 'm', 45, 'agricultor', ['trabajador', 'ahorrador'], 'h6', L('#c98d63', '#3b2a20', '#93a35a', '#5b4636')),
      V('rosa', 'Rosa', 'f', 43, 'costurero', ['alegre', 'religioso'], 'h6', L('#e8b48a', '#7a3b1c', '#e06666', '#3a3a52')),
      V('marta', 'Marta', 'f', 16, 'niño', ['romántico', 'juerguista'], 'h6', L('#e8b48a', '#7a3b1c', '#9fc5e8', '#2f3a55')),
      V('elena', 'Elena', 'f', 35, 'costurero', ['tímido', 'romántico'], 'h7', L('#f0c29a', '#111111', '#76a5af', '#3a3a52')),
      V('tomas', 'Tomás', 'm', 73, 'jubilado', ['gruñón', 'ahorrador'], 'h8', L('#e8b48a', '#cccccc', '#7f6000', '#3a3a52'))
    ];
    // Relaciones iniciales
    const ids = S.villagers.map(function (v) { return v.id; });
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) setRel(S, ids[i], ids[j], Math.floor(rnd(S) * 30) - 10);
    S.villagers.forEach(function (a) { S.villagers.forEach(function (b) { if (a.id < b.id && a.home === b.home) setRel(S, a.id, b.id, 60); }); });
    marry(S, 'paco', 'carmen'); marry(S, 'manolo', 'pili'); marry(S, 'antonio', 'rosa');
    setRel(S, 'paco', 'manolo', -25); // rivalidad de toda la vida
    setRel(S, 'lucia', 'javi', 35);
    setRel(S, 'remedios', 'tomas', -15);
    S.villagers.forEach(function (v) { decide(S, v, true); });
    return S;
  }

  function marry(S, a, b) { byId(S, a).partner = b; byId(S, b).partner = a; setRel(S, a, b, 80); }

  // ---------- Eventos ----------
  function log(S, text, short, imp, who) {
    S.events.push({ t: S.time, text: text, short: short || text, imp: imp || 1, who: who || [] });
    if (S.events.length > 120) S.events.splice(0, S.events.length - 120);
  }

  // ---------- Decisiones ----------
  function placePoint(S, place) {
    if (place === 'plaza') {
      for (let k = 0; k < 10; k++) {
        const x = PLAZA.x + 8 + rnd(S) * (PLAZA.w - 16), y = PLAZA.y + 8 + rnd(S) * (PLAZA.h - 16);
        if (Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) > FOUNTAIN.r + 6) return { x: x, y: y };
      }
      return { x: PLAZA.x + 10, y: PLAZA.y + 10 };
    }
    if (place === 'campo') return { x: FIELDS.x + 10 + rnd(S) * (FIELDS.w - 20), y: FIELDS.y + 8 + rnd(S) * (FIELDS.h - 16) };
    return building(place).door;
  }
  function isIndoor(place) { return place !== 'plaza' && place !== 'campo'; }

  function desired(S, v) {
    const h = hourOf(S), wd = (dayOf(S) - 1) % 7, rain = S.weather === 'lluvia';
    const o = v.offset / 60; // pequeña variación personal en los horarios
    const sleepStart = (v.age < 14 ? 21.5 : v.age > 70 ? 22 : has(v, 'juerguista') ? 24.5 : 23.3) + o;
    const wake = (v.age > 70 ? 7 : 7.5) + o;
    const hh = h < 5 ? h + 24 : h;
    if (hh >= sleepStart || h < wake) return { act: 'dormir', place: v.home, dur: 30 };
    if (S.time < S.fiestaUntil) return { act: 'fiesta', place: 'plaza', dur: 30 };
    if (wd === 6 && h >= 12 && h < 13 && (has(v, 'religioso') || v.job === 'cura' || rnd(S) < 0.3)) return { act: 'misa', place: 'iglesia', dur: 60 };
    if (v.needs.hunger > 80) return { act: 'comer', place: rnd(S) < 0.6 ? v.home : 'panaderia', dur: 40 };
    if (h >= 14 && h < 16.5 + o) return { act: h < 15 ? 'comer' : 'siesta', place: v.home, dur: 40 };
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
    // tiempo libre
    const wantSocial = v.needs.social > 50 || rnd(S) < 0.4 * soc(v);
    if (wantSocial) {
      if (rain) return { act: 'charlar', place: isAdult(v) ? 'bar' : v.home, dur: 45 };
      if (isAdult(v) && h >= 19 && (has(v, 'juerguista') || rnd(S) < 0.4)) return { act: 'tomar algo', place: 'bar', dur: 60 };
      return { act: 'pasear', place: 'plaza', dur: 30 };
    }
    return { act: 'descansar', place: rain || rnd(S) < 0.5 ? v.home : 'plaza', dur: 40 };
  }

  function decide(S, v, teleport) {
    const d = desired(S, v);
    v.act = d.act; v.actPlace = d.place; v.actUntil = S.time + d.dur + Math.floor(rnd(S) * 15);
    const p = placePoint(S, d.place);
    if (teleport) {
      v.x = p.x; v.y = p.y; v.path = []; v.inside = isIndoor(d.place) ? d.place : null;
    } else if (v.inside === d.place) {
      v.path = [];
    } else {
      if (v.inside) { const b = building(v.inside); v.x = b.door.x; v.y = b.door.y; v.inside = null; }
      v.path = route(v, p);
    }
  }

  function route(v, p) {
    if (Math.abs(p.x - v.x) < 40 && Math.abs(p.y - v.y) < 40) return [p];
    return [{ x: v.x, y: ROAD_Y }, { x: p.x, y: ROAD_Y }, p];
  }

  // ---------- Paso de tiempo en directo ----------
  const SPEED = 16; // píxeles por minuto de juego

  function step(S, dt) {
    while (dt > 0) {
      const d = Math.min(dt, 2);
      tick(S, d, false);
      dt -= d;
    }
  }

  function tick(S, d, coarse) {
    const before = S.time;
    S.time += d;
    weatherTick(S);
    S.villagers.forEach(function (v) {
      // necesidades
      const sleeping = v.inside === v.home && (v.act === 'dormir' || v.act === 'siesta');
      v.needs.hunger = clamp(v.needs.hunger + 0.07 * d, 0, 100);
      v.needs.energy = clamp(v.needs.energy + (sleeping ? 0.2 : -0.05) * d, 0, 100);
      v.needs.social = clamp(v.needs.social + 0.05 * d / soc(v), 0, 100);
      if (v.inside && v.act === 'comer') v.needs.hunger = clamp(v.needs.hunger - 2.5 * d, 0, 100);
      if (v.act === 'fiesta') v.needs.social = clamp(v.needs.social - 0.5 * d, 0, 100);
      if (v.bubble && S.time > v.bubble.until) v.bubble = null;

      if (coarse) {
        if (S.time >= v.actUntil) decide(S, v, true);
        return;
      }
      // movimiento
      if (v.path.length) {
        const tgt = v.path[0];
        const dx = tgt.x - v.x, dy = tgt.y - v.y, dist = Math.hypot(dx, dy), mv = SPEED * d;
        if (dist <= mv) {
          v.x = tgt.x; v.y = tgt.y; v.path.shift();
          if (!v.path.length && isIndoor(v.actPlace)) v.inside = v.actPlace;
        } else { v.x += dx / dist * mv; v.y += dy / dist * mv; }
      } else if (S.time >= v.actUntil) {
        decide(S, v, false);
      } else if (!v.inside && (v.act === 'pasear' || v.act === 'fiesta' || v.act === 'jugar') && rnd(S) < 0.02 * d) {
        v.path = [placePoint(S, 'plaza')];
      } else if (!v.inside && v.act === 'trabajar' && v.actPlace === 'campo' && rnd(S) < 0.01 * d) {
        v.path = [placePoint(S, 'campo')];
      }
    });
    // interacciones cada 5 minutos de juego
    if (Math.floor(S.time / 5) !== Math.floor(before / 5)) socialTick(S, coarse);
    // cambios de día
    if (Math.floor(S.time / DAY) !== Math.floor(before / DAY)) newDay(S);
  }

  function weatherTick(S) {
    if (S.time < S.weatherUntil) return;
    const r = rnd(S);
    const prev = S.weather;
    S.weather = r < 0.12 ? 'lluvia' : r < 0.35 ? 'nubes' : 'sol';
    S.weatherUntil = S.time + 120 + Math.floor(rnd(S) * 240);
    if (S.weather === 'lluvia' && prev !== 'lluvia') {
      S.harvest = clamp(S.harvest + 5, 0, 100);
      log(S, 'llovió el ' + weekdayOf(S), 'Empieza a llover', 1);
    }
  }

  function newDay(S) {
    // cumpleaños anuales simplificados: cada 7 días de juego todos cumplen un año (ciclo vital llega en fase 2)
    if (dayOf(S) % 7 === 1) S.villagers.forEach(function (v) { v.age += 1; });
    if (S.harvest > 85 && rnd(S) < 0.5) log(S, 'la cosecha está siendo de las buenas', 'Buena cosecha este año', 2);
  }

  // ---------- Vida social ----------
  const LINES = {
    sol: ['¡Qué buen día!', 'Hace un sol de justicia', '¡Vaya calor!'],
    nubes: ['Se está nublando…', 'Hoy no sé qué ponerme'],
    lluvia: ['¡Menudo chaparrón!', 'Esto le viene bien al campo', 'Me he calado entero'],
    fiesta: ['¡Viva el santo!', '¡Qué verbena más buena!', '¿Bailamos?', '¡Otra ronda!'],
    trabajo: ['La cosecha viene bien', 'Hoy no paro', 'Qué cansancio…'],
    general: ['¿Viste el partido?', '¿Qué tal los tuyos?', 'Ayer no pegué ojo', '¿Has probado el pan nuevo?', 'Este pueblo ya no es lo que era'],
    pareja: ['Te he echado de menos', '¿Damos un paseo?', 'Qué guapa/o estás hoy'],
    roce: ['Hmpf.', 'Mira quién viene…', 'No empecemos, ¿eh?']
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
        const together = coarse ? (a.actPlace === b.actPlace) : sameSpot(a, b);
        if (!together) continue;
        const p = 0.12 * Math.sqrt(soc(a) * soc(b)) * (S.time < S.fiestaUntil ? 2 : 1);
        if (rnd(S) < p) chat(S, a, b, coarse);
      }
    }
  }

  function chat(S, a, b, coarse) {
    const r0 = getRel(S, a.id, b.id);
    let delta = 2 + Math.floor(rnd(S) * 5) - 2;
    a.traits.concat(b.traits).forEach(function (t) { delta += (TRAITS[t] ? TRAITS[t].aff : 0) * 0.5; });
    if (r0 < -30) delta -= 3;                   // los enemigos se pican
    if (S.time < S.fiestaUntil) delta += 2;     // la fiesta une
    if (a.partner === b.id) delta = Math.abs(delta) + 1;
    const r1 = clamp(r0 + delta, -100, 100);
    setRel(S, a.id, b.id, r1);
    a.needs.social = clamp(a.needs.social - 15, 0, 100);
    b.needs.social = clamp(b.needs.social - 15, 0, 100);

    if (!coarse) {
      const ctx = r1 < -30 ? 'roce' : a.partner === b.id ? 'pareja' : S.time < S.fiestaUntil ? 'fiesta'
        : rnd(S) < 0.35 ? S.weather : a.act === 'trabajar' ? 'trabajo' : 'general';
      let line = pick(S, LINES[ctx] || LINES.general);
      if (has(a, 'cotilla')) {
        const g = gossipAbout(S, a, b);
        if (g) line = g;
      }
      a.bubble = { text: line, until: S.time + 6 };
      b.bubble = { text: r1 < -30 ? 'Pues vale.' : pick(S, ['¡Ya ves!', 'Anda que…', 'Pues sí', '¡No me digas!', 'Jajaja']), until: S.time + 9, delay: S.time + 3 };
    }

    // Umbrales que generan historias
    if (r0 < 65 && r1 >= 65 && isAdult(a) && isAdult(b) && !a.partner && !b.partner && Math.abs(a.age - b.age) <= 15) {
      a.partner = b.id; b.partner = a.id; a.since = b.since = S.time;
      log(S, a.name + ' y ' + b.name + ' se han hecho novios', '💕 ' + a.name + ' y ' + b.name + ' son novios', 3, [a.id, b.id]);
      a.bubble = { text: '¿Quieres salir conmigo?', until: S.time + 10 };
      b.bubble = { text: '¡Sí! ♥', until: S.time + 12, delay: S.time + 4 };
    } else if (a.partner === b.id && r1 >= 90 && a.home !== b.home && S.time - (a.since || 0) > DAY * 2) {
      wedding(S, a, b);
    } else if (r0 > -40 && r1 <= -40) {
      log(S, a.name + ' y ' + b.name + ' han tenido una buena bronca y ya no se hablan', a.name + ' y ' + b.name + ' han discutido', 3, [a.id, b.id]);
    } else if (r0 < 50 && r1 >= 50 && a.partner !== b.id) {
      log(S, a.name + ' y ' + b.name + ' se han hecho muy amigos', a.name + ' y ' + b.name + ', inseparables', 2, [a.id, b.id]);
    }
  }

  function wedding(S, a, b) {
    // se mudan a la casa con menos gente
    const count = function (h) { return S.villagers.filter(function (v) { return v.home === h; }).length; };
    const home = count(a.home) <= count(b.home) ? a.home : b.home;
    a.home = home; b.home = home;
    S.fiestaUntil = Math.max(S.fiestaUntil, S.time + 180);
    log(S, '¡' + a.name + ' y ' + b.name + ' se han casado! Hubo boda y verbena en la plaza', '💒 Boda de ' + a.name + ' y ' + b.name, 4, [a.id, b.id]);
  }

  function gossipAbout(S, a, b) {
    const recent = S.events.filter(function (e) {
      return e.imp >= 2 && S.time - e.t < DAY * 2 && e.who.length && e.who.indexOf(a.id) < 0 && e.who.indexOf(b.id) < 0;
    });
    if (!recent.length || rnd(S) < 0.5) return null;
    const e = recent[recent.length - 1];
    return '¿Te has enterado? ' + capital(e.text) + '…';
  }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- Poderes del santo patrón ----------
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
      case 'forastero':
        return stranger(S, opts.name);
      default:
        return null;
    }
  }

  function stranger(S, givenName) {
    const used = S.villagers.map(function (v) { return v.name; });
    const opts = STRANGER_NAMES.filter(function (n) { return used.indexOf(n[0]) < 0; });
    const nm = opts.length ? pick(S, opts) : ['Forastero ' + S.nextId, 'm'];
    const name = givenName ? capital(String(givenName)) : nm[0], sex = nm[1];
    const homes = BUILDINGS.filter(function (b) { return b.type === 'casa'; });
    homes.sort(function (x, y) {
      return S.villagers.filter(function (v) { return v.home === x.id; }).length - S.villagers.filter(function (v) { return v.home === y.id; }).length;
    });
    const t1 = pick(S, ALL_TRAITS); let t2 = pick(S, ALL_TRAITS); if (t2 === t1) t2 = 'alegre';
    const palette = ['#e06666', '#6fa8dc', '#93c47d', '#ffd966', '#c27ba0', '#76a5af'];
    const id = 'v' + (S.nextId++);
    const v = {
      id: id, name: name, sex: sex, age: 22 + Math.floor(rnd(S) * 40), job: pick(S, STRANGER_JOBS), traits: [t1, t2],
      home: homes[0].id, partner: null,
      look: { skin: pick(S, ['#f0c29a', '#e8b48a', '#c98d63', '#8d5a3b']), hair: pick(S, ['#2a1a14', '#a0522d', '#d4a017', '#111111']), shirt: pick(S, palette), pants: '#3a3a52' },
      needs: { hunger: 40, energy: 70, social: 70 },
      x: ENTRY.x, y: ENTRY.y, path: [], inside: null, act: 'pasear', actPlace: 'plaza', actUntil: S.time + 60,
      bubble: { text: '¡Hola! ¿Es aquí Pueblo Vivo?', until: S.time + 12 }, offset: Math.floor(rnd(S) * 40) - 20
    };
    v.path = [placePoint(S, 'plaza')];
    S.villagers.push(v);
    S.villagers.forEach(function (o) { if (o.id !== id) setRel(S, id, o.id, Math.floor(rnd(S) * 20) - 5); });
    log(S, 'llegó ' + (sex === 'f' ? 'una forastera' : 'un forastero') + ' ' + (sex === 'f' ? 'llamada ' : 'llamado ') + name + ', ' + art(v) + ' ' + jobName(v),
      '🧳 Llega ' + name + ' al pueblo', 3, [id]);
    return 'Por el camino llega ' + (sex === 'f' ? 'una forastera' : 'un forastero') + ': ' + name + '. Veremos qué tal ' + (sex === 'f' ? 'la' : 'lo') + ' reciben.';
  }

  function jobName(v) {
    const f = v.sex === 'f';
    return ({ panadero: f ? 'panadera' : 'panadero', agricultor: f ? 'agricultora' : 'agricultor', costurero: f ? 'costurera' : 'costurero',
      tabernero: f ? 'tabernera' : 'tabernero', jubilado: f ? 'jubilada' : 'jubilado', cura: 'cura', niño: f ? 'niña' : 'niño' })[v.job] || v.job;
  }

  // ---------- Avance mientras no se mira ----------
  function fastForward(S, minutes) {
    const target = S.time + minutes;
    while (S.time < target) tick(S, Math.min(10, target - S.time), true);
    S.villagers.forEach(function (v) { decide(S, v, true); v.bubble = null; });
  }

  // ---------- Crónica narrada ----------
  function chronicle(S, since) {
    const evs = S.events.filter(function (e) { return e.t >= since; });
    const days = Math.floor(S.time / DAY) - Math.floor(since / DAY);
    let intro = days >= 2 ? 'Mientras no estabas han pasado ' + days + ' días en el pueblo. '
      : days === 1 ? 'Mientras no estabas ha pasado un día en el pueblo. ' : '';
    const top = evs.filter(function (e) { return e.imp >= 2; }).sort(function (x, y) { return y.imp - x.imp || y.t - x.t; }).slice(0, 4)
      .sort(function (x, y) { return x.t - y.t; });
    if (!top.length) {
      const rain = evs.some(function (e) { return e.text.indexOf('llov') >= 0; });
      return intro + (rain ? 'Ha llovido un poco, pero por lo demás todo ha estado tranquilo.' : 'Todo ha estado tranquilo: mucho paseo por la plaza y poca novedad.');
    }
    const parts = top.map(function (e, i) {
      const c = i === 0 ? '' : i === top.length - 1 ? 'Y por último, ' : pick(S, ['Además, ', 'También ', 'Por otro lado, ']);
      return (c ? c + e.text : capital(e.text)) + '.';
    });
    return intro + parts.join(' ');
  }

  function villagerSummary(S, v) {
    const best = S.villagers.filter(function (o) { return o.id !== v.id && o.id !== v.partner; })
      .map(function (o) { return { o: o, r: getRel(S, v.id, o.id) }; }).sort(function (x, y) { return y.r - x.r; });
    const mood = 100 - (v.needs.hunger + (100 - v.needs.energy) + v.needs.social) / 3;
    return {
      name: v.name, age: v.age, job: jobName(v), traits: v.traits, act: v.act,
      mood: mood > 70 ? 'contento' : mood > 45 ? 'normal' : 'de bajón',
      partner: v.partner ? byId(S, v.partner).name : null,
      friend: best.length && best[0].r > 30 ? best[0].o.name : null,
      enemy: best.length && best[best.length - 1].r < -30 ? best[best.length - 1].o.name : null
    };
  }

  function clock(S) {
    const h = Math.floor(hourOf(S)), m = Math.floor(S.time % 60);
    return { day: dayOf(S), weekday: weekdayOf(S), hh: h, mm: m, label: (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m };
  }

  // Estado compacto para guardar (los mensajes de Alexa tienen límite de tamaño)
  function serialize(S) {
    return JSON.stringify(S, function (k, val) {
      if (k === 'path' || k === 'bubble' || k === 'windows') return undefined;
      if (k === 'events') return val.slice(-40);
      if (k === 'x' || k === 'y') return Math.round(val);
      return val;
    });
  }
  function deserialize(json) {
    const S = typeof json === 'string' ? JSON.parse(json) : json;
    if (!S || !S.villagers) return null;
    S.villagers.forEach(function (v) { v.path = []; v.bubble = null; });
    return S;
  }

  return {
    serialize: serialize, deserialize: deserialize,
    W: 480, H: 270, ROAD_Y: ROAD_Y, BUILDINGS: BUILDINGS, PLAZA: PLAZA, FOUNTAIN: FOUNTAIN, FIELDS: FIELDS, DAY: DAY,
    createWorld: createWorld, step: step, fastForward: fastForward, applyPower: applyPower, stranger: stranger,
    chronicle: chronicle, villagerSummary: villagerSummary, clock: clock, hourOf: hourOf, byId: byId, jobName: jobName
  };
});
