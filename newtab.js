'use strict';

// Synced settings (chrome.storage.sync follows the user's Chrome profile).
const DEFAULTS = {
  count: 40,          // number of most-visited tiles (8–120)
  size: 48,           // icon diameter in px
  period: 0,          // days of history; 0 = all
  sortBy: 'smart',    // 'smart' | 'most' | 'recent'
  groupBy: 'host',    // 'host' | 'url'
  newTab: true,
  hideOpen: true,     // hide sites that are open in other tabs
  hidden: [],         // keys of hidden sites
  pins: [],           // [{ key, url, title }] shown first
  customTitles: {},   // { [key]: custom display title }
  showRecent: false,  // show "Recently visited" strip above grid
  iconTransparent: false, // hide white circle behind loaded favicons
  showClock: true,
  clock24: true,
  clockSeconds: false,
  clockDate: false,
  clockGreeting: true,
  clockScale: 1,      // 0.6–1.6
  clockTz: '',        // '' = local time, or IANA timezone (e.g. 'America/New_York')
  clockFont: 'default', // 'default' | 'thin' | 'serif' | 'mono'
  userName: '',
  showSearch: true,
  searchTabs: true,
  searchScale: 1,     // 0.75–1.4
  searchTransparent: true,
  engine: 'google',   // key in ENGINES
  weatherOn: true,
  city: '',           // empty = use device location (legacy fallback)
  weatherScale: 1,    // 0.7–1.6 widget scale
  weatherView: 'current', // 'current' | 'hourly' | 'daily7' | 'long14'
  weatherPlaces: [],  // [{ id, name, lat, lon }]
  weatherActive: 'auto', // 'auto' | place id
  weatherShowAll: false, // show all saved locations in the widget
  weatherTransparent: false, // transparent background when expanded
  todoWidget: true,   // show to-do list permanently as a widget
  todoScale: 1,       // 0.75–1.5
  todoShowDone: true,
  todoShowInput: true,
  todoTransparent: false,
  notesWidget: false, // show notes permanently as a widget
  notesScale: 1,      // 0.75–1.5
  notesTransparent: false,
  dockCollapsed: false,
  extraWidgets: [],   // duplicate copies: [{ id, type: 'clock'|'search'|'weather', ... }]
  bgMode: 'nature',   // 'nature' | 'custom' | 'none'
  bgEvery: 'day',     // 'day' | 'hour' | 'tab'
  bgGradient: 'forest', // 'forest' | 'ocean' | 'sunset' | 'midnight' | 'aurora' | 'slate'
  showCredit: true,   // show photo credit in bottom-left
  accent: '#4da3ff',
  dim: 15,            // % darkening of the photo
  blur: 0,            // px
  widgetPos: {}       // { clock|weather|search|grid|dock|focus: { x, y[, w] } } as viewport fractions
};
const DAY = 864e5;
const BING = 'https://www.bing.com';
const MARKETS = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'en-IN', 'en-NZ'];
const NATURE = /\b(mountains?|mount|mt\.|peaks?|alps|lakes?|forests?|woods?|woodland|rainforest|national park|nature|reserve|river|valley|waterfalls?|falls|canyon|gorge|glacier|fjord|coast|beach|bay|cove|island|islands|sea|ocean|cliffs?|desert|dunes?|meadow|prairie|hills?|volcano|aurora|landscape|wilderness|trees?|lagoon|reef|wetland|marsh|tundra|savanna|snow|countryside)\b/i;

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

// ---------- storage ----------
// Values this tab wrote last, by key. chrome.storage.onChanged also reports a
// tab's own writes; those echoes are recognised and ignored, so they cannot
// overwrite a newer value the tab already holds.
const written = new Map();
const SHARED_KEYS = new Set([
  'todos', 'notes', 'layoutOrder', 'hidden', 'pins', 'customTitles', 'showRecent', 'iconTransparent', 'newTab', 'widgetPos', 'extraWidgets',
  'showClock', 'clock24', 'clockSeconds', 'clockDate', 'clockGreeting', 'clockScale', 'clockTz', 'clockFont', 'userName',
  'showSearch', 'searchTabs', 'searchScale', 'searchTransparent', 'engine',
  'weatherOn', 'weatherScale', 'weatherView', 'weatherPlaces', 'weatherActive', 'weatherShowAll', 'weatherTransparent',
  'todoWidget', 'todoScale', 'todoShowDone', 'todoShowInput', 'todoTransparent',
  'notesWidget', 'notesScale', 'notesTransparent', 'dockCollapsed', 'bgGradient'
]);
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
function remember(v) {
  for (const [k, val] of Object.entries(v)) if (SHARED_KEYS.has(k)) written.set(k, canonical(val));
}
const isEcho = (key, change) => written.get(key) === canonical(change.newValue);

// Sync storage allows 120 writes a minute and 8 KB per key; a failed write is
// logged instead of breaking the control that caused it.
const sync = {
  get: () => chrome.storage.sync.get(DEFAULTS),
  set: (v) => {
    remember(v);
    return chrome.storage.sync.set(v).catch((err) => console.warn('Saving settings failed', Object.keys(v), err));
  }
};
const local = {
  get: (k) => chrome.storage.local.get(k),
  set: (v) => { remember(v); return chrome.storage.local.set(v); }
};

// Sliders, the colour picker and the name field fire on every keystroke or
// pixel; their writes are collected and saved together.
const pendingSync = {};
let syncTimer;
function syncLater(v) {
  Object.assign(pendingSync, v);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushSync, 400);
}
function flushSync() {
  clearTimeout(syncTimer);
  const v = { ...pendingSync };
  for (const k of Object.keys(pendingSync)) delete pendingSync[k];
  if (Object.keys(v).length) sync.set(v);
}
addEventListener('pagehide', flushSync);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSync(); });

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function applyAppearance() {
  const root = document.documentElement.style;
  root.setProperty('--dim', String(settings.dim / 100));
  root.setProperty('--blur', `${settings.blur}px`);
  root.setProperty('--icon', `${settings.size}px`);
  $('grid')?.classList.toggle('transparent-icons', !!settings.iconTransparent);
}

// ---------- most visited from history ----------
function keyFor(u) {
  if (settings.groupBy === 'url') return u.href.replace(/#.*$/, '');
  return u.hostname.replace(/^www\./, '');
}

function prettyHost(host) {
  const parts = host.split('.');
  // "mail.google.com" -> "Google mail", "github.com" -> "Github"
  const main = parts.length > 2 ? parts.slice(0, -1).reverse().join(' ') : parts[0];
  return main.charAt(0).toUpperCase() + main.slice(1);
}

// Ranking. "smart" weighs every visit by its age (half-life HALF_LIFE_DAYS), so
// a site used today outranks one that was used heavily months ago; sites with
// no recent visits fill any remaining places by their all-time visit count.
const HALF_LIFE_DAYS = 14;
const RECENT_WINDOW_DAYS = 90;
const MAX_SCORED_URLS = 2000;

// "(3) WhatsApp" -> "WhatsApp": unread counters are not part of a site's name.
function cleanTitle(t) {
  return (t || '').replace(/^\(\d+\+?\)\s*/, '').trim();
}

async function recentScores(items, now) {
  const since = now - RECENT_WINDOW_DAYS * DAY;
  const recent = items
    .filter((it) => it.lastVisitTime >= since)
    .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))
    .slice(0, MAX_SCORED_URLS);
  const scores = new Map();
  for (let i = 0; i < recent.length; i += 50) {
    const batch = recent.slice(i, i + 50);
    const visits = await Promise.all(batch.map((it) => chrome.history.getVisits({ url: it.url }).catch(() => [])));
    batch.forEach((it, j) => {
      let s = 0;
      for (const v of visits[j]) {
        if (v.visitTime < since) continue;
        const ageDays = (now - v.visitTime) / DAY;
        // Reloads say little about what the user chose to open.
        const w = v.transition === 'reload' ? 0.05 : v.transition === 'typed' ? 1.5 : 1;
        s += w * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      }
      scores.set(it.url, s);
    });
  }
  return scores;
}

async function computeSites(limit) {
  const now = Date.now();
  const startTime = settings.period ? now - settings.period * DAY : 0;
  const items = await chrome.history.search({ text: '', startTime, maxResults: 50000 });
  const web = items.filter((it) => /^https?:/.test(it.url));
  const recent = settings.sortBy === 'smart' ? await recentScores(web, now) : new Map();
  const map = new Map();

  for (const it of web) {
    let u;
    try { u = new URL(it.url); } catch { continue; }

    const key = keyFor(u);
    const count = (it.visitCount || 0) + (it.typedCount || 0);
    let s = map.get(key);
    if (!s) {
      s = { key, count: 0, recent: 0, last: 0, url: '', title: '', best: -1, rootTitle: '' };
      map.set(key, s);
    }
    s.count += count;
    s.recent += recent.get(it.url) || 0;
    s.last = Math.max(s.last, it.lastVisitTime || 0);
    if (count > s.best) { s.best = count; s.url = it.url; s.title = cleanTitle(it.title); }
    if (u.pathname === '/' && !u.search && it.title) s.rootTitle = cleanTitle(it.title);
  }

  const order = {
    most: (a, b) => b.count - a.count,
    recent: (a, b) => b.last - a.last,
    smart: (a, b) => (b.recent - a.recent) || (b.count - a.count)
  }[settings.sortBy] || ((a, b) => b.count - a.count);

  const skip = new Set([...settings.hidden, ...settings.pins.map((p) => p.key)]);
  return [...map.values()]
    .filter((s) => !skip.has(s.key) && s.count > 0)
    .sort(order)
    .slice(0, limit)
    .map((s) => {
      const u = new URL(s.url);
      const url = settings.groupBy === 'host' ? `${u.protocol}//${u.host}/` : s.url;
      let title = settings.groupBy === 'host' ? (s.rootTitle || '') : s.title;
      // Long page titles ("Inbox (3) - someone@example.com - Gmail") read badly
      // under an icon; fall back to the site name.
      if (!title || title.length > 28) title = prettyHost(u.hostname.replace(/^www\./, ''));
      return { key: s.key, url, title };
    });
}

// ---------- tiles ----------
// Icons, best source first:
// 1. Chrome's own favicon cache: exact icons for every site opened in Chrome.
// 2. Google and DuckDuckGo icon services for sites Chrome has no icon for,
//    such as history imported from Firefox.
// 3. The same services for the parent domain, because they often know only
//    the main site (whatsapp.com) and not a subdomain (web.whatsapp.com).
// Unknown sites get a generic globe from every source; those are rejected so
// the coloured letter shows instead.
function parentDomain(host) {
  const parts = host.split('.');
  if (parts.length <= 2) return null;
  // Keep "example.co.uk" style domains whole.
  const two = parts.slice(-2);
  const keep = two[1].length === 2 && two[0].length <= 3 ? 3 : 2;
  return parts.length > keep ? parts.slice(-keep).join('.') : null;
}

function serviceUrls(host) {
  const h = encodeURIComponent(host);
  return [`https://www.google.com/s2/favicons?domain=${h}&sz=64`, `https://icons.duckduckgo.com/ip3/${h}.ico`];
}

function chromeFaviconUrl(pageUrl) {
  const f = new URL(chrome.runtime.getURL('/_favicon/'));
  f.searchParams.set('pageUrl', pageUrl);
  f.searchParams.set('size', '64');
  return f.toString();
}

async function bytesOf(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const blob = await r.blob();
  if (!blob.type.startsWith('image/') || blob.size < 100) return null;
  return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Chrome answers with its default globe when it has no icon for a page.
let chromeDefaultIcon;
function chromeDefault() {
  chromeDefaultIcon ??= bytesOf(chromeFaviconUrl('https://unknown-site.invalid/')).catch(() => null);
  return chromeDefaultIcon;
}

// Only hosts reachable on the public internet are looked up at the icon
// services; local machines, LAN devices and company intranet names stay private.
function isPublicHost(host) {
  if (!host || !host.includes('.')) return false;                       // localhost, single-label intranet names
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false; // IPv4, IPv6
  return !/\.(local|lan|home|internal|intranet|corp|private|arpa|localhost|localdomain|test|example|invalid)$/i.test(host);
}

// Each icon is fetched once per page; re-rendering the grid (tabs opened or
// closed, settings changed) reuses it instead of fetching it again.
const iconCache = new Map();
function loadIcon(pageUrl) {
  if (!iconCache.has(pageUrl)) iconCache.set(pageUrl, fetchIcon(pageUrl).catch(() => null));
  return iconCache.get(pageUrl);
}

async function fetchIcon(pageUrl) {
  try {
    const [own, def] = await Promise.all([bytesOf(chromeFaviconUrl(pageUrl)), chromeDefault()]);
    if (own && !(def && sameBytes(own.bytes, def.bytes))) return URL.createObjectURL(own.blob);
  } catch { /* fall through to the icon services */ }
  const host = new URL(pageUrl).hostname;
  if (!isPublicHost(host)) return null;
  const parent = parentDomain(host);
  const urls = [...serviceUrls(host), ...(parent ? serviceUrls(parent) : [])];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const blob = await r.blob();
      if (!blob.type.startsWith('image/') || blob.size < 100) continue;
      return URL.createObjectURL(blob);
    } catch { /* try the next source */ }
  }
  return null;
}

function colorFor(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

async function togglePin(site) {
  const pinned = settings.pins.some((p) => p.key === site.key);
  settings.pins = pinned
    ? settings.pins.filter((p) => p.key !== site.key)
    : [...settings.pins, { key: site.key, url: site.url, title: site.title }];
  await sync.set({ pins: settings.pins });
  refresh();
}

function displayTitle(s) {
  return (settings.customTitles && settings.customTitles[s.key]) || s.title;
}

function tile(s, isPinned) {
  const title = displayTitle(s);
  const a = el('a', isPinned ? 'tile pinned' : 'tile');
  a.href = s.url;
  a.dataset.key = s.key;
  a.title = `${title}\n${s.url}`;
  if (settings.newTab) { a.target = '_blank'; a.rel = 'noopener'; }

  const icon = el('span', 'icon');
  icon.style.background = colorFor(s.key);
  const letter = el('span', 'letter', (title || s.key).trim().charAt(0).toUpperCase());
  const img = el('img');
  img.alt = '';
  img.onload = () => { icon.style.background = ''; icon.classList.add('has-img'); letter.remove(); };
  loadIcon(s.url).then((src) => { if (src) img.src = src; else img.remove(); });
  icon.append(letter, img);

  const pin = el('button', 'pin', '📌');
  pin.type = 'button';
  pin.title = isPinned ? 'Unpin' : 'Pin: always keep this site on the page';
  pin.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePin(s); });

  const hide = el('button', 'hide', '×');
  hide.type = 'button';
  hide.title = isPinned ? 'Unpin' : 'Hide this site';
  hide.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPinned) return togglePin(s);
    settings.hidden = [...new Set([...settings.hidden, s.key])];
    await sync.set({ hidden: settings.hidden });
    refresh();
  });

  a.append(icon, el('span', 'label', title), pin, hide);
  return a;
}

// User-arranged order of tile keys (drag and drop). Tiles in this list keep
// their place; sites not in it (new in history) follow in ranking order.
let layoutOrder = [];

function arrange(items) {
  if (!layoutOrder.length) return items;
  const pos = new Map(layoutOrder.map((k, i) => [k, i]));
  const placed = items.filter((it) => pos.has(it.s.key)).sort((a, b) => pos.get(a.s.key) - pos.get(b.s.key));
  return [...placed, ...items.filter((it) => !pos.has(it.s.key))];
}

// Sites open in other tabs are left out of the grid until their tab closes.
// The computed list keeps spare entries so the grid stays full meanwhile.
const SPARE_SITES = 30;
let openKeys = new Set();
let lastSites = [];

async function updateOpenKeys() {
  if (!settings.hideOpen || !chrome.tabs) { openKeys = new Set(); return; }
  const tabs = await chrome.tabs.query({});
  const keys = new Set();
  for (const t of tabs) {
    try {
      const u = new URL(t.url || t.pendingUrl || '');
      if (u.protocol === 'http:' || u.protocol === 'https:') keys.add(keyFor(u));
    } catch { /* not a web page */ }
  }
  openKeys = keys;
}

function setupOpenTabs() {
  if (!chrome.tabs) return;
  let timer;
  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const before = [...openKeys].sort().join();
      await updateOpenKeys();
      if ([...openKeys].sort().join() !== before) render(lastSites);
    }, 300);
  };
  chrome.tabs.onRemoved.addListener(update);
  chrome.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'complete') update(); });
  chrome.tabs.onCreated.addListener(update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}

