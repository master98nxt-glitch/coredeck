'use strict';

// ── STATE ──────────────────────────────────────────────────────────────────
let appData = { items: [], notes: '', recentCommands: [], flows: {}, usageMeta: {} };
let searchQuery      = '';
let activeTypeFilter = 'all';
let activeTag        = null;
let contextItem      = null;
let editingId        = null;
let notesTimer       = null;
let saveIndicatorTimer = null;

// Keyboard navigation state
let selectedIndex = -1;
let navItems      = [];

// Input mode flags
let gtMode        = false;
let isSuggesting  = false;
let searchFocused = false;

// ── MUSIC PLAYER STATE ────────────────────────────────────────────────────
let musicAudio    = null;
let musicPlaying  = false;
let musicFile     = '';

// ── FLOW BUILDER STATE ────────────────────────────────────────────────────
let fbSteps   = [];
let fbDragIdx = null;

// ── DOM REFS ───────────────────────────────────────────────────────────────
const cardsGrid       = document.getElementById('cards-grid');
const searchInput     = document.getElementById('search-input');
const itemCountEl     = document.getElementById('item-count');
const tagCloud        = document.getElementById('tag-cloud');
const notesArea       = document.getElementById('notes-area');
const saveIndicator   = document.getElementById('save-indicator');
const modalOverlay    = document.getElementById('modal-overlay');
const modal           = document.getElementById('modal');
const modalTitle      = document.getElementById('modal-title');
const modalSaveBtn    = document.getElementById('modal-save');
const editIdInput     = document.getElementById('edit-id');
const itemNameInput   = document.getElementById('item-name');
const itemPathInput   = document.getElementById('item-path');
const itemTagsInput   = document.getElementById('item-tags');
const pathLabel       = document.getElementById('path-label');
const typeSelector    = document.getElementById('type-selector');
const contextMenu     = document.getElementById('context-menu');
const activeTagBar    = document.getElementById('active-tag-bar');
const activeTagLabel  = document.getElementById('active-tag-label');
const emptyState      = document.getElementById('empty-state');
const emptyStateMsg   = document.getElementById('empty-state-msg');
const emptyStateHint  = document.getElementById('empty-state-hint');
const toast           = document.getElementById('toast');
const themeSelect     = document.getElementById('theme-select');
const fbOverlay       = document.getElementById('fb-overlay');
const fbStepsList     = document.getElementById('fb-steps-list');
const fbFlowName      = document.getElementById('fb-flow-name');
const musicBar        = document.getElementById('music-bar');
const musicTitle      = document.getElementById('music-title');
const musicToggleBtn  = document.getElementById('music-toggle');
const musicStopBtn    = document.getElementById('music-stop');
const flowsPanelOverlay = document.getElementById('flows-panel-overlay');
const flowsPanelBody    = document.getElementById('flows-panel-body');

// ── THEME ──────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  if (!theme || theme === 'obsidian') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  if (themeSelect) themeSelect.value = theme || 'obsidian';
  localStorage.setItem('coredeck-theme', theme || 'obsidian');
}
function initTheme() { applyTheme(localStorage.getItem('coredeck-theme') || 'obsidian'); }
if (themeSelect) themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

// ── FOCUS SEARCH ──────────────────────────────────────────────────────────
window.coreDeck.onFocusSearch(() => {
  searchInput.value = '';
  searchQuery = '';
  gtMode = false;
  clearCommandPreview();
  searchInput.classList.remove('cmd-active', 'gt-mode-active');
  renderDisplay();
  setTimeout(() => { searchInput.focus(); searchInput.select(); }, 80);
});

// ── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  appData = await window.coreDeck.readData();
  if (!appData.items)          appData.items          = [];
  if (!appData.notes)          appData.notes          = '';
  if (!appData.recentCommands) appData.recentCommands = [];
  if (!appData.flows)          appData.flows          = {};
  if (!appData.usageMeta)      appData.usageMeta      = {};
  appData.items.forEach(i => {
    if (typeof i.usage      !== 'number') i.usage      = 0;
    if (typeof i.lastOpened !== 'number') i.lastOpened = 0;
  });
  cleanupUsageMeta(); // prune stale data on startup
  notesArea.value = appData.notes;
  renderAll();
  setupWindowControls();
  setupDataPathHint();
  updateMusicBar();
  setTimeout(() => { searchInput.focus(); }, 120);
}


// ══════════════════════════════════════════════════════════════════════════
//  USAGE DATA CLEANUP SYSTEM
//  Prevents unbounded growth of usageMeta over long-term use.
//  Runs on startup + every 10 command executions (lightweight).
// ══════════════════════════════════════════════════════════════════════════
const CLEANUP_MAX_ENTRIES   = 120;                     // max keys in usageMeta
const CLEANUP_MAX_AGE_MS    = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const CLEANUP_MAX_RECENT_TS = 8;                       // max recentTs per key

let _cleanupCommandCount = 0;

function cleanupUsageMeta() {
  if (!appData.usageMeta) return;
  const now = Date.now();
  const meta = appData.usageMeta;

  // 1. Trim recentTs arrays
  Object.keys(meta).forEach(key => {
    if (!meta[key]) return;
    if (Array.isArray(meta[key].recentTs)) {
      meta[key].recentTs = meta[key].recentTs.slice(0, CLEANUP_MAX_RECENT_TS);
    }
  });

  // 2. Remove entries inactive for 30+ days
  Object.keys(meta).forEach(key => {
    const entry = meta[key];
    if (!entry) { delete meta[key]; return; }
    const lastTs = Array.isArray(entry.recentTs) && entry.recentTs.length > 0 ? entry.recentTs[0] : 0;
    if (lastTs > 0 && now - lastTs > CLEANUP_MAX_AGE_MS) delete meta[key];
  });

  // 3. Cap total entries at CLEANUP_MAX_ENTRIES (keep most recent)
  const keys = Object.keys(meta);
  if (keys.length > CLEANUP_MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => ((meta[b]?.recentTs?.[0]) || 0) - ((meta[a]?.recentTs?.[0]) || 0));
    sorted.slice(CLEANUP_MAX_ENTRIES).forEach(k => delete meta[k]);
  }
}

// Called from trackCommand — runs every 10 commands to stay lightweight
function maybeCleanupMeta() {
  _cleanupCommandCount++;
  if (_cleanupCommandCount >= 10) { _cleanupCommandCount = 0; cleanupUsageMeta(); }
}

// ══════════════════════════════════════════════════════════════════════════
//  MEMORY SYSTEM — track time-of-day usage + velocity timestamps
// ══════════════════════════════════════════════════════════════════════════
function getTimeSlot() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'night';
}

// Record a usage event: increments slot counter AND stores a timestamp for velocity
function recordUsageMeta(key) {
  if (!appData.usageMeta) appData.usageMeta = {};
  const slot = getTimeSlot();
  if (!appData.usageMeta[key]) {
    appData.usageMeta[key] = { morning: 0, afternoon: 0, night: 0, total: 0, recentTs: [] };
  }
  const meta = appData.usageMeta[key];
  meta[slot]  = (meta[slot]  || 0) + 1;
  meta.total  = (meta.total  || 0) + 1;
  // Keep last CLEANUP_MAX_RECENT_TS timestamps for velocity detection
  meta.recentTs = [Date.now(), ...(meta.recentTs || [])].slice(0, CLEANUP_MAX_RECENT_TS);
}

// Time-slot affinity: how strongly does this key belong to the current time slot?
// Returns 0–50, weighted by confidence (min sample threshold)
function getTimeSlotBoost(key) {
  const meta = appData.usageMeta?.[key];
  if (!meta || !meta.total) return 0;
  const slot      = getTimeSlot();
  const slotCount = meta[slot] || 0;
  const total     = meta.total;
  if (total < 3) return (slotCount / total) * 15;   // low confidence: small boost
  const ratio = slotCount / total;
  // High-confidence affinity: scale up to 50
  return ratio > 0.6 ? ratio * 50 : ratio * 35;
}

// Velocity boost: item opened multiple times recently = hot/trending.
// Requires total usage >= 3 AND at least 2 recent events to avoid false positives.
function getVelocityBoost(key) {
  const meta = appData.usageMeta?.[key];
  if (!meta?.recentTs?.length) return 0;
  if ((meta.total || 0) < 3) return 0; // guard: need established usage history
  const now = Date.now();
  const inLastHour = meta.recentTs.filter(ts => now - ts < 3_600_000).length;
  const inLast3h   = meta.recentTs.filter(ts => now - ts < 10_800_000).length;
  // Require at least 2 events in the window — single open is not a trend
  if (inLastHour >= 4) return 45;
  if (inLastHour >= 3) return 35;
  if (inLastHour >= 2) return 20;
  if (inLast3h   >= 3) return 12;
  if (inLast3h   >= 2) return 6;
  return 0;
}

// Time-of-day context boost for items.
// Balanced: matching slot +15, mismatch -5. Never overrides strong habits.
function getContextBoostForItem(item) {
  const slot = getTimeSlot();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  const name = item.name.toLowerCase();

  if (slot === 'morning') {
    if (tags.some(t => ['work','dev','study','tools','text','code','productivity'].includes(t))) return 15;
    if (['notepad','vscode','github','notion','obsidian','word','excel'].some(k => name.includes(k))) return 15;
    if (tags.some(t => ['media','music','entertainment','game'].includes(t))) return -5;
  }
  if (slot === 'afternoon') {
    if (tags.some(t => ['work','tools','dev','productivity'].includes(t))) return 8;
    return 3;
  }
  if (slot === 'night') {
    if (tags.some(t => ['media','music','entertainment','web','game'].includes(t))) return 15;
    if (['youtube','spotify','music','netflix','twitch','steam','discord'].some(k => name.includes(k))) return 15;
    if (tags.some(t => ['work','dev','tools'].includes(t))) return -5;
  }
  return 0;
}

// Time-of-day context boost for flows.
// Balanced: matching slot +20, mismatch -5. Reliable over long-term use.
function getContextBoostForFlow(name) {
  const n    = name.toLowerCase();
  const slot = getTimeSlot();

  if (slot === 'morning') {
    if (['work','study','dev','code','morning','focus','grind'].includes(n)) return 20;
    if (['chill','music','game','relax','evening'].includes(n)) return -5;
    return 3;
  }
  if (slot === 'afternoon') {
    if (['work','study','dev'].includes(n)) return 10;
    if (['chill','game','relax'].includes(n)) return 5;
    return 3;
  }
  if (slot === 'night') {
    if (['chill','music','game','relax','evening','unwind'].includes(n)) return 20;
    if (['work','study','dev'].includes(n)) return -5;
    return 3;
  }
  return 0;
}

// ══════════════════════════════════════════════════════════════════════════
//  FUZZY SEARCH ENGINE
// ══════════════════════════════════════════════════════════════════════════
function fuzzyScore(str, query) {
  if (!query) return 0;
  const s = str.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  let si = 0, qi = 0;
  while (si < s.length && qi < q.length) { if (s[si] === q[qi]) qi++; si++; }
  if (qi < q.length) return -1;

  let score = 0, qi2 = 0, prevMatch = -1, runLen = 0, firstMatch = -1;
  for (let i = 0; i < s.length && qi2 < q.length; i++) {
    if (s[i] === q[qi2]) {
      if (firstMatch === -1) firstMatch = i;
      if (prevMatch === i - 1) { runLen++; score += 10 * runLen; }
      else { runLen = 1; score += 10; }
      if (i === 0 || s[i-1] === ' ' || s[i-1] === '-' || s[i-1] === '_') score += 40;
      score -= i * 0.5;
      prevMatch = i; qi2++;
    }
  }
  if (s.startsWith(q)) score += 80;
  if (firstMatch === 0) score += 60;
  if (s === q)          score += 200;
  return Math.max(score, 0);
}

