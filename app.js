// --- Multi-collection PWA + local data store ---
// Item format:
// { id, title, category: "confirmed"|"unverified", code, variant, stars (0-5), sources, notes, owned(bool), wanted(bool) }

const DEFAULTS_DIR = "./defaults/";

// 1) Legg til nye samlinger her
// 2) Du trenger IKKE å skrive defaultCsv; den blir automatisk ./defaults/<id>.csv
const COLLECTIONS = {
  // TV-spill
  "nes": { title: "NES – Samleliste", sub: "Nintendo Entertainment System. Lagrer lokalt på enheten.", storageKey: "col_nes_v1" },
  "snes": { title: "SNES – Samleliste", sub: "Super Nintendo. Default CSV kan legges til senere.", storageKey: "col_snes_v1" },
  "ps1": { title: "PS1 – Samleliste", sub: "PlayStation 1. Default CSV kan legges til senere.", storageKey: "col_ps1_v1" },
  "ps2": { title: "PS2 – Samleliste", sub: "PlayStation 2. Default CSV kan legges til senere.", storageKey: "col_ps2_v1" },
  "mastersystem": { title: "Sega Master System – Samleliste", sub: "Sega 8-bit. Default CSV kan legges til senere.", storageKey: "col_mastersystem_v1" },

  // Tegneserier
  "comics-conan": { title: "Tegneserier – Conan", sub: "Conan-samling. Lagrer lokalt på enheten.", storageKey: "col_comics_conan_v1" },
  "comics-nintendo-magasin": { title: "Tegneserier – Nintendo Magasin", sub: "Nintendo Magasin-samling. Default CSV kan legges til senere.", storageKey: "col_comics_nintendo_magasin_v1" },
  "comics-action-force": { title: "Tegneserier – Action Force", sub: "Action Force-samling. Default CSV kan legges til senere.", storageKey: "col_comics_action_force_v1" },
  "comics-transformers": { title: "Tegneserier – Transformers", sub: "Transformers-samling. Default CSV kan legges til senere.", storageKey: "col_comics_transformers_v1" },
  "comics-turtles": { title: "Tegneserier – Turtles", sub: "Turtles-samling. Default CSV kan legges til senere.", storageKey: "col_comics_turtles_v1" },
  "comics-star-wars": { title: "Tegneserier – Star Wars", sub: "Star Wars-samling. Default CSV kan legges til senere.", storageKey: "col_comics_star_wars_v1" },
};

function getCollectionId(){
  const p = new URLSearchParams(location.search);
  return (p.get("c") || "").trim();
}
function getCollectionConfig(){
  const id = getCollectionId();
  return COLLECTIONS[id] || null;
}
function defaultCsvFor(id){
  return `${DEFAULTS_DIR}${id}.csv`;
}

const collection = getCollectionConfig();
if(!collection){
  // Åpnet collection.html uten ?c=...
  location.replace("index.html");
}

document.getElementById("collectionTitle")?.replaceChildren(document.createTextNode(collection.title));
document.getElementById("collectionSub")?.replaceChildren(document.createTextNode(collection.sub));

const STORAGE_KEY = collection.storageKey;
const LAST_BACKUP_KEY = `last_backup__${STORAGE_KEY}`;

