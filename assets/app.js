const STORAGE_KEY = "dockecho.local.state.v1";
const LEGACY_STORAGE_KEYS = ["docktodo.local.state.v1", "docknote.local.state.v1"];
const todayKey = formatDate(new Date());

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
  clusterBoard: document.querySelector("#clusterBoard"),
  strongConnections: document.querySelector("#strongConnections"),
  orphanNotes: document.querySelector("#orphanNotes"),
  langToggle: document.querySelector("#langToggle"),
  memoryCard: document.querySelector("#memoryCard"),
  themeReview: document.querySelector("#themeReview"),
  connectionReview: document.querySelector("#connectionReview"),
};

const savedState = loadRawState();
setI18nLang(savedState?.lang ?? detectLang());
let state = normalizeState(savedState ?? buildDefaultState());
let saveTimer = null;

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  const now = Date.now() - index * 86400000;
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
  return [...new Set((text.match(/#[\w\u4e00-\u9fa5-]+/g) ?? []).map((tag) => tag.slice(1)))];
}

function extractLinks(text) {
  return [...new Set([...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim()).filter(Boolean))];
}

function noteWords(note) {
  const source = `${note.title} ${note.body}`.toLowerCase();
  const english = source.match(/[a-z0-9]{3,}/g) ?? [];
  const known = ["产品", "知识", "笔记", "本地", "隐私", "长期", "写作", "读书", "AI", "创作", "小白", "网络", "想法", "复盘", "验证", "Notion", "Obsidian"]
    .filter((word) => source.includes(word.toLowerCase()));
  return [...new Set([...english, ...known, ...extractTags(source)])];
}

function relatedNotes(note, limit = 5) {
  if (!note) return [];
  const tags = new Set(extractTags(note.body));
  const words = new Set(noteWords(note));
  const links = new Set(extractLinks(note.body));
  return state.notes
    .filter((item) => item.id !== note.id)
    .map((item) => {
      let score = 0;
      extractTags(item.body).forEach((tag) => {
        if (tags.has(tag)) score += 5;
      });
      noteWords(item).forEach((word) => {
        if (words.has(word)) score += 2;
      });
      if (links.has(item.title)) score += 10;
      if (extractLinks(item.body).includes(note.title)) score += 8;
      return { note: item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, limit);
}

function backlinks(note) {
  if (!note) return [];
  return state.notes.filter((item) => item.id !== note.id && extractLinks(item.body).includes(note.title));
}

function unlinkedNotes() {
  return state.notes.filter((note) => !extractLinks(note.body).length && !backlinks(note).length);
}

function filteredNotes() {
  const query = state.query.trim().toLowerCase();
  return state.notes
    .filter((note) => {
      if (state.filter === "daily" && !note.daily) return false;
      if (state.filter === "pinned" && !note.pinned) return false;
      if (state.filter === "unlinked" && !unlinkedNotes().some((item) => item.id === note.id)) return false;
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

function addNote(input = {}) {
  const note = createNote({
    title: input.title ?? t("newIdea"),
    body: input.body ?? "",
    daily: Boolean(input.daily),
    pinned: Boolean(input.pinned),
  });
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
  if (!confirm(t("deleteConfirm", { title: note.title }))) return;
  state.notes = state.notes.filter((item) => item.id !== id);
  if (state.selectedId === id) state.selectedId = filteredNotes()[0]?.id ?? state.notes[0]?.id ?? "";
  saveState();
  render();
}

function updateSelected(patch) {
  const note = selectedNote();
  if (!note) return;
  Object.assign(note, patch, { updatedAt: Date.now() });
  queueSave();
  render(false);
}

function render(syncEditor = true) {
  setI18nLang(state.lang);
  applyI18n();
  renderTheme();
  renderShell();
  renderSidebar();
  renderViews(syncEditor);
  renderInsights();
}

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

function renderSidebar() {
  els.searchInput.value = state.query;
  els.countAll.textContent = state.notes.length;
  els.countDaily.textContent = state.notes.filter((note) => note.daily).length;
  els.countPinned.textContent = state.notes.filter((note) => note.pinned).length;
  els.countUnlinked.textContent = unlinkedNotes().length;
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.filter && !state.activeTag));

  els.tagList.replaceChildren();
  allTags().forEach(([tag, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-pill";
    button.classList.toggle("active", state.activeTag === tag);
    button.innerHTML = `<span>#${tag}</span><small>${count}</small>`;
    button.addEventListener("click", () => {
      state.activeTag = state.activeTag === tag ? "" : tag;
      state.filter = "all";
      saveState();
      render();
    });
    els.tagList.append(button);
  });

  els.noteList.replaceChildren();
  filteredNotes().forEach((note) => els.noteList.append(noteButton(note)));
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
    <small>${note.pinned ? "★ " : ""}${tags || t("untagged")} · ${timeAgo(note.updatedAt)}</small>
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
  renderLibrary();
  renderNetwork();
  renderReview();
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
    <span>${tags.length ? tags.map((tag) => `#${tag}`).join(" ") : t("noTags")}</span>
    <span>${new Date(note.updatedAt).toLocaleString(t("dateLocale"))}</span>
  `;
  document.querySelector("#pinToggle")?.addEventListener("click", () => updateSelected({ pinned: !note.pinned }));
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
      <span>${extractTags(note.body).map((tag) => `#${tag}`).join(" ") || t("untagged")}</span>
    `;
    card.addEventListener("click", () => selectNote(note.id));
    els.libraryGrid.append(card);
  });
}

function renderInsights() {
  const note = selectedNote();
  renderMiniList(els.relatedList, relatedNotes(note), t("emptyRelated"));
  renderPlainNotes(els.backlinkList, backlinks(note), t("emptyBacklinks"));
  renderSuggestions(note);
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

function renderPlainNotes(container, notes, emptyText) {
  renderMiniList(container, notes, emptyText);
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
  clusters.forEach(([tag, count]) => {
    const notes = state.notes.filter((note) => extractTags(note.body).includes(tag));
    const card = document.createElement("section");
    card.className = "cluster-card";
    card.innerHTML = `
      <strong>#${escapeHtml(tag)}</strong>
      <span>${t("noteCount", { n: count })}</span>
      <p>${notes.slice(0, 3).map((note) => note.title).join(" · ")}</p>
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

  const connections = state.notes
    .map((note) => ({ note, related: relatedNotes(note, 3) }))
    .filter((item) => item.related.length)
    .sort((a, b) => b.related.length - a.related.length)
    .slice(0, 6);
  els.strongConnections.replaceChildren();
  connections.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "connection-row";
    row.innerHTML = `<strong>${escapeHtml(item.note.title)}</strong><span>${item.related.map((rel) => rel.note.title).join(" · ")}</span>`;
    row.addEventListener("click", () => selectNote(item.note.id));
    els.strongConnections.append(row);
  });
  if (!connections.length) els.strongConnections.innerHTML = `<div class="empty-mini">${t("emptyConnections")}</div>`;

  els.orphanNotes.replaceChildren();
  unlinkedNotes().forEach((note) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "connection-row";
    row.innerHTML = `<strong>${escapeHtml(note.title)}</strong><span>${t("orphanHint")}</span>`;
    row.addEventListener("click", () => selectNote(note.id));
    els.orphanNotes.append(row);
  });
  if (!unlinkedNotes().length) els.orphanNotes.innerHTML = `<div class="empty-mini">${t("noOrphans")}</div>`;
}

function renderReview() {
  const resurfaced = state.notes
    .filter((note) => note.id !== state.selectedId)
    .sort((a, b) => a.updatedAt - b.updatedAt)[0];
  if (resurfaced) {
    els.memoryCard.innerHTML = `
      <span>${t("memoryTag")}</span>
      <strong>${t("memoryTitle", { title: escapeHtml(resurfaced.title) })}</strong>
      <p>${escapeHtml(snippet(resurfaced.body, 180))}</p>
      <button class="primary-btn" type="button" id="openMemory">${t("memoryOpen")}</button>
    `;
    document.querySelector("#openMemory")?.addEventListener("click", () => selectNote(resurfaced.id));
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
  relatedNotes(note, 5).forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "connection-row";
    row.innerHTML = `<strong>${escapeHtml(note.title)} ↔ ${escapeHtml(item.note.title)}</strong><span>${t("reviewAdd", { title: escapeHtml(item.note.title) })}</span>`;
    row.addEventListener("click", () => insertTextAtCursor(`[[${item.note.title}]]`));
    els.connectionReview.append(row);
  });
  if (!relatedNotes(note, 5).length) els.connectionReview.innerHTML = `<div class="empty-mini">${t("emptyReviewLinks")}</div>`;
}

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

function installGlassInteractions() {
  const selector = "button, input, textarea";
  document.addEventListener("pointermove", (event) => {
    const target = event.target.closest(selector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    target.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  });
}

els.railButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
els.navItems.forEach((item) => item.addEventListener("click", () => {
  state.filter = item.dataset.filter;
  state.activeTag = "";
  state.view = "library";
  saveState();
  render();
}));
els.searchInput.addEventListener("input", () => {
  state.query = els.searchInput.value;
  queueSave();
  render();
});
els.clearSearch.addEventListener("click", () => {
  state.query = "";
  state.activeTag = "";
  state.filter = "all";
  saveState();
  render();
});
els.newNote.addEventListener("click", () => addNote());
els.dailyNote.addEventListener("click", getOrCreateDailyNote);
els.noteTitle.addEventListener("input", () => updateSelected({ title: els.noteTitle.value.trim() || t("untitled") }));
els.noteBody.addEventListener("input", () => updateSelected({ body: els.noteBody.value }));
els.insertLink.addEventListener("click", () => {
  const note = selectedNote();
  const target = relatedNotes(note, 1)[0]?.note ?? state.notes.find((item) => item.id !== note?.id);
  insertTextAtCursor(target ? `[[${target.title}]]` : `[[${t("newLinkFallback")}]]`);
});
els.smartOrganize.addEventListener("click", smartOrganizeNote);
els.exportNote.addEventListener("click", exportSelectedNote);
els.exportAll.addEventListener("click", exportAllNotes);
els.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  render();
});
els.langToggle.addEventListener("click", () => {
  state.lang = state.lang === "zh" ? "en" : "zh";
  saveState();
  render();
});

function applyI18n() {
  applyStaticI18n();
  els.langToggle.textContent = t("switchTo");
}

installGlassInteractions();
saveState();
render();