// scoreItem: fuzzy match + usage bonus + context/velocity bonuses
function scoreItem(item, query) {
  if (!query) return 0;
  const nameSc = fuzzyScore(item.name, query);
  let   tagSc  = -1;
  (item.tags || []).forEach(t => { const s = fuzzyScore(t, query); if (s > tagSc) tagSc = s; });
  if (nameSc < 0 && tagSc < 0) return -1;
  const base           = Math.max(nameSc, tagSc * 0.6);
  const usageBonus     = Math.log2((item.usage || 0) + 1) * 15;
  // Fold in a fraction of context/velocity so frequent/relevant items rank higher in search
  const contextBonus   = getContextBoostForItem(item) * 0.35;
  const velocityBonus  = getVelocityBoost(`item_${item.id}`) * 0.5;
  return base + usageBonus + contextBonus + velocityBonus;
}

// frecencyScore: for empty-input suggestions — full formula
function frecencyScore(item) {
  const now        = Date.now();
  const hoursSince = (now - (item.lastOpened || 0)) / 3_600_000;
  // Tiered recency decay: very recent items get maximum boost
  const recency = hoursSince < 0.5  ? 100
    : hoursSince < 2   ? Math.max(0, 100 - (hoursSince - 0.5) * 18)
    : hoursSince < 8   ? Math.max(0, 73  - (hoursSince - 2)   * 5)
    : Math.max(0, 43 - hoursSince * 1.0);
  const usagePart     = Math.log2((item.usage || 0) + 1) * 30;
  const contextBoost  = getContextBoostForItem(item);
  const memoryBoost   = getTimeSlotBoost(`item_${item.id}`);
  const velocityBoost = getVelocityBoost(`item_${item.id}`);
  return usagePart + recency + contextBoost + memoryBoost + velocityBoost;
}


// ── Flow quality validator ────────────────────────────────────────────────
// Returns 0 (broken/empty) to 1.0 (fully valid).
// Used to gate flow scoring and prevent broken flows from ranking high.
function getFlowQuality(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  let valid = 0;
  for (const step of steps) {
    if (!step || !step.type) continue;
    const val = (step.value || '').trim();
    if (!val) continue;
    if (step.type === 'url' && !val.startsWith('http')) continue; // malformed URL
    valid++;
  }
  if (valid === 0) return 0;
  return valid / steps.length; // partial validity: 0.5 = half steps valid
}

// ── Flow frecency score — includes quality gate to exclude broken flows
function flowFrecencyScore(name) {
  const steps   = appData.flows?.[name];
  const quality = getFlowQuality(steps);
  if (quality === 0) return -999; // empty or all-invalid: exclude from suggestions

  const ctxBoost  = getContextBoostForFlow(name);
  const memBoost  = getTimeSlotBoost(`flow_${name}`) * 1.5;
  const velBoost  = getVelocityBoost(`flow_${name}`);
  const cmdIdx    = appData.recentCommands.indexOf(`flow ${name}`);
  const recency   = cmdIdx === -1 ? 0 : Math.max(0, 60 - cmdIdx * 12);
  const rawScore  = ctxBoost + memBoost + velBoost + recency;
  // Scale by quality: partially-broken flows score proportionally lower
  return rawScore * (quality < 1 ? Math.max(0.4, quality) : 1);
}

// ══════════════════════════════════════════════════════════════════════════
//  USAGE / RECENCY TRACKING
// ══════════════════════════════════════════════════════════════════════════
async function trackUsage(item) {
  const idx = appData.items.findIndex(i => i.id === item.id);
  if (idx === -1) return;
  appData.items[idx].usage      = (appData.items[idx].usage || 0) + 1;
  appData.items[idx].lastOpened = Date.now();
  recordUsageMeta(`item_${item.id}`);
  await saveData();
}

async function trackCommand(cmdString) {
  if (!cmdString || !cmdString.trim()) return;
  appData.recentCommands = [
    cmdString,
    ...appData.recentCommands.filter(c => c !== cmdString)
  ].slice(0, 20);
  maybeCleanupMeta(); // lightweight periodic cleanup
  await saveData();
}

async function trackFlowUsage(flowName) {
  recordUsageMeta(`flow_${flowName}`);
  await saveData();
}

// ══════════════════════════════════════════════════════════════════════════
//  MUSIC SYSTEM
// ══════════════════════════════════════════════════════════════════════════
function playMusic(filePath) {
  if (!filePath) return;
  if (musicAudio && musicPlaying && musicFile === filePath) return;
  stopMusic(true);
  musicFile = filePath;
  musicAudio = new Audio();
  musicAudio.src = filePath;
  musicAudio.volume = 0.7;
  musicAudio.loop = true;
  const playPromise = musicAudio.play();
  if (playPromise !== undefined) {
    playPromise.then(() => { musicPlaying = true; updateMusicBar(); })
      .catch(() => { showToast('Could not play audio — check file path', 'error'); musicFile = ''; musicPlaying = false; musicAudio = null; updateMusicBar(); });
  }
  musicAudio.addEventListener('ended', () => { musicPlaying = false; updateMusicBar(); });
}

function toggleMusic() {
  if (!musicAudio) return;
  if (musicPlaying) { musicAudio.pause(); musicPlaying = false; }
  else { musicAudio.play().then(() => { musicPlaying = true; }).catch(() => {}); }
  updateMusicBar();
}

function stopMusic(silent = false) {
  if (musicAudio) { musicAudio.pause(); musicAudio.src = ''; musicAudio = null; }
  musicPlaying = false; musicFile = '';
  document.body.classList.remove('has-music');
  if (!silent) { musicBar.style.display = 'none'; }
}

function updateMusicBar() {
  if (!musicBar) return;
  if (musicFile) {
    musicBar.style.display = 'flex'; document.body.classList.add('has-music');
    const name = musicFile.split(/[/\\]/).pop();
    if (musicTitle) musicTitle.textContent = name || musicFile;
    if (musicToggleBtn) musicToggleBtn.textContent = musicPlaying ? '⏸' : '▶';
  } else { musicBar.style.display = 'none'; document.body.classList.remove('has-music'); }
}

if (musicToggleBtn) musicToggleBtn.addEventListener('click', toggleMusic);
if (musicStopBtn)   musicStopBtn.addEventListener('click', () => stopMusic(false));

// ══════════════════════════════════════════════════════════════════════════
//  FLOW SYSTEM
// ══════════════════════════════════════════════════════════════════════════
async function executeFlow(flowName) {
  const flow = appData.flows && appData.flows[flowName];
  if (!flow || !Array.isArray(flow) || flow.length === 0) { showToast(`Flow "${flowName}" not found`, 'error'); return; }
  showToast(`▶ ${flowName} — ${flow.length} step${flow.length !== 1 ? 's' : ''}`, 'success');
  await trackCommand(`flow ${flowName}`);
  await trackFlowUsage(flowName);
  for (let i = 0; i < flow.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 200));
    await executeFlowStep(flow[i]);
  }
}

async function executeFlowStep(step) {
  if (step.type === 'url') {
    await window.coreDeck.openItem(step.value, 'url');
  } else if (step.type === 'music') {
    playMusic(step.value);
  } else if (step.type === 'app') {
    const q = step.value.toLowerCase();
    const scored = appData.items.map(item => ({ item, score: scoreItem(item, q) })).filter(x => x.score >= 0).sort((a, b) => b.score - a.score);
    if (scored.length > 0) { await window.coreDeck.openItem(scored[0].item.path, scored[0].item.type); await trackUsage(scored[0].item); }
    else { const r = await window.coreDeck.runSystemCmd(q); if (!r.success) showToast(`Step skipped: ${step.value}`, 'error'); }
  } else if (step.type === 'file') {
    await window.coreDeck.openItem(step.value, 'file');
  } else if (step.type === 'folder') {
    await window.coreDeck.openItem(step.value, 'folder');
  } else if (step.type === 'command') {
    const parsed = parseCommand(step.value);
    if (parsed.isCommand) await executeCommand(parsed);
  }
}

function scoreFlow(name, query) {
  // Validate flow before scoring — empty/broken flows never appear in results
  const quality = getFlowQuality(appData.flows?.[name]);
  if (quality === 0) return -1;

  const s = fuzzyScore(name, query);
  if (s < 0) return -1;
  const base = name.toLowerCase() === query.toLowerCase() ? s + 300 : s;
  return quality < 1 ? base * Math.max(0.5, quality) : base;
}

function getFlowTemplates() {
  const all = [
    { name: 'work',  steps: [{ type: 'app', value: 'browser' }, { type: 'app', value: 'notepad' }], desc: 'Open browser + notes' },
    { name: 'study', steps: [{ type: 'url', value: 'https://google.com' }, { type: 'app', value: 'notepad' }], desc: 'Google + notes' },
    { name: 'chill', steps: [{ type: 'url', value: 'https://youtube.com' }], desc: 'Open YouTube' },
    { name: 'game',  steps: [{ type: 'app', value: 'steam' }], desc: 'Launch game launcher' },
    { name: 'dev',   steps: [{ type: 'url', value: 'https://github.com' }, { type: 'app', value: 'notepad' }], desc: 'GitHub + editor' },
    { name: 'music', steps: [{ type: 'app', value: 'spotify' }], desc: 'Launch music player' },
  ];
  return all.filter(t => !appData.flows || !appData.flows[t.name]);
}

async function addFlowFromTemplate(template) {
  if (!appData.flows) appData.flows = {};
  appData.flows[template.name] = template.steps;
  await saveData(); await trackCommand(`flow add ${template.name}`);
  showToast(`Flow "${template.name}" added`, 'success');
  searchInput.value = ''; searchQuery = ''; gtMode = false;
  searchInput.classList.remove('gt-mode-active', 'cmd-active'); clearCommandPreview(); renderAll();
}

// ══════════════════════════════════════════════════════════════════════════
//  FLOWS PANEL
// ══════════════════════════════════════════════════════════════════════════
function openFlowsPanel() { renderFlowsPanel(); if (flowsPanelOverlay) flowsPanelOverlay.style.display = 'flex'; }
function closeFlowsPanel() { if (flowsPanelOverlay) flowsPanelOverlay.style.display = 'none'; }

function renderFlowsPanel() {
  if (!flowsPanelBody) return;
  flowsPanelBody.innerHTML = '';
  if (!appData.flows || Object.keys(appData.flows).length === 0) {
    flowsPanelBody.innerHTML = '<div class="flows-empty">No flows yet.<br>Click "Add Flow" to create one.</div>'; return;
  }
  Object.entries(appData.flows).forEach(([name, steps]) => {
    const stepsPreview = (steps || []).slice(0, 3).map(s => {
      const label = s.type === 'url' ? (s.value.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) : s.value;
      return esc(label);
    }).join(' → ') + ((steps || []).length > 3 ? ' …' : '');
    const row = document.createElement('div');
    row.className = 'flow-panel-row';
    const warnBadge = getFlowQuality(steps) === 0 ? ' ⚠' : '';
    row.innerHTML = `<div class="flow-panel-info"><span class="flow-panel-name">${esc(name)}${warnBadge}</span><span class="flow-panel-steps">${(steps || []).length} step${(steps || []).length !== 1 ? 's' : ''} · ${stepsPreview}</span></div><button class="flow-panel-run" title="Run flow">▶</button><button class="flow-panel-delete" title="Delete flow">🗑</button>`;
    row.querySelector('.flow-panel-run').addEventListener('click', async () => { closeFlowsPanel(); await executeFlow(name); searchInput.value = ''; searchQuery = ''; renderDisplay(); });
    row.querySelector('.flow-panel-delete').addEventListener('click', async () => { await deleteFlow(name); });
    flowsPanelBody.appendChild(row);
  });
}

