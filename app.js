console.log("APP.JS LOADED v2026-02-28-1");
// --- Multi-collection PWA + local data store ---
// Item format (ny):
// { id, title, category: "confirmed"|"unverified", code, variant, sources, notes,
//   cart(bool), manual(bool), box(bool), wanted(bool) }

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
  "comics-master-of-the-universe": {title: "Tegneserier – Master of the Universe", sub: "Master of the Universe (inkl. Giveaway / Starfighter / Film Spesial).", storageKey: "col_comics_master_of_the_universe_v1"},
};

function uuid(){
  // randomUUID finnes ikke alltid på mobil over http
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  // fallback: pseudo-UUID med crypto.getRandomValues
  const c = globalThis.crypto;
  if (c?.getRandomValues){
    const a = new Uint8Array(16);
    c.getRandomValues(a);
    a[6] = (a[6] & 0x0f) | 0x40; // version 4
    a[8] = (a[8] & 0x3f) | 0x80; // variant
    const hex = [...a].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  // siste utvei
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCollectionId(){
  const p = new URLSearchParams(location.search);
  return (p.get("c") || "").trim();
}
function getCollectionConfig(){
  const id = getCollectionId();
  return COLLECTIONS[id] || null;
}
let DEFAULT_MAP = null;

async function loadDefaultManifest(){
  console.log("Laster manifest: defaults/defaults.json");
  if (DEFAULT_MAP) return DEFAULT_MAP;

  const res = await fetch("defaults/defaults.json", { cache: "no-store" });
  const files = await res.json();
  console.log("Manifest files:", files);
console.log("DEFAULT_MAP:", DEFAULT_MAP);

  DEFAULT_MAP = {};
  for (const path of files) {
    const name = path.split("/").pop().replace(".csv", "");
    DEFAULT_MAP[name] = path;
  }

  return DEFAULT_MAP;
}

async function defaultCsvFor(collectionId){
  const map = await loadDefaultManifest();
  return map[collectionId] || `defaults/${collectionId}.csv`;
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
const KIND = collection.kind || (getCollectionId().startsWith("comics-") ? "comics" : "games");

// Fallback data (kun hvis noe går helt galt)
const defaultData = [
  {
    id: uuid(),
    title: "Eksempel",
    category: "confirmed",
    code: "",
    variant: "",
    sources: "",
    notes: "",
    cart: false,
    manual: false,
    box: false,
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

const onlyOwnedEl = el("onlyOwned");     // i HTML heter den fortsatt onlyOwned, men betyr "cart"
const onlyWantedEl = el("onlyWanted");
const segButtons = [...document.querySelectorAll(".seg")];

let filterCategory = "all"; // all|confirmed|unverified

// ✅ NYTT: husk hvilke grupper som er åpne mellom render()
const openGroups = new Set();

// Last + migrer ev. gammel data (owned/stars -> cart/manual/box)
let data = migrateItems(loadData());

// ---------- Bootstrapping ----------
async function loadDefaultCSVOrEmpty(){
  try {
    const id = getCollectionId();
    console.log("getCollectionId() =", id);

    const normalizedId = (id === "comics") ? "comics-conan" : id;

    const csvPath = await defaultCsvFor(normalizedId);
    console.log("csvPath =", csvPath);

    const res = await fetch(csvPath, { cache: "no-store" });

    if(!res.ok){
      console.warn(`Ingen default CSV for ${csvPath} (status ${res.status}). Starter tomt.`);
      data = [];
      saveData(data);
      render();
      return;
    }

    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true }).data;

    data = parsed.map(r => ({
      ...r,
      id: r.id || crypto.randomUUID(),
      stars: r.stars ? Number(r.stars) : 0,
      owned: String(r.owned).toLowerCase() === "true",
      wanted: String(r.wanted).toLowerCase() === "true",
    }));

    saveData(data);
    render();
  } catch (err){
    console.error("Feil ved lasting av default CSV:", err);
    data = [];
    saveData(data);
    render();
  }
}

// ---------- Migration / normalization ----------
function migrateItems(items){
  if(!Array.isArray(items)) return [];

  let changed = false;

  const normalized = items.map((it) => {
    const obj = (it && typeof it === "object") ? it : {};
    const out = {
      id: String(obj.id ?? uuid()),
      title: String(obj.title ?? ""),
      category: (function(){
        const c = String(obj.category ?? "").toLowerCase();
        if(c === "confirmed") return "confirmed";
        if(c === "unverified") return "unverified";
        if(c === "uncertain") return "unverified";
        return "confirmed";
      })(),
      code: String(obj.code ?? ""),
      variant: String(obj.variant ?? ""),
      sources: String(obj.sources ?? ""),
      notes: String(obj.notes ?? ""),
      cart: Boolean(obj.cart ?? false),
      manual: Boolean(obj.manual ?? false),
      box: Boolean(obj.box ?? false),
      wanted: Boolean(obj.wanted ?? false)
    };

    // legacy: owned -> cart
    if("owned" in obj && out.cart === false){
      out.cart = Boolean(obj.owned);
      if(out.cart) changed = true;
    }

    // legacy: stars ignoreres
    if("stars" in obj) changed = true;

    // hvis noen hadde "true"/"false" som string
    if(typeof obj.cart === "string"){ out.cart = obj.cart.toLowerCase() === "true"; changed = true; }
    if(typeof obj.manual === "string"){ out.manual = obj.manual.toLowerCase() === "true"; changed = true; }
    if(typeof obj.box === "string"){ out.box = obj.box.toLowerCase() === "true"; changed = true; }
    if(typeof obj.wanted === "string"){ out.wanted = obj.wanted.toLowerCase() === "true"; changed = true; }

    return out;
  });

  // Skriv tilbake hvis vi faktisk migrerte noe
  if(changed){
    try{ saveData(normalized); }catch{}
  }

  return normalized;
}

// ---------- UI helpers ----------
function categoryBadge(category){
  if(category === "confirmed"){
    return `
      <span class="cat" title="Bekreftet">
        <span class="cat-dot confirmed" aria-hidden="true"></span>
        <span class="cat-text">Bekreftet</span>
      </span>
    `;
  }
  return `
    <span class="cat" title="Ubekreftet">
      <span class="cat-dot unverified" aria-hidden="true"></span>
      <span class="cat-text">Ubekreftet</span>
    </span>
  `;
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
    item.category,
    item.cart ? "cart" : "",
    item.manual ? "manual" : "",
    item.box ? "box" : "",
    item.wanted ? "ønsker" : ""
  ].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function getView(){
  const q = qEl.value.trim();
  return data
    .filter(it => (filterCategory === "all" ? true : it.category === filterCategory))
    .filter(it => (onlyOwnedEl.checked ? it.cart : true))   // "Vis kun cart"
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

// ✅ NYTT: les åpne grupper fra DOM før vi re-render
function syncOpenGroupsFromDom(){
  if(!tableWrap) return;
  const openEls = tableWrap.querySelectorAll('details.group[open]');
  openGroups.clear();
  for(const d of openEls){
    const g = d.getAttribute("data-group");
    if(g) openGroups.add(g);
  }
}

// ---------- Render ----------
function render(){
  syncOpenGroupsFromDom();

  const view = getView();
  const total = data.length;

  const haveCount = (KIND === "comics")
    ? data.filter(d => d.owned).length
    : data.filter(d => d.cart).length;

  const cibCount = (KIND === "games")
    ? data.filter(d => d.cart && d.manual && d.box).length
    : 0;

  const wanted = data.filter(d => d.wanted).length;
  const percent = total > 0 ? Math.round((haveCount / total) * 100) : 0;

  if(statsEl){
    statsEl.textContent =
      (KIND === "comics")
        ? `Totalt: ${total} • Eier: ${haveCount} (${percent} %) • Ønsker: ${wanted} • Viser nå: ${view.length}`
        : `Totalt: ${total} • Cart: ${haveCount} (${percent} %) • CIB: ${cibCount} • Ønsker: ${wanted} • Viser nå: ${view.length}`;
  }
  if(progressFillEl) progressFillEl.style.width = `${percent}%`;

  const { mode, keys, map } = groupItems(view);

  // Auto-open grupper når du filtrerer/søker (valgfritt)
  const q = qEl.value.trim();
  const autoOpen = q.length > 0 || onlyOwnedEl.checked || onlyWantedEl.checked || filterCategory !== "all";

  const groupsHtml = keys.map(key => {
    const items = map.get(key) || [];

    const rows = items.map(it => {
      // --- Games ---
      const hasCart = !!it.cart;
      const hasManual = !!it.manual;
      const hasBox = !!it.box;
      const isCib = hasCart && hasManual && hasBox;
      const hasAnyGame = hasCart || hasManual || hasBox;

      // --- Comics ---
      const comicOwned = !!it.owned;
const rawComicCond = String(it.comicCond || ""); // kan være "", "bad", "ok", "good"
const comicCond = comicOwned ? (rawComicCond || "ok") : ""; // bare aktiv hvis eid
const comicIsGood = comicOwned && comicCond === "good";
const issue = (KIND === "comics")
  ? (String(it.title || "").match(/#\s*\d+/)?.[0]?.replace(/\s+/g, "") || "")
  : "";

      const rowHaveClass =
        (KIND === "comics")
          ? (comicOwned ? "row-have" : "")
          : (hasAnyGame ? "row-have" : "");

      const rowCibClass =
        (KIND === "games" && isCib) ? "row-cib" : "";

      return `
        <tr data-id="${escapeHtml(it.id)}" class="row-item ${rowHaveClass} ${rowCibClass}">
          <td>
            <div class="row-grid">
              <div class="col-title">
                <strong class="game-title">
  ${KIND === "games" && isCib ? `<span class="title-icon cib" title="CIB">🏆</span>` : ""}
  ${KIND === "comics" && comicIsGood ? `<span class="title-icon cib" title="Veldig fin stand">🏆</span>` : ""}

  ${KIND === "comics" && issue
    ? `<span class="issue-pill" title="Nummer">${escapeHtml(issue)}</span>`
    : ""}

  <span class="title-text">${escapeHtml(it.title)}</span>

  ${it.wanted ? `<span class="title-icon wanted" title="Ønsker">⭐</span>` : ""}
</strong>
              </div>

              <div class="col-badge">
                ${categoryBadge(it.category)}
              </div>

              <div class="col-stars">
                ${KIND === "games" ? `
                  <div class="have-pills" aria-label="Innhold">
                    ${isCib
                      ? `<span class="have-pill cib" title="Cart + Manual + Box">CIB</span>`
                      : `
                        <span class="have-pill ${hasCart ? "on" : ""}" title="Cart">C</span>
                        <span class="have-pill ${hasManual ? "on" : ""}" title="Manual">M</span>
                        <span class="have-pill ${hasBox ? "on" : ""}" title="Box">B</span>
                      `
                    }
                  </div>
                ` : `
                  <div class="have-pills" aria-label="Tilstand">
                    <span class="have-pill ${comicCond === "bad" ? "on bad" : ""}" title="Dårlig">D</span>
                    <span class="have-pill ${comicCond === "ok" ? "on ok" : ""}" title="OK">OK</span>
                    <span class="have-pill ${comicCond === "good" ? "on good" : ""}" title="Veldig fin">VG</span>
                  </div>
                `}
              </div>
            </div>
          </td>

          <td class="status-cell">
            ${KIND === "games" ? `
              <button class="iconchip ${hasCart ? "iconchip-on" : ""}" data-action="cart" title="Cart" type="button">🎮</button>
              <button class="iconchip ${hasManual ? "iconchip-on" : ""}" data-action="manual" title="Manual" type="button">📘</button>
              <button class="iconchip ${hasBox ? "iconchip-on" : ""}" data-action="box" title="Box" type="button">📦</button>
              <button class="iconchip ${it.wanted ? "iconchip-on" : ""}" data-action="wanted" title="Ønsker" type="button">⭐</button>
            ` : `
  <button class="iconchip ${comicCond === "bad" ? "iconchip-on" : ""}" data-action="cond_bad" title="Dårlig" type="button">😬</button>
  <button class="iconchip ${comicCond === "ok" ? "iconchip-on" : ""}" data-action="cond_ok" title="OK" type="button">🙂</button>
  <button class="iconchip ${comicCond === "good" ? "iconchip-on" : ""}" data-action="cond_good" title="Veldig fin" type="button">🏆</button>
  <button class="iconchip ${it.wanted ? "iconchip-on" : ""}" data-action="wanted" title="Ønsker" type="button">⭐</button>
`}
          </td>
        </tr>
      `;
    }).join("");

    const label = key;
    const count = items.length;

    const shouldOpen = autoOpen || openGroups.has(String(key));

    const haveInGroup = (KIND === "comics")
      ? items.filter(x => x.owned).length
      : items.filter(x => x.cart).length;

    const isComplete = count > 0 && haveInGroup === count;

    return `
      <details class="group ${isComplete ? "group-complete" : ""}" ${shouldOpen ? "open" : ""} data-group="${escapeHtml(key)}">
        <summary class="group-summary">
          <span class="group-title">${escapeHtml(label)}</span>
          <span class="group-meta">
            ${isComplete ? `<span class="group-done" title="Fullført">✔</span>` : ""}
            ${haveInGroup}/${count}
          </span>
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
const fSources = el("fSources");
const fNotes = el("fNotes");
const fCart = el("fCart");
const fManual = el("fManual");
const fBox = el("fBox");
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
  fSources.value = item.sources || "";
  fNotes.value = item.notes || "";

  fCart.checked = !!item.cart;
  fManual.checked = !!item.manual;
  fBox.checked = !!item.box;
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
  fSources.value = "";
  fNotes.value = "";

  fCart.checked = false;
  fManual.checked = false;
  fBox.checked = false;
  fWanted.checked = false;

  if(btnDelete) btnDelete.style.display = "none";
  dlg?.showModal();
});

el("editForm")?.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    id: editingId || uuid(),
    title: fTitle.value.trim(),
    category: fCategory.value,
    code: fCode.value.trim(),
    variant: fVariant.value.trim(),
    sources: fSources.value.trim(),
    notes: fNotes.value.trim(),
    cart: !!fCart.checked,
    manual: !!fManual.checked,
    box: !!fBox.checked,
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

  data = migrateItems(data);
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
  const tr = e.target.closest?.("tr.row-item");
  if(!tr) return;

  const id = tr.dataset.id;

  // Robust: finn knappen selv om du treffer emoji/innhold inni
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;

  // Hvis du trykker på en action-knapp, skal editor ALDRI åpnes
  if(action){
    e.preventDefault();
    e.stopPropagation();

    const idx = data.findIndex(d => d.id === id);
    if(idx < 0) return;

    // --- Games ---
    if(action === "cart"){
      data[idx].cart = !data[idx].cart;
      saveData(data); render(); return;
    }
    if(action === "manual"){
      data[idx].manual = !data[idx].manual;
      saveData(data); render(); return;
    }
    if(action === "box"){
      data[idx].box = !data[idx].box;
      saveData(data); render(); return;
    }

    // --- Shared ---
    if(action === "wanted"){
      data[idx].wanted = !data[idx].wanted;
      saveData(data); render(); return;
    }

    // --- Comics ---
    if(action === "owned"){
      data[idx].owned = !data[idx].owned;
      saveData(data); render(); return;
    }

    if(action === "cond_bad" || action === "cond_ok" || action === "cond_good"){
  const value =
    action === "cond_bad" ? "bad" :
    action === "cond_ok" ? "ok" :
    "good";

  const idx = data.findIndex(d => d.id === id);
  if(idx < 0) return;

  const wasOwned = !!data[idx].owned;
  const prev = String(data[idx].comicCond || "");

  // ✅ Toggle:
  // - Hvis du trykker samme tilstand igjen mens du eier -> fjern eierskap
  // - Ellers -> sett eierskap + tilstand
  if(wasOwned && (prev || "ok") === value){
    data[idx].owned = false;
    // valgfritt: behold comicCond eller null det ut. Jeg nuller for ryddighet:
    data[idx].comicCond = "";
  }else{
    data[idx].owned = true;
    data[idx].comicCond = value;
  }

  saveData(data);
  render();
  return;
}

    // Ukjent action => ikke åpne editor
    return;
  }

  // Klikk på selve raden (ikke knapp) => åpne editor
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
      schema: 2,
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
  return migrateItems(items);
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
const COLS = ["id","title","category","code","variant","sources","notes","cart","manual","box","wanted"];

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

  data = migrateItems(imported.map(x => ({ ...x, id: x.id || uuid() })));
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

  // støtt både nytt og gammelt schema
  const idx = Object.fromEntries([
    ...COLS.map(c => [c, header.indexOf(c)]),
    ["owned", header.indexOf("owned")],   // legacy
    ["stars", header.indexOf("stars")]    // legacy (ignoreres)
  ]);

  return rows.slice(1)
    .filter(r => r.some(x => String(x).trim() !== ""))
    .map(r => {
      const legacyOwned = String(at(r, idx.owned) || "").toLowerCase() === "true";

      return {
        id: at(r, idx.id),
        title: at(r, idx.title) || "",
        category: (function(){
          const c = (at(r, idx.category) || "").toLowerCase();
          if(c === "confirmed") return "confirmed";
          if(c === "unverified") return "unverified";
          if(c === "uncertain") return "unverified";
          return "confirmed";
        })(),
        code: at(r, idx.code) || "",
        variant: at(r, idx.variant) || "",
        sources: at(r, idx.sources) || "",
        notes: at(r, idx.notes) || "",
        cart: String(at(r, idx.cart) || "").toLowerCase() === "true" || legacyOwned,
        manual: String(at(r, idx.manual) || "").toLowerCase() === "true",
        box: String(at(r, idx.box) || "").toLowerCase() === "true",
        wanted: String(at(r, idx.wanted) || "").toLowerCase() === "true"
      };
    });
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
// Ikke bruk SW på localhost / lokal IP under utvikling (hindrer cache-trøbbel)
if ("serviceWorker" in navigator) {
  const host = location.hostname;
  const isLocalDev =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  if (!isLocalDev) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}
window.addEventListener("load", async () => {
  updateLastBackupUi();

  if (Array.isArray(data) && data.length > 0) {
    render();
    return;
  }
  await loadDefaultCSVOrEmpty();
});