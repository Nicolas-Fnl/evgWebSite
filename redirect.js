// Redirection automatique .html → URL propre
// Ce script doit être chargé en PREMIER dans le <head>
// pour éviter le chargement inutile de ressources.

(function () {
  const pathname = window.location.pathname;

  // Rediriger /index.html ou /index → /  (racine du site)
  if (pathname.endsWith('/index.html') || pathname.endsWith('/index')) {
    window.location.replace(
      pathname.replace(/\/index(\.html)?$/, '/') +
      window.location.search +
      window.location.hash
    );
    return;
  }

  // Rediriger toute URL qui se termine par .html → sans extension
  if (pathname.endsWith('.html')) {
    window.location.replace(
      pathname.replace(/\.html$/, '') +
      window.location.search +
      window.location.hash
    );
  }
})();
