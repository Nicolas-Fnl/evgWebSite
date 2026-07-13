/**
 * quiz.js — Logique du mini-jeu "Quiz de la Galerie"
 *
 * Dépendances (à charger avant ce fichier) :
 *   - config.js
 *   - script.js
 */

// ── Vibration ────────────────────────────────────────────────────
function _vibrate(pattern) {
  navigator.vibrate && navigator.vibrate(pattern);
}

// ── Catégories du quiz "identification" ──────────────────────────
// Chacune réutilise le même déroulé (duo/carré/cash), seule la source
// d'image et le sous-ensemble de performers éligibles changent.
// Les labels de certaines catégories sont vides ici et remplis par
// applyUIStrings() une fois les chaînes déchiffrées (voir DEVELOPER.md
// § Sécurité) — ne pas les coder en dur en clair.
// Note : `scoreType` est le contrat réseau envoyé au GAS de scores et
// tenu par le schéma externe (Sheet "Scores") — voir DEVELOPER.md, ne
// pas renommer indépendamment des clés du Sheet.
const QUIZ_CATEGORIES = {
  quiz:    { label: 'Quiz de la Galerie', emoji: '🖼️', imageField: 'imageUrlPortrait', scoreType: 'quiz-galerie' },
  heta:    { label: '',                   emoji: '🔥', imageField: 'imageUrlHeta',     scoreType: 'heta-quiz' },
  digamma: { label: '',                   emoji: '💦', imageField: 'imageUrlDigamma',  scoreType: 'quiz-digamma' },
};

// Chaînes d'interface déchiffrées (voir applyUIStrings) — utilisées aussi
// par les verdicts du mini-jeu bonus, en repli si pas encore chargées.
let uiStrings = {};

// ── État de la partie ────────────────────────────────────────────

let performerData    = null;   // Cache JSON (chargé une seule fois par session)
let currentGameType  = 'quiz'; // 'quiz' | 'heta' | 'digamma' | 'special'
let pendingCategory  = 'quiz'; // catégorie choisie sur section-menu, avant section-quiz-intro

// Quiz
let quizQuestions    = [];
let quizCurrentIdx   = 0;
let quizScore        = 0;
let quizCurrentRisk  = null;   // 'duo' | 'carre' | 'cash'
let quizCorrectName  = "";
let currentImageField = 'imageUrlPortrait';

// Mini-jeu bonus (nom de catégorie volontairement générique dans le code)
let specialPool     = [];
let specialUsed     = new Set();
let specialStreak   = 0;
let specialCurrent  = null;


// ── Chaînes d'interface (catégories sensibles) ────────────────────

/**
 * Applique les chaînes d'interface déchiffrées (voir getUIStrings/
 * loadUIStrings, script.js) aux éléments du DOM et à QUIZ_CATEGORIES.
 * Appelé une fois au chargement de la page (voir <script> en bas de
 * quiz.html), avant que l'utilisateur ne puisse voir le menu.
 * @param {Object} strings
 */
function applyUIStrings(strings) {
  uiStrings = strings || {};

  QUIZ_CATEGORIES.heta.label    = uiStrings['menu-heta-title']    || QUIZ_CATEGORIES.heta.label;
  QUIZ_CATEGORIES.digamma.label = uiStrings['menu-digamma-title'] || QUIZ_CATEGORIES.digamma.label;

  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el && uiStrings[key]) el.textContent = uiStrings[key];
  };

  setText('menu-heta-title',            'menu-heta-title');
  setText('menu-heta-subtitle',         'menu-heta-subtitle');
  setText('menu-digamma-title',         'menu-digamma-title');
  setText('menu-digamma-subtitle',      'menu-digamma-subtitle');
  setText('menu-special-title',         'menu-special-title');
  setText('menu-special-subtitle',      'menu-special-subtitle');
  setText('special-intro-title',        'special-intro-title');
  setText('special-intro-subtitle',     'special-intro-subtitle');
  setText('special-rule-yes-label',     'special-rule-yes-label');
  setText('special-rule-yes-desc',      'special-rule-yes-desc');
  setText('special-game-title',         'special-game-title');
  setText('sp-game-title',              'special-game-title');
  setText('special-answer-yes-label',   'special-answer-yes-label');
}


// ── Démarrage ────────────────────────────────────────────────────

async function ensureData() {
  if (performerData) return true;
  try {
    performerData = await loadPerformersData();
    return true;
  } catch (err) {
    console.error(err);
    alert("Impossible de charger le fichier de données.");
    return false;
  }
}

/**
 * Prépare l'écran d'intro pour une catégorie (quiz / heta / digamma) et
 * l'affiche. Le démarrage effectif se fait via startQuiz() au clic
 * sur "C'EST PARTI !".
 * @param {string} category - clé de QUIZ_CATEGORIES
 */
