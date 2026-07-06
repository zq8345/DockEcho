// Echo engine v1: tokenization (Intl.Segmenter), TF-IDF + cosine similarity,
// and Today's Echo candidate selection. Pure logic — no DOM, no storage.

const ECHO_STOPWORDS = new Set([
  // en (~70)
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of", "to",
  "in", "on", "at", "by", "with", "from", "as", "is", "are", "was", "were", "be",
  "been", "it", "its", "this", "that", "these", "those", "i", "you", "we", "they",
  "he", "she", "my", "your", "our", "not", "no", "do", "does", "did", "can", "will",
  "about", "into", "out", "over", "what", "which", "when", "where", "how", "why",
  "than", "just", "only", "also", "very", "too", "their", "them", "there", "here",
  "would", "should", "could", "have", "has", "had", "being", "more", "most", "some",
  "any", "all", "one", "so", "up", "own", "them", "such",
  // zh (~40)
  "的", "了", "和", "是", "在", "我", "你", "他", "她", "它", "我们", "你们", "他们",
  "这", "那", "这个", "那个", "一个", "有", "没有", "不", "也", "都", "很", "就",
  "还", "而", "及", "与", "或", "被", "把", "让", "向", "从", "但", "并", "等",
  "着", "过", "吗", "呢", "吧", "啊", "如果", "因为", "所以", "但是", "而且",
  // import scaffolding — location markers and source tags carry no meaning
  "loc", "location", "page", "pos", "kindle", "readwise", "highlight",
]);

const echoSegmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "word" })
  : null;

function echoTokenize(text) {
  const lower = String(text ?? "").toLowerCase();
  const tokens = [];
  if (echoSegmenter) {
    for (const part of echoSegmenter.segment(lower)) {
      if (!part.isWordLike) continue;
      const word = part.segment.trim();
      if (!word || ECHO_STOPWORDS.has(word)) continue;
      if (word.length === 1 && !/[一-龥]/.test(word)) continue;
      if (/^\d+$/.test(word)) continue;
      tokens.push(word);
    }
    return tokens;
  }
  // Fallback without Intl.Segmenter: latin words + CJK bigrams.
  (lower.match(/[a-z][a-z0-9-]{1,}/g) ?? []).forEach((word) => {
    if (!ECHO_STOPWORDS.has(word)) tokens.push(word);
  });
  (lower.match(/[一-龥]+/g) ?? []).forEach((run) => {
    if (run.length === 1 && !ECHO_STOPWORDS.has(run)) tokens.push(run);
    for (let i = 0; i < run.length - 1; i += 1) {
      const bigram = run.slice(i, i + 2);
      if (!ECHO_STOPWORDS.has(bigram)) tokens.push(bigram);
    }
  });
  return tokens;
}

// TF-IDF index with per-note caches. Vectors are recomputed only when a note's
// updatedAt changes; IDF/norms only when the corpus version changes.
class EchoIndex {
  constructor() {
    this.docs = new Map(); // id -> { stamp, tf, weights, norm, weightsVersion }
    this.df = new Map();
    this.version = 0;
  }

  sync(notes) {
    let changed = false;
    const seen = new Set();
    notes.forEach((note) => {
      seen.add(note.id);
      const cached = this.docs.get(note.id);
      if (cached && cached.stamp === note.updatedAt) return;
      const tf = new Map();
      echoTokenize(`${note.title} ${note.body}`).forEach((token) => {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      });
      this.docs.set(note.id, { stamp: note.updatedAt, tf, weights: null, norm: 1, weightsVersion: -1 });
      changed = true;
    });
    [...this.docs.keys()].forEach((id) => {
      if (!seen.has(id)) {
        this.docs.delete(id);
        changed = true;
      }
    });
    if (changed) {
      this.version += 1;
      this.df.clear();
      this.docs.forEach(({ tf }) => {
        tf.forEach((_, term) => this.df.set(term, (this.df.get(term) ?? 0) + 1));
      });
    }
  }

  idf(term) {
    const df = this.df.get(term);
    return df ? Math.log(1 + this.docs.size / df) : 0;
  }

  vector(id) {
    const doc = this.docs.get(id);
    if (!doc) return null;
    if (doc.weightsVersion !== this.version) {
      const weights = new Map();
      let sum = 0;
      doc.tf.forEach((freq, term) => {
        const weight = (1 + Math.log(freq)) * this.idf(term);
        if (weight > 0) {
          weights.set(term, weight);
          sum += weight * weight;
        }
      });
      doc.weights = weights;
      doc.norm = Math.sqrt(sum) || 1;
      doc.weightsVersion = this.version;
    }
    return doc;
  }

  similarity(idA, idB) {
    if (idA === idB) return 0;
    const a = this.vector(idA);
    const b = this.vector(idB);
    if (!a || !b || !a.weights.size || !b.weights.size) return 0;
    const [small, large] = a.weights.size <= b.weights.size ? [a, b] : [b, a];
    let dot = 0;
    small.weights.forEach((weight, term) => {
      const other = large.weights.get(term);
      if (other) dot += weight * other;
    });
    return dot / (a.norm * b.norm);
  }

