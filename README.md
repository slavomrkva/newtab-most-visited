# New Tab – Most Visited

A free Chrome new tab page with a grid of your most visited sites (from browser
history), a nature photo background, weather with hourly and 7-day forecasts,
a clock, a to-do list, notes and a focus timer. No ads, no account, no paid tier.

**Privacy policy:** https://slavomrkva.github.io/newtab-most-visited/

## Install (unpacked)

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Open a new tab. If Chrome asks whether to keep the changed new tab page, choose **Keep it**.

After editing files, click ↻ on the extension card in `chrome://extensions`.

## Features

- **Most visited grid** built from history, 8–120 sites, real site icons. Sorted **Smart** by default:
  each visit counts less as it gets older (half-life 14 days), so sites you use now come first;
  also available: *Most visited (all time)* and *Recently visited*.
- **Drag and drop** icons to arrange your own layout (Settings → Reset icon order restores the ranking).
- **Free layout**: the ✥ button turns on edit mode; move the clock, weather, search box, icon grid,
  tool buttons and focus timer anywhere, and drag the grid's corner to change its width.
  Positions are stored relative to the window size and synced. **Reset positions** restores the default.
- **Pin** sites to keep them on the page (📌 on hover); **hide** sites (× on hover).
- **Clock and greeting** (12/24-hour, optional name).
- **Search** with Google, Bing or DuckDuckGo: web, images, news, video, maps.
- **Weather** for your location or a city: current, next 24 hours and 7 days;
  links to your own "Weather & Radar" site from history.
- **Background**: nature photo daily, hourly or every tab, your own image, or none.
- **Appearance**: accent colour, photo dimming and blur.
- **To-do list**, **notes** and a **focus timer** (25/50-minute focus, 5-minute break).
- **Backup**: export and import settings, pins, to-dos and notes.
- Settings sync across your computers through your Chrome profile.

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