async function deleteFlow(name) {
  if (!appData.flows || !appData.flows[name]) return;
  delete appData.flows[name];
  await saveData(); showToast(`Flow "${name}" deleted`, 'error');
  renderFlowsPanel(); renderAll();
}

document.getElementById('flows-panel-btn')?.addEventListener('click', openFlowsPanel);
document.getElementById('flows-panel-close')?.addEventListener('click', closeFlowsPanel);
document.getElementById('flows-panel-add-btn')?.addEventListener('click', () => { closeFlowsPanel(); openFlowBuilder(); });
flowsPanelOverlay?.addEventListener('click', e => { if (e.target === flowsPanelOverlay) closeFlowsPanel(); });

// ══════════════════════════════════════════════════════════════════════════
//  FLOW BUILDER UI
// ══════════════════════════════════════════════════════════════════════════
function openFlowBuilder(editName) {
  fbSteps = [];
  if (editName && appData.flows && appData.flows[editName]) {
    fbFlowName.value = editName;
    fbSteps = appData.flows[editName].map((s, i) => ({ ...s, id: i }));
  } else { fbFlowName.value = ''; }
  fbRender(); fbOverlay.style.display = 'flex';
  setTimeout(() => fbFlowName.focus(), 80);
}

function closeFlowBuilder() { fbOverlay.style.display = 'none'; fbSteps = []; fbDragIdx = null; }

