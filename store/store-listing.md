# Chrome Web Store submission – New Tab – Most Visited

Everything to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
section by section. Contact email: info@tncsim.org (already in privacy-policy.html). Privacy policy: https://slavomrkva.github.io/newtab-most-visited/

The extension is completely free: no paid tier, no ads, no account.

---

## 1. Package

Upload `store/new-tab-most-visited-2.2.0.zip`.

## 2. Store listing

**Name** (from the manifest, max 75 characters)
> New Tab – Most Visited

**Summary** (manifest description, max 132 characters)
> Your most visited sites from history, weather forecast, a daily nature photo, to-dos, notes and a focus timer.

**Description**

> Your most visited sites, automatically. Open a new tab and see the sites you really use, built from your own browsing history and ranked by how often you visit them. Nothing to set up and no bookmarks to arrange. It even picks up history you imported from Firefox or another browser.
>
> ★ FEATURES
> • Most visited grid: up to 120 sites from your history, with real site icons
> • Drag and drop icons to arrange your own layout
> • Make the page yours: move the clock, weather, search box, icons and buttons anywhere
> • Pin favourites so they always stay; hide any site with one click
> • Beautiful nature photos: a new one every day, every hour or every tab, or use your own image
> • Clock with a personal greeting
> • Weather for your location or any city: hourly forecast for 24 hours and a 7-day forecast
> • Search with Google, Bing or DuckDuckGo: web, images, news, video and maps
> • To-do list, notes and a focus timer (25/50-minute sessions and breaks)
> • Accent colour, photo dimming and blur
> • Backup: export and import your settings, pins, to-dos and notes
> • Settings sync across your computers through your Chrome profile
>
> 100% free. No ads, no account, no paid version.
>
> 🔒 PRIVATE BY DESIGN
> Your history is read on your device to build the grid and is never uploaded. No ads, no analytics, no tracking. To-dos and notes stay in local storage. Only site domain names are sent to an icon service to draw the icons, and location is used only for the weather (you can type a city instead or turn weather off).
>
> Tips
> • Drag icons to rearrange them. Hover over an icon: 📌 pins it, × hides it.
> • Click ✥ (bottom right) to move the clock, weather, search and other elements; Done saves the layout.
> • The buttons at the bottom right open the to-do list, notes, focus timer, layout editor and Settings.
> • Click the weather to see the hourly and 7-day forecast.

**Category:** Productivity → Tools
(If the dashboard shows the older list: Productivity.)

**Language:** English

**Graphic assets** (in `store/`)
| Asset | File | Size |
|---|---|---|
| Store icon | `icons/icon128.png` | 128×128 |
| Screenshot 1: grid, clock, weather | `screenshot-1-grid.png` | 1280×800 |
| Screenshot 2: hourly and 7-day forecast | `screenshot-2-forecast.png` | 1280×800 |
| Screenshot 3: to-do list and focus timer | `screenshot-3-tools.png` | 1280×800 |
| Screenshot 4: settings | `screenshot-4-settings.png` | 1280×800 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |

**Official URL / homepage:** optional (for example the GitHub repository).
**Support URL:** optional; an email or GitHub issues page.

## 3. Privacy practices

**Single purpose**
> Replaces the new tab page with a dashboard of the user's most visited sites, built from their browsing history, together with a weather widget, clock, search box and simple productivity tools (to-do list, notes, focus timer).

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `history` | Core feature. The extension reads the browsing history locally to count visits per site and show the user's most visited sites on the new tab page. It also finds the user's own weather-radar site in history to link it from the weather widget. History is processed only on the device and is never uploaded. |
| `storage` | Saves the user's settings, pinned and hidden sites, to-do list and notes, plus caches for the site list, weather and background photo list, so the new tab opens instantly. |
| `unlimitedStorage` | Lets the user set their own background image, which is stored locally and can exceed the default local storage quota. |
| `geolocation` | Gets the user's approximate location only to show local weather. Chrome asks for consent first; users can type a city instead or turn the weather widget off. |
| Host: `https://www.bing.com/HPImageArchive.aspx*` | Downloads the list of Bing's daily photos, used as the background picture. |
| Host: `https://api.open-meteo.com/*`, `https://geocoding-api.open-meteo.com/*` | Current weather, hourly and 7-day forecast, and searching a city the user types. |
| Host: `https://api.bigdatacloud.net/*` | Converts the device location into a city name shown next to the temperature. |
| Host: `https://www.google.com/s2/favicons*`, `https://t0–t3.gstatic.com/faviconV2*`, `https://icons.duckduckgo.com/*` | Loads site icons for the tiles. Only the domain name of each tile is sent. Chrome's own favicon cache does not know sites imported from another browser, so these services are needed for icons. |

**Remote code:** No, I am not using remote code. (All JavaScript ships in the package; only JSON data and images are fetched.)

**Data usage: what to tick**

| Data type | Tick? | Reason |
|---|---|---|
| Personally identifiable information | No | Not collected. |
| Health information | No | |
| Financial and payment information | No | Nothing is sold. |
| Authentication information | No | |
| Personal communications | No | |
| Location | **Yes** | Coordinates are sent to Open-Meteo and BigDataCloud to show local weather. |
| Web history | **Yes** | Domain names of the most visited sites are sent to the icon services to draw tile icons. The history itself stays on the device. |
| User activity | No | |
| Website content | No | |

Then tick all three certifications:
- I do not sell or transfer user data to third parties, apart from the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://slavomrkva.github.io/newtab-most-visited/

## 4. Distribution

- **Visibility:** Public (or Unlisted for a soft launch: only people with the link can install).
- **Regions:** All regions.
- **Pricing:** Free.

## 5. Before you submit: checklist

- [ ] Developer account registered (one-time $5 fee) and contact email verified.
- [x] Contact email info@tncsim.org set in `privacy-policy.html`.
- [ ] Privacy policy published at a public URL, for example GitHub Pages:
      create a public repository, add `privacy-policy.html` as `index.html`, then
      **Settings → Pages → Deploy from branch**.
- [ ] Installed the ZIP's contents as an unpacked extension once more and checked a new tab.
- [ ] Review time is usually from a few days up to a few weeks; extensions with the
      `history` permission tend to get a closer look.
