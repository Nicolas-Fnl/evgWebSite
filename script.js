/**
 * script.js — Utilitaires partagés et gestion de l'authentification
 *
 * L'authentification est vérifiée AUTOMATIQUEMENT sur chaque page
 * via le listener DOMContentLoaded en bas de ce fichier.
 *
 * Pour protéger une page : inclure config.js puis script.js — c'est tout.
 * Pour rendre une page publique : ajouter son nom dans PUBLIC_PAGES.
 *
 * Dépendance : config.js (doit être chargé avant ce fichier)
 */

// ── Pages publiques (aucune auth requise) ────────────────────────
const PUBLIC_PAGES = ['login', 'login.html'];

// ── Pages réservées aux admins ────────────────────────────────────
const ADMIN_PAGES = ['admin', 'admin.html'];

// ── Clés localStorage ─────────────────────────────────────────────
const AUTH_HOST_KEY        = CONFIG.LS_HOST;
const AUTH_TOKEN_KEY       = CONFIG.LS_DECRYPTION_TOKEN;
const AUTH_ADMIN_TOKEN_KEY = CONFIG.LS_ADMIN_TOKEN;
const AUTH_EVGNAME_KEY     = CONFIG.LS_EVG_NAME;
const AUTH_SCOPE_KEY       = CONFIG.LS_SCOPE;
const AUTH_IP_KEY          = CONFIG.LS_IP;
const AUTH_LAST_PLAYER_KEY = CONFIG.LS_LAST_PLAYER;
const AUTH_CONFIGS_CACHE_KEY = CONFIG.LS_CONFIGS_CACHE;
const AUTH_UI_STRINGS_CACHE_KEY = CONFIG.LS_UI_STRINGS_CACHE;
const AUTH_ADMIN_EVG_KEY = CONFIG.LS_ADMIN_ACTIVE_EVG;


// ══════════════════════════════════════════════════════════════════
//  MOCK FETCH — Simule tous les appels réseau externes
//  Actif uniquement si CONFIG.MOCK_MODE === true.
//
//  Endpoints interceptés :
//    AUTH_URL  POST  → authentification
//    SCORE_URL POST  → enregistrement d'un score
//    SCORE_URL GET   → lecture de tous les scores
//    api.ipify.org   → résolution de l'IP client
//
//  Identifiant admin en mock : "Admin#000000"
// ══════════════════════════════════════════════════════════════════

