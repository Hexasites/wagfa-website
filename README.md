# WAGFA website

A rebuilt website for the **Western Australian Game Fishing Association** (wagfa.asn.au). Its look follows the layout of the Odysea template ([askproject.net/odysea](https://askproject.net/odysea/home/)), recreated from scratch for WAGFA with the official logo and a set of game-fishing icons. Its content and features build on the [GFAA](https://www.gfaa.asn.au/) and [Perth Game Fishing Club](https://www.pgfc.com.au/) websites.

It is a fast, mobile-friendly static site: plain HTML, CSS and JavaScript, with no CMS, database or plugins to maintain. Content lives in simple JSON files and is assembled by a small build script that has **no dependencies** (Node.js only).

- `site/` is the finished website, ready to upload.
- `src/` holds the content, templates and assets you edit.

---

## Quick start

Requires [Node.js](https://nodejs.org/) 20 or newer. There is nothing to install.

```bash
node build.mjs --serve
```

Open <http://localhost:8080>. The site rebuilds automatically when anything in `src/` changes. Restart the command after editing `build.mjs` itself.

| Command | What it does |
| --- | --- |
| `node build.mjs` (or `npm run build`) | Build `site/` once |
| `node build.mjs --serve` (or `npm run dev`) | Build, watch `src/` and preview on port 8080 |
| `node build.mjs --watch` | Rebuild on change without the preview server |
| `node build.mjs --noindex` (or `npm run build:preview`) | Build a **preview** copy that asks search engines not to index it. Use it for a preview or staging subdomain. |

> **Preview through the server, not by double-clicking the HTML.** Browsers block web fonts on `file://` pages, so opened directly the site falls back to system fonts. Everything works normally on a web server.

The build prints notes when something needs attention, for example documents that haven't been uploaded yet or a broken internal link.

---

## Project structure

```
build.mjs              Build script (templates, components, sitemap, link checker, preview server)
src/
  data/                All editable content (see below)
  pages/               One file per page: settings at the top, then the page body
  partials/            Shared header, footer, layout, article template
  assets/
    css/styles.css     All styles (design tokens at the top)
    js/main.js         Navigation, club filter, event dates, counters, record spotlight slider, contact form
    js/records.js      WA State Records search, filters, sorting, CSV export
    img/               Photos (each in -960 and -1920 sizes), WAGFA logo (SVG, navy and white), favicon, social image
    fonts/             Self-hosted Taviraj (headings) and Manrope (text)
    icons/             Game-fishing icons (gf-*.svg) and Lucide interface icons; only the ones used are inlined into each page
  files/               PDFs and forms for download (see src/files/README.md)
  static/              Copied to the site root: .htaccess and _redirects
site/                  Generated output. Don't edit by hand; it is rebuilt from src/
```

---

## Editing content

All content lives in `src/data/`. Edit the JSON and rebuild.

| File | What it controls |
| --- | --- |
| `site.json` | Name, postal address, emails, external links, site URL (`baseUrl`) |
| `clubs.json` | Member club directory, the north-to-south coastline and hero coordinates. Fields: `name`, `town`, `region` (Kimberley, Pilbara, Gascoyne, Mid West, Perth, South West), `coords`, `website`, `email`, `phone`, `postal`, `summary`. Clubs are listed in file order (north to south). |
| `events.json` | Tournament calendar. Fields: `name`, `club`, `location`, `start`, optional `end` (YYYY-MM-DD), `url`, `summary`. Optional `status`: `"tbc"` (show a "Dates TBC" badge with `dateText`) or `"cancelled"`. Events move from Upcoming to Past automatically by date at build time, and the browser also hides finished events between builds. |
| `news.json` | News posts. Each post becomes its own page in `site/news/`. `body` is HTML; write internal links as `{{root}}records.html` so they work from the news folder. |
| `committee.json` | Management Committee names, roles and emails, plus the note shown under them |
| `documents.json` | Downloads. Add the file to `src/files/` with the same `file` name. Until it exists the site shows "To be uploaded". |
| `records.json` | The WA State records (compact format, see below) |
| `photos.json` | Photo credits shown on the Credits page. The build works out which pages use each photo. |

### Pages

Each file in `src/pages/` starts with a settings block (title, description, which menu item to highlight, and the hero banner):

```html
---
{
  "title": "Member Clubs",
  "description": "Shown in search results",
  "nav": "clubs",
  "hero": { "eyebrow": "Member clubs", "title": "Find a club", "lead": "…", "image": "coast-sunset" }
}
---
<section class="section"> …page content… </section>
```

Pages can use shared components, for example `{{@clubCards}}`, `{{@eventCards upcoming 6}}`, `{{@newsCards 3}}`, `{{@documents tournaments}}`, `{{@recordSpotlight 4}}`, `{{@committee}}`, `{{@stat records}}` and `{{@icon gf-marlin}}`. The full list is in the `components` object in `build.mjs`.

### Updating the State records

`src/data/records.json` holds every current WA record (900 at the time of writing) in a compact form:

- `species`, `categories`, `environments` are lookup lists.
- Each row is `[species index, category index, environment index, line class kg, first name, surname, weight kg, location, date]`.
- `asAt` is the date shown on the Records page.

The current data was taken from the [GFAA capture records database](https://www.gfaa.asn.au/records/capture-records) filtered to Western Australia (Aus / State = WA), on 25 November 2026. To refresh it, re-export the WA records from GFAA, or have the State Recorder supply a spreadsheet, and convert it to this format. The build also produces `site/files/wa-state-records.csv` (every record) automatically.

### Photos

Photos live in `src/assets/img/` in two widths: `name-960.jpg` and `name-1920.jpg`. Refer to them by `name` in page settings (`"image": "coast-sunset"`). If you add or replace a photo, update `photos.json` so the credit is right, or remove the credit if the photo is WAGFA's own.

---

## Design

The layout follows the **Odysea** template ([askproject.net/odysea](https://askproject.net/odysea/home/)), recreated in this project's own HTML and CSS and adapted to WAGFA. No template code or photos were copied.

| Odysea section | WAGFA version |
| --- | --- |
| Full-screen photo hero, centred serif headline, "Search for a yacht" bar | "Game Fishing from the Kimberley to the Capes", with a **quick State records search** (species, category, line class, angler or place) that opens the filtered results on the Records page |
| Stats with line icons | Current State records, member clubs, record species, years since 1949 (calculated from the data) |
| About: photo, badge and six icon features | About WAGFA with a "1949 Established" badge; the features link to records, tournaments, clubs, tag & release, weigh masters and angling rules |
| Numbered services over a photo | What we do: official State records, sanctioned tournaments, a voice for clubs, ethical fishing |
| Yacht cards | Upcoming tournament cards: host club, dates, place, "Dates TBC" badge, link to the club |
| Client logo strip | The member clubs, each linking to its directory entry |
| "Get started" gradient band | "Game fishing in WA starts at your local club" |
| Testimonial slider | Record spotlight: the heaviest current State record for leading species |
| Why choose us, photo mosaic | Why join a club, photo gallery |
| Team | Management Committee |
| Blog cards | Latest from WAGFA |
| Contact form beside a photo | Message form (opens the visitor's email app, routed to the Secretary or the State Recorder) |
| FAQ accordion | Frequently asked questions |
| Footer: logo, menu, newsletter | Footer: logo, menu, contacts, affiliations and a **Quick Record Search** |

**Icons.** The template's nautical icons (compass, lifebuoy, oars, anchor, rope) are replaced by game-fishing line icons drawn for this site: marlin, tuna, reel, rod, hook, lure, tag, scale, trophy, boat, measure and club pin (`src/assets/icons/gf-*.svg`). They are used in the menus, stats, features and cards. Small interface icons (arrows, mail, calendar) are from Lucide.

**Design tokens** (top of `styles.css`): navy `#031628`, ocean blue `#4178AD`, gold `#B7902E`, with ivory and stone backgrounds. Headings use Taviraj Light; text uses Manrope.

**Carried over from GFAA and PGFC:** the searchable records database with filters, sorting, shareable links and CSV download (GFAA Records); the club directory with a region filter, Why join and Juniors (GFAA Clubs); rules, resources and tag & release (GFAA); the tournament calendar with links to host clubs and upcoming events in the mobile menu (PGFC); and the Acknowledgement of Country (PGFC). Member login, an online shop and a Facebook feed are not included because WAGFA doesn't have them today.

---

## Before going live: content checklist

The live wagfa.asn.au could not be read directly while this was built (it is HTTP-only and was blocked from the build environment). Its content was gathered from search-engine copies of its pages, the GFAA website and the Perth Game Fishing Club website. Please check the following.

1. **Upload the documents.** Nine files from the current site's Help Files and Constitution pages are listed in `src/files/README.md`. Until they're added, those downloads show "To be uploaded".
2. **Logo.** The site uses the official WAGFA logo, traced to SVG from the supplied artwork (`src/assets/img/wagfa-logo.svg`, plus `wagfa-logo-white.svg` for dark backgrounds). The favicon, app icon and social image (`og-image.jpg`) are made from it. If WAGFA has the original vector file, swap it in for the sharpest result.
3. **Photos.** The photos are Creative Commons images from Wikimedia Commons (credited on the Credits page). Swap in WAGFA and club photos where you can: anglers, boats, weigh stations, presentations.
4. **Management Committee.** Taken from the current site's "2025 Management Committee" page (elected at the AGM on 3 May 2025). GFAA's directory lists Tracy Blackwell as WAGFA Secretary, which may reflect a later change. Confirm before launch.
5. **Member clubs.** There are 12 clubs: the 11 listed on the old WAGFA homepage, plus **Ocean Reef Sea Sports Club**, added on 27 November 2026 after the club announced its WAGFA and GFAA affiliation for the 2026/27 season. Club addresses, websites and emails come from GFAA's WA club directory and the current site. Personal mobile numbers and home addresses were deliberately left out.
6. **Records.** Data is from the GFAA database (WA) as at 25 November 2026. Ask the State Recorder to confirm it matches WAGFA's official list. Known issues in the source data:
   - *Trevally, Big Eye*, Junior Male, 2 kg line: the angler's surname was in the weight column and the weight is missing. It shows as "Zak Wheelock", weight "—".
   - The source spells "Spangled Emporer"; the site shows "Spangled Emperor".
7. **Tournament dates.** Three events are marked "Dates TBC": Gamex (March 2027), HMG Billfish Shoot Out (Easter 2027) and the Dampier Classic (August 2027). Confirm them with the host clubs and add other clubs' sanctioned events.
8. **News.** The two launch posts are dated 25 November 2026; change them to the launch date. The old site's news archive (to early 2023) wasn't migrated; add any posts worth keeping to `news.json`.
9. **Weigh Master course.** The existing online course runs on the current WordPress site (`/courses/weigh-master/`). Decide where it will live, for example keep WordPress on a subdomain or use a hosted course platform, then link the course page to it.
10. **Contact form.** It opens the visitor's email app with the message filled in. To receive submissions directly, connect a form service such as Formspree or Netlify Forms.
11. **HTTPS.** The current site doesn't serve HTTPS. Choose hosting with a free certificate, then uncomment the HTTPS redirect in `src/static/.htaccess` if you use Apache.

---

## Deploying

Upload the **contents** of `site/` to the web root of any static host (for example cPanel `public_html`, Netlify, Cloudflare Pages, GitHub Pages or Amazon S3). There is no server-side code.

- **Old URLs:** redirects from the old WordPress addresses (`/aboutwagfa/`, `/member-clubs/`, `/records/`, `/help-files/`, `/courses/…` and so on) are included for Apache (`.htaccess`) and for Netlify and Cloudflare Pages (`_redirects`). They keep bookmarks and search rankings working.
- **404 page:** `404.html` is used automatically by Netlify, Cloudflare Pages and GitHub Pages, and by Apache through `.htaccess`.
- **Domain:** if the site moves to a different address, change `baseUrl` in `src/data/site.json` and rebuild (it sets canonical links, the sitemap and social sharing images).

### Preview on a subdomain (Hostinger)

1. Build a preview copy with `node build.mjs --noindex`, so the preview stays out of search results. (`wagfa-preview-upload.zip` is this build, ready to upload.)
2. In Hostinger hPanel, open the website for the main domain and add a subdomain (Domains → Subdomains), for example `wagfa.preview` for wagfa.preview.dahesa.com.au. If a two-level name isn't accepted, use a single-level one such as `wagfa-preview`. hPanel creates a folder for the subdomain. If the domain's DNS isn't managed by Hostinger, also add a DNS record for the subdomain at the DNS provider.
3. Open File Manager, go to the subdomain's folder, upload the zip and extract it there. `index.html` must sit directly in that folder, not inside a sub-folder. Check that `.htaccess` came across (it is a hidden file).
4. Install the free SSL certificate for the subdomain (hPanel → Security → SSL), then open the address in a browser.
5. For the real site, build normally (`node build.mjs`, without `--noindex`) so search engines can index it.

---

## Credits

- Photographs: Wikimedia Commons contributors, CC BY 4.0 / CC BY-SA 4.0 (details in `src/data/photos.json` and on the Credits page)
- WAGFA logo: property of the Western Australian Game Fishing Association
- Typefaces: Taviraj (Cadson Demak) and Manrope (Mikhail Sharanda), SIL Open Font License; licence files in `src/assets/fonts/`
- Icons: game-fishing icons drawn for this site; interface icons from Lucide, ISC License (licence in `src/assets/icons/`)
- Layout: modelled on the Odysea template's page structure; all code is this project's own
- Records data: Game Fishing Association of Australia records database
