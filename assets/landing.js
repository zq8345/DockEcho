// Landing page behavior: language, returning-user banner, waitlist form.
// Reuses I18N/t()/applyStaticI18n from assets/i18n.js. No app code loaded here.

const LANDING_LANG_KEY = "dockecho.landing.lang";
const APP_STATE_KEY = "dockecho.local.state.v1";

function landingInitialLang() {
  const stored = localStorage.getItem(LANDING_LANG_KEY);
  if (I18N[stored]) return stored;
  try {
    const appState = JSON.parse(localStorage.getItem(APP_STATE_KEY));
    if (I18N[appState?.lang]) return appState.lang;
  } catch {
    // fall through to browser language
  }
  return detectLang();
}

function landingApply() {
  applyStaticI18n();
  document.querySelector("#landLang").textContent = t("switchTo");
  document.querySelector("#formLang").value = currentLang();
  document.title = t("landPageTitle");
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = t("landPageDescription");
}

setI18nLang(landingInitialLang());

document.querySelector("#landLang").addEventListener("click", () => {
  const next = currentLang() === "zh" ? "en" : "zh";
  setI18nLang(next);
  localStorage.setItem(LANDING_LANG_KEY, next);
  landingApply();
});

// Returning users get a one-click way back — never an auto-redirect.
(async function detectReturningUser() {
  let hasData = false;
  try {
    const appState = JSON.parse(localStorage.getItem(APP_STATE_KEY));
    hasData = Boolean(appState?.notes?.length) || appState?.vaultActive === true;
  } catch {
    hasData = false;
  }
  if (!hasData) {
    try {
      const handle = await vaultProbeHandle();
      hasData = Boolean(handle);
    } catch {
      hasData = false;
    }
  }
  if (hasData) document.querySelector("#returnBanner").classList.remove("hidden");
})();

// Minimal read-only probe of the vault handle store (mirrors assets/vault.js).
function vaultProbeHandle() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const request = indexedDB.open("dockecho.vault.v1");
      request.onupgradeneeded = () => {
        // Store didn't exist before this probe — no saved handle.
        request.transaction?.abort();
        done(null);
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction("handles", "readonly");
          const get = tx.objectStore("handles").get("vaultDir");
          get.onsuccess = () => {
            done(get.result ?? null);
            db.close();
          };
          get.onerror = () => {
            done(null);
            db.close();
          };
        } catch {
          done(null);
          db.close();
        }
      };
      request.onerror = () => done(null);
      setTimeout(() => done(null), 1500);
    } catch {
      done(null);
    }
  });
}

// Netlify Forms via fetch: static form is declared in HTML, we just submit it
// inline so the visitor never leaves the page.
document.querySelector("#foundingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const message = document.querySelector("#formMsg");
  const body = new URLSearchParams(new FormData(form)).toString();
  try {
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    message.textContent = t("landWaitThanks");
    message.classList.remove("error");
    form.querySelector("#formEmail").value = "";
  } catch {
    message.textContent = t("landWaitErr");
    message.classList.add("error");
  }
  message.classList.remove("hidden");
});

landingApply();