(function setupMockFetch() {
  if (!CONFIG.MOCK_MODE) return;

  const _real = window.fetch.bind(window);

  // ── Données fictives (format réel de l'API) ──────────────────
  const MOCK_CONFIGS = {
    William: { quiz: true, heta: false, digamma: false, beta: true,  scratch: true, flash: true,  questions: true  },
    Thomas:  { quiz: true, heta: true,  digamma: false, beta: false, scratch: true, flash: false, questions: true  },
  };

  const MOCK_SCORES = [
    { date: '2026-04-21T10:00:00.000Z', 'prénom': 'Kevin',  score: 22,  jeu: 'quiz-galerie',  ip: '1.1.1.1', evg_name: 'William' },
    { date: '2026-04-21T10:05:00.000Z', 'prénom': 'Marc',   score: 18,  jeu: 'quiz-galerie',  ip: '1.1.1.2', evg_name: 'William' },
    { date: '2026-04-21T10:10:00.000Z', 'prénom': 'Julien', score: 15,  jeu: 'quiz-galerie',  ip: '1.1.1.3', evg_name: 'William' },
    { date: '2026-04-21T10:15:00.000Z', 'prénom': 'Pierre', score: 10,  jeu: 'quiz-galerie',  ip: '1.1.1.4', evg_name: 'Thomas'  },
    { date: '2026-04-21T10:20:00.000Z', 'prénom': 'Nico',   score:  7,  jeu: 'quiz-galerie',  ip: '1.1.1.5', evg_name: 'Thomas'  },
    { date: '2026-04-21T10:05:00.000Z', 'prénom': 'Marc',   score: 198, jeu: 'sequence-memo', ip: '1.1.1.2', evg_name: 'William' },
    { date: '2026-04-21T10:00:00.000Z', 'prénom': 'Kevin',  score: 245, jeu: 'sequence-memo', ip: '1.1.1.1', evg_name: 'William' },
    { date: '2026-04-21T10:20:00.000Z', 'prénom': 'Nico',   score: 312, jeu: 'sequence-memo', ip: '1.1.1.5', evg_name: 'Thomas'  },
    { date: '2026-04-21T10:10:00.000Z', 'prénom': 'Julien', score: 380, jeu: 'sequence-memo', ip: '1.1.1.3', evg_name: 'Thomas'  },
    { date: '2026-04-21T10:15:00.000Z', 'prénom': 'Pierre', score: 450, jeu: 'sequence-memo', ip: '1.1.1.4', evg_name: 'Thomas'  },
  ];

  window.fetch = async function (url, options = {}) {
    const sUrl     = typeof url === 'string' ? url : '';
    const isAuth   = sUrl.startsWith(CONFIG.AUTH_URL);
    // En MOCK_MODE, CONFIG.SCORE_URL doit être une URL en clair (pas de
    // build chiffré nécessaire en dev local) — voir getScoreUrl() plus bas.
    const isScore  = !!CONFIG.SCORE_URL && sUrl.startsWith(CONFIG.SCORE_URL);
    const isIpify  = sUrl.includes('api.ipify.org');

    if (!isAuth && !isScore && !isIpify) return _real(url, options);

    // Délai réseau simulé
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));

    // ── ipify — IP client ────────────────────────────────────────
    if (isIpify) {
      console.log('[MOCK] ipify → 127.0.0.1');
      return _json({ ip: '127.0.0.1' });
    }

    // ── AUTH_URL — Authentification + configuration ──────────────
    if (isAuth && options.method === 'POST') {
      const fd     = options.body instanceof FormData ? options.body : new FormData();
      const action = (fd.get('action') || 'login').toString().toLowerCase();

      if (action === 'login') {
        const identifier = (fd.get('identifiers') || '').toString();
        const isAdminId  = identifier.toLowerCase().startsWith('admin');
        console.log(`[MOCK] LOGIN identifiers="${identifier}" → ${isAdminId ? 'admin' : 'user'}`);
        if (isAdminId) {
          return _json({
            status: 'ok', scope: 'admin',
            adminToken: 'mock-admin-token-xxxxxxxx',
            decryptionToken: 'mock-decryption-token-xxxxxxxx',
          });
        }
        const prefix  = identifier.split('#')[0].trim();
        const evgName = Object.keys(MOCK_CONFIGS).find(
          (n) => n.toLowerCase() === prefix.toLowerCase()
        ) || prefix;
        return _json({
          status: 'ok',
          decryptionToken: 'mock-decryption-token-xxxxxxxx',
          evg_name: evgName,
        });
      }

      if (action === 'setconfig') {
        const evgName = (fd.get('evg_name') || '').toString();
        const key     = (fd.get('config')   || '').toString();
        const value   = (fd.get('value')    || '').toString() === 'true';
        console.log(`[MOCK] SETCONFIG ${evgName}.${key} = ${value}`);
        if (!MOCK_CONFIGS[evgName]) return _json({ status: 'error', message: "Utilisateur '" + evgName + "' introuvable" });
        MOCK_CONFIGS[evgName][key] = value;
        return _json({ status: 'success', message: 'Configuration mise à jour avec succès' });
      }

      if (action === 'adduser') {
        const evgName = (fd.get('evg_name') || '').toString().trim();
        console.log(`[MOCK] ADDUSER "${evgName}"`);
        if (!evgName) return _json({ status: 'error', message: 'Nom d\'utilisateur manquant' });
        MOCK_CONFIGS[evgName] = { quiz: false, heta: false, digamma: false, beta: false, scratch: false, flash: false, questions: false };
        return _json({ status: 'success', message: `Utilisateur '${evgName}' ajouté avec succès avec toutes les options par défaut (false)` });
      }

      if (action === 'deleteuser') {
        const evgName = (fd.get('evg_name') || '').toString().trim();
        console.log(`[MOCK] DELETEUSER "${evgName}"`);
        const match = Object.keys(MOCK_CONFIGS).find((n) => n.toLowerCase() === evgName.toLowerCase());
        if (!match) return _json({ status: 'error', message: "Utilisateur '" + evgName + "' introuvable" });
        delete MOCK_CONFIGS[match];
        return _json({ status: 'success', message: `Utilisateur '${match}' supprimé avec succès` });
      }

      return _json({ status: 'error', message: '[MOCK] action POST inconnue' });
    }

    // ── AUTH_URL GET — getConfigs ─────────────────────────────────
    if (isAuth && (!options.method || options.method === 'GET')) {
      const evgNameReq = (new URL(sUrl, window.location.origin).searchParams.get('evg_name') || '').trim();
      console.log(`[MOCK] GETCONFIGS evg_name="${evgNameReq}"`);

      if (!evgNameReq) return _json({ status: 'ok', allConfigs: MOCK_CONFIGS });

      const match = Object.keys(MOCK_CONFIGS).find((n) => n.toLowerCase() === evgNameReq.toLowerCase());
      if (!match) return _json({ status: 'error', message: 'Utilisateur non trouvé' });
      return _json({ status: 'ok', configs: MOCK_CONFIGS[match] });
    }

    // ── SCORE_URL POST — Enregistrement d'un score ───────────────
    if (isScore && options.method === 'POST') {
      const fd     = options.body instanceof FormData ? options.body : new FormData();
      const fields = {};
      fd.forEach((v, k) => { fields[k] = v; });
      console.log('[MOCK] SCORE POST reçu :', fields);
      return _json({ ok: true });
    }

    // ── SCORE_URL GET — Lecture de tous les scores ───────────────
    if (isScore && (!options.method || options.method === 'GET')) {
      console.log('[MOCK] SCORE GET → retourne', MOCK_SCORES.length, 'entrées');
      return _json({ status: 'success', data: MOCK_SCORES });
    }

    return _json({ status: 'error', message: '[MOCK] requête non reconnue' });
  };

  function _json(data) {
    return new Response(JSON.stringify(data), {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
})();


// ══════════════════════════════════════════════════════════════════
//  AUTHENTIFICATION — Lecture du state
// ══════════════════════════════════════════════════════════════════

/**
 * Retourne le prénom de la personne dont c'est l'EVG, ou null.
 * Pour un admin, renvoie l'EVG choisi via le menu déroulant (voir
 * getAdminActiveEvg()/initAdminEvgSelector()) plutôt que l'identifiant de
 * connexion ("Admin") — cela permet à l'admin de "jouer pour" un EVG
 * donné (scores, images perso de la Séquence Mémo, etc.).
 * @returns {string|null}
 */
function getEvgHost() {
  if (isAdmin()) return getAdminActiveEvg() || localStorage.getItem(AUTH_HOST_KEY) || null;
  return localStorage.getItem(AUTH_HOST_KEY) || null;
}

/**
 * Retourne l'EVG actuellement choisi par l'admin dans le menu déroulant
 * (voir initAdminEvgSelector()), ou null si aucun n'a encore été choisi.
 * @returns {string|null}
 */
function getAdminActiveEvg() {
  return localStorage.getItem(AUTH_ADMIN_EVG_KEY) || null;
}

/**
 * Mémorise l'EVG choisi par l'admin (localStorage, persiste entre les pages).
 * @param {string} evgName
 */
function setAdminActiveEvg(evgName) {
  localStorage.setItem(AUTH_ADMIN_EVG_KEY, evgName);
}

/**
 * Retourne le dernier prénom participant ayant enregistré un score.
 * Utilisé pour pré-remplir les formulaires de sauvegarde.
 * @returns {string}
 */
function getLastPlayer() {
  return localStorage.getItem(AUTH_LAST_PLAYER_KEY) || '';
}

/**
 * Retourne le token de déchiffrement (commun à tous les utilisateurs connectés), ou null.
 * @returns {string|null}
 */
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || null;
}

