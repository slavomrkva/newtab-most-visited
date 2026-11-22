# New Tab – Most Visited

A free Chrome new tab page with a grid of your most visited sites (from browser
history), a nature photo background, weather with hourly and 7-day forecasts,
a clock, a to-do list, notes and a focus timer. No ads, no account, no paid tier.

**Install from the Chrome Web Store:** https://chromewebstore.google.com/detail/pfbikbofncoonngdodifmipkknigjfin

**Privacy policy:** https://slavomrkva.github.io/newtab-most-visited/

## Install (unpacked)

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Open a new tab. If Chrome asks whether to keep the changed new tab page, choose **Keep it**.

After editing files, click ↻ on the extension card in `chrome://extensions`.

## Features

- **Most visited grid** built from history, 8–120 sites, real site icons, optional transparent icon background, and optional "Recently visited" strip. Sorted **Smart** by default (*Most visited* and *Recently visited* also available).
- **Right-click site options**: rename any site, pin/unpin, hide, or add custom sites.
- Sites **open in other tabs are hidden** until their tab is closed (can be turned off).
- **Drag and drop** icons to arrange your own layout (Settings → Reset icon order restores the ranking).
- **Free layout editor (`✥`)**: move, resize, duplicate or hide widgets with smart snapping, alignment guides, Undo (`Ctrl+Z`), and `Alt` for free overlap. Positions sync across screens.
- **World clock & greeting**: 40+ timezones, 4 fonts, 12/24-hour, optional seconds, date and custom label; duplicate clocks for multiple cities.
- **Search & Quick Jump**: 10 search engines (Google, Bing, DuckDuckGo, Brave, Perplexity, Ecosia, Startpage, Qwant, Yahoo, Yandex), instant jump to open tabs & saved sites, optional search tabs and transparent style.
- **Weather**: current, hourly (24h/48h), 7-day and 14-day forecasts, multiple cities, transparent style, and link to your own "Weather & Radar" site.
- **Background**: nature photo daily, hourly or every tab, your own image, or 6 gradients, with photo dimming, blur and optional photo info.
- **To-do list, Notes & Focus timer**: pin To-do and Notes directly onto the page (with transparent option), plus a 25/50-minute focus timer and collapsible toolbar.
- **Backup & Sync**: export/import JSON backup (settings, pins, to-dos and notes) + Chrome profile sync.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3), replaces the new tab page |
| `newtab.html`, `newtab.css`, `newtab.js` | The page |
| `icons/` | Extension icons |
| `store/` | Chrome Web Store package, listing text, privacy policy and images |
| `docs/` | Privacy policy published with GitHub Pages |

## Publishing to the Chrome Web Store

See `store/store-listing.md` for the full submission: listing text, permission
justifications, data disclosures and a checklist.

## Data sources

- Background photos: Bing daily image archive (credited on the page).
- Weather and city search: [Open-Meteo](https://open-meteo.com).
- City name from location: BigDataCloud reverse geocoding.
- Site icons: Google and DuckDuckGo favicon services.
