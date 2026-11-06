/*
 * Pueblo Vivo — skill de Alexa (backend).
 * Con pantalla: abre la web del pueblo (Web API for Games) y le pasa los poderes.
 * Sin pantalla: usa el mismo motor (sim.js) para avanzar el pueblo y narrar la crónica.
 */
const Alexa = require('ask-sdk-core');
const P = require('./sim.js');
const { WEB_APP_URL } = require('./config.js');

const OFFLINE_RATE = 24 / 60;      // minutos de juego por segundo real sin mirar
const OFFLINE_CAP = 3 * P.DAY;     // máximo 3 días de avance

const POWERS = {
  LluviaIntent: 'lluvia', SolIntent: 'sol', FiestaIntent: 'fiesta', ForasteroIntent: 'forastero', BendecirIntent: 'bendecir'
};
const POWER_SPEECH = {
  lluvia: ['¡Que llueva!', 'Vienen nubes cargaditas.', 'Allá va un chaparrón.'],
  sol: ['¡Sale el sol!', 'Fuera nubes.'],
  fiesta: ['¡Que empiecen las fiestas!', '¡Verbena en la plaza!'],
  forastero: ['Alguien viene por el camino…', 'Llega un forastero.'],
  bendecir: ['Cosecha bendecida.', 'Los campos te lo agradecen.']
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

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
  // Para pruebas locales: memoria del proceso
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

// Carga el pueblo guardado y lo avanza según el tiempo que no se ha mirado (modo solo voz)
function loadWorld(attrs) {
  let S = null;
  try { S = attrs.state ? P.deserialize(attrs.state) : null; } catch (e) { S = null; }
  if (!S) return { S: P.createWorld(Date.now() % 100000), text: null, fresh: true };
  const since = S.time;
  const away = S.savedAt ? (Date.now() - S.savedAt) / 1000 : 0;
  const mins = Math.min(OFFLINE_CAP, Math.floor(away * OFFLINE_RATE));
  if (mins >= 30) P.fastForward(S, mins);
  return { S, text: mins >= 30 ? P.chronicle(S, since) : null, fresh: false };
}
function storeWorld(attrs, S) { S.savedAt = Date.now(); attrs.state = P.serialize(S); attrs.savedAt = S.savedAt; }

// ---------- Manejadores ----------
const LaunchHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  async handle(h) {
    const attrs = await loadAttrs(h);
    if (supportsHTML(h)) {
      const welcome = attrs.state ? 'Bienvenido de nuevo a Pueblo Vivo.' : 'Bienvenido a Pueblo Vivo. Eres el santo patrón de este pueblo: mira cómo viven sus vecinos o pide que llueva, una fiesta o un forastero.';
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
    // Sin pantalla: crónica por voz con el mismo motor
    const w = loadWorld(attrs);
    storeWorld(attrs, w.S);
    await saveAttrs(h, attrs);
    const intro = w.fresh
      ? 'Bienvenido a Pueblo Vivo, un pueblo que vive solo. Eres su santo patrón. En un Echo con pantalla podrás verlo; aquí te contaré lo que pase. '
      : (w.text || 'En el pueblo todo sigue tranquilo. ');
    return h.responseBuilder
      .speak(intro + ' ¿Quieres que llueva, hacer una fiesta, mandar un forastero o bendecir la cosecha?')
      .reprompt('Puedes decir: que llueva, haz una fiesta, manda un forastero, o qué ha pasado.')
      .getResponse();
  }
};

const PowerHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && !!POWERS[Alexa.getIntentName(h.requestEnvelope)],
  async handle(h) {
    const power = POWERS[Alexa.getIntentName(h.requestEnvelope)];
    const name = Alexa.getSlotValue(h.requestEnvelope, 'nombre') || null;
    if (supportsHTML(h)) {
      return h.responseBuilder
        .speak(pick(POWER_SPEECH[power]))
        .addDirective(htmlMessage({ type: 'power', power, name }))
        .getResponse();
    }
    const attrs = await loadAttrs(h);
    const w = loadWorld(attrs);
    const text = P.applyPower(w.S, power, { name });
    P.fastForward(w.S, 60); // dejamos que pase una hora para que haya reacción
    storeWorld(attrs, w.S);
    await saveAttrs(h, attrs);
    return h.responseBuilder.speak(text + ' ¿Algo más, santo patrón?').reprompt('¿Algo más?').getResponse();
  }
};

const ChronicleHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'CronicaIntent',
  async handle(h) {
    if (supportsHTML(h)) {
      // La web calcula la crónica con el estado en directo y la devuelve en un mensaje
      return h.responseBuilder.addDirective(htmlMessage({ type: 'requestChronicle' })).getResponse();
    }
    const attrs = await loadAttrs(h);
    const w = loadWorld(attrs);
    const text = w.text || P.chronicle(w.S, Math.max(0, w.S.time - P.DAY));
    storeWorld(attrs, w.S);
    await saveAttrs(h, attrs);
    return h.responseBuilder.speak(text + ' ¿Algo más?').reprompt('¿Algo más?').getResponse();
  }
};

// Mensajes que manda la web: guardar el estado o pedir que Alexa lea la crónica
const WebMessageHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'Alexa.Presentation.HTML.Message',
  async handle(h) {
    const msg = h.requestEnvelope.request.message || {};
    if (msg.state) {
      const attrs = await loadAttrs(h);
      attrs.state = msg.state; attrs.savedAt = Date.now();
      await saveAttrs(h, attrs);
    }
    if (msg.type === 'chronicle' && msg.text) return h.responseBuilder.speak(msg.text).getResponse();
    return h.responseBuilder.getResponse();
  }
};

const HelpHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
  handle(h) {
    const speech = 'Eres el santo patrón del pueblo. Los vecinos viven solos, pero puedes pedir: que llueva, que salga el sol, haz una fiesta, manda un forastero o bendice la cosecha. Y si quieres saber las novedades, pregunta qué ha pasado.';
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
    const rb = h.responseBuilder.speak('Eso no lo puede hacer ni un santo. Prueba con: que llueva, haz una fiesta o manda un forastero.');
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
  .addRequestHandlers(LaunchHandler, PowerHandler, ChronicleHandler, WebMessageHandler, HelpHandler, StopHandler, FallbackHandler, SessionEndedHandler)
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(persistenceAdapter)
  .lambda();