async function renderRecentStrip() {
  const grid = $('grid');
  grid.querySelector(':scope > .recent-strip')?.remove();
  if (!settings.showRecent) return;
  try {
    const items = await chrome.history.search({ text: '', startTime: Date.now() - 14 * DAY, maxResults: 80 });
    const seen = new Set(settings.hidden || []);
    const recent = [];
    for (const it of items.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))) {
      if (!/^https?:/.test(it.url)) continue;
      let u;
      try { u = new URL(it.url); } catch { continue; }
      const key = keyFor(u);
      if (seen.has(key)) continue;
      seen.add(key);
      let title = cleanTitle(it.title);
      if (!title || title.length > 26) title = prettyHost(u.hostname.replace(/^www\./, ''));
      recent.push({ key, url: it.url, title: (settings.customTitles && settings.customTitles[key]) || title });
      if (recent.length >= 8) break;
    }
    if (!recent.length || !settings.showRecent) return;
    const strip = el('div', 'recent-strip');
    strip.append(el('span', 'recent-label', 'Recent'));
    for (const s of recent) {
      const a = el('a', 'recent-chip');
      a.href = s.url;
      a.title = `${s.title}\n${s.url}`;
      if (settings.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
      const img = el('img');
      img.alt = '';
      loadIcon(s.url).then((src) => { if (src) img.src = src; else img.remove(); });
      a.append(img, el('span', '', s.title));
      strip.append(a);
    }
    grid.querySelector(':scope > .recent-strip')?.remove();
    grid.prepend(strip);
  } catch { /* history unavailable */ }
}

function render(sites) {
  lastSites = sites;
  const grid = $('grid');
  const existingControls = [...grid.querySelectorAll(':scope > .edit-resize')];
  grid.replaceChildren();
  // Hidden and pinned keys are filtered here too, so a change made in another
  // tab shows at once without recomputing the list from history.
  const skip = new Set([...settings.hidden, ...settings.pins.map((p) => p.key)]);
  const shown = sites.filter((s) => !openKeys.has(s.key) && !skip.has(s.key)).slice(0, settings.count);
  const items = [
    ...settings.pins.map((s) => ({ s, pinned: true })),
    ...shown.map((s) => ({ s, pinned: false }))
  ];
  for (const it of arrange(items)) grid.append(tile(it.s, it.pinned));
  for (const c of existingControls) grid.append(c);
  $('empty').hidden = items.length > 0;
  if (settings.showRecent) renderRecentStrip();
}

function setupGridMenu() {
  const menu = $('gridMenu');
  menu.addEventListener('click', (e) => e.stopPropagation());
  let targetSite = null;
  let targetPinned = false;

  const findSiteByKey = (key) => {
    const p = settings.pins.find((x) => x.key === key);
    if (p) return { site: p, pinned: true };
    const s = lastSites.find((x) => x.key === key);
    return s ? { site: s, pinned: false } : null;
  };

  $('grid').addEventListener('contextmenu', (e) => {
    if (editing) return;
    if (e.target.closest('.recent-strip')) return;
    e.preventDefault();
    const tileEl = e.target.closest('.tile');
    $('gmAddMsg').hidden = true;
    $('gmAddUrl').value = '';
    $('gmAddTitle').value = '';

    if (tileEl) {
      const found = findSiteByKey(tileEl.dataset.key);
      if (found) {
        targetSite = found.site;
        targetPinned = found.pinned;
        $('gmTileSection').hidden = false;
        $('gmTileTitle').textContent = displayTitle(targetSite);
        $('gmRenameInput').value = (settings.customTitles && settings.customTitles[targetSite.key]) || targetSite.title || '';
        $('gmPinBtn').querySelector('span').textContent = targetPinned ? 'Unpin site' : 'Pin site';
        $('gmHideBtn').hidden = targetPinned;
      } else {
        targetSite = null;
        $('gmTileSection').hidden = true;
      }
    } else {
      targetSite = null;
      $('gmTileSection').hidden = true;
    }
    showContextMenu(menu, e.clientX, e.clientY);
  });

  $('gmRenameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!targetSite) return;
    const name = $('gmRenameInput').value.trim();
    const titles = { ...(settings.customTitles || {}) };
    if (name) titles[targetSite.key] = name; else delete titles[targetSite.key];
    settings.customTitles = titles;
    const upd = { customTitles: titles };
    if (targetPinned && name) {
      settings.pins = settings.pins.map((p) => (p.key === targetSite.key ? { ...p, title: name } : p));
      upd.pins = settings.pins;
    }
    await sync.set(upd);
    render(lastSites);
    closeContextMenus();
  });

  $('gmPinBtn').addEventListener('click', async () => {
    if (!targetSite) return;
    await togglePin(targetSite);
    closeContextMenus();
  });

  $('gmHideBtn').addEventListener('click', async () => {
    if (!targetSite || targetPinned) return;
    settings.hidden = [...new Set([...settings.hidden, targetSite.key])];
    await sync.set({ hidden: settings.hidden });
    refresh();
    closeContextMenus();
  });

  $('gmAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let raw = $('gmAddUrl').value.trim();
    if (!raw) return;
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    let u;
    try { u = new URL(raw); } catch {
      $('gmAddMsg').textContent = 'Invalid URL.';
      $('gmAddMsg').hidden = false;
      return;
    }
    const key = keyFor(u);
    const customName = $('gmAddTitle').value.trim();
    const title = customName || prettyHost(u.hostname.replace(/^www\./, ''));
    const url = u.href;
    settings.hidden = settings.hidden.filter((k) => k !== key);
    settings.pins = [...settings.pins.filter((p) => p.key !== key), { key, url, title }];
    const upd = { pins: settings.pins, hidden: settings.hidden };
    if (customName) {
      settings.customTitles = { ...(settings.customTitles || {}), [key]: customName };
      upd.customTitles = settings.customTitles;
    }
    await sync.set(upd);
    refresh();
    closeContextMenus();
  });
}

// ---------- drag and drop layout ----------
function setupDragAndDrop() {
  const grid = $('grid');
  let dragged = null;
  let moved = false;

  grid.addEventListener('dragstart', (e) => {
    const t = e.target.closest('.tile');
    if (!t || editing || t.closest('.recent-strip')) return;
    dragged = t;
    moved = false;
    e.dataTransfer.effectAllowed = 'copyMove';
    // Keep the URL so a tile can still be dropped on the bookmarks bar.
    e.dataTransfer.setData('text/uri-list', t.href);
    e.dataTransfer.setData('text/plain', t.href);
    requestAnimationFrame(() => t.classList.add('dragging'));
  });

  grid.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const t = e.target.closest('.tile');
    if (!t || t === dragged || t.closest('.recent-strip')) return;
    const r = t.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    const ref = after ? t.nextSibling : t;
    if (ref === dragged || dragged.nextSibling === ref) return;
    grid.insertBefore(dragged, ref);
    moved = true;
  });

  grid.addEventListener('drop', (e) => { if (dragged) e.preventDefault(); });

  grid.addEventListener('dragend', () => {
    if (!dragged) return;
    dragged.classList.remove('dragging');
    dragged = null;
    if (!moved) return;
    layoutOrder = [...grid.querySelectorAll(':scope > .tile')].map((c) => c.dataset.key);
    local.set({ layoutOrder });
    $('resetLayout').disabled = false;
  });
}

// Settings that change the list; a cached list is valid only for the same values.
function signature() {
  return JSON.stringify([settings.count, settings.period, settings.sortBy, settings.groupBy, settings.hidden, settings.pins]);
}

function updateHiddenCount() {
  const n = settings.hidden.length;
  $('hiddenCount').textContent = n;
  $('unhideAll').disabled = n === 0;
}

async function refresh() {
  try {
    const sites = await computeSites(settings.count + SPARE_SITES);
    render(sites);
    local.set({ cache: { sites, sig: signature(), time: Date.now() } });
  } catch (err) {
    console.error('History load failed', err);
  }
  updateHiddenCount();
}

// ---------- background ----------
async function bingImages() {
  const { bing } = await local.get('bing');
  if (bing && Date.now() - bing.time < DAY && bing.images.length) return bing.images;

  // The archive exposes the last ~15 daily images per market across two pages.
  // English markets keep the descriptions matchable by NATURE below.
  const requests = [];
  for (const mkt of MARKETS) for (const idx of [0, 7])
    requests.push(fetch(`${BING}/HPImageArchive.aspx?format=js&idx=${idx}&n=8&mkt=${mkt}`)
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .catch(() => ({ images: [] })));

  const all = [];
  for (const data of await Promise.all(requests)) {
    for (const im of data.images || []) {
      if (all.some((x) => x.base === im.urlbase)) continue;
      all.push({
        base: im.urlbase,
        url: `${BING}${im.urlbase}_1920x1080.jpg`,
        credit: im.copyright || '',
        link: im.copyrightlink || '',
        nature: NATURE.test(`${im.title || ''} ${im.copyright || ''}`)
      });
    }
  }
  // Bing also features cities and events; keep the nature photos when there are any.
  const nature = all.filter((i) => i.nature);
  const images = nature.length >= 3 ? nature : all;
  if (images.length) await local.set({ bing: { time: Date.now(), images } });
  return images.length ? images : (bing?.images || []);
}

let lastCredit = { text: '', link: '' };
function showCredit(text, link) {
  lastCredit = { text: text || '', link: link || '' };
  const c = $('credit');
  c.hidden = !lastCredit.text || !settings.showCredit;
  c.textContent = lastCredit.text;
  if (lastCredit.link) c.href = lastCredit.link; else c.removeAttribute('href');
}

// The current photo slot: one per day, one per hour, or none (new every tab).
function photoSlot() {
  const now = new Date();
  const day = now.toLocaleDateString('sv'); // YYYY-MM-DD, local time
  const every = settings.bgEvery;
  if (every === 'hour') return `${day}T${String(now.getHours()).padStart(2, '0')}`;
  if (every === 'tab') return null;
  return day;
}

const GRADIENTS = {
  forest: 'radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, .25), transparent 60%), linear-gradient(180deg, #8a9a93 0%, #4d6358 45%, #233229 100%)',
  ocean: 'radial-gradient(ellipse at 30% 0%, rgba(110, 210, 255, .25), transparent 60%), linear-gradient(160deg, #1b4965 0%, #162e4d 50%, #0b1628 100%)',
  sunset: 'radial-gradient(ellipse at 70% 10%, rgba(255, 190, 130, .3), transparent 55%), linear-gradient(165deg, #5c3a5e 0%, #8f4754 48%, #281b2e 100%)',
  midnight: 'radial-gradient(ellipse at 50% 0%, rgba(130, 150, 255, .18), transparent 60%), linear-gradient(180deg, #1e2438 0%, #121624 55%, #090b12 100%)',
  aurora: 'radial-gradient(ellipse at 20% 10%, rgba(72, 224, 176, .26), transparent 55%), radial-gradient(ellipse at 85% 25%, rgba(124, 92, 255, .26), transparent 55%), linear-gradient(180deg, #132a2e 0%, #181c36 60%, #0d101c 100%)',
  slate: 'radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, .14), transparent 60%), linear-gradient(180deg, #4b525c 0%, #2d3239 50%, #191c20 100%)'
};

function updateBgSettingsUI() {
  const mode = settings.bgMode;
  if ($('bgGradientRow')) $('bgGradientRow').hidden = mode !== 'none';
  if ($('bgEveryRow')) $('bgEveryRow').hidden = mode !== 'nature';
  if ($('bgFileRow')) $('bgFileRow').hidden = mode !== 'custom';
  if ($('bgPhotoFx')) $('bgPhotoFx').hidden = mode === 'none';
  if ($('bgCreditRow')) $('bgCreditRow').hidden = mode !== 'nature';
}

async function applyBackground() {
  const bg = $('bg');
  bg.style.backgroundImage = '';
  bg.style.background = GRADIENTS[settings.bgGradient] || GRADIENTS.forest;
  bg.classList.remove('image');
  showCredit('');
  updateBgSettingsUI();

  const mode = settings.bgMode;
  if (mode === 'custom') {
    const { bgImage } = await local.get('bgImage');
    if (bgImage) {
      bg.style.background = '';
      bg.style.backgroundImage = `url("${bgImage}")`;
      bg.classList.add('image');
    }
    return;
  }
  if (mode !== 'nature') return;

  try {
    const images = await bingImages();
    if (!images.length) return;
    const slot = photoSlot();
    const { dailyBg } = await local.get('dailyBg');
    let pick = slot && dailyBg?.slot === slot && dailyBg.image;
    if (!pick) {
      // A new slot avoids repeating the previous picture.
      const pool = images.length > 1 ? images.filter((i) => i.base !== dailyBg?.image?.base) : images;
      pick = pool[Math.floor(Math.random() * pool.length)];
      local.set({ dailyBg: { slot, image: pick } });
    }

    const img = new Image();
    img.onload = () => {
      bg.style.background = '';
      bg.style.backgroundImage = `url("${pick.url}")`;
      bg.classList.add('image');
      showCredit(pick.credit, pick.link);
    };
    img.src = pick.url;
  } catch (err) {
    console.warn('Background unavailable, keeping gradient', err);
  }
}

// ---------- shared context menu helpers & extra widget copies ----------
const CONTEXT_MENUS = ['weatherMenu', 'clockMenu', 'searchMenu', 'todoMenu', 'notesMenu', 'gridMenu'];
let activeClockId = 'clock';
let activeSearchId = 'search';
let activeWeatherId = 'weather';

function closeContextMenus() {
  for (const id of CONTEXT_MENUS) $(id).hidden = true;
  for (const b of document.querySelectorAll('.engine-btn')) b.setAttribute('aria-expanded', 'false');
}
function showContextMenu(menu, x, y) {
  closeContextMenus();
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  const m = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  menu.style.left = `${Math.max(m, Math.min(x, vw - r.width - m))}px`;
  menu.style.top = `${Math.max(m, Math.min(y, vh - r.height - m))}px`;
}

function getExtra(id) {
  return (settings.extraWidgets || []).find((w) => w.id === id) || null;
}

function saveExtra(later = false) {
  if (later) syncLater({ extraWidgets: settings.extraWidgets });
  else sync.set({ extraWidgets: settings.extraWidgets });
}

function getClockCfg(id) {
  return id === 'clock' ? settings : (getExtra(id) || settings);
}
function getSearchCfg(id) {
  return id === 'search' ? settings : (getExtra(id) || settings);
}
function getWeatherCfg(id) {
  return id === 'weather' ? settings : (getExtra(id) || settings);
}

function patchWidget(id, patch, later = false) {
  if (id === 'clock' || id === 'search' || id === 'weather') {
    Object.assign(settings, patch);
    if (later) syncLater(patch); else sync.set(patch);
  } else {
    const item = getExtra(id);
    if (!item) return;
    Object.assign(item, patch);
    saveExtra(later);
  }
}

