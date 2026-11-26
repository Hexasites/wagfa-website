#!/usr/bin/env node
/**
 * WAGFA website — zero-dependency static site build.
 *
 *   node build.mjs            build ./site from ./src
 *   node build.mjs --watch    rebuild whenever something in ./src changes
 *   node build.mjs --serve    build, watch and preview at http://localhost:8080
 *
 * Environment:
 *   BUILD_DATE=YYYY-MM-DD     date used to split upcoming / past events (default: today)
 *   NOINDEX=1                 preview/staging build: asks search engines not to index the copy
 *                             (also: node build.mjs --noindex)
 *
 * Content lives in src/data/*.json, page bodies in src/pages/*.html, shared
 * markup in src/partials/*.html. Templates support:
 *   {{> partial}}             include src/partials/partial.html
 *   {{@component args}}       call a component function defined below
 *   {{path.to.value}}         HTML-escaped value from the page context
 *   {{{path.to.value}}}       raw (unescaped) value
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'site');
const args = new Set(process.argv.slice(2));
const NOINDEX = args.has('--noindex') || process.env.NOINDEX === '1';

/* ---------------------------------------------------------------- helpers */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(SRC, 'data', f), 'utf8'));
const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = (s, short = false) => { const d = parseISO(s); return `${d.getDate()} ${(short ? MON : MONTHS)[d.getMonth()]} ${d.getFullYear()}`; };
function fmtRange(start, end) {
  const a = parseISO(start), b = parseISO(end || start);
  if (iso(a) === iso(b)) return fmtDate(start);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${a.getFullYear()}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
const TODAY = process.env.BUILD_DATE ? parseISO(process.env.BUILD_DATE) : new Date(new Date().setHours(0, 0, 0, 0));
const kg = (n) => (n == null ? '—' : Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
const isExternal = (href) => /^https?:\/\//.test(href);
const linkAttrs = (href) => (isExternal(href) ? ' target="_blank" rel="noopener"' : '');

/* ------------------------------------------------------------------ icons */

const ICON_DIR = path.join(SRC, 'assets', 'icons');
function loadIcons() {
  const icons = {};
  for (const f of fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(ICON_DIR, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 24 24';
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '').trim();
    icons[f.slice(0, -4)] = { viewBox, inner };
  }
  return icons;
}
// gf-* icons are WAGFA's own game-fishing line icons (48-unit grid); the rest are Lucide (24-unit grid).
const icon = (name, cls = '') => `<svg class="icon${name.startsWith('gf-') ? ' icon--gf' : ''}${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

function sprite(html, icons) {
  const used = [...new Set([...html.matchAll(/#i-([a-z0-9-]+)/g)].map((m) => m[1]))];
  const missing = used.filter((n) => !icons[n]);
  if (missing.length) warn(`Unknown icon(s): ${missing.join(', ')}`);
  // Stroke and fill are set on .icon in CSS so they inherit into each <use>.
  const symbols = used.filter((n) => icons[n]).map((n) => `<symbol id="i-${n}" viewBox="${icons[n].viewBox}">${icons[n].inner}</symbol>`).join('');
  return `<svg class="svg-sprite" aria-hidden="true" focusable="false">${symbols}</svg>`;
}

/* ------------------------------------------------------------- data model */

let warnings = [];
const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };

function loadData() {
  const site = readJSON('site.json');
  const records = readJSON('records.json');
  const rows = records.rows.map((r) => ({
    species: records.species[r[0]], category: records.categories[r[1]], environment: records.environments[r[2]],
    line: r[3], first: r[4], surname: r[5], weight: r[6], location: r[7], date: r[8],
  }));
  const events = readJSON('events.json').map((e) => ({ ...e, end: e.end || e.start }));
  const upcoming = events.filter((e) => parseISO(e.end) >= TODAY).sort((a, b) => a.start.localeCompare(b.start));
  const past = events.filter((e) => parseISO(e.end) < TODAY).sort((a, b) => b.start.localeCompare(a.start));
  const news = readJSON('news.json').sort((a, b) => b.date.localeCompare(a.date));
  const documents = readJSON('documents.json').map((d) => {
    const available = !d.file || d.generated || fs.existsSync(path.join(SRC, 'files', d.file));
    if (!available) warn(`Document not yet uploaded: src/files/${d.file}  (${d.title})`);
    return { ...d, available };
  });
  return {
    site, records, rows, events, upcoming, past, news, documents,
    clubs: readJSON('clubs.json'), committee: readJSON('committee.json'), photos: readJSON('photos.json'),
    stats: {
      clubs: readJSON('clubs.json').length,
      records: rows.length,
      species: new Set(rows.map((r) => r.species)).size,
      years: TODAY.getFullYear() - site.founded,
    },
  };
}

/* ------------------------------------------------------------- components */

const img = (ctx, name, alt, { cls = '', sizes = '100vw', eager = false, pos = '' } = {}) =>
  `<img class="${cls}" src="${ctx.root}assets/img/${name}-1920.jpg" srcset="${ctx.root}assets/img/${name}-960.jpg 960w, ${ctx.root}assets/img/${name}-1920.jpg 1920w" sizes="${sizes}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}${pos ? ` style="object-position:${pos}"` : ''}>`;

const CAT_CLASS = (c) => 'badge--' + slugify(c);
const angler = (r) => [r.first, r.surname].filter(Boolean).join(' ');

function eventDate(e) {
  if (e.status === 'tbc') {
    const d = parseISO(e.start);
    return `<span class="event__day">TBC</span><span class="event__month">${MON[d.getMonth()]} ${d.getFullYear()}</span>`;
  }
  const a = parseISO(e.start), b = parseISO(e.end);
  const day = iso(a) === iso(b) ? `${a.getDate()}` : a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()}` : `${a.getDate()} ${MON[a.getMonth()]}–${b.getDate()} ${MON[b.getMonth()]}`;
  const month = a.getMonth() === b.getMonth() ? `${MON[a.getMonth()]} ${a.getFullYear()}` : `${a.getFullYear()}`;
  return `<span class="event__day${day.length > 6 ? ' event__day--long' : ''}">${day}</span><span class="event__month">${month}</span>`;
}

function shortDate(e) {
  if (e.shortDate) return e.shortDate;
  const a = parseISO(e.start), b = parseISO(e.end);
  if (e.status === 'tbc') return `${MON[a.getMonth()]} ${a.getFullYear()}`;
  if (iso(a) === iso(b)) return `${a.getDate()} ${MON[a.getMonth()]}`;
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MON[a.getMonth()]}`;
  return `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
}
const naturalSpecies = (s) => (s.includes(', ') ? s.split(', ').reverse().join(' ') : s); // "Marlin, Black" -> "Black Marlin"

const components = {
  icon: (ctx, name, cls) => icon(name, cls),
  year: () => String(TODAY.getFullYear()),
  stat: (ctx, key) => String(ctx.stats[key]),
  img: (ctx, name, ...alt) => img(ctx, name, alt.join(' ')),

  pageHero(ctx) {
    const h = ctx.page.hero;
    const t = (s) => esc(render(String(s), ctx)); // allows {{@stat …}} inside hero text
    const crumbs = [`<a href="${ctx.root}index.html">Home</a>`, ...(h.crumbs || []).map((c) => `<a href="${ctx.root}${c.href}">${esc(c.label)}</a>`), `<span aria-current="page">${esc(h.crumb || h.title)}</span>`];
    return `<section class="page-hero">
  <div class="page-hero__media">${img(ctx, h.image, '', { eager: true, pos: h.position || '' })}</div>
  <div class="page-hero__shade"></div>
  <div class="container page-hero__inner">
    ${h.eyebrow ? `<p class="eyebrow eyebrow--center eyebrow--light">${t(h.eyebrow)}</p>` : ''}
    <h1 class="page-hero__title">${t(h.title)}</h1>
    ${h.lead ? `<p class="page-hero__lead">${t(h.lead)}</p>` : ''}
    <nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.join(`<span class="breadcrumbs__sep" aria-hidden="true">/</span>`)}</nav>
  </div>
</section>`;
  },

  stats(ctx) {
    const items = [
      [ctx.stats.records, 'Current State records', 'gf-trophy'],
      [ctx.stats.clubs, 'Member clubs', 'gf-pin'],
      [ctx.stats.species, 'Record species', 'gf-tuna'],
      [ctx.stats.years, 'Years since 1949', 'gf-marlin'],
    ];
    return `<ul class="stats">${items.map(([n, label, ic]) => `<li class="stat">${icon(ic, 'stat__icon')}<span class="stat__rule" aria-hidden="true"></span><span class="stat__num" data-count="${n}">${n}</span><span class="stat__label">${label}</span></li>`).join('')}</ul>`;
  },

  latestRecords(ctx, n = 6) {
    // Newest first, but at most one card per angler/species and two per angler so one busy season doesn't fill the strip.
    const perAngler = new Map(), seen = new Set(), list = [];
    for (const r of [...ctx.rows].filter((x) => x.weight != null).sort((a, b) => b.date.localeCompare(a.date))) {
      const who = angler(r), key = `${who}|${r.species}`;
      if (seen.has(key) || (perAngler.get(who) || 0) >= 2) continue;
      seen.add(key); perAngler.set(who, (perAngler.get(who) || 0) + 1); list.push(r);
      if (list.length >= +n) break;
    }
    return `<div class="record-grid">${list.map((r) => components.recordCard(ctx, r)).join('')}</div>`;
  },
  heaviestRecords(ctx, n = 5) {
    const best = new Map();
    for (const r of ctx.rows) if (r.weight != null && (!best.has(r.species) || best.get(r.species).weight < r.weight)) best.set(r.species, r);
    const list = [...best.values()].sort((a, b) => b.weight - a.weight).slice(0, +n);
    return `<ol class="leaderboard">${list.map((r, i) => `<li class="leaderboard__row"><span class="leaderboard__rank">${i + 1}</span><span class="leaderboard__species">${esc(r.species)}<small>${esc(angler(r))} · ${esc(r.location)} · ${fmtDate(r.date, true)}</small></span><span class="leaderboard__weight">${kg(r.weight)}<small>kg · ${r.line} kg line</small></span></li>`).join('')}</ol>`;
  },
  recordCard(ctx, r) {
    return `<article class="record-card">
  <div class="record-card__top"><span class="badge ${CAT_CLASS(r.category)}">${esc(r.category)}</span><span class="record-card__line">${r.line} kg line</span></div>
  <h3 class="record-card__species">${esc(r.species)}</h3>
  <p class="record-card__weight">${kg(r.weight)}<span>kg</span></p>
  <dl class="record-card__meta">
    <div><dt>Angler</dt><dd>${esc(angler(r))}</dd></div>
    <div><dt>Location</dt><dd>${esc(r.location)}</dd></div>
    <div><dt>Date</dt><dd><time datetime="${r.date}">${fmtDate(r.date, true)}</time></dd></div>
  </dl>
  ${r.environment !== 'Saltwater' ? `<p class="record-card__env">${esc(r.environment)}</p>` : ''}
</article>`;
  },
  categoryCounts(ctx) {
    const counts = {};
    for (const r of ctx.rows) counts[r.category] = (counts[r.category] || 0) + 1;
    return `<ul class="cat-counts">${ctx.records.categories.map((c) => `<li><a class="cat-count" href="?category=${encodeURIComponent(c)}#records-explorer" data-category="${esc(c)}"><span class="badge ${CAT_CLASS(c)}">${esc(c)}</span><strong>${counts[c] || 0}</strong></a></li>`).join('')}</ul>`;
  },
  recordOptions(ctx, kind) {
    if (kind === 'species') return ctx.records.species.map((s) => `<option>${esc(s)}</option>`).join('');
    if (kind === 'category') return ctx.records.categories.map((s) => `<option>${esc(s)}</option>`).join('');
    if (kind === 'environment') return ctx.records.environments.map((s) => `<option>${esc(s)}</option>`).join('');
    if (kind === 'line') return [...new Set(ctx.rows.map((r) => r.line))].sort((a, b) => a - b).map((l) => `<option value="${l}">${l} kg</option>`).join('');
    return '';
  },
  recordsAsAt: (ctx) => fmtDate(ctx.records.asAt),

  events(ctx, which = 'upcoming', limit = '99', variant = '') {
    const list = (which === 'past' ? ctx.past : ctx.upcoming).slice(0, +limit);
    if (!list.length) return `<p class="empty-note">No ${which} events are listed at the moment. Check with your club for local events.</p>`;
    return `<ol class="event-list${variant ? ' event-list--' + variant : ''}" data-events="${which}">${list.map((e) => {
      const title = e.url ? `<a href="${esc(e.url)}"${linkAttrs(e.url)}>${esc(e.name)}${isExternal(e.url) ? icon('arrow-up-right', 'icon--xs') : ''}</a>` : esc(e.name);
      const badge = e.status === 'cancelled' ? '<span class="badge badge--cancelled">Cancelled</span>' : e.status === 'tbc' ? '<span class="badge badge--tbc">Dates TBC</span>' : '';
      return `<li class="event${e.status === 'cancelled' ? ' event--cancelled' : ''}" data-end="${e.end}">
  <div class="event__date">${eventDate(e)}</div>
  <div class="event__body">
    <h3 class="event__title">${title}</h3>
    <p class="event__meta"><span>${icon('users', 'icon--sm')}${esc(e.club)}</span>${e.location ? `<span>${icon('map-pin', 'icon--sm')}${esc(e.location)}</span>` : ''}<span class="event__when">${icon('calendar-days', 'icon--sm')}${esc(e.dateText || fmtRange(e.start, e.end))}</span></p>
    ${e.summary ? `<p class="event__summary">${esc(e.summary)}</p>` : ''}
  </div>
  ${badge ? `<div class="event__status">${badge}</div>` : ''}
</li>`;
    }).join('')}</ol>`;
  },
  menuEvents(ctx) {
    return `<ul class="menu-events">${ctx.upcoming.slice(0, 4).map((e) => `<li data-end="${e.end}"><a href="${ctx.root}tournaments.html"><strong>${esc(e.name)}</strong><span>${esc(e.dateText || fmtRange(e.start, e.end))}</span></a></li>`).join('')}</ul>`;
  },

  clubFilters(ctx) {
    const regions = [...new Set(ctx.clubs.map((c) => c.region))];
    return `<div class="chips" role="group" aria-label="Filter clubs by region">
  <button type="button" class="chip" aria-pressed="true" data-region="all">All regions <span>${ctx.clubs.length}</span></button>
  ${regions.map((r) => `<button type="button" class="chip" aria-pressed="false" data-region="${esc(r)}">${esc(r)} <span>${ctx.clubs.filter((c) => c.region === r).length}</span></button>`).join('')}
</div>`;
  },
  clubCards(ctx) {
    return `<div class="club-grid" data-club-grid>${ctx.clubs.map((c) => `<article class="club-card" data-region="${esc(c.region)}" id="${slugify(c.name)}">
  <div class="club-card__head"><span class="club-card__region">${esc(c.region)}</span><span class="club-card__coords">${esc(c.coords)}</span></div>
  <h3 class="club-card__name">${esc(c.name)}</h3>
  <p class="club-card__town">${icon('map-pin', 'icon--sm')}${esc(c.town)}</p>
  ${c.summary ? `<p class="club-card__summary">${esc(c.summary)}</p>` : ''}
  <ul class="club-card__links">
    ${c.website ? `<li><a href="${esc(c.website)}" target="_blank" rel="noopener">${icon(c.website.includes('facebook.com') ? 'facebook' : 'globe', 'icon--sm')}${c.website.includes('facebook.com') ? 'Facebook group' : esc(c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></li>` : ''}
    ${c.email ? `<li><a href="mailto:${esc(c.email)}">${icon('mail', 'icon--sm')}${esc(c.email)}</a></li>` : ''}
    ${c.phone ? `<li><a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${icon('phone', 'icon--sm')}${esc(c.phone)}</a></li>` : ''}
    ${c.postal ? `<li class="club-card__postal">${icon('mail-open', 'icon--sm')}${esc(c.postal)}</li>` : ''}
  </ul>
</article>`).join('')}</div>`;
  },
  coastline(ctx) {
    return `<ol class="coastline">${ctx.clubs.map((c) => `<li class="coastline__stop"><span class="coastline__coords">${esc(c.coords)}</span><span class="coastline__town">${esc(c.town)}</span><a class="coastline__club" href="${ctx.root}clubs.html#${slugify(c.name)}">${esc(c.name)}</a></li>`).join('')}</ol>`;
  },
  clubStrip(ctx) {
    return `<ul class="club-strip">${ctx.clubs.map((c) => `<li><a href="${ctx.root}clubs.html#${slugify(c.name)}">${esc(c.name.replace(' – Game Fishing Section', ''))}</a></li>`).join('')}</ul>`;
  },
  recordSpotlight(ctx, n = '4') {
    const best = new Map();
    for (const r of ctx.rows) if (r.weight != null && (!best.has(r.species) || best.get(r.species).weight < r.weight)) best.set(r.species, r);
    const list = [...best.values()].sort((a, b) => b.weight - a.weight).slice(0, +n);
    return `<div class="spotlight" data-slider>
  ${icon('gf-marlin', 'spotlight__icon')}
  <div class="spotlight__slides">${list.map((r, i) => `<figure class="spotlight__slide" id="spot-${i}"${i ? ' hidden' : ''}>
    <blockquote class="spotlight__text">${esc(naturalSpecies(r.species))}, ${kg(r.weight)} kg on ${r.line} kg line: the heaviest current WA State record for the species.</blockquote>
    <figcaption><span class="spotlight__name">${esc(angler(r))}</span><span class="spotlight__meta">${esc(r.location)} · ${fmtDate(r.date)} · ${esc(r.category)}</span></figcaption>
  </figure>`).join('')}</div>
  <div class="spotlight__dots">${list.map((r, i) => `<button type="button" class="spotlight__dot" aria-label="Show record ${i + 1} of ${list.length}" aria-controls="spot-${i}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('')}</div>
</div>`;
  },
  eventCards(ctx, which = 'upcoming', limit = '6') {
    const list = (which === 'past' ? ctx.past : ctx.upcoming).slice(0, +limit);
    if (!list.length) return `<p class="empty-note">No ${which} events are listed at the moment. Check with your club for local events.</p>`;
    const photos = ['coast-path', 'tuna-school', 'coast-lagoon', 'coast-sunset', 'tuna-school-2', 'coast-dunes'];
    return `<div class="trip-grid" data-events="${which}">${list.map((e, i) => {
      const href = e.url || `${ctx.root}tournaments.html`;
      const badge = e.status === 'cancelled' ? '<span class="badge badge--cancelled">Cancelled</span>' : e.status === 'tbc' ? '<span class="badge badge--tbc">Dates TBC</span>' : '';
      return `<article class="trip-card" data-end="${e.end}">
  ${e.promo
    ? `<a class="trip-card__media trip-card__media--promo" href="${esc(href)}"${linkAttrs(href)} tabindex="-1"${e.promoBg ? ` style="background:${esc(e.promoBg)}"` : ''}><img src="${ctx.root}assets/img/${esc(e.promo)}" alt="${esc(e.promoAlt || e.name)}" loading="lazy" decoding="async"></a>`
    : `<a class="trip-card__media" href="${esc(href)}"${linkAttrs(href)} tabindex="-1" aria-hidden="true">${img(ctx, e.image || photos[i % photos.length], '', { sizes: '(min-width: 1000px) 33vw, (min-width: 640px) 50vw, 100vw' })}</a>`}
  <div class="trip-card__body">
    <div class="trip-card__top"><span class="trip-card__club">${esc(e.club)}</span>${badge}</div>
    <h3 class="trip-card__title"><a href="${esc(href)}"${linkAttrs(href)}>${esc(e.name)}</a></h3>
    <ul class="trip-card__specs">
      <li>${icon('calendar-days', 'icon--sm')}${esc(e.dateText || fmtRange(e.start, e.end))}</li>
      ${e.location ? `<li>${icon('map-pin', 'icon--sm')}${esc(e.location)}</li>` : ''}
    </ul>
    ${e.summary ? `<p class="trip-card__text">${esc(e.summary)}</p>` : ''}
    <div class="trip-card__foot"><a class="text-link" href="${esc(href)}"${linkAttrs(href)}>${isExternal(href) ? 'Club details' : 'Details'} ${icon('arrow-right', 'icon--sm')}</a><span class="trip-card__date">${esc(shortDate(e))}</span></div>
  </div>
</article>`;
    }).join('')}</div>`;
  },

  newsCards(ctx, limit = '99') {
    return `<div class="post-grid">${ctx.news.slice(0, +limit).map((n) => `<article class="post-card">
  <a class="post-card__media" href="${ctx.root}news/${n.slug}.html" tabindex="-1" aria-hidden="true">${img(ctx, n.image, '', { sizes: '(min-width: 900px) 33vw, 100vw' })}</a>
  <p class="post-card__meta"><span>${esc(n.category)}</span><span class="post-card__dots" aria-hidden="true"></span><time datetime="${n.date}">${fmtDate(n.date)}</time></p>
  <h3 class="post-card__title"><a href="${ctx.root}news/${n.slug}.html">${esc(n.title)}</a></h3>
  <p class="post-card__excerpt">${esc(n.excerpt)}</p>
</article>`).join('')}</div>`;
  },

  newsList(ctx, limit = '5') {
    return `<ul class="news-list">${ctx.news.slice(0, +limit).map((n) => `<li><a href="${ctx.root}news/${n.slug}.html">${esc(n.title)}</a><time datetime="${n.date}">${fmtDate(n.date)}</time></li>`).join('')}</ul>`;
  },

  committee(ctx) {
    return `<ul class="team">${ctx.committee.members.map((m) => `<li class="team-card">
  <div class="team-card__portrait" aria-hidden="true"><span>${esc(m.name.split(' ').map((p) => p[0]).join('').slice(0, 2))}</span>${icon('gf-marlin', 'team-card__mark')}</div>
  <h3 class="team-card__name">${esc(m.name)}</h3>
  <p class="team-card__role">${esc(m.role)}</p>
  ${m.email ? `<a class="team-card__email" href="mailto:${esc(m.email)}">${esc(m.email).replace('@', '<wbr>@')}</a>` : ''}
</li>`).join('')}</ul>
<p class="fine-print">${esc(ctx.committee.note)}</p>`;
  },

  documents(ctx, group) {
    const docs = ctx.documents.filter((d) => d.group === group);
    return `<ul class="doc-list">${docs.map((d) => {
      const typeIcon = d.type === 'XLSX' ? 'file-spreadsheet' : d.type === 'Web' ? 'globe' : 'file-text';
      const href = d.url || (d.file ? `${ctx.root}files/${d.file}` : '');
      const inner = `<span class="doc__icon">${icon(typeIcon)}</span>
    <span class="doc__text"><span class="doc__title">${esc(d.title)}</span>${d.description ? `<span class="doc__desc">${esc(d.description)}</span>` : ''}</span>
    <span class="doc__type">${esc(d.type)}</span>`;
      if (!d.available) return `<li class="doc doc--pending"><div class="doc__link" aria-disabled="true">${inner}<span class="doc__action">To be uploaded</span></div></li>`;
      return `<li class="doc"><a class="doc__link" href="${esc(href)}"${linkAttrs(href)}${!isExternal(href) ? ' download' : ''}>${inner}<span class="doc__action">${icon(isExternal(href) ? 'arrow-up-right' : 'download')}</span></a></li>`;
    }).join('')}</ul>`;
  },

  credits(ctx) {
    return `<div class="table-wrap"><table class="table">
  <thead><tr><th scope="col">Photo</th><th scope="col">Used on</th><th scope="col">Author</th><th scope="col">Licence</th></tr></thead>
  <tbody>${ctx.photos.map((p) => `<tr>
    <td><a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.title)}</a></td>
    <td>${esc(ctx.photoUsage && ctx.photoUsage[p.file] && ctx.photoUsage[p.file].size ? [...ctx.photoUsage[p.file]].join(', ') : p.usedOn)}</td><td>${esc(p.author)}</td>
    <td><a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(p.license)}</a>${p.changes ? `<br><small>${esc(p.changes)}</small>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`;
  },
};

/* --------------------------------------------------------------- templates */

const partialCache = {};
const partial = (name) => {
  if (!(name in partialCache)) {
    const f = path.join(SRC, 'partials', `${name}.html`);
    if (!fs.existsSync(f)) throw new Error(`Missing partial: ${name}`);
    partialCache[name] = fs.readFileSync(f, 'utf8');
  }
  return partialCache[name];
};

function render(tpl, ctx, depth = 0) {
  if (depth > 12) throw new Error('Template recursion too deep');
  tpl = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => render(partial(name), ctx, depth + 1));
  tpl = tpl.replace(/\{\{@([\w-]+)([^}]*)\}\}/g, (_, name, a) => {
    const fn = components[name];
    if (!fn) throw new Error(`Unknown component @${name}`);
    return fn(ctx, ...a.trim().split(/\s+/).filter(Boolean));
  });
  tpl = tpl.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, p) => get(ctx, p) ?? '');
  tpl = tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => esc(get(ctx, p) ?? ''));
  return tpl;
}

