/**
 * config.js — Configuration centrale de l'application EVG
 *
 * Modifier ce fichier avant le déploiement sur GitHub Pages.
 */

const CONFIG = {

  /**
   * Chemin vers le JSON des performers.
   * Doit être au même niveau que index.html dans GitHub Pages.
   *
   * En production, ce fichier est CHIFFRÉ (enveloppe { v, salt, iv, data }
   * produite par Prepare_data/encrypt_performers_data.py) et déchiffré en
   * mémoire par loadPerformersData() (script.js) via le decryptionToken
   * obtenu au login. Voir DEVELOPER.md § Sécurité — contenu chiffré.
   *
   * En dev local, pointer vers un fichier JSON en clair (tableau
   * [{ "name": "...", "imageUrlPortrait": "..." }, ...]) fonctionne aussi :
   * loadPerformersData() détecte automatiquement le format.
   */
  JSON_PATH: "./performers_data.json",

  /**
   * Chemin vers les chaînes d'interface chiffrées (titres/labels des
   * catégories sensibles du quiz — voir DEVELOPER.md § Sécurité).
   * Même mécanisme que JSON_PATH : enveloppe chiffrée en prod (générée par
   * Prepare_data/encrypt_performers_data.py --in strings_source.json),
   * objet JSON en clair accepté en dev local (auto-détecté par loadUIStrings()).
   */
  STRINGS_PATH: "./strings.json",

  /**
   * Mode mock — intercepte tous les appels réseau externes (AUTH_URL,
   * SCORE_URL, ipify) et retourne des données fictives sans aucune
   * requête réelle. Mettre à false avant de déployer.
   *
   * En mode mock, l'identifiant "Admin#000000" simule une connexion admin.
   * Tout autre identifiant simule une connexion utilisateur standard.
   */
  MOCK_MODE: false,

  // ─── Quiz de la Galerie ─────────────────────────────────────────
  /** Nombre de questions par partie. */
  QUIZ_ROUNDS: 5,

  /** Points par niveau de risque. */
  QUIZ_POINTS: { duo: 1, carre: 3, cash: 5 },

  /** Seuil de similarité (0–1) pour valider une réponse CASH. */
  CASH_SIMILARITY_THRESHOLD: 0.70,

  /**
   * Seuil de similarité (0–1) pour valider une réponse "Saisie" du mini-jeu
   * Questions (questions.js) — plus tolérant que CASH_SIMILARITY_THRESHOLD
   * car les réponses attendues sont souvent des noms courts, où chaque
   * lettre pèse plus lourd dans le ratio (ex: "Apolline" vs "appoline").
   */
  QUESTIONS_SIMILARITY_THRESHOLD: 0.70,

  /**
   * Force du biais de tirage par score (performer.score, 0–100) sur l'ordre
   * des questions d'une partie de quiz. La 1ère question favorise les
   * performers les mieux classés (score élevé) au sein du pool éligible à
   * la catégorie, la dernière favorise les moins bien classés, avec un
   * dégradé progressif entre les deux (tirage neutre au milieu). Le
   * classement est relatif au pool de la partie (percentile), pas à un
   * seuil de score absolu — s'adapte à chaque catégorie (Heta/Digamma ont
   * des pools plus restreints que le Quiz principal).
   *
   * 0    = tirage uniforme (comportement identique à un shuffle() classique).
   * ~2-3 = biais léger, encore beaucoup de variation.
   * ~4-5 = biais marqué ("presque toujours" le mieux classé en 1ère question).
   * Au-delà de ~8, devient quasi déterministe (perd l'intérêt du tirage aléatoire).
   */
  QUIZ_SCORE_BIAS_STRENGTH: 8,

  // ─── Séquence Mémo ──────────────────────────────────────────────

  /**
   * Délai (ms) entre chaque retournement de tuile.
   * Augmenter pour faciliter, diminuer pour rendre plus difficile.
   */
  MEMO_FLIP_INTERVAL: 900,

  /**
   * Configuration des manches : count = nb de tuiles, cols/rows = grille.
   * La taille des tuiles est calculée une seule fois pour tenir dans la
   * grille la plus grande (max cols × max rows), et reste constante.
   */
  MEMO_ROUNDS: [
    { count: 2, cols: 2, rows: 1 },
    { count: 4, cols: 2, rows: 2 },
    { count: 6, cols: 2, rows: 3 },
    { count: 8, cols: 2, rows: 4 },
    { count: 9, cols: 3, rows: 3 },
  ],

  /**
   * Pool de tuiles — doit contenir au moins autant d'éléments que la
   * manche la plus longue (9 pour les valeurs par défaut).
   *
   * Ajouter imgUrl pour afficher une image à la place de l'emoji.
   * Laisser imgUrl vide ("") ou absent pour utiliser l'emoji.
   *
   * Exemple avec image :
   *   { id: "star", label: "ÉTOILE", emoji: "⭐",
   *     bg: "from-yellow-400 to-amber-400",
   *     imgUrl: "https://example.com/star.jpg" }
   */
  MEMO_TILES: [
    { id: "fire",      label: "FEU",      emoji: "🔥", bg: "from-red-500 to-orange-400",    imgUrl: "" },
    { id: "duck",      label: "CANARD",   emoji: "🦆", bg: "from-sky-500 to-cyan-400",      imgUrl: "" },
    { id: "star",      label: "ÉTOILE",   emoji: "⭐", bg: "from-yellow-400 to-amber-400",  imgUrl: "" },
    { id: "rocket",    label: "FUSÉE",    emoji: "🚀", bg: "from-purple-600 to-indigo-500", imgUrl: "" },
    { id: "diamond",   label: "DIAMANT",  emoji: "💎", bg: "from-blue-400 to-cyan-400",     imgUrl: "" },
    { id: "skull",     label: "CRÂNE",    emoji: "💀", bg: "from-gray-700 to-gray-500",     imgUrl: "" },
    { id: "beer",      label: "BIÈRE",    emoji: "🍺", bg: "from-amber-600 to-yellow-400",  imgUrl: "" },
    { id: "crown",     label: "COURONNE", emoji: "👑", bg: "from-yellow-300 to-orange-400", imgUrl: "" },
    { id: "lightning", label: "ÉCLAIR",   emoji: "⚡", bg: "from-yellow-300 to-yellow-500", imgUrl: "" },
    { id: "bomb",      label: "BOMBE",    emoji: "💣", bg: "from-zinc-700 to-zinc-500",     imgUrl: "" },
  ],

  // ─── Authentification & configuration API ───────────────────────
  /**
   * URL de l'API d'authentification + configuration (un seul Apps Script,
   * routé via le champ `action` : login / getConfigs / setconfig / adduser / deleteuser).
   *
   * POST action=login    (FormData: identifiers)
   *   → { status:"ok", decryptionToken, scope?:"admin", adminToken?, evg_name? }
   * GET  action=getConfigs&token=&evg_name=  (evg_name omis pour l'admin → allConfigs)
   *   → { status:"ok", configs:{...} } ou { status:"ok", allConfigs:{...} }
   * POST action=setconfig  (FormData: token, evg_name, config, value) — admin uniquement
   * POST action=adduser    (FormData: token, evg_name) — admin uniquement
   * POST action=deleteuser (FormData: token, evg_name) — admin uniquement
   */
  AUTH_URL: "https://script.google.com/macros/s/AKfycbxiDlMXSzeA3LGgWcwXXUFS1234OPactVIeeoHv8f5Ngs0ia0IeM-sK5yCv4jgNPBEz/exec",

  /**
   * URL de l'API d'enregistrement des scores.
   * Attend un POST JSON avec le token en query param :
   *   POST ?token=<uuid>
   *   Corps : { "evg_name", "prenom", "score", "type_jeu", "ip" }
   *
   * Chiffrée (scores.html requiert désormais une authentification comme le
   * reste du site — voir DEVELOPER.md § Sécurité). Générée par
   * Prepare_data/encrypt_config_value.py, déchiffrée en mémoire par
   * getScoreUrl() (script.js) via le decryptionToken de la session.
   *
   * En dev local : décommenter SCORE_URL (URL en clair) ci-dessous —
   * getScoreUrl() l'utilise directement sans passer par SCORE_URL_ENC.
   */
  // SCORE_URL: "https://script.google.com/macros/s/.../exec",
  SCORE_URL_ENC: {"v": 1, "salt": "olSpnX44s677zQqUuMLarQ==", "iv": "qe80HLzKfZUhpUqz", "data": "yMMCVOHpci8+hsc4OC7qTwHEA4CZX1S4TLfLeADlSSPqwFJVVEosCfKLqiVS2nmAB+74eaZmnVaheAez8zs3AaaHWH4WuBRNIRjAPvckq+Rqwpc1erXY6pQS5PSrvkMVgj3kzDwE5lHiMfJZl/nlYXjyFK6DcpMCyRrHuQvVSDE="},

  /**
   * URL de l'API de récupération des images personnalisées (Séquence Mémo).
   * POST FormData { action: "getImages", token, evgName }
   *   → { success: true, images: [{ name, url, mimeType, parentFolder }, ...] }
   *
   * Chiffrée (voir DEVELOPER.md § Sécurité), déchiffrée en mémoire par
   * getImagesUrl() (script.js) via le decryptionToken de la session.
   *
   * En dev local : décommenter IMAGES_URL (URL en clair) ci-dessous —
   * getImagesUrl() l'utilise directement sans passer par IMAGES_URL_ENC.
   */
  // IMAGES_URL: "https://script.google.com/macros/s/.../exec",
  IMAGES_URL_ENC: {"v": 1, "salt": "N5JcImNzm/3u4tYYC1km/g==", "iv": "cS7c2qfUw4g1FUc3", "data": "CvR1D0pAo+Qwlv01nfIUCbM96EVszhxnE6ZMIaAP7DGy7M1NaXHcDJ7yx1rxVuXdE2Ftwp0z3GypnEjcH6U74hXVQNsF/FnhpXw3Qm9U/VUw8KktBJVQ+a3aVb1Zr0P67OseGe9xWqrn0U2x7n//lyS0xSYq+ByQMQvMslzUqew="},

  /**
   * URL du GAS externe du mini-jeu "Questions" (questions.html) — répond en
   * GET, sans paramètre, avec le tableau de questions en clair :
   *   GET QUESTIONS_URL
   *     → [{ id, question, type: "QCM"|"Saisie"|"Nombre", reponse_correcte, options: [], commentaire? }, ...]
   *   - QCM    : options = choix proposés, reponse_correcte = un des choix,
   *              ou plusieurs choix valides séparés par une virgule (ex: "1, 2, 3").
   *   - Saisie : options = [], reponse_correcte = chaîne attendue (comparée
   *              avec tolérance, voir isSimilarEnough()/QUESTIONS_SIMILARITY_THRESHOLD).
   *   - Nombre : options = [min, max], reponse_correcte = valeur numérique exacte.
   *   - commentaire (optionnel) : texte affiché sous le verdict après validation
   *     (quelle que soit la réponse), voir validateCurrent() dans questions.js.
   *
   * Chiffrée (voir DEVELOPER.md § Sécurité), déchiffrée en mémoire par
   * getQuestionsUrl() (script.js) via le decryptionToken de la session.
   *
   * En dev local : décommenter QUESTIONS_URL (URL en clair) ci-dessous —
   * getQuestionsUrl() l'utilise directement sans passer par QUESTIONS_URL_ENC.
   */
  // QUESTIONS_URL: "https://script.google.com/macros/s/.../exec",
  QUESTIONS_URL_ENC: {"v": 1, "salt": "TmmbSkWDV9irFuG4yX138A==", "iv": "QthkTJo896AGAelW", "data": "iYVI0lPtTnI5MNNKGZscwR2tq9YzipsTEDN/HDt++B3OWepmyNO2JuXccamj1iBxXwZnd5O/BQjE1TfLXRj22TYEohKfQZGKYfWGBvFNaFoOq8Ex6MtuiObRj/B0NqYwZJPcyR93jKxhdQa4fDWdzPdzQGCKPoBhI2BnvJ9Yx/I="},

  // ─── localStorage keys ──────────────────────────────────────────
  LS_HOST:             "evg_host",          // prénom extrait de l'identifiant (avant le #)
  LS_DECRYPTION_TOKEN: "decryption_key",    // token commun à tous les utilisateurs connectés (auth + déchiffrement)
  LS_ADMIN_TOKEN:      "evg_admin_token",   // token d'écriture — présent uniquement pour l'admin
  LS_EVG_NAME:         "evg_name",          // nom exact renvoyé par le Sheet — présent uniquement pour les non-admins
  LS_SCOPE:            "evg_scope",         // présent uniquement pour les admins
  LS_IP:               "evg_ip",            // IP du client, récupérée à la connexion
  LS_LAST_PLAYER:      "evg_last_player",   // dernier joueur ayant enregistré un score
  LS_CONFIGS_CACHE:    "evg_configs_cache", // cache des configs (JSON) — évite un getConfigs() par page
  LS_UI_STRINGS_CACHE: "evg_ui_strings_cache", // cache des chaînes d'interface déchiffrées (JSON)
  LS_ADMIN_ACTIVE_EVG: "evg_admin_active_evg", // EVG choisi par l'admin via le menu déroulant (voir getEvgHost())
};
