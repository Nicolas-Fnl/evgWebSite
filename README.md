# EVGWebSite

Application web de mini-jeux pour **EVG** (Enterrement de Vie de Garçon).
Déployée sur **GitHub Pages** — aucun serveur, uniquement des fichiers statiques.

---

## Comment jouer

1. Rendez-vous sur le site et connectez-vous avec l'identifiant qui vous a été communiqué.
2. Depuis l'accueil, accédez aux mini-jeux disponibles pour votre groupe.
3. Consultez le classement à tout moment pour suivre les scores de tous les participants.

## Mini-jeux

### 🖼️ Quiz de la Galerie

Identifiez des performers sur photo. Trois niveaux de risque au choix avant chaque question — plus le niveau est élevé, plus la question rapporte de points, mais plus la marge d'erreur est faible.

### 🧠 Séquence Mémo

Jeu de mémoire en 5 manches progressives : mémorisez une séquence de tuiles qui se retournent puis récitez-la le plus vite possible.

### 🎰 Ticket Gagnant

Jeu de grattage sans score, pour désigner rapidement qui paie la prochaine tournée.

### 🧐 Questions

Répondez à une série de questions sur le marié, une à la fois — choix multiple, saisie libre ou curseur selon la question. Pas de classement pour ce mini-jeu.

### Galerie

Parcourez la galerie des performers avec tri et filtres.

---

## Fonctionnement général

Le site est 100 % statique. L'authentification et les scores passent par un service externe léger ; il n'y a ni compte ni mot de passe stocké dans votre navigateur au-delà de la session en cours.

Le contenu de la galerie n'est accessible qu'après connexion : il est chiffré côté client à l'aide d'une clé dérivée du jeton de session, et n'est déchiffré en mémoire que pour un utilisateur authentifié.

---

## Développement

La documentation technique (architecture, déploiement, configuration) est maintenue séparément, hors du dépôt public.