function parsePage(raw, file) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return { meta: {}, body: raw };
  try { return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length) }; }
  catch (e) { throw new Error(`Invalid front matter in ${file}: ${e.message}`); }
}

/* ------------------------------------------------------------------- build */

function copyDir(from, to, skip = () => false) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (skip(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, skip); else fs.copyFileSync(s, d);
  }
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function build() {
  const started = Date.now();
  warnings = [];
  for (const k of Object.keys(partialCache)) delete partialCache[k];
  const data = loadData();
  const icons = loadIcons();
  const layout = partial('layout');
  // Home first (so it leads the photo-usage lists), Credits last (it lists where each photo is used).
  const rank = (f) => (f === 'index.html' ? 0 : f === 'credits.html' ? 2 : 1);
  const pages = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const photoUsage = {}; // photo file -> Set of page labels, filled as pages are rendered
  const notePhotos = (label, html) => {
    for (const p of data.photos) {
      if (new RegExp(`assets/img/${p.file}-\\d+\\.(?:jpg|webp)`).test(html)) (photoUsage[p.file] ||= new Set()).add(label);
    }
  };

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'news'), { recursive: true });

  const written = [];
  const emit = (file, meta, body, root) => {
    const ctx = { ...data, page: { ...meta, file }, root };
    ctx.page.canonical = `${data.site.baseUrl}/${file === 'index.html' ? '' : file}`;
    ctx.page.fullTitle = meta.title ? `${meta.title} | ${data.site.short}` : `${data.site.short} | ${data.site.name}`;
    ctx.page.ogImage = `${data.site.baseUrl}/assets/img/og-image.jpg`;
    ctx.page.robotsMeta = NOINDEX ? '<meta name="robots" content="noindex, nofollow">' : '';
    const content = render(body, ctx);
    const hero = meta.hero ? components.pageHero(ctx) : '';
    notePhotos(meta.usageLabel || meta.title || 'Home page', hero + content);
    let html = render(layout, { ...ctx, content, hero, bodyClass: [meta.bodyClass, meta.hero || meta.homeHero ? 'has-hero' : 'no-hero'].filter(Boolean).join(' ') });
    if (meta.nav) html = html.replaceAll(`data-nav="${meta.nav}"`, `data-nav="${meta.nav}" data-current`);
    html = html.replace('<!--SPRITE-->', sprite(html, icons));
    const extra = (meta.scripts || []).map((s) => `<script src="${root}assets/js/${s}" defer></script>`).join('\n');
    html = html.replace('<!--SCRIPTS-->', extra);
    fs.writeFileSync(path.join(OUT, file), html.replace(/\n\s*\n\s*\n/g, '\n\n'));
    written.push(file);
  };

  const article = partial('article');
  const emitArticles = () => data.news.forEach((n) => {
    const meta = {
      title: n.title, description: n.excerpt, nav: 'about', bodyClass: 'page-article', usageLabel: 'News articles',
      hero: { eyebrow: `${n.category} · ${fmtDate(n.date)}`, title: n.title, image: n.image, crumbs: [{ label: 'News', href: 'news.html' }], crumb: 'Article' },
    };
    const a = { ...n, dateText: fmtDate(n.date) };
    const body = article.replace('{{{article.body}}}', () => a.body).replace(/\{\{article\.(\w+)\}\}/g, (_, k) => esc(a[k] ?? ''));
    emit(`news/${n.slug}.html`, meta, body, '../');
  });

  for (const f of pages) {
    if (f === 'credits.html') {
      emitArticles();
      notePhotos('Footer (every page)', partial('footer'));
      notePhotos('Social sharing image', 'assets/img/tuna-school-1920.jpg');
      data.photoUsage = photoUsage;
    }
    const { meta, body } = parsePage(fs.readFileSync(path.join(SRC, 'pages', f), 'utf8'), f);
    emit(f, meta, body, '');
  }
  if (!data.photoUsage) emitArticles();

  copyDir(path.join(SRC, 'assets'), path.join(OUT, 'assets'), (s) => s.startsWith(ICON_DIR + path.sep) && !s.endsWith('.txt'));
  copyDir(path.join(SRC, 'files'), path.join(OUT, 'files'), (s) => s.endsWith('README.md'));
  copyDir(path.join(SRC, 'static'), OUT); // .htaccess, _redirects and anything else that belongs at the site root
  fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });

  // Client-side records data (compact) and a full CSV download.
  fs.writeFileSync(path.join(OUT, 'assets', 'js', 'records-data.js'), `/* Generated by build.mjs from src/data/records.json — do not edit. */\nwindow.WAGFA_RECORDS=${JSON.stringify(data.records)};\n`);
  const header = ['Species', 'Category', 'Environment', 'Line class (kg)', 'First name', 'Surname', 'Weight (kg)', 'Location', 'Date'];
  const csv = [header, ...data.rows.map((r) => [r.species, r.category, r.environment, r.line, r.first, r.surname, r.weight ?? '', r.location, r.date])].map((row) => row.map(csvCell).join(',')).join('\r\n');
  fs.writeFileSync(path.join(OUT, 'files', 'wa-state-records.csv'), '﻿' + csv);

  // Sitemap and robots.
  const urls = written.filter((f) => f !== '404.html').map((f) => `  <url><loc>${data.site.baseUrl}/${f === 'index.html' ? '' : f}</loc></url>`);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  if (NOINDEX) {
    // Preview copy: let crawlers see the noindex tags (blocking them in robots.txt would hide the tags), and send the same signal for PDFs and the CSV.
    fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    fs.appendFileSync(path.join(OUT, '.htaccess'), '\n# Preview build: keep this copy out of search results.\n<IfModule mod_headers.c>\n  Header set X-Robots-Tag "noindex, nofollow"\n</IfModule>\n');
  } else {
    fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${data.site.baseUrl}/sitemap.xml\n`);
  }

  // Sanity check: every relative link and asset in the output must exist.
  for (const f of written) {
    const html = fs.readFileSync(path.join(OUT, f), 'utf8');
    for (const m of html.matchAll(/\s(?:href|src)="([^"#?]+)[^"]*"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(u)) continue;
      if (!fs.existsSync(path.join(OUT, path.dirname(f), u))) warn(`Broken link in ${f}: ${u}`);
    }
    for (const m of html.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (!fs.existsSync(path.join(OUT, path.dirname(f), u))) warn(`Missing image in ${f}: ${u}`);
    }
  }

  console.log(`Built ${written.length} pages into site/ in ${Date.now() - started} ms (events split at ${iso(TODAY)}: ${data.upcoming.length} upcoming, ${data.past.length} past)${NOINDEX ? " as a noindex preview" : ""}.`);
  if (warnings.length) console.log(`\n${warnings.length} note(s):\n  - ${warnings.join('\n  - ')}`);
}

/* ------------------------------------------------------ watch & preview */

function watch() {
  // Watch every folder (not every file), so edits that replace a file, e.g. `sed -i` or some editors' safe-save, are still seen.
  let t;
  const rebuild = () => { clearTimeout(t); t = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 150); };
  const watched = new Set();
  const watchTree = (dir) => {
    if (!watched.has(dir)) {
      try { fs.watch(dir, () => { rebuild(); watchTree(SRC); }); watched.add(dir); } catch { /* folder vanished */ }
    }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) watchTree(path.join(dir, e.name));
  };
  watchTree(SRC);
  console.log('Watching src/ for changes…');
}

function serve(port = Number(process.env.PORT) || 8080) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.csv': 'text/csv', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
  http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    let f = path.join(OUT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    let status = 200;
    if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { f = path.join(OUT, '404.html'); status = 404; }
    res.writeHead(status, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, () => console.log(`Preview: http://localhost:${port}`));
}

try { build(); } catch (e) { console.error(`Build failed: ${e.message}`); process.exitCode = 1; }
if (args.has('--watch') || args.has('--serve')) watch();
if (args.has('--serve')) serve();