/**
 * Retourne le token d'écriture admin, ou null (absent pour les utilisateurs non-admin).
 * @returns {string|null}
 */
function getAdminToken() {
  return localStorage.getItem(AUTH_ADMIN_TOKEN_KEY) || null;
}

/**
 * Retourne le nom exact de l'EVG tel que renvoyé par le Sheet (non-admins uniquement), ou null.
 * @returns {string|null}
 */
function getEvgName() {
  return localStorage.getItem(AUTH_EVGNAME_KEY) || null;
}

/**
 * Retourne true si l'utilisateur est connecté (token API présent).
 * @returns {boolean}
 */
function isAuthenticated() {
  const token = getAuthToken();
  return token !== null && token.trim() !== '';
}


// ══════════════════════════════════════════════════════════════════
//  CHIFFREMENT — Déchiffrement générique en mémoire
//
//  Utilisé pour performers_data.json ET pour CONFIG.SCORE_URL_ENC.
//  AES-256-GCM, clé dérivée par PBKDF2-SHA256 du decryptionToken.
//  Le contenu en clair (noms, tags 'heta'/'beta', URLs d'images, URL du
//  GAS de scores) n'existe jamais sur le réseau ni dans les fichiers du
//  dépôt — seulement en mémoire, après authentification. Format de
//  l'enveloppe : { v: 1, salt: "<base64>", iv: "<base64>", data: "<base64>" }
//  Doit rester en phase avec les scripts Python (mêmes paramètres PBKDF2/AES) :
//  Prepare_data/encrypt_performers_data.py, Prepare_data/encrypt_config_value.py
// ══════════════════════════════════════════════════════════════════

const _CRYPT_PBKDF2_ITERATIONS = 100000;