function prepareIntro(category) {
  const cat = QUIZ_CATEGORIES[category];
  if (!cat) return;
  pendingCategory = category;
  document.getElementById('quiz-intro-emoji').textContent = cat.emoji;
  document.getElementById('quiz-intro-title').textContent = cat.label;
  showSection('section-quiz-intro');
}

async function startQuiz() {
  if (!performerData) {
    setLoading(true);
    const ok = await ensureData();
    setLoading(false);
    if (!ok) return;
  }

  const cat = QUIZ_CATEGORIES[pendingCategory];
  const pool = performerData.filter((p) => p[cat.imageField]);

  if (pool.length === 0) {
    alert(`Aucune photo disponible pour la catégorie "${cat.label}".`);
    showSection('section-menu');
    return;
  }

  currentGameType    = pendingCategory;
  currentImageField  = cat.imageField;
  quizQuestions      = shuffle(pool).slice(0, Math.min(CONFIG.QUIZ_ROUNDS, pool.length));
  quizCurrentIdx     = 0;
  quizScore          = 0;

  // Précharge les images des questions en arrière-plan
  preloadImages(quizQuestions.map((q) => q[currentImageField]));

  showSection("section-question");
  loadQuestion(0);
}

function setLoading(isLoading) {
  const btn = document.getElementById("start-btn");
  const msg = document.getElementById("loading-msg");
  btn.disabled = isLoading;
  msg.classList.toggle("hidden", !isLoading);
}


// ── Affichage d'une question ─────────────────────────────────────

function loadQuestion(idx) {
  const q         = quizQuestions[idx];
  quizCorrectName = q.name;
  quizCurrentRisk = null;

  // Progression
  document.getElementById("quiz-progress").textContent      = `Question ${idx + 1}/${quizQuestions.length}`;
  document.getElementById("quiz-score-display").textContent = quizScore;
  document.getElementById("quiz-progress-bar").style.width  = `${(idx / quizQuestions.length) * 100}%`;

  // Image
  const img    = document.getElementById("quiz-image");
  const loader = document.getElementById("quiz-image-loader");
  img.style.opacity    = "0";
  loader.style.display = "flex";
  loader.innerHTML     = '<span class="animate-spin text-2xl">⏳</span>';
  img.onload  = () => { loader.style.display = "none"; img.style.opacity = "1"; };
  img.onerror = () => { loader.innerHTML = "⚠ Image indisponible"; };
  img.src = q[currentImageField];

  // Interface de réponse
  document.getElementById("quiz-risk-selector").classList.remove("invisible");
  document.getElementById("quiz-answer-area").classList.add("hidden");
  document.getElementById("quiz-feedback").classList.add("hidden");
}


// ── Sélection du niveau de risque ───────────────────────────────

function selectRisk(mode) {
  quizCurrentRisk = mode;

  document.getElementById("quiz-risk-selector").classList.add("invisible");
  document.getElementById("quiz-answer-area").classList.remove("hidden");

  const buttonsEl = document.getElementById("quiz-buttons");
  const cashEl    = document.getElementById("quiz-cash-area");

  if (mode === "cash") {
    buttonsEl.classList.add("hidden");
    cashEl.classList.remove("hidden");
    document.getElementById("cash-input").value = "";
    setTimeout(() => document.getElementById("cash-input").focus(), 80);
  } else {
    cashEl.classList.add("hidden");
    buttonsEl.classList.remove("hidden");

    const count     = mode === "duo" ? 2 : 4;
    const fakeNames = pickRandom(
      performerData.map((p) => p.name),
      count - 1,
      [quizCorrectName]
    );
    const options = shuffle([quizCorrectName, ...fakeNames]);

    buttonsEl.innerHTML = "";
    buttonsEl.className = "grid grid-cols-2 gap-3";

    options.forEach((name) => {
      const btn = document.createElement("button");
      btn.textContent = name;
      btn.className = [
        "bg-gray-800 hover:bg-gray-700 border border-gray-700",
        "rounded-xl py-4 px-2 font-semibold text-sm",
        "transition-all active:scale-95 text-center leading-tight",
      ].join(" ");
      btn.addEventListener("click", () => submitChoice(name));
      buttonsEl.appendChild(btn);
    });
  }
}


// ── Validation des réponses ──────────────────────────────────────

function submitChoice(chosen) {
  const correct = chosen === quizCorrectName;
  const pts     = correct ? CONFIG.QUIZ_POINTS[quizCurrentRisk] : 0;
  revealAnswer(correct, pts);
}

