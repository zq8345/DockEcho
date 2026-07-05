// Migration parsers: Notion, Evernote (ENEX), Day One, Roam, Google Keep, Bear.
// Plus a zero-dependency ZIP reader (DecompressionStream) and a format detector.
// Everything runs locally; nothing is uploaded. Timestamp fidelity is a red line —
// every parser preserves original created/updated dates when the source has them.

const MIG_DAY = 86400000;

/* ---------------- minimal ZIP reader ---------------- */
// Supports stored (0) and deflate (8) via native DecompressionStream. Reads the
// end-of-central-directory to enumerate entries — robust to the data-descriptor
// quirk that makes local-header sizes unreliable in many real exports.

async function zipRead(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocd = zipFindEocd(bytes, view);
  if (!eocd) throw new Error("zip: no end-of-central-directory");
  const files = [];
  let ptr = eocd.cdOffset;
  for (let i = 0; i < eocd.count; i += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = zipDecodeName(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;

    // Local header: recompute the data start (its name/extra lengths can differ).
    const lhNameLen = view.getUint16(localOffset + 26, true);
    const lhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    files.push({ name, method, comp });
  }
  const out = [];
  for (const f of files) {
    try {
      out.push({ name: f.name, bytes: await zipInflate(f.comp, f.method) });
    } catch {
      // Skip an entry we can't decompress rather than failing the whole import.
    }
  }
  return out;
}

function zipFindEocd(bytes, view) {
  // EOCD signature 0x06054b50, scanning back over the (usually empty) comment.
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      return {
        count: view.getUint16(i + 10, true),
        cdOffset: view.getUint32(i + 16, true),
      };
    }
  }
  return null;
}

function zipDecodeName(sub) {
  return new TextDecoder("utf-8").decode(sub);
}

async function zipInflate(comp, method) {
  if (method === 0) return comp.slice();
  if (method === 8) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("zip: DecompressionStream unavailable");
    }
    const stream = new Response(new Blob([comp])).body.pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`zip: unsupported method ${method}`);
}

