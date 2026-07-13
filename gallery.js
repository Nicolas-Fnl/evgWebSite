/**
 * gallery.js — Logique de la galerie des performers
 *
 * Dépendances (à charger avant ce fichier) :
 *   - config.js (JSON_PATH)
 *   - script.js (auth + loadPerformersData/decryptPerformersData)
 */

let performers     = [];
let currentSort    = "score";
let currentFilter  = null;

// ── Chargement des données ───────────────────────────────────────

async function loadData() {
  try {
    performers = await loadPerformersData();

    performers.forEach((p) => {
      p.score = parseFloat(p.score) || 0;
    });

    updateStats();
    sortBy("score", document.querySelector(".sort-btn.active"));
  } catch (error) {
    console.error("Erreur chargement :", error);
    document.getElementById("gallery").innerHTML =
      `<p style="color:white;text-align:center;">Erreur : ${error.message}</p>`;
  }
}


// ── Statistiques ─────────────────────────────────────────────────

function updateStats() {
  const total       = performers.length;
  const withHeta    = performers.filter(p => p.imageUrlHeta).length;
  const withDigamma = performers.filter(p => p.imageUrlDigamma).length;
  const withBeta    = performers.filter(p => p.imageUrlBeta).length;
  const withVix     = performers.filter(p => p.imageUrlUpsilon).length;
  document.getElementById("stats").textContent =
    `${total} performers | Heta: ${withHeta} | Digamma: ${withDigamma} | Beta: ${withBeta} | Vixen: ${withVix}`;
}


// ── Tri ──────────────────────────────────────────────────────────

function sortBy(type, button) {
  currentSort = type;

  document.querySelectorAll(".sort-btn").forEach((btn) => btn.classList.remove("active"));
  if (button) button.classList.add("active");

  if (type === "score") {
    performers.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else {
    performers.sort((a, b) =>
      (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
    );
  }

  renderGallery();
}


// ── Rendu des cartes ─────────────────────────────────────────────

function createCard(performer, index) {
  const card = document.createElement("div");
  card.className = "card";

  const FILTER_LABELS = {
    imageUrlHeta: "Heta", imageUrlDigamma: "Digamma", imageUrlBeta: "Beta", imageUrlUpsilon: "Vixen",
  };

  const images = [];
  if (currentFilter) {
    if (performer[currentFilter]) images.push({ url: performer[currentFilter], source: FILTER_LABELS[currentFilter] || currentFilter });
  } else {
    if (performer.imageUrlHeta)       images.push({ url: performer.imageUrlHeta,       source: "Heta" });
    if (performer.imageUrlDigamma)    images.push({ url: performer.imageUrlDigamma,    source: "Digamma" });
    if (performer.imageUrlBeta)       images.push({ url: performer.imageUrlBeta,       source: "Beta" });
    if (performer.imageUrlUpsilon)    images.push({ url: performer.imageUrlUpsilon,    source: "Vixen" });
    if (performer.imageUrlWiki)       images.push({ url: performer.imageUrlWiki,       source: "Wikipedia" });
    if (performer.imageUrlPortrait)   images.push({ url: performer.imageUrlPortrait,   source: "Babepedia" });
    if (performer.imageUrl)           images.push({ url: performer.imageUrl,           source: performer.source || "Source" });
  }

  let carouselHTML;
  if (images.length > 0) {
    const hasMultiple = images.length > 1;
    carouselHTML = `
      <div class="carousel${hasMultiple ? " has-multiple" : ""}" data-index="${index}">
        ${images.map((img, i) => `
          <img src="${escapeHtml(img.url)}"
               alt="${escapeHtml(performer.name)}"
               class="carousel-image${i === 0 ? " active" : ""}"
               onerror="this.style.display='none'">
          <div class="image-badge" style="display:${i === 0 ? "block" : "none"}">${escapeHtml(img.source)}</div>
        `).join("")}
        ${hasMultiple ? `
          <button class="carousel-nav prev" onclick="prevImage(${index})">&#8249;</button>
          <button class="carousel-nav next" onclick="nextImage(${index})">&#8250;</button>
          <div class="carousel-dots">
            ${images.map((_, i) => `
              <div class="carousel-dot${i === 0 ? " active" : ""}"
                   onclick="goToImage(${index}, ${i})"></div>
            `).join("")}
          </div>
        ` : ""}
      </div>`;
  } else {
    carouselHTML = '<div class="no-image">Aucune image disponible</div>';
  }

  const scorePercent = Math.min(100, performer.score);
  const scoreDisplay = performer.score.toFixed(1);

  card.innerHTML = `
    ${carouselHTML}
    <div class="card-content">
      <div class="card-name">${escapeHtml(performer.name)}</div>
      <div class="card-score">
        <span class="score-label">Score :</span>
        <span class="score-value">${scoreDisplay}</span>
      </div>
      <div class="score-bar">
        <div class="score-fill" style="width:${scorePercent}%"></div>
      </div>
    </div>`;

  if (images.length > 0) {
    card.dataset.images       = JSON.stringify(images);
    card.dataset.currentImage = "0";
  }

  return card;
}

function filterBy(field, button) {
  currentFilter = field;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  if (button) button.classList.add("active");
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = "";
  const visible = currentFilter
    ? performers.filter(p => p[currentFilter])
    : performers;
  visible.forEach((performer, index) => {
    try {
      gallery.appendChild(createCard(performer, index));
    } catch (err) {
      console.error("Erreur carte", index, performer.name, err);
    }
  });
}


// ── Navigation carrousel ─────────────────────────────────────────

function nextImage(cardIndex) {
  const card   = document.querySelectorAll(".card")[cardIndex];
  const images = JSON.parse(card.dataset.images);
  const curr   = parseInt(card.dataset.currentImage);
  updateCarousel(card, curr, (curr + 1) % images.length);
}

function prevImage(cardIndex) {
  const card   = document.querySelectorAll(".card")[cardIndex];
  const images = JSON.parse(card.dataset.images);
  const curr   = parseInt(card.dataset.currentImage);
  updateCarousel(card, curr, (curr - 1 + images.length) % images.length);
}

function goToImage(cardIndex, imageIndex) {
  const card = document.querySelectorAll(".card")[cardIndex];
  updateCarousel(card, parseInt(card.dataset.currentImage), imageIndex);
}

function updateCarousel(card, fromIndex, toIndex) {
  const carouselImages = card.querySelectorAll(".carousel-image");
  const badges         = card.querySelectorAll(".image-badge");
  const dots           = card.querySelectorAll(".carousel-dot");

  carouselImages[fromIndex].classList.remove("active");
  carouselImages[toIndex].classList.add("active");
  if (badges[fromIndex]) badges[fromIndex].style.display = "none";
  if (badges[toIndex])   badges[toIndex].style.display   = "block";
  if (dots[fromIndex])   dots[fromIndex].classList.remove("active");
  if (dots[toIndex])     dots[toIndex].classList.add("active");

  card.dataset.currentImage = toIndex;
}

// ── Initialisation ───────────────────────────────────────────────
loadData();
