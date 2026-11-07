/*
 * Pueblo Vivo — skill de Alexa (backend).
 * Con pantalla: abre la web del pueblo (Web API for Games) y le pasa los poderes y preguntas.
 * Sin pantalla: usa el mismo motor (sim.js) para avanzar el pueblo y contarlo por voz.
 *
 * El motor se descarga de la web publicada (GitHub Pages) para que la skill use siempre
 * la misma versión que la pantalla. Si no se puede descargar, usa la copia local sim.js.
 */
const Alexa = require('ask-sdk-core');
const https = require('https');
const vm = require('vm');
const LOCAL_SIM = require('./sim.js');
const { WEB_APP_URL } = require('./config.js');

const SIM_URL = WEB_APP_URL.replace(/[^/]*$/, '') + 'sim.js';
const OFFLINE_RATE = 24 / 60;      // minutos de juego por segundo real sin mirar
const SIM_CACHE_MS = 10 * 60 * 1000;

const POWERS = {
  LluviaIntent: 'lluvia', SolIntent: 'sol', FiestaIntent: 'fiesta', ForasteroIntent: 'forastero',
  BendecirIntent: 'bendecir', LoteriaIntent: 'loteria',
  EstrellasIntent: 'estrellas', AparicionIntent: 'aparicion', LangostasIntent: 'langostas'
};
const POWER_SPEECH = {
  lluvia: ['¡Que llueva!', 'Vienen nubes cargaditas.', 'Allá va un chaparrón.'],
  sol: ['¡Sale el sol!', 'Fuera nubes.'],
  fiesta: ['¡Que empiecen las fiestas!', '¡Verbena en la plaza!'],
  forastero: ['Alguien viene por el camino…', 'Llega un forastero.'],
  bendecir: ['Cosecha bendecida.', 'Los campos te lo agradecen.'],
  loteria: ['Rueda el bombo…', '¡Que toque, que toque!'],
  estrellas: ['Esta noche, estrellas fugaces.', 'Que la noche traiga amores.'],
  aparicion: ['¡Milagro en la plaza!', 'Una luz dorada baja sobre la fuente.'],
  langostas: ['Que tiemble el campo…', 'Allá va el castigo.']
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- Motor de simulación (remoto con copia local de reserva) ----------
let simCache = null, simCachedAt = 0;
function fetchText(url, ms) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(ms, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function getSim() {
  if (simCache && Date.now() - simCachedAt < SIM_CACHE_MS) return simCache;
  try {
    const code = await fetchText(SIM_URL + '?t=' + Date.now(), 1500);
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports }, { timeout: 1000 });
    const P = mod.exports;
    if (!P || typeof P.createWorld !== 'function' || (P.VERSION || 0) < (LOCAL_SIM.VERSION || 0)) throw new Error('motor remoto no válido');
    simCache = P;
  } catch (e) {
    console.warn('Uso el motor local:', e.message);
    simCache = LOCAL_SIM;
  }
  simCachedAt = Date.now();
  return simCache;
}

// ---------- Persistencia ----------
let persistenceAdapter = null;
if (process.env.DYNAMODB_PERSISTENCE_TABLE_NAME) {
  const AWS = require('aws-sdk');
  const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
  persistenceAdapter = new ddbAdapter.DynamoDbPersistenceAdapter({
    tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
    createTable: false,
    dynamoDBClient: new AWS.DynamoDB({ apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION })
  });
} else {
  const mem = {};
  persistenceAdapter = {
    getAttributes: async (env) => mem[Alexa.getUserId(env)] || {},
    saveAttributes: async (env, attrs) => { mem[Alexa.getUserId(env)] = attrs; },
    deleteAttributes: async (env) => { delete mem[Alexa.getUserId(env)]; }
  };
}
async function loadAttrs(h) { return (await h.attributesManager.getPersistentAttributes()) || {}; }
async function saveAttrs(h, attrs) { h.attributesManager.setPersistentAttributes(attrs); await h.attributesManager.savePersistentAttributes(); }

function supportsHTML(h) {
  const ifaces = Alexa.getSupportedInterfaces(h.requestEnvelope);
  return !!(ifaces && ifaces['Alexa.Presentation.HTML']);
}
function htmlMessage(message) { return { type: 'Alexa.Presentation.HTML.HandleMessage', message }; }
function slot(h, name) {
  const s = h.requestEnvelope.request.intent && h.requestEnvelope.request.intent.slots && h.requestEnvelope.request.intent.slots[name];
  if (!s) return null;
  const res = s.resolutions && s.resolutions.resolutionsPerAuthority && s.resolutions.resolutionsPerAuthority[0];
  if (res && res.status && res.status.code === 'ER_SUCCESS_MATCH') return res.values[0].value.name;
  return s.value || null;
}