function duplicateWidget(type, sourceId) {
  const newId = `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  let entry;
  if (type === 'clock') {
    const c = getClockCfg(sourceId);
    entry = {
      id: newId, type: 'clock',
      clock24: !!c.clock24, clockSeconds: !!c.clockSeconds, clockDate: !!c.clockDate,
      clockGreeting: !!c.clockGreeting, clockScale: clamp(c.clockScale, 0.6, 1.6, 1),
      clockTz: c.clockTz || '', clockFont: c.clockFont || 'default', userName: c.userName || ''
    };
  } else if (type === 'search') {
    const c = getSearchCfg(sourceId);
    entry = {
      id: newId, type: 'search',
      engine: c.engine || 'google', searchTabs: c.searchTabs !== false,
      searchScale: clamp(c.searchScale, 0.75, 1.4, 1),
      searchTransparent: !!c.searchTransparent
    };
  } else if (type === 'weather') {
    const c = getWeatherCfg(sourceId);
    entry = {
      id: newId, type: 'weather',
      weatherView: c.weatherView || 'current', weatherScale: clampScale(c.weatherScale),
      weatherActive: c.weatherActive || 'auto', weatherShowAll: !!c.weatherShowAll,
      weatherTransparent: !!c.weatherTransparent
    };
  } else return;

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const srcEl = widgetEl(sourceId);
  const r = srcEl ? srcEl.getBoundingClientRect() : { left: 80, top: 80, right: 340, bottom: 160, width: 260, height: 80 };
  let pos;
  if (type === 'clock') {
    const goRight = r.right + r.width + 32 < vw;
    const xPx = goRight ? r.right + 28 : Math.max(16, r.left - r.width - 28);
    const yPx = r.top + scrollY;
    pos = { x: xPx / vw, y: yPx / vh, cx: (xPx + r.width / 2) / vw };
  } else if (type === 'search') {
    const yPx = Math.min(r.bottom + scrollY + 20, scrollY + vh - 90);
    pos = { x: Math.max(16, r.left) / vw, y: yPx / vh };
  } else {
    const yPx = Math.min(r.bottom + 14, vh - 90);
    pos = { x: Math.max(16, r.left) / vw, y: yPx / vh };
  }

  settings.extraWidgets = [...(settings.extraWidgets || []), entry];
  settings.widgetPos = { ...settings.widgetPos, [newId]: pos };
  sync.set({ extraWidgets: settings.extraWidgets, widgetPos: settings.widgetPos });
  mountExtraWidget(entry);
  applyWidgetPositions();
  if (type === 'clock') { updateClock(); scheduleClockTick(); }
  if (type === 'search') applyAllSearches();
  if (type === 'weather') showWeather();
  if (editing) ensureEditControls();
  closeContextMenus();
}

function mountExtraWidget(item) {
  const host = $('extraWidgets');
  if (item.type === 'clock') {
    const box = el('section', 'clock-box');
    box.dataset.widget = item.id;
    box.append(el('div', 'clock'), el('div', 'clock-tz'), el('div', 'clock-date'), el('div', 'greeting'));
    box.querySelector('.clock-tz').hidden = true;
    box.querySelector('.clock-date').hidden = true;
    box.addEventListener('contextmenu', (e) => {
      if (editing) return;
      e.preventDefault();
      activeClockId = item.id;
      syncClockMenu();
      showContextMenu($('clockMenu'), e.clientX, e.clientY);
    });
    host.append(box);
  } else if (item.type === 'search') {
    const box = el('div', 'search-box');
    box.dataset.widget = item.id;
    const nav = el('nav', 'engines');
    for (const [m, label] of [['web', 'Web'], ['images', 'Images'], ['news', 'News'], ['video', 'Video'], ['maps', 'Maps']]) {
      const b = el('button', m === 'web' ? 'active' : '', label);
      b.type = 'button';
      b.dataset.mode = m;
      nav.append(b);
    }
    const form = el('form', 'search-form');
    form.autocomplete = 'off';
    const engBtn = el('button', 'engine-btn');
    engBtn.type = 'button';
    engBtn.title = 'Search engine & options';
    engBtn.setAttribute('aria-haspopup', 'menu');
    engBtn.setAttribute('aria-expanded', 'false');
    const mark = el('span', 'g', 'G');
    mark.setAttribute('aria-hidden', 'true');
    engBtn.append(mark);
    const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    caret.setAttribute('class', 'caret');
    caret.setAttribute('width', '11');
    caret.setAttribute('height', '11');
    caret.setAttribute('viewBox', '0 0 12 12');
    caret.setAttribute('fill', 'none');
    caret.setAttribute('stroke', 'currentColor');
    caret.setAttribute('stroke-width', '1.8');
    caret.setAttribute('stroke-linecap', 'round');
    caret.setAttribute('stroke-linejoin', 'round');
    caret.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M3 4.5L6 7.5L9 4.5');
    caret.append(p);
    engBtn.append(caret);
    const input = el('input', 'search-input');
    input.type = 'search';
    input.placeholder = 'Search or type a URL';
    form.append(engBtn, input);
    box.append(nav, form);
    wireSearchEl(box, item.id);
    host.append(box);
  } else if (item.type === 'weather') {
    const box = el('div', 'weather');
    box.dataset.widget = item.id;
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    box.setAttribute('aria-expanded', 'false');
    box.setAttribute('aria-controls', 'forecast');
    const main = el('div', 'w-main');
    const txt = el('span', 'w-text');
    txt.append(el('span', 'w-temp'), el('span', 'w-place'));
    main.append(el('span', 'w-icon'), txt);
    const extra = el('div', 'w-extra');
    extra.hidden = true;
    box.append(main, extra);
    wireWeatherEl(box, item.id);
    host.append(box);
  }
}

function renderExtraWidgets() {
  $('extraWidgets').replaceChildren();
  for (const item of settings.extraWidgets || []) mountExtraWidget(item);
  if (editing) ensureEditControls();
}

// ---------- clock & greeting ----------
const TIMEZONES = [
  ['', 'Local time'],
  ['UTC', 'UTC'],
  ['Europe/London', 'London (GMT/BST)'],
  ['Europe/Dublin', 'Dublin'],
  ['Europe/Lisbon', 'Lisbon'],
  ['Europe/Bratislava', 'Bratislava (CET)'],
  ['Europe/Prague', 'Prague (CET)'],
  ['Europe/Vienna', 'Vienna (CET)'],
  ['Europe/Berlin', 'Berlin (CET)'],
  ['Europe/Paris', 'Paris (CET)'],
  ['Europe/Zurich', 'Zurich (CET)'],
  ['Europe/Amsterdam', 'Amsterdam (CET)'],
  ['Europe/Madrid', 'Madrid (CET)'],
  ['Europe/Rome', 'Rome (CET)'],
  ['Europe/Warsaw', 'Warsaw (CET)'],
  ['Europe/Stockholm', 'Stockholm (CET)'],
  ['Europe/Athens', 'Athens (EET)'],
  ['Europe/Kyiv', 'Kyiv (EET)'],
  ['Europe/Helsinki', 'Helsinki (EET)'],
  ['Europe/Istanbul', 'Istanbul'],
  ['Europe/Moscow', 'Moscow'],
  ['America/New_York', 'New York (ET)'],
  ['America/Toronto', 'Toronto (ET)'],
  ['America/Chicago', 'Chicago (CT)'],
  ['America/Denver', 'Denver (MT)'],
  ['America/Los_Angeles', 'Los Angeles (PT)'],
  ['America/Vancouver', 'Vancouver (PT)'],
  ['America/Mexico_City', 'Mexico City'],
  ['America/Sao_Paulo', 'São Paulo'],
  ['America/Buenos_Aires', 'Buenos Aires'],
  ['Asia/Dubai', 'Dubai (GST)'],
  ['Asia/Kolkata', 'Mumbai / Delhi (IST)'],
  ['Asia/Bangkok', 'Bangkok (ICT)'],
  ['Asia/Singapore', 'Singapore (SGT)'],
  ['Asia/Hong_Kong', 'Hong Kong'],
  ['Asia/Shanghai', 'Shanghai / Beijing'],
  ['Asia/Tokyo', 'Tokyo (JST)'],
  ['Asia/Seoul', 'Seoul (KST)'],
  ['Australia/Sydney', 'Sydney (AEST)'],
  ['Australia/Melbourne', 'Melbourne'],
  ['Pacific/Auckland', 'Auckland (NZST)'],
  ['Pacific/Honolulu', 'Honolulu (HST)']
];

let clockTimeout, clockInterval;

function clamp(n, lo, hi, fallback = 1) {
  return Math.round(Math.max(lo, Math.min(hi, Number(n) || fallback)) * 100) / 100;
}

function tzShortLabel(tz) {
  if (!tz) return '';
  if (tz === 'UTC') return 'UTC';
  return tz.split('/').pop().replace(/_/g, ' ');
}

function clockPartsFor(now, tz) {
  try {
    const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', ...(tz ? { timeZone: tz } : {}) };
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', opts).formatToParts(now).map((p) => [p.type, p.value]));
    return { hour24: Number(parts.hour) % 24, minute: parts.minute, second: parts.second };
  } catch {
    return { hour24: now.getHours(), minute: String(now.getMinutes()).padStart(2, '0'), second: String(now.getSeconds()).padStart(2, '0') };
  }
}

function scheduleClockTick() {
  clearTimeout(clockTimeout);
  clearInterval(clockInterval);
  const extraClocks = (settings.extraWidgets || []).filter((w) => w.type === 'clock');
  const anyVisible = settings.showClock || extraClocks.length > 0;
  if (!anyVisible) return;
  const anySeconds = (settings.showClock && settings.clockSeconds) || extraClocks.some((c) => c.clockSeconds);
  const step = anySeconds ? 1000 : 60e3;
  clockTimeout = setTimeout(() => {
    updateClock();
    clockInterval = setInterval(updateClock, step);
  }, step - (Date.now() % step) + 30);
}

function renderClockEl(box, cfg, now) {
  const scale = clamp(cfg.clockScale, 0.6, 1.6, 1);
  cfg.clockScale = scale;
  box.style.setProperty('--c-scale', String(scale));
  box.dataset.font = cfg.clockFont || 'default';
  const tz = cfg.clockTz || '';
  const { hour24, minute, second } = clockPartsFor(now, tz);
  const s = cfg.clockSeconds ? `:${second}` : '';
  let text;
  if (cfg.clock24) text = `${String(hour24).padStart(2, '0')}:${minute}${s}`;
  else { const ap = hour24 < 12 ? 'AM' : 'PM'; const h12 = hour24 % 12 || 12; text = `${h12}:${minute}${s} ${ap}`; }
  box.querySelector('.clock').textContent = text;

  const tzEl = box.querySelector('.clock-tz');
  const tzName = tzShortLabel(tz);
  tzEl.hidden = !tzName;
  if (tzName) tzEl.textContent = tzName;

  const dateEl = box.querySelector('.clock-date');
  dateEl.hidden = !cfg.clockDate;
  if (cfg.clockDate) {
    try {
      dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(tz ? { timeZone: tz } : {}) });
    } catch {
      dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    }
  }

  const greetEl = box.querySelector('.greeting');
  greetEl.hidden = !cfg.clockGreeting;
  if (cfg.clockGreeting) {
    const part = hour24 < 5 ? 'Good night' : hour24 < 12 ? 'Good morning' : hour24 < 17 ? 'Good afternoon' : hour24 < 22 ? 'Good evening' : 'Good night';
    const name = (cfg.userName || '').trim();
    greetEl.textContent = name ? `${part}, ${name}.` : `${part}.`;
  }
}

function updateClock() {
  const now = new Date();
  const box = $('clockBox');
  box.hidden = !settings.showClock;
  if (settings.showClock) renderClockEl(box, settings, now);
  for (const item of settings.extraWidgets || []) {
    if (item.type !== 'clock') continue;
    const elBox = widgetEl(item.id);
    if (elBox) renderClockEl(elBox, item, now);
  }
  positionClockBoxes();
}

function syncClockMenu() {
  const cfg = getClockCfg(activeClockId);
  const sel = $('cmTz');
  const tz = cfg.clockTz || '';
  if (tz && !TIMEZONES.some(([v]) => v === tz)) {
    if (![...sel.options].some((o) => o.value === tz)) sel.append(new Option(tz, tz));
  }
  sel.value = tz;
  $('cmFont').value = cfg.clockFont || 'default';
  $('cm24').checked = !!cfg.clock24;
  $('cmSeconds').checked = !!cfg.clockSeconds;
  $('cmDate').checked = !!cfg.clockDate;
  $('cmGreeting').checked = !!cfg.clockGreeting;
  if (document.activeElement !== $('cmName')) $('cmName').value = cfg.userName || '';
}

function setupClock() {
  const tzSel = $('cmTz');
  tzSel.replaceChildren();
  for (const [val, label] of TIMEZONES) tzSel.append(new Option(label, val));

  updateClock();
  scheduleClockTick();

  const menu = $('clockMenu');
  menu.addEventListener('click', (e) => e.stopPropagation());
  $('clockBox').addEventListener('contextmenu', (e) => {
    if (editing) return;
    e.preventDefault();
    activeClockId = 'clock';
    syncClockMenu();
    showContextMenu(menu, e.clientX, e.clientY);
  });

  tzSel.addEventListener('change', () => {
    patchWidget(activeClockId, { clockTz: tzSel.value });
    updateClock();
    applyWidgetPositions();
  });

  $('cmFont').addEventListener('change', () => {
    patchWidget(activeClockId, { clockFont: $('cmFont').value });
    updateClock();
    applyWidgetPositions();
  });

  const bindToggle = (id, key, reschedule = false) => {
    $(id).addEventListener('change', () => {
      patchWidget(activeClockId, { [key]: $(id).checked });
      updateClock();
      if (reschedule) scheduleClockTick();
      applyWidgetPositions();
    });
  };
  bindToggle('cm24', 'clock24');
  bindToggle('cmSeconds', 'clockSeconds', true);
  bindToggle('cmDate', 'clockDate');
  bindToggle('cmGreeting', 'clockGreeting');

  $('cmName').addEventListener('input', () => {
    patchWidget(activeClockId, { userName: $('cmName').value }, true);
    updateClock();
  });
}

// ---------- weather ----------
const WMO = [
  [[0], '☀️', '🌙', 'Clear'],
  [[1], '🌤️', '🌙', 'Mostly clear'],
  [[2], '⛅', '☁️', 'Partly cloudy'],
  [[3], '☁️', '☁️', 'Overcast'],
  [[45, 48], '🌫️', '🌫️', 'Fog'],
  [[51, 53, 55, 56, 57], '🌦️', '🌧️', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', '🌨️', 'Snow'],
  [[95, 96, 99], '⛈️', '⛈️', 'Thunderstorm']
];
function describe(code, isDay) {
  const row = WMO.find(([codes]) => codes.includes(code)) || [[], '🌡️', '🌡️', ''];
  return { icon: isDay ? row[1] : row[2], text: row[3] };
}

const round2 = (n) => Math.round(n * 100) / 100;

function devicePosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      // About 1 km precision is plenty for weather and keeps the exact position private.
      (p) => resolve({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) }),
      reject,
      { timeout: 10000, maximumAge: 3600e3 }
    );
  });
}

async function resolveAutoPlace() {
  const { place } = await local.get('place');
  const want = settings.city.trim().toLowerCase();
  // Reuse the resolved place for the same city, or for device location for 6 h.
  if (place && place.city === want && (want || Date.now() - place.time < 6 * 3600e3)) {
    return { id: 'auto', name: place.name, lat: place.lat, lon: place.lon };
  }

  let lat, lon, name;
  if (want) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(settings.city.trim())}`);
    const g = (await r.json()).results?.[0];
    if (!g) throw new Error('city not found');
    ({ latitude: lat, longitude: lon, name } = g);
  } else {
    ({ lat, lon } = await devicePosition());
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const g = await r.json();
      name = g.city || g.locality || g.principalSubdivision || '';
    } catch { name = ''; }
  }
  const resolved = { city: want, lat, lon, name, time: Date.now() };
  await local.set({ place: resolved });
  return { id: 'auto', name, lat, lon };
}

async function fetchWeatherFor(place) {
  const key = `${round2(place.lat).toFixed(2)},${round2(place.lon).toFixed(2)}`;
  const { wxCache = {} } = await local.get('wxCache');
  let entry = wxCache[key];
  const fresh = entry && entry.hourly && (entry.daily?.time?.length || 0) >= 14 && Date.now() - entry.time < 30 * 60e3;
  if (!fresh) {
    try {
      const q = new URLSearchParams({
        latitude: round2(place.lat), longitude: round2(place.lon), timezone: 'auto', forecast_days: '14',
        current: 'temperature_2m,weather_code,is_day',
        hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      });
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      entry = { key, time: Date.now(), current: data.current, hourly: data.hourly, daily: data.daily };
      wxCache[key] = entry;
      const keys = Object.keys(wxCache);
      if (keys.length > 12) {
        keys.sort((a, b) => (wxCache[a].time || 0) - (wxCache[b].time || 0));
        for (const old of keys.slice(0, keys.length - 12)) delete wxCache[old];
      }
      local.set({ wxCache });
    } catch (err) {
      console.warn('Weather unavailable', place.name, err);
      if (!entry || !entry.hourly) return null;
    }
  }
  return entry;
}

