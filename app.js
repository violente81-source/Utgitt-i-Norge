// --- Minimal PWA + local data store ---
// Data format per item:
// { id, title, category: "confirmed"|"uncertain", code, variant, stars (1-5), sources, notes, owned(bool), wanted(bool) }

const STORAGE_KEY = "scn_nes_list_v1";

const defaultData = [
  {
    id: crypto.randomUUID(),
    title: "Mega Man 5",
    category: "confirmed",
    code: "",
    variant: "",
    stars: 5,
    sources: "Spillmuseet",
    notes: "",
    owned: false,
    wanted: true
  },
  {
    id: crypto.randomUUID(),
    title: "Panic Restaurant",
    category: "uncertain",
    code: "",
    variant: "ESP (ukjent SCN-label)",
    stars: 5,
    sources: "Spillmuseet (ESP)",
    notes: "Flyttet til usikre/ESP i tidligere gjennomgang.",
    owned: false,
    wanted: false
  }
];

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return structuredClone(defaultData);
  try{
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : structuredClone(defaultData);
  }catch{
    return structuredClone(defaultData);
  }
}

function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();
init();

async function init(){
  const saved = load();
  if(saved && saved.length){
    data = saved;
    render();
  } else {
    await loadDefaultCSV();
  }
}

const el = (id) => document.getElementById(id);
const qEl = el("q");
const statsEl = el("stats");
const progressFillEl = el("progressFill");
const tableWrap = el("tableWrap");

const onlyOwnedEl = el("onlyOwned");
const onlyWantedEl = el("onlyWanted");
const segButtons = [...document.querySelectorAll(".seg")];

let filterCategory = "all"; // all|confirmed|uncertain

function starsToText(n){
  const s = Math.max(0, Math.min(5, Number(n || 0)));
  return "★★★★★☆☆☆☆☆".slice(5 - s, 10 - s); // returns n stars + (5-n) empties visually
}

function categoryBadge(category){
  if(category === "confirmed"){
    return `<span class="badge good">✅ Bekreftet SCN</span>`;
  }
  return `<span class="badge warn">⚠️ Usikker / ESP</span>`;
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
    .sort((a,b) => a.title.localeCompare(b.title, "no"));
}