  sharedTerms(idA, idB, limit = 3) {
    const a = this.vector(idA);
    const b = this.vector(idB);
    if (!a || !b) return [];
    const shared = [];
    const [small, large] = a.weights.size <= b.weights.size ? [a, b] : [b, a];
    small.weights.forEach((weight, term) => {
      const other = large.weights.get(term);
      if (other) shared.push([term, weight * other]);
    });
    return shared.sort((x, y) => y[1] - x[1]).slice(0, limit).map(([term]) => term);
  }

  topTerms(id, limit = 10) {
    const doc = this.vector(id);
    if (!doc) return [];
    return [...doc.weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term]) => term);
  }
}

const ECHO_DAY = 86400000;
const ECHO_REL_THRESHOLD = 0.1; // below this, no card today — silence over noise
const ECHO_REPEAT_COOLDOWN_DAYS = 30;
const ECHO_DISMISS_OVERLAP = 0.3;

function echoMinAgeDays(notes, now) {
  const oldest = Math.min(...notes.map((note) => note.createdAt));
  const libraryAgeDays = (now - oldest) / ECHO_DAY;
  if (libraryAgeDays < 7) return 1;
  if (libraryAgeDays < 30) return 3;
  return 14;
}

function echoContextOverlap(termsA, termsB) {
  if (!termsA.length || !termsB.length) return 0;
  const setB = new Set(termsB);
  const hits = termsA.filter((term) => setB.has(term)).length;
  return hits / Math.min(termsA.length, termsB.length);
}

const ECHO_MIN_ONTHISDAY_CHARS = 40;

// "N years ago today": the strongest emotional hook. A note created N years ago
// (±1 day) on today's date, with substantial content, outranks the relevance
// channel — but still respects the one-card-a-day and cooldown rules.
function pickOnThisDay({ notes, meta, now, excludeId = null }) {
  const today = new Date(now);
  const candidates = [];
  notes.forEach((note) => {
    if (!note.createdAt) return;
    if (note.id === excludeId) return; // never echo the note you're editing
    if ((meta.snoozed?.[note.id] ?? 0) > now) return;
    const lastShown = meta.history?.[note.id] ?? 0;
    if (now - lastShown < ECHO_REPEAT_COOLDOWN_DAYS * ECHO_DAY) return;
    const body = String(note.body ?? "").replace(/\s+/g, "");
    if (body.length < ECHO_MIN_ONTHISDAY_CHARS) return;
    const created = new Date(note.createdAt);
    const years = today.getFullYear() - created.getFullYear();
    if (years < 1) return;
    // Match calendar day within ±1 day (handles leap days and timezone drift).
    const anniversary = new Date(created);
    anniversary.setFullYear(today.getFullYear());
    const dayGap = Math.abs((today - anniversary) / ECHO_DAY);
    if (dayGap <= 1.0) candidates.push({ note, years });
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.years - a.years);
  return candidates[0];
}

// meta shape: { lastDate, lastNoteId, closedDate, history: {noteId: lastShownTs},
//               snoozed: {noteId: untilTs}, dismissed: {noteId: [ [terms...] ]} }
// semanticSim(idA, idB) -> number|null lets the on-device model drive candidate
// selection when it's ready; null falls back to TF-IDF per pair.
function pickTodayEcho({ notes, index, meta, now, contextIds, excludeId = null, semanticSim = null }) {
  if (notes.length < 2 || !contextIds.length) return null;
  index.sync(notes);

  // On-this-day channel takes priority when it has something worthy.
  const anniversary = pickOnThisDay({ notes, meta, now, excludeId });
  if (anniversary) {
    return {
      note: anniversary.note,
      relevance: 1,
      onThisDayYears: anniversary.years,
      bestContextId: null,
      sharedTerms: [],
      contextTerms: [],
    };
  }

  const minAge = echoMinAgeDays(notes, now);
  const contextTerms = contextIds.flatMap((id) => index.topTerms(id, 6));
  const candidates = [];
  notes.forEach((note) => {
    if (contextIds.includes(note.id)) return;
    const ageDays = (now - note.createdAt) / ECHO_DAY;
    if (ageDays < minAge) return;
    if ((meta.snoozed?.[note.id] ?? 0) > now) return;
    const lastShown = meta.history?.[note.id] ?? 0;
    if (now - lastShown < ECHO_REPEAT_COOLDOWN_DAYS * ECHO_DAY) return;
    const dismissContexts = meta.dismissed?.[note.id] ?? [];
    if (dismissContexts.some((terms) => echoContextOverlap(terms, contextTerms) >= ECHO_DISMISS_OVERLAP)) return;

    let best = 0;
    let bestContextId = null;
    let sum = 0;
    contextIds.forEach((contextId) => {
      const semScore = semanticSim ? semanticSim(contextId, note.id) : null;
      const sim = semScore !== null && semScore !== undefined ? semScore : index.similarity(contextId, note.id);
      sum += sim;
      if (sim > best) {
        best = sim;
        bestContextId = contextId;
      }
    });
    const relevance = 0.7 * best + 0.3 * (sum / contextIds.length);
    if (relevance < ECHO_REL_THRESHOLD) return;
    const staleDays = (now - note.updatedAt) / ECHO_DAY;
    const ageWeight = 1 + Math.min(1.5, staleDays / 180);
    candidates.push({ note, relevance, score: relevance * ageWeight, bestContextId });
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  return {
    note: winner.note,
    relevance: winner.relevance,
    bestContextId: winner.bestContextId,
    sharedTerms: index.sharedTerms(winner.bestContextId, winner.note.id, 3),
    contextTerms,
  };
}
