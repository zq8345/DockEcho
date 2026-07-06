const STORAGE_KEY = "dockecho.local.state.v1";
const LEGACY_STORAGE_KEYS = ["docktodo.local.state.v1", "docknote.local.state.v1"];
const DAY_MS = 86400000;
const todayKey = formatDate(new Date());

// Session runtime. Vault-mode notes never enter localStorage: state.notes holds
// the active working set, runtime.browserNotes preserves the browser-mode copy.
const runtime = {
  mode: "browser",
  dirHandle: null,
  vaultName: "",
  meta: null,
  browserNotes: null,
  pendingHandle: null,
  notice: "",
  editedIds: new Set(),
  writeTimers: new Map(),
  metaTimer: null,
};

function buildSeedNotes() {
  const seeds = SEED_NOTES[currentLang()] ?? SEED_NOTES.en;
  return seeds.map((seed, index) => createNote({
    title: seed.titleKey ? t(seed.titleKey, { date: todayKey }) : seed.title,
    body: seed.body,
    pinned: seed.pinned,
    daily: seed.daily,
  }, index));
}

function buildDefaultState() {
  return {
    view: "write",
    filter: "all",
    query: "",
    activeTag: "",
    selectedId: "",
    theme: "light",
    lang: currentLang(),
    onboarded: false,
    echo: {},
    stats: {},
    notes: buildSeedNotes(),
  };
}

const els = {
  body: document.body,
  railButtons: [...document.querySelectorAll(".rail-btn[data-view]")],
  viewTitle: document.querySelector("#viewTitle"),
  viewMeta: document.querySelector("#viewMeta"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  newNote: document.querySelector("#newNote"),
  dailyNote: document.querySelector("#dailyNote"),
  themeToggle: document.querySelector("#themeToggle"),
  navItems: [...document.querySelectorAll(".nav-item[data-filter]")],
  countAll: document.querySelector("#countAll"),
  countDaily: document.querySelector("#countDaily"),
  countPinned: document.querySelector("#countPinned"),
  countUnlinked: document.querySelector("#countUnlinked"),
  tagList: document.querySelector("#tagList"),
  noteList: document.querySelector("#noteList"),
  writeView: document.querySelector("#writeView"),
  libraryView: document.querySelector("#libraryView"),
  networkView: document.querySelector("#networkView"),
  reviewView: document.querySelector("#reviewView"),
  libraryGrid: document.querySelector("#libraryGrid"),
  noteTitle: document.querySelector("#noteTitle"),
  noteBody: document.querySelector("#noteBody"),
  noteMeta: document.querySelector("#noteMeta"),
  insertLink: document.querySelector("#insertLink"),
  exportNote: document.querySelector("#exportNote"),
  exportAll: document.querySelector("#exportAll"),
  smartOrganize: document.querySelector("#smartOrganize"),
  relatedList: document.querySelector("#relatedList"),
  backlinkList: document.querySelector("#backlinkList"),
  suggestionList: document.querySelector("#suggestionList"),
  insightPane: document.querySelector("#insightPane"),
  insightToggle: document.querySelector("#insightToggle"),
  insightClose: document.querySelector("#insightClose"),
  clusterBoard: document.querySelector("#clusterBoard"),
  strongConnections: document.querySelector("#strongConnections"),
  orphanNotes: document.querySelector("#orphanNotes"),
  langToggle: document.querySelector("#langToggle"),
  memoryCard: document.querySelector("#memoryCard"),
  themeReview: document.querySelector("#themeReview"),
  connectionReview: document.querySelector("#connectionReview"),
  echoCard: document.querySelector("#echoCard"),
  echoStats: document.querySelector("#echoStats"),
  weeklyDigest: document.querySelector("#weeklyDigest"),
  openImport: document.querySelector("#openImport"),
  importer: document.querySelector("#importer"),
  importerClose: document.querySelector("#importerClose"),
  importerMsg: document.querySelector("#importerMsg"),
  importerEcho: document.querySelector("#importerEcho"),
  importDrop: document.querySelector("#importDrop"),
  importFile: document.querySelector("#importFile"),
  openVault: document.querySelector("#openVault"),
  vaultStatus: document.querySelector("#vaultStatus"),
  settingsBtn: document.querySelector("#settingsBtn"),
  settings: document.querySelector("#settings"),
  settingsClose: document.querySelector("#settingsClose"),
  semanticSwitch: document.querySelector("#semanticSwitch"),
  semanticStatus: document.querySelector("#semanticStatus"),
  onboarding: document.querySelector("#onboarding"),
  onboardVault: document.querySelector("#onboardVault"),
  onboardBrowser: document.querySelector("#onboardBrowser"),
  onboardUnsupported: document.querySelector("#onboardUnsupported"),
};

const savedState = loadRawState();
setI18nLang(savedState?.lang ?? detectLang());
let state = normalizeState(savedState ?? buildDefaultState());
let saveTimer = null;
let renderTimer = null;
const echoIndex = new EchoIndex();

function loadRawState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.notes?.length) return saved;
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacy = JSON.parse(localStorage.getItem(legacyKey));
      if (legacy?.notes?.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
        return legacy;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeState(nextState) {
  nextState.view ??= "write";
  nextState.filter ??= "all";
  nextState.query ??= "";
  nextState.activeTag ??= "";
  nextState.theme ??= "light";
  nextState.lang = I18N[nextState.lang] ? nextState.lang : currentLang();
  nextState.onboarded ??= true;
  nextState.echo ??= {};
  nextState.stats ??= {};
  nextState.insightOpen = Boolean(nextState.insightOpen);
  nextState.semantic = Boolean(nextState.semantic);
  nextState.notes = (nextState.notes ?? []).map((note) => ({
    id: note.id ?? createId(),
    title: note.title || t("untitled"),
    body: note.body ?? "",
    pinned: Boolean(note.pinned),
    daily: Boolean(note.daily),
    createdAt: note.createdAt ?? Date.now(),
    updatedAt: note.updatedAt ?? Date.now(),
  }));
  nextState.selectedId = nextState.selectedId && nextState.notes.some((note) => note.id === nextState.selectedId)
    ? nextState.selectedId
    : nextState.notes[0]?.id ?? "";
  return nextState;
}

function saveState() {
  const notes = runtime.mode === "vault" ? runtime.browserNotes ?? [] : state.notes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, notes, vaultActive: runtime.mode === "vault" }));
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 160);
}