async function radarLink() {
  // Prefer the user's own "Weather & Radar" / "Počasie & Radar" site from history.
  const found = [];
  for (const text of ['Weather & Radar', 'Počasie & Radar', 'radar']) {
    found.push(...await chrome.history.search({ text, startTime: 0, maxResults: 200 }));
  }
  // A "Weather & Radar" title outranks pages that merely mention radar.
  const named = /(po[čc]asie|weather|wetter)\s*(&|a|and|und)\s*radar/i;
  const score = (h) => (named.test(h.title || '') ? 1e9 : 0) + (h.visitCount || 0);
  const match = found
    .filter((h) => /^https?:/.test(h.url) && /radar/i.test(`${h.title} ${h.url}`))
    .sort((a, b) => score(b) - score(a))[0];
  if (!match) return 'https://www.google.com/search?q=weather+radar';
  const u = new URL(match.url);
  return /radar/i.test(u.pathname) ? match.url : `${u.protocol}//${u.host}/`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let weatherEntries = []; // [{ place, wx }]
let forecastPlaceId = null;
let forecastAnchorId = 'weather';

function rainText(p) {
  return p >= 20 ? `💧${p}%` : '';
}

function clampScale(s) {
  return Math.round(Math.max(0.7, Math.min(1.6, Number(s) || 1)) * 100) / 100;
}

function applyWeatherStyle(id = activeWeatherId) {
  const cfg = getWeatherCfg(id);
  const scale = clampScale(cfg.weatherScale);
  cfg.weatherScale = scale;
  const wEl = widgetEl(id);
  if (wEl) {
    wEl.style.setProperty('--w-scale', String(scale));
    wEl.classList.toggle('transparent', !!cfg.weatherTransparent);
  }
  if (id === activeWeatherId) {
    for (const b of document.querySelectorAll('#weatherMenu [data-view]')) {
      const active = b.dataset.view === (cfg.weatherView || 'current');
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    }
    $('wxTransparent').checked = !!cfg.weatherTransparent;
  }
  keepWidgetsOnScreen();
}

function buildInlineForecast(wx, view = 'current') {
  if (view === 'hourly') {
    const strip = el('div', 'w-inline-hourly');
    const nowHour = wx.current.time.slice(0, 13);
    let start = wx.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour);
    if (start < 0) start = 0;
    for (let i = start; i < Math.min(start + 24, wx.hourly.time.length); i++) {
      const d = describe(wx.hourly.weather_code[i], wx.hourly.is_day[i] === 1);
      const col = el('div', i === start ? 'w-mini-col now' : 'w-mini-col');
      col.title = d.text;
      col.append(
        el('span', '', i === start ? 'Now' : `${wx.hourly.time[i].slice(11, 13)}h`),
        el('span', 'ic', d.icon),
        el('span', 't', `${Math.round(wx.hourly.temperature_2m[i])}°`)
      );
      strip.append(col);
    }
    return strip;
  }
  if (view === 'daily7' || view === 'long14') {
    const daysCount = view === 'long14' ? Math.min(14, wx.daily.time.length) : Math.min(7, wx.daily.time.length);
    const grid = el('div', view === 'long14' ? 'w-inline-daily long' : 'w-inline-daily');
    for (let i = 0; i < daysCount; i++) {
      const date = wx.daily.time[i];
      const day = new Date(`${date}T12:00:00`);
      const d = describe(wx.daily.weather_code[i], true);
      const lbl = i === 0 ? 'Today' : view === 'long14' && i >= 7 ? `${day.getDate()}.${day.getMonth() + 1}` : DAYS[day.getDay()];
      const col = el('div', i === 0 ? 'w-mini-col now' : 'w-mini-col');
      col.title = `${DAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]} – ${d.text}`;
      col.append(
        el('span', '', lbl),
        el('span', 'ic', d.icon),
        el('span', 't', `${Math.round(wx.daily.temperature_2m_max[i])}°`),
        el('span', 'lo', `${Math.round(wx.daily.temperature_2m_min[i])}°`)
      );
      grid.append(col);
    }
    return grid;
  }
  return null;
}

function renderForecastTabs(activeId, view) {
  const tabs = $('fTabs');
  tabs.replaceChildren();
  const list = weatherEntries;
  if (list.length <= 1) { tabs.hidden = true; return; }
  tabs.hidden = false;
  for (const entry of list) {
    const b = el('button', entry.place.id === activeId ? 'active' : '', entry.place.name || 'My location');
    b.type = 'button';
    b.addEventListener('click', () => {
      forecastPlaceId = entry.place.id;
      renderForecast(entry.wx, entry.place, view);
    });
    tabs.append(b);
  }
}

function renderForecast(wx, place, view = settings.weatherView) {
  forecastPlaceId = place.id;
  $('fPlace').textContent = place.name || 'Forecast';
  renderForecastTabs(place.id, view);

  const longHourly = view === 'hourly' || view === 'long14';
  const hoursCount = longHourly ? 48 : 24;
  $('hourlyTitle').textContent = longHourly ? 'Hourly (48h)' : 'Hourly';

  const hourly = $('hourly');
  hourly.replaceChildren();
  const nowHour = wx.current.time.slice(0, 13); // "YYYY-MM-DDTHH"
  let start = wx.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour);
  if (start < 0) start = 0;
  for (let i = start; i < Math.min(start + hoursCount, wx.hourly.time.length); i++) {
    const d = describe(wx.hourly.weather_code[i], wx.hourly.is_day[i] === 1);
    const h = el('div', i === start ? 'hour now' : 'hour');
    h.title = d.text;
    const hr = wx.hourly.time[i].slice(11, 13);
    const label = i === start ? 'Now' : (hr === '00' && i > start ? `${DAYS[new Date(`${wx.hourly.time[i].slice(0, 10)}T12:00:00`).getDay()]} 00` : `${hr}:00`);
    h.append(
      el('span', '', label),
      el('span', 'ic', d.icon),
      el('span', 't', `${Math.round(wx.hourly.temperature_2m[i])}°`),
      el('span', 'rain', rainText(wx.hourly.precipitation_probability[i] ?? 0))
    );
    hourly.append(h);
  }

  const longDaily = view === 'long14';
  const daysLimit = longDaily ? Math.min(14, wx.daily.time.length) : Math.min(8, wx.daily.time.length);
  $('dailyTitle').textContent = longDaily ? `Next ${daysLimit} days` : 'Next 7 days';

  const daily = $('daily');
  daily.replaceChildren();
  const sliceMin = wx.daily.temperature_2m_min.slice(0, daysLimit);
  const sliceMax = wx.daily.temperature_2m_max.slice(0, daysLimit);
  const lo = Math.min(...sliceMin);
  const hi = Math.max(...sliceMax);
  const span = Math.max(hi - lo, 1);
  wx.daily.time.slice(0, daysLimit).forEach((date, i) => {
    const d = describe(wx.daily.weather_code[i], true);
    const day = new Date(`${date}T12:00:00`);
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
    const min = wx.daily.temperature_2m_min[i];
    const max = wx.daily.temperature_2m_max[i];

    const bar = el('span', 'bar');
    const fill = el('span');
    fill.style.left = `${((min - lo) / span) * 100}%`;
    fill.style.right = `${100 - ((max - lo) / span) * 100}%`;
    bar.append(fill);
    const range = el('span', 'range');
    range.append(el('span', 'lo', `${Math.round(min)}°`), bar, el('span', 'hi', `${Math.round(max)}°`));

    const row = el('div', 'day');
    row.title = d.text;
    row.append(el('span', '', name), el('span', 'ic', d.icon),
      el('span', 'rain', rainText(wx.daily.precipitation_probability_max[i] ?? 0)), range);
    daily.append(row);
  });
}

function toggleForecast(open, anchorEl) {
  const panel = $('forecast');
  const anchor = anchorEl || widgetEl(forecastAnchorId) || $('weather');
  panel.hidden = !open;
  for (const w of document.querySelectorAll('.weather')) w.setAttribute('aria-expanded', String(open && w === anchor));
  if (open && anchor) placeNear(panel, anchor);
}

function wireWeatherEl(wEl, id) {
  const openFor = (e) => {
    if (editing) return;
    closeContextMenus();
    const panel = $('forecast');
    const cfg = getWeatherCfg(id);
    const locRow = e?.target?.closest?.('.w-loc-row');
    const wantId = locRow ? locRow.dataset.id : cfg.weatherActive;
    const entry = weatherEntries.find((x) => x.place.id === wantId) || weatherEntries[0];
    if (!entry) return;
    const same = !panel.hidden && forecastAnchorId === id && forecastPlaceId === entry.place.id;
    if (same) { toggleForecast(false, wEl); return; }
    forecastAnchorId = id;
    renderForecast(entry.wx, entry.place, cfg.weatherView);
    toggleForecast(true, wEl);
  };
  wEl.addEventListener('click', openFor);
  wEl.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !editing) { e.preventDefault(); openFor(); }
  });
  wEl.addEventListener('contextmenu', (e) => {
    if (editing) return;
    e.preventDefault();
    activeWeatherId = id;
    openWeatherMenu(e.clientX, e.clientY);
  });
}

function setupForecastPanel() {
  const panel = $('forecast');
  wireWeatherEl($('weather'), 'weather');
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('.weather') && !$('weatherMenu').contains(e.target)) toggleForecast(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleForecast(false); });
}

function renderWeatherMenu() {
  const cfg = getWeatherCfg(activeWeatherId);
  applyWeatherStyle(activeWeatherId);
  const list = $('wxLocations');
  list.replaceChildren();
  const autoLabel = settings.city.trim() ? settings.city.trim() : 'My location (GPS)';
  const items = [{ id: 'auto', name: autoLabel, removable: false }, ...settings.weatherPlaces.map((p) => ({ ...p, removable: true }))];
  const activeId = items.some((x) => x.id === cfg.weatherActive) ? cfg.weatherActive : 'auto';

  for (const item of items) {
    const row = el('div', 'wx-loc-item');
    const btn = el('button', item.id === activeId ? 'wx-opt active' : 'wx-opt');
    btn.type = 'button';
    btn.append(el('span', '', item.name), el('span', 'wx-check', '✓'));
    btn.addEventListener('click', () => {
      patchWidget(activeWeatherId, { weatherActive: item.id });
      if (forecastAnchorId === activeWeatherId) forecastPlaceId = item.id;
      renderWeatherMenu();
      showWeather();
    });
    row.append(btn);
    if (item.removable) {
      const del = el('button', 'wx-loc-del', '×');
      del.type = 'button';
      del.title = `Remove ${item.name}`;
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        settings.weatherPlaces = settings.weatherPlaces.filter((p) => p.id !== item.id);
        const upd = { weatherPlaces: settings.weatherPlaces };
        if (settings.weatherActive === item.id) { settings.weatherActive = 'auto'; upd.weatherActive = 'auto'; }
        if (!settings.weatherPlaces.length && settings.weatherShowAll) { settings.weatherShowAll = false; upd.weatherShowAll = false; }
        let extraChanged = false;
        for (const w of settings.extraWidgets || []) {
          if (w.type !== 'weather') continue;
          if (w.weatherActive === item.id) { w.weatherActive = 'auto'; extraChanged = true; }
          if (!settings.weatherPlaces.length && w.weatherShowAll) { w.weatherShowAll = false; extraChanged = true; }
        }
        if (extraChanged) upd.extraWidgets = settings.extraWidgets;
        if (forecastPlaceId === item.id) forecastPlaceId = 'auto';
        await sync.set(upd);
        renderWeatherMenu();
        showWeather();
      });
      row.append(del);
    }
    list.append(row);
  }

  const hasSaved = settings.weatherPlaces.length > 0;
  $('wxShowAllRow').hidden = !hasSaved;
  $('wxShowAll').checked = !!cfg.weatherShowAll;
}

function openWeatherMenu(x, y) {
  const menu = $('weatherMenu');
  $('wxAddResults').hidden = true;
  $('wxAddResults').replaceChildren();
  renderWeatherMenu();
  showContextMenu(menu, x, y);
}

