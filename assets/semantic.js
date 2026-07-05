// Semantic echoes v0 — opt-in, on-device. EXPERIMENTAL.
//
// Hard rules (all enforced here):
// - Loads nothing third-party until the user turns it on. This file is first-party
//   and zero-dependency; transformers.js is dynamically imported from a CDN only
//   inside semanticEnable().
// - Note content never leaves the device: the only network request is downloading
//   the model weights. Inference is local (WASM/WebGPU via transformers.js).
// - Embeddings are a rebuildable cache in IndexedDB — deleting them loses nothing.
// - Any failure degrades to TF-IDF; never throws into the caller.

const SEMANTIC_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"; // zh + en
const SEMANTIC_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
const SEMANTIC_IDB = "dockecho.semantic.v1";
const SEMANTIC_STORE = "vectors";
const SEMANTIC_ENABLE_TIMEOUT = 120000; // don't hang forever on a stalled download

const semantic = {
  status: "off", // off | loading | ready | failed
  extractor: null,
  vectors: new Map(), // noteId -> { stamp, vec: Float32Array }
  onStatus: null,
};

function semanticState() {
  return semantic.status;
}

function semanticReady() {
  return semantic.status === "ready";
}

function semanticSetStatus(status) {
  semantic.status = status;
  try {
    semantic.onStatus?.(status);
  } catch {
    // status listener must never break the pipeline
  }
}

/* ---------- IndexedDB rebuildable cache ---------- */

function semanticIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SEMANTIC_IDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SEMANTIC_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function semanticCacheGet(id) {
  try {
    const db = await semanticIdb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(SEMANTIC_STORE, "readonly");
      const r = tx.objectStore(SEMANTIC_STORE).get(id);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

async function semanticCachePut(id, record) {
  try {
    const db = await semanticIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SEMANTIC_STORE, "readwrite");
      tx.objectStore(SEMANTIC_STORE).put(record, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // cache is best-effort; inference still works this session without it
  }
}

/* ---------- math ---------- */

function semanticCosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function semanticSimilarity(idA, idB) {
  if (semantic.status !== "ready") return null;
  const a = semantic.vectors.get(idA)?.vec;
  const b = semantic.vectors.get(idB)?.vec;
  if (!a || !b) return null;
  return semanticCosine(a, b);
}

function semanticNoteText(note) {
  return `${note.title}\n${note.body}`.slice(0, 4000);
}

async function semanticEmbed(text) {
  if (!semantic.extractor) return null;
  const output = await semantic.extractor(text, { pooling: "mean", normalize: true });
  return Float32Array.from(output.data);
}

/* ---------- idle-batched embedding build ---------- */

function semanticIdle() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 500 });
    else setTimeout(resolve, 16);
  });
}

// Embed any notes whose cache is missing/stale. Runs in idle slices so typing on
// a few hundred notes doesn't freeze.
async function semanticBuild(notes) {
  for (const note of notes) {
    if (semantic.status !== "ready" && semantic.status !== "loading") return;
    const existing = semantic.vectors.get(note.id);
    if (existing && existing.stamp === note.updatedAt) continue;
    let record = await semanticCacheGet(note.id);
    if (!record || record.stamp !== note.updatedAt) {
      try {
        const vec = await semanticEmbed(semanticNoteText(note));
        if (!vec) continue;
        record = { stamp: note.updatedAt, vec: Array.from(vec) };
        await semanticCachePut(note.id, record);
      } catch {
        continue;
      }
    }
    semantic.vectors.set(note.id, { stamp: record.stamp, vec: Float32Array.from(record.vec) });
    await semanticIdle();
  }
}

/* ---------- enable / disable ---------- */

function semanticSupported() {
  return typeof indexedDB !== "undefined" && typeof WebAssembly !== "undefined";
}

// Turn the feature on: lazily pull transformers.js from the CDN, load the model,
// then embed the library. Returns true on success; on any failure sets status
// "failed" and returns false so the caller falls back to TF-IDF.
async function semanticEnable(notes, onStatus) {
  semantic.onStatus = onStatus ?? semantic.onStatus;
  if (!semanticSupported()) {
    semanticSetStatus("failed");
    return false;
  }
  if (semantic.status === "ready") {
    semanticBuild(notes);
    return true;
  }
  semanticSetStatus("loading");
  try {
    const load = (async () => {
      const mod = await import(/* @vite-ignore */ SEMANTIC_CDN);
      if (mod.env?.allowLocalModels !== undefined) mod.env.allowLocalModels = false;
      // q8 quantized weights keep the download small (~30MB) and run on WASM.
      semantic.extractor = await mod.pipeline("feature-extraction", SEMANTIC_MODEL, { dtype: "q8" });
    })();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("semantic: enable timeout")), SEMANTIC_ENABLE_TIMEOUT));
    await Promise.race([load, timeout]);
  } catch (error) {
    console.warn("DockEcho semantic layer unavailable, using TF-IDF", error?.message ?? error);
    semantic.extractor = null;
    semanticSetStatus("failed");
    return false;
  }
  semanticSetStatus("ready");
  semanticBuild(notes); // fire-and-forget idle build
  return true;
}

function semanticDisable() {
  semanticSetStatus("off");
  // Keep the extractor and cache so re-enabling is instant; just stop fusing.
}
