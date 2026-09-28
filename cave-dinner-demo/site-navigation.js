// Fixed same-origin return destination; never accept arbitrary return URLs.
(() => {
  const brand = document.querySelector('.brand');
  const target = new URL('../', location.href);
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) target.searchParams.set('ref', ref);
  target.hash = 'cave-dinner';
  brand.href = target.href;
  brand.setAttribute('aria-label', '返回主网页的溶洞晚宴介绍');
  brand.title = '返回行程介绍';
  document.querySelector('.brand-wordmark > span').textContent = '← 返回行程';
})();