// Carga el pueblo guardado y lo avanza según el tiempo que no se ha mirado (modo solo voz)
function loadWorld(P, attrs) {
  let S = null;
  try { S = attrs.state ? P.deserialize(attrs.state) : null; } catch (e) { S = null; }
  if (!S) return { S: P.createWorld(Date.now() % 100000), text: null, fresh: true };
  const since = S.time;
  const away = S.savedAt ? (Date.now() - S.savedAt) / 1000 : 0;
  const mins = Math.min(3 * P.DAY, Math.floor(away * OFFLINE_RATE));
  if (mins >= 30) P.fastForward(S, mins);
  return { S, text: mins >= 30 ? P.chronicle(S, since) : null, fresh: false };
}
function storeWorld(P, attrs, S) { S.savedAt = Date.now(); attrs.state = P.serialize(S); attrs.savedAt = S.savedAt; }

// ---------- Manejadores ----------
const LaunchHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  async handle(h) {
    const attrs = await loadAttrs(h);
    if (supportsHTML(h)) {
      const welcome = attrs.state ? 'Bienvenido de nuevo a Pueblo Vivo.' : 'Bienvenido a Pueblo Vivo. Eres el santo patrón de este pueblo: mira cómo viven sus vecinos, pregunta por ellos, o pide que llueva, una fiesta o un forastero.';
      return h.responseBuilder
        .speak(welcome)
        .addDirective({
          type: 'Alexa.Presentation.HTML.Start',
          data: { state: attrs.state || null, savedAt: attrs.savedAt || null },
          request: { uri: WEB_APP_URL, method: 'GET' },
          configuration: { timeoutInSeconds: 1800 }
        })
        .getResponse();
    }
    const P = await getSim();
    const w = loadWorld(P, attrs);
    storeWorld(P, attrs, w.S);
    await saveAttrs(h, attrs);
    const intro = w.fresh
      ? 'Bienvenido a Pueblo Vivo, un pueblo que vive solo. Eres su santo patrón. En un Echo con pantalla podrás verlo; aquí te contaré lo que pase. '
      : (w.text || 'En el pueblo todo sigue tranquilo. ');
    return h.responseBuilder
      .speak(intro + ' Puedes preguntar por un vecino, o pedir que llueva, una fiesta, un forastero o la lotería.')
      .reprompt('Puedes decir: que llueva, haz una fiesta, cómo está Paco, o qué ha pasado.')
      .getResponse();
  }
};

const PowerHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && !!POWERS[Alexa.getIntentName(h.requestEnvelope)],
  async handle(h) {
    const power = POWERS[Alexa.getIntentName(h.requestEnvelope)];
    const name = slot(h, 'nombre');
    if (supportsHTML(h)) {
      return h.responseBuilder
        .speak(pick(POWER_SPEECH[power]))
        .addDirective(htmlMessage({ type: 'power', power, name }))
        .getResponse();
    }
    const P = await getSim();
    const attrs = await loadAttrs(h);
    const w = loadWorld(P, attrs);
    const text = P.applyPower(w.S, power, { name });
    P.fastForward(w.S, 60); // dejamos que pase una hora para que haya reacción
    storeWorld(P, attrs, w.S);
    await saveAttrs(h, attrs);
    return h.responseBuilder.speak(text + ' ¿Algo más, santo patrón?').reprompt('¿Algo más?').getResponse();
  }
};

const VecinoHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'VecinoIntent',
  async handle(h) {
    const name = slot(h, 'vecino');
    if (!name) return h.responseBuilder.speak('¿Por qué vecino me preguntas?').reprompt('Dime un nombre, por ejemplo: cómo está Paco.').getResponse();
    if (supportsHTML(h)) return h.responseBuilder.addDirective(htmlMessage({ type: 'ask', name })).getResponse();
    const P = await getSim();
    const attrs = await loadAttrs(h);
    const w = loadWorld(P, attrs);
    const v = P.findVillager(w.S, name);
    storeWorld(P, attrs, w.S);
    await saveAttrs(h, attrs);
    const text = v ? P.describeVillager(w.S, v) : 'No conozco a nadie que se llame ' + name.charAt(0).toUpperCase() + name.slice(1) + ' en el pueblo.';
    return h.responseBuilder.speak(text + ' ¿Algo más?').reprompt('¿Algo más?').getResponse();
  }
};