function _b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function _deriveKeyFromToken(token, saltB64) {
  const enc = new TextEncoder();
  const salt = _b64ToBytes(saltB64);
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(token), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: _CRYPT_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Déchiffre une enveloppe { v, salt, iv, data } en octets bruts, en
 * utilisant le token fourni (typiquement le decryptionToken de session)
 * comme secret de dérivation de clé.
 *
 * @param {{v:number, salt:string, iv:string, data:string}} envelope
 * @param {string} token
 * @returns {Promise<ArrayBuffer>}
 */
async function _decryptEnvelope(envelope, token) {
  const key = await _deriveKeyFromToken(token, envelope.salt);
  const iv  = _b64ToBytes(envelope.iv);
  const ciphertext = _b64ToBytes(envelope.data);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

/**
 * Déchiffre l'enveloppe produite par Prepare_data/encrypt_performers_data.py,
 * en utilisant le decryptionToken de la session courante.
 *
 * @param {{v:number, salt:string, iv:string, data:string}} envelope
 * @returns {Promise<Array>} le tableau des performers en clair
 */
async function decryptPerformersData(envelope) {
  const token = getAuthToken();
  if (!token) throw new Error('Déchiffrement impossible : utilisateur non authentifié.');
  const plainBuf = await _decryptEnvelope(envelope, token);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

/**
 * Charge les données performers depuis CONFIG.JSON_PATH.
 * Détecte automatiquement le format :
 * - tableau JSON en clair (pratique en dev local) → renvoyé tel quel
 * - enveloppe chiffrée { v, salt, iv, data } → déchiffrée via le
 *   decryptionToken de la session (nécessite d'être authentifié)
 *
 * @returns {Promise<Array>}
 */
async function loadPerformersData() {
  const res = await fetch(CONFIG.JSON_PATH);
  const payload = await res.json();
  if (Array.isArray(payload)) return payload;
  return decryptPerformersData(payload);
}

// ── Chaînes d'interface chiffrées (titres/labels de catégories sensibles) ──
// Même logique que performers_data.json : enveloppe chiffrée en prod, objet
// JSON en clair accepté en dev local. Mise en cache localStorage (comme les
// configs) pour ne déchiffrer qu'une fois par session, pas à chaque page.

/**
 * Charge et déchiffre les chaînes d'interface depuis CONFIG.STRINGS_PATH.
 * Détecte automatiquement le format : objet en clair (dev local) ou
 * enveloppe chiffrée { v, salt, iv, data } (nécessite d'être authentifié).
 * @returns {Promise<Object>} dictionnaire clé → texte
 */
async function loadUIStrings() {
  const res = await fetch(CONFIG.STRINGS_PATH);
  const payload = await res.json();
  if (payload && typeof payload === 'object' && payload.v === 1 && payload.salt && payload.iv && payload.data) {
    const token = getAuthToken();
    if (!token) throw new Error('Chaînes UI indisponibles : utilisateur non authentifié.');
    const plainBuf = await _decryptEnvelope(payload, token);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }
  return payload;
}

/**
 * Met en cache les chaînes d'interface déchiffrées (localStorage), pour
 * éviter de redéchiffrer à chaque page.
 * @param {Object} strings
 */
function setCachedUIStrings(strings) {
  localStorage.setItem(AUTH_UI_STRINGS_CACHE_KEY, JSON.stringify(strings));
}

/**
 * Retourne les chaînes d'interface mises en cache, ou null si absentes.
 * @returns {Object|null}
 */
function getCachedUIStrings() {
  try {
    const raw = localStorage.getItem(AUTH_UI_STRINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Retourne les chaînes d'interface : depuis le cache si présent, sinon les
 * charge/déchiffre et les met en cache.
 * @returns {Promise<Object>}
 */
async function getUIStrings() {
  const cached = getCachedUIStrings();
  if (cached) return cached;
  const strings = await loadUIStrings();
  setCachedUIStrings(strings);
  return strings;
}

// ── URLs de GAS chiffrées (SCORE_URL, IMAGES_URL, QUESTIONS_URL) ──
// AUTH_URL reste en clair (nécessaire pour obtenir le decryptionToken au
// login — dépendance circulaire sinon). Les autres URLs de GAS ne sont
// nécessaires qu'après authentification : elles peuvent donc être
// chiffrées avec le même token. Les trois getters suivent le même schéma
// (clé CONFIG en clair pour le dev/mock, sinon déchiffrement de la clé
// `..._ENC` via le decryptionToken de la session, mis en cache en mémoire
// pour la durée de la page) — voir `_makeEncryptedUrlGetter`.

/**
 * Fabrique un getter d'URL de GAS chiffrée : renvoie `CONFIG[plainKey]` si
 * présente (dev/mock), sinon déchiffre `CONFIG[encKey]` via le
 * decryptionToken de la session et met le résultat en cache en mémoire
 * (fermeture privée, durée de la page).
 * @param {string} plainKey - clé CONFIG en clair (ex: "SCORE_URL")
 * @param {string} encKey - clé CONFIG chiffrée (ex: "SCORE_URL_ENC")
 * @returns {() => Promise<string>}
 */
function _makeEncryptedUrlGetter(plainKey, encKey) {
  let cache = null;
  return async function () {
    if (CONFIG[plainKey]) return CONFIG[plainKey];
    if (cache) return cache;

    const token = getAuthToken();
    if (!token) throw new Error(`${plainKey} indisponible : utilisateur non authentifié.`);
    if (!CONFIG[encKey]) throw new Error(`${encKey} non configurée (voir DEVELOPER.md § Déploiement).`);

    const plainBuf = await _decryptEnvelope(CONFIG[encKey], token);
    cache = new TextDecoder().decode(plainBuf);
    return cache;
  };
}

const getScoreUrl     = _makeEncryptedUrlGetter('SCORE_URL',     'SCORE_URL_ENC');
const getImagesUrl    = _makeEncryptedUrlGetter('IMAGES_URL',    'IMAGES_URL_ENC');
const getQuestionsUrl = _makeEncryptedUrlGetter('QUESTIONS_URL', 'QUESTIONS_URL_ENC');

/**
 * Récupère la liste des images personnalisées d'un EVG.
 * Réponse attendue : { success: true, images: [{ name, url, mimeType, parentFolder }, ...] }
 *
 * @param {string} evgName
 * @returns {Promise<{success: boolean, images?: Array}>}
 */
async function fetchCustomImages(evgName) {
  const token = getAuthToken() || '';
  const url   = await getImagesUrl();

  const formData = new FormData();
  formData.append('action',  'getImages');
  formData.append('token',   token);
  formData.append('evgName', evgName);

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Accept': 'application/json' },
    body:    formData,
  });
  return res.json();
}

/**
 * Retourne true si la session dispose des droits étendus.
 * La clé est absente du localStorage pour tout utilisateur ordinaire.
 * @returns {boolean}
 */
function isAdmin() {
  return localStorage.getItem(AUTH_SCOPE_KEY) === 'admin';
}


// ══════════════════════════════════════════════════════════════════
//  AUTHENTIFICATION — Actions
// ══════════════════════════════════════════════════════════════════

/**
 * Authentifie un participant via l'API et redirige vers la page cible.
 * L'identifiant doit être au format "Prénom#Code" (ex : "Niclas#251294").
 *
 * @param {string} identifier    - Identifiant saisi par l'utilisateur
 * @param {Function} onError     - Callback(message) appelé en cas d'échec
 * @param {Function} onLoading   - Callback(bool) pour afficher/masquer le loader
 * @returns {Promise<void>}
 */
async function doLogin(identifier, onError, onLoading) {
  if (typeof onLoading === 'function') onLoading(true);
  try {
    const formData = new FormData();
    formData.append('action', 'login');
    formData.append('identifiers', identifier);

    const res  = await fetch(CONFIG.AUTH_URL, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    formData,
    });
    const data = await res.json();

    if (data.status !== 'ok' || !data.decryptionToken) {
      if (typeof onLoading === 'function') onLoading(false);
      if (typeof onError   === 'function') onError('Accès refusé. Vérifie ton identifiant.');
      return;
    }

    // Succès : extraire le prénom (partie avant le #) et stocker
    const hostName = identifier.split('#')[0].trim();
    localStorage.setItem(AUTH_HOST_KEY,  hostName);
    localStorage.setItem(AUTH_TOKEN_KEY, data.decryptionToken);

    // evg_scope / adminToken — écrits uniquement si l'API renvoie scope === "admin".
    // evg_name — écrit uniquement pour les utilisateurs non-admin (utilisé pour getConfigs).
    if (data.scope === 'admin') {
      localStorage.setItem(AUTH_SCOPE_KEY, 'admin');
      if (data.adminToken) localStorage.setItem(AUTH_ADMIN_TOKEN_KEY, data.adminToken);
    } else if (data.evg_name) {
      localStorage.setItem(AUTH_EVGNAME_KEY, data.evg_name);
    }

    // Récupérer et mettre en cache l'IP du client pour les scores
    try {
      const ipRes  = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      localStorage.setItem(AUTH_IP_KEY, ipData.ip || '');
    } catch (_) {
      localStorage.setItem(AUTH_IP_KEY, '');
    }

    const urlParams  = new URLSearchParams(window.location.search);
    const targetPage = sanitizeTargetPage(urlParams.get('page'));
    window.location.href = targetPage;

  } catch (err) {
    if (typeof onLoading === 'function') onLoading(false);
    if (typeof onError   === 'function') onError('Erreur réseau. Réessaie.');
  }
}

/**
 * Déconnecte l'utilisateur et redirige vers login.
 */
function doLogout() {
  localStorage.removeItem(AUTH_HOST_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ADMIN_TOKEN_KEY);
  localStorage.removeItem(AUTH_EVGNAME_KEY);
  localStorage.removeItem(AUTH_SCOPE_KEY);
  localStorage.removeItem(AUTH_IP_KEY);
  localStorage.removeItem(AUTH_LAST_PLAYER_KEY);
  localStorage.removeItem(AUTH_CONFIGS_CACHE_KEY);
  localStorage.removeItem(AUTH_UI_STRINGS_CACHE_KEY);
  localStorage.removeItem(AUTH_ADMIN_EVG_KEY);
  window.location.href = 'login';
}

/**
 * Enregistre un score pour un participant.
 * Stocke le prénom pour pré-remplir les prochains formulaires.
 *
 * @param {string} playerName  - Prénom du participant
 * @param {number} score
 * @param {string} jeu
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function saveScore(playerName, score, jeu) {
  const name = playerName.toUpperCase();
  localStorage.setItem(AUTH_LAST_PLAYER_KEY, name);
  return sendScore(name, score, jeu);
}

/**
 * Envoie un score à l'API de scores.
 *
 * - Token passé en query param (?token=…) — pas dans le corps.
 * - Corps en FormData (pas de Content-Type: application/json) →
 *   aucun preflight OPTIONS → pas de problème CORS.
 * - SCORE_URL est déchiffrée (getScoreUrl()) avant l'envoi — seule cette
 *   étape est attendue ; le POST lui-même reste fire-and-forget.
 *
 * @param {string} playerName
 * @param {number} score
 * @param {string} jeu
 * @returns {Promise<{ok: boolean}>}
 */
async function sendScore(playerName, score, jeu) {
  const token   = getAuthToken() || '';
  const baseUrl = await getScoreUrl();
  const url     = `${baseUrl}?token=${encodeURIComponent(token)}`;

  const formData = new FormData();
  formData.append('evg_name', getEvgHost() || '');
  formData.append('prenom',   playerName);
  formData.append('score',    String(score));
  formData.append('type_jeu', jeu);
  formData.append('ip',       localStorage.getItem(AUTH_IP_KEY) || '');

  // Fire-and-forget : pas d'await — l'UI ne se bloque pas sur l'envoi
  fetch(url, {
    method:  'POST',
    headers: { 'Accept': 'application/json' },
    body:    formData,
  }).catch((err) => console.warn('[SCORE] Échec envoi :', err));

  return { ok: true };
}

/**
 * Récupère l'ensemble des scores depuis l'API (tous les joueurs).
 * Réponse : { status: "success", data: [ { date, "prénom", score, jeu, ip }, … ] }
 *
 * @returns {Promise<{status: string, data: Array}>}
 */
async function getAllScores() {
  const token   = encodeURIComponent(getAuthToken() || '');
  const feuille = encodeURIComponent(getEvgHost() || '');
  const baseUrl = await getScoreUrl();
  const res     = await fetch(`${baseUrl}?token=${token}&prenom=${feuille}`);
  return res.json();
}

/**
 * Récupère les configs (feature flags) d'un EVG, ou de tous les EVG si `evgName`
 * est omis (nécessite alors le token admin — l'API renvoie `allConfigs`).
 *
 * @param {string} [evgName] - nom exact de l'EVG (colonne A du Sheet "Configs")
 * @returns {Promise<{status:string, configs?:Object, allConfigs?:Object, message?:string}>}
 */
async function getConfigs(evgName) {
  const token = encodeURIComponent(getAdminToken() || getAuthToken() || '');
  let url = `${CONFIG.AUTH_URL}?action=getConfigs&token=${token}`;
  if (evgName) url += `&evg_name=${encodeURIComponent(evgName)}`;
  const res = await fetch(url);
  return res.json();
}

/**
 * Masque les éléments portant un attribut [data-feature="clé"] dont la
 * config associée vaut explicitement `false`. Une clé absente de `configs`
 * laisse l'élément visible (fail-open — ne casse pas l'affichage si une
 * colonne du Sheet n'existe pas encore).
 *
 * @param {Object} configs - ex: { quiz: true, heta: false, scratch: true }
 */
function applyFeatureConfigs(configs) {
  document.querySelectorAll('[data-feature]').forEach((el) => {
    if (configs[el.dataset.feature] === false) el.classList.add('hidden');
  });
}

/**
 * Met en cache les configs de l'EVG courant (localStorage) pour que les
 * autres pages (ex: quiz.html) puissent les réutiliser sans refaire
 * d'appel réseau à `getConfigs()`.
 * @param {Object} configs
 */
function setCachedConfigs(configs) {
  localStorage.setItem(AUTH_CONFIGS_CACHE_KEY, JSON.stringify(configs));
}

/**
 * Retourne les configs mises en cache par `setCachedConfigs()`, ou null
 * si aucune n'a encore été mise en cache (ex: arrivée directe sur une
 * page sans passer par l'accueil).
 * @returns {Object|null}
 */
function getCachedConfigs() {
  try {
    const raw = localStorage.getItem(AUTH_CONFIGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}


// ══════════════════════════════════════════════════════════════════
//  AUTHENTIFICATION — Vérification automatique
// ══════════════════════════════════════════════════════════════════

/**
 * Vérifie que l'utilisateur est connecté.
 * Si non authentifié, redirige vers login?page=<page-courante>.
 *
 * Appelé automatiquement via DOMContentLoaded — aucun appel manuel
 * n'est nécessaire dans les pages protégées.
 */
function checkAuthentication() {
  const currentPage = window.location.pathname.split('/').pop() || '';

  // Pages publiques — aucune vérification
  if (PUBLIC_PAGES.includes(currentPage)) return;

  // Non authentifié → login
  if (!isAuthenticated()) {
    if (!currentPage || currentPage === 'index') {
      window.location.href = 'login';
    } else {
      window.location.href = `login?page=${encodeURIComponent(currentPage)}`;
    }
    return;
  }

  // Pages admin → scope requis, sinon retour au dashboard
  if (ADMIN_PAGES.includes(currentPage) && !isAdmin()) {
    window.location.href = './';
  }
}


// ══════════════════════════════════════════════════════════════════
//  UTILITAIRES FONCTIONNELS
// ══════════════════════════════════════════════════════════════════

/**
 * Valide une page cible issue de `?page=...` avant toute navigation, pour
 * empêcher une redirection ouverte (open redirect) vers un domaine externe
 * ou un schéma dangereux (javascript:, data:, //host, etc.). N'autorise que
 * de simples segments de page relatifs au site (ex: "quiz", "flash.html").
 * @param {string} page
 * @returns {string} page validée, ou './' si absente/invalide
 */
function sanitizeTargetPage(page) {
  if (!page || typeof page !== 'string') return './';
  if (/^[a-z][a-z0-9+.-]*:/i.test(page) || page.startsWith('//')) return './';
  if (!/^[a-zA-Z0-9_.\-\/?=&]*$/.test(page)) return './';
  return page;
}

/**
 * Échappe une valeur pour une insertion sûre dans du HTML — texte ou
 * attribut (guillemets doubles/simples inclus). À utiliser systématiquement
 * avant toute interpolation de données externes (performers_data.json,
 * scores, noms d'EVG) dans un template `innerHTML`.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mélange un tableau — algorithme Fisher-Yates.
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Tire n éléments uniques au hasard, en excluant des valeurs.
 * @param {Array} arr
 * @param {number} n
 * @param {Array} exclude
 * @returns {Array}
 */
function pickRandom(arr, n, exclude = []) {
  return shuffle(arr.filter((x) => !exclude.includes(x))).slice(0, n);
}

/**
 * Distance de Levenshtein optimisée (O(m × n)).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Retourne true si la saisie ressemble au nom attendu
 * à ≥ CASH_SIMILARITY_THRESHOLD.
 * @param {string} input
 * @param {string} expected
 * @returns {boolean}
 */
function isSimilarEnough(input, expected) {
  const a = input.toLowerCase().trim();
  const b = expected.toLowerCase().trim();
  if (!a.length && !b.length) return true;
  const dist   = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 && 1 - dist / maxLen >= CONFIG.CASH_SIMILARITY_THRESHOLD;
}

/**
 * Précharge des URLs d'images en parallèle.
 * Résout toujours (une image cassée ne bloque pas le jeu).
 * @param {string[]} urls
 * @returns {Promise<void>}
 */
function preloadImages(urls) {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise((resolve) => {
          const img   = new Image();
          img.onload  = resolve;
          img.onerror = resolve;
          img.src     = url;
        })
    )
  );
}

/**
 * Vibration courte (retour haptique) — no-op silencieux si l'API ou le
 * matériel n'est pas disponible (desktop, iOS Safari…).
 * @param {number|number[]} pattern
 */
function _vibrate(pattern) {
  navigator.vibrate && navigator.vibrate(pattern);
}

/**
 * Affiche la section `id` parmi les `.game-section` de la page (masque
 * toutes les autres) — convention partagée par les pages mini-jeu à
 * sections multiples (quiz, flash, scratch).
 * @param {string} id
 */
function showSection(id) {
  document.querySelectorAll('.game-section').forEach((s) => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}


// ══════════════════════════════════════════════════════════════════
//  PRÉVENTION ZOOM ET SCROLL NATIF MOBILE
//  Actif sur toutes les pages qui incluent script.js.
// ══════════════════════════════════════════════════════════════════

(function preventMobileZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.content =
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  }
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();


// ══════════════════════════════════════════════════════════════════
//  INITIALISATION AUTOMATIQUE
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  checkAuthentication();
  if (isAdmin()) {
    initAdminEvgSelector();
  } else {
    // Remplit tous les liens de navigation "EVG de {prénom}" présents sur la page
    const host = getEvgHost();
    if (host) {
      document.querySelectorAll('.evg-nav-name').forEach(el => {
        el.textContent = host;
      });
    }
  }
});

const EVG_CREATE_OPTION = '__create__';

// Cache mémoire (durée de la page) partagé entre le sélecteur d'en-tête
// et la page admin elle-même, pour n'appeler getConfigs() qu'une fois.
let _adminEvgDataPromise = null;

/**
 * Charge la liste des EVG + leurs configs (admin, un seul appel réseau
 * partagé, mis en cache pour la durée de la page), et détermine l'EVG
 * actif (persisté en localStorage, défaut = premier de la liste).
 * @returns {Promise<{evgNames: string[], allConfigs: Object, active: string}>}
 */
function ensureAdminEvgData() {
  if (_adminEvgDataPromise) return _adminEvgDataPromise;
  _adminEvgDataPromise = (async () => {
    let evgNames   = [];
    let allConfigs = {};
    try {
      const res = await getConfigs();
      if (res.status === 'ok' && res.allConfigs) {
        allConfigs = res.allConfigs;
        evgNames   = Object.keys(allConfigs).sort((a, b) => a.localeCompare(b));
      }
    } catch (err) {
      console.warn('[ADMIN] Échec du chargement des EVG :', err);
    }
    const active = evgNames.includes(getAdminActiveEvg()) ? getAdminActiveEvg() : (evgNames[0] || '');
    if (active) setAdminActiveEvg(active);
    return { evgNames, allConfigs, active };
  })();
  return _adminEvgDataPromise;
}

/**
 * Invalide le cache de ensureAdminEvgData() — à appeler après création/
 * suppression d'un EVG, avant de recharger la page.
 */
function invalidateAdminEvgData() {
  _adminEvgDataPromise = null;
}

/**
 * Remplace, pour un admin, chaque élément [.evg-nav-name] (habituellement
 * juste un nom en texte) par un menu déroulant listant tous les EVG (plus
 * une option "+ Créer…") — l'admin peut ainsi choisir "pour qui" il
 * navigue (voir getEvgHost()). Le choix est persisté (localStorage) et
 * déclenche un rechargement de la page pour que tout l'état dépendant de
 * l'EVG (configs, scores, images perso Séquence Mémo…) reparte à jour.
 */
async function initAdminEvgSelector() {
  const nameEls = document.querySelectorAll('.evg-nav-name');
  if (nameEls.length === 0) return;

  const { evgNames, active } = await ensureAdminEvgData();
  nameEls.forEach((el) => _buildAdminEvgSelector(el, evgNames, active));
}

function _buildAdminEvgSelector(nameEl, evgNames, current) {
  const select = document.createElement('select');
  select.className = 'evg-admin-select';
  select.style.minWidth = '0';
  select.innerHTML =
    evgNames.map((n) => `<option value="${escapeHtml(n)}"${n === current ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('') +
    `<option value="${EVG_CREATE_OPTION}">+ Créer…</option>`;
  select.addEventListener('click',  (e) => e.stopPropagation());
  select.addEventListener('change', () => _onAdminEvgSelectChange(select, current));

  // Un <select> interactif ne doit pas être imbriqué dans un <a> cliquable
  // (clic ambigu entre ouvrir le menu et suivre le lien) — on extrait le
  // lien "🎉 EVG" dans un conteneur dédié et on place le menu à côté.
  const anchor = nameEl.closest('a');
  if (!anchor) {
    nameEl.replaceWith(select);
    return;
  }
  // Retire aussi le label "EVG" (redondant une fois le sélecteur affiché à
  // côté) pour laisser de la place au titre centré du header — le lien ne
  // garde que l'icône 🎉.
  const label = nameEl.parentElement;
  (label && label !== anchor ? label : nameEl).remove();
  let wrapper = anchor.parentElement;
  if (!wrapper.classList.contains('evg-admin-wrap')) {
    wrapper = document.createElement('span');
    wrapper.className = 'evg-admin-wrap';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';
    wrapper.style.flexShrink = '0';
    anchor.parentNode.insertBefore(wrapper, anchor);
    wrapper.appendChild(anchor);
  }
  wrapper.appendChild(select);
}

async function _onAdminEvgSelectChange(select, previous) {
  if (select.value !== EVG_CREATE_OPTION) {
    setAdminActiveEvg(select.value);
    window.location.reload();
    return;
  }

  const name = (prompt('Prénom du nouvel EVG :') || '').trim();
  if (!name) {
    select.value = previous;
    return;
  }

  select.disabled = true;
  try {
    const formData = new FormData();
    formData.append('action',   'adduser');
    formData.append('token',    getAdminToken() || '');
    formData.append('evg_name', name);

    const res  = await fetch(CONFIG.AUTH_URL, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    formData,
    });
    const data = await res.json();

    if (data.status !== 'success') throw new Error(data.message || 'Échec de la création');

    invalidateAdminEvgData();
    setAdminActiveEvg(name);
    window.location.reload();
  } catch (err) {
    console.error('[ADMIN] addUser échec :', err);
    alert('Échec de la création : ' + err.message);
    select.disabled = false;
    select.value = previous;
  }
}
