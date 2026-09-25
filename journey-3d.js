(() => {
  'use strict';
  const root = document.documentElement;
  const heroSection = document.querySelector('.hero');
  const routeSection = document.querySelector('#route');
  const landscape = document.querySelector('.journey-landscape');
  const stops = [...document.querySelectorAll('.journey-stop')];
  const dayButtons = [...document.querySelectorAll('[data-journey-day]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let day = 1;
  let explicitSelectionAt = null;
  let queued = false;
  const scenes = () => [window.guilinScene, window.guilinRouteScene].filter(Boolean);

  function updateCaption() {
    const stop = stops[day - 1];
    document.querySelector('#journey-day-label').textContent = `0${day} / 06`;
    document.querySelector('#journey-current-title').textContent = stop.querySelector('h3').textContent;
    document.querySelector('#journey-current-copy').textContent = stop.querySelector('h3 + p').textContent;
    const en = root.lang === 'en';
    document.querySelector('#route-3d').setAttribute('aria-label', en ? `Day ${day} landscape. Drag or use arrow keys to rotate.` : `第 ${day} 天山水模型，拖动或使用方向键旋转。`);
  }
  function selectDay(next, manual = false) {
    if (manual) explicitSelectionAt = window.scrollY;
    day = next;
    dayButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.journeyDay) === day)));
    stops.forEach(stop => stop.classList.toggle('is-active', Number(stop.dataset.day) === day));
    routeSection.dataset.activeDay = String(day);
    scenes().forEach(scene => scene.setJourneyDay(day));
    updateCaption();
  }
  dayButtons.forEach(button => button.addEventListener('click', () => {
    selectDay(Number(button.dataset.journeyDay), true);
    if (button.closest('.journey-stop') && innerWidth < 1000) {
      landscape.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'start' });
    }
  }));
  document.querySelector('.journey-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? 6 : ((day - 1 + (event.key === 'ArrowRight' ? 1 : 5)) % 6) + 1;
    selectDay(next, true);
    document.querySelector(`.journey-tabs [data-journey-day="${next}"]`).focus();
  });
  function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 17) return 'day';
    if (hour >= 17 && hour < 19) return 'sunset';
    return 'night';
  }

  function selectTime(time) {
    root.dataset.timeOfDay = time;
    scenes().forEach(scene => scene.setTimeOfDay(time));
  }

  // Re-check every 60s to stay in sync across time boundaries
  setInterval(() => selectTime(getTimeOfDay()), 60000);
  const routeMotion = document.querySelector('.journey-motion');
  routeMotion.addEventListener('click', () => document.querySelector('#motion-toggle').click());
  window.addEventListener('nanyang:motion', event => {
    routeMotion.setAttribute('aria-pressed', String(!event.detail.paused));
    updateScroll();
  });
  window.addEventListener('nanyang:language', updateCaption);

  function updateScroll() {
    queued = false;
    if (root.classList.contains('photo-viewer-open')) return;
    const paused = root.classList.contains('motion-paused') || (motion.matches && root.dataset.motionChoice !== 'play');
    const heroRect = heroSection.getBoundingClientRect();
    const travel = innerWidth >= 1000 ? Math.max(heroSection.offsetHeight - innerHeight, 280) : Math.max(heroSection.offsetHeight * .7, 1);
    const progress = paused ? 0 : Math.max(0, Math.min(1, -heroRect.top / travel));
    window.guilinScene?.setScrollProgress(progress);
    if (innerWidth < 1000 || paused) return;
    if (explicitSelectionAt !== null) {
      if (Math.abs(window.scrollY - explicitSelectionAt) < 30) return;
      explicitSelectionAt = null;
    }
    const bounds = routeSection.getBoundingClientRect();
    if (bounds.top > innerHeight * .8 || bounds.bottom < innerHeight * .3) return;
    const target = innerHeight * .5;
    let nearest = day;
    let distance = Infinity;
    stops.forEach(stop => {
      const rect = stop.getBoundingClientRect();
      const delta = Math.abs(rect.top + rect.height * .5 - target);
      if (delta < distance) { nearest = Number(stop.dataset.day); distance = delta; }
    });
    if (nearest !== day) selectDay(nearest);
  }
  function scheduleScroll() { if (!queued) { queued = true; requestAnimationFrame(updateScroll); } }
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  motion.addEventListener('change', scheduleScroll);
  selectTime(getTimeOfDay());
  selectDay(1);
  routeMotion.setAttribute('aria-pressed', String(!root.classList.contains('motion-paused')));
  updateScroll();
})();
