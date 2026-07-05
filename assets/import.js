// Importers: Kindle My Clippings.txt, Readwise CSV, Markdown batch.
// Pure parsers — no DOM, no storage, nothing ever leaves the device.

const IMPORT_DAY = 86400000;

// ---------- Kindle My Clippings.txt ----------
// Entries separated by "==========". Entry shape:
//   Book Title (Author)
//   - Your Highlight on Location 123-125 | Added on Friday, March 3, 2023 ...
//   <blank>
//   Highlight text
// Chinese-device variants ("您在位置 #123 的标注 | 添加于 ...") are handled too.
function parseKindleClippings(text) {
  const entries = String(text).replace(/^﻿/, "").split(/\r?\n==========\s*/);
  const books = new Map();
  entries.forEach((entry) => {
    const lines = entry.split(/\r?\n/).map((line) => line.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length < 2) return;
    const titleLine = lines[0].replace(/^﻿/, "");
    const metaLine = lines[1];
    if (!/^-|^–/.test(metaLine)) return;
    if (/bookmark|书签/i.test(metaLine)) return; // bookmarks carry no text
    const content = lines.slice(2).join("\n").trim();
    if (!content) return;

    const authorMatch = titleLine.match(/^(.*?)\s*[（(]([^（()）]+)[)）]\s*$/);
    const title = (authorMatch ? authorMatch[1] : titleLine).trim() || "Kindle";
    const author = authorMatch ? authorMatch[2].trim() : "";
    const location = metaLine.match(/(?:location|位置)\s*#?\s*([\d-]+)/i)?.[1] ?? "";
    const page = metaLine.match(/(?:page|第)\s*([\d-]+)\s*(?:页)?/i)?.[1] ?? "";
    const dateText = metaLine.match(/(?:Added on|添加于)\s*(.+)$/i)?.[1] ?? "";
    const stamp = dateText ? Date.parse(dateText.replace(/，/g, ", ")) : NaN;
    const isNote = /your note|的笔记/i.test(metaLine);

    if (!books.has(title)) books.set(title, { title, author, items: [] });
    books.get(title).items.push({
      content,
      location,
      page,
      stamp: Number.isFinite(stamp) ? stamp : null,
      isNote,
    });
  });

  return [...books.values()].map((book) => {
    const stamps = book.items.map((item) => item.stamp).filter(Boolean);
    const body = book.items.map((item) => {
      const where = item.location ? ` · Loc ${item.location}` : item.page ? ` · p.${item.page}` : "";
      return item.isNote ? `· ${item.content}${where}` : `> ${item.content}${where}`;
    }).join("\n\n");
    return {
      title: book.title,
      body: `${body}\n\n${book.author ? `— ${book.author}\n\n` : ""}#kindle`,
      createdAt: stamps.length ? Math.min(...stamps) : Date.now() - 120 * IMPORT_DAY,
      updatedAt: stamps.length ? Math.max(...stamps) : Date.now() - 30 * IMPORT_DAY,
      source: book.title,
    };
  });
}

// ---------- Readwise CSV ----------
// RFC 4180-ish parser: quoted fields, embedded commas/newlines/double-quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text).replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function parseReadwiseCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const col = (...names) => header.findIndex((name) => names.includes(name));
  const highlightCol = col("highlight", "highlights", "text");
  const titleCol = col("book title", "title", "book");
  const authorCol = col("book author", "author");
  const noteCol = col("note", "notes");
  const dateCol = col("highlighted at", "date", "highlighted_at");
  if (highlightCol === -1 || titleCol === -1) return null; // wrong shape → parse error

  const books = new Map();
  rows.slice(1).forEach((row) => {
    const highlight = (row[highlightCol] ?? "").trim();
    if (!highlight) return;
    const title = (row[titleCol] ?? "").trim() || "Readwise";
    const author = authorCol !== -1 ? (row[authorCol] ?? "").trim() : "";
    const note = noteCol !== -1 ? (row[noteCol] ?? "").trim() : "";
    const stamp = dateCol !== -1 ? Date.parse(row[dateCol] ?? "") : NaN;
    if (!books.has(title)) books.set(title, { title, author, items: [] });
    books.get(title).items.push({ highlight, note, stamp: Number.isFinite(stamp) ? stamp : null });
  });

  return [...books.values()].map((book) => {
    const stamps = book.items.map((item) => item.stamp).filter(Boolean);
    const body = book.items.map((item) => {
      return `> ${item.highlight}${item.note ? `\n· ${item.note}` : ""}`;
    }).join("\n\n");
    return {
      title: book.title,
      body: `${body}\n\n${book.author ? `— ${book.author}\n\n` : ""}#readwise`,
      createdAt: stamps.length ? Math.min(...stamps) : Date.now() - 120 * IMPORT_DAY,
      updatedAt: stamps.length ? Math.max(...stamps) : Date.now() - 30 * IMPORT_DAY,
      source: book.title,
    };
  });
}

// ---------- Markdown files ----------
async function parseMarkdownFiles(files) {
  const notes = [];
  for (const file of files) {
    const body = (await file.text()).trim();
    if (!body) continue;
    notes.push({
      title: file.name.replace(/\.md$/i, "") || "Note",
      body,
      createdAt: file.lastModified || Date.now(),
      updatedAt: file.lastModified || Date.now(),
      source: file.name,
    });
  }
  return notes;
}
