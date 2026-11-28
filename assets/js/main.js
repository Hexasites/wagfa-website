/* WAGFA website — site-wide behaviour (no dependencies). */
(() => {
  'use strict';
  const doc = document.documentElement;
  const desktop = window.matchMedia('(min-width: 1080px)');

  /* Header: solid background once the page scrolls. */
  const header = document.querySelector('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Dropdown menus (desktop) and accordions (mobile panel). */
  const menuButtons = [...document.querySelectorAll('.has-menu > .nav-link')];
  const closeMenus = (except) => menuButtons.forEach((b) => { if (b !== except) b.setAttribute('aria-expanded', 'false'); });
  menuButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      if (desktop.matches) closeMenus(btn);
      btn.setAttribute('aria-expanded', String(!open));
    });
    btn.parentElement.addEventListener('focusout', (e) => {
      if (desktop.matches && !btn.parentElement.contains(e.relatedTarget)) btn.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('click', (e) => { if (desktop.matches && !e.target.closest('.has-menu')) closeMenus(); });

  /* Mobile off-canvas navigation. */
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('primary-nav');
  const closeBtn = nav && nav.querySelector('.menu-close');
  let lastFocus = null;
  const openNav = () => {
    lastFocus = document.activeElement;
    doc.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    setTimeout(() => closeBtn && closeBtn.focus(), 50);
  };
  const closeNav = () => {
    doc.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (lastFocus) lastFocus.focus();
  };
  if (toggle && nav) {
    toggle.addEventListener('click', () => (doc.classList.contains('nav-open') ? closeNav() : openNav()));
    closeBtn && closeBtn.addEventListener('click', closeNav);
    nav.addEventListener('click', (e) => { if (e.target === nav) closeNav(); });
    nav.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !doc.classList.contains('nav-open')) return;
      const items = [...nav.querySelectorAll('a[href], button')].filter((el) => el.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    nav.querySelectorAll('.mega a, .primary-nav__extra a').forEach((a) => a.addEventListener('click', () => { if (!desktop.matches) doc.classList.remove('nav-open'); }));
    desktop.addEventListener('change', () => { doc.classList.remove('nav-open'); closeMenus(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (doc.classList.contains('nav-open')) closeNav();
    const open = menuButtons.find((b) => b.getAttribute('aria-expanded') === 'true');
    if (open && desktop.matches) { closeMenus(); open.focus(); }
  });

  /* Club directory: filter by region. */
  const chips = document.querySelectorAll('.chip[data-region]');
  const clubs = document.querySelectorAll('.club-card[data-region]');
  const clubCount = document.querySelector('[data-club-count]');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const region = chip.dataset.region;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    let shown = 0;
    clubs.forEach((card) => { card.hidden = region !== 'all' && card.dataset.region !== region; if (!card.hidden) shown++; });
    if (clubCount) clubCount.textContent = region === 'all' ? `Showing all ${shown} clubs` : `Showing ${shown} club${shown === 1 ? '' : 's'} in ${region}`;
  }));

  /* Upcoming events: drop anything that has finished since the site was last built. */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ended = (el) => { const [y, m, d] = el.dataset.end.split('-').map(Number); return new Date(y, m - 1, d) < today; };
  document.querySelectorAll('[data-events="upcoming"] > [data-end], .menu-events > [data-end]').forEach((el) => { if (ended(el)) el.remove(); });
  document.querySelectorAll('[data-events="upcoming"]').forEach((list) => {
    if (!list.children.length) list.insertAdjacentHTML('afterend', '<p class="empty-note">No upcoming events are listed right now. Check with your club for local events.</p>');
  });

  /* Count-up animation for statistics. */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const counters = document.querySelectorAll('[data-count]');
  if (!reduceMotion && 'IntersectionObserver' in window && counters.length) {
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target, target = Number(el.dataset.count), start = performance.now(), dur = 1300;
      const tick = (t) => {
        const p = Math.min(1, (t - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-AU');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.5 });
    counters.forEach((c) => io.observe(c));
  }

  /* Record spotlight slider (dots + gentle auto-advance; pauses on hover/focus, respects reduced motion). */
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const slides = [...slider.querySelectorAll('.spotlight__slide')];
    const dots = [...slider.querySelectorAll('.spotlight__dot')];
    if (slides.length < 2) return;
    let index = 0, timer = null, paused = false;
    const show = (i) => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, n) => { s.hidden = n !== index; });
      dots.forEach((d, n) => d.setAttribute('aria-current', String(n === index)));
    };
    dots.forEach((d, n) => d.addEventListener('click', () => { show(n); restart(); }));
    const restart = () => { clearInterval(timer); if (!reduceMotion) timer = setInterval(() => { if (!paused) show(index + 1); }, 7000); };
    slider.addEventListener('mouseenter', () => { paused = true; });
    slider.addEventListener('mouseleave', () => { paused = false; });
    slider.addEventListener('focusin', () => { paused = true; });
    slider.addEventListener('focusout', () => { paused = false; });
    restart();
  });

  /* Contact form: compose an email in the visitor's mail app. */
  const form = document.querySelector('[data-mailto-form]');
  if (form) {
    const topic = form.querySelector('[name="topic"]');
    const preset = new URLSearchParams(location.search).get('topic');
    if (preset && [...topic.options].some((o) => o.value === preset)) topic.value = preset;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const option = topic.options[topic.selectedIndex];
      const subject = `[WAGFA website] ${option.textContent}`;
      const body = `${data.get('message')}\n\n--\n${data.get('name')} <${data.get('email')}>${data.get('club') ? `\nClub: ${data.get('club')}` : ''}`;
      window.location.href = `mailto:${option.dataset.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const note = form.querySelector('[data-form-note]');
      if (note) note.hidden = false;
    });
  }
})();