function setupWeatherMenu() {
  const menu = $('weatherMenu');
  menu.addEventListener('click', (e) => e.stopPropagation());
  $('forecast').addEventListener('contextmenu', (e) => {
    if (editing) return;
    e.preventDefault();
    activeWeatherId = forecastAnchorId || 'weather';
    openWeatherMenu(e.clientX, e.clientY);
  });

  for (const b of menu.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => {
      patchWidget(activeWeatherId, { weatherView: b.dataset.view });
      applyWeatherStyle(activeWeatherId);
      showWeather();
    });
  }

  $('wxShowAll').addEventListener('change', () => {
    patchWidget(activeWeatherId, { weatherShowAll: $('wxShowAll').checked });
    showWeather();
  });

  $('wxTransparent').addEventListener('change', () => {
    patchWidget(activeWeatherId, { weatherTransparent: $('wxTransparent').checked });
    applyWeatherStyle(activeWeatherId);
  });

  const addPlace = async (g) => {
    const label = g.country_code ? `${g.name}, ${g.country_code}` : g.name;
    const id = `${round2(g.latitude)},${round2(g.longitude)}`;
    if (!settings.weatherPlaces.some((p) => p.id === id)) {
      settings.weatherPlaces = [...settings.weatherPlaces, { id, name: label, lat: round2(g.latitude), lon: round2(g.longitude) }];
    }
    await sync.set({ weatherPlaces: settings.weatherPlaces });
    patchWidget(activeWeatherId, { weatherActive: id });
    if (forecastAnchorId === activeWeatherId) forecastPlaceId = id;
    $('wxAddInput').value = '';
    $('wxAddResults').hidden = true;
    $('wxAddResults').replaceChildren();
    renderWeatherMenu();
    showWeather();
  };

  $('wxAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('wxAddInput').value.trim();
    if (!q) return;
    const box = $('wxAddResults');
    box.replaceChildren(el('div', 'wx-add-msg', 'Searching…'));
    box.hidden = false;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(q)}`);
      const results = (await r.json()).results || [];
      if (!results.length) { box.replaceChildren(el('div', 'wx-add-msg', 'City not found.')); return; }
      if (results.length === 1) { await addPlace(results[0]); return; }
      box.replaceChildren();
      for (const g of results) {
        const parts = [g.name, g.admin1, g.country_code].filter(Boolean);
        const btn = el('button', '', parts.join(', '));
        btn.type = 'button';
        btn.addEventListener('click', () => addPlace(g));
        box.append(btn);
      }
      const mr = menu.getBoundingClientRect();
      const vh = document.documentElement.clientHeight;
      if (mr.bottom > vh - 8) menu.style.top = `${Math.max(8, vh - mr.height - 8)}px`;
    } catch {
      box.replaceChildren(el('div', 'wx-add-msg', 'Search failed.'));
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.wx-menu')) closeContextMenus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenus(); });
}

function renderWeatherBox(wEl, cfg, id) {
  wEl.style.setProperty('--w-scale', String(clampScale(cfg.weatherScale)));
  wEl.classList.toggle('transparent', !!cfg.weatherTransparent);
  const activeEntry = weatherEntries.find((e) => e.place.id === cfg.weatherActive) || weatherEntries[0];
  const multi = !!cfg.weatherShowAll && weatherEntries.length > 1;
  const inlineNode = buildInlineForecast(activeEntry.wx, cfg.weatherView || 'current');
  const main = wEl.querySelector('.w-main');
  const extra = wEl.querySelector('.w-extra');
  extra.replaceChildren();

  if (multi) {
    main.hidden = true;
    const locList = el('div', 'w-loc-list');
    for (const entry of weatherEntries) {
      const d = describe(entry.wx.current.weather_code, entry.wx.current.is_day === 1);
      const row = el('div', entry.place.id === activeEntry.place.id ? 'w-loc-row active' : 'w-loc-row');
      row.dataset.id = entry.place.id;
      row.title = `${d.text} – ${entry.place.name || 'My location'}\nClick for forecast · Right-click for options`;
      row.append(
        el('span', 'ic', d.icon),
        el('span', 'name', entry.place.name || d.text),
        el('span', 'temp', `${Math.round(entry.wx.current.temperature_2m)}°`)
      );
      locList.append(row);
    }
    extra.append(locList);
    if (inlineNode) extra.append(inlineNode);
    extra.hidden = false;
    wEl.classList.add('expanded');
    wEl.title = 'Click a city for forecast · Right-click for options';
  } else {
    const d = describe(activeEntry.wx.current.weather_code, activeEntry.wx.current.is_day === 1);
    main.hidden = false;
    wEl.querySelector('.w-icon').textContent = d.icon;
    wEl.querySelector('.w-temp').textContent = `${Math.round(activeEntry.wx.current.temperature_2m)}°C`;
    wEl.querySelector('.w-place').textContent = activeEntry.place.name || d.text;
    if (inlineNode) {
      extra.append(inlineNode);
      extra.hidden = false;
      wEl.classList.add('expanded');
    } else {
      extra.hidden = true;
      wEl.classList.remove('expanded');
    }
    wEl.title = `${d.text}${activeEntry.place.name ? ` – ${activeEntry.place.name}` : ''}\nClick for the forecast · Right-click for options`;
  }
  wEl.hidden = false;
}

async function showWeather() {
  const primary = $('weather');
  const extraWeathers = (settings.extraWidgets || []).filter((w) => w.type === 'weather');
  if (!settings.weatherOn) primary.hidden = true;
  if (!settings.weatherOn && !extraWeathers.length) {
    $('forecast').hidden = true;
    $('weatherMenu').hidden = true;
    return;
  }

  radarLink().then((href) => { $('radar').href = href; }).catch(() => {});

  const targets = [
    ...(settings.weatherOn ? [{ id: 'weather', cfg: settings, el: primary }] : []),
    ...extraWeathers.map((w) => ({ id: w.id, cfg: w, el: widgetEl(w.id) })).filter((t) => t.el)
  ];

  let autoPlace = null;
  const saved = Array.isArray(settings.weatherPlaces) ? settings.weatherPlaces : [];
  const needAuto = targets.some((t) => t.cfg.weatherActive === 'auto' || !saved.some((p) => p.id === t.cfg.weatherActive) || t.cfg.weatherShowAll);
  if (needAuto) {
    try { autoPlace = await resolveAutoPlace(); } catch (err) { console.warn('Weather location unavailable', err); }
  }

  const allPlaces = [];
  if (autoPlace) allPlaces.push(autoPlace);
  for (const p of saved) {
    const dup = autoPlace && Math.abs(autoPlace.lat - p.lat) < 0.05 && Math.abs(autoPlace.lon - p.lon) < 0.05;
    if (!dup) allPlaces.push(p);
  }

  if (!allPlaces.length) {
    for (const t of targets) {
      t.el.hidden = false;
      t.el.classList.remove('expanded');
      t.el.querySelector('.w-main').hidden = false;
      t.el.querySelector('.w-extra').hidden = true;
      t.el.querySelector('.w-icon').textContent = '📍';
      t.el.querySelector('.w-temp').textContent = '—';
      t.el.querySelector('.w-place').textContent = 'Right-click to add a city';
    }
    return;
  }

  const fetched = await Promise.all(allPlaces.map(async (place) => ({ place, wx: await fetchWeatherFor(place) })));
  weatherEntries = fetched.filter((e) => e.wx);
  if (!weatherEntries.length) return;

  for (const t of targets) renderWeatherBox(t.el, t.cfg, t.id);

  if (!$('forecast').hidden) {
    const anchorTarget = targets.find((t) => t.id === forecastAnchorId) || targets[0];
    if (anchorTarget) {
      const popupEntry = weatherEntries.find((e) => e.place.id === forecastPlaceId)
        || weatherEntries.find((e) => e.place.id === anchorTarget.cfg.weatherActive)
        || weatherEntries[0];
      renderForecast(popupEntry.wx, popupEntry.place, anchorTarget.cfg.weatherView);
    }
  }
  keepWidgetsOnScreen();
}

// ---------- search ----------
const ENGINES = {
  google: {
    name: 'Google', mark: 'G', color: '#4285f4',
    web: 'https://www.google.com/search?q=%s',
    images: 'https://www.google.com/search?tbm=isch&q=%s',
    news: 'https://www.google.com/search?tbm=nws&q=%s',
    video: 'https://www.google.com/search?tbm=vid&q=%s',
    maps: 'https://www.google.com/maps/search/%s'
  },
  bing: {
    name: 'Bing', mark: 'B', color: '#008373',
    web: 'https://www.bing.com/search?q=%s',
    images: 'https://www.bing.com/images/search?q=%s',
    news: 'https://www.bing.com/news/search?q=%s',
    video: 'https://www.bing.com/videos/search?q=%s',
    maps: 'https://www.bing.com/maps?q=%s'
  },
  ddg: {
    name: 'DuckDuckGo', mark: 'D', color: '#de5833',
    web: 'https://duckduckgo.com/?q=%s',
    images: 'https://duckduckgo.com/?q=%s&ia=images&iax=images',
    news: 'https://duckduckgo.com/?q=%s&ia=news&iar=news',
    video: 'https://duckduckgo.com/?q=%s&ia=videos&iax=videos',
    maps: 'https://duckduckgo.com/?q=%s&ia=maps&iaxm=maps'
  },
  brave: {
    name: 'Brave Search', mark: 'Br', color: '#fb542b',
    web: 'https://search.brave.com/search?q=%s',
    images: 'https://search.brave.com/images?q=%s',
    news: 'https://search.brave.com/news?q=%s',
    video: 'https://search.brave.com/videos?q=%s',
    maps: 'https://www.openstreetmap.org/search?query=%s'
  },
  perplexity: {
    name: 'Perplexity', mark: 'P', color: '#20808d',
    web: 'https://www.perplexity.ai/search?q=%s',
    images: 'https://www.perplexity.ai/search?q=%s',
    news: 'https://www.perplexity.ai/search?q=%s',
    video: 'https://www.perplexity.ai/search?q=%s',
    maps: 'https://www.perplexity.ai/search?q=%s'
  },
  ecosia: {
    name: 'Ecosia', mark: 'E', color: '#369952',
    web: 'https://www.ecosia.org/search?q=%s',
    images: 'https://www.ecosia.org/images?q=%s',
    news: 'https://www.ecosia.org/news?q=%s',
    video: 'https://www.ecosia.org/videos?q=%s',
    maps: 'https://www.openstreetmap.org/search?query=%s'
  },
  startpage: {
    name: 'Startpage', mark: 'S', color: '#6573ff',
    web: 'https://www.startpage.com/sp/search?query=%s',
    images: 'https://www.startpage.com/sp/search?query=%s&cat=images',
    news: 'https://www.startpage.com/sp/search?query=%s&cat=news',
    video: 'https://www.startpage.com/sp/search?query=%s&cat=video',
    maps: 'https://www.openstreetmap.org/search?query=%s'
  },
  qwant: {
    name: 'Qwant', mark: 'Q', color: '#5c97ff',
    web: 'https://www.qwant.com/?q=%s&t=web',
    images: 'https://www.qwant.com/?q=%s&t=images',
    news: 'https://www.qwant.com/?q=%s&t=news',
    video: 'https://www.qwant.com/?q=%s&t=videos',
    maps: 'https://www.qwant.com/maps/?q=%s'
  },
  yahoo: {
    name: 'Yahoo', mark: 'Y!', color: '#720e9e',
    web: 'https://search.yahoo.com/search?p=%s',
    images: 'https://images.search.yahoo.com/search/images?p=%s',
    news: 'https://news.search.yahoo.com/search?p=%s',
    video: 'https://video.search.yahoo.com/search/video?p=%s',
    maps: 'https://www.google.com/maps/search/%s'
  },
  yandex: {
    name: 'Yandex', mark: 'Ya', color: '#fc3f1d',
    web: 'https://yandex.com/search/?text=%s',
    images: 'https://yandex.com/images/search?text=%s',
    news: 'https://yandex.com/search/?text=%s',
    video: 'https://yandex.com/video/search?text=%s',
    maps: 'https://yandex.com/maps/?text=%s'
  }
};

function renderSearchEl(box, cfg) {
  const scale = clamp(cfg.searchScale, 0.75, 1.4, 1);
  cfg.searchScale = scale;
  box.style.setProperty('--s-scale', String(scale));
  box.classList.toggle('transparent', !!cfg.searchTransparent);
  box.querySelector('.engines').hidden = cfg.searchTabs === false;
  const key = cfg.engine in ENGINES ? cfg.engine : 'google';
  const e = ENGINES[key];
  const mark = box.querySelector('.g');
  mark.textContent = e.mark;
  mark.classList.toggle('google', key === 'google');
  mark.style.setProperty('--eng-color', e.color);
  box.querySelector('.search-input').placeholder = `Search ${e.name} or type a URL`;
}

function syncSearchMenu() {
  const cfg = getSearchCfg(activeSearchId);
  const key = cfg.engine in ENGINES ? cfg.engine : 'google';
  for (const b of document.querySelectorAll('#searchEngineList [data-engine]')) {
    const active = b.dataset.engine === key;
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', String(active));
  }
  $('smTabs').checked = cfg.searchTabs !== false;
  $('smTransparent').checked = !!cfg.searchTransparent;
}

function applyAllSearches() {
  const primary = $('searchBox');
  primary.hidden = !settings.showSearch;
  renderSearchEl(primary, settings);
  for (const item of settings.extraWidgets || []) {
    if (item.type !== 'search') continue;
    const box = widgetEl(item.id);
    if (box) renderSearchEl(box, item);
  }
  syncSearchMenu();
}

function wireSearchEl(box, id) {
  let mode = 'web';
  const enginesNav = box.querySelector('.engines');
  const form = box.querySelector('.search-form');
  const input = box.querySelector('.search-input');
  const engineBtn = box.querySelector('.engine-btn');

  // Quick Jump dropdown (open tabs + matching pinned/most-visited sites)
  const qj = el('div', 'quick-jump');
  qj.hidden = true;
  box.append(qj);
  let qjItems = [];
  let qjIndex = -1;
  let qjTimer;

  const hideQJ = () => { qj.hidden = true; qjItems = []; qjIndex = -1; };
  const highlightQJ = () => {
    [...qj.children].forEach((c, i) => c.classList.toggle('active', i === qjIndex));
  };
  const activateQJ = (item) => {
    hideQJ();
    if (item.tabId != null && chrome.tabs) {
      input.value = '';
      chrome.tabs.update(item.tabId, { active: true });
      if (item.windowId != null && chrome.windows) chrome.windows.update(item.windowId, { focused: true });
      return;
    }
    if (settings.newTab) {
      input.value = '';
      window.open(item.url, '_blank', 'noopener');
    } else {
      location.href = item.url;
    }
  };
  const updateQJ = async () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1 || editing) { hideQJ(); return; }
    const results = [];
    const seenUrls = new Set();

    if (chrome.tabs) {
      try {
        const tabs = await chrome.tabs.query({});
        for (const t of tabs) {
          const url = t.url || '';
          if (!/^https?:/.test(url)) continue;
          const title = cleanTitle(t.title || '');
          if (title.toLowerCase().includes(q) || url.toLowerCase().includes(q)) {
            let host = '';
            try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
            results.push({ title: title || host, host, url, tabId: t.id, windowId: t.windowId });
            seenUrls.add(host);
            if (results.length >= 3) break;
          }
        }
      } catch { /* ignore */ }
    }

    const pool = [...settings.pins, ...lastSites];
    const seenKeys = new Set();
    for (const s of pool) {
      if (seenKeys.has(s.key)) continue;
      seenKeys.add(s.key);
      const title = displayTitle(s);
      if (title.toLowerCase().includes(q) || s.key.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)) {
        let host = s.key;
        try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch {}
        if (seenUrls.has(host)) continue;
        results.push({ title, host, url: s.url, tabId: null });
        if (results.length >= 6) break;
      }
    }

    if (!results.length || document.activeElement !== input) { hideQJ(); return; }
    qjItems = results;
    qjIndex = -1;
    qj.replaceChildren();
    for (const item of results) {
      const btn = el('button', 'qj-item');
      btn.type = 'button';
      btn.append(el('span', 'qj-title', item.title), el('span', 'qj-host', item.host));
      if (item.tabId != null) btn.append(el('span', 'qj-badge', 'Tab ↗'));
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); activateQJ(item); });
      qj.append(btn);
    }
    qj.hidden = false;
  };

  input.addEventListener('input', () => {
    clearTimeout(qjTimer);
    qjTimer = setTimeout(updateQJ, 80);
  });
  input.addEventListener('keydown', (e) => {
    if (qj.hidden || !qjItems.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); qjIndex = (qjIndex + 1) % qjItems.length; highlightQJ(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); qjIndex = (qjIndex <= 0 ? qjItems.length - 1 : qjIndex - 1); highlightQJ(); }
    else if (e.key === 'Escape') { e.stopPropagation(); hideQJ(); }
    else if (e.key === 'Enter' && qjIndex >= 0) { e.preventDefault(); activateQJ(qjItems[qjIndex]); }
  });
  input.addEventListener('blur', () => setTimeout(hideQJ, 120));

  enginesNav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    for (const x of enginesNav.children) x.classList.toggle('active', x === b);
    input.focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (qjIndex >= 0 && qjItems[qjIndex]) { activateQJ(qjItems[qjIndex]); return; }
    hideQJ();
    const q = input.value.trim();
    if (!q) return;
    const cfg = getSearchCfg(id);
    const effectiveMode = cfg.searchTabs === false ? 'web' : mode;
    let targetUrl;
    if (effectiveMode === 'web' && !/\s/.test(q) && /^[^\s]+\.[a-z]{2,}(\/|:|$)/i.test(q)) {
      targetUrl = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    } else {
      const engine = ENGINES[cfg.engine] || ENGINES.google;
      targetUrl = engine[effectiveMode].replace('%s', encodeURIComponent(q));
    }
    if (settings.newTab) {
      input.value = '';
      window.open(targetUrl, '_blank', 'noopener');
    } else {
      location.href = targetUrl;
    }
  });

  engineBtn.addEventListener('click', (e) => {
    if (editing) return;
    e.stopPropagation();
    hideQJ();
    const menu = $('searchMenu');
    const wasSame = !menu.hidden && activeSearchId === id;
    if (wasSame) { closeContextMenus(); return; }
    activeSearchId = id;
    syncSearchMenu();
    const r = engineBtn.getBoundingClientRect();
    showContextMenu(menu, r.left, r.bottom + 8);
    engineBtn.setAttribute('aria-expanded', 'true');
  });
}

function setupSearch() {
  const list = $('searchEngineList');
  list.replaceChildren();
  for (const [id, info] of Object.entries(ENGINES)) {
    const btn = el('button', 'wx-opt');
    btn.type = 'button';
    btn.dataset.engine = id;
    btn.setAttribute('role', 'menuitemradio');
    const lbl = el('span', 'wx-eng-label');
    const badge = el('span', 'wx-eng-badge', info.mark);
    badge.style.background = info.color;
    lbl.append(badge, el('span', '', info.name));
    btn.append(lbl, el('span', 'wx-check', '✓'));
    btn.addEventListener('click', () => {
      patchWidget(activeSearchId, { engine: id });
      applyAllSearches();
      const box = widgetEl(activeSearchId);
      closeContextMenus();
      box?.querySelector('.search-input')?.focus();
    });
    list.append(btn);
  }

  wireSearchEl($('searchBox'), 'search');
  applyAllSearches();

  const menu = $('searchMenu');
  menu.addEventListener('click', (e) => e.stopPropagation());

  $('smTabs').addEventListener('change', () => {
    patchWidget(activeSearchId, { searchTabs: $('smTabs').checked });
    applyAllSearches();
    keepWidgetsOnScreen();
  });

  $('smTransparent').addEventListener('change', () => {
    patchWidget(activeSearchId, { searchTransparent: $('smTransparent').checked });
    applyAllSearches();
  });
}

// ---------- dock panels ----------
function applyDockState() {
  const collapsed = !!settings.dockCollapsed;
  $('dock').classList.toggle('collapsed', collapsed);
  const t = $('dockToggle');
  t.title = collapsed ? 'Show toolbar' : 'Hide toolbar';
  t.setAttribute('aria-label', t.title);
  applyWidgetPositions();
}

function setupDock() {
  const panels = ['todoPanel', 'notesPanel', 'focusPanel', 'settings'];
  const show = (id) => {
    for (const p of panels) {
      $(p).hidden = p !== id;
      document.querySelector(`[data-panel="${p}"]`).classList.toggle('active', p === id);
    }
    if (id && id !== 'settings') placeNear($(id), $('dock'));
    if (id === 'todoPanel') $('todoInput').focus();
    if (id === 'notesPanel') $('notes').focus();
  };
  applyDockState();
  $('dockToggle').addEventListener('click', () => {
    if (editing) return;
    const dock = $('dock');
    const vw = document.documentElement.clientWidth;
    if (dock.classList.contains('placed') && settings.widgetPos.dock && settings.widgetPos.dock.rx == null) {
      settings.widgetPos.dock.rx = Math.min(1, dock.getBoundingClientRect().right / vw);
      sync.set({ widgetPos: settings.widgetPos });
    }
    settings.dockCollapsed = !settings.dockCollapsed;
    if (settings.dockCollapsed) show(null);
    sync.set({ dockCollapsed: settings.dockCollapsed });
    applyDockState();
  });
  for (const b of document.querySelectorAll('.dock-btn[data-panel]')) {
    b.addEventListener('click', () => {
      if (editing) return;
      const id = b.dataset.panel;
      show($(id).hidden ? id : null);
    });
  }
  for (const x of document.querySelectorAll('[data-close]')) x.addEventListener('click', () => show(null));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(null); });
}

// ---------- to-do (free) ----------
let todos = [];

function buildTodoItem(t) {
  const li = el('li', t.done ? 'done' : '');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = t.done;
  cb.addEventListener('change', () => { t.done = cb.checked; saveTodos(); });
  const del = el('button', 'del', '×');
  del.type = 'button';
  del.title = 'Delete';
  del.addEventListener('click', () => { todos = todos.filter((x) => x !== t); saveTodos(); });
  li.append(cb, el('span', '', t.text), del);
  return li;
}

function syncTodoMenu() {
  $('tmShowDone').checked = !!settings.todoShowDone;
  $('tmShowInput').checked = !!settings.todoShowInput;
  $('tmTransparent').checked = !!settings.todoTransparent;
  const hasDone = todos.some((t) => t.done);
  $('tmClear').hidden = !hasDone;
  $('tmClearSep').hidden = !hasDone;
}

function applyTodoWidget() {
  const w = $('todoWidget');
  const scale = clamp(settings.todoScale, 0.75, 1.5, 1);
  settings.todoScale = scale;
  w.hidden = !settings.todoWidget;
  w.style.setProperty('--t-scale', String(scale));
  w.classList.toggle('transparent', !!settings.todoTransparent);
  $('todoWidgetForm').hidden = !settings.todoShowInput;
  const pinBtn = $('todoPinBtn');
  pinBtn.classList.toggle('active', !!settings.todoWidget);
  pinBtn.textContent = settings.todoWidget ? '📌 Pinned' : '📌 Pin';
  pinBtn.title = settings.todoWidget ? 'Unpin widget from page' : 'Pin to page as a permanent widget';
  syncTodoMenu();
  keepWidgetsOnScreen();
}

function renderTodos() {
  const list = $('todoList');
  list.replaceChildren();
  for (const t of todos) list.append(buildTodoItem(t));

  const wList = $('todoWidgetList');
  wList.replaceChildren();
  const visible = settings.todoShowDone ? todos : todos.filter((t) => !t.done);
  for (const t of visible) wList.append(buildTodoItem(t));
  $('twEmpty').hidden = visible.length > 0;

  const hasDone = todos.some((t) => t.done);
  $('todoClear').hidden = !hasDone;
  $('tmClear').hidden = !hasDone;
  $('tmClearSep').hidden = !hasDone;

  const open = todos.filter((t) => !t.done).length;
  $('twCount').textContent = open ? `${open} open` : todos.length ? 'All done' : '';
  document.querySelector('[data-panel="todoPanel"]').title = open ? `To-do (${open} open)` : 'To-do';
}

function saveTodos() {
  local.set({ todos });
  renderTodos();
}

async function setupTodos() {
  ({ todos = [] } = await local.get('todos'));
  applyTodoWidget();
  renderTodos();

  const addTask = (input) => {
    const text = input.value.trim();
    if (!text) return;
    todos.push({ id: Date.now(), text, done: false });
    input.value = '';
    saveTodos();
  };
  $('todoForm').addEventListener('submit', (e) => { e.preventDefault(); addTask($('todoInput')); });
  $('todoWidgetForm').addEventListener('submit', (e) => { e.preventDefault(); addTask($('todoWidgetInput')); });
  $('todoClear').addEventListener('click', () => { todos = todos.filter((t) => !t.done); saveTodos(); });

  $('todoPinBtn').addEventListener('click', () => {
    settings.todoWidget = !settings.todoWidget;
    sync.set({ todoWidget: settings.todoWidget });
    applyTodoWidget();
    applyWidgetPositions();
  });

  const menu = $('todoMenu');
  menu.addEventListener('click', (e) => e.stopPropagation());
  const openMenu = (e) => {
    if (editing) return;
    if (e.shiftKey || (e.target === $('todoWidgetInput') && $('todoWidgetInput').selectionStart !== $('todoWidgetInput').selectionEnd)) return;
    e.preventDefault();
    syncTodoMenu();
    showContextMenu(menu, e.clientX, e.clientY);
  };
  $('todoWidget').addEventListener('contextmenu', openMenu);

  const bindToggle = (id, key, onChange) => {
    $(id).addEventListener('change', () => {
      settings[key] = $(id).checked;
      sync.set({ [key]: settings[key] });
      onChange();
    });
  };
  bindToggle('tmShowDone', 'todoShowDone', () => { renderTodos(); keepWidgetsOnScreen(); });
  bindToggle('tmShowInput', 'todoShowInput', () => applyTodoWidget());
  bindToggle('tmTransparent', 'todoTransparent', () => applyTodoWidget());

  $('tmClear').addEventListener('click', () => {
    todos = todos.filter((t) => !t.done);
    saveTodos();
  });
}

// Several new tabs can be open at once. Each one takes over changes made in
// the others, so it never saves an outdated copy over them.
function setupCrossTabSync() {
  chrome.storage.onChanged.addListener((changes, area) => {
    const fresh = (k) => k in changes && !isEcho(k, changes[k]);
    if (area === 'local') {
      if (fresh('todos')) { todos = changes.todos.newValue || []; renderTodos(); }
      if (fresh('notes')) {
        const val = changes.notes.newValue || '';
        if (document.activeElement !== $('notes')) $('notes').value = val;
        if (document.activeElement !== $('notesWidgetArea')) $('notesWidgetArea').value = val;
      }
      if (fresh('layoutOrder')) { layoutOrder = changes.layoutOrder.newValue || []; render(lastSites); }
    }
    if (area === 'sync') {
      let list = false;
      for (const k of ['hidden', 'pins', 'customTitles']) {
        if (fresh(k)) { settings[k] = changes[k].newValue || (k === 'customTitles' ? {} : []); list = true; }
      }
      if (list) { render(lastSites); updateHiddenCount(); }
      if (fresh('showRecent')) { settings.showRecent = !!changes.showRecent.newValue; $('showRecent').checked = settings.showRecent; renderRecentStrip(); }
      if (fresh('iconTransparent')) { settings.iconTransparent = !!changes.iconTransparent.newValue; $('iconTransparent').checked = settings.iconTransparent; applyAppearance(); }
      if (fresh('newTab')) { settings.newTab = !!changes.newTab.newValue; $('newTab').checked = settings.newTab; render(lastSites); }
      if (fresh('bgGradient')) { settings.bgGradient = changes.bgGradient.newValue || 'forest'; $('bgGradient').value = settings.bgGradient; applyBackground(); }
      if (fresh('widgetPos') && !editing) { settings.widgetPos = changes.widgetPos.newValue || {}; applyWidgetPositions(); }
      if (fresh('extraWidgets') && !editing) {
        settings.extraWidgets = changes.extraWidgets.newValue || [];
        renderExtraWidgets();
        applyWidgetPositions();
        updateClock();
        scheduleClockTick();
        applyAllSearches();
        showWeather();
      }
      let wxChanged = false;
      for (const k of ['weatherOn', 'weatherScale', 'weatherView', 'weatherPlaces', 'weatherActive', 'weatherShowAll', 'weatherTransparent']) {
        if (fresh(k)) { settings[k] = changes[k].newValue ?? DEFAULTS[k]; wxChanged = true; }
      }
      if (wxChanged) { showWeather(); updateHiddenWidgetsUI(); }

      let clockChanged = false;
      for (const k of ['showClock', 'clock24', 'clockSeconds', 'clockDate', 'clockGreeting', 'clockScale', 'clockTz', 'clockFont', 'userName']) {
        if (fresh(k)) { settings[k] = changes[k].newValue ?? DEFAULTS[k]; clockChanged = true; }
      }
      if (clockChanged) { updateClock(); scheduleClockTick(); syncClockMenu(); updateHiddenWidgetsUI(); }

      let searchChanged = false;
      for (const k of ['showSearch', 'searchTabs', 'searchScale', 'searchTransparent', 'engine']) {
        if (fresh(k)) { settings[k] = changes[k].newValue ?? DEFAULTS[k]; searchChanged = true; }
      }
      if (searchChanged) { applyAllSearches(); updateHiddenWidgetsUI(); }

      let todoChanged = false;
      for (const k of ['todoWidget', 'todoScale', 'todoShowDone', 'todoShowInput', 'todoTransparent']) {
        if (fresh(k)) { settings[k] = changes[k].newValue ?? DEFAULTS[k]; todoChanged = true; }
      }
      if (todoChanged) { applyTodoWidget(); renderTodos(); applyWidgetPositions(); }

      let notesChanged = false;
      for (const k of ['notesWidget', 'notesScale', 'notesTransparent']) {
        if (fresh(k)) { settings[k] = changes[k].newValue ?? DEFAULTS[k]; notesChanged = true; }
      }
      if (notesChanged) { applyNotesWidget(); applyWidgetPositions(); }

      if (fresh('dockCollapsed')) { settings.dockCollapsed = !!changes.dockCollapsed.newValue; applyDockState(); }
    }
  });
}

// ---------- notes ----------
function applyNotesWidget() {
  const w = $('notesWidget');
  const scale = clamp(settings.notesScale, 0.75, 1.5, 1);
  settings.notesScale = scale;
  w.hidden = !settings.notesWidget;
  w.style.setProperty('--n-scale', String(scale));
  w.classList.toggle('transparent', !!settings.notesTransparent);
  const pinBtn = $('notesPinBtn');
  pinBtn.classList.toggle('active', !!settings.notesWidget);
  pinBtn.textContent = settings.notesWidget ? '📌 Pinned' : '📌 Pin';
  pinBtn.title = settings.notesWidget ? 'Unpin widget from page' : 'Pin to page as a permanent widget';
  $('nmTransparent').checked = !!settings.notesTransparent;
  keepWidgetsOnScreen();
}

async function setupNotes() {
  const { notes = '' } = await local.get('notes');
  $('notes').value = notes;
  $('notesWidgetArea').value = notes;
  applyNotesWidget();

  let timer;
  const onEdit = (source, mirror) => {
    mirror.value = source.value;
    clearTimeout(timer);
    $('notesSaved').textContent = '';
    $('nwSaved').textContent = '';
    timer = setTimeout(async () => {
      await local.set({ notes: source.value });
      $('notesSaved').textContent = 'Saved';
      $('nwSaved').textContent = 'Saved';
    }, 400);
  };
  $('notes').addEventListener('input', () => onEdit($('notes'), $('notesWidgetArea')));
  $('notesWidgetArea').addEventListener('input', () => onEdit($('notesWidgetArea'), $('notes')));

  $('notesPinBtn').addEventListener('click', () => {
    settings.notesWidget = !settings.notesWidget;
    sync.set({ notesWidget: settings.notesWidget });
    applyNotesWidget();
    applyWidgetPositions();
  });

  const menu = $('notesMenu');
  menu.addEventListener('click', (e) => e.stopPropagation());
  $('notesWidget').addEventListener('contextmenu', (e) => {
    if (editing) return;
    if (e.shiftKey || (e.target === $('notesWidgetArea') && $('notesWidgetArea').selectionStart !== $('notesWidgetArea').selectionEnd)) return;
    e.preventDefault();
    $('nmTransparent').checked = !!settings.notesTransparent;
    showContextMenu(menu, e.clientX, e.clientY);
  });
  $('nmTransparent').addEventListener('change', () => {
    settings.notesTransparent = $('nmTransparent').checked;
    sync.set({ notesTransparent: settings.notesTransparent });
    applyNotesWidget();
  });
}

// ---------- focus timer ----------
// State lives in storage so every open tab shows the same countdown.
let focus = null;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
  } catch { /* audio is optional */ }
}

function tickFocus() {
  const pill = $('focusPill');
  if (!focus) {
    pill.hidden = true;
    $('focusStop').hidden = true;
    document.title = 'New Tab';
    return;
  }
  const left = focus.endAt - Date.now();
  if (left <= 0) {
    const wasBreak = focus.isBreak;
    focus = null;
    chrome.storage.local.remove('focus');
    $('focusTime').textContent = '00:00';
    $('focusPhase').textContent = wasBreak ? 'Break over — ready when you are.' : 'Done! Time for a break.';
    // Only the tab in front plays the sound, not every open new tab.
    if (document.visibilityState === 'visible') chime();
    tickFocus();
    return;
  }
  const t = fmt(left);
  $('focusTime').textContent = t;
  $('focusPhase').textContent = focus.isBreak ? 'Break' : 'Focusing…';
  pill.textContent = `${focus.isBreak ? '☕' : '⏱'} ${t}`;
  pill.hidden = false;
  $('focusStop').hidden = false;
  document.title = `${t} · New Tab`;
}

async function setupFocus() {
  ({ focus = null } = await local.get('focus'));
  for (const b of document.querySelectorAll('.focus-presets button')) {
    b.addEventListener('click', () => {
      const minutes = Number(b.dataset.minutes);
      focus = { endAt: Date.now() + minutes * 60e3, isBreak: 'break' in b.dataset };
      local.set({ focus });
      tickFocus();
    });
  }
  $('focusStop').addEventListener('click', () => {
    focus = null;
    chrome.storage.local.remove('focus');
    $('focusTime').textContent = '25:00';
    $('focusPhase').textContent = 'Ready to focus';
    tickFocus();
  });
  $('focusPill').addEventListener('click', () => { if (!editing) document.querySelector('[data-panel="focusPanel"]').click(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'focus' in changes) { focus = changes.focus.newValue || null; tickFocus(); }
  });
  tickFocus();
  setInterval(tickFocus, 1000);
}

// ---------- backup ----------
async function exportBackup() {
  const data = {
    app: 'new-tab-most-visited',
    version: 1,
    exported: new Date().toISOString(),
    settings: await chrome.storage.sync.get(null),
    local: await chrome.storage.local.get(['todos', 'notes', 'bgImage', 'layoutOrder'])
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `new-tab-backup-${new Date().toLocaleDateString('sv')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $('backupStatus').textContent = 'Backup downloaded.';
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'new-tab-most-visited' || !data.settings) throw new Error('not a backup from this extension');
    const clean = {};
    for (const k of Object.keys(DEFAULTS)) if (k in data.settings) clean[k] = data.settings[k];
    await chrome.storage.sync.set(clean);
    const loc = {};
    for (const k of ['todos', 'notes', 'bgImage', 'layoutOrder']) if (data.local && k in data.local) loc[k] = data.local[k];
    await chrome.storage.local.set(loc);
    await chrome.storage.local.remove('cache');
    $('backupStatus').textContent = 'Imported. Reloading…';
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    $('backupStatus').textContent = `Import failed: ${err.message}`;
  }
}