function fbRender() {
  if (!fbStepsList) return;
  fbStepsList.innerHTML = '';
  fbSteps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'fb-step-row'; row.draggable = true; row.dataset.idx = idx;
    const typeOpts = ['app','url','file','folder','command','music'];
    const typeSelect = `<select class="fb-step-type">${typeOpts.map(t => `<option value="${t}"${step.type===t?' selected':''}>${t}</option>`).join('')}</select>`;
    row.innerHTML = `<span class="fb-drag-handle" title="Drag to reorder">⠿</span>${typeSelect}<input class="fb-step-value" type="text" value="${esc(step.value || '')}" placeholder="${getStepPlaceholder(step.type)}" />${step.type==='music'||step.type==='file'||step.type==='folder'?`<button class="fb-browse-btn" data-idx="${idx}" title="Browse">📂</button>`:''}<button class="fb-remove-btn" data-idx="${idx}" title="Remove">✕</button>`;
    row.querySelector('.fb-step-type').addEventListener('change', e => { fbSteps[idx].type = e.target.value; fbSteps[idx].value = ''; fbRender(); });
    row.querySelector('.fb-step-value').addEventListener('input', e => { fbSteps[idx].value = e.target.value; });
    row.querySelector('.fb-remove-btn').addEventListener('click', () => { fbSteps.splice(idx, 1); fbRender(); });
    const browseBtn = row.querySelector('.fb-browse-btn');
    if (browseBtn) { browseBtn.addEventListener('click', async () => { const result = await window.coreDeck.openFilePicker({ title: 'Select file' }); if (!result.canceled && result.filePaths && result.filePaths.length > 0) { fbSteps[idx].value = result.filePaths[0]; fbRender(); } }); }
    row.addEventListener('dragstart', () => { fbDragIdx = idx; row.classList.add('fb-dragging'); });
    row.addEventListener('dragend',   () => { fbDragIdx = null; row.classList.remove('fb-dragging'); fbRender(); });
    row.addEventListener('dragover',  e => { e.preventDefault(); row.classList.add('fb-drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('fb-drag-over'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('fb-drag-over'); if (fbDragIdx === null || fbDragIdx === idx) return; const moved = fbSteps.splice(fbDragIdx, 1)[0]; fbSteps.splice(idx, 0, moved); fbDragIdx = null; fbRender(); });
    fbStepsList.appendChild(row);
  });
}

function getStepPlaceholder(type) {
  return { app:'app name or path', url:'https://…', file:'C:\\path\\to\\file', folder:'C:\\path\\to\\folder', command:'theme obsidian', music:'path/to/song.mp3' }[type] || '';
}

async function saveFlowFromBuilder() {
  const name = (fbFlowName.value || '').trim().toLowerCase();
  if (!name) { fbFlowName.focus(); showToast('Enter a flow name', 'error'); return; }
  if (fbSteps.length === 0) { showToast('Add at least one step', 'error'); return; }
  const invalid = fbSteps.find(s => !s.value || !s.value.trim());
  if (invalid) { showToast('Fill in all step values', 'error'); return; }
  if (!appData.flows) appData.flows = {};
  appData.flows[name] = fbSteps.map(({ type, value }) => ({ type, value: value.trim() }));
  await saveData(); await trackCommand(`flow add ${name}`);
  showToast(`Flow "${name}" saved`, 'success'); closeFlowBuilder(); renderAll();
}

document.getElementById('fb-add-step-btn')?.addEventListener('click', () => { fbSteps.push({ type: 'app', value: '', id: Date.now() }); fbRender(); });
document.getElementById('fb-save-btn')?.addEventListener('click', saveFlowFromBuilder);
document.getElementById('fb-cancel-btn')?.addEventListener('click', closeFlowBuilder);
document.getElementById('fb-overlay')?.addEventListener('click', e => { if (e.target === fbOverlay) closeFlowBuilder(); });
document.getElementById('flow-builder-btn')?.addEventListener('click', () => openFlowBuilder());

// ══════════════════════════════════════════════════════════════════════════
//  SMART INTENT SYSTEM — expanded phrase detection + verb/target matching
// ══════════════════════════════════════════════════════════════════════════
const INTENT_PHRASES = [
  // Boredom / entertainment
  { patterns: ['im bored','bored','nothing to do','entertain me','got nothing','what to do','killing time','pass the time','nothing on','so bored'],   flow: 'chill',  target: 'youtube' },
  { patterns: ['lets chill','time to chill','chill out','just relax','relaxing','kick back','take a break','unwind','need a break','chilling'],         flow: 'chill',  target: 'youtube' },
  { patterns: ['watch something','want to watch','watch a video','watch youtube','open video','see something','show me something','watch stuff'],         flow: 'chill',  target: 'youtube' },
  { patterns: ['play something','want to play','something to watch','play a video','show something'],                                                     flow: 'chill',  target: 'youtube' },
  // Work / focus
  { patterns: ['start work','time to work','back to work','work mode','get to work','working','lets work','work time','focus time','need to be productive'],  flow: 'work', target: null },
  { patterns: ['i need to work','need to focus','focus mode','deep work','work session','get productive','productivity mode','no distractions'],              flow: 'work', target: null },
  { patterns: ['boss mode','get things done','grind time','hustle time'],                                                                                      flow: 'work', target: null },
  // Coding / dev
  { patterns: ['lets code','coding time','dev mode','code something','open github','write code','coding session','hack time','code time'],                flow: 'dev',    target: null },
  { patterns: ['start coding','programming','open vscode','open editor','write some code','dev time'],                                                    flow: 'dev',    target: null },
  // Study / learning
  { patterns: ['study time','time to study','lets study','study session','learning mode','time to learn'],                                                flow: 'study',  target: null },
  { patterns: ['i need to study','do some studying','homework time','read something','learning time','revision time'],                                    flow: 'study',  target: null },
  // Music
  { patterns: ['play music','music time','listen to music','put on music','need music','some music','background music'],                                  flow: 'music',  target: 'music' },
  { patterns: ['i want music','play a song','stream music','queue some music','play songs','give me music'],                                              flow: 'music',  target: 'music' },
  // Gaming
  { patterns: ['game time','lets game','gaming','play games','start gaming','time to game','i want to game'],                                             flow: 'game',   target: null },
  { patterns: ['open steam','launch game','game session','lets play games'],                                                                              flow: 'game',   target: null },
];

const INTENT_MAP = {
  verbs: {
    open:   ['open','launch','start','run','load','use','boot','fire'],
    watch:  ['watch','view','see'],
    play:   ['play','listen','hear','stream'],
    search: ['search','find','look','google','lookup','browse','query'],
    edit:   ['edit','write','create','type','make','draft','note'],
  },
  targets: {
    browser:    { words: ['browser','chrome','edge','firefox','web','internet','surf'],                    url: null,                      appHint: 'browser',    label: 'Browser' },
    youtube:    { words: ['youtube','yt','video','videos','tube','watching'],                              url: 'https://youtube.com',     appHint: null,         label: 'YouTube' },
    music:      { words: ['music','songs','spotify','tunes','audio','song'],                               url: null,                      appHint: 'spotify',    label: 'Music' },
    notepad:    { words: ['notepad','notes','text','editor','pad','writing'],                              url: null,                      appHint: 'notepad',    label: 'Notepad' },
    files:      { words: ['files','explorer','downloads','documents','folder'],                            url: null,                      appHint: 'explorer',   label: 'File Explorer' },
    calculator: { words: ['calculator','calc','math','calculate','compute'],                               url: null,                      appHint: 'calculator', label: 'Calculator' },
    terminal:   { words: ['terminal','cmd','command','console','shell','prompt'],                          url: null,                      appHint: 'cmd',        label: 'Terminal' },
    github:     { words: ['github','git','repo','repos','code'],                                          url: 'https://github.com',      appHint: null,         label: 'GitHub' },
    google:     { words: ['google','search engine'],                                                       url: 'https://google.com',      appHint: null,         label: 'Google' },
    settings:   { words: ['settings','preferences','options','config'],                                    url: null,                      appHint: 'settings',   label: 'Settings' },
    paint:      { words: ['paint','draw','drawing','image editor'],                                        url: null,                      appHint: 'paint',      label: 'Paint' },
  }
};

function parseNaturalIntent(input) {
  const lower = input.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // Exact flow name match
  if (appData.flows) {
    const exactFlow = Object.keys(appData.flows).find(n => n.toLowerCase() === lower);
    if (exactFlow) return { type: 'flow', name: exactFlow };
  }

  // Phrase-based mood/activity detection
  for (const entry of INTENT_PHRASES) {
    if (entry.patterns.some(p => lower.includes(p))) {
      if (appData.flows && appData.flows[entry.flow]) return { type: 'flow', name: entry.flow };
      if (entry.target) return { type: 'intent', verb: 'open', target: entry.target };
    }
  }

  // Verb + target detection
  let detectedVerb = null, detectedTarget = null;
  for (const [verb, syns] of Object.entries(INTENT_MAP.verbs)) {
    if (syns.some(s => words.includes(s))) { detectedVerb = verb; break; }
  }
  for (const [target, info] of Object.entries(INTENT_MAP.targets)) {
    if (info.words.some(w => words.includes(w))) { detectedTarget = target; break; }
  }
  if (!detectedTarget && !detectedVerb) return null;
  return { type: 'intent', verb: detectedVerb, target: detectedTarget };
}

function buildIntentResult(intent) {
  if (!intent) return null;
  if (intent.type === 'flow') {
    const steps = appData.flows[intent.name];
    return { kind: 'flow', data: { name: intent.name, steps }, score: 2000 };
  }
  if (intent.type === 'intent' && intent.target) {
    const info = INTENT_MAP.targets[intent.target];
    if (!info) return null;
    const scored = appData.items.map(i => ({ item: i, score: scoreItem(i, info.appHint || intent.target) })).filter(x => x.score >= 0).sort((a, b) => b.score - a.score);
    if (scored.length > 0) return { kind: 'item', data: scored[0].item, score: 1500 };
    return { kind: 'intentAction', data: { target: intent.target, info, verb: intent.verb }, score: 1500 };
  }
  return null;
}

async function executeIntentAction(data) {
  const { info, target } = data;
  if (info.url) { await window.coreDeck.openItem(info.url, 'url'); showToast(`Opening ${info.label}`, 'success'); return; }
  if (info.appHint) {
    const scored = appData.items.map(i => ({ item: i, score: scoreItem(i, info.appHint) })).filter(x => x.score >= 0).sort((a, b) => b.score - a.score);
    if (scored.length > 0) { await openItem(scored[0].item); return; }
    const r = await window.coreDeck.runSystemCmd(info.appHint);
    if (r.success) { showToast(`Launched ${info.label}`, 'success'); await trackCommand(`intent ${target}`); return; }
  }
  showToast(`Could not find ${info.label}`, 'error');
}

// ══════════════════════════════════════════════════════════════════════════
//  UNIFIED RESULTS — items + flows + intent, priority-ranked
// ══════════════════════════════════════════════════════════════════════════
function buildUnifiedResults(query) {
  const all = [];
  const q = query.toLowerCase().trim();
  const seen = new Set();

  // 1. Exact app/item name match
  appData.items.forEach(i => {
    if (i.name.toLowerCase() === q && !seen.has(`item_${i.id}`)) {
      all.push({ kind: 'item', data: i, score: 9000 + (i.usage || 0) });
      seen.add(`item_${i.id}`);
    }
  });

  // 2. Exact flow name match — validate before including
  if (appData.flows) {
    const exactFlow = Object.keys(appData.flows).find(n => n.toLowerCase() === q);
    if (exactFlow && !seen.has(`flow_${exactFlow}`)) {
      const quality = getFlowQuality(appData.flows[exactFlow]);
      if (quality > 0) {
        all.push({ kind: 'flow', data: { name: exactFlow, steps: appData.flows[exactFlow] }, score: 8500 * quality });
        seen.add(`flow_${exactFlow}`);
      }
    }
  }

  // 3. Intent phrase → flow or app
  const intent = parseNaturalIntent(query);
  if (intent) {
    if (intent.type === 'flow' && appData.flows?.[intent.name] && !seen.has(`flow_${intent.name}`)) {
      all.push({ kind: 'flow', data: { name: intent.name, steps: appData.flows[intent.name] }, score: 2000 });
      seen.add(`flow_${intent.name}`);
    } else if (intent.type === 'intent') {
      const ir = buildIntentResult(intent);
      if (ir) {
        const k = ir.kind === 'item' ? `item_${ir.data?.id}` : `intent_${intent.target}`;
        if (!seen.has(k)) { all.push(ir); seen.add(k); }
      }
    }
  }

  // 4. Fuzzy flow matches
  if (appData.flows) {
    Object.entries(appData.flows).forEach(([name, steps]) => {
      if (seen.has(`flow_${name}`)) return;
      const s = scoreFlow(name, query);
      if (s >= 0) { all.push({ kind: 'flow', data: { name, steps }, score: s + 200 }); seen.add(`flow_${name}`); }
    });
  }

  // 5. Fuzzy item matches
  let items = appData.items;
  if (activeTypeFilter !== 'all') items = items.filter(i => i.type === activeTypeFilter);
  if (activeTag) items = items.filter(i => i.tags && i.tags.includes(activeTag));
  items.forEach(i => {
    if (seen.has(`item_${i.id}`)) return;
    const s = scoreItem(i, query);
    if (s >= 0) { all.push({ kind: 'item', data: i, score: s }); seen.add(`item_${i.id}`); }
  });

  return all.sort((a, b) => b.score - a.score).slice(0, 12);
}

// ══════════════════════════════════════════════════════════════════════════
//  ENTER KEY PRIORITY RESOLUTION — exact → flow → intent → fuzzy flow → no fallback
// ══════════════════════════════════════════════════════════════════════════
async function resolveAndExecuteEnter(raw) {
  const query = raw.trim();
  if (!query) return;
  const q = query.toLowerCase();

  // 1. Exact app match
  const exactItem = appData.items.find(i => i.name.toLowerCase() === q);
  if (exactItem) { await openItem(exactItem); clearSearch(); return; }

  // 2. Exact flow match — guard against broken flows
  if (appData.flows) {
    const exactFlow = Object.keys(appData.flows).find(n => n.toLowerCase() === q);
    if (exactFlow) {
      if (getFlowQuality(appData.flows[exactFlow]) > 0) { await executeFlow(exactFlow); clearSearch(); return; }
      else { showToast(`Flow "${exactFlow}" has no valid steps`, 'error'); return; }
    }
  }

  // 3. Intent phrase → flow or action
  const intent = parseNaturalIntent(query);
  if (intent) {
    if (intent.type === 'flow' && appData.flows?.[intent.name]) {
      await executeFlow(intent.name); clearSearch(); return;
    }
    if (intent.type === 'intent') {
      const ir = buildIntentResult(intent);
      if (ir) {
        if (ir.kind === 'flow')         { await executeFlow(ir.data.name);        clearSearch(); return; }
        if (ir.kind === 'item')         { await openItem(ir.data);                clearSearch(); return; }
        if (ir.kind === 'intentAction') { await executeIntentAction(ir.data);     clearSearch(); return; }
      }
    }
  }

  // 4. Best fuzzy item match
  const scored = appData.items.map(i => ({ item: i, score: scoreItem(i, query) })).filter(x => x.score >= 0).sort((a, b) => b.score - a.score);
  if (scored.length > 0) { await openItem(scored[0].item); clearSearch(); return; }

  // 5. Fuzzy flow match
  if (appData.flows) {
    const scoredFlows = Object.entries(appData.flows)
      .map(([name, steps]) => ({ name, steps, score: scoreFlow(name, query) }))
      .filter(x => x.score >= 0).sort((a, b) => b.score - a.score);
    if (scoredFlows.length > 0) { await executeFlow(scoredFlows[0].name); clearSearch(); return; }
  }

  showToast(`No match for "${query}" — try > g ${query} to search`, 'error');
}

function clearSearch() {
  searchInput.value = ''; searchQuery = ''; gtMode = false;
  searchInput.classList.remove('cmd-active', 'gt-mode-active'); clearCommandPreview(); renderDisplay();
}

// ══════════════════════════════════════════════════════════════════════════
//  SMART SUGGESTIONS — fully dynamic, context + memory + velocity ranked
// ══════════════════════════════════════════════════════════════════════════
const MAX_SUGGESTIONS = 8;

function buildSuggestions() {
  const suggestions = [];
  const seen = new Set();

  // 1. Score ALL flows by context + memory + velocity + recency
  if (appData.flows && Object.keys(appData.flows).length > 0) {
    const scoredFlows = Object.entries(appData.flows)
      .map(([name, steps]) => ({ name, steps, score: flowFrecencyScore(name) }))
      .filter(f => f.score > 0)
      .sort((a, b) => b.score - a.score);

    scoredFlows.slice(0, 3).forEach(f => {
      if (!seen.has(`flow_${f.name}`)) {
        suggestions.push({ kind: 'flow', data: { name: f.name, steps: f.steps } });
        seen.add(`flow_${f.name}`);
      }
    });
  }

  // 2. Top items by enhanced frecency (context + velocity aware)
  const itemSlots = Math.max(0, 5 - suggestions.length);
  appData.items
    .map(i => ({ item: i, score: frecencyScore(i) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, itemSlots)
    .forEach(x => {
      if (!seen.has(`item_${x.item.id}`)) {
        suggestions.push({ kind: 'item', data: x.item });
        seen.add(`item_${x.item.id}`);
      }
    });

  // 3. Recent commands (non-flow)
  const cmdSlots = Math.max(0, MAX_SUGGESTIONS - suggestions.length);
  appData.recentCommands
    .filter(c => !c.startsWith('flow '))
    .slice(0, Math.min(3, cmdSlots))
    .forEach(cmd => suggestions.push({ kind: 'recentCmd', data: cmd }));

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// ══════════════════════════════════════════════════════════════════════════
//  SAFE MATH EVALUATOR
// ══════════════════════════════════════════════════════════════════════════
function safeCalc(expr) {
  try {
    if (!expr || !expr.trim()) return null;
    const sanitized = expr.trim().replace(/[^0-9+\-*/.()%^sqrtabcdeiklonphi\s]/gi, '');
    const jsExpr = sanitized
      .replace(/\^/g, '**').replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\babs\b/g, 'Math.abs').replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan').replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
      .replace(/\bceil\b/g, 'Math.ceil').replace(/\bfloor\b/g, 'Math.floor').replace(/\bround\b/g, 'Math.round');
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${jsExpr})`)();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return Number.isInteger(result) ? result : parseFloat(result.toFixed(10));
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════
//  ">" GT-MODE
// ══════════════════════════════════════════════════════════════════════════
const GT_SYSTEM_APPS = [
  'settings','control panel','task manager','notepad','cmd','terminal',
  'explorer','file explorer','paint','calculator','wordpad',
  'device manager','disk management','registry','snipping tool','windows store'
];

function parseGtSubCommand(query) {
  if (!query) return null;
  const q = query.trim(), lower = q.toLowerCase();
  if (lower === 'flow' || lower.startsWith('flow ')) {
    const sub = lower === 'flow' ? '' : q.slice(5).trim(), subLower = sub.toLowerCase();
    if (!sub || subLower === 'list') return { type: 'flowManage', action: 'list' };
    if (subLower === 'add' || subLower.startsWith('add')) return { type: 'flowManage', action: 'add', name: subLower.startsWith('add ') ? sub.slice(4).trim() : '' };
    if (subLower.startsWith('run ')) return { type: 'flowManage', action: 'run', name: sub.slice(4).trim() };
    return { type: 'flowManage', action: 'run', name: sub };
  }
  if (lower === 'add' || lower.startsWith('add ')) return { type: 'addApp', name: lower === 'add' ? '' : q.slice(4).trim() };
  if (lower.startsWith('yt ') || lower === 'yt') return { type: 'ytSearch', term: q.slice(2).trim() };
  if (lower.startsWith('youtube ')) return { type: 'ytSearch', term: q.slice(8).trim() };
  if (/^g\s+/.test(lower) || lower.startsWith('google ')) return { type: 'gSearch', term: lower.startsWith('google ') ? q.slice(7).trim() : q.slice(2).trim() };
  if (lower.startsWith('calc ') || lower === 'calc' || lower.startsWith('= ') || lower === '=') return { type: 'calc', expr: lower.startsWith('= ') ? q.slice(2).trim() : q.slice(4).trim() };
  if (lower.startsWith('open ')) return { type: 'openApp', name: q.slice(5).trim() };
  return null;
}

function buildGtResults(query) {
  const results = [];
  if (!query) {
    if (appData.items.length === 0) { results.push({ kind: 'addApp', data: { name: '' }, score: 9999 }); return results; }
    if (appData.flows) {
      Object.entries(appData.flows).slice(0, 3).forEach(([name, steps]) => {
        const score = 500 + getContextBoostForFlow(name) + getTimeSlotBoost(`flow_${name}`) * 0.5 + getVelocityBoost(`flow_${name}`);
        results.push({ kind: 'flow', data: { name, steps }, score });
      });
    }
    appData.items.map(i => ({ item: i, score: frecencyScore(i) })).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 6).forEach(x => results.push({ kind: 'item', data: x.item, score: x.score }));
    return results;
  }
  const sub = parseGtSubCommand(query);
  if (sub) {
    if (sub.type === 'flowManage') {
      if (sub.action === 'list') {
        if (appData.flows && Object.keys(appData.flows).length > 0) Object.entries(appData.flows).forEach(([name, steps]) => results.push({ kind: 'flow', data: { name, steps }, score: 9999 }));
        results.push({ kind: 'flowAddPrompt', data: {}, score: -1 }); return results;
      }
      if (sub.action === 'add') {
        const templates = getFlowTemplates(), filtered = sub.name ? templates.filter(t => fuzzyScore(t.name, sub.name) >= 0) : templates;
        (filtered.length > 0 ? filtered : templates).forEach(t => results.push({ kind: 'flowTemplate', data: t, score: 9999 }));
        if (results.length === 0) results.push({ kind: 'flowAddPrompt', data: { all: true }, score: 0 });
        return results;
      }
      if (sub.action === 'run') {
        if (appData.flows && appData.flows[sub.name]) { results.push({ kind: 'flow', data: { name: sub.name, steps: appData.flows[sub.name] }, score: 9999 }); }
        else if (appData.flows) { Object.entries(appData.flows).forEach(([name, steps]) => { const s = fuzzyScore(name, sub.name); if (s >= 0) results.push({ kind: 'flow', data: { name, steps }, score: s }); }); }
        return results;
      }
    }
    if (sub.type === 'addApp') { results.push({ kind: 'addApp', data: { name: sub.name }, score: 9999 }); return results; }
    if (sub.type === 'ytSearch') { results.push({ kind: 'ytSearch', data: sub.term, score: 9999 }); return results; }
    if (sub.type === 'gSearch')  { results.push({ kind: 'gSearch',  data: sub.term, score: 9999 }); return results; }
    if (sub.type === 'calc') { results.push({ kind: 'calc', data: { expr: sub.expr, result: safeCalc(sub.expr) }, score: 9999 }); return results; }
    if (sub.type === 'openApp') {
      const name = sub.name;
      appData.items.forEach(i => { const s = scoreItem(i, name); if (s >= 0) results.push({ kind: 'item', data: i, score: s + 500 }); });
      GT_SYSTEM_APPS.forEach(n => { const s = fuzzyScore(n, name); if (s >= 0 && !results.some(r => r.kind === 'item' && r.data.name.toLowerCase() === n)) results.push({ kind: 'syscmd', data: n, score: s + 500 }); });
      if (results.length === 0 && name) results.push({ kind: 'gSearch', data: name, score: 1 });
      return results.sort((a,b) => b.score - a.score).slice(0, 8);
    }
  }
  if (appData.flows) { Object.entries(appData.flows).forEach(([name, steps]) => { const s = scoreFlow(name, query); if (s >= 0) results.push({ kind: 'flow', data: { name, steps }, score: s + 100 }); }); }
  appData.items.forEach(i => { const s = scoreItem(i, query); if (s >= 0) results.push({ kind: 'item', data: i, score: s }); });
  GT_SYSTEM_APPS.forEach(name => { const s = fuzzyScore(name, query); if (s >= 0 && !results.some(r => r.kind === 'item' && r.data.name.toLowerCase() === name)) results.push({ kind: 'syscmd', data: name, score: s }); });
  results.push({ kind: 'gSearch', data: query, score: -1 });
  return results.sort((a,b) => b.score - a.score).slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════
//  > ADD COMMAND
// ══════════════════════════════════════════════════════════════════════════
async function executeAddApp(suggestedName) {
  try {
    const result = await window.coreDeck.openFilePicker({ title: 'Select Application to Add' });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;
    const filePath = result.filePaths[0];
    let name = suggestedName && suggestedName.trim() ? suggestedName.trim() : filePath.split(/[/\\]/).pop().replace(/\.(exe|app|bat|cmd|lnk)$/i, '');
    name = name.charAt(0).toUpperCase() + name.slice(1);
    appData.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, path: filePath, type: 'app', tags: ['apps'], usage: 0, lastOpened: 0 });
    await saveData(); await trackCommand(`> add ${name}`);
    showToast(`"${name}" added`, 'success'); clearSearch(); renderAll();
  } catch { showToast('Could not add app', 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════
//  COMMAND SYSTEM
// ══════════════════════════════════════════════════════════════════════════
const COMMANDS = ['open', 'search', 'note', 'theme', 'clear', 'help'];

const HELP_LINES = [
  { cmd: 'open <n>',            desc: 'Open a saved item, system app, or Google fallback' },
  { cmd: 'search <engine> <q>', desc: 'Web search — google · youtube · github · bing · ddg' },
  { cmd: 'note <text>',         desc: 'Append a timestamped entry to Notes' },
  { cmd: 'theme <n>',           desc: 'Switch theme: obsidian · frost · ember · void · cyber · yin · steel · gold' },
  { cmd: 'clear notes',         desc: 'Wipe all Notes content' },
  { cmd: 'help',                desc: 'Show this reference' },
  { cmd: '> flow',              desc: 'List all flows' },
  { cmd: '> flow add',          desc: 'Add flow from templates' },
  { cmd: '> flow run <n>',      desc: 'Execute a flow' },
  { cmd: '> add [name]',        desc: 'Add an app via file picker' },
  { cmd: '> yt / > g <query>',  desc: 'Search YouTube or Google' },
  { cmd: '> calc <expr>',       desc: 'Evaluate math expression' },
  { cmd: 'im bored / start work', desc: 'Natural phrases trigger flows/apps intelligently' },
];

const SEARCH_ENGINES = {
  google:     q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube:    q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  github:     q => `https://github.com/search?q=${encodeURIComponent(q)}`,
  bing:       q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  ddg:        q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  reddit:     q => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
  twitter:    q => `https://twitter.com/search?q=${encodeURIComponent(q)}`,
  x:          q => `https://twitter.com/search?q=${encodeURIComponent(q)}`,
  npm:        q => `https://www.npmjs.com/search?q=${encodeURIComponent(q)}`,
  mdn:        q => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}`,
};

let currentParsed = null;

function parseCommand(raw) {
  if (!raw || !raw.trim()) return { isCommand: false };
  const trimmed = raw.trim(), lower = trimmed.toLowerCase();
  const verb = COMMANDS.find(c => lower === c || lower.startsWith(c+' ') || lower.startsWith(c+':') || lower.startsWith(c+'\t'));
  if (!verb) return { isCommand: false };
  const rest = trimmed.slice(verb.length).replace(/^[:\s]+/, '').trim();
  return { isCommand: true, verb, args: rest, raw: trimmed };
}

async function execOpen(args) {
  if (!args) return { ok: false, message: 'Usage: open <item name>' };
  const q = args.trim();
  const scored = appData.items.map(i => ({ item: i, score: scoreItem(i, q) })).filter(x => x.score >= 0).sort((a,b) => b.score - a.score);
  if (scored.length > 0) { await openItem(scored[0].item); return { ok: true, message: `Opened "${scored[0].item.name}"` }; }
  const sysResult = await window.coreDeck.runSystemCmd(q.toLowerCase());
  if (sysResult.success) { await trackCommand(`open ${q}`); return { ok: true, message: `Launched "${q}"` }; }
  await window.coreDeck.openItem(SEARCH_ENGINES.google(q), 'url');
  return { ok: true, message: `Searching Google for "${q}"` };
}

async function execSearch(args) {
  if (!args) return { ok: false, message: 'Usage: search [engine] <query>' };
  const parts = args.split(/\s+/), engineKey = parts[0].toLowerCase();
  let query, urlFn;
  if (SEARCH_ENGINES[engineKey]) { query = parts.slice(1).join(' ').trim(); urlFn = SEARCH_ENGINES[engineKey]; if (!query) return { ok: false, message: `Usage: search ${engineKey} <query>` }; }
  else { query = args.trim(); urlFn = SEARCH_ENGINES.google; }
  await window.coreDeck.openItem(urlFn(query), 'url'); await trackCommand(`search ${args.trim()}`);
  return { ok: true, message: `Searching "${query}"` };
}

async function executeCommand({ verb, args }) {
  switch (verb) {
    case 'open':   return execOpen(args);
    case 'search': return execSearch(args);
    case 'note': {
      if (!args) return { ok: false, message: 'Usage: note <text>' };
      const entry = `[${new Date().toLocaleString()}] ${args}`;
      appData.notes = appData.notes ? appData.notes + '\n' + entry : entry;
      notesArea.value = appData.notes; await saveData(); showSaveIndicator();
      await trackCommand(`note ${args}`); return { ok: true, message: 'Note saved' };
    }
    case 'theme': {
      const valid = ['obsidian','frost','ember','void','cyber','yin','steel','gold'], t = args.toLowerCase().trim();
      if (!valid.includes(t)) return { ok: false, message: `Unknown theme. Try: ${valid.join(', ')}` };
      applyTheme(t); await trackCommand(`theme ${t}`); return { ok: true, message: `Theme → "${t}"` };
    }
    case 'clear': {
      if (args.toLowerCase().trim() !== 'notes') return { ok: false, message: 'Usage: clear notes' };
      appData.notes = ''; notesArea.value = ''; await saveData(); await trackCommand('clear notes');
      return { ok: true, message: 'Notes cleared' };
    }
    case 'help': return { ok: true, message: null };
    default: return { ok: false, message: 'Unknown command' };
  }
}

// ── COMMAND PREVIEW ────────────────────────────────────────────────────────
function renderCommandPreview(parsed) {
  currentParsed = parsed;
  cardsGrid.innerHTML = ''; emptyState.style.display = 'none'; cardsGrid.style.display = 'grid';
  navItems = []; selectedIndex = -1;
  const hint = getCmdHint(parsed);
  const card = document.createElement('div');
  card.className = 'card cmd-preview-card';
  card.innerHTML = `<div class="card-icon cmd-icon">${getCmdIcon(parsed.verb)}</div><span class="card-name">${esc(hint.label)}</span><span class="card-type-badge cmd-badge">command</span><span class="cmd-hint-text">${esc(hint.detail)}</span>`;
  card.addEventListener('click', runCurrentCommand);
  cardsGrid.appendChild(card);
  if (parsed.verb === 'help') renderHelpCards();
  searchInput.classList.add('cmd-active');
  itemCountEl.textContent = '⌘ command mode';
}

function renderHelpCards() {
  HELP_LINES.forEach(({ cmd, desc }) => {
    const card = document.createElement('div');
    card.className = 'card cmd-help-card';
    card.innerHTML = `<span class="cmd-help-cmd">${esc(cmd)}</span><span class="cmd-help-desc">${esc(desc)}</span>`;
    card.addEventListener('click', () => { const c = cmd.replace(/^>\s*/, ''); searchInput.value = c.split(' ')[0] + ' '; searchInput.focus(); handleSearchInput(); });
    cardsGrid.appendChild(card);
  });
}

function clearCommandPreview() { currentParsed = null; searchInput.classList.remove('cmd-active'); }

function getCmdHint({ verb, args }) {
  switch (verb) {
    case 'open': { const q=(args||'').trim(); if(q){const b=appData.items.map(i=>({i,s:scoreItem(i,q)})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s)[0]; if(b) return {label:`Open: ${b.i.name}`,detail:'Best match · Enter to open'}; return {label:`Open: ${q}`,detail:'system → Google fallback'};} return {label:'Open: …',detail:'Item name, system app, or anything'}; }
    case 'search': { const parts=(args||'').split(/\s+/); const eng=parts[0]&&SEARCH_ENGINES[parts[0].toLowerCase()]?parts[0]:'google'; const q=SEARCH_ENGINES[parts[0]?.toLowerCase()]?parts.slice(1).join(' '):args; return {label:`Search ${eng}: ${q||'…'}`,detail:'Enter to search web'}; }
    case 'note':  return { label:`Note: ${args||'…'}`,  detail:'Enter · appends to Notes' };
    case 'theme': return { label:`Theme: ${args||'…'}`, detail:'Enter · switches theme' };
    case 'clear': return { label:`Clear: ${args||'…'}`, detail:'Enter · clears notes' };
    case 'help':  return { label:'Command Reference',   detail:'Click any command to start' };
    default:      return { label:args||verb,            detail:'Enter to execute' };
  }
}

function getCmdIcon(verb) {
  const icons = {
    open:   `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 11l6-6 6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="11" y1="5" x2="11" y2="17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    search: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.7" fill="none"/><line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    note:   `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><line x1="7" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="7" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="7" y1="14" x2="11" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    theme:  `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 3v8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    clear:  `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 5l12 12M17 5L5 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    help:   `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 9a2.5 2.5 0 015 .5c0 2-2.5 2.5-2.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="11" cy="16" r="0.9" fill="currentColor"/></svg>`,
  };
  return icons[verb] || icons.help;
}

async function runCurrentCommand() {
  if (!currentParsed) return;
  const result = await executeCommand(currentParsed);
  if (result.message) showToast(result.message, result.ok ? 'success' : 'error');
  if (result.ok) { clearSearch(); }
}

// ══════════════════════════════════════════════════════════════════════════
//  KEYBOARD NAVIGATION
// ══════════════════════════════════════════════════════════════════════════
function setSelectedIndex(idx) {
  if (navItems.length === 0) { selectedIndex = -1; return; }
  selectedIndex = ((idx % navItems.length) + navItems.length) % navItems.length;
  navItems.forEach((ni, i) => { if (ni.el) ni.el.classList.toggle('card-selected', i === selectedIndex); });
  const sel = navItems[selectedIndex];
  if (sel && sel.el) sel.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function moveSelection(delta) {
  if (navItems.length === 0) return;
  const next = selectedIndex < 0 ? (delta > 0 ? 0 : navItems.length - 1) : selectedIndex + delta;
  setSelectedIndex(next);
}

async function executeSelected() {
  if (selectedIndex < 0 || selectedIndex >= navItems.length) { if (currentParsed) { await runCurrentCommand(); return; } return; }
  const ni = navItems[selectedIndex];
  clearSearch();
  if (ni.kind === 'item') { await openItem(ni.data); }
  else if (ni.kind === 'recentCmd') {
    const parsed = parseCommand(ni.data);
    if (parsed.isCommand) { const r = await executeCommand(parsed); if (r.message) showToast(r.message, r.ok ? 'success' : 'error'); }
    await trackCommand(ni.data);
  }
  else if (ni.kind === 'syscmd') {
    const r = await window.coreDeck.runSystemCmd(ni.data);
    if (r.success) { showToast(`Launched "${ni.data}"`, 'success'); await trackCommand(`open ${ni.data}`); }
    else showToast(`Could not launch "${ni.data}"`, 'error');
  }
  else if (ni.kind === 'ytSearch') { await window.coreDeck.openItem(SEARCH_ENGINES.youtube(ni.data), 'url'); await trackCommand(`> yt ${ni.data}`); showToast(`YouTube: "${ni.data}"`, 'success'); }
  else if (ni.kind === 'gSearch')  { await window.coreDeck.openItem(SEARCH_ENGINES.google(ni.data), 'url');  await trackCommand(`> g ${ni.data}`);  showToast(`Google: "${ni.data}"`, 'success'); }
  else if (ni.kind === 'calc') {
    if (ni.data.result !== null) { try { await navigator.clipboard.writeText(String(ni.data.result)); showToast(`Copied: ${ni.data.result}`, 'success'); } catch { showToast(`= ${ni.data.result}`, 'success'); } }
    else showToast('Could not evaluate expression', 'error');
  }
  else if (ni.kind === 'addApp')      { await executeAddApp(ni.data.name); return; }
  else if (ni.kind === 'flow')        { await executeFlow(ni.data.name); }
  else if (ni.kind === 'flowTemplate'){ await addFlowFromTemplate(ni.data); return; }
  else if (ni.kind === 'flowAddPrompt'){ searchInput.value = '> flow add '; searchQuery = searchInput.value; gtMode = true; searchInput.classList.add('gt-mode-active'); handleSearchInput(); return; }
  else if (ni.kind === 'intentAction'){ await executeIntentAction(ni.data); }
  renderDisplay();
}

function registerNavItem(kind, data, el) {
  const idx = navItems.length;
  navItems.push({ kind, data, el });
  el.dataset.navIdx = idx;
  el.addEventListener('mouseenter', () => setSelectedIndex(idx));
}

// ══════════════════════════════════════════════════════════════════════════
//  GRID FADE
// ══════════════════════════════════════════════════════════════════════════
let gridFadeTimer = null;
function flashGridUpdate() {
  cardsGrid.classList.add('cards-updating');
  clearTimeout(gridFadeTimer);
  gridFadeTimer = setTimeout(() => cardsGrid.classList.remove('cards-updating'), 180);
}

// ══════════════════════════════════════════════════════════════════════════
//  RENDERING STATE MACHINE
// ══════════════════════════════════════════════════════════════════════════
function renderDisplay() {
  if (currentParsed) return;
  const raw = searchInput.value;
  if (raw.startsWith('>')) { renderGtMode(raw.slice(1).replace(/^\s*/, '')); return; }
  const q = raw.trim();
  if (!q) {
    if (searchFocused) renderSuggestions();
    else renderNormalGrid();
  } else { isSuggesting = false; renderCards(); }
}

function renderNormalGrid() {
  isSuggesting = false; navItems = []; selectedIndex = -1;
  flashGridUpdate(); cardsGrid.innerHTML = '';
  searchInput.classList.remove('gt-mode-active', 'cmd-active');
  emptyState.style.display = 'none';
  const items = getFilteredItems();
  if (items.length === 0) {
    cardsGrid.style.display = 'none'; emptyState.style.display = 'flex';
    emptyStateMsg.textContent = appData.items.length === 0 ? 'No apps added yet' : 'No items match filter';
    emptyStateHint.textContent = appData.items.length === 0 ? 'Click "Add Item" or type > add' : 'Try a different filter';
    itemCountEl.textContent = '0 items'; return;
  }
  cardsGrid.style.display = 'grid';
  items.forEach((item, idx) => { const card = createCard(item, idx, false); cardsGrid.appendChild(card); registerNavItem('item', item, card); });
  const all = appData.items.length;
  itemCountEl.textContent = `${all} item${all !== 1 ? 's' : ''}`;
}

function renderSuggestions() {
  isSuggesting = true; navItems = []; selectedIndex = -1;
  const suggestions = buildSuggestions();
  flashGridUpdate(); cardsGrid.innerHTML = ''; emptyState.style.display = 'none';

  if (appData.items.length === 0 && (!appData.flows || Object.keys(appData.flows).length === 0)) {
    isSuggesting = false; cardsGrid.style.display = 'none'; emptyState.style.display = 'flex';
    emptyStateMsg.textContent = 'No apps added yet';
    emptyStateHint.textContent = 'Type > add to get started, or click "Add Item" in the sidebar';
    itemCountEl.textContent = '0 items'; return;
  }

  if (suggestions.length === 0) { isSuggesting = false; renderNormalGrid(); return; }
  cardsGrid.style.display = 'grid';
  suggestions.forEach((s, idx) => {
    let card;
    if (s.kind === 'item') { card = createCard(s.data, idx, true); registerNavItem('item', s.data, card); }
    else if (s.kind === 'recentCmd') { card = createRecentCmdCard(s.data, idx); registerNavItem('recentCmd', s.data, card); }
    else if (s.kind === 'flow') { card = createFlowCard(s.data, idx); registerNavItem('flow', s.data, card); }
    if (card) cardsGrid.appendChild(card);
  });

  const slot = getTimeSlot();
  const greeting = { morning: '☀ Good morning', afternoon: '🌤 Good afternoon', night: '🌙 Good evening' }[slot];
  itemCountEl.textContent = `${greeting} · ✦ ${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`;
  if (navItems.length > 0) setSelectedIndex(0);
}

function renderGtMode(query) {
  isSuggesting = false; navItems = []; selectedIndex = -1;
  flashGridUpdate(); cardsGrid.innerHTML = ''; emptyState.style.display = 'none';
  cardsGrid.style.display = 'grid'; searchInput.classList.add('gt-mode-active');
  const results = buildGtResults(query);
  if (results.length === 0) {
    cardsGrid.style.display = 'none'; emptyState.style.display = 'flex';
    emptyStateMsg.textContent = 'No results found'; emptyStateHint.textContent = 'Try a different query or > add to add an app';
    itemCountEl.textContent = '> no matches'; return;
  }
  results.forEach((r, idx) => {
    let card;
    if (r.kind === 'item') { card = createCard(r.data, idx, false); registerNavItem('item', r.data, card); }
    else if (r.kind === 'syscmd') { card = createSysCmdCard(r.data, idx); registerNavItem('syscmd', r.data, card); }
    else if (r.kind === 'ytSearch') { card = createWebSearchCard('yt', r.data, idx); registerNavItem('ytSearch', r.data, card); }
    else if (r.kind === 'gSearch')  { card = createWebSearchCard('google', r.data, idx); registerNavItem('gSearch', r.data, card); }
    else if (r.kind === 'calc') { card = createCalcCard(r.data, idx); registerNavItem('calc', r.data, card); }
    else if (r.kind === 'addApp') { card = createAddAppCard(r.data, idx); registerNavItem('addApp', r.data, card); }
    else if (r.kind === 'flow') { card = createFlowCard(r.data, idx); registerNavItem('flow', r.data, card); }
    else if (r.kind === 'flowTemplate') { card = createFlowTemplateCard(r.data, idx); registerNavItem('flowTemplate', r.data, card); }
    else if (r.kind === 'flowAddPrompt') { card = createFlowAddPromptCard(idx); registerNavItem('flowAddPrompt', r.data, card); }
    if (card) cardsGrid.appendChild(card);
  });
  itemCountEl.textContent = `> ${results.length} match${results.length !== 1 ? 'es' : ''}`;
  if (navItems.length > 0) setSelectedIndex(0);
}

function renderCards() {
  if (currentParsed) return;
  isSuggesting = false; navItems = []; selectedIndex = -1;
  const q = searchQuery.trim(); flashGridUpdate(); cardsGrid.innerHTML = '';
  const unified = q ? buildUnifiedResults(q) : [];

  if (q && unified.length === 0) {
    cardsGrid.style.display = 'none'; emptyState.style.display = 'flex';
    emptyStateMsg.textContent = 'No results found';
    emptyStateHint.textContent = `Try > g ${q} to search Google`; return;
  }

  if (!q) { renderNormalGrid(); return; }

  emptyState.style.display = 'none'; cardsGrid.style.display = 'grid';
  unified.forEach((r, idx) => {
    let card;
    if (r.kind === 'item')        { card = createCard(r.data, idx, false); registerNavItem('item', r.data, card); }
    else if (r.kind === 'flow')   { card = createFlowCard(r.data, idx);    registerNavItem('flow', r.data, card); }
    else if (r.kind === 'intentAction') { card = createIntentActionCard(r.data, idx); registerNavItem('intentAction', r.data, card); }
    if (card) cardsGrid.appendChild(card);
  });
  if (navItems.length > 0) setSelectedIndex(0);
  itemCountEl.textContent = `${unified.length} result${unified.length !== 1 ? 's' : ''} of ${appData.items.length}`;
}

function renderAll() { renderTagCloud(); renderDisplay(); }

function getFilteredItems() {
  let items = appData.items;
  if (activeTypeFilter !== 'all') items = items.filter(i => i.type === activeTypeFilter);
  if (activeTag) items = items.filter(i => i.tags && i.tags.includes(activeTag));
  // Sort by enhanced score (usage + context) for non-empty grid
  return [...items].sort((a, b) => {
    const sa = (b.usage || 0) + getContextBoostForItem(b) * 0.2;
    const sb = (a.usage || 0) + getContextBoostForItem(a) * 0.2;
    const d = sa - sb;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

function renderTagCloud() {
  const allTags = new Map();
  appData.items.forEach(item => (item.tags||[]).forEach(t => allTags.set(t,(allTags.get(t)||0)+1)));
  tagCloud.innerHTML = '';
  [...allTags.entries()].sort((a,b)=>b[1]-a[1]).forEach(([tag,count]) => {
    const pill = document.createElement('button');
    pill.className = 'tag-pill' + (activeTag===tag?' active':'');
    pill.textContent = `${tag} (${count})`;
    pill.addEventListener('click', () => toggleTagFilter(tag));
    tagCloud.appendChild(pill);
  });
}

// ── CARD BUILDERS ──────────────────────────────────────────────────────────
function createCard(item, idx, isSuggestion) {
  const card = document.createElement('div');
  card.className = 'card' + (isSuggestion ? ' card-suggestion' : '');
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`;
  card.dataset.id = item.id;
  const tagsHtml = (item.tags||[]).slice(0,3).map(t => `<span class="card-tag" data-tag="${esc(t)}">${esc(t)}</span>`).join('');
  const usageBadge = (item.usage > 0) ? `<span class="card-usage-badge" title="Opened ${item.usage} time${item.usage!==1?'s':''}">↑${item.usage}</span>` : '';
  // Velocity indicator: show ⚡ if item is hot
  const velBoost = getVelocityBoost(`item_${item.id}`);
  const velBadge = velBoost >= 20 ? `<span class="card-vel-badge" title="Trending now">⚡</span>` : '';
  card.innerHTML = `<div class="card-icon ${item.type}">${getTypeIcon(item.type)}</div><span class="card-name">${esc(item.name)}${velBadge}</span><span class="card-type-badge ${item.type}">${item.type}</span>${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}${usageBadge}`;
  card.addEventListener('click', (e) => { if (e.target.classList.contains('card-tag')) { toggleTagFilter(e.target.dataset.tag); return; } openItem(item); });
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); showContextMenu(e.clientX,e.clientY,item); });
  return card;
}

