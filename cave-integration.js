// The complete GLB scene only loads after entering it, never on the marketing page.
(() => {
  const link = document.querySelector('.cave-card-link');
  if (!link) return;
  const url = new URL('./cave-dinner-demo/', location.href);
  url.searchParams.set('from', 'main');
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) url.searchParams.set('ref', ref);
  link.href = url.href;
  const refresh = () => {
    const en = document.documentElement.lang.startsWith('en');
    link.setAttribute('aria-label', en ? 'Explore the private cave dinner in 3D' : '进入溶洞红酒私人晚宴 3D 场景');
  };
  window.addEventListener('nanyang:language', refresh);
  refresh();
})();
