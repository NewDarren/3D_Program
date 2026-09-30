// 3D scenes only load after entering a card, never on the marketing page.
(() => {
  const ref = new URLSearchParams(location.search).get('ref');

  const connectSceneCard = (selector, folder, labels) => {
    const link = document.querySelector(selector);
    if (!link) return;

    const url = new URL(`./${folder}/`, location.href);
    url.searchParams.set('from', 'main');
    if (ref) url.searchParams.set('ref', ref);
    link.href = url.href;

    const refresh = () => {
      const en = document.documentElement.lang.startsWith('en');
      link.setAttribute('aria-label', en ? labels.en : labels.zh);
    };
    window.addEventListener('nanyang:language', refresh);
    refresh();
  };

  connectSceneCard('#cave-dinner .cave-card-link', 'cave-dinner-demo', {
    zh: '进入溶洞红酒私人晚宴 3D 场景',
    en: 'Explore the private cave dinner in 3D',
  });
  connectSceneCard('#magpie-bar .cave-card-link', 'magpie-bar-demo', {
    zh: '进入喜鹊酒馆 Live Band 3D 场景',
    en: 'Explore the Magpie Bar Live Band in 3D',
  });
})();
