'use strict';

// Synced settings (chrome.storage.sync follows the user's Chrome profile).
const DEFAULTS = {
  count: 40,          // number of most-visited tiles (8–120)
  size: 48,           // icon diameter in px
  period: 0,          // days of history; 0 = all
  groupBy: 'host',    // 'host' | 'url'
  newTab: false,
  hidden: [],         // keys of hidden sites
  pins: [],           // [{ key, url, title }] shown first
  showClock: true,
  clock24: true,
  userName: '',
  engine: 'google',   // 'google' | 'bing' | 'ddg'
  weatherOn: true,
  city: '',           // empty = use device location
  bgMode: 'nature',   // 'nature' | 'custom' | 'none'
  bgEvery: 'day',     // 'day' | 'hour' | 'tab'
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
const sync = {
  get: () => chrome.storage.sync.get(DEFAULTS),
  set: (v) => chrome.storage.sync.set(v)
};
const local = {
  get: (k) => chrome.storage.local.get(k),
  set: (v) => chrome.storage.local.set(v)
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function applyAppearance() {
  const root = document.documentElement.style;
  root.setProperty('--accent', settings.accent);
  root.setProperty('--dim', String(settings.dim / 100));
  root.setProperty('--blur', `${settings.blur}px`);
  root.setProperty('--icon', `${settings.size}px`);
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

async function computeSites(limit) {
  const startTime = settings.period ? Date.now() - settings.period * DAY : 0;
  const items = await chrome.history.search({ text: '', startTime, maxResults: 50000 });
  const map = new Map();

  for (const it of items) {
    let u;
    try { u = new URL(it.url); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;

    const key = keyFor(u);
    const score = (it.visitCount || 0) + (it.typedCount || 0);
    let s = map.get(key);
    if (!s) {
      s = { key, score: 0, url: '', title: '', best: -1, rootTitle: '' };
      map.set(key, s);
    }
    s.score += score;
    if (score > s.best) { s.best = score; s.url = it.url; s.title = it.title || ''; }
    if (u.pathname === '/' && !u.search && it.title) s.rootTitle = it.title;
  }

  const skip = new Set([...settings.hidden, ...settings.pins.map((p) => p.key)]);
  return [...map.values()]
    .filter((s) => !skip.has(s.key) && s.score > 0)
    .sort((a, b) => b.score - a.score)
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
// Chrome's own favicon cache only knows sites opened in Chrome, so history
// imported from Firefox shows a grey globe. Use icon services that answer with
// an error status when they have no icon, which lets the letter fallback show.
function faviconUrls(pageUrl) {
  const host = new URL(pageUrl).hostname;
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`
  ];
}

// The services return a generic globe with a 404 status for unknown sites, and
// <img> would still display it; checking the status first keeps the letter.
async function loadIcon(pageUrl) {
  for (const url of faviconUrls(pageUrl)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const blob = await r.blob();
      if (!blob.type.startsWith('image/') || blob.size < 100) continue;
      return URL.createObjectURL(blob);
    } catch { /* try the next service */ }
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

function tile(s, isPinned) {
  const a = el('a', isPinned ? 'tile pinned' : 'tile');
  a.href = s.url;
  a.dataset.key = s.key;
  a.title = `${s.title}\n${s.url}`;
  if (settings.newTab) { a.target = '_blank'; a.rel = 'noopener'; }

  const icon = el('span', 'icon');
  icon.style.background = colorFor(s.key);
  const letter = el('span', 'letter', (s.title || s.key).trim().charAt(0).toUpperCase());
  const img = el('img');
  img.alt = '';
  img.onload = () => { icon.style.background = '#fff'; letter.remove(); };
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

  a.append(icon, el('span', 'label', s.title), pin, hide);
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

function render(sites) {
  const grid = $('grid');
  grid.replaceChildren();
  const items = [
    ...settings.pins.map((s) => ({ s, pinned: true })),
    ...sites.map((s) => ({ s, pinned: false }))
  ];
  for (const it of arrange(items)) grid.append(tile(it.s, it.pinned));
  $('empty').hidden = items.length > 0;
}

// ---------- drag and drop layout ----------
function setupDragAndDrop() {
  const grid = $('grid');
  let dragged = null;
  let moved = false;

  grid.addEventListener('dragstart', (e) => {
    const t = e.target.closest('.tile');
    if (!t || editing) return;
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
    if (!t || t === dragged) return;
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
    layoutOrder = [...grid.children].map((c) => c.dataset.key);
    local.set({ layoutOrder });
    $('resetLayout').disabled = false;
  });
}

// Settings that change the list; a cached list is valid only for the same values.
function signature() {
  return JSON.stringify([settings.count, settings.period, settings.groupBy, settings.hidden, settings.pins]);
}

async function refresh() {
  try {
    const sites = await computeSites(settings.count);
    render(sites);
    local.set({ cache: { sites, sig: signature() } });
  } catch (err) {
    console.error('History load failed', err);
  }
  $('hiddenCount').textContent = settings.hidden.length;
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

function showCredit(text, link) {
  const c = $('credit');
  c.hidden = !text;
  c.textContent = text;
  if (link) c.href = link; else c.removeAttribute('href');
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

async function applyBackground() {
  const bg = $('bg');
  bg.style.backgroundImage = '';
  bg.classList.remove('image');
  showCredit('');

  const mode = settings.bgMode;
  if (mode === 'custom') {
    const { bgImage } = await local.get('bgImage');
    if (bgImage) {
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
      bg.style.backgroundImage = `url("${pick.url}")`;
      bg.classList.add('image');
      showCredit(pick.credit, pick.link);
    };
    img.src = pick.url;
  } catch (err) {
    console.warn('Background unavailable, keeping gradient', err);
  }
}

// ---------- clock & greeting ----------
function updateClock() {
  const box = $('clockBox');
  box.hidden = !settings.showClock;
  if (!settings.showClock) return;
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  let text;
  if (settings.clock24) text = `${String(h).padStart(2, '0')}:${m}`;
  else { const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; text = `${h}:${m} ${ap}`; }
  $('clock').textContent = text;

  const hour = now.getHours();
  const part = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Good night';
  const name = settings.userName.trim();
  $('greeting').textContent = name ? `${part}, ${name}.` : `${part}.`;
}

function setupClock() {
  updateClock();
  // Align to the next minute, then tick each minute.
  setTimeout(() => { updateClock(); setInterval(updateClock, 60e3); }, 60e3 - (Date.now() % 60e3) + 50);
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

function devicePosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { timeout: 10000, maximumAge: 3600e3 }
    );
  });
}

async function weatherPlace() {
  const { place } = await local.get('place');
  const want = settings.city.trim().toLowerCase();
  // Reuse the resolved place for the same city, or for device location for 6 h.
  if (place && place.city === want && (want || Date.now() - place.time < 6 * 3600e3)) return place;

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
  return resolved;
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

function rainText(p) {
  return p >= 20 ? `💧${p}%` : '';
}

function renderForecast(wx, place) {
  $('fPlace').textContent = place.name || 'Forecast';

  // Next 24 hours starting with the current hour (times are local to the place).
  const hourly = $('hourly');
  hourly.replaceChildren();
  const nowHour = wx.current.time.slice(0, 13); // "YYYY-MM-DDTHH"
  let start = wx.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour);
  if (start < 0) start = 0;
  for (let i = start; i < Math.min(start + 24, wx.hourly.time.length); i++) {
    const d = describe(wx.hourly.weather_code[i], wx.hourly.is_day[i] === 1);
    const h = el('div', i === start ? 'hour now' : 'hour');
    h.title = d.text;
    h.append(
      el('span', '', i === start ? 'Now' : `${wx.hourly.time[i].slice(11, 13)}:00`),
      el('span', 'ic', d.icon),
      el('span', 't', `${Math.round(wx.hourly.temperature_2m[i])}°`),
      el('span', 'rain', rainText(wx.hourly.precipitation_probability[i] ?? 0))
    );
    hourly.append(h);
  }

  // Today plus seven days, each day's range drawn on the week's scale.
  const daily = $('daily');
  daily.replaceChildren();
  const lo = Math.min(...wx.daily.temperature_2m_min);
  const hi = Math.max(...wx.daily.temperature_2m_max);
  const span = Math.max(hi - lo, 1);
  wx.daily.time.forEach((date, i) => {
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

function setupForecastPanel() {
  const btn = $('weather');
  const panel = $('forecast');
  const toggle = (open) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) placeNear(panel, btn);
  };
  btn.addEventListener('click', () => { if (!editing) toggle(panel.hidden); });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) toggle(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
}

async function showWeather() {
  const w = $('weather');
  if (!settings.weatherOn) { w.hidden = true; $('forecast').hidden = true; return; }

  radarLink().then((href) => { $('radar').href = href; }).catch(() => {});

  let place;
  try {
    place = await weatherPlace();
  } catch (err) {
    console.warn('Weather location unavailable', err);
    w.hidden = false;
    $('wIcon').textContent = '📍';
    $('wTemp').textContent = '—';
    $('wPlace').textContent = settings.city ? 'City not found' : 'Set a city in Settings';
    $('cityStatus').textContent = settings.city
      ? 'City not found.'
      : 'Could not get your location (it may be turned off in Windows). Enter a city.';
    return;
  }
  $('cityStatus').textContent = place.name ? `Location: ${place.name}` : '';

  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  let { wx } = await local.get('wx');
  if (!wx || wx.key !== key || !wx.hourly || Date.now() - wx.time > 30 * 60e3) {
    try {
      const q = new URLSearchParams({
        latitude: place.lat, longitude: place.lon, timezone: 'auto', forecast_days: '8',
        current: 'temperature_2m,weather_code,is_day',
        hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      });
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      wx = { key, time: Date.now(), current: data.current, hourly: data.hourly, daily: data.daily };
      local.set({ wx });
    } catch (err) {
      console.warn('Weather unavailable', err);
      if (!wx || wx.key !== key || !wx.hourly) return;
    }
  }
  const d = describe(wx.current.weather_code, wx.current.is_day === 1);
  $('wIcon').textContent = d.icon;
  $('wTemp').textContent = `${Math.round(wx.current.temperature_2m)}°C`;
  $('wPlace').textContent = place.name || d.text;
  w.title = `${d.text}${place.name ? ` – ${place.name}` : ''}\nClick for the forecast`;
  w.hidden = false;
  renderForecast(wx, place);
}

// ---------- search ----------
const ENGINES = {
  google: {
    name: 'Google', mark: 'G',
    web: 'https://www.google.com/search?q=%s',
    images: 'https://www.google.com/search?tbm=isch&q=%s',
    news: 'https://www.google.com/search?tbm=nws&q=%s',
    video: 'https://www.google.com/search?tbm=vid&q=%s',
    maps: 'https://www.google.com/maps/search/%s'
  },
  bing: {
    name: 'Bing', mark: 'B',
    web: 'https://www.bing.com/search?q=%s',
    images: 'https://www.bing.com/images/search?q=%s',
    news: 'https://www.bing.com/news/search?q=%s',
    video: 'https://www.bing.com/videos/search?q=%s',
    maps: 'https://www.bing.com/maps?q=%s'
  },
  ddg: {
    name: 'DuckDuckGo', mark: 'D',
    web: 'https://duckduckgo.com/?q=%s',
    images: 'https://duckduckgo.com/?q=%s&ia=images&iax=images',
    news: 'https://duckduckgo.com/?q=%s&ia=news&iar=news',
    video: 'https://duckduckgo.com/?q=%s&ia=videos&iax=videos',
    maps: 'https://duckduckgo.com/?q=%s&ia=maps&iaxm=maps'
  }
};

function applyEngine() {
  const e = ENGINES[settings.engine] || ENGINES.google;
  $('engineMark').textContent = e.mark;
  $('q').placeholder = `Search ${e.name} or type a URL`;
}

function setupSearch() {
  let mode = 'web';
  applyEngine();
  $('engines').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    for (const x of $('engines').children) x.classList.toggle('active', x === b);
    $('q').focus();
  });

  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    // A single token with a dot and no spaces is treated as an address.
    if (mode === 'web' && !/\s/.test(q) && /^[^\s]+\.[a-z]{2,}(\/|:|$)/i.test(q)) {
      location.href = /^https?:\/\//i.test(q) ? q : `https://${q}`;
      return;
    }
    const engine = ENGINES[settings.engine] || ENGINES.google;
    location.href = engine[mode].replace('%s', encodeURIComponent(q));
  });
}

// ---------- dock panels ----------
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

function renderTodos() {
  const list = $('todoList');
  list.replaceChildren();
  for (const t of todos) {
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
    list.append(li);
  }
  $('todoClear').hidden = !todos.some((t) => t.done);
  const open = todos.filter((t) => !t.done).length;
  document.querySelector('[data-panel="todoPanel"]').title = open ? `To-do (${open} open)` : 'To-do';
}

function saveTodos() {
  local.set({ todos });
  renderTodos();
}

async function setupTodos() {
  ({ todos = [] } = await local.get('todos'));
  renderTodos();
  $('todoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('todoInput').value.trim();
    if (!text) return;
    todos.push({ id: Date.now(), text, done: false });
    $('todoInput').value = '';
    saveTodos();
  });
  $('todoClear').addEventListener('click', () => { todos = todos.filter((t) => !t.done); saveTodos(); });
}

// ---------- notes ----------
async function setupNotes() {
  const { notes = '' } = await local.get('notes');
  $('notes').value = notes;
  let timer;
  $('notes').addEventListener('input', () => {
    clearTimeout(timer);
    $('notesSaved').textContent = '';
    timer = setTimeout(async () => {
      await local.set({ notes: $('notes').value });
      $('notesSaved').textContent = 'Saved';
    }, 400);
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
function setupSettings() {
  const bind = (id, key, parse, onChange) => {
    const input = $(id);
    const isCheck = input.type === 'checkbox';
    if (isCheck) input.checked = settings[key]; else input.value = settings[key];
    const ev = input.tagName === 'SELECT' || isCheck ? 'change' : 'input';
    input.addEventListener(ev, async () => {
      settings[key] = isCheck ? input.checked : parse(input.value);
      await sync.set({ [key]: settings[key] });
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
  bind('groupBy', 'groupBy', String, refresh);
  bind('newTab', 'newTab', Boolean, refresh);
  bind('showClock', 'showClock', Boolean, updateClock);
  bind('clock24', 'clock24', Boolean, updateClock);
  bind('userName', 'userName', String, updateClock);
  bind('engine', 'engine', String, applyEngine);
  bind('weatherOn', 'weatherOn', Boolean, showWeather);
  bind('bgMode', 'bgMode', String, applyBackground);
  bind('bgEvery', 'bgEvery', String, async () => { await chrome.storage.local.remove('dailyBg'); applyBackground(); });
  bind('accent', 'accent', String, outputs);
  bind('dim', 'dim', Number, outputs);
  bind('blur', 'blur', Number, outputs);
  outputs();

  $('city').value = settings.city;
  $('city').addEventListener('change', async () => {
    settings.city = $('city').value.trim();
    await sync.set({ city: settings.city });
    showWeather();
  });

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
const FIXED_WIDGETS = new Set(['weather', 'dock', 'focus']);
const WIDE_WIDGETS = new Set(['grid', 'search', 'clock']);
const widgetEl = (name) => document.querySelector(`[data-widget="${name}"]`);

function applyWidgetPositions() {
  for (const w of document.querySelectorAll('[data-widget]')) {
    const pos = settings.widgetPos[w.dataset.widget];
    w.classList.toggle('placed', !!pos);
    w.style.left = pos ? `${pos.x * 100}vw` : '';
    w.style.top = pos ? `${pos.y * 100}vh` : '';
    w.style.width = pos && pos.w ? `${pos.w * 100}vw` : '';
  }
}

// Opens a floating panel beside its anchor, kept inside the window.
function placeNear(panel, anchor) {
  const a = anchor.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const m = 10;
  let left = a.left + a.width / 2 < innerWidth / 2 ? a.left : a.right - p.width;
  left = Math.max(m, Math.min(left, innerWidth - p.width - m));
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  if (a.top < innerHeight / 2) {
    panel.style.top = `${Math.max(m, Math.min(a.bottom + 8, innerHeight - p.height - m))}px`;
    panel.style.bottom = 'auto';
  } else {
    panel.style.bottom = `${Math.max(m, innerHeight - a.top + 8)}px`;
    panel.style.top = 'auto';
  }
}

// Pin a widget where it is now, so the rest of the page does not reflow when
// one element leaves the normal layout.
function freezeWidget(w) {
  const r = w.getBoundingClientRect();
  const fixed = FIXED_WIDGETS.has(w.dataset.widget);
  const pos = { x: r.left / innerWidth, y: (r.top + (fixed ? 0 : scrollY)) / innerHeight };
  if (WIDE_WIDGETS.has(w.dataset.widget)) pos.w = r.width / innerWidth;
  return pos;
}

function setEditing(on) {
  editing = on;
  document.body.classList.toggle('editing', on);
  $('editBar').hidden = !on;
  $('editLayoutBtn').classList.toggle('active', on);
  if (on) {
    for (const id of ['todoPanel', 'notesPanel', 'focusPanel', 'settings', 'forecast']) $(id).hidden = true;
    const all = { ...settings.widgetPos };
    for (const w of document.querySelectorAll('[data-widget]')) {
      const name = w.dataset.widget;
      if (all[name] || w.hidden || getComputedStyle(w).display === 'none') continue;
      all[name] = freezeWidget(w);
    }
    settings.widgetPos = all;
    applyWidgetPositions();
  } else {
    // Read back the grid width in case it was resized by its corner.
    if (settings.widgetPos.grid) settings.widgetPos.grid.w = widgetEl('grid').getBoundingClientRect().width / innerWidth;
    applyWidgetPositions();
    sync.set({ widgetPos: settings.widgetPos });
  }
}

function setupLayoutEditing() {
  applyWidgetPositions();
  $('editLayoutBtn').addEventListener('click', () => setEditing(!editing));
  $('editLayoutSettings').addEventListener('click', () => setEditing(true));
  $('editDone').addEventListener('click', () => setEditing(false));
  $('resetPositions').addEventListener('click', async () => {
    settings.widgetPos = {};
    await sync.set({ widgetPos: {} });
    setEditing(false);
    applyWidgetPositions();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editing) setEditing(false); });

  // While editing, clicks must not open sites or panels.
  document.addEventListener('click', (e) => {
    if (editing && e.target.closest('[data-widget]')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('dragstart', (e) => { if (editing) e.preventDefault(); }, true);

  let drag = null;
  const guide = el('div', 'snap-guide');
  document.addEventListener('pointerdown', (e) => {
    if (!editing || e.button !== 0) return;
    const w = e.target.closest('[data-widget]');
    if (!w) return;
    const r = w.getBoundingClientRect();
    // The grid's bottom-right corner is its native resize handle.
    if (w.dataset.widget === 'grid' && e.clientX > r.right - 22 && e.clientY > r.bottom - 22) return;
    e.preventDefault();
    w.setPointerCapture(e.pointerId);
    w.classList.add('moving');
    drag = { w, dx: e.clientX - r.left, dy: e.clientY - r.top, fixed: FIXED_WIDGETS.has(w.dataset.widget) };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = drag.w.getBoundingClientRect();
    let left = Math.max(0, Math.min(e.clientX - drag.dx, innerWidth - r.width));
    const top = Math.max(0, Math.min(e.clientY - drag.dy, innerHeight - Math.min(r.height, innerHeight)));
    // Snap the element's centre to the middle of the window.
    const snapped = Math.abs(left + r.width / 2 - innerWidth / 2) < 12;
    if (snapped) left = innerWidth / 2 - r.width / 2;
    if (snapped && !guide.isConnected) document.body.append(guide);
    if (!snapped) guide.remove();
    drag.w.style.left = `${left}px`;
    drag.w.style.top = `${top + (drag.fixed ? 0 : scrollY)}px`;
  });
  const end = () => {
    if (!drag) return;
    const { w, fixed } = drag;
    drag = null;
    guide.remove();
    w.classList.remove('moving');
    const r = w.getBoundingClientRect();
    const prev = settings.widgetPos[w.dataset.widget] || {};
    settings.widgetPos[w.dataset.widget] = { ...prev, x: r.left / innerWidth, y: (r.top + (fixed ? 0 : scrollY)) / innerHeight };
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
  if (cache && cache.sig === signature()) render(cache.sites);

  setupClock();
  setupSearch();
  setupSettings();
  setupDock();
  setupDragAndDrop();
  setupLayoutEditing();
  setupForecastPanel();
  applyBackground();
  showWeather();
  refresh();
  setupTodos();
  setupNotes();
  setupFocus();
})();
