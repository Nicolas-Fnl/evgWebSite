/**
 * flash.js — Séquence Mémo
 *
 * Règle : les tuiles apparaissent face cachée, puis se retournent une à une
 * de gauche à droite. Quand tout est retourné le chrono démarre. Le joueur
 * récite la séquence à voix haute puis tape "J'AI DIT !" pour stopper.
 * Le temps s'additionne sur 5 manches (2 → 4 → 6 → 8 → 9 tuiles).
 *
 * Dépendances (à charger avant ce fichier) :
 *   - config.js
 *   - script.js  (shuffle, preloadImages, saveScore, getLastPlayer, showSection)
 */

// ── État de la partie ─────────────────────────────────────────────
let mRound      = 0;       // index de manche courant (0-based)
let mTotalMs    = 0;       // temps cumulé en ms
let mRoundMs    = [];      // temps de chaque manche [ms]
let mGridTiles  = [];      // tuile à chaque case de la grille
let mFlipOrder  = [];      // indices de cases dans l'ordre de retournement
let mTimerStart = null;    // Date.now() au début de la phase chrono
let mTimerRaf   = null;    // handle requestAnimationFrame du chrono
let mFlipTimers = [];      // handles setTimeout des retournements
let mPhase      = 'idle';  // 'flipping' | 'timing' | 'idle'
let mTileSize   = 80;      // taille px des tuiles, calculée une fois par partie


// ── Utilitaires ──────────────────────────────────────────────────

function formatMs(ms) {
  return (ms / 1000).toFixed(2) + ' s';
}

function formatMsTotal(ms) {
  if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0');
  return `${m}:${s} min`;
}

function _rc(r) {
  return CONFIG.MEMO_ROUNDS[r]; // { count, cols, rows }
}


// ── Démarrage avec préchargement des images ───────────────────────

// Nombre de tuiles du pool qui utilisent une image personnalisée —
// tout le pool : uniquement des images, plus aucun emoji par défaut.
const CUSTOM_TILE_COUNT = CONFIG.MEMO_TILES.length;

/**
 * Télécharge une image distante et la ré-expose comme URL locale (blob:).
 *
 * Les liens de partage classiques Google Drive (drive.google.com/uc?...)
 * répondent avec `Cross-Origin-Resource-Policy: same-site` et bloquent tout
 * accès cross-origin (fetch ou <img>). L'API Drive v3 (`googleapis.com/drive/v3/
 * files/{id}?alt=media`), elle, accepte les requêtes cross-origin authentifiées
 * par un token OAuth (`Authorization: Bearer`) et répond avec un
 * `Access-Control-Allow-Origin` reflétant l'origine appelante — d'où le
 * passage de `oauthToken` ici. Le token est de courte durée (~1h, fourni par
 * getImages à chaque appel), on ne le met donc jamais en cache.
 *
 * @param {string} remoteUrl
 * @param {string} [oauthToken] - Bearer token renvoyé par getImages (res.oauthToken)
 * @returns {Promise<string>} URL locale (blob:) utilisable comme <img src>
 */