// ---------- Dilemas, alcalde y elecciones ----------
function intentIs(h, names) { return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && names.includes(Alexa.getIntentName(h.requestEnvelope)); }
async function withWorld(h, fn) {
  const P = await getSim();
  const attrs = await loadAttrs(h);
  const w = loadWorld(P, attrs);
  const text = fn(P, w.S);
  storeWorld(P, attrs, w.S);
  await saveAttrs(h, attrs);
  return text;
}
const OpcionHandler = {
  canHandle: (h) => intentIs(h, ['OpcionUnoIntent', 'OpcionDosIntent']),
  async handle(h) {
    const choice = Alexa.getIntentName(h.requestEnvelope) === 'OpcionDosIntent' ? 1 : 0;
    if (supportsHTML(h)) return h.responseBuilder.addDirective(htmlMessage({ type: 'dilemma', choice })).getResponse();
    const text = await withWorld(h, (P, S) => (S.dilemma && P.answerDilemma ? P.answerDilemma(S, choice, false) : 'Ahora mismo el pueblo no te pide nada.'));
    return h.responseBuilder.speak(text + ' ¿Algo más?').reprompt('¿Algo más?').getResponse();
  }
};
const DilemaHandler = {
  canHandle: (h) => intentIs(h, ['DilemaIntent']),
  async handle(h) {
    if (supportsHTML(h)) return h.responseBuilder.addDirective(htmlMessage({ type: 'readDilemma' })).getResponse();
    const text = await withWorld(h, (P, S) => (P.dilemmaSpeech ? P.dilemmaSpeech(S) : 'Ahora mismo el pueblo no te pide nada.'));
    return h.responseBuilder.speak(text).reprompt('¿La primera o la segunda?').getResponse();
  }
};
const AlcaldeHandler = {
  canHandle: (h) => intentIs(h, ['AlcaldeIntent']),
  async handle(h) {
    if (supportsHTML(h)) return h.responseBuilder.addDirective(htmlMessage({ type: 'mayor' })).getResponse();
    const text = await withWorld(h, (P, S) => (P.mayorInfo ? P.mayorInfo(S) : 'El pueblo todavía no tiene ayuntamiento.'));
    return h.responseBuilder.speak(text + ' ¿Algo más?').reprompt('¿Algo más?').getResponse();
  }
};
const ApoyarHandler = {
  canHandle: (h) => intentIs(h, ['ApoyarIntent']),
  async handle(h) {
    const name = slot(h, 'vecino');
    if (!name) return h.responseBuilder.speak('¿A qué candidato quieres bendecir?').reprompt('Dime un nombre.').getResponse();
    if (supportsHTML(h)) return h.responseBuilder.addDirective(htmlMessage({ type: 'endorse', name })).getResponse();
    const text = await withWorld(h, (P, S) => (P.endorse ? P.endorse(S, name) : 'Ahora no hay elecciones.'));
    return h.responseBuilder.speak(text + ' ¿Algo más?').reprompt('¿Algo más?').getResponse();
  }
};

const ChronicleHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'CronicaIntent',
  async handle(h) {
    if (supportsHTML(h)) return h.responseBuilder.addDirective(htmlMessage({ type: 'requestChronicle' })).getResponse();
    const P = await getSim();
    const attrs = await loadAttrs(h);
    const w = loadWorld(P, attrs);
    const text = w.text || P.chronicle(w.S, Math.max(0, w.S.time - P.DAY));
    storeWorld(P, attrs, w.S);
    await saveAttrs(h, attrs);
    return h.responseBuilder.speak(text + ' ¿Algo más?').reprompt('¿Algo más?').getResponse();
  }
};

// Mensajes que manda la web: guardar el estado o pedir que Alexa diga algo
const WebMessageHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'Alexa.Presentation.HTML.Message',
  async handle(h) {
    const msg = h.requestEnvelope.request.message || {};
    if (msg.state) {
      const attrs = await loadAttrs(h);
      attrs.state = msg.state; attrs.savedAt = Date.now();
      await saveAttrs(h, attrs);
    }
    if ((msg.type === 'speak' || msg.type === 'chronicle') && msg.text) return h.responseBuilder.speak(String(msg.text).slice(0, 7000)).getResponse();
    return h.responseBuilder.getResponse();
  }
};

const HelpHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
  handle(h) {
    const speech = 'Eres el santo patrón del pueblo. Tus poderes gastan fe: puedes pedir que llueva, que salga el sol, haz una fiesta, manda un forastero, bendice la cosecha, que toque la lotería, una lluvia de estrellas o una aparición del santo. Cuando el pueblo te pida consejo, di: la primera, o la segunda. Puedes preguntar cómo está un vecino, quién es el alcalde, o qué ha pasado.';
    const rb = h.responseBuilder.speak(speech);
    return (supportsHTML(h) ? rb : rb.reprompt('¿Qué quieres hacer?')).getResponse();
  }
};

const StopHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
    ['AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent'].includes(Alexa.getIntentName(h.requestEnvelope)),
  handle(h) { return h.responseBuilder.speak('¡Hasta luego! El pueblo seguirá a lo suyo.').withShouldEndSession(true).getResponse(); }
};

const FallbackHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent',
  handle(h) {
    const rb = h.responseBuilder.speak('Eso no lo puede hacer ni un santo. Prueba con: que llueva, haz una fiesta, o cómo está Paco.');
    return (supportsHTML(h) ? rb : rb.reprompt('¿Qué quieres hacer?')).getResponse();
  }
};

const SessionEndedHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle(h) { return h.responseBuilder.getResponse(); }
};

const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('Error:', error && error.stack ? error.stack : error);
    return h.responseBuilder.speak('Vaya, algo ha fallado en el pueblo. Prueba otra vez.').getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(LaunchHandler, PowerHandler, OpcionHandler, DilemaHandler, AlcaldeHandler, ApoyarHandler, VecinoHandler, ChronicleHandler, WebMessageHandler, HelpHandler, StopHandler, FallbackHandler, SessionEndedHandler)
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(persistenceAdapter)
  .lambda();