// ---------- settings sheet ----------
function updateHiddenWidgetsUI() {
  $('restoreClock').hidden = !!settings.showClock;
  $('restoreSearch').hidden = !!settings.showSearch;
  $('restoreWeather').hidden = !!settings.weatherOn;
  $('hiddenWidgetsRow').hidden = !!(settings.showClock && settings.showSearch && settings.weatherOn);
}

function setupSettings() {
  const bind = (id, key, parse, onChange) => {
    const input = $(id);
    const isCheck = input.type === 'checkbox';
    if (isCheck) input.checked = settings[key]; else input.value = settings[key];
    const ev = input.tagName === 'SELECT' || isCheck ? 'change' : 'input';
    input.addEventListener(ev, () => {
      settings[key] = isCheck ? input.checked : parse(input.value);
      // The page follows the control at once; continuous input is saved in batches.
      if (ev === 'input') syncLater({ [key]: settings[key] }); else sync.set({ [key]: settings[key] });
      onChange?.();
    });
  };

  const outputs = () => {
    $('countOut').textContent = settings.count;
    $('sizeOut').textContent = `${settings.size} px`;
    $('dimOut').textContent = `${settings.dim}%`;
    $('blurOut').textContent = `${settings.blur} px`;
    applyAppearance();
  };

  let timer;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };

  bind('count', 'count', Number, () => { outputs(); debounced(); });
  bind('size', 'size', Number, outputs);
  bind('period', 'period', Number, refresh);
  bind('sortBy', 'sortBy', String, refresh);
  bind('groupBy', 'groupBy', String, refresh);
  bind('newTab', 'newTab', Boolean, refresh);
  bind('hideOpen', 'hideOpen', Boolean, async () => { await updateOpenKeys(); render(lastSites); });
  bind('showRecent', 'showRecent', Boolean, renderRecentStrip);
  bind('iconTransparent', 'iconTransparent', Boolean, applyAppearance);
  bind('bgMode', 'bgMode', String, applyBackground);
  bind('bgEvery', 'bgEvery', String, async () => { await chrome.storage.local.remove('dailyBg'); applyBackground(); });
  bind('bgGradient', 'bgGradient', String, applyBackground);
  bind('showCredit', 'showCredit', Boolean, () => showCredit(lastCredit.text, lastCredit.link));
  bind('dim', 'dim', Number, outputs);
  bind('blur', 'blur', Number, outputs);
  outputs();
  updateBgSettingsUI();
  updateHiddenCount();

  $('restoreClock').addEventListener('click', () => {
    settings.showClock = true;
    sync.set({ showClock: true });
    updateClock();
    scheduleClockTick();
    applyWidgetPositions();
    updateHiddenWidgetsUI();
  });
  $('restoreSearch').addEventListener('click', () => {
    settings.showSearch = true;
    sync.set({ showSearch: true });
    applyAllSearches();
    applyWidgetPositions();
    updateHiddenWidgetsUI();
  });
  $('restoreWeather').addEventListener('click', () => {
    settings.weatherOn = true;
    sync.set({ weatherOn: true });
    showWeather();
    applyWidgetPositions();
    updateHiddenWidgetsUI();
  });
  updateHiddenWidgetsUI();

  $('bgFile').addEventListener('change', () => {
    const file = $('bgFile').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await local.set({ bgImage: reader.result });
      settings.bgMode = 'custom';
      $('bgMode').value = 'custom';
      await sync.set({ bgMode: 'custom' });
      applyBackground();
    };
    reader.readAsDataURL(file);
  });

  $('resetLayout').disabled = !layoutOrder.length;
  $('resetLayout').addEventListener('click', async () => {
    layoutOrder = [];
    await chrome.storage.local.remove('layoutOrder');
    $('resetLayout').disabled = true;
    refresh();
  });

  $('unhideAll').addEventListener('click', async () => {
    settings.hidden = [];
    await sync.set({ hidden: [] });
    refresh();
  });

  $('exportBtn').addEventListener('click', exportBackup);
  $('importFile').addEventListener('change', () => {
    const f = $('importFile').files[0];
    if (f) importBackup(f);
  });

}