// Fallback data (kun hvis noe går helt galt)
const defaultData = [
  {
    id: crypto.randomUUID(),
    title: "Eksempel",
    category: "confirmed",
    code: "",
    variant: "",
    stars: 0,
    sources: "",
    notes: "",
    owned: false,
    wanted: false
  }
];

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return [];
  try{
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch{
    return [];
  }
}
function saveData(items){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const el = (id) => document.getElementById(id);

const qEl = el("q");
const statsEl = el("stats");
const lastBackupEl = el("lastBackup");
const progressFillEl = el("progressFill");
const tableWrap = el("tableWrap");

const onlyOwnedEl = el("onlyOwned");
const onlyWantedEl = el("onlyWanted");
const segButtons = [...document.querySelectorAll(".seg")];

let filterCategory = "all"; // all|confirmed|unverified
let data = loadData();

bootstrap();

// ---------- Bootstrapping ----------
async function bootstrap(){
  updateLastBackupUi();

  if (Array.isArray(data) && data.length > 0) {
    render();
    return;
  }
  await loadDefaultCSVOrEmpty();
}

async function loadDefaultCSVOrEmpty(){
  const csvPath = defaultCsvFor(getCollectionId());

  try{
    const res = await fetch(csvPath, { cache: "no-store" });

    // Missing default CSV is OK -> start empty
    if(!res.ok){
      console.warn(`Ingen default CSV for ${csvPath} (status ${res.status}). Starter tomt.`);
      data = [];
      saveData(data);
      render();
      return;
    }

    const text = await res.text();
    const imported = fromCSV(text).map(x => ({ ...x, id: x.id || crypto.randomUUID() }));

    data = imported;
    saveData(data);
    render();
  }catch(err){
    console.error("Kunne ikke laste default CSV. Starter med fallback:", err);
    data = structuredClone(defaultData);
    saveData(data);
    render();
  }
}

// ---------- UI helpers ----------
function conditionWord(n){
  const s = Math.max(0, Math.min(5, Number(n ?? 0)));
  if(s === 0) return "—";
  return ["Dårlig","OK","Pen","Veldig pen","Samlerstand"][s - 1];
}
function conditionHint(n){
  const s = Math.max(0, Math.min(5, Number(n ?? 0)));
  if(s === 0) return "Tilstand: ukjent";
  return `Tilstand: ${s}/5 – ${conditionWord(s)}`;
}

function categoryBadge(category){
  if(category === "confirmed"){
    return `<span class="badge good">✅ Bekreftet</span>`;
  }
  return `<span class="badge warn">⚠️ Ubekreftet</span>`;
}

function escapeHtml(s){
  return String(s ?? "").replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function matchesQuery(item, q){
  if(!q) return true;
  const hay = [
    item.title, item.code, item.variant, item.sources, item.notes,
    item.category, item.owned ? "eier" : "", item.wanted ? "ønsker" : ""
  ].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function getView(){
  const q = qEl.value.trim();
  return data
    .filter(it => (filterCategory === "all" ? true : it.category === filterCategory))
    .filter(it => (onlyOwnedEl.checked ? it.owned : true))
    .filter(it => (onlyWantedEl.checked ? it.wanted : true))
    .filter(it => matchesQuery(it, q))
    .sort((a,b) => String(a.title).localeCompare(String(b.title), "no"));
}

// ---------- Grouping (alpha for games, year for comics where code is YYYY-xx) ----------
function getGroupModeForItems(items){
  if(!items || items.length === 0) return "alpha";
  const yearLike = items.filter(it => /^\d{4}-/.test(String(it.code || ""))).length;
  return yearLike >= Math.max(10, Math.floor(items.length * 0.3)) ? "year" : "alpha";
}

function groupKeyAlpha(title){
  const t = String(title || "").trim();
  if(!t) return "#";
  const ch = t[0].toUpperCase();
  if(/[A-ZÆØÅ]/.test(ch)) return ch;
  return "#";
}

function groupKeyYear(item){
  const c = String(item.code || "");
  const m = c.match(/^(\d{4})-/);
  if(m) return m[1];

  const t = String(item.title || "");
  const m2 = t.match(/\b(19|20)\d{2}\b/);
  if(m2) return m2[0];

  if(String(item.variant || "").toLowerCase().includes("album")) return "Album";
  return "Ukjent";
}

function groupItems(items){
  const mode = getGroupModeForItems(items);
  const map = new Map();

  for(const it of items){
    const key = (mode === "year") ? groupKeyYear(it) : groupKeyAlpha(it.title);
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }

  const keys = [...map.keys()].sort((a,b) => {
    if(mode === "year"){
      const na = /^\d{4}$/.test(a) ? Number(a) : Infinity;
      const nb = /^\d{4}$/.test(b) ? Number(b) : Infinity;
      if(na !== nb) return na - nb;
      return a.localeCompare(b, "no");
    }
    if(a === "#") return 1;
    if(b === "#") return -1;
    return a.localeCompare(b, "no");
  });

  // sortér inni gruppene alfabetisk
  for(const k of keys){
    map.get(k).sort((x,y) => String(x.title).localeCompare(String(y.title), "no"));
  }

  return { mode, keys, map };
}

// ---------- Render ----------
function render(){
  const view = getView();

  const total = data.length;
  const owned = data.filter(d => d.owned).length;
  const wanted = data.filter(d => d.wanted).length;
  const percent = total > 0 ? Math.round((owned / total) * 100) : 0;

  if(statsEl){
    statsEl.textContent =
      `Totalt: ${total} • Eier: ${owned} (${percent} %) • Ønsker: ${wanted} • Viser nå: ${view.length}`;
  }
  if(progressFillEl) progressFillEl.style.width = `${percent}%`;

  const { mode, keys, map } = groupItems(view);

  // Auto-open grupper når du filtrerer/søker (valgfritt)
  const q = qEl.value.trim();
  const autoOpen = q.length > 0 || onlyOwnedEl.checked || onlyWantedEl.checked || filterCategory !== "all";

  const groupsHtml = keys.map(key => {
    const items = map.get(key) || [];

    const rows = items.map(it => `
      <tr data-id="${escapeHtml(it.id)}" class="row-item ${it.owned ? "row-owned" : ""}">
        <td>
          <div class="row-grid">
            <div class="col-title">
              <strong class="game-title">${escapeHtml(it.title)}</strong>
            </div>
            <div class="col-badge">
              ${categoryBadge(it.category)}
            </div>
            <div class="col-stars">
              <span class="badge" title="${escapeHtml(conditionHint(it.stars))}">
                ${escapeHtml(conditionWord(it.stars))}
              </span>
            </div>
          </div>
        </td>

        <td class="status-cell">
          <button class="chip ${it.owned ? "chip-on" : ""}" data-action="owned">Eier</button>
          <button class="chip ${it.wanted ? "chip-on" : ""}" data-action="wanted">Ønsker</button>
        </td>
      </tr>
    `).join("");

    const label = key;
    const count = items.length;

    return `
      <details class="group" ${autoOpen ? "open" : ""} data-group="${escapeHtml(key)}">
        <summary class="group-summary">
          <span class="group-title">${escapeHtml(label)}</span>
          <span class="group-meta">${count}</span>
        </summary>
        <div class="group-body">
          <table>
            <thead>
              <tr>
                <th style="width:75%;">${mode === "year" ? "Utgave" : "Tittel"}</th>
                <th style="width:25%;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="2" class="small">Ingen treff i denne gruppa.</td></tr>`}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }).join("");

  tableWrap.innerHTML = groupsHtml || `<div class="small">Ingen treff. Prøv å endre filter/søk.</div>`;
}

function toggleFlag(id, key, value){
  const idx = data.findIndex(d => d.id === id);
  if(idx < 0) return;
  data[idx][key] = !!value;
  saveData(data);
  render();
}

// ---------- Editor dialog ----------
const dlg = el("dlgEdit");
const btnAdd = el("btnAdd");
const btnDelete = el("btnDelete");

const fTitle = el("fTitle");
const fCategory = el("fCategory");
const fCode = el("fCode");
const fVariant = el("fVariant");
const fStars = el("fStars");
const fSources = el("fSources");
const fNotes = el("fNotes");
const fOwned = el("fOwned");
const fWanted = el("fWanted");

let editingId = null;

function openEditor(id){
  const item = data.find(d => d.id === id);
  if(!item) return;

  editingId = id;

  fTitle.value = item.title || "";
  fCategory.value = item.category || "confirmed";
  fCode.value = item.code || "";
  fVariant.value = item.variant || "";
  fStars.value = item.stars ?? 0;
  fSources.value = item.sources || "";
  fNotes.value = item.notes || "";
  fOwned.checked = !!item.owned;
  fWanted.checked = !!item.wanted;

  if(btnDelete) btnDelete.style.display = "inline-flex";
  dlg?.showModal();
}

btnAdd?.addEventListener("click", () => {
  editingId = null;

  fTitle.value = "";
  fCategory.value = "confirmed";
  fCode.value = "";
  fVariant.value = "";
  fStars.value = 0;
  fSources.value = "";
  fNotes.value = "";
  fOwned.checked = false;
  fWanted.checked = false;

  if(btnDelete) btnDelete.style.display = "none";
  dlg?.showModal();
});

el("editForm")?.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    id: editingId || crypto.randomUUID(),
    title: fTitle.value.trim(),
    category: fCategory.value,
    code: fCode.value.trim(),
    variant: fVariant.value.trim(),
    stars: Number(fStars.value || 0),
    sources: fSources.value.trim(),
    notes: fNotes.value.trim(),
    owned: !!fOwned.checked,
    wanted: !!fWanted.checked
  };

  if(!payload.title){
    alert("Tittel kan ikke være tom.");
    return;
  }

  if(editingId){
    const idx = data.findIndex(d => d.id === editingId);
    if(idx >= 0) data[idx] = payload;
  }else{
    data.push(payload);
  }

  saveData(data);
  dlg?.close();
  render();
});