function createFlowCard({ name, steps }, idx) {
  const card = document.createElement('div');
  card.className = 'card card-flow';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`;
  card.style.gridColumn = '1 / -1';
  const stepsPreview = (steps||[]).slice(0, 4).map(s => {
    const icon = s.type === 'url'
      ? `<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/></svg>`
      : s.type === 'music'
      ? `<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M5 11V4l7-1.5V10" stroke="currentColor" stroke-width="1.3"/><circle cx="4" cy="11" r="1.5" stroke="currentColor" stroke-width="1.2"/></svg>`
      : `<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/></svg>`;
    const label = s.type === 'url' ? (s.value.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) : s.value;
    return `<span class="flow-step-pill">${icon}${esc(label)}</span>`;
  }).join('');
  const extra = (steps||[]).length > 4 ? `<span class="flow-step-pill flow-step-more">+${steps.length-4}</span>` : '';
  const ctxBoost = getContextBoostForFlow(name) + getTimeSlotBoost(`flow_${name}`);
  const velBoost = getVelocityBoost(`flow_${name}`);
  const ctxBadge = ctxBoost > 10 ? `<span class="flow-ctx-badge" title="Suggested for now">✦</span>` : '';
  const velBadge = velBoost >= 20 ? `<span class="flow-ctx-badge" title="Used recently">⚡</span>` : '';
  const flowIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="4" cy="11" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="18" cy="11" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11" cy="5" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11" cy="17" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="6.5" y1="11" x2="15.5" y2="11" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/><line x1="11" y1="7.5" x2="11" y2="14.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/></svg>`;
  card.innerHTML = `<div class="card-icon flow-icon">${flowIcon}</div><div class="flow-body"><span class="card-name flow-name">${esc(name)}${ctxBadge}${velBadge}</span><div class="flow-steps-row">${stepsPreview}${extra}</div></div><span class="card-type-badge flow-badge">flow · ${(steps||[]).length} step${(steps||[]).length!==1?'s':''}</span><span class="cmd-hint-text">Enter to run</span>`;
  card.addEventListener('click', async () => { await executeFlow(name); clearSearch(); });
  return card;
}