function zipText(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

/* ---------------- helpers ---------------- */

function migStripHtml(html) {
  // en-note / Keep HTML → light Markdown. Block tags become newlines; the rest
  // is stripped. Kept deliberately small — no dependency, good enough for notes.
  let text = String(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

function migSafeDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    // Day One / Keep use seconds or microseconds; normalize to ms.
    if (value > 1e15) return Math.round(value / 1000); // microseconds
    if (value < 1e12) return Math.round(value * 1000); // seconds
    return value;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function migTitleFromBody(body, fallback) {
  const firstLine = String(body).split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!firstLine) return fallback;
  return firstLine.replace(/^#+\s*/, "").slice(0, 100);
}

function migNote({ title, body, createdAt, updatedAt, tags = [], source, sourceTag }) {
  const tagLine = [...new Set([...tags, sourceTag].filter(Boolean))].map((t2) => `#${t2}`).join(" ");
  const fullBody = tagLine ? `${String(body).trim()}\n\n${tagLine}` : String(body).trim();
  const created = migSafeDate(createdAt);
  const updated = migSafeDate(updatedAt);
  return {
    title: (title || "").trim() || source || "Note",
    body: fullBody,
    createdAt: created ?? updated ?? null,
    updatedAt: updated ?? created ?? null,
    source: source || title,
  };
}

/* ---------------- Notion / Bear (markdown-in-zip) ---------------- */
// Notion export files are named "Title <32-hex id>.md"; Bear exports are plain
// "Title.md". Detect which app by whether any file carries the Notion id, tag
// accordingly, and strip the id from Notion titles. CSV databases are skipped.

const NOTION_ID_RE = /\s+[0-9a-f]{16,}$/i;

function migParseMdFile(name, text, sourceTag) {
  const base = name.split("/").pop().replace(/\.md$/i, "");
  const title = sourceTag === "notion" ? (base.replace(NOTION_ID_RE, "").trim() || base) : base;
  const createdMatch = text.match(/^\s*Created:\s*(.+)$/im);
  const body = text.replace(/^#\s+.*\r?\n/, "");
  return migNote({
    title,
    body,
    createdAt: createdMatch ? createdMatch[1] : null,
    updatedAt: createdMatch ? createdMatch[1] : null,
    source: title,
    sourceTag,
  });
}

async function migParseMdZip(entries) {
  const mdEntries = entries.filter((e) => /\.md$/i.test(e.name));
  const isNotion = mdEntries.some((e) => NOTION_ID_RE.test(e.name.split("/").pop().replace(/\.md$/i, "")));
  const sourceTag = isNotion ? "notion" : "bear";
  const notes = [];
  let skippedDbs = 0;
  for (const entry of entries) {
    if (/\.csv$/i.test(entry.name)) {
      skippedDbs += 1;
      continue;
    }
    if (!/\.md$/i.test(entry.name)) continue;
    const text = zipText(entry.bytes);
    if (!text.trim()) continue;
    notes.push(migParseMdFile(entry.name, text, sourceTag));
  }
  return { notes, skipped: skippedDbs, skippedKind: "database CSV" };
}

/* ---------------- Evernote ENEX ---------------- */

function migParseEnex(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("enex: invalid XML");
  const notes = [];
  let skippedAttachments = 0;
  doc.querySelectorAll("note").forEach((node) => {
    const title = node.querySelector("title")?.textContent ?? "";
    const created = node.querySelector("created")?.textContent ?? "";
    const updated = node.querySelector("updated")?.textContent ?? "";
    const tags = [...node.querySelectorAll("tag")].map((t2) => t2.textContent.trim()).filter(Boolean);
    skippedAttachments += node.querySelectorAll("resource").length;
    const content = node.querySelector("content")?.textContent ?? "";
    const body = migStripHtml(content);
    if (!body && !title) return;
    notes.push(migNote({
      title,
      body,
      createdAt: migEnexDate(created),
      updatedAt: migEnexDate(updated) ?? migEnexDate(created),
      tags,
      source: title,
      sourceTag: "evernote",
    }));
  });
  return { notes, skipped: skippedAttachments, skippedKind: "attachment" };
}

function migEnexDate(raw) {
  // ENEX: 20230115T091500Z
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return migSafeDate(raw);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/* ---------------- Day One JSON ---------------- */

function migParseDayOne(jsonText) {
  const data = JSON.parse(jsonText);
  const entries = data.entries ?? data;
  if (!Array.isArray(entries)) throw new Error("dayone: no entries array");
  const notes = entries.map((entry) => {
    const text = entry.text ?? entry.richText ?? "";
    const body = migStripHtml(text.includes("<") ? text : text);
    return migNote({
      title: migTitleFromBody(body, entry.creationDate ? String(entry.creationDate).slice(0, 10) : "Journal"),
      body,
      createdAt: entry.creationDate,
      updatedAt: entry.modifiedDate ?? entry.creationDate,
      tags: entry.tags ?? [],
      source: "Day One",
      sourceTag: "dayone",
    });
  });
  return { notes, skipped: 0 };
}

/* ---------------- Roam JSON ---------------- */

function migParseRoam(jsonText) {
  const pages = JSON.parse(jsonText);
  if (!Array.isArray(pages)) throw new Error("roam: expected array of pages");
  const notes = pages.map((page) => {
    const lines = [];
    const walk = (children, depth) => {
      (children ?? []).forEach((block) => {
        if (block.string) lines.push(`${"  ".repeat(depth)}- ${block.string}`);
        if (block.children) walk(block.children, depth + 1);
      });
    };
    walk(page.children, 0);
    return migNote({
      title: page.title ?? "Page",
      body: lines.join("\n"),
      createdAt: page["create-time"] ?? page.createTime,
      updatedAt: page["edit-time"] ?? page.editTime ?? page["create-time"],
      source: page.title,
      sourceTag: "roam",
    });
  }).filter((note) => note.body || note.title);
  return { notes, skipped: 0 };
}

/* ---------------- Google Keep Takeout ---------------- */

function migParseKeep(jsonText) {
  const data = JSON.parse(jsonText);
  const notes = [];
  const one = (n) => {
    if (n.isTrashed) return;
    const body = n.textContent ?? migStripHtml(n.textContentHtml ?? "") ??
      (n.listContent ? n.listContent.map((i) => `- ${i.text}`).join("\n") : "");
    const tags = (n.labels ?? []).map((l) => l.name).filter(Boolean);
    notes.push(migNote({
      title: n.title || migTitleFromBody(body, "Note"),
      body: body || "",
      createdAt: n.createdTimestampUsec,
      updatedAt: n.userEditedTimestampUsec ?? n.createdTimestampUsec,
      tags,
      source: "Keep",
      sourceTag: "keep",
    }));
  };
  if (Array.isArray(data)) data.forEach(one);
  else one(data);
  return { notes, skipped: 0 };
}

/* ---------------- format detection + dispatch ---------------- */
// Detect by content first (robust to wrong extensions), extension as a hint.

async function migDetectAndParse(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) return migParseZipArchive(file);
  if (name.endsWith(".enex")) return migParseEnex(await file.text());

  const text = await file.text();
  const head = text.slice(0, 4000).trimStart();

  if (name.endsWith(".enex") || head.startsWith("<?xml") && /<en-export|<note>/.test(head)) {
    return migParseEnex(text);
  }
  if (name.endsWith(".json") || head.startsWith("{") || head.startsWith("[")) {
    return migDispatchJson(text);
  }
  if (name.endsWith(".csv") || /^[^\n]*,[^\n]*,/.test(head)) {
    const notes = parseReadwiseCsv(text);
    if (notes === null) throw new Error("csv: unrecognized columns");
    return { notes, skipped: 0 };
  }
  if (/==========/.test(text)) {
    return { notes: parseKindleClippings(text), skipped: 0 };
  }
  // default: treat as a single markdown/plain note (skip if empty)
  if (!text.trim()) return { notes: [], skipped: 0 };
  return {
    notes: [migNote({
      title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
      body: text,
      createdAt: file.lastModified,
      updatedAt: file.lastModified,
      source: file.name,
    })],
    skipped: 0,
  };
}

function migDispatchJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("json: could not parse");
  }
  // Roam: array of pages with title + children
  if (Array.isArray(data) && data.some((p) => p && "title" in p && ("children" in p || "create-time" in p))) {
    return migParseRoam(text);
  }
  // Day One: object with entries[]
  if (data && Array.isArray(data.entries)) return migParseDayOne(text);
  // Keep single note: has textContent + timestamps
  if (data && ("textContent" in data || "listContent" in data) && "createdTimestampUsec" in data) {
    return migParseKeep(text);
  }
  if (Array.isArray(data) && data.some((n) => n && "createdTimestampUsec" in n)) {
    return migParseKeep(text);
  }
  throw new Error("json: unrecognized structure");
}

async function migParseZipArchive(file) {
  let entries;
  try {
    entries = await zipRead(await file.arrayBuffer());
  } catch {
    // Compression variant we don't handle — ask the user to unzip first.
    const err = new Error("zip-unsupported");
    err.code = "zip-unsupported";
    throw err;
  }
  const hasEnex = entries.find((e) => /\.enex$/i.test(e.name));
  if (hasEnex) return migParseEnex(zipText(hasEnex.bytes));
  const jsons = entries.filter((e) => /\.json$/i.test(e.name));
  for (const j of jsons) {
    try {
      return migDispatchJson(zipText(j.bytes));
    } catch {
      // not a recognized json; keep looking
    }
  }
  // Notion / Bear / generic markdown zip
  const mdCount = entries.filter((e) => /\.md$/i.test(e.name)).length;
  if (mdCount) return migParseMdZip(entries);
  const err = new Error("zip-no-notes");
  err.code = "zip-no-notes";
  throw err;
}
