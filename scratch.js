/**
 * scratch.js — Mini-jeu "Ticket Gagnant"
 *
 * Chaque participant gratte une tuile pour découvrir s'il est piégé.
 * Toutes les tuiles ont la même surface argentée — impossible de deviner
 * avant de voir l'emoji bière apparaître sous le grattage.
 *
 * Dépendances (à charger avant ce fichier) :
 *   - config.js
 *   - script.js  (shuffle)
 */

// ── Constantes ───────────────────────────────────────────────────
const REVEAL_THRESHOLD = 0.62;   // part du canvas à gratter pour déclencher la révélation
const BRUSH_BASE       = 10;     // rayon de base du grattoir (px CSS)
const BRUSH_STEP       = 6;      // pas d'interpolation (px) — < BRUSH_BASE pour trait continu
const CHECK_EVERY      = 8;      // vérifier le seuil toutes les N opérations
const PARTICLE_EVERY   = 18;     // spawner des particules tous les N px parcourus

// ── Vibration ────────────────────────────────────────────────────
function _vibrate(pattern) {
  navigator.vibrate && navigator.vibrate(pattern);
}

// Throttle pour la micro-vibration de grattage.
let _lastScratchVibrate = 0;
function _vibrateScratch() {
  const now = Date.now();
  if (now - _lastScratchVibrate < 80) return;
  _lastScratchVibrate = now;
  _vibrate(6);
}

// ── État ─────────────────────────────────────────────────────────
let scratchCount  = 5;
let scratchTraps  = 1;


// ══════════════════════════════════════════════════════════════════
//  COMPTEURS DE CONFIGURATION
// ══════════════════════════════════════════════════════════════════

function adjust(field, delta) {
  if (field === 'count') {
    scratchCount = Math.max(2, Math.min(20, scratchCount + delta));
    document.getElementById('count-display').textContent = scratchCount;
    // S'assurer que le nombre de piégés reste valide
    scratchTraps = Math.min(scratchTraps, scratchCount - 1);
    document.getElementById('traps-display').textContent = scratchTraps;
  } else {
    scratchTraps = Math.max(1, Math.min(scratchCount - 1, scratchTraps + delta));
    document.getElementById('traps-display').textContent = scratchTraps;
  }
  document.getElementById('setup-error').classList.add('hidden');
}


// ══════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════════════════════════════════