function createFlowTemplateCard(template, idx) {
  const card = document.createElement('div');
  card.className = 'card card-flow-template';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`;
  card.style.flexDirection = 'row'; card.style.alignItems = 'center'; card.style.textAlign = 'left'; card.style.padding = '12px 16px'; card.style.gap = '12px';
  const flowIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="4" cy="11" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="18" cy="11" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="6.5" y1="11" x2="15.5" y2="11" stroke="currentColor" stroke-width="1.4"/><line x1="12" y1="8" x2="15.5" y2="11" stroke="currentColor" stroke-width="1.4"/><line x1="12" y1="14" x2="15.5" y2="11" stroke="currentColor" stroke-width="1.4"/></svg>`;
  card.innerHTML = `<div class="card-icon flow-icon">${flowIcon}</div><span class="card-name">${esc(template.name)}</span><span class="card-type-badge flow-badge">template</span><span class="cmd-hint-text">${esc(template.desc)}</span>`;
  card.addEventListener('click', async () => { await addFlowFromTemplate(template); });
  return card;
}

function createFlowAddPromptCard(idx) {
  const card = document.createElement('div');
  card.className = 'card card-addapp';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`; card.style.gridColumn = '1 / -1';
  card.style.flexDirection = 'row'; card.style.alignItems = 'center'; card.style.textAlign = 'left'; card.style.padding = '12px 16px'; card.style.gap = '12px';
  const icon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><line x1="11" y1="6" x2="11" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="6" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  card.innerHTML = `<div class="card-icon add-icon">${icon}</div><span class="card-name">Add a new flow from templates</span><span class="card-type-badge add-badge">flow</span><span class="cmd-hint-text">Enter</span>`;
  card.addEventListener('click', () => { searchInput.value = '> flow add '; searchQuery = searchInput.value; gtMode = true; searchInput.classList.add('gt-mode-active'); handleSearchInput(); });
  return card;
}

function createIntentActionCard({ target, info, verb }, idx) {
  const card = document.createElement('div');
  card.className = 'card card-intent';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`; card.style.gridColumn = '1 / -1';
  card.style.flexDirection = 'row'; card.style.alignItems = 'center'; card.style.textAlign = 'left'; card.style.padding = '12px 16px'; card.style.gap = '12px';
  const verbLabel = verb ? verb.charAt(0).toUpperCase() + verb.slice(1) : 'Open';
  const icon = info.url
    ? `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 2C11 2 8 6 8 11s3 9 3 9" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="2" y1="11" x2="20" y2="11" stroke="currentColor" stroke-width="1.5"/></svg>`
    : `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><line x1="2" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>`;
  card.innerHTML = `<div class="card-icon intent-icon">${icon}</div><div class="calc-body"><span class="card-name">${esc(`${verbLabel} ${info.label}`)}</span><span class="calc-expr">Detected intent</span></div><span class="card-type-badge intent-badge">intent</span><span class="cmd-hint-text">Enter</span>`;
  card.addEventListener('click', async () => { await executeIntentAction({ target, info, verb }); clearSearch(); });
  return card;
}