function render(){
  const view = getView();

const total = data.length;
const owned = data.filter(d => d.owned).length;
const wanted = data.filter(d => d.wanted).length;

const percent = total > 0 
  ? Math.round((owned / total) * 100) 
  : 0;

statsEl.textContent =
  `Totalt: ${total} • Eier: ${owned} (${percent} %) • Ønsker: ${wanted} • Viser nå: ${view.length}`;

if (progressFillEl) {
  progressFillEl.style.width = `${percent}%`;
}

const rows = view.map(it => `
  <tr data-id="${it.id}" class="row-item ${it.owned ? "row-owned" : ""}">
    <td>
      <div class="row-grid">
  <div class="col-title">
    <strong class="game-title">${escapeHtml(it.title)}</strong>
  </div>

  <div class="col-badge">
    ${categoryBadge(it.category)}
  </div>

  <div class="col-stars">
    <span class="badge"><span class="star">${starsToText(it.stars)}</span></span>
  </div>
</div>
    </td>

<td class="status-cell">
  <button class="chip ${it.owned ? "chip-on" : ""}" data-action="owned">
    Eier
  </button>
  <button class="chip ${it.wanted ? "chip-on" : ""}" data-action="wanted">
    Ønsker
  </button>
</td>
  </tr>
`).join("");

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:75%;">Tittel</th>
	  <th style="width:25%;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="3" class="small">Ingen treff. Prøv å endre filter/søk.</td></tr>`}
      </tbody>
    </table>
  `;

  tableWrap.querySelectorAll("tr.row-item").forEach(tr => {
    tr.addEventListener("click", (e) => {
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
      if(action === "edit"){
        e.stopPropagation();
        openEditor(id);
        return;
      }

      // Click anywhere else on row opens editor
      openEditor(id);
    });
  });
}

function toggleFlag(id, key, value){
  const idx = data.findIndex(d => d.id === id);
  if(idx < 0) return;
  data[idx][key] = !!value;
  saveData(data);
  render();
}

function escapeHtml(s){
  return String(s ?? "").replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// --- Editor dialog ---
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
  editingId = id;

  fTitle.value = item?.title || "";
  fCategory.value = item?.category || "confirmed";
  fCode.value = item?.code || "";
  fVariant.value = item?.variant || "";
  fStars.value = item?.stars ?? "";
  fSources.value = item?.sources || "";
  fNotes.value = item?.notes || "";
  fOwned.checked = !!item?.owned;
  fWanted.checked = !!item?.wanted;

  btnDelete.style.display = item ? "inline-flex" : "none";
  dlg.showModal();
}

btnAdd.addEventListener("click", () => {
  editingId = null;
  fTitle.value = "";
  fCategory.value = "confirmed";
  fCode.value = "";
  fVariant.value = "";
  fStars.value = "";
  fSources.value = "";
  fNotes.value = "";
  fOwned.checked = false;
  fWanted.checked = false;
  btnDelete.style.display = "none";
  dlg.showModal();
});

el("editForm").addEventListener("submit", (e) => {
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
  dlg.close();
  render();
});

btnDelete.addEventListener("click", () => {
  if(!editingId) return;
  const item = data.find(d => d.id === editingId);
  if(!item) return;

  const ok = confirm(`Slette "${item.title}"?`);
  if(!ok) return;

  data = data.filter(d => d.id !== editingId);
  saveData(data);
  dlg.close();
  render();
});

// --- Filters & search ---
qEl.addEventListener("input", render);
onlyOwnedEl.addEventListener("change", render);
onlyWantedEl.addEventListener("change", render);

segButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    segButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filterCategory = btn.dataset.filter;
    render();
  });
});
segButtons[0].classList.add("active");

// --- CSV import/export ---
el("btnExport").addEventListener("click", () => {
  const csv = toCSV(data);
  downloadText(csv, "scn-nes-list.csv", "text/csv");
});

el("fileImport").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();
  const imported = fromCSV(text);

  // Merge strategy: import REPLACES the list.
  // (We can change this later to "merge" if you want.)
  const ok = confirm(`Importere ${imported.length} rader og erstatte lista på denne enheten?`);
  if(!ok) return;

  data = imported.map(x => ({ ...x, id: x.id || crypto.randomUUID() }));
  saveData(data);
  render();
  e.target.value = "";
});

el("btnReset").addEventListener("click", () => {
  const ok = confirm("Nullstille lokale endringer og gå tilbake til standarddata på denne enheten?");
  if(!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  data = loadData();
  render();
});

// CSV columns
const COLS = ["id","title","category","code","variant","stars","sources","notes","owned","wanted"];

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

  // Support files that at least have title/category
  return rows.slice(1).filter(r => r.some(x => String(x).trim() !== "")).map(r => ({
    id: at(r, idx.id),
    title: at(r, idx.title) || "",
    category: (at(r, idx.category) || "confirmed").toLowerCase() === "uncertain" ? "uncertain" : "confirmed",
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

// Small CSV parser (handles quoted commas/newlines)
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


async function loadDefaultCSV(){
  try{
    const res = await fetch("scn-nes-default.csv");
    const text = await res.text();

    const rows = text.split("\n").map(r => r.split(","));
    const headers = rows.shift();

    data = rows
      .filter(r => r.length > 1)
      .map((r,i)=>({
        id: Date.now()+i,
        title: r[0] || "",
        category: r[1] || "Bekreftet SCN",
        stars: (r[2] || "").length,
        owned: false,
        wanted: false,
        notes: ""
      }));

    save();
    render();
  }catch(err){
    console.error("Kunne ikke laste standard CSV", err);
  }
}

