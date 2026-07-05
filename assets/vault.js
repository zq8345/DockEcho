// Vault layer: File System Access API. Red lines enforced here:
// - only writeVaultNote()/createVaultNote() ever write user .md files, and app.js
//   calls them only for notes edited inside DockEcho;
// - deletion never removes bytes — trashVaultNote() moves files into .trash/;
// - DockEcho metadata lives in .dockecho/meta.json, never inside user files.

const VAULT_META_DIR = ".dockecho";
const VAULT_META_FILE = "meta.json";
const VAULT_TRASH_DIR = ".trash";
const VAULT_IDB_NAME = "dockecho.vault.v1";
const VAULT_IDB_STORE = "handles";
const VAULT_IDB_KEY = "vaultDir";

function vaultSupported() {
  return typeof window.showDirectoryPicker === "function";
}

function vaultIdb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(VAULT_IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function vaultStoreHandle(handle) {
  try {
    const db = await vaultIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_IDB_STORE, "readwrite");
      tx.objectStore(VAULT_IDB_STORE).put(handle, VAULT_IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Persistence is best-effort; mounting still works for this session.
  }
}

async function vaultLoadHandle() {
  try {
    const db = await vaultIdb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_IDB_STORE, "readonly");
      const req = tx.objectStore(VAULT_IDB_STORE).get(VAULT_IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

async function vaultForgetHandle() {
  try {
    const db = await vaultIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_IDB_STORE, "readwrite");
      tx.objectStore(VAULT_IDB_STORE).delete(VAULT_IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

async function vaultQueryPermission(handle) {
  if (typeof handle.queryPermission !== "function") return "granted";
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
}

// Must be called from a user gesture when permission state is "prompt".
async function vaultEnsurePermission(handle) {
  const current = await vaultQueryPermission(handle);
  if (current === "granted") return true;
  if (typeof handle.requestPermission !== "function") return false;
  try {
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

async function vaultPickFolder() {
  return showDirectoryPicker({ id: "dockecho-vault", mode: "readwrite" });
}

// Recursively collect *.md files. Skips every directory and file whose name
// starts with "." (.obsidian, .trash, .dockecho, .git, dotfiles...).
async function vaultScan(root) {
  const files = [];
  async function walk(dir, prefix) {
    for await (const [name, entry] of dir.entries()) {
      if (name.startsWith(".")) continue;
      if (entry.kind === "directory") {
        await walk(entry, `${prefix}${name}/`);
      } else if (/\.md$/i.test(name)) {
        const file = await entry.getFile();
        files.push({
          path: `${prefix}${name}`,
          title: name.replace(/\.md$/i, ""),
          body: await file.text(),
          lastModified: file.lastModified,
        });
      }
    }
  }
  await walk(root, "");
  files.sort((a, b) => b.lastModified - a.lastModified);
  return files;
}

async function vaultDirByPath(root, segments, create = false) {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

async function vaultFileExists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function vaultUniqueName(dir, base) {
  let name = `${base}.md`;
  let counter = 2;
  while (await vaultFileExists(dir, name)) {
    name = `${base} ${counter}.md`;
    counter += 1;
  }
  return name;
}

async function vaultWriteFile(root, path, content) {
  const segments = path.split("/");
  const name = segments.pop();
  const dir = await vaultDirByPath(root, segments, true);
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// Write back a note that was edited inside DockEcho. Returns the (possibly new)
// path — a title change renames the file (create new, remove old).
async function vaultWriteNote(root, note, previousPath) {
  const segments = previousPath.split("/");
  const previousName = segments.pop();
  const dir = await vaultDirByPath(root, segments, true);
  const wantedBase = vaultSafeName(note.title);
  const previousBase = previousName.replace(/\.md$/i, "");
  let name = previousName;
  if (wantedBase !== previousBase) {
    name = await vaultUniqueName(dir, wantedBase);
  }
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(note.body);
  await writable.close();
  if (name !== previousName) {
    try {
      await dir.removeEntry(previousName);
    } catch {
      // Old file already gone; nothing to clean up.
    }
  }
  return [...segments, name].join("/");
}

async function vaultCreateNote(root, title, body) {
  const name = await vaultUniqueName(root, vaultSafeName(title));
  await vaultWriteFile(root, name, body);
  return name;
}

// Deletion red line: copy into .trash/ then remove the original. Never a hard delete.
async function vaultTrashNote(root, path) {
  const segments = path.split("/");
  const name = segments.pop();
  const dir = await vaultDirByPath(root, segments, false);
  const fileHandle = await dir.getFileHandle(name);
  const content = await (await fileHandle.getFile()).text();
  const trash = await root.getDirectoryHandle(VAULT_TRASH_DIR, { create: true });
  const trashName = await vaultUniqueName(trash, name.replace(/\.md$/i, ""));
  await vaultWriteFile(trash, trashName, content);
  await dir.removeEntry(name);
}

async function vaultReadMeta(root) {
  try {
    const dir = await root.getDirectoryHandle(VAULT_META_DIR);
    const fileHandle = await dir.getFileHandle(VAULT_META_FILE);
    const parsed = JSON.parse(await (await fileHandle.getFile()).text());
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function vaultWriteMeta(root, meta) {
  const dir = await root.getDirectoryHandle(VAULT_META_DIR, { create: true });
  const fileHandle = await dir.getFileHandle(VAULT_META_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(meta, null, 2));
  await writable.close();
}

function vaultSafeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+/, "").trim().slice(0, 80) || "note";
}