function createRecentCmdCard(cmd, idx) {
  const card = document.createElement('div');
  card.className = 'card card-recent-cmd';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`;
  card.innerHTML = `<div class="card-icon cmd-icon">${getCmdIcon('open')}</div><span class="card-name">${esc(cmd)}</span><span class="card-type-badge cmd-badge">recent</span>`;
  card.addEventListener('click', async () => {
    const parsed = parseCommand(cmd);
    if (parsed.isCommand) { const r = await executeCommand(parsed); if (r.message) showToast(r.message, r.ok ? 'success' : 'error'); }
    await trackCommand(cmd); clearSearch();
  });
  return card;
}

function createSysCmdCard(name, idx) {
  const card = document.createElement('div');
  card.className = 'card card-syscmd';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`;
  card.innerHTML = `<div class="card-icon app">${getTypeIcon('app')}</div><span class="card-name">${esc(name)}</span><span class="card-type-badge app">system</span>`;
  card.addEventListener('click', async () => {
    const r = await window.coreDeck.runSystemCmd(name);
    if (r.success) { showToast(`Launched "${name}"`, 'success'); await trackCommand(`open ${name}`); }
    else showToast(`Could not launch "${name}"`, 'error');
    clearSearch();
  });
  return card;
}

function createWebSearchCard(engine, query, idx) {
  const isYt = engine === 'yt', label = isYt ? 'YouTube' : 'Google', badge = isYt ? 'youtube' : 'google';
  const url = isYt ? SEARCH_ENGINES.youtube(query) : SEARCH_ENGINES.google(query);
  const icon = isYt
    ? `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 8.5l5.5 3-5.5 3z" fill="currentColor"/></svg>`
    : `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 3C11 3 8.5 6.5 8.5 11s2.5 8 2.5 8" stroke="currentColor" stroke-width="1.4" fill="none"/><line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" stroke-width="1.4"/></svg>`;
  const card = document.createElement('div');
  card.className = `card card-websearch card-websearch-${badge}`;
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`; card.style.gridColumn = '1 / -1';
  card.style.flexDirection = 'row'; card.style.alignItems = 'center'; card.style.textAlign = 'left'; card.style.padding = '12px 16px'; card.style.gap = '12px';
  card.innerHTML = `<div class="card-icon ${badge}">${icon}</div><span class="card-name">${query ? esc(query) : `Search ${label}…`}</span><span class="card-type-badge websearch-badge-${badge}">${label}</span>`;
  card.addEventListener('click', async () => {
    if (!query) return;
    await window.coreDeck.openItem(url, 'url'); await trackCommand(`> ${isYt?'yt':'g'} ${query}`);
    showToast(`${label}: "${query}"`, 'success'); clearSearch();
  });
  return card;
}

function createCalcCard({ expr, result }, idx) {
  const card = document.createElement('div');
  card.className = 'card card-calc';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`; card.style.gridColumn = '1 / -1';
  card.style.flexDirection = 'row'; card.style.alignItems = 'center'; card.style.textAlign = 'left'; card.style.padding = '12px 16px'; card.style.gap = '12px';
  const calcIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="16" height="16" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><line x1="7" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="9" y1="6" x2="9" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="7" y1="13" x2="9" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="11" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="15" cy="13" r="0.9" fill="currentColor"/></svg>`;
  card.innerHTML = `<div class="card-icon calc-icon">${calcIcon}</div><div class="calc-body"><span class="calc-expr">${esc(expr||'…')}</span><span class="calc-result ${result===null?'calc-err':''}">${result!==null?'= '+esc(String(result)):'invalid expression'}</span></div><span class="card-type-badge calc-badge">calc</span>${result!==null?`<span class="cmd-hint-text">Enter to copy</span>`:''}`;
  card.addEventListener('click', async () => {
    if (result !== null) { try { await navigator.clipboard.writeText(String(result)); showToast(`Copied: ${result}`, 'success'); } catch { showToast(`= ${result}`, 'success'); } }
  });
  return card;
}

function createAddAppCard({ name }, idx) {
  const card = document.createElement('div');
  card.className = 'card card-addapp';
  card.style.animationDelay = `${Math.min(idx*0.03,0.3)}s`; card.style.gridColumn = '1 / -1';
  card.style.flexDirection = 'row'; card.style.alignItems = 'center'; card.style.textAlign = 'left'; card.style.padding = '14px 18px'; card.style.gap = '14px';
  const addIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><line x1="11" y1="6" x2="11" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="6" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  card.innerHTML = `<div class="card-icon add-icon">${addIcon}</div><div class="calc-body"><span class="card-name">${esc(name ? `Add "${name}" via file picker` : 'Add app — opens file picker')}</span><span class="calc-expr">Select .exe or application file</span></div><span class="card-type-badge add-badge">add</span><span class="cmd-hint-text">Enter to browse</span>`;
  card.addEventListener('click', async () => { await executeAddApp(name); });
  return card;
}

function getTypeIcon(type) {
  const icons = {
    url:    `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 2C11 2 8 6 8 11s3 9 3 9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M11 2C11 2 14 6 14 11s-3 9-3 9" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="2" y1="11" x2="20" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="3.5" y1="7" x2="18.5" y2="7" stroke="currentColor" stroke-width="1.3"/><line x1="3.5" y1="15" x2="18.5" y2="15" stroke="currentColor" stroke-width="1.3"/></svg>`,
    app:    `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 5V4a1 1 0 012 0v1M13 5V4a1 1 0 012 0v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="2" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="12" width="3" height="3" rx="0.7" fill="currentColor" opacity="0.7"/><rect x="11" y="12" width="5" height="3" rx="0.7" fill="currentColor" opacity="0.4"/></svg>`,
    file:   `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 2h9l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 2v5h5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><line x1="7" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="7" y1="15" x2="13" y2="15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    folder: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M2 6h7l2 3h9a1 1 0 011 1v9a1 1 0 01-1 1H2a1 1 0 01-1-1V7a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`
  };
  return icons[type] || icons.file;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── OPEN ITEM ──────────────────────────────────────────────────────────────
