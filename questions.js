/**
 * questions.js — Mini-jeu "Questions" (API GAS externe, hors auth EVG)
 *
 * Dépendances (à charger avant ce fichier) :
 *   - config.js
 *   - script.js (getQuestionsUrl, isSimilarEnough, escapeHtml, _vibrate)
 *
 * Déroulé : une question à la fois, avec une phase de validation entre
 * chaque question (comme le Quiz de la Galerie) — pas de score envoyé au
 * backend, ce mini-jeu n'a pas de classement.
 */

let questionsData  = [];   // tableau brut renvoyé par l'API
let currentIdx      = 0;
let currentAnswer   = undefined;
let currentValidated = false;
let correctCount     = 0;

document.addEventListener('DOMContentLoaded', () => {
  loadQuestions();
});

// ── Chargement ────────────────────────────────────────────────────

async function loadQuestions() {
  showState('loading');
  try {
    const baseUrl = await getQuestionsUrl();
    // URL() valide/normalise la chaîne et échappe correctement evg_name via
    // searchParams (plutôt qu'une concaténation de chaîne à la main).
    const apiUrl = new URL(String(baseUrl));
    apiUrl.searchParams.set('evg_name', getEvgHost() || '');

    // mode: 'cors' explicite — l'API répond avec Access-Control-Allow-Origin: *,
    // aucun header/credentials spécial n'est nécessaire pour cette requête.
    const res = await fetch(apiUrl.toString(), { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error(`Réponse HTTP ${res.status}`);

    const data = await res.json();
    if (data && !Array.isArray(data) && data.error) throw new Error(data.error);
    if (!Array.isArray(data) || data.length === 0) throw new Error('Format de réponse inattendu (tableau non vide attendu).');

    questionsData = data;
    currentIdx    = 0;
    correctCount  = 0;

    showState('question');
    loadCurrentQuestion();
  } catch (err) {
    console.error('[QUESTIONS] Erreur de chargement :', err);
    document.getElementById('error-message').textContent =
      'Impossible de charger les questions. Vérifie ta connexion et réessaie.';
    showState('error');
  }
}

function showState(state) {
  document.getElementById('state-loading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('state-error').classList.toggle('hidden', state !== 'error');
  document.getElementById('state-question').classList.toggle('hidden', state !== 'question');
  document.getElementById('state-summary').classList.toggle('hidden', state !== 'summary');
}

// ── Affichage d'une question ─────────────────────────────────────

function loadCurrentQuestion() {
  currentAnswer    = undefined;
  currentValidated = false;

  const q     = questionsData[currentIdx];
  const total = questionsData.length;

  document.getElementById('progress-label').textContent = `Question ${currentIdx + 1}/${total}`;
  document.getElementById('progress-bar').style.width   = `${(currentIdx / total) * 100}%`;

  document.getElementById('question-text').textContent = q.question;
  document.getElementById('question-body').innerHTML   = renderQuestionBody(q);

  // Réinitialise la carte et le feedback (classes d'animation + couleurs
  // de la question précédente) avant d'afficher la nouvelle question.
  const card = document.getElementById('question-card');
  card.className = 'bg-white/5 rounded-2xl p-5 flex-1 flex flex-col border-2 border-transparent';

  const feedback = document.getElementById('question-feedback');
  feedback.className = 'hidden mt-4 items-center gap-3 p-3 rounded-xl';

  const comment = document.getElementById('feedback-comment');
  comment.className = 'hidden mt-2 text-base text-gray-200 bg-white/5 rounded-xl p-3';
  comment.textContent = '';

  const nextBtn = document.getElementById('next-btn');
  nextBtn.classList.add('hidden');
  nextBtn.classList.remove('fade-up');

  document.getElementById('validate-btn').classList.remove('hidden');
  document.getElementById('validate-btn').disabled = false;

  wireQuestionInputs(q);
}

function renderQuestionBody(q) {
  if (q.type === 'QCM') {
    const options = Array.isArray(q.options) ? q.options : [];
    // 2 ou 4+ options : côte à côte (2 colonnes). 3 options (ou 1, cas
    // limite) : empilées en 1 colonne — 2 colonnes avec 3 boutons laisse
    // le dernier orphelin sur une ligne à moitié vide.
    const gridClass = options.length === 2 || options.length >= 4 ? 'grid-cols-2' : 'grid-cols-1';
    return `
      <div class="grid ${gridClass} gap-2">
        ${options.map((opt) => `
          <button type="button" data-qcm-option data-value="${escapeHtml(String(opt))}"
            class="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl py-3 px-2
                   font-semibold text-sm transition-all active:scale-95 text-center leading-tight">
            ${escapeHtml(String(opt))}
          </button>`).join('')}
      </div>`;
  }

  if (q.type === 'Saisie') {
    return `
      <input id="answer-current" type="text" placeholder="Ta réponse…"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        class="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3
               text-white text-base focus:outline-none focus:ring-2 focus:ring-yellow-400" />`;
  }

  if (q.type === 'Nombre') {
    // options[] est censé être [min, max] mais peut arriver en chaînes
    // ("5"/"42", converties correctement par Number()) ou en libellés non
    // numériques (ex: ["Nul", "Excellent"]). Dans ce dernier cas (ou si une
    // valeur manque / min >= max), le curseur retombe sur une échelle 0-10,
    // mais les libellés d'origine (options[0]/options[1]) restent affichés
    // aux extrémités — l'échelle 0-10 est un détail d'implémentation.
    const rawMin = q.options?.[0];
    const rawMax = q.options?.[1];
    let min = Number(rawMin);
    let max = Number(rawMax);
    let labelMin = rawMin;
    let labelMax = rawMax;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      min = 0;
      max = 10;
      if (labelMin === undefined || labelMin === null || labelMin === '') labelMin = min;
      if (labelMax === undefined || labelMax === null || labelMax === '') labelMax = max;
    }
    const mid = Math.round((min + max) / 2);
    return `
      <div>
        <p id="value-current" class="text-center text-3xl font-black text-yellow-400 mb-2">${mid}</p>
        <input id="answer-current" type="range" min="${min}" max="${max}" step="1" value="${mid}"
               class="w-full h-2 rounded-full accent-yellow-400 cursor-pointer" />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>${escapeHtml(String(labelMin))}</span>
          <span>${escapeHtml(String(labelMax))}</span>
        </div>
      </div>`;
  }

  return `<p class="text-gray-500 text-xs italic">Type de question non supporté ("${escapeHtml(String(q.type))}").</p>`;
}

function wireQuestionInputs(q) {
  if (q.type === 'QCM') {
    document.querySelectorAll('[data-qcm-option]').forEach((btn) => {
      btn.addEventListener('click', () => selectQcmOption(btn));
    });
  } else if (q.type === 'Saisie') {
    const input = document.getElementById('answer-current');
    input.addEventListener('input', () => { currentAnswer = input.value; });
  } else if (q.type === 'Nombre') {
    const slider  = document.getElementById('answer-current');
    const display = document.getElementById('value-current');
    const update  = () => {
      display.textContent = slider.value;
      currentAnswer = Number(slider.value);
    };
    slider.addEventListener('input', update);
    update(); // valeur initiale (milieu du curseur) déjà comptée comme réponse
  }
}

function selectQcmOption(btn) {
  document.querySelectorAll('[data-qcm-option]').forEach((b) => {
    b.classList.remove('bg-yellow-400', 'text-gray-900', 'border-yellow-400');
    b.classList.add('bg-gray-800', 'border-gray-700');
  });
  btn.classList.remove('bg-gray-800', 'border-gray-700');
  btn.classList.add('bg-yellow-400', 'text-gray-900', 'border-yellow-400');
  currentAnswer = btn.dataset.value;
}

// ── Validation d'une question ────────────────────────────────────

function validateCurrent() {
  if (currentValidated) return;
  currentValidated = true;

  const q         = questionsData[currentIdx];
  const isCorrect = checkAnswer(q, currentAnswer);
  if (isCorrect) correctCount++;

  // Vibration courte pour une bonne réponse, triple buzz pour une erreur —
  // même convention que revealAnswer() dans quiz.js.
  _vibrate(isCorrect ? 20 : [100, 50, 100]);

  // Halo coloré + léger shake sur la carte (voir style.css § Feedback).
  const card = document.getElementById('question-card');
  card.classList.remove('border-transparent');
  card.classList.add(
    isCorrect ? 'border-green-500/50' : 'border-red-500/50',
    isCorrect ? 'anim-flash-correct' : 'anim-flash-wrong'
  );

  // Icône + texte de verdict, avec une petite animation de rebond.
  const feedback = document.getElementById('question-feedback');
  const icon     = document.getElementById('feedback-icon');
  const text     = document.getElementById('feedback-text');

  feedback.classList.remove('hidden');
  feedback.classList.add('flex', isCorrect ? 'bg-green-500/10' : 'bg-red-500/10');
  icon.classList.add('anim-pop-in');
  icon.textContent = isCorrect ? '✅' : '❌';
  text.className   = `text-lg font-black ${isCorrect ? 'text-green-400' : 'text-red-400'}`;
  text.textContent = isCorrect ? 'Bonne réponse !' : 'Raté';

  // Commentaire optionnel de la question (champ "commentaire" côté API),
  // affiché sous le verdict — quel que soit le résultat.
  if (q.commentaire) {
    const comment = document.getElementById('feedback-comment');
    comment.textContent = `Sa réponse : ${q.commentaire}`;
    comment.classList.remove('hidden');
  }

  // Verrouille les contrôles de la question une fois validée.
  document.querySelectorAll('#question-body [data-qcm-option], #question-body input')
    .forEach((el) => { el.disabled = true; });

  document.getElementById('validate-btn').classList.add('hidden');
  const nextBtn = document.getElementById('next-btn');
  nextBtn.classList.remove('hidden');
  nextBtn.classList.add('fade-up');
  nextBtn.textContent = currentIdx + 1 >= questionsData.length ? 'Voir mon résultat →' : 'Suivant →';
}

function nextQuestion() {
  currentIdx++;
  if (currentIdx >= questionsData.length) {
    showSummary();
  } else {
    loadCurrentQuestion();
  }
}

function showSummary() {
  document.getElementById('progress-bar').style.width = '100%';

  const total = questionsData.length;
  const ratio = total > 0 ? correctCount / total : 0;
  const emoji = ratio >= 0.8 ? '🏆' : ratio >= 0.5 ? '🥈' : ratio >= 0.3 ? '🥉' : '😅';

  const emojiEl = document.getElementById('summary-emoji');
  emojiEl.className = 'text-6xl flash-in';
  emojiEl.textContent = emoji;

  const scoreEl = document.getElementById('summary-score');
  scoreEl.className = 'text-2xl font-black text-yellow-400 fade-up';
  scoreEl.textContent = `${correctCount} / ${total} bonnes réponses`;

  showState('summary');
}

/**
 * @param {{type:string, reponse_correcte:*}} q
 * @param {*} given - réponse de l'utilisateur pour cette question
 * @returns {boolean}
 */
function checkAnswer(q, given) {
  if (given === undefined || given === null || given === '') return false;

  if (q.type === 'QCM') {
    // reponse_correcte peut lister plusieurs options valides séparées par
    // une virgule (ex: "1, 2, 3") — bonne réponse si l'une d'elles correspond.
    const validAnswers = String(q.reponse_correcte).split(',').map((s) => s.trim());
    return validAnswers.includes(String(given).trim());
  }
  if (q.type === 'Saisie') {
    // Tolérance aux fautes de frappe (distance de Levenshtein), seuil
    // dédié CONFIG.QUESTIONS_SIMILARITY_THRESHOLD (plus souple que le
    // mode CASH du Quiz).
    return isSimilarEnough(String(given), String(q.reponse_correcte), CONFIG.QUESTIONS_SIMILARITY_THRESHOLD);
  }
  if (q.type === 'Nombre') {
    return Number(given) === Number(q.reponse_correcte);
  }
  return false;
}