function createId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createNote(input = {}, index = 0) {
  const now = Date.now() - index * DAY_MS;
  return {
    id: createId(),
    title: input.title || t("untitled"),
    body: input.body || "",
    pinned: Boolean(input.pinned),
    daily: Boolean(input.daily),
    createdAt: now,
    updatedAt: now,
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectedNote() {
  return state.notes.find((note) => note.id === state.selectedId) ?? null;
}

function allTags(note = null) {
  const notes = note ? [note] : state.notes;
  const counts = new Map();
  notes.forEach((item) => {
    extractTags(item.body).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], t("dateLocale")));
}

function extractTags(text) {
  return [...new Set((text.match(/#[\w一-龥-]+/g) ?? []).map((tag) => tag.slice(1)))];
}

function extractLinks(text) {
  return [...new Set([...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim()).filter(Boolean))];
}

// TF-IDF cosine as the main score, fused with explicit-link and shared-tag boosts.
function relatedNotes(note, limit = 5) {
  if (!note) return [];
  echoIndex.sync(state.notes);
  const tags = new Set(extractTags(note.body));
  const links = new Set(extractLinks(note.body));
  // Notes the user marked "not relevant" get their score gently downweighted —
  // negative feedback should actually count, without erasing them entirely.
  const dismissed = new Set(Object.keys(echoStore().echo.dismissed ?? {}));
  const useSemantic = typeof semanticReady === "function" && semanticReady();
  return state.notes
    .filter((item) => item.id !== note.id)
    .map((item) => {
      // Semantic cosine is the main signal when the on-device model is ready;
      // TF-IDF is the fallback. Explicit-link and shared-tag boosts stay in both.
      const sem = useSemantic ? semanticSimilarity(note.id, item.id) : null;
      let score = (sem !== null ? sem : echoIndex.similarity(note.id, item.id)) * 100;
      extractTags(item.body).forEach((tag) => {
        if (tags.has(tag)) score += 5;
      });
      if (links.has(item.title)) score += 10;
      if (extractLinks(item.body).includes(note.title)) score += 8;
      if (dismissed.has(item.id)) score *= 0.3;
      return { note: item, score: Math.round(score) };
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, limit);
}

function backlinks(note) {
  if (!note) return [];
  return state.notes.filter((item) => item.id !== note.id && extractLinks(item.body).includes(note.title));
}

// Single pass over the corpus instead of per-note backlink scans.
function unlinkedNoteIds() {
  const linkedTitles = new Set();
  const hasOutgoing = new Set();
  state.notes.forEach((note) => {
    const links = extractLinks(note.body);
    if (links.length) hasOutgoing.add(note.id);
    links.forEach((title) => linkedTitles.add(title));
  });
  const ids = new Set();
  state.notes.forEach((note) => {
    if (!hasOutgoing.has(note.id) && !linkedTitles.has(note.title)) ids.add(note.id);
  });
  return ids;
}

function filteredNotes() {
  const query = state.query.trim().toLowerCase();
  const unlinked = state.filter === "unlinked" ? unlinkedNoteIds() : null;
  return state.notes
    .filter((note) => {
      if (state.filter === "daily" && !note.daily) return false;
      if (state.filter === "pinned" && !note.pinned) return false;
      if (unlinked && !unlinked.has(note.id)) return false;
      if (state.activeTag && !extractTags(note.body).includes(state.activeTag)) return false;
      if (!query) return true;
      return `${note.title} ${note.body} ${extractTags(note.body).join(" ")}`.toLowerCase().includes(query);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

function setView(view) {
  state.view = view;
  saveState();
  render();
}

function selectNote(id) {
  state.selectedId = id;
  state.view = "write";
  saveState();
  render();
  els.noteBody.focus();
}

async function addNote(input = {}) {
  const note = createNote({
    title: input.title ?? t("newIdea"),
    body: input.body ?? "",
    daily: Boolean(input.daily),
    pinned: Boolean(input.pinned),
  });
  if (runtime.mode === "vault") {
    try {
      const path = await vaultCreateNote(runtime.dirHandle, note.title, note.body);
      note.id = path;
      note.path = path;
      setVaultNoteMeta(note);
    } catch (error) {
      console.error("DockEcho vault create failed", error);
      runtime.notice = t("vaultOpenFailed");
      render();
      return;
    }
  }
  state.notes.unshift(note);
  state.selectedId = note.id;
  state.view = "write";
  saveState();
  render();
  els.noteTitle.focus();
}

function getOrCreateDailyNote() {
  const existing = state.notes.find((note) => note.daily && note.title.includes(todayKey));
  if (existing) {
    selectNote(existing.id);
    return;
  }
  addNote({
    title: t("dailyTitle", { date: todayKey }),
    daily: true,
    body: t("dailyBody"),
  });
}

function deleteNote(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  if (runtime.mode === "vault") {
    if (!confirm(t("vaultDeleteConfirm", { title: note.title }))) return;
    vaultTrashNote(runtime.dirHandle, note.path)
      .then(() => {
        removeNoteFromState(id);
      })
      .catch((error) => {
        console.error("DockEcho vault trash failed", error);
        runtime.notice = t("vaultOpenFailed");
        render();
      });
    return;
  }
  if (!confirm(t("deleteConfirm", { title: note.title }))) return;
  removeNoteFromState(id);
}

function removeNoteFromState(id) {
  state.notes = state.notes.filter((item) => item.id !== id);
  runtime.editedIds.delete(id);
  if (runtime.mode === "vault" && runtime.meta) {
    delete runtime.meta.notes?.[id];
    queueMetaSave();
  }
  if (state.selectedId === id) state.selectedId = filteredNotes()[0]?.id ?? state.notes[0]?.id ?? "";
  saveState();
  render();
}

// contentChanged=false is for pinned/daily flips: metadata only, never a file write.
function updateSelected(patch, contentChanged = true) {
  const note = selectedNote();
  if (!note) return;
  Object.assign(note, patch, { updatedAt: Date.now() });
  if (runtime.mode === "vault") {
    if (contentChanged) {
      runtime.editedIds.add(note.id);
      queueVaultWrite(note.id);
    } else {
      setVaultNoteMeta(note);
    }
  }
  queueSave();
  if (contentChanged) scheduleRender();
  else render(false);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => render(false), 300);
}

/* ---------- vault mode ---------- */

function setVaultNoteMeta(note) {
  if (!runtime.meta) return;
  runtime.meta.notes ??= {};
  runtime.meta.notes[note.path] = { pinned: note.pinned, daily: note.daily, createdAt: note.createdAt };
  queueMetaSave();
}

function queueMetaSave() {
  if (!runtime.dirHandle || !runtime.meta) return;
  clearTimeout(runtime.metaTimer);
  runtime.metaTimer = setTimeout(() => {
    vaultWriteMeta(runtime.dirHandle, runtime.meta).catch((error) => {
      console.error("DockEcho meta write failed", error);
    });
  }, 600);
}

function queueVaultWrite(id) {
  clearTimeout(runtime.writeTimers.get(id));
  runtime.writeTimers.set(id, setTimeout(async () => {
    runtime.writeTimers.delete(id);
    const note = state.notes.find((item) => item.id === id);
    if (!note || runtime.mode !== "vault") return;
    try {
      const newPath = await vaultWriteNote(runtime.dirHandle, note, note.path);
      if (newPath !== note.path) renameNoteId(note, newPath);
    } catch (error) {
      console.error("DockEcho vault write failed", error);
      runtime.notice = t("vaultOpenFailed");
      renderVaultStatus();
    }
  }, 800));
}

function renameNoteId(note, newPath) {
  const oldId = note.id;
  if (runtime.meta) {
    runtime.meta.notes ??= {};
    if (runtime.meta.notes[oldId]) {
      runtime.meta.notes[newPath] = runtime.meta.notes[oldId];
      delete runtime.meta.notes[oldId];
    }
    const echo = runtime.meta.echo ?? {};
    ["history", "snoozed", "dismissed"].forEach((bucket) => {
      if (echo[bucket]?.[oldId] !== undefined) {
        echo[bucket][newPath] = echo[bucket][oldId];
        delete echo[bucket][oldId];
      }
    });
    if (echo.lastNoteId === oldId) echo.lastNoteId = newPath;
  }
  note.id = newPath;
  note.path = newPath;
  if (state.selectedId === oldId) state.selectedId = newPath;
  if (runtime.editedIds.delete(oldId)) runtime.editedIds.add(newPath);
  setVaultNoteMeta(note);
  saveState();
}

async function mountVault(handle, { askMigrate = true } = {}) {
  if (!(await vaultEnsurePermission(handle))) return false;
  const files = await vaultScan(handle);
  const meta = (await vaultReadMeta(handle)) ?? { version: 1, notes: {}, echo: {}, stats: {} };
  meta.notes ??= {};
  meta.echo ??= {};
  meta.stats ??= {};

  const previousMode = runtime.mode;
  const browserNotes = previousMode === "browser" ? state.notes : runtime.browserNotes ?? [];
  const notes = files.map((file) => ({
    id: file.path,
    path: file.path,
    title: file.title,
    body: file.body,
    pinned: Boolean(meta.notes[file.path]?.pinned),
    daily: Boolean(meta.notes[file.path]?.daily),
    createdAt: meta.notes[file.path]?.createdAt ?? file.lastModified,
    updatedAt: file.lastModified,
  }));

  runtime.dirHandle = handle;
  runtime.vaultName = handle.name || "vault";
  runtime.meta = meta;
  runtime.pendingHandle = null;
  runtime.notice = "";
  runtime.editedIds = new Set();

  // Seeds from a brand-new session never migrate into a user's vault.
  const migratable = state.onboarded ? browserNotes : [];
  runtime.browserNotes = migratable;
  if (askMigrate && migratable.length && confirm(t("migrateAsk", { n: migratable.length }))) {
    for (const note of migratable) {
      try {
        const path = await vaultCreateNote(handle, note.title, note.body);
        meta.notes[path] = { pinned: note.pinned, daily: note.daily, createdAt: note.createdAt };
        notes.unshift({ ...note, id: path, path });
      } catch (error) {
        console.error("DockEcho migration failed for note", note.title, error);
      }
    }
    runtime.browserNotes = [];
    await vaultWriteMeta(handle, meta);
  }

  runtime.mode = "vault";
  meta.stats.firstUseAt ??= Date.now();
  state.notes = notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  state.selectedId = state.notes[0]?.id ?? "";
  state.onboarded = true;
  hideOnboarding();
  await vaultStoreHandle(handle);
  saveState();
  render();
  return true;
}

async function openVaultPicker() {
  if (!vaultSupported()) return;
  try {
    const handle = await vaultPickFolder();
    await mountVault(handle);
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("DockEcho vault open failed", error);
    runtime.notice = t("vaultOpenFailed");
    renderVaultStatus();
  }
}

async function restoreVault() {
  if (!vaultSupported()) return;
  const handle = await vaultLoadHandle();
  if (!handle) return;
  const permission = await vaultQueryPermission(handle);
  if (permission === "granted") {
    try {
      await mountVault(handle, { askMigrate: false });
      return;
    } catch (error) {
      console.error("DockEcho vault restore failed", error);
    }
    runtime.notice = t("vaultRestoreFailed");
    await vaultForgetHandle();
    renderVaultStatus();
    return;
  }
  if (permission === "prompt") {
    // requestPermission needs a user gesture — surface a one-click resume chip.
    runtime.pendingHandle = handle;
    renderVaultStatus();
    return;
  }
  runtime.notice = t("vaultRestoreFailed");
  await vaultForgetHandle();
  renderVaultStatus();
}

async function resumePendingVault() {
  const handle = runtime.pendingHandle;
  if (!handle) return;
  try {
    if (await mountVault(handle, { askMigrate: false })) return;
  } catch (error) {
    console.error("DockEcho vault resume failed", error);
  }
  runtime.pendingHandle = null;
  runtime.notice = t("vaultRestoreFailed");
  await vaultForgetHandle();
  renderVaultStatus();
}

/* ---------- echo card ---------- */

function echoStore() {
  if (runtime.mode === "vault" && runtime.meta) {
    runtime.meta.echo ??= {};
    runtime.meta.stats ??= {};
    return { echo: runtime.meta.echo, stats: runtime.meta.stats, save: queueMetaSave };
  }
  state.echo ??= {};
  state.stats ??= {};
  return { echo: state.echo, stats: state.stats, save: queueSave };
}

function echoContextIds() {
  const ids = [];
  if (state.selectedId) ids.push(state.selectedId);
  [...state.notes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 4)
    .forEach((note) => {
      if (!ids.includes(note.id)) ids.push(note.id);
    });
  return ids.slice(0, 4).filter((id) => state.notes.some((note) => note.id === id));
}

function currentEcho() {
  const { echo, stats, save } = echoStore();
  if (echo.lastDate === todayKey) {
    if (echo.closedDate === todayKey || !echo.lastNoteId) return null;
    const note = state.notes.find((item) => item.id === echo.lastNoteId);
    if (!note) return null;
    const why = echo.lastOnThisDay
      ? t("echoOnThisDay", { n: echo.lastOnThisDay })
      : buildEchoWhy(note, echo.lastTerms ?? [], echo.lastContextId);
    return why ? { note, why } : null;
  }
  echoIndex.sync(state.notes);
  const semanticSim = (typeof semanticReady === "function" && semanticReady())
    ? (a, b) => semanticSimilarity(a, b)
    : null;
  const pick = pickTodayEcho({
    notes: state.notes,
    index: echoIndex,
    meta: echo,
    now: Date.now(),
    contextIds: echoContextIds(),
    excludeId: state.selectedId,
    semanticSim,
  });
  if (!pick) return null;
  const why = pick.onThisDayYears
    ? t("echoOnThisDay", { n: pick.onThisDayYears })
    : buildEchoWhy(pick.note, pick.sharedTerms, pick.bestContextId);
  if (!why) return null; // a card without a "why" never ships
  echo.lastDate = todayKey;
  echo.lastNoteId = pick.note.id;
  echo.lastTerms = pick.sharedTerms;
  echo.lastContextId = pick.bestContextId;
  echo.lastContextTerms = pick.contextTerms.slice(0, 12);
  echo.lastOnThisDay = pick.onThisDayYears ?? 0;
  echo.lastTouched = "";
  echo.closedDate = "";
  echo.history ??= {};
  echo.history[pick.note.id] = Date.now();
  echo.log = (echo.log ?? []).filter((e) => e.date !== todayKey);
  echo.log.push({ date: todayKey, ts: Date.now(), noteId: pick.note.id, why, onThisDay: pick.onThisDayYears ?? 0, action: "" });
  echo.log = echo.log.slice(-40);
  stats.echoShown = (stats.echoShown ?? 0) + 1;
  save();
  return { note: pick.note, why };
}

function buildEchoWhy(note, terms, contextId) {
  const context = state.notes.find((item) => item.id === contextId) ?? selectedNote();
  if (!context || context.id === note.id) return "";
  const days = Math.max(1, Math.floor((Date.now() - note.createdAt) / DAY_MS));
  const age = days >= 60
    ? t("ageMonths", { n: Math.max(2, Math.round(days / 30)) })
    : days >= 14
      ? t("ageWeeks", { n: Math.round(days / 7) })
      : t("ageDays", { n: days });
  const sharedTags = extractTags(note.body).filter((tag) => extractTags(context.body).includes(tag));
  if (sharedTags.length) {
    return t("echoWhyTags", {
      age,
      current: context.title,
      terms: sharedTags.slice(0, 2).map((tag) => `#${tag}`).join(t("listJoin")),
    });
  }
  if (terms?.length) {
    return t("echoWhyTerms", { age, current: context.title, terms: terms.slice(0, 2).join(t("listJoin")) });
  }
  // Semantic hit with no shared words — the model connected them by meaning.
  // Cross-language matches get to say so out loud (our standout capability).
  if (typeof semanticReady === "function" && semanticReady()) {
    if (noteLang(note) !== noteLang(context)) {
      return t("echoWhyCrossLang", { age, other: context.title });
    }
    return t("echoWhySemantic", { age, current: context.title });
  }
  return "";
}

// Rough language of a note: "zh" when CJK dominates, else "en". Only used to
// decide whether a semantic match is cross-language for the "why" wording.
function noteLang(note) {
  const text = `${note.title} ${note.body}`;
  const cjk = (text.match(/[一-龥]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  return cjk > latin ? "zh" : "en";
}

function echoLogAction(echo, action) {
  echo.lastTouched = todayKey;
  const entry = (echo.log ?? []).find((e) => e.date === todayKey);
  if (entry) entry.action = action;
}

function echoAction(action) {
  const { echo, stats, save } = echoStore();
  const note = state.notes.find((item) => item.id === echo.lastNoteId);
  if (!note) return;
  echoLogAction(echo, action);
  if (action === "open") {
    stats.echoOpened = (stats.echoOpened ?? 0) + 1;
    if (Date.now() - note.createdAt > 90 * DAY_MS) stats.oldEchoOpened = (stats.oldEchoOpened ?? 0) + 1;
    save();
    selectNote(note.id);
    return;
  }
  if (action === "insert") {
    stats.echoInserted = (stats.echoInserted ?? 0) + 1;
    save();
    insertTextAtCursor(`[[${note.title}]]`);
    return;
  }
  if (action === "snooze") {
    echo.snoozed ??= {};
    echo.snoozed[note.id] = Date.now() + 7 * DAY_MS;
    echo.closedDate = todayKey;
    stats.echoSnoozed = (stats.echoSnoozed ?? 0) + 1;
  } else if (action === "dismiss") {
    echo.dismissed ??= {};
    const contexts = echo.dismissed[note.id] ?? [];
    contexts.push(echo.lastContextTerms ?? []);
    echo.dismissed[note.id] = contexts.slice(-5);
    echo.closedDate = todayKey;
    stats.echoDismissed = (stats.echoDismissed ?? 0) + 1;
  } else if (action === "close") {
    echo.closedDate = todayKey;
  }
  save();
  render(false);
}

function renderEchoCard() {
  const shown = currentEcho();
  els.echoCard.classList.toggle("hidden", !shown);
  if (!shown) {
    els.echoCard.replaceChildren();
    return;
  }
  els.echoCard.innerHTML = `
    <button class="echo-close" type="button" data-echo="close" title="${escapeHtml(t("echoClose"))}"><svg class="icon" aria-hidden="true"><use href="./assets/icons.svg#i-x"></use></svg></button>
    <span class="echo-tag">${escapeHtml(t("echoTitle"))}</span>
    <strong>${escapeHtml(shown.note.title)}</strong>
    <p class="echo-why">${escapeHtml(shown.why)}</p>
    <p class="echo-snippet">${escapeHtml(snippet(shown.note.body, 160))}</p>
    <div class="echo-actions">
      <button class="primary-btn" type="button" data-echo="open">${escapeHtml(t("echoOpen"))}</button>
      <button class="soft-btn" type="button" data-echo="insert">${escapeHtml(t("echoInsert"))}</button>
      <button class="soft-btn" type="button" data-echo="snooze">${escapeHtml(t("echoSnooze"))}</button>
      <button class="soft-btn" type="button" data-echo="dismiss">${escapeHtml(t("echoDismiss"))}</button>
    </div>
  `;
  els.echoCard.querySelectorAll("[data-echo]").forEach((button) => {
    button.addEventListener("click", () => echoAction(button.dataset.echo));
  });
}

/* ---------- rendering ---------- */

function render(syncEditor = true) {
  setI18nLang(state.lang);
  applyI18n();
  renderTheme();
  renderShell();
  renderSidebar();
  renderVaultStatus();
  renderViews(syncEditor);
  renderInsights();
  syncInsightTop();
}

// The insight pane is a fixed-position slide-out. Anchor its top below the main
// header — which wraps to two rows on narrow viewports — so it never covers the
// header action buttons at any width.
function syncInsightTop() {
  const head = document.querySelector(".pane-head");
  if (!head) return;
  const bottom = head.getBoundingClientRect().bottom;
  document.documentElement.style.setProperty("--insight-top", Math.round(bottom + 8) + "px");
}

if (typeof ResizeObserver === "function") {
  const head = document.querySelector(".pane-head");
  if (head) new ResizeObserver(() => syncInsightTop()).observe(head);
}
window.addEventListener("resize", syncInsightTop);

function renderTheme() {
  els.body.className = state.theme === "dark" ? "theme-dark" : "";
}

function renderShell() {
  els.railButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const titles = {
    write: t("viewWrite"),
    library: t("viewLibrary"),
    network: t("viewNetwork"),
    review: t("viewReview"),
  };
  els.viewTitle.textContent = titles[state.view];
  const total = state.notes.length;
  const links = state.notes.reduce((sum, note) => sum + extractLinks(note.body).length, 0);
  els.viewMeta.textContent = t("viewMeta", { total, tags: allTags().length, links });
  els.writeView.classList.toggle("hidden", state.view !== "write");
  els.libraryView.classList.toggle("hidden", state.view !== "library");
  els.networkView.classList.toggle("hidden", state.view !== "network");
  els.reviewView.classList.toggle("hidden", state.view !== "review");
}

function renderVaultStatus() {
  const el = els.vaultStatus;
  els.openVault.classList.toggle("hidden", !vaultSupported());
  el.classList.remove("active", "action", "warn");
  if (runtime.notice) {
    el.textContent = runtime.notice;
    el.classList.add("warn");
    return;
  }
  if (runtime.mode === "vault") {
    el.textContent = t("modeFolder", { name: runtime.vaultName });
    el.classList.add("active");
    return;
  }
  if (runtime.pendingHandle) {
    el.textContent = t("vaultResume", { name: runtime.pendingHandle.name || "vault" });
    el.classList.add("action");
    return;
  }
  el.textContent = t("modeBrowser");
}

function renderSidebar() {
  els.searchInput.value = state.query;
  const unlinked = unlinkedNoteIds();
  els.countAll.textContent = state.notes.length;
  els.countDaily.textContent = state.notes.filter((note) => note.daily).length;
  els.countPinned.textContent = state.notes.filter((note) => note.pinned).length;
  els.countUnlinked.textContent = unlinked.size;
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.filter && !state.activeTag));

  els.tagList.replaceChildren();
  allTags().slice(0, 30).forEach(([tag, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-pill";
    button.classList.toggle("active", state.activeTag === tag);
    button.innerHTML = `<span>#${escapeHtml(tag)}</span><small>${count}</small>`;
    button.addEventListener("click", () => {
      state.activeTag = state.activeTag === tag ? "" : tag;
      state.filter = "all";
      saveState();
      render();
    });
    els.tagList.append(button);
  });

  els.noteList.replaceChildren();
  // The sidebar is a recency list — cap DOM nodes so typing stays fluid at 1000+ notes.
  filteredNotes().slice(0, 120).forEach((note) => els.noteList.append(noteButton(note)));
}

function noteButton(note) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-item";
  button.classList.toggle("active", note.id === state.selectedId);
  const tags = extractTags(note.body).slice(0, 3).map((tag) => `#${tag}`).join(" ");
  button.innerHTML = `
    <strong>${escapeHtml(note.title)}</strong>
    <span>${escapeHtml(snippet(note.body, 72))}</span>
    <small>${note.pinned ? '<svg class="icon icon-inline" aria-hidden="true"><use href="./assets/icons.svg#i-pin"></use></svg> ' : ""}${escapeHtml(tags) || t("untagged")} · ${timeAgo(note.updatedAt)}</small>
  `;
  button.addEventListener("click", () => selectNote(note.id));
  return button;
}

function renderViews(syncEditor) {
  const note = selectedNote();
  if (syncEditor && note) {
    els.noteTitle.value = note.title;
    els.noteBody.value = note.body;
  }
  if (!note) {
    els.noteTitle.value = "";
    els.noteBody.value = "";
  }
  renderMeta(note);
  // Only the active view pays rendering cost.
  if (state.view === "write") renderEchoCard();
  if (state.view === "library") renderLibrary();
  if (state.view === "network") renderNetwork();
  if (state.view === "review") renderReview();
}

function renderMeta(note) {
  if (!note) {
    els.noteMeta.textContent = "";
    return;
  }
  const tags = extractTags(note.body);
  els.noteMeta.innerHTML = `
    <button class="meta-chip" type="button" id="pinToggle">${note.pinned ? t("pinned") : t("pin")}</button>
    <button class="meta-chip danger" type="button" id="deleteNote">${t("delete")}</button>
    <span>${t("chars", { count: note.body.length })}</span>
    <span>${tags.length ? tags.map((tag) => `#${escapeHtml(tag)}`).join(" ") : t("noTags")}</span>
    <span>${new Date(note.updatedAt).toLocaleString(t("dateLocale"))}</span>
  `;
  document.querySelector("#pinToggle")?.addEventListener("click", () => updateSelected({ pinned: !note.pinned }, false));
  document.querySelector("#deleteNote")?.addEventListener("click", () => deleteNote(note.id));
}

function renderLibrary() {
  els.libraryGrid.replaceChildren();
  filteredNotes().forEach((note) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "library-card";
    card.innerHTML = `
      <strong>${escapeHtml(note.title)}</strong>
      <p>${escapeHtml(snippet(note.body, 150))}</p>
      <span>${extractTags(note.body).map((tag) => `#${escapeHtml(tag)}`).join(" ") || t("untagged")}</span>
    `;
    card.addEventListener("click", () => selectNote(note.id));
    els.libraryGrid.append(card);
  });
}

function renderInsights() {
  const note = selectedNote();
  const related = relatedNotes(note);
  renderMiniList(els.relatedList, related, t("emptyRelated"));
  renderMiniList(els.backlinkList, backlinks(note), t("emptyBacklinks"));
  renderSuggestions(note);

  // The pane is a quiet slide-out — collapsed until the user asks for it.
  els.insightPane.classList.toggle("open", state.insightOpen);
  els.insightToggle.classList.toggle("active", state.insightOpen);
  els.insightToggle.setAttribute("aria-expanded", String(state.insightOpen));
  els.insightToggle.title = `${t("insightToggle")} · ${related.length}`;
}

function renderMiniList(container, items, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    container.innerHTML = `<div class="empty-mini">${emptyText}</div>`;
    return;
  }
  items.forEach((item) => {
    const note = item.note ?? item;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-note";
    button.innerHTML = `<strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(snippet(note.body, 72))}</span>`;
    button.addEventListener("click", () => selectNote(note.id));
    container.append(button);
  });
}

function renderSuggestions(note) {
  els.suggestionList.replaceChildren();
  if (!note) return;
  const explicit = new Set(extractLinks(note.body));
  const suggestions = relatedNotes(note, 4).filter((item) => !explicit.has(item.note.title));
  if (!suggestions.length) {
    els.suggestionList.innerHTML = `<div class="empty-mini">${t("emptySuggestions")}</div>`;
    return;
  }
  suggestions.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.innerHTML = `<strong>${t("linkTo", { title: escapeHtml(item.note.title) })}</strong><span>${t("relevance", { score: item.score })}</span>`;
    button.addEventListener("click", () => insertTextAtCursor(`[[${item.note.title}]]`));
    els.suggestionList.append(button);
  });
}

function renderNetwork() {
  const clusters = allTags();
  els.clusterBoard.replaceChildren();
  if (!clusters.length) {
    els.clusterBoard.innerHTML = `<div class="empty-mini">${t("emptyClusters")}</div>`;
  }
  clusters.slice(0, 24).forEach(([tag, count]) => {
    const notes = state.notes.filter((note) => extractTags(note.body).includes(tag));
    const card = document.createElement("section");
    card.className = "cluster-card";
    card.innerHTML = `
      <strong>#${escapeHtml(tag)}</strong>
      <span>${t("noteCount", { n: count })}</span>
      <p>${escapeHtml(notes.slice(0, 3).map((note) => note.title).join(" · "))}</p>
    `;
    card.addEventListener("click", () => {
      state.activeTag = tag;
      state.filter = "all";
      state.view = "library";
      saveState();
      render();
    });
    els.clusterBoard.append(card);
  });

  // Pairwise scan is O(N²) — cap to the most recent notes so the view opens fast.
  const recent = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 150);
  const connections = recent
    .map((note) => ({ note, related: relatedNotes(note, 3) }))
    .filter((item) => item.related.length)
    .sort((a, b) => b.related.length - a.related.length)
    .slice(0, 6);
  els.strongConnections.replaceChildren();
  connections.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "connection-row";
    row.innerHTML = `<strong>${escapeHtml(item.note.title)}</strong><span>${escapeHtml(item.related.map((rel) => rel.note.title).join(" · "))}</span>`;
    row.addEventListener("click", () => selectNote(item.note.id));
    els.strongConnections.append(row);
  });
  if (!connections.length) els.strongConnections.innerHTML = `<div class="empty-mini">${t("emptyConnections")}</div>`;

  els.orphanNotes.replaceChildren();
  const unlinked = unlinkedNoteIds();
  state.notes.filter((note) => unlinked.has(note.id)).slice(0, 12).forEach((note) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "connection-row";
    row.innerHTML = `<strong>${escapeHtml(note.title)}</strong><span>${t("orphanHint")}</span>`;
    row.addEventListener("click", () => selectNote(note.id));
    els.orphanNotes.append(row);
  });
  if (!unlinked.size) els.orphanNotes.innerHTML = `<div class="empty-mini">${t("noOrphans")}</div>`;
}

// Past 7 days of echoes with what the user did with each — the in-app "digest"
// that the future Daily Echo email will just be a delivery channel for.
function renderWeeklyDigest() {
  const { echo } = echoStore();
  const cutoff = Date.now() - 7 * DAY_MS;
  const entries = (echo.log ?? [])
    .filter((e) => e.ts >= cutoff && state.notes.some((n) => n.id === e.noteId))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);
  els.weeklyDigest.classList.toggle("hidden", entries.length === 0);
  if (!entries.length) {
    els.weeklyDigest.replaceChildren();
    return;
  }
  const actionLabel = { open: t("digestOpened"), insert: t("digestInserted"), snooze: t("digestSnoozed") };
  const rows = entries.map((e) => {
    const note = state.notes.find((n) => n.id === e.noteId);
    const mark = actionLabel[e.action] ? `<span class="digest-mark">${escapeHtml(actionLabel[e.action])}</span>` : "";
    return `<button class="digest-row" type="button" data-id="${escapeHtml(e.noteId)}">
      <strong>${escapeHtml(note.title)}${mark}</strong>
      <span>${escapeHtml(e.why || snippet(note.body, 80))}</span>
    </button>`;
  }).join("");
  els.weeklyDigest.innerHTML = `
    <div class="section-title flat"><span>${escapeHtml(t("digestTitle"))}</span></div>
    <div class="digest-list">${rows}</div>
  `;
  els.weeklyDigest.querySelectorAll(".digest-row").forEach((row) => {
    row.addEventListener("click", () => selectNote(row.dataset.id));
  });
}

function renderReview() {
  renderWeeklyDigest();
  const shown = currentEcho();
  if (shown) {
    els.memoryCard.className = "review-card hero-review";
    els.memoryCard.innerHTML = `
      <span>${escapeHtml(t("echoTitle"))}</span>
      <strong>${t("memoryTitle", { title: escapeHtml(shown.note.title) })}</strong>
      <p class="echo-why">${escapeHtml(shown.why)}</p>
      <p>${escapeHtml(snippet(shown.note.body, 180))}</p>
      <button class="primary-btn" type="button" id="openMemory">${t("memoryOpen")}</button>
    `;
    document.querySelector("#openMemory")?.addEventListener("click", () => echoAction("open"));
  } else {
    // Humble empty state — a quiet line, not a giant headline.
    els.memoryCard.className = "echo-empty";
    els.memoryCard.innerHTML = `
      <span class="echo-empty-icon" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="./assets/icons.svg#i-history"></use></svg></span>
      <p>${escapeHtml(t("echoQuiet"))}</p>
    `;
  }

  els.themeReview.replaceChildren();
  allTags().slice(0, 5).forEach(([tag, count]) => {
    const row = document.createElement("div");
    row.className = "theme-row";
    row.innerHTML = `<strong>#${escapeHtml(tag)}</strong><span>${t("tagSeen", { n: count })}</span>`;
    els.themeReview.append(row);
  });
  if (!allTags().length) els.themeReview.innerHTML = `<div class="empty-mini">${t("emptyThemes")}</div>`;

  els.connectionReview.replaceChildren();
  const note = selectedNote();
  const related = relatedNotes(note, 5);
  related.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "connection-row";
    row.innerHTML = `<strong>${escapeHtml(note.title)} ↔ ${escapeHtml(item.note.title)}</strong><span>${t("reviewAdd", { title: escapeHtml(item.note.title) })}</span>`;
    row.addEventListener("click", () => insertTextAtCursor(`[[${item.note.title}]]`));
    els.connectionReview.append(row);
  });
  if (!related.length) els.connectionReview.innerHTML = `<div class="empty-mini">${t("emptyReviewLinks")}</div>`;

  renderEchoStats();
}

function renderEchoStats() {
  const { stats } = echoStore();
  const days = Math.max(1, Math.ceil((Date.now() - (stats.firstUseAt ?? Date.now())) / DAY_MS));
  const rows = [
    [t("statsShown"), stats.echoShown ?? 0],
    [t("statsOpened"), stats.echoOpened ?? 0],
    [t("statsInserted"), stats.echoInserted ?? 0],
    [t("statsDismissed"), stats.echoDismissed ?? 0],
  ];
  els.echoStats.innerHTML = `
    <p class="stat-days">${escapeHtml(t("statsDays", { n: days }))}</p>
    ${rows.map(([label, n]) => `<div class="stat-row"><span>${escapeHtml(label)}</span><strong>${n}</strong></div>`).join("")}
    <div class="stat-row north"><span>${escapeHtml(t("statsNorth"))}</span><strong>${stats.oldEchoOpened ?? 0}</strong></div>
  `;
}

/* ---------- misc actions ---------- */

function smartOrganizeNote() {
  const note = selectedNote();
  if (!note) return;
  const tags = extractTags(note.body);
  const inferred = inferTags(note).filter((tag) => !tags.includes(tag));
  const related = relatedNotes(note, 2).map((item) => item.note.title);
  const additions = [];
  if (inferred.length) additions.push(`\n\n${inferred.map((tag) => `#${tag}`).join(" ")}`);
  if (related.length && !extractLinks(note.body).length) additions.push(`\n\n${t("organizeRelated")}${related.map((title) => `[[${title}]]`).join(" ")}`);
  if (!additions.length) additions.push(`\n\n${t("organizeDone")}`);
  note.body = `${note.body.trim()}${additions.join("")}`;
  note.updatedAt = Date.now();
  if (runtime.mode === "vault") {
    runtime.editedIds.add(note.id);
    queueVaultWrite(note.id);
  }
  saveState();
  render();
}

function inferTags(note) {
  const text = `${note.title} ${note.body}`;
  const rules = INFER_RULES[currentLang()] ?? INFER_RULES.en;
  return rules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function insertTextAtCursor(text) {
  const note = selectedNote();
  if (!note) return;
  const input = els.noteBody;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const insert = `${before && !before.endsWith("\n") ? " " : ""}${text}`;
  input.value = `${before}${insert}${after}`;
  updateSelected({ body: input.value });
  requestAnimationFrame(() => {
    input.focus();
    input.selectionStart = input.selectionEnd = start + insert.length;
  });
}

function exportSelectedNote() {
  const note = selectedNote();
  if (!note) return;
  const content = `# ${note.title}\n\n${note.body}\n`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFileName(note.title)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportAllNotes() {
  const content = state.notes
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((note) => {
      const tags = extractTags(note.body).map((tag) => `#${tag}`).join(" ");
      const updated = new Date(note.updatedAt).toLocaleString(t("dateLocale"));
      return `# ${note.title}\n\n> ${t("exportUpdated")}: ${updated}${tags ? `\n> ${t("exportTags")}: ${tags}` : ""}\n\n${note.body}\n`;
    })
    .join("\n---\n\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `DockEcho-vault-${formatDate(new Date())}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "note";
}

function snippet(text, length) {
  return text.replace(/[#*_`\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, length) || t("emptyNote");
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: hours });
  return t("daysAgo", { n: Math.floor(hours / 24) });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/* ---------- importers ---------- */

function openImporter() {
  els.importerMsg.classList.add("hidden");
  els.importerMsg.classList.remove("error");
  els.importerEcho.classList.add("hidden");
  els.importerEcho.replaceChildren();
  els.importer.classList.remove("hidden");
  focusIntoOverlay(els.importer);
}

function closeImporter() {
  els.importer.classList.add("hidden");
  restoreOverlayFocus(els.importer);
}

function importReportError(text) {
  els.importerMsg.textContent = text;
  els.importerMsg.classList.add("error");
  els.importerMsg.classList.remove("hidden");
}

// Ingest parsed notes. `result` = { notes, skipped, skippedKind } aggregated
// across all dropped files. Timestamps carried straight through — never reset.
async function ingestImportedNotes(result) {
  const parsed = result.notes ?? [];
  const existingTitles = new Set(state.notes.map((note) => note.title));
  const seen = new Set();
  const fresh = parsed.filter((item) => {
    if (!item.title) return false;
    // Dedup on title + created date — same-titled notes from different dates stay.
    const key = `${item.title} ${item.createdAt ?? ""}`;
    if (existingTitles.has(item.title) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!fresh.length) {
    importReportError(t("importErrEmpty"));
    return;
  }
  const imported = [];
  for (const item of fresh) {
    const note = {
      id: createId(),
      title: item.title,
      body: item.body,
      pinned: false,
      daily: false,
      createdAt: item.createdAt ?? Date.now(),
      updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
      source: item.source ?? item.title,
    };
    if (runtime.mode === "vault") {
      try {
        const path = await vaultCreateNote(runtime.dirHandle, note.title, note.body);
        note.id = path;
        note.path = path;
        setVaultNoteMeta(note);
      } catch (error) {
        console.error("DockEcho import write failed", note.title, error);
        continue;
      }
    }
    state.notes.push(note);
    imported.push(note);
  }
  if (!imported.length) {
    importReportError(t("importErrEmpty"));
    return;
  }
  state.notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  saveState();
  render(false);
  const parts = [t("importDone", { n: imported.length })];
  if (result.skipped > 0) {
    const kind = result.skippedKind === "database CSV" ? t("kindNotion")
      : result.skippedKind === "attachment" ? t("kindAttachment")
      : result.skippedKind;
    parts.push(t("importSkipped", { n: result.skipped, kind }));
  }
  if (result.notionUndated > 0) {
    parts.push(t("importNotionNoDate", { n: result.notionUndated }));
  }
  els.importerMsg.textContent = parts.join(" · ");
  els.importerMsg.classList.remove("hidden", "error");
  showFirstEcho(imported);
}

// The magic moment: right after import, surface one echo from the old notes.
// Prefer connecting an imported note to a note the user already had — that's the
// "my library recognizes this" moment — falling back to any pair, then to silence.
function showFirstEcho(imported) {
  echoIndex.sync(state.notes);
  const importedIds = new Set(imported.map((note) => note.id));
  let best = null;
  let bestExisting = null;
  imported.forEach((note) => {
    state.notes.forEach((other) => {
      if (other.id === note.id) return;
      const sim = echoIndex.similarity(note.id, other.id);
      if (!best || sim > best.sim) best = { note, other, sim };
      if (!importedIds.has(other.id) && (!bestExisting || sim > bestExisting.sim)) {
        bestExisting = { note, other, sim };
      }
    });
  });
  // Favor a connection to the existing library when it clears the quality bar.
  if (bestExisting && bestExisting.sim >= 0.06) best = bestExisting;
  if (!best) {
    els.importerEcho.innerHTML = `<p class="importer-quiet">${escapeHtml(t("importNoEcho"))}</p>`;
    els.importerEcho.classList.remove("hidden");
    return;
  }
  const terms = echoIndex.sharedTerms(best.other.id, best.note.id, 2);
  const days = Math.max(1, Math.floor((Date.now() - best.note.createdAt) / DAY_MS));
  const age = days >= 60
    ? t("ageMonths", { n: Math.max(2, Math.round(days / 30)) })
    : days >= 14
      ? t("ageWeeks", { n: Math.round(days / 7) })
      : t("ageDays", { n: days });
  const why = best.sim >= 0.06 && terms.length
    ? t("echoFirstConnected", { age, other: best.other.title, terms: terms.join(t("listJoin")) })
    : t("echoImportWhy", { age, source: best.note.source ?? best.note.title });
  els.importerEcho.innerHTML = `
    <span class="echo-tag">${escapeHtml(t("importFirstEcho"))}</span>
    <strong>${escapeHtml(best.note.title)}</strong>
    <p class="echo-why">${escapeHtml(why)}</p>
    <p class="echo-snippet">${escapeHtml(snippet(best.note.body, 140))}</p>
    <button class="primary-btn" type="button" id="importerOpenEcho">${escapeHtml(t("echoOpen"))}</button>
  `;
  els.importerEcho.classList.remove("hidden");
  document.querySelector("#importerOpenEcho")?.addEventListener("click", () => {
    closeImporter();
    selectNote(best.note.id);
  });

  // If it clears the daily-card quality bar, let today's card show it too.
  if (best.sim >= 0.08 && terms.length) {
    const { echo, stats, save } = echoStore();
    if (echo.lastDate !== todayKey || !echo.lastNoteId) {
      echo.lastDate = todayKey;
      echo.lastNoteId = best.note.id;
      echo.lastTerms = terms;
      echo.lastContextId = best.other.id;
      echo.lastContextTerms = echoIndex.topTerms(best.other.id, 12);
      echo.closedDate = "";
      echo.history ??= {};
      echo.history[best.note.id] = Date.now();
      stats.echoShown = (stats.echoShown ?? 0) + 1;
      save();
    }
  }
}

// Drop or choose any number of files; each is auto-detected and parsed locally,
// then results are merged into one import + one first-echo moment.
async function processImportFiles(files) {
  if (!files.length) return;
  els.importerMsg.classList.add("hidden", "error");
  const all = [];
  let skipped = 0;
  let skippedKind = "";
  let notionUndated = 0;
  let sawError = null;
  for (const file of files) {
    try {
      const result = await migDetectAndParse(file);
      if (result?.notes?.length) all.push(...result.notes);
      if (result?.skipped) {
        skipped += result.skipped;
        skippedKind = result.skippedKind ?? skippedKind;
      }
      if (result?.notionUndated) notionUndated += result.notionUndated;
    } catch (error) {
      // Handled below with a humane UI message; a warn is the right severity.
      console.warn("DockEcho couldn't parse", file.name, error?.message ?? error);
      sawError = error;
    }
  }
  if (!all.length) {
    if (sawError?.code === "zip-unsupported") importReportError(t("importErrZip"));
    else if (sawError) importReportError(t("importErrParse"));
    else importReportError(t("importErrEmpty"));
    return;
  }
  await ingestImportedNotes({ notes: all, skipped, skippedKind, notionUndated });
}

/* ---------- onboarding ---------- */

function initOnboarding() {
  if (state.onboarded) return;
  const supported = vaultSupported();
  els.onboardVault.classList.toggle("hidden", !supported);
  document.querySelector("#onboardVaultHint")?.classList.toggle("hidden", !supported);
  els.onboardUnsupported.classList.toggle("hidden", supported);
  els.onboarding.classList.remove("hidden");
  focusIntoOverlay(els.onboarding);
}

function hideOnboarding() {
  els.onboarding.classList.add("hidden");
}

/* ---------- settings: opt-in semantic echoes (experimental) ---------- */

function openSettings() {
  renderSemanticStatus();
  els.settings.classList.remove("hidden");
  focusIntoOverlay(els.settings);
}

function closeSettings() {
  els.settings.classList.add("hidden");
  restoreOverlayFocus(els.settings);
}

/* ---------- overlay accessibility: focus move-in, Esc, Tab trap ---------- */

function overlayFocusables(overlayEl) {
  return [...overlayEl.querySelectorAll('button:not([disabled]), [href], input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null);
}

function focusIntoOverlay(overlayEl) {
  overlayEl.__prevFocus = document.activeElement;
  const f = overlayFocusables(overlayEl);
  (f[0] ?? overlayEl).focus?.();
}

function restoreOverlayFocus(overlayEl) {
  overlayEl.__prevFocus?.focus?.();
  overlayEl.__prevFocus = null;
}

function activeOverlay() {
  return [
    { el: els.settings, close: closeSettings },
    { el: els.importer, close: closeImporter },
    { el: els.onboarding, close: () => els.onboardBrowser.click() },
  ].find((o) => o.el && !o.el.classList.contains("hidden")) ?? null;
}

document.addEventListener("keydown", (event) => {
  const overlay = activeOverlay();
  if (!overlay) {
    // No overlay: Escape also closes the insight drawer (esp. mobile bottom-sheet).
    if (event.key === "Escape" && state.insightOpen) {
      event.preventDefault();
      state.insightOpen = false;
      saveState();
      render(false);
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    overlay.close();
    return;
  }
  if (event.key === "Tab") {
    const f = overlayFocusables(overlay.el);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

function renderSemanticStatus() {
  const on = Boolean(state.semantic);
  els.semanticSwitch.classList.toggle("on", on);
  els.semanticSwitch.setAttribute("aria-checked", String(on));
  const status = typeof semanticState === "function" ? semanticState() : "off";
  const key = { loading: "semanticLoading", ready: "semanticReady", failed: "semanticFailed", off: "semanticOff" }[status] ?? "semanticOff";
  els.semanticStatus.textContent = t(key);
  els.semanticStatus.classList.toggle("warn", status === "failed");
}

// The only place the semantic layer is ever switched on. When it flips to ready,
// re-render so related notes pick up the semantic scores.
async function applySemantic() {
  if (typeof semanticEnable !== "function") return;
  if (state.semantic) {
    await semanticEnable(state.notes, () => {
      renderSemanticStatus();
      if (semanticState() === "ready") {
        recomputeTodayEchoIfUntouched();
        render(false);
      }
    });
  } else {
    semanticDisable();
  }
  renderSemanticStatus();
}

// Once the model is ready, upgrade today's card to the semantic pick — but only
// if the user hasn't engaged with it yet. Never yank a card they've already seen
// and acted on.
function recomputeTodayEchoIfUntouched() {
  const { echo, save } = echoStore();
  if (echo.lastDate !== todayKey) return;
  if (echo.lastTouched === todayKey || echo.closedDate === todayKey) return;
  echo.lastDate = "";
  echo.lastNoteId = "";
  save();
  currentEcho(); // re-picks with semantic scores and re-logs
}

/* ---------- events & boot ---------- */

// Defensive binding: a single missing element must never break the rest of the
// wiring chain (a null els.* used to throw and silently kill every listener
// declared after it).
function bind(el, event, handler, opts) {
  if (el) el.addEventListener(event, handler, opts);
  else console.warn("DockEcho: missing element for", event, "listener");
}

els.railButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
els.navItems.forEach((item) => item.addEventListener("click", () => {
  state.filter = item.dataset.filter;
  state.activeTag = "";
  state.view = "library";
  saveState();
  render();
}));
bind(els.searchInput, "input", () => {
  state.query = els.searchInput.value;
  queueSave();
  scheduleRender();
});
bind(els.clearSearch, "click", () => {
  state.query = "";
  state.activeTag = "";
  state.filter = "all";
  saveState();
  render();
});
bind(els.newNote, "click", () => addNote());
bind(els.dailyNote, "click", getOrCreateDailyNote);
bind(els.noteTitle, "input", () => updateSelected({ title: els.noteTitle.value.trim() || t("untitled") }));
bind(els.noteBody, "input", () => updateSelected({ body: els.noteBody.value }));
bind(els.insertLink, "click", () => {
  const note = selectedNote();
  const target = relatedNotes(note, 1)[0]?.note ?? state.notes.find((item) => item.id !== note?.id);
  insertTextAtCursor(target ? `[[${target.title}]]` : `[[${t("newLinkFallback")}]]`);
});
bind(els.smartOrganize, "click", smartOrganizeNote);
bind(els.exportNote, "click", exportSelectedNote);
bind(els.exportAll, "click", exportAllNotes);
bind(els.themeToggle, "click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  render();
});
bind(els.langToggle, "click", () => {
  state.lang = state.lang === "zh" ? "en" : "zh";
  saveState();
  render();
});
bind(els.openVault, "click", openVaultPicker);
bind(els.vaultStatus, "click", () => {
  if (runtime.pendingHandle) resumePendingVault();
});
bind(els.insightToggle, "click", () => {
  state.insightOpen = !state.insightOpen;
  saveState();
  render(false);
});
bind(els.insightClose, "click", () => {
  state.insightOpen = false;
  saveState();
  render(false);
});
bind(els.settingsBtn, "click", openSettings);
bind(els.settingsClose, "click", closeSettings);
bind(els.semanticSwitch, "click", () => {
  state.semantic = !state.semantic;
  saveState();
  applySemantic();
});
bind(els.openImport, "click", openImporter);
bind(els.importerClose, "click", closeImporter);
bind(els.importDrop, "click", () => els.importFile.click());
bind(els.importFile, "change", async () => {
  if (els.importFile.files?.length) await processImportFiles([...els.importFile.files]);
  els.importFile.value = "";
});
["dragenter", "dragover"].forEach((evt) => bind(els.importDrop, evt, (e) => {
  e.preventDefault();
  els.importDrop.classList.add("dragover");
}));
["dragleave", "drop"].forEach((evt) => bind(els.importDrop, evt, (e) => {
  e.preventDefault();
  els.importDrop.classList.remove("dragover");
}));
bind(els.importDrop, "drop", async (e) => {
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length) await processImportFiles(files);
});
bind(els.onboardVault, "click", async () => {
  await openVaultPicker();
});
bind(els.onboardBrowser, "click", () => {
  state.onboarded = true;
  hideOnboarding();
  saveState();
  render();
});

function applyI18n() {
  applyStaticI18n();
  els.langToggle.textContent = t("switchTo");
}

state.stats.firstUseAt ??= Date.now();
saveState();
render();
initOnboarding();
restoreVault();
if (state.semantic) applySemantic(); // opt-in; re-loads the model lazily
registerServiceWorker();
handleSharedCapture();

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("DockEcho service worker registration failed", error?.message ?? error);
  });
}

// Text shared to the installed app (Web Share Target) lands here: the SW stashed
// it, we turn it into a #captured note in browser mode.
async function handleSharedCapture() {
  if (!new URLSearchParams(location.search).has("shared")) return;
  try {
    const res = await fetch("/__dockecho_share__", { cache: "no-store" });
    const payload = await res.json();
    const text = [payload?.title, payload?.text, payload?.url].filter(Boolean).join("\n").trim();
    if (text) {
      addNote({ title: payload?.title?.trim() || text.split("\n")[0].slice(0, 60) || t("newIdea"), body: `${text}\n\n#captured` });
    }
  } catch {
    // nothing to capture
  }
  history.replaceState(null, "", "./app.html");
}