async function openItem(item) {
  const result = await window.coreDeck.openItem(item.path, item.type);
  if (result.success) { await trackUsage(item); renderDisplay(); }
  else { showToast(`Could not open: ${result.error || 'unknown error'}`, 'error'); }
}

// ── SEARCH INPUT HANDLER ───────────────────────────────────────────────────
function handleSearchInput() {
  const raw = searchInput.value;
  searchQuery = raw;
  if (raw.startsWith('>')) {
    clearCommandPreview(); searchInput.classList.remove('cmd-active'); searchInput.classList.add('gt-mode-active');
    gtMode = true; renderGtMode(raw.slice(1).replace(/^\s*/, '')); return;
  }
  gtMode = false; searchInput.classList.remove('gt-mode-active');
  const parsed = parseCommand(raw);
  if (parsed.isCommand) { renderCommandPreview(parsed); return; }
  clearCommandPreview(); renderDisplay();
}

searchInput.addEventListener('input', handleSearchInput);

searchInput.addEventListener('focus', () => {
  searchFocused = true;
  if (!searchInput.value.trim() && !gtMode && !currentParsed) renderSuggestions();
});

searchInput.addEventListener('blur', () => {
  searchFocused = false;
  setTimeout(() => {
    if (!searchFocused && !searchInput.value.trim() && !gtMode && !currentParsed) renderNormalGrid();
  }, 160);
});

// ── KEYBOARD ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', async (e) => {
  const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
  const isPrev = e.key === 'ArrowUp'   || e.key === 'ArrowLeft';
  if ((isNext || isPrev) && document.activeElement === searchInput) {
    e.preventDefault(); if (currentParsed) return; if (navItems.length > 0) moveSelection(isNext ? 1 : -1); return;
  }
  if (e.key === 'Enter' && document.activeElement === searchInput) {
    e.preventDefault();
    if (currentParsed) { await runCurrentCommand(); return; }
    if (navItems.length > 0 && selectedIndex >= 0) { await executeSelected(); return; }
    const raw = searchInput.value;
    if (!raw.startsWith('>') && raw.trim()) { await resolveAndExecuteEnter(raw); return; }
    if (gtMode && navItems.length > 0) { setSelectedIndex(0); await executeSelected(); return; }
    return;
  }
  if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== notesArea && !modalOverlay.style.display.includes('flex')) {
    e.preventDefault(); searchInput.focus(); searchInput.select();
  }
  if (e.key === 'Escape') {
    if (flowsPanelOverlay && flowsPanelOverlay.style.display !== 'none') { closeFlowsPanel(); return; }
    if (fbOverlay && fbOverlay.style.display !== 'none') { closeFlowBuilder(); return; }
    if (modalOverlay.style.display !== 'none') { closeModal(); return; }
    if (contextMenu.style.display  !== 'none') { hideContextMenu(); return; }
    if (currentParsed || searchQuery || gtMode) { clearSearch(); }
    else { window.coreDeck.closeWindow(); }
  }
});

// ── TYPE FILTER ────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); activeTypeFilter = btn.dataset.filter; renderDisplay();
  });
});

// ── TAG FILTER ─────────────────────────────────────────────────────────────
function toggleTagFilter(tag) {
  if (activeTag === tag) { activeTag=null; activeTagBar.style.display='none'; }
  else { activeTag=tag; activeTagLabel.textContent=tag; activeTagBar.style.display='flex'; }
  renderDisplay(); renderTagCloud();
}
document.getElementById('clear-tag-btn').addEventListener('click', () => {
  activeTag=null; activeTagBar.style.display='none'; renderDisplay(); renderTagCloud();
});

// ── MODAL ──────────────────────────────────────────────────────────────────
document.getElementById('add-btn').addEventListener('click', openAddModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-save').addEventListener('click', saveItem);
modalOverlay.addEventListener('click', (e) => { if (e.target===modalOverlay) closeModal(); });

typeSelector.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    typeSelector.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); updatePathLabel(btn.dataset.type);
  });
});

function openAddModal() {
  editingId=null; modalTitle.textContent='Add Item'; modalSaveBtn.textContent='Add Item';
  editIdInput.value=itemNameInput.value=itemPathInput.value=itemTagsInput.value='';
  typeSelector.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
  typeSelector.querySelector('[data-type="url"]').classList.add('active');
  updatePathLabel('url'); showModal(); setTimeout(()=>itemNameInput.focus(),80);
}
function openEditModal(item) {
  editingId=item.id; modalTitle.textContent='Edit Item'; modalSaveBtn.textContent='Save Changes';
  editIdInput.value=item.id; itemNameInput.value=item.name; itemPathInput.value=item.path; itemTagsInput.value=(item.tags||[]).join(', ');
  typeSelector.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
  const btn=typeSelector.querySelector(`[data-type="${item.type}"]`); if (btn) btn.classList.add('active');
  updatePathLabel(item.type); showModal(); setTimeout(()=>itemNameInput.focus(),80);
}
function updatePathLabel(type) {
  const labels={url:'URL (e.g. https://google.com)',app:'App Path',file:'File Path',folder:'Folder Path'};
  const ph={url:'https://example.com',app:'C:\\Windows\\notepad.exe',file:'C:\\Users\\...\\file.pdf',folder:'C:\\Users\\...\\Downloads'};
  pathLabel.textContent=labels[type]||'Path'; itemPathInput.placeholder=ph[type]||'';
}
function showModal() { modalOverlay.style.display='flex'; }
function closeModal() { modalOverlay.style.display='none'; editingId=null; }

async function saveItem() {
  const name=itemNameInput.value.trim(), p=itemPathInput.value.trim(), rawTags=itemTagsInput.value.trim();
  const type=typeSelector.querySelector('.type-btn.active')?.dataset.type||'url';
  if (!name){itemNameInput.focus();showToast('Please enter a name','error');return;}
  if (!p)   {itemPathInput.focus();showToast('Please enter a path or URL','error');return;}
  const tags=rawTags?rawTags.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean):[];
  if (editingId) {
    const idx=appData.items.findIndex(i=>i.id===editingId);
    if (idx!==-1){appData.items[idx]={...appData.items[idx],name,path:p,type,tags};showToast(`"${name}" updated`,'success');}
  } else {
    appData.items.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name,path:p,type,tags,usage:0,lastOpened:0});
    showToast(`"${name}" added`,'success');
  }
  await saveData(); closeModal(); renderAll();
}

// ── NOTES ──────────────────────────────────────────────────────────────────
notesArea.addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer=setTimeout(async()=>{appData.notes=notesArea.value;await saveData();showSaveIndicator();},800);
});
function showSaveIndicator() {
  saveIndicator.textContent='Saved'; saveIndicator.classList.add('visible');
  clearTimeout(saveIndicatorTimer); saveIndicatorTimer=setTimeout(()=>saveIndicator.classList.remove('visible'),2000);
}

// ── CONTEXT MENU ───────────────────────────────────────────────────────────
function showContextMenu(x,y,item) {
  contextItem=item;
  const cx=Math.min(x,window.innerWidth-158), cy=Math.min(y,window.innerHeight-118);
  contextMenu.style.left=cx+'px'; contextMenu.style.top=cy+'px'; contextMenu.style.display='block';
}
function hideContextMenu(){contextMenu.style.display='none';contextItem=null;}
document.getElementById('ctx-open').addEventListener('click',()=>{if(contextItem)openItem(contextItem);hideContextMenu();});
document.getElementById('ctx-edit').addEventListener('click',()=>{if(contextItem)openEditModal(contextItem);hideContextMenu();});
document.getElementById('ctx-delete').addEventListener('click',async()=>{
  if(!contextItem)return;
  const name=contextItem.name; appData.items=appData.items.filter(i=>i.id!==contextItem.id);
  await saveData();renderAll();showToast(`"${name}" deleted`,'error');hideContextMenu();
});
document.addEventListener('click',(e)=>{if(!contextMenu.contains(e.target))hideContextMenu();});

// ── DATA ───────────────────────────────────────────────────────────────────
async function saveData(){await window.coreDeck.writeData(appData);}

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg,type=''){
  toast.textContent=msg; toast.className='toast show'+(type?' '+type:'');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{toast.className='toast';},2500);
}

// ── WINDOW CONTROLS ────────────────────────────────────────────────────────
function setupWindowControls() {
  document.getElementById('btn-minimize').addEventListener('click',()=>window.coreDeck.minimizeWindow());
  document.getElementById('btn-maximize').addEventListener('click',()=>window.coreDeck.maximizeWindow());
  document.getElementById('btn-close').addEventListener('click',()=>window.coreDeck.closeWindow());
  window.coreDeck.onWindowStateChange((isMax)=>{
    const btn=document.getElementById('btn-maximize'); btn.title=isMax?'Restore':'Maximize';
    btn.querySelector('svg').innerHTML=isMax
      ?`<path d="M4 1.5h8.5v8.5M1.5 4h8.5v8.5H1.5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`
      :`<rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>`;
  });
}

async function setupDataPathHint() {
  const p=await window.coreDeck.getDataPath();
  const hint=document.getElementById('data-path-hint');
  hint.textContent='📁 '+(p.length>30?'...'+p.slice(-27):p); hint.title=p;
}

document.addEventListener('keydown',(e)=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='n'&&modalOverlay.style.display==='none'){e.preventDefault();openAddModal();}
});

// ── START ──────────────────────────────────────────────────────────────────
init();