async function _downloadImageAsObjectUrl(remoteUrl, oauthToken) {
  const headers = oauthToken ? { 'Authorization': `Bearer ${oauthToken}` } : {};
  const res = await fetch(remoteUrl, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${remoteUrl}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Récupère les images personnalisées de l'EVG (getImages), les télécharge
 * réellement (voir _downloadImageAsObjectUrl) et les affecte à toutes les
 * tuiles de CONFIG.MEMO_TILES (CUSTOM_TILE_COUNT = pool entier) — le jeu
 * n'utilise alors plus que des images, plus aucun emoji.
 * S'il y a moins d'images que de tuiles à remplir, les images
 * disponibles sont répétées pour compléter (ex: 1 seule image → toutes
 * les tuiles utilisent cette même image).
 * Échoue silencieusement (garde les emojis par défaut) si l'appel échoue.
 */
// Passe à true dès que les images perso sont chargées avec succès — évite
// de retélécharger à chaque retour sur section-intro (bouton "Nouvelle partie").
let _customImagesLoaded = false;

async function _loadCustomTileImages() {
  if (_customImagesLoaded) return;

  // En minuscules : l'API attend un nom de dossier Drive (ex: "william"),
  // alors que getEvgHost() renvoie le prénom tel que saisi (ex: "William").
  const evgName = (getEvgHost() || '').toLowerCase();
  if (!evgName) {
    console.warn('[FLASH] getEvgHost() vide — impossible de récupérer les images personnalisées.');
    return;
  }

  try {
    console.log(`[FLASH] Récupération des images personnalisées pour evgName="${evgName}"…`);
    const res = await fetchCustomImages(evgName);
    // Ne jamais logger `res` tel quel : il contient oauthToken (Bearer, sensible).
    console.log('[FLASH] Réponse getImages : success=', res && res.success, '| images=', res && res.images);

    if (!res || !res.success || !Array.isArray(res.images) || res.images.length === 0) {
      console.warn('[FLASH] Aucune image personnalisée utilisable dans la réponse — emojis conservés.');
      return;
    }

    const remoteUrls = res.images.map((img) => img.url).filter(Boolean);
    if (remoteUrls.length === 0) {
      console.warn('[FLASH] images[] présent mais aucune URL exploitable — emojis conservés.');
      return;
    }

    // Sélectionne au hasard jusqu'à CUSTOM_TILE_COUNT images distinctes parmi
    // celles disponibles — on ne télécharge QUE celles-ci, pas la liste
    // entière (qui peut contenir bien plus d'images que ce dont le jeu a besoin).
    const picked = shuffle(remoteUrls).slice(0, Math.min(CUSTOM_TILE_COUNT, remoteUrls.length));
    console.log(`[FLASH] ${picked.length}/${remoteUrls.length} image(s) sélectionnée(s) au hasard pour le téléchargement.`);

    const localUrls = [];
    for (const remoteUrl of picked) {
      try {
        localUrls.push(await _downloadImageAsObjectUrl(remoteUrl, res.oauthToken));
      } catch (err) {
        console.warn('[FLASH] Téléchargement échoué pour', remoteUrl, err);
      }
    }
    if (localUrls.length === 0) {
      console.warn('[FLASH] Aucune image téléchargeable — emojis conservés.');
      return;
    }

    for (let i = 0; i < CUSTOM_TILE_COUNT; i++) {
      CONFIG.MEMO_TILES[i].imgUrl = localUrls[i % localUrls.length];
    }
    _customImagesLoaded = true;
    console.log(`[FLASH] ${CUSTOM_TILE_COUNT} tuiles configurées avec ${localUrls.length} image(s) téléchargée(s) localement.`);
  } catch (err) {
    console.warn('[FLASH] Images personnalisées indisponibles :', err);
  }
}

/**
 * Appelé par le bouton GO de l'intro.
 * Récupère les images personnalisées puis précharge les imgUrl avant de
 * lancer la partie.
 */
async function initAndStart() {
  const btn = document.getElementById('intro-btn');
  btn.disabled    = true;
  btn.textContent = 'Chargement… ⏳';

  await _loadCustomTileImages();

  const imgUrls = CONFIG.MEMO_TILES.map(t => t.imgUrl).filter(Boolean);
  if (imgUrls.length > 0) {
    await preloadImages(imgUrls);
  }

  btn.disabled    = false;
  btn.textContent = 'GO ! 🧠';

  startFlashGame();
}

/**
 * (Re)démarre une partie complète.
 * Appelé aussi par le bouton REJOUER — les images sont déjà en cache.
 */
function startFlashGame() {
  mRound    = 0;
  mTotalMs  = 0;
  mRoundMs  = [];
  mTileSize = _computeTileSize();
  startRound();
}


// ── Calcul de la taille des tuiles ────────────────────────────────

/**
 * Calcule la taille (px) qui permet à la plus grande grille de tenir
 * à l'écran. Cette valeur est utilisée pour TOUTES les manches afin
 * que les tuiles gardent la même taille tout au long de la partie.
 */
function _computeTileSize() {
  const gap = 8;

  // Plus grande grille parmi toutes les manches
  const maxCols = Math.max(...CONFIG.MEMO_ROUNDS.map(r => r.cols));
  const maxRows = Math.max(...CONFIG.MEMO_ROUNDS.map(r => r.rows));

  // Espace vertical disponible : on retire header + status + timer + bouton + marges
  const reservedH = 56   // header
                  + 28   // statut
                  + 68   // chrono (text-5xl)
                  + 76   // bouton
                  + 120; // paddings, gaps entre sections

  const availH = window.innerHeight - reservedH;
  const availW = Math.min(384, window.innerWidth - 32); // max-w-sm + px-4×2

  const byW = Math.floor((availW - gap * (maxCols - 1)) / maxCols);
  const byH = Math.floor((availH - gap * (maxRows - 1)) / maxRows);
  return Math.min(byW, byH, 140); // 140 px max
}


// ── Logique d'une manche ──────────────────────────────────────────

/**
 * Sélectionne n tuiles pour la manche : les tuiles à image personnalisée
 * sont incluses en priorité (jusqu'à n), le reste est complété avec des
 * tuiles emoji au hasard.
 * @param {number} n
 * @returns {Array}
 */
function _pickRoundTiles(n) {
  const photoTiles = CONFIG.MEMO_TILES.filter((t) => t.imgUrl);
  const emojiTiles = CONFIG.MEMO_TILES.filter((t) => !t.imgUrl);

  const guaranteed = shuffle(photoTiles).slice(0, Math.min(photoTiles.length, n));
  const filler     = shuffle(emojiTiles).slice(0, n - guaranteed.length);

  return shuffle([...guaranteed, ...filler]);
}

function startRound() {
  mPhase = 'flipping';
  _clearAllTimers();
  cancelAnimationFrame(mTimerRaf);

  const { count: n } = _rc(mRound);

  // Tirer n tuiles distinctes, retournement gauche→droite. Les tuiles à
  // image personnalisée (imgUrl) sont garanties dans le tirage (dans la
  // limite de n) — sinon, avec seulement CUSTOM_TILE_COUNT tuiles photo
  // sur les 10 du pool, un tirage purement aléatoire peut très bien ne
  // jamais les inclure sur une manche courte (ex: 2 tuiles sur 10).
  mGridTiles = _pickRoundTiles(n);
  mFlipOrder = Array.from({ length: n }, (_, i) => i);

  _updateRoundLabel();
  _setStatus('Observe !');
  _setTimerDisplay('0.00 s');
  _setBtnEnabled(false);
  _buildGrid(mRound);
  showSection('section-game');

  // Planifier les retournements
  const iv = CONFIG.MEMO_FLIP_INTERVAL;
  for (let i = 0; i < n; i++) {
    const slot = mFlipOrder[i];
    mFlipTimers.push(setTimeout(() => _flipTile(slot), iv * (i + 1)));
  }
  // Démarrer le chrono 500 ms après le dernier retournement
  mFlipTimers.push(setTimeout(_beginTiming, iv * n + 500));
}

function _buildGrid(roundIdx) {
  const { count: n, cols, rows } = _rc(roundIdx);
  const container = document.getElementById('memo-grid');
  container.innerHTML = '';

  const gap  = 8;
  const size = mTileSize;

  container.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
  container.style.gridTemplateRows    = `repeat(${rows}, ${size}px)`;
  container.style.gap                 = `${gap}px`;
  container.style.width               = 'fit-content';
  container.style.margin              = '0 auto';

  const small = size < 72; // police réduite pour les petites tuiles

  for (let i = 0; i < n; i++) {
    const tile = mGridTiles[i];
    const useImg = Boolean(tile.imgUrl);

    // Contenu de la face recto (révélée)
    const backContent = useImg
      ? `<img src="${tile.imgUrl}"
              class="absolute inset-0 w-full h-full object-cover rounded-xl pointer-events-none"
              alt="${tile.label}">`
      : `<span class="pointer-events-none ${small ? 'text-lg' : 'text-3xl'}">${tile.emoji}</span>
         <span class="pointer-events-none font-black leading-none mt-0.5
                      ${small ? 'text-[9px]' : 'text-xs'}">${tile.label}</span>`;

    const el = document.createElement('div');
    el.id        = `tile-${i}`;
    el.className = 'memo-tile rounded-xl';
    el.style.width  = `${size}px`;
    el.style.height = `${size}px`;
    el.innerHTML = `
      <div class="memo-tile-inner rounded-xl">
        <div class="memo-tile-face bg-white/10 border border-white/20 rounded-xl">
          <span class="${small ? 'text-lg' : 'text-3xl'} opacity-40">?</span>
        </div>
        <div class="memo-tile-back bg-gradient-to-br ${tile.bg} rounded-xl overflow-hidden">
          ${backContent}
        </div>
      </div>
    `;
    container.appendChild(el);
  }
}

function _flipTile(slotIndex) {
  document.getElementById(`tile-${slotIndex}`)?.classList.add('is-flipped');
}

function _beginTiming() {
  mPhase      = 'timing';
  mTimerStart = Date.now();
  _setStatus("Dis-les dans l'ordre !");
  _setBtnEnabled(true);
  _tickTimer();
}

function _tickTimer() {
  if (mPhase !== 'timing') return;
  _setTimerDisplay(formatMs(Date.now() - mTimerStart));
  mTimerRaf = requestAnimationFrame(_tickTimer);
}


// ── Joueur stoppe le chrono ───────────────────────────────────────

function memoStop() {
  if (mPhase !== 'timing') return;

  cancelAnimationFrame(mTimerRaf);
  const elapsed = Date.now() - mTimerStart;
  mPhase = 'idle';

  mRoundMs.push(elapsed);
  mTotalMs += elapsed;
  _setBtnEnabled(false);

  const isLast = mRound + 1 >= CONFIG.MEMO_ROUNDS.length;
  setTimeout(isLast ? _endGame : () => _showInterRound(elapsed), 250);
}

// Barre espace = même action que le bouton "J'AI DIT !" pendant le chrono, ou
// que "Manche suivante →" sur l'écran inter-manche — ne préventDefault (et
// n'agit) que dans ces deux cas précis, pour ne jamais bloquer une saisie
// clavier normale (ex: espace dans le champ pseudo du résultat).
document.addEventListener('keydown', (e) => {
  if (!(e.code === 'Space' || e.key === ' ')) return;

  if (mPhase === 'timing') {
    e.preventDefault();
    memoStop();
    return;
  }

  const interSection = document.getElementById('section-inter');
  if (interSection && !interSection.classList.contains('hidden')) {
    e.preventDefault();
    nextRound();
  }
});

function _showInterRound(ms) {
  document.getElementById('inter-round-label').textContent =
    `Manche ${mRound + 1} terminée !`;
  document.getElementById('inter-time').textContent  = formatMs(ms);
  document.getElementById('inter-total').textContent = formatMsTotal(mTotalMs);
  showSection('section-inter');
}

function nextRound() {
  mRound++;
  startRound();
}


// ── Fin de partie ─────────────────────────────────────────────────

function _endGame() {
  showSection('section-result');

  document.getElementById('result-total').textContent = formatMsTotal(mTotalMs);

  document.getElementById('result-breakdown').innerHTML =
    mRoundMs.map((ms, i) => {
      const { count } = _rc(i);
      return `
        <div class="flex justify-between items-center py-1
                    border-b border-white/10 last:border-0">
          <span class="text-gray-400 text-sm">Manche ${i + 1} — ${count} tuiles</span>
          <span class="font-bold text-white text-sm">${formatMs(ms)}</span>
        </div>`;
    }).join('');

  // Pré-remplir le champ prénom + réinitialiser les boutons
  document.getElementById('result-save-name').value = getLastPlayer();
  document.getElementById('result-save-status').classList.add('hidden');
  _updateFlashResultButtonsState();
}

/**
 * Active/désactive les boutons "Nouvelle partie" et "Retour aux jeux"
 * selon qu'un pseudo a été saisi — force l'enregistrement avant de
 * pouvoir continuer.
 */
function _updateFlashResultButtonsState() {
  const hasName = document.getElementById('result-save-name').value.trim().length > 0;
  document.getElementById('result-newgame-btn').disabled = !hasName;
  document.getElementById('result-back-btn').disabled    = !hasName;
}

function _onFlashResultNameInput() {
  _updateFlashResultButtonsState();
}

/**
 * Enregistre le score courant (temps total, en dixièmes de seconde) avec
 * le pseudo saisi. Fire-and-forget — ne bloque jamais la navigation qui suit.
 */
function _saveCurrentFlashResult() {
  const name = document.getElementById('result-save-name').value.trim();
  if (!name) return;
  saveScore(name, Math.round(mTotalMs / 100), 'sequence-memo');
}

/**
 * Enregistre le score puis redémarre directement sur la page de
 * présentation (section-intro) — les images perso déjà téléchargées ne
 * sont pas retéléchargées (voir _loadCustomTileImages).
 */
function saveAndRestartFlash() {
  _saveCurrentFlashResult();
  showSection('section-intro');
}

/**
 * Enregistre le score puis revient au menu des jeux.
 */
function saveAndGoToMenuFlash() {
  _saveCurrentFlashResult();
  window.location.href = './';
}


// ── Abandon (retour en cours de partie) ──────────────────────────

function memoAbort() {
  mPhase = 'idle';
  _clearAllTimers();
  cancelAnimationFrame(mTimerRaf);
}


// ── Helpers UI ────────────────────────────────────────────────────

function _updateRoundLabel() {
  document.getElementById('memo-round-label').textContent =
    `Manche ${mRound + 1} / ${CONFIG.MEMO_ROUNDS.length}`;
}

function _setStatus(text) {
  document.getElementById('memo-status').textContent = text;
}

function _setTimerDisplay(text) {
  document.getElementById('memo-timer').textContent = text;
}

function _setBtnEnabled(enabled) {
  const btn = document.getElementById('memo-btn');
  btn.disabled = !enabled;
  btn.classList.toggle('opacity-40', !enabled);
}

function _clearAllTimers() {
  mFlipTimers.forEach(clearTimeout);
  mFlipTimers = [];
}