// ---------- free layout of page elements ----------
// Positions are stored as fractions of the viewport so a layout keeps its
// proportions on another screen size. Fixed widgets (weather, dock, timer)
// stay on screen while scrolling; the others scroll with the page.
let editing = false;
const FIXED_WIDGETS = new Set(['weather', 'dock', 'focus', 'todo', 'notes']);
const WIDE_WIDGETS = new Set(['grid']);
const isFixedWidget = (name) => FIXED_WIDGETS.has(name) || name.startsWith('weather-');
const isClockWidget = (name) => name === 'clock' || name.startsWith('clock-');
const widgetEl = (name) => document.querySelector(`[data-widget="${name}"]`);

function positionClockBoxes() {
  const vw = document.documentElement.clientWidth;
  for (const w of document.querySelectorAll('.clock-box.placed')) {
    const pos = settings.widgetPos[w.dataset.widget];
    if (!pos) continue;
    w.style.width = '';
    const cx = pos.cx ?? (pos.w ? pos.x + pos.w / 2 : null);
    if (cx != null) {
      const r = w.getBoundingClientRect();
      if (r.width) w.style.left = `${Math.max(12, Math.min(cx * vw - r.width / 2, vw - r.width - 12))}px`;
    }
  }
}

function positionDockBox() {
  const dock = $('dock');
  const pos = settings.widgetPos.dock;
  if (!dock || !pos || !dock.classList.contains('placed')) return;
  const vw = document.documentElement.clientWidth;
  const r = dock.getBoundingClientRect();
  if (!r.width) return;
  const rx = pos.rx != null ? pos.rx : (dock.classList.contains('collapsed') ? (vw - 18) / vw : null);
  if (rx != null) {
    dock.style.left = `${Math.max(12, Math.min(rx * vw - r.width, vw - r.width - 12))}px`;
  }
}

function applyWidgetPositions() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  for (const w of document.querySelectorAll('[data-widget]')) {
    const name = w.dataset.widget;
    const pos = settings.widgetPos[name];
    w.classList.toggle('placed', !!pos);
    w.style.left = pos ? `${pos.x * vw}px` : '';
    w.style.top = pos ? `${pos.y * vh}px` : '';
    w.style.width = pos && pos.w && WIDE_WIDGETS.has(name) ? `${pos.w * vw}px` : '';
  }
  positionClockBoxes();
  positionDockBox();
  keepWidgetsOnScreen();
}

// Opens a floating panel beside its anchor, kept inside the window.
function placeNear(panel, anchor) {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const a = anchor.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const m = 10;
  let left = a.left + a.width / 2 < vw / 2 ? a.left : a.right - p.width;
  left = Math.max(m, Math.min(left, vw - p.width - m));
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  if (a.top < vh / 2) {
    panel.style.top = `${Math.max(m, Math.min(a.bottom + 8, vh - p.height - m))}px`;
    panel.style.bottom = 'auto';
  } else {
    panel.style.bottom = `${Math.max(m, vh - a.top + 8)}px`;
    panel.style.top = 'auto';
  }
}

// Pin a widget where it is now, so the rest of the page does not reflow when
// one element leaves the normal layout.
function freezeWidget(w) {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const r = w.getBoundingClientRect();
  const name = w.dataset.widget;
  const fixed = isFixedWidget(name);
  const pos = { x: r.left / vw, y: (r.top + (fixed ? 0 : scrollY)) / vh };
  if (WIDE_WIDGETS.has(name)) pos.w = r.width / vw;
  if (isClockWidget(name)) pos.cx = (r.left + r.width / 2) / vw;
  if (name === 'dock') pos.rx = r.right / vw;
  return pos;
}

// Positions before editing began, and undo stack for the current edit session.
let editStart = null;
let layoutChanged = false;
let gridWidthAtStart = 0;
let editHistory = [];

const UNDELETABLE_WIDGETS = new Set(['grid', 'dock', 'focus']);
const UNRESIZABLE_WIDGETS = new Set(['dock', 'focus']);

function snapshotEditState() {
  return {
    widgetPos: structuredClone(settings.widgetPos),
    extraWidgets: structuredClone(settings.extraWidgets || []),
    showClock: !!settings.showClock,
    showSearch: !!settings.showSearch,
    weatherOn: !!settings.weatherOn,
    todoWidget: !!settings.todoWidget,
    notesWidget: !!settings.notesWidget,
    clockScale: settings.clockScale,
    searchScale: settings.searchScale,
    weatherScale: settings.weatherScale,
    todoScale: settings.todoScale,
    notesScale: settings.notesScale
  };
}

function updateUndoBtn() {
  $('editUndo').disabled = editHistory.length === 0;
}

function pushEditHistory(snap) {
  editHistory.push(snap);
  if (editHistory.length > 30) editHistory.shift();
  layoutChanged = true;
  updateUndoBtn();
}

function applyEditSnapshot(snap) {
  settings.widgetPos = structuredClone(snap.widgetPos);
  settings.extraWidgets = structuredClone(snap.extraWidgets);
  settings.showClock = snap.showClock;
  settings.showSearch = snap.showSearch;
  settings.weatherOn = snap.weatherOn;
  settings.todoWidget = snap.todoWidget;
  settings.notesWidget = snap.notesWidget;
  settings.clockScale = snap.clockScale ?? settings.clockScale;
  settings.searchScale = snap.searchScale ?? settings.searchScale;
  settings.weatherScale = snap.weatherScale ?? settings.weatherScale;
  settings.todoScale = snap.todoScale ?? settings.todoScale;
  settings.notesScale = snap.notesScale ?? settings.notesScale;
  sync.set({
    widgetPos: settings.widgetPos,
    extraWidgets: settings.extraWidgets,
    showClock: settings.showClock,
    showSearch: settings.showSearch,
    weatherOn: settings.weatherOn,
    todoWidget: settings.todoWidget,
    notesWidget: settings.notesWidget,
    clockScale: settings.clockScale,
    searchScale: settings.searchScale,
    weatherScale: settings.weatherScale,
    todoScale: settings.todoScale,
    notesScale: settings.notesScale
  });
  renderExtraWidgets();
  applyTodoWidget();
  applyNotesWidget();
  updateClock();
  scheduleClockTick();
  applyAllSearches();
  applyWeatherStyle('weather');
  for (const w of settings.extraWidgets || []) if (w.type === 'weather') applyWeatherStyle(w.id);
  showWeather();
  applyWidgetPositions();
  updateHiddenWidgetsUI();
  ensureEditControls();
}

function deleteWidgetInEditMode(name) {
  pushEditHistory(snapshotEditState());
  if (name === 'clock') {
    settings.showClock = false;
    sync.set({ showClock: false });
    updateClock();
    scheduleClockTick();
  } else if (name === 'search') {
    settings.showSearch = false;
    sync.set({ showSearch: false });
    applyAllSearches();
  } else if (name === 'weather') {
    settings.weatherOn = false;
    sync.set({ weatherOn: false });
    showWeather();
  } else if (name === 'todo') {
    settings.todoWidget = false;
    sync.set({ todoWidget: false });
    applyTodoWidget();
  } else if (name === 'notes') {
    settings.notesWidget = false;
    sync.set({ notesWidget: false });
    applyNotesWidget();
  } else {
    settings.extraWidgets = (settings.extraWidgets || []).filter((w) => w.id !== name);
    const pos = { ...settings.widgetPos };
    delete pos[name];
    settings.widgetPos = pos;
    widgetEl(name)?.remove();
    sync.set({ extraWidgets: settings.extraWidgets, widgetPos: pos });
    scheduleClockTick();
  }
  updateHiddenWidgetsUI();
  applyWidgetPositions();
}

function getWidgetScaleInfo(name) {
  if (isClockWidget(name)) return { type: 'clock', key: 'clockScale', min: 0.6, max: 1.6, val: getClockCfg(name).clockScale || 1 };
  if (name === 'search' || name.startsWith('search-')) return { type: 'search', key: 'searchScale', min: 0.75, max: 1.4, val: getSearchCfg(name).searchScale || 1 };
  if (name === 'weather' || name.startsWith('weather-')) return { type: 'weather', key: 'weatherScale', min: 0.7, max: 1.6, val: getWeatherCfg(name).weatherScale || 1 };
  if (name === 'todo') return { type: 'todo', key: 'todoScale', min: 0.75, max: 1.5, val: settings.todoScale || 1 };
  if (name === 'notes') return { type: 'notes', key: 'notesScale', min: 0.75, max: 1.5, val: settings.notesScale || 1 };
  return null;
}

function setWidgetScaleLive(name, scale, save = false) {
  const info = getWidgetScaleInfo(name);
  if (!info) return;
  const s = clamp(scale, info.min, info.max, 1);
  if (info.type === 'todo') {
    settings.todoScale = s;
    if (save) sync.set({ todoScale: s });
    applyTodoWidget();
  } else if (info.type === 'notes') {
    settings.notesScale = s;
    if (save) sync.set({ notesScale: s });
    applyNotesWidget();
  } else {
    if (save) patchWidget(name, { [info.key]: s });
    else {
      const target = name === info.type ? settings : getExtra(name);
      if (target) target[info.key] = s;
    }
    if (info.type === 'clock') { updateClock(); positionClockBoxes(); }
    if (info.type === 'search') applyAllSearches();
    if (info.type === 'weather') applyWeatherStyle(name);
  }
}

function duplicableType(name) {
  if (isClockWidget(name)) return 'clock';
  if (name === 'search' || name.startsWith('search-')) return 'search';
  if (name === 'weather' || name.startsWith('weather-')) return 'weather';
  return null;
}

function ensureEditControls() {
  for (const w of document.querySelectorAll('[data-widget]')) {
    const name = w.dataset.widget;
    if (!UNDELETABLE_WIDGETS.has(name) && !w.querySelector(':scope > .edit-del')) {
      const isCopy = !['clock', 'search', 'weather', 'todo', 'notes'].includes(name);
      const btn = el('button', 'edit-del');
      btn.type = 'button';
      btn.title = isCopy ? 'Remove copy' : 'Hide widget';
      btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteWidgetInEditMode(name);
      });
      w.append(btn);
    }
    const dupType = duplicableType(name);
    if (dupType && !w.querySelector(':scope > .edit-dup')) {
      const dbtn = el('button', 'edit-dup');
      dbtn.type = 'button';
      dbtn.title = 'Duplicate widget';
      dbtn.setAttribute('aria-label', 'Duplicate widget');
      dbtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      dbtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pushEditHistory(snapshotEditState());
        duplicateWidget(dupType, name);
      });
      w.append(dbtn);
    }
    if (!UNRESIZABLE_WIDGETS.has(name) && !w.querySelector(':scope > .edit-resize')) {
      const rbtn = el('button', 'edit-resize');
      rbtn.type = 'button';
      const isGrid = name === 'grid';
      rbtn.title = isGrid ? 'Drag to change grid width' : 'Drag to resize (double-click to reset 100%)';
      rbtn.setAttribute('aria-label', rbtn.title);
      rbtn.innerHTML = isGrid
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/><line x1="3" y1="12" x2="21" y2="12"/></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="3" y2="21"/></svg>';
      if (!isGrid) {
        rbtn.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          pushEditHistory(snapshotEditState());
          setWidgetScaleLive(name, 1, true);
          applyWidgetPositions();
        });
      }
      w.append(rbtn);
    }
  }
}

function setEditing(on) {
  if (on === editing) return;
  editing = on;
  document.body.classList.toggle('editing', on);
  $('editBar').hidden = !on;
  $('editLayoutBtn').classList.toggle('active', on);
  if (on) {
    for (const id of ['todoPanel', 'notesPanel', 'focusPanel', 'settings', 'forecast', ...CONTEXT_MENUS]) $(id).hidden = true;
    for (const b of document.querySelectorAll('.dock-btn[data-panel]')) b.classList.remove('active');
    for (const elA of document.querySelectorAll('.weather, .engine-btn')) elA.setAttribute('aria-expanded', 'false');
    for (const qj of document.querySelectorAll('.quick-jump')) qj.hidden = true;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    editStart = structuredClone(settings.widgetPos);
    editHistory = [];
    updateUndoBtn();
    layoutChanged = false;
    gridWidthAtStart = widgetEl('grid').getBoundingClientRect().width;
    const all = { ...settings.widgetPos };
    for (const w of document.querySelectorAll('[data-widget]')) {
      const name = w.dataset.widget;
      if (w.hidden || getComputedStyle(w).display === 'none') continue;
      // Sync any widget that was visually nudged to avoid overlap so moving
      // another element cannot make it jump back to a stale coordinate.
      all[name] = { ...(all[name] || {}), ...freezeWidget(w) };
    }
    settings.widgetPos = all;
    applyWidgetPositions();
    ensureEditControls();
  } else {
    // Read back the grid width in case it was resized.
    const vw = document.documentElement.clientWidth;
    const gridWidth = widgetEl('grid').getBoundingClientRect().width;
    if (Math.abs(gridWidth - gridWidthAtStart) > 2) layoutChanged = true;
    if (layoutChanged) {
      // Once one widget leaves the flow the others keep their frozen places,
      // otherwise they would jump to fill the gap.
      if (settings.widgetPos.grid) settings.widgetPos.grid.w = gridWidth / vw;
    } else {
      settings.widgetPos = editStart || {};
    }
    applyWidgetPositions();
    if (JSON.stringify(settings.widgetPos) !== JSON.stringify(editStart)) sync.set({ widgetPos: settings.widgetPos });
    editStart = null;
    editHistory = [];
    updateUndoBtn();
  }
}

function visibleOtherWidgets(excludeEl) {
  return [...document.querySelectorAll('[data-widget]')].filter((el) =>
    el !== excludeEl && !el.hidden && getComputedStyle(el).display !== 'none'
  );
}

function rectsOverlap(a, b, gap) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

const SNAP_GAP = 16;
const COLLIDE_GAP = 10;
const FLOW_GAP = 10;

// A widget placed near the right or bottom edge can end up outside a smaller
// window; it is moved back inside without changing the saved position.
function keepWidgetsOnScreen() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const pad = 12;
  for (const w of document.querySelectorAll('[data-widget].placed')) {
    const r = w.getBoundingClientRect();
    if (r.width && r.right > vw - pad) w.style.left = `${Math.max(pad, vw - r.width - pad)}px`;
    if (isFixedWidget(w.dataset.widget) && r.height && r.bottom > vh - pad) w.style.top = `${Math.max(pad, vh - r.height - pad)}px`;
  }
  // Never shift widgets behind the user's back during edit mode.
  if (editing) return;
  // Outside edit mode, keep non-free vertically stacked page widgets from
  // overlapping if one grows taller (e.g. enabling date, greeting, or scaling).
  const flow = [...document.querySelectorAll('[data-widget].placed')]
    .filter((w) => !isFixedWidget(w.dataset.widget) && !w.hidden && getComputedStyle(w).display !== 'none')
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  for (let i = 0; i < flow.length; i++) {
    const upper = flow[i].getBoundingClientRect();
    const uFree = settings.widgetPos[flow[i].dataset.widget]?.free;
    for (let j = i + 1; j < flow.length; j++) {
      if (uFree || settings.widgetPos[flow[j].dataset.widget]?.free) continue;
      const lower = flow[j].getBoundingClientRect();
      if (upper.right > lower.left + 4 && upper.left < lower.right - 4 && upper.bottom + FLOW_GAP > lower.top) {
        flow[j].style.top = `${upper.bottom + scrollY + FLOW_GAP}px`;
      }
    }
  }
}