btnDelete?.addEventListener("click", () => {
  if(!editingId) return;

  const item = data.find(d => d.id === editingId);
  if(!item) return;

  const ok = confirm(`Slette "${item.title}"?`);
  if(!ok) return;

  data = data.filter(d => d.id !== editingId);
  saveData(data);
  dlg?.close();
  render();
});

// ---------- Filters & search ----------
qEl?.addEventListener("input", render);
onlyOwnedEl?.addEventListener("change", render);
onlyWantedEl?.addEventListener("change", render);

segButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    segButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filterCategory = btn.dataset.filter;
    render();
  });
});
segButtons[0]?.classList.add("active");

// ---------- Row click handling (event delegation) ----------
tableWrap?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr.row-item");
  if(!tr) return;

  const id = tr.dataset.id;
  const action = e.target?.dataset?.action;

  if(action === "owned"){
    e.stopPropagation();
    const item = data.find(d => d.id === id);
    toggleFlag(id, "owned", !item?.owned);
    return;
  }
  if(action === "wanted"){
    e.stopPropagation();
    const item = data.find(d => d.id === id);
    toggleFlag(id, "wanted", !item?.wanted);
    return;
  }

  openEditor(id);
});

// ---------- Backup helpers ----------
function ymd(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeBackupPayload(items){
  return {
    meta: {
      app: "samlinger-pwa",
      schema: 1,
      exportedAt: new Date().toISOString(),
      collectionId: getCollectionId(),
      storageKey: STORAGE_KEY,
      count: Array.isArray(items) ? items.length : 0
    },
    items: Array.isArray(items) ? items : []
  };
}

function backupFilename(prefix){
  return `${prefix}-${getCollectionId()}-${ymd()}.json`;
}
function exportCsvFilename(){
  return `export-${getCollectionId()}-${ymd()}.csv`;
}

function noteBackupTaken(){
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  updateLastBackupUi();
}

function updateLastBackupUi(){
  if(!lastBackupEl) return;

  const iso = localStorage.getItem(LAST_BACKUP_KEY);
  if(!iso){
    lastBackupEl.textContent = "";
    return;
  }
  const dt = new Date(iso);
  if(Number.isNaN(dt.getTime())){
    lastBackupEl.textContent = "";
    return;
  }

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");

  lastBackupEl.textContent = `Backup sist tatt: ${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function autoBackupNow(reason){
  const safeReason = String(reason || "auto").toLowerCase().replaceAll(/[^a-z0-9\-]+/g, "-").slice(0, 40);
  const payload = makeBackupPayload(data);
  const filename = `auto-${safeReason}-${getCollectionId()}-${ymd()}.json`;
  downloadText(JSON.stringify(payload, null, 2), filename, "application/json");
  noteBackupTaken();
}

function isValidItemForImport(it){
  return it
    && typeof it === "object"
    && typeof it.title === "string"
    && typeof it.category === "string";
}

function normalizeImportedItems(items){
  return items.map((it) => ({
    id: String(it.id ?? crypto.randomUUID()),
    title: String(it.title ?? ""),
    category: (function(){
      const c = String(it.category ?? "").toLowerCase();
      if(c === "confirmed") return "confirmed";
      if(c === "unverified") return "unverified";
      if(c === "uncertain") return "unverified"; // gammel verdi
      return "unverified";
    })(),
    code: String(it.code ?? ""),
    variant: String(it.variant ?? ""),
    stars: Number.isFinite(Number(it.stars)) ? Number(it.stars) : 0,
    sources: String(it.sources ?? ""),
    notes: String(it.notes ?? ""),
    owned: Boolean(it.owned ?? false),
    wanted: Boolean(it.wanted ?? false)
  }));
}

// ---------- JSON backup/restore ----------
el("btnBackupJson")?.addEventListener("click", () => {
  const payload = makeBackupPayload(data);
  downloadText(JSON.stringify(payload, null, 2), backupFilename("backup"), "application/json");
  noteBackupTaken();
});

el("fileImportJson")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;

  if(Array.isArray(data) && data.length > 0){
    autoBackupNow("before-json-restore");
  }

  let parsed;
  try{
    parsed = JSON.parse(await file.text());
  }catch{
    alert("Kunne ikke lese JSON-filen (ugyldig format).");
    e.target.value = "";
    return;
  }

  let items = [];
  if(Array.isArray(parsed)){
    items = parsed;
  }else if(parsed && Array.isArray(parsed.items)){
    items = parsed.items;
  }else{
    alert("Filen ser ikke ut som en gyldig backup (fant ikke items).");
    e.target.value = "";
    return;
  }

  if(!items.every(isValidItemForImport)){
    alert("Backupfilen inneholder rader som mangler minimumsfelter (tittel/kategori).");
    e.target.value = "";
    return;
  }

  const normalized = normalizeImportedItems(items);

  const ok = confirm(
    `Gjenopprette fra backup?\n\nDette vil erstatte lista på denne enheten med ${normalized.length} objekter.`
  );
  if(!ok){
    e.target.value = "";
    return;
  }

  data = normalized;
  saveData(data);
  render();
  e.target.value = "";
  noteBackupTaken();
});

// ---------- CSV export/import ----------
const COLS = ["id","title","category","code","variant","stars","sources","notes","owned","wanted"];

el("btnExport")?.addEventListener("click", () => {
  const csv = toCSV(data);
  downloadText(csv, exportCsvFilename(), "text/csv");
});

el("fileImport")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;

  if(Array.isArray(data) && data.length > 0){
    autoBackupNow("before-csv-import");
  }

  const text = await file.text();
  const imported = fromCSV(text);

  const ok = confirm(`Importere ${imported.length} rader og erstatte lista på denne enheten?`);
  if(!ok){
    e.target.value = "";
    return;
  }

  data = imported.map(x => ({ ...x, id: x.id || crypto.randomUUID() }));
  saveData(data);
  render();
  e.target.value = "";
});

el("btnReset")?.addEventListener("click", () => {
  if(Array.isArray(data) && data.length > 0){
    autoBackupNow("before-reset");
  }

  const ok = confirm("Nullstille lokale endringer og starte tomt (eller bruke default CSV hvis den finnes)?");
  if(!ok) return;

  localStorage.removeItem(STORAGE_KEY);
  data = [];
  bootstrap();
});

// ---------- CSV helpers ----------
function toCSV(items){
  const head = COLS.join(",");
  const lines = items.map(it => COLS.map(k => csvCell(it[k])).join(","));
  return [head, ...lines].join("\n");
}

function fromCSV(text){
  const rows = parseCSV(text);
  if(rows.length === 0) return [];

  const header = rows[0].map(h => h.trim());
  const idx = Object.fromEntries(COLS.map(c => [c, header.indexOf(c)]));

  return rows.slice(1)
    .filter(r => r.some(x => String(x).trim() !== ""))
    .map(r => ({
      id: at(r, idx.id),
      title: at(r, idx.title) || "",
      category: (function(){
        const c = (at(r, idx.category) || "").toLowerCase();
        if(c === "confirmed") return "confirmed";
        if(c === "unverified") return "unverified";
        if(c === "uncertain") return "unverified"; // gammel verdi
        return "confirmed";
      })(),
      code: at(r, idx.code) || "",
      variant: at(r, idx.variant) || "",
      stars: Number(at(r, idx.stars) || 0),
      sources: at(r, idx.sources) || "",
      notes: at(r, idx.notes) || "",
      owned: String(at(r, idx.owned) || "").toLowerCase() === "true",
      wanted: String(at(r, idx.wanted) || "").toLowerCase() === "true"
    }));
}

function at(row, i){
  if(i == null || i < 0) return "";
  return row[i] ?? "";
}

function csvCell(v){
  const s = String(v ?? "");
  if(/[,"\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function downloadText(text, filename, mime){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text){
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];

    if(inQuotes){
      if(ch === '"' && next === '"'){ cur += '"'; i++; continue; }
      if(ch === '"'){ inQuotes = false; continue; }
      cur += ch;
      continue;
    }

    if(ch === '"'){ inQuotes = true; continue; }
    if(ch === ","){ row.push(cur); cur=""; continue; }
    if(ch === "\n"){
      row.push(cur); rows.push(row);
      row=[]; cur="";
      continue;
    }
    if(ch === "\r"){ continue; }
    cur += ch;
  }

  row.push(cur);
  rows.push(row);
  return rows;
}

// --- Service worker registration ---
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}