function startScratch() {
  const errorEl = document.getElementById('setup-error');

  if (scratchTraps >= scratchCount) {
    errorEl.textContent = 'Le nombre de piégés doit être inférieur au nombre de participants.';
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  document.getElementById('game-end-buttons').classList.add('hidden');
  _buildGrid(scratchCount, scratchTraps);
  showSection('section-game');
}


// ══════════════════════════════════════════════════════════════════
//  CONSTRUCTION DE LA GRILLE
// ══════════════════════════════════════════════════════════════════

function _buildGrid(n, traps) {
  const container = document.getElementById('scratch-grid');
  container.innerHTML = '';

  // Colonnes selon effectif
  const cols     = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const gap      = 10;
  const availW   = Math.min(420, window.innerWidth - 32);
  const tileSize = Math.max(90, Math.floor((availW - gap * (cols - 1)) / cols));

  // Flexbox + justify-content:center → la dernière ligne incomplète est centrée
  const grid = document.createElement('div');
  grid.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: ${gap}px;
    max-width: ${cols * tileSize + (cols - 1) * gap}px;
    margin: 0 auto;
    padding-bottom: 8px;
  `;

  // Suivi de fin de partie
  let touchedCount = 0;
  let trapsFound   = 0;

  function _checkEnd() {
    if (touchedCount === n || trapsFound === traps) {
      document.getElementById('game-end-buttons').classList.remove('hidden');
    }
  }

  function onFirstTouch() { touchedCount++; _checkEnd(); }
  function onTrapRevealed() { trapsFound++;  _checkEnd(); }

  // Placement aléatoire des pièges
  const assignments = Array(n).fill(false);
  shuffle(Array.from({ length: n }, (_, i) => i))
    .slice(0, traps)
    .forEach(i => { assignments[i] = true; });

  assignments.forEach(isTrapped => {
    grid.appendChild(_createTile(tileSize, isTrapped, onFirstTouch, isTrapped ? onTrapRevealed : null));
  });

  container.appendChild(grid);
}


// ══════════════════════════════════════════════════════════════════
//  CRÉATION D'UNE TUILE
// ══════════════════════════════════════════════════════════════════

function _createTile(size, isTrapped, onFirstTouch, onTrapRevealed) {
  // Wrapper (clip du canvas aux coins arrondis)
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size}px;
    border-radius: 14px;
    overflow: hidden;
    flex-shrink: 0;
  `;

  // ── Contenu révélé (sous le canvas) ──────────────────────────
  const content = document.createElement('div');
  // Fond identique pour toutes les tuiles (bleu) — seul le piégé a l'emoji 🍺
  content.style.cssText = `
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    border-radius: 14px;
    background: linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%);
  `;

  const emojiSize = size < 100 ? '2.2rem' : '2.8rem';
  // Tuile piégée : 🍺 visible. Tuile libre : fond bleu vide — aucun texte.
  content.innerHTML = isTrapped
    ? `<span style="font-size:${emojiSize};line-height:1;pointer-events:none">🍺</span>`
    : '';

  // ── Canvas de grattage (par-dessus) ───────────────────────────
  const dpr    = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.cssText = `
    position: absolute; inset: 0;
    width: ${size}px; height: ${size}px;
    border-radius: 14px;
    cursor: crosshair;
    touch-action: none;
  `;

  // willReadFrequently : getImageData() est appelé à chaque mouvement de
  // grattage (_scratchedRatio) pour calculer le % révélé — évite le warning
  // Chrome et accélère les lectures répétées (bascule le canvas en backend logiciel).
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(dpr, dpr);
  _drawSurface(ctx, size);
  _attachEvents(canvas, ctx, size, dpr, onFirstTouch, onTrapRevealed);

  wrapper.appendChild(content);
  wrapper.appendChild(canvas);
  return wrapper;
}


// ══════════════════════════════════════════════════════════════════
//  SURFACE ARGENTÉE À GRATTER
// ══════════════════════════════════════════════════════════════════

function _drawSurface(ctx, size) {
  // Dégradé base argentée
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0,    '#a8b2c0');
  grad.addColorStop(0.3,  '#d4dae4');
  grad.addColorStop(0.55, '#bcc4d0');
  grad.addColorStop(0.8,  '#cdd4de');
  grad.addColorStop(1,    '#8e97a6');
  ctx.fillStyle = grad;
  _roundRectPath(ctx, 0, 0, size, size, 14);
  ctx.fill();

  // Reflets diagonaux (imite le métal brossé)
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#ffffff';
  const step = 11;
  for (let x = -size; x < size * 2; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size * 0.28, size);
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();

  // Vignette sombre sur les bords (donne du relief)
  const vignette = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.25,
    size / 2, size / 2, size * 0.72
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vignette;
  _roundRectPath(ctx, 0, 0, size, size, 14);
  ctx.fill();

  // Watermark "GRATTEZ" répété
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle   = '#1e293b';
  const fs = Math.max(8, Math.floor(size / 6.5));
  ctx.font         = `900 ${fs}px system-ui, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    ctx.fillText('GRATTEZ', size / 2, (size / rows) * r + size / rows / 2);
  }
  ctx.restore();
}

// Polyfill ctx.roundRect (non supporté sur certains navigateurs)
function _roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,     y,     x + r, y,          r);
    ctx.closePath();
  }
}


// ══════════════════════════════════════════════════════════════════
//  BROSSE DE GRATTAGE (rendu volontairement irrégulier)
// ══════════════════════════════════════════════════════════════════

function _scratchAt(ctx, x, y) {
  ctx.globalCompositeOperation = 'destination-out';

  // Dégradé radial : noyau dur (100 % effacé) + bord progressif (anti-aliasing naturel)
  const r    = BRUSH_BASE * (0.88 + Math.random() * 0.24);
  const grad = ctx.createRadialGradient(x, y, r * 0.35, x, y, r);
  grad.addColorStop(0,    'rgba(0,0,0,1)'); // centre : effacé à fond
  grad.addColorStop(0.72, 'rgba(0,0,0,1)'); // noyau dur jusqu'à 72 % du rayon
  grad.addColorStop(1,    'rgba(0,0,0,0)'); // bord doux

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
}


// ══════════════════════════════════════════════════════════════════
//  ÉVÉNEMENTS SOURIS + TACTILE
// ══════════════════════════════════════════════════════════════════

function _attachEvents(canvas, ctx, size, dpr, onFirstTouch, onTrapRevealed) {
  let active        = false;
  let opCount       = 0;
  let revealed      = false;
  let lastX         = null;
  let lastY         = null;
  let distAccum     = 0;     // distance cumulée pour le spawn de particules
  let hasTouched    = false; // première interaction sur cette tuile
  let trapNotified  = false; // onTrapRevealed déjà appelé

  function cssPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // Interpole entre la dernière position et la courante pour un trait continu
  function doScratch(x, y) {
    if (revealed) return;

    if (!hasTouched) {
      hasTouched = true;
      if (onFirstTouch) onFirstTouch();
    }

    if (lastX === null) {
      // Premier point : gratter directement
      _scratchAt(ctx, x, y);
      opCount++;
    } else {
      const dx   = x - lastX;
      const dy   = y - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(dist / BRUSH_STEP));

      for (let i = 1; i <= steps; i++) {
        const t  = i / steps;
        const sx = lastX + dx * t;
        const sy = lastY + dy * t;
        _scratchAt(ctx, sx, sy);
        opCount++;
      }

      // Particules selon la distance parcourue
      distAccum += dist;
      if (distAccum >= PARTICLE_EVERY) {
        distAccum = 0;
        _spawnParticles(canvas, x, y);
        _vibrateScratch();
      }
    }

    lastX = x;
    lastY = y;

    if (opCount % CHECK_EVERY === 0) {
      // Boutons dès que le centre (zone emoji) est visible à 90 %
      if (!trapNotified && onTrapRevealed && _emojiVisibleRatio(canvas, size) >= 0.9) {
        trapNotified = true;
        _vibrate(1200); // piège découvert — vibration longue
        onTrapRevealed();
      }
      // Révélation complète une fois le seuil global atteint
      if (!revealed && _scratchedRatio(canvas) >= REVEAL_THRESHOLD) {
        revealed = true;
        _revealFull(canvas, ctx, size);
      }
    }
  }

  function resetStroke() {
    active    = false;
    lastX     = null;
    lastY     = null;
    distAccum = 0;
  }

  // ── Souris ────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    active = true;
    lastX = lastY = null;
    const p = cssPos(e.clientX, e.clientY);
    doScratch(p.x, p.y);
  });
  canvas.addEventListener('mousemove', e => {
    if (!active) return;
    const p = cssPos(e.clientX, e.clientY);
    doScratch(p.x, p.y);
  });
  canvas.addEventListener('mouseup', resetStroke);
  // Sortie de la tuile : on coupe le trait (pas de saut) mais on garde active=true
  // → quand la souris revient sur la tuile, le grattage reprend immédiatement
  canvas.addEventListener('mouseleave', () => { lastX = null; lastY = null; distAccum = 0; });

  // ── Tactile ───────────────────────────────────────────────────
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    active = true;
    lastX = lastY = null;
    const t = e.touches[0];
    const p = cssPos(t.clientX, t.clientY);
    doScratch(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!active) return;
    const t = e.touches[0];
    const p = cssPos(t.clientX, t.clientY);
    doScratch(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchend',   resetStroke);
  canvas.addEventListener('touchcancel', resetStroke);
}


// ══════════════════════════════════════════════════════════════════
//  PARTICULES 3D (copeaux qui s'envolent)
// ══════════════════════════════════════════════════════════════════

/**
 * Spawne 2-4 copeaux argentés depuis la position de grattage.
 * Utilise Web Animations API + perspective 3D.
 */
function _spawnParticles(canvas, cssX, cssY) {
  const rect  = canvas.getBoundingClientRect();
  const vx    = rect.left + cssX;  // position viewport
  const vy    = rect.top  + cssY;

  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    _spawnParticle(vx, vy);
  }
}

function _spawnParticle(vx, vy) {
  const el = document.createElement('div');

  // Forme du copeau : petit rectangle fin
  const w = 3 + Math.random() * 4;
  const h = 2 + Math.random() * 2;

  // Couleur argent avec légère variation
  const light = 175 + Math.floor(Math.random() * 70);
  const color = `rgb(${light}, ${light + 4}, ${light + 8})`;

  el.style.cssText = `
    position: fixed;
    left: ${vx - w / 2}px;
    top:  ${vy - h / 2}px;
    width:  ${w}px;
    height: ${h}px;
    background: ${color};
    border-radius: 1px;
    pointer-events: none;
    z-index: 9999;
    will-change: transform, opacity;
  `;
  document.body.appendChild(el);

  // Trajectoire aléatoire avec biais vers le haut
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
  const speed = 25 + Math.random() * 45;
  const dx    = Math.cos(angle) * speed;
  const dy    = Math.sin(angle) * speed;
  const dz    = 10 + Math.random() * 40;        // sortie vers l'avant (Z)
  const rz    = (Math.random() - 0.5) * 900;    // rotation Z
  const rx    = (Math.random() - 0.5) * 540;    // rotation X (bascule 3D)

  const duration = 350 + Math.random() * 300;

  el.animate(
    [
      {
        opacity:   1,
        transform: `perspective(180px) translate3d(0px, 0px, 0px) rotateZ(0deg) rotateX(0deg)`,
      },
      {
        opacity:   0,
        transform: `perspective(180px) translate3d(${dx}px, ${dy}px, ${dz}px) rotateZ(${rz}deg) rotateX(${rx}deg)`,
      },
    ],
    { duration, easing: 'ease-out', fill: 'forwards' }
  ).onfinish = () => el.remove();
}


// ══════════════════════════════════════════════════════════════════
//  DÉTECTION DU SEUIL ET RÉVÉLATION COMPLÈTE
// ══════════════════════════════════════════════════════════════════

/**
 * Ratio de pixels transparents dans la zone centrale de la tuile (là où l'emoji est affiché).
 * Permet de détecter la visibilité de l'emoji indépendamment du grattage global.
 */
function _emojiVisibleRatio(canvas, size) {
  const dpr        = canvas.width / size;
  const regionSize = size * 0.45;           // zone centrale = 45 % de la tuile
  const x  = Math.round((size / 2 - regionSize / 2) * dpr);
  const y  = Math.round((size / 2 - regionSize / 2) * dpr);
  const w  = Math.round(regionSize * dpr);
  const h  = Math.round(regionSize * dpr);
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 64) transparent++;
  }
  return transparent / (data.length / 4);
}

function _scratchedRatio(canvas) {
  const ctx  = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let transparent = 0;
  // Échantillonnage : 1 pixel sur 8 pour la performance
  for (let i = 3; i < data.length; i += 4 * 8) {
    if (data[i] < 64) transparent++;
  }
  return transparent / (data.length / (4 * 8));
}

function _revealFull(canvas, ctx, size) {
  canvas.style.pointerEvents = 'none';
  let frame = 0;

  function step() {
    // destination-out + fillRect efface progressivement les pixels restants
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
    frame++;
    if (frame < 10) {
      requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, size, size);
    }
  }

  requestAnimationFrame(step);
}


// ══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════

function showSection(id) {
  document.querySelectorAll('.game-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