function resolveDropCollision(w, fixed, startX, startY) {
  const name = w.dataset.widget;
  // Floating chrome controls (dock toolbar, focus pill) can be placed freely anywhere,
  // including corners over a tall icon grid.
  if (name === 'dock' || name === 'focus') return;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const pad = 12;
  const others = visibleOtherWidgets(w)
    .filter((o) => o.dataset.widget !== 'dock' && o.dataset.widget !== 'focus')
    .map((o) => o.getBoundingClientRect());
  const collidesAny = (rect) => others.some((o) => rectsOverlap(rect, o, COLLIDE_GAP));

  for (let pass = 0; pass < 3; pass++) {
    const r = w.getBoundingClientRect();
    const hit = others.find((o) => rectsOverlap(r, o, COLLIDE_GAP));
    if (!hit) return;
    const candidates = [
      { dx: 0, dy: hit.top - SNAP_GAP - r.bottom },
      { dx: 0, dy: hit.bottom + SNAP_GAP - r.top },
      { dx: hit.left - SNAP_GAP - r.right, dy: 0 },
      { dx: hit.right + SNAP_GAP - r.left, dy: 0 }
    ].filter(({ dx, dy }) => {
      if (Math.abs(dx) + Math.abs(dy) > 160) return false;
      const nl = r.left + dx;
      const nt = r.top + dy;
      if (nl < pad || nl + r.width > vw - pad) return false;
      if (fixed && (nt < pad || nt + r.height > vh - pad)) return false;
      if (!fixed && nt + scrollY < pad) return false;
      return true;
    }).map((c) => {
      const rect = { left: r.left + c.dx, top: r.top + c.dy, right: r.right + c.dx, bottom: r.bottom + c.dy };
      return { ...c, clear: !collidesAny(rect), dist: Math.abs(c.dx) + Math.abs(c.dy) };
    }).sort((a, b) => (a.clear === b.clear ? a.dist - b.dist : a.clear ? -1 : 1));
    if (!candidates.length) break;
    const best = candidates[0];
    w.style.left = `${r.left + best.dx}px`;
    w.style.top = `${r.top + best.dy + (fixed ? 0 : scrollY)}px`;
  }

  // If still colliding without Alt (e.g. dropped deep inside the icon grid),
  // return cleanly to its pre-drag position instead of overlapping or jumping away.
  if (collidesAny(w.getBoundingClientRect())) {
    w.style.left = `${startX}px`;
    w.style.top = `${startY + (fixed ? 0 : scrollY)}px`;
  }
}

function setupLayoutEditing() {
  applyWidgetPositions();
  $('editLayoutBtn').addEventListener('click', () => setEditing(!editing));
  $('editDone').addEventListener('click', () => setEditing(false));
  const doUndo = () => {
    if (!editing || !editHistory.length) return;
    const prev = editHistory.pop();
    updateUndoBtn();
    applyEditSnapshot(prev);
  };
  $('editUndo').addEventListener('click', doUndo);
  $('resetPositions').addEventListener('click', async () => {
    pushEditHistory(snapshotEditState());
    const freshPos = {};
    (settings.extraWidgets || []).forEach((w, i) => {
      const y = Math.min(0.18 + i * 0.14, 0.78);
      freshPos[w.id] = w.type === 'clock' ? { x: 0.65, y, cx: 0.75 } : { x: 0.04, y };
    });
    settings.widgetPos = freshPos;
    layoutChanged = true;
    await sync.set({ widgetPos: freshPos });
    applyWidgetPositions();
    // Re-freeze visible widgets at their reset positions while staying in edit mode so Undo works cleanly.
    const frozen = { ...settings.widgetPos };
    for (const w of document.querySelectorAll('[data-widget]')) {
      const name = w.dataset.widget;
      if (frozen[name] || w.hidden || getComputedStyle(w).display === 'none') continue;
      frozen[name] = freezeWidget(w);
    }
    settings.widgetPos = frozen;
    applyWidgetPositions();
  });
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!editing) applyWidgetPositions(); }, 150);
  });
  let altDown = false;
  document.addEventListener('keydown', (e) => {
    if (!editing) return;
    if (e.key === 'Alt' || e.altKey) { altDown = true; e.preventDefault(); }
    if (e.key === 'Escape') setEditing(false);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' || !e.altKey) altDown = false;
  });
  addEventListener('blur', () => { altDown = false; });

  // While editing, clicks must not open sites or panels (except edit controls).
  document.addEventListener('click', (e) => {
    if (editing && e.target.closest('[data-widget]') && !e.target.closest('.edit-del, .edit-dup, .edit-resize')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('dragstart', (e) => { if (editing) e.preventDefault(); }, true);

  let drag = null;
  let resizeDrag = null;
  const guideV = el('div', 'snap-guide');
  const guideH = el('div', 'snap-guide-h');
  const sizeBadge = el('div', 'size-badge');
  const clearEditHighlights = () => {
    for (const x of document.querySelectorAll('[data-widget].colliding, [data-widget].aligned')) {
      x.classList.remove('colliding', 'aligned');
    }
  };
  const showGuideV = (x) => {
    if (x != null) { guideV.style.left = `${x}px`; if (!guideV.isConnected) document.body.append(guideV); }
    else guideV.remove();
  };
  const showGuideH = (y) => {
    if (y != null) { guideH.style.top = `${y}px`; if (!guideH.isConnected) document.body.append(guideH); }
    else guideH.remove();
  };
  const showSizeBadge = (text, x, y) => {
    sizeBadge.textContent = text;
    if (!sizeBadge.isConnected) document.body.append(sizeBadge);
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const r = sizeBadge.getBoundingClientRect();
    sizeBadge.style.left = `${Math.max(8, Math.min(x + 14, vw - r.width - 8))}px`;
    sizeBadge.style.top = `${Math.max(8, Math.min(y + 14, vh - r.height - 8))}px`;
  };

  document.addEventListener('pointerdown', (e) => {
    if (!editing || e.button !== 0) return;
    if (e.target.closest('#editBar, .edit-del, .edit-dup')) return;
    const resizeBtn = e.target.closest('.edit-resize');
    if (resizeBtn) {
      const w = resizeBtn.closest('[data-widget]');
      if (!w) return;
      e.preventDefault();
      e.stopPropagation();
      resizeBtn.setPointerCapture(e.pointerId);
      const r = w.getBoundingClientRect();
      const name = w.dataset.widget;
      const info = getWidgetScaleInfo(name);
      const others = visibleOtherWidgets(w).map((elOther) => {
        const oInfo = getWidgetScaleInfo(elOther.dataset.widget);
        return { el: elOther, r: elOther.getBoundingClientRect(), type: oInfo?.type || elOther.dataset.widget, scale: oInfo?.val ?? null };
      });
      resizeDrag = {
        w, name, btn: resizeBtn,
        type: info?.type || name,
        startX: e.clientX, startY: e.clientY,
        startW: r.width, startLeft: r.left,
        startScale: info ? info.val : 1,
        curScale: info ? info.val : 1,
        others, snap: snapshotEditState()
      };
      return;
    }
    // When widgets overlap, always pick the smallest widget under the pointer
    // so a large panel (like the icon grid) can never trap a smaller one.
    const hits = [...document.querySelectorAll('[data-widget]')]
      .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none')
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
      .sort((a, b) => (a.r.width * a.r.height) - (b.r.width * b.r.height));
    const pick = hits[0];
    if (!pick) return;
    const { el: w, r } = pick;
    e.preventDefault();
    w.setPointerCapture(e.pointerId);
    w.classList.add('moving');
    const others = visibleOtherWidgets(w).map((elOther) => ({ el: elOther, r: elOther.getBoundingClientRect() }));
    drag = {
      w, dx: e.clientX - r.left, dy: e.clientY - r.top,
      startX: r.left, startY: r.top,
      fixed: isFixedWidget(w.dataset.widget),
      others, snap: snapshotEditState()
    };
  });

  document.addEventListener('pointermove', (e) => {
    const noSnap = !!(e.altKey || altDown);
    if (resizeDrag) {
      const vw = document.documentElement.clientWidth;
      clearEditHighlights();
      let lineX = null;
      let lineY = null;
      if (resizeDrag.name === 'grid') {
        let newW = Math.max(180, Math.min(vw - resizeDrag.startLeft - 12, resizeDrag.startW + (e.clientX - resizeDrag.startX)));
        if (!noSnap) {
          const right = resizeDrag.startLeft + newW;
          const thresh = 10;
          let best = thresh + 1;
          let matchedEl = null;
          const tryRight = (targetRight, gx, elMatch) => {
            const d = Math.abs(right - targetRight);
            if (d < best) { best = d; newW = Math.max(180, targetRight - resizeDrag.startLeft); lineX = gx; matchedEl = elMatch; }
          };
          // Symmetric width relative to window center
          tryRight(vw - resizeDrag.startLeft, vw - resizeDrag.startLeft, null);
          for (const o of resizeDrag.others) {
            tryRight(o.r.right, o.r.right, o.el);
            tryRight(o.r.left - 18, o.r.left - 9, o.el);
          }
          if (matchedEl) { matchedEl.classList.add('aligned'); resizeDrag.w.classList.add('aligned'); }
        }
        resizeDrag.w.style.width = `${newW}px`;
        showGuideV(lineX);
        showGuideH(null);
        showSizeBadge(`${Math.round(newW)} px`, e.clientX, e.clientY);
      } else {
        const delta = ((e.clientX - resizeDrag.startX) + (e.clientY - resizeDrag.startY)) * 0.5;
        const info = getWidgetScaleInfo(resizeDrag.name);
        if (info) {
          let nextScale = clamp(resizeDrag.startScale + delta / 180, info.min, info.max, 1);
          const matchedEls = new Set();
          if (!noSnap) {
            // Snap to 100% or to the exact scale of another widget of the same type
            let bestDs = 0.045;
            let snappedScale = null;
            if (Math.abs(nextScale - 1) < bestDs) { bestDs = Math.abs(nextScale - 1); snappedScale = 1; }
            for (const o of resizeDrag.others) {
              if (o.type === resizeDrag.type && o.scale != null) {
                const ds = Math.abs(nextScale - o.scale);
                if (ds < bestDs) { bestDs = ds; snappedScale = o.scale; }
              }
            }
            if (snappedScale != null) nextScale = snappedScale;
          }
          resizeDrag.curScale = nextScale;
          setWidgetScaleLive(resizeDrag.name, nextScale, false);

          if (!noSnap) {
            // Highlight matching corners/edges (right, left, bottom) and same-scale peers
            const cur = resizeDrag.w.getBoundingClientRect();
            const edgeThresh = 8;
            for (const o of resizeDrag.others) {
              let hit = false;
              if (o.type === resizeDrag.type && o.scale != null && Math.abs(o.scale - nextScale) < 0.015) {
                hit = true;
              }
              if (Math.abs(cur.right - o.r.right) <= edgeThresh) { lineX = o.r.right; hit = true; }
              else if (Math.abs(cur.left - o.r.left) <= edgeThresh && isClockWidget(resizeDrag.name)) { lineX = o.r.left; hit = true; }
              if (Math.abs(cur.bottom - o.r.bottom) <= edgeThresh) { lineY = o.r.bottom; hit = true; }
              if (hit) matchedEls.add(o.el);
            }
            if (matchedEls.size) {
              resizeDrag.w.classList.add('aligned');
              for (const m of matchedEls) m.classList.add('aligned');
            }
          }
          showGuideV(lineX);
          showGuideH(lineY);
          showSizeBadge(`${Math.round(nextScale * 100)}%`, e.clientX, e.clientY);
        }
      }
      return;
    }
    if (!drag) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const pad = 12;
    const minTop = drag.fixed ? pad : pad - scrollY;
    const r = drag.w.getBoundingClientRect();
    let left = Math.max(pad, Math.min(e.clientX - drag.dx, vw - r.width - pad));
    let top = Math.max(minTop, Math.min(e.clientY - drag.dy, vh - Math.min(r.height, vh - pad) - pad));

    let snapXLine = null;
    let snapYLine = null;
    if (!noSnap) {
      const thresh = 10;
      const gap = SNAP_GAP;
      let bestDx = thresh + 1;
      let bestDy = thresh + 1;

      const tryX = (targetLeft, lineX) => {
        const d = Math.abs(left - targetLeft);
        if (d < bestDx) { bestDx = d; left = targetLeft; snapXLine = lineX; }
      };
      const tryY = (targetTop, lineY) => {
        const d = Math.abs(top - targetTop);
        if (d < bestDy) { bestDy = d; top = targetTop; snapYLine = lineY; }
      };

      // Window center lines
      tryX(vw / 2 - r.width / 2, vw / 2);
      tryY(vh / 2 - r.height / 2, vh / 2);

      // Align edges, centers, or clean gap against every other visible widget
      for (const { r: o } of drag.others) {
        tryX(o.left, o.left);
        tryX(o.right - r.width, o.right);
        tryX(o.left + o.width / 2 - r.width / 2, o.left + o.width / 2);
        tryX(o.right + gap, o.right + gap / 2);
        tryX(o.left - gap - r.width, o.left - gap / 2);

        tryY(o.top, o.top);
        tryY(o.bottom - r.height, o.bottom);
        tryY(o.top + o.height / 2 - r.height / 2, o.top + o.height / 2);
        tryY(o.bottom + gap, o.bottom + gap / 2);
        tryY(o.top - gap - r.height, o.top - gap / 2);
      }
      left = Math.max(pad, Math.min(left, vw - r.width - pad));
      top = Math.max(minTop, Math.min(top, vh - Math.min(r.height, vh - pad) - pad));
    }

    showGuideV(snapXLine);
    showGuideH(snapYLine);

    drag.w.style.left = `${left}px`;
    drag.w.style.top = `${top + (drag.fixed ? 0 : scrollY)}px`;

    // Live collision feedback (skip floating toolbar/focus pill and Alt free-place)
    clearEditHighlights();
    const name = drag.w.dataset.widget;
    if (!noSnap && name !== 'dock' && name !== 'focus') {
      const cur = { left, top, right: left + r.width, bottom: top + r.height };
      let hitAny = false;
      for (const o of drag.others) {
        if (o.el.dataset.widget === 'dock' || o.el.dataset.widget === 'focus') continue;
        if (rectsOverlap(cur, o.r, COLLIDE_GAP)) { o.el.classList.add('colliding'); hitAny = true; }
      }
      if (hitAny) drag.w.classList.add('colliding');
    }
  });

  const end = (e) => {
    const noSnap = !!(e?.altKey || altDown);
    if (resizeDrag) {
      const rd = resizeDrag;
      resizeDrag = null;
      showGuideV(null);
      showGuideH(null);
      sizeBadge.remove();
      clearEditHighlights();
      if (rd.name === 'grid') {
        const curW = rd.w.getBoundingClientRect().width;
        if (Math.abs(curW - rd.startW) > 2) {
          pushEditHistory(rd.snap);
          const vw = document.documentElement.clientWidth;
          if (settings.widgetPos.grid) settings.widgetPos.grid.w = curW / vw;
          sync.set({ widgetPos: settings.widgetPos });
        }
      } else if (Math.abs(rd.curScale - rd.startScale) >= 0.01) {
        pushEditHistory(rd.snap);
        setWidgetScaleLive(rd.name, rd.curScale, true);
        applyWidgetPositions();
      }
      return;
    }
    if (!drag) return;
    const { w, fixed, startX, startY, snap } = drag;
    drag = null;
    showGuideV(null);
    showGuideH(null);
    clearEditHighlights();
    w.classList.remove('moving');
    if (!noSnap) resolveDropCollision(w, fixed, startX, startY);
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const r = w.getBoundingClientRect();
    if (Math.abs(r.left - startX) < 2 && Math.abs(r.top - startY) < 2) return;
    pushEditHistory(snap);
    const name = w.dataset.widget;
    const prev = settings.widgetPos[name] || {};
    const nextPos = { ...prev, x: r.left / vw, y: (r.top + (fixed ? 0 : scrollY)) / vh };
    if (noSnap) nextPos.free = true; else delete nextPos.free;
    if (isClockWidget(name)) { delete nextPos.w; nextPos.cx = (r.left + r.width / 2) / vw; }
    if (name === 'dock') nextPos.rx = r.right / vw;
    settings.widgetPos[name] = nextPos;
    applyWidgetPositions();
    sync.set({ widgetPos: settings.widgetPos });
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

// ---------- start ----------
(async () => {
  settings = { ...DEFAULTS, ...(await sync.get()) };
  applyAppearance();

  // Show the previous list immediately, then recompute from history.
  const { cache, layoutOrder: savedOrder = [] } = await local.get(['cache', 'layoutOrder']);
  layoutOrder = savedOrder;
  // A list computed in the last few minutes is reused as is; ranking by visit
  // age reads individual visits, which is too much work for every new tab.
  await updateOpenKeys().catch(() => {});
  const cacheValid = cache && cache.sig === signature();
  const cacheFresh = cacheValid && Date.now() - (cache.time || 0) < 10 * 60e3;
  if (cacheValid) render(cache.sites);

  renderExtraWidgets();
  setupClock();
  setupSearch();
  setupSettings();
  setupDock();
  setupDragAndDrop();
  setupGridMenu();
  setupOpenTabs();
  setupLayoutEditing();
  setupForecastPanel();
  setupWeatherMenu();
  applyBackground();
  showWeather();
  if (cacheFresh) updateHiddenCount(); else refresh();
  setupTodos();
  setupNotes();
  setupFocus();
  setupCrossTabSync();
})();