function submitCash() {
  const val = document.getElementById("cash-input").value;
  if (!val.trim()) return;
  const correct = isSimilarEnough(val, quizCorrectName);
  revealAnswer(correct, correct ? CONFIG.QUIZ_POINTS.cash : 0);
}

function revealAnswer(correct, pts) {
  quizScore += pts;

  if (correct) {
    if      (quizCurrentRisk === 'duo')   _vibrate(20);
    else if (quizCurrentRisk === 'carre') _vibrate([25, 10, 25]);
    else if (quizCurrentRisk === 'cash')  _vibrate([35, 15, 35, 15, 60]);
  }

  document.getElementById("quiz-score-display").textContent = quizScore;

  document.getElementById("qf-icon").textContent    = correct ? "✅" : "❌";
  document.getElementById("qf-verdict").textContent = correct ? "BONNE RÉPONSE !" : "RATÉ !";
  document.getElementById("qf-name").textContent    = `C'était : ${quizCorrectName}`;
  document.getElementById("qf-points").textContent  =
    pts > 0 ? `+${pts} point${pts > 1 ? "s" : ""} 🎉` : "0 point 😬";

  document.getElementById("quiz-feedback").classList.remove("hidden");
}

function nextQuestion() {
  document.getElementById("quiz-feedback").classList.add("hidden");
  quizCurrentIdx++;
  if (quizCurrentIdx >= quizQuestions.length) {
    showResult();
  } else {
    loadQuestion(quizCurrentIdx);
  }
}


// ── Résultat ────────────────────────────────────────────────────

function showResult() {
  const maxScore = quizQuestions.length * CONFIG.QUIZ_POINTS.cash;

  document.getElementById("quiz-progress-bar").style.width = "100%";
  document.getElementById("qr-score").textContent          = quizScore;
  document.getElementById("qr-max").textContent            = `/${maxScore} pts`;
  document.getElementById("qr-score-label").textContent    = "Score final";
  document.getElementById("qr-title").textContent          = "Partie terminée !";

  const ratio = quizScore / maxScore;
  document.getElementById("qr-emoji").textContent =
    ratio >= 0.8 ? "🏆" : ratio >= 0.5 ? "🥈" : ratio >= 0.3 ? "🥉" : "😅";

  _prepareResultForm();
  showSection("section-result");
}

function _prepareResultForm() {
  document.getElementById("qr-save-name").value = getLastPlayer();
  document.getElementById("qr-save-status").classList.add("hidden");
  _updateResultButtonsState();
}

/**
 * Active/désactive les boutons "Nouvelle partie" et "Retour aux jeux"
 * selon qu'un prénom a été saisi — c'est ce qui force l'enregistrement
 * avant de pouvoir continuer.
 */
function _updateResultButtonsState() {
  const hasName = document.getElementById("qr-save-name").value.trim().length > 0;
  document.getElementById("qr-newgame-btn").disabled = !hasName;
  document.getElementById("qr-back-btn").disabled    = !hasName;
}

function _onResultNameInput() {
  _updateResultButtonsState();
}

/**
 * Enregistre le score courant (quiz ou bonus) avec le prénom saisi.
 * Fire-and-forget — ne bloque jamais la navigation qui suit.
 */
function _saveCurrentResult() {
  const name = document.getElementById("qr-save-name").value.trim();
  if (!name) return;

  const score    = currentGameType === 'special' ? specialStreak : quizScore;
  const gameType = currentGameType === 'special'
    ? 'beta-streak'
    : (QUIZ_CATEGORIES[currentGameType] || QUIZ_CATEGORIES.quiz).scoreType;
  saveScore(name, score, gameType);
}

/**
 * Enregistre le score puis redémarre directement sur la page de
 * présentation du mode qui vient d'être joué.
 */
function saveAndRestartQuiz() {
  _saveCurrentResult();
  if (currentGameType === 'special') {
    showSection('section-special-intro');
  } else {
    prepareIntro(currentGameType);
  }
}

/**
 * Enregistre le score puis revient au menu des jeux.
 */
function saveAndGoToMenu() {
  _saveCurrentResult();
  showSection('section-menu');
}


// ── Navigation entre sections ────────────────────────────────────

function showSection(id) {
  document.querySelectorAll(".game-section").forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}


// ── Mini-jeu bonus (identifiants de code volontairement génériques) ──

async function startSpecialGame() {
  if (!performerData) {
    const ok = await ensureData();
    if (!ok) return;
  }

  currentGameType = 'special';
  specialPool = performerData.filter(p => p.imageUrlPortrait || p.imageUrlUpsilon);
  specialUsed.clear();
  specialStreak = 0;

  showSection('section-special');
  loadSpecialQuestion();
}

