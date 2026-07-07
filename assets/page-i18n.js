// Language init + toggle for standalone secondary pages (changelog, privacy).
// Reuses I18N/t()/applyStaticI18n from assets/i18n.js. Lives in its own file (not
// inline) so it passes the strict CSP: script-src 'self' has no 'unsafe-inline'.
(function () {
  var KEY = "dockecho.landing.lang";
  function pick() {
    var stored = localStorage.getItem(KEY);
    if (I18N[stored]) return stored;
    return detectLang();
  }
  function apply() {
    applyStaticI18n();
    var toggle = document.querySelector("#landLang");
    if (toggle) toggle.textContent = t("switchTo");
  }
  setI18nLang(pick());
  var toggle = document.querySelector("#landLang");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = currentLang() === "zh" ? "en" : "zh";
      setI18nLang(next);
      localStorage.setItem(KEY, next);
      apply();
    });
  }
  apply();
})();