function loadSpecialQuestion() {
  let available = specialPool.filter(p => !specialUsed.has(p.id || p.name));
  if (available.length === 0) {
    specialUsed.clear();
    available = specialPool.slice();
  }

  specialCurrent = available[Math.floor(Math.random() * available.length)];
  specialUsed.add(specialCurrent.id || specialCurrent.name);

  document.getElementById('special-streak-display').textContent = specialStreak;
  document.getElementById('special-buttons').classList.remove('invisible');
  document.getElementById('special-feedback').classList.add('hidden');

  const imgEl  = document.getElementById('special-image');
  const loader = document.getElementById('special-loader');
  imgEl.style.opacity   = '0';
  loader.style.display  = 'flex';
  loader.innerHTML      = '<span class="animate-spin text-3xl">⏳</span>';
  imgEl.onload  = () => { loader.style.display = 'none'; imgEl.style.opacity = '1'; };
  imgEl.onerror = () => { loader.innerHTML = '⚠'; };
  imgEl.src = specialCurrent.imageUrlPortrait || specialCurrent.imageUrlUpsilon;
}

function submitSpecialAnswer(saidYes) {
  const isYes    = !!(specialCurrent.imageUrlBeta);
  const correct  = saidYes === isYes;
  const hasImage = isYes && !!specialCurrent.imageUrlBeta;

  document.getElementById('special-buttons').classList.add('invisible');

  const withImageEl = document.getElementById('sp-with-image');
  const noImageEl   = document.getElementById('sp-no-image');

  if (hasImage) {
    // ── Layout "image" : même structure que la page de question ──
    withImageEl.classList.remove('hidden');
    noImageEl.classList.add('hidden');

    document.getElementById('sp-reveal-img').src = specialCurrent.imageUrlBeta;

    if (correct) {
      specialStreak++;
      _vibrate(20);
      document.getElementById('sp-streak-line').innerHTML =
        `Série : <span class="text-green-400 font-black">${specialStreak} ↑</span>`;
      document.getElementById('sp-verdict-img').textContent = uiStrings['special-verdict-correct-withimg'] || '';
      document.getElementById('sp-name-img').textContent    = specialCurrent.name;
      document.getElementById('sp-action-img').textContent  = 'SUIVANT →';
      document.getElementById('sp-action-img').onclick      = loadSpecialQuestion;
    } else {
      _vibrate([100, 50, 100]);
      document.getElementById('sp-streak-line').innerHTML =
        `<span class="text-red-400 font-black">Fin de série : ${specialStreak}</span>`;
      document.getElementById('sp-verdict-img').textContent = uiStrings['special-verdict-wrong-withimg'] || '';
      document.getElementById('sp-name-img').textContent    = specialCurrent.name;
      document.getElementById('sp-action-img').textContent  = 'VOIR MON SCORE →';
      document.getElementById('sp-action-img').onclick      = showSpecialResult;
    }
  } else {
    // ── Layout centré : pas d'image à révéler ──
    withImageEl.classList.add('hidden');
    noImageEl.classList.remove('hidden');

    if (correct) {
      specialStreak++;
      _vibrate(20);
      document.getElementById('sp-icon').textContent         = '🤍';
      document.getElementById('sp-verdict').textContent      = 'PAS ENCORE !';
      document.getElementById('sp-name').textContent         = specialCurrent.name;
      document.getElementById('sp-streak-label').textContent = `Série : ${specialStreak} ✅`;
      document.getElementById('sp-action-btn').textContent   = 'SUIVANT →';
      document.getElementById('sp-action-btn').onclick       = loadSpecialQuestion;
    } else {
      _vibrate([100, 50, 100]);
      document.getElementById('sp-icon').textContent         = '❌';
      document.getElementById('sp-verdict').textContent      = 'NON, PAS ENCORE !';
      document.getElementById('sp-name').textContent         = specialCurrent.name;
      document.getElementById('sp-streak-label').textContent = `Fin de série : ${specialStreak}`;
      document.getElementById('sp-action-btn').textContent   = 'VOIR MON SCORE →';
      document.getElementById('sp-action-btn').onclick       = showSpecialResult;
    }
  }

  document.getElementById('special-feedback').classList.remove('hidden');
}

function showSpecialResult() {
  document.getElementById('qr-score').textContent       = specialStreak;
  document.getElementById('qr-max').textContent         = 'réponses correctes d\'affilée';
  document.getElementById('qr-score-label').textContent = 'Meilleure série';
  document.getElementById('qr-title').textContent       = 'Partie terminée !';

  document.getElementById('qr-emoji').textContent =
    specialStreak >= 15 ? '🏆' : specialStreak >= 8 ? '🖤' : specialStreak >= 4 ? '🥈' : '😅';

  _prepareResultForm();
  showSection('section-result');
}
