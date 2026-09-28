/* Original photography, opened at its existing local source in an accessible gallery. */
(() => {
  "use strict";

  if (typeof HTMLDialogElement === "undefined") return;
  const sources = [...document.querySelectorAll(".photo-frame, .moment-card, .easter-egg")]
    .map((card) => ({ card, image: card.querySelector("img"), heading: card.querySelector("h3") }))
    .filter((item) => item.image);
  if (!sources.length) return;

  const labels = {
    zh: { open: "查看照片", close: "关闭照片", previous: "上一张照片", next: "下一张照片", gallery: "山水之间 · 旅途相册", help: "← → 切换照片 · Esc 关闭", mobileHelp: "完整照片，慢慢看。", loading: "正在载入照片…", error: "照片暂时无法载入，请重试。", retry: "重新载入", count: (index, total) => `第 ${index} 张，共 ${total} 张`, river: "桂林漓江山水" },
    en: { open: "View photo", close: "Close photo", previous: "Previous photo", next: "Next photo", gallery: "BETWEEN THE PEAKS · TRAVEL ALBUM", help: "← → Browse photos · Esc to close", mobileHelp: "A little time to take it all in.", loading: "Loading photo…", error: "This photo could not be loaded. Please try again.", retry: "Try again", count: (index, total) => `Photo ${index} of ${total}`, river: "The Li River, Guilin" }
  };
  const text = () => labels[document.documentElement.lang.startsWith("en") ? "en" : "zh"];
  const titleFor = (item) => item.heading?.textContent.trim() || (item.card.classList.contains("photo-frame") ? text().river : item.image.alt);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const motionAllowed = () => (!reducedMotion.matches || document.documentElement.dataset.motionChoice === "play") && !document.documentElement.classList.contains("motion-paused");

  const dialog = document.createElement("dialog");
  dialog.id = "photo-viewer";
  dialog.className = "photo-viewer-dialog";
  dialog.setAttribute("aria-labelledby", "photo-viewer-title");
  dialog.innerHTML = `
    <div class="photo-viewer-shell">
      <header class="photo-viewer-header">
        <p class="photo-viewer-eyebrow"></p>
        <button type="button" class="photo-viewer-close" autofocus><span aria-hidden="true">×</span></button>
      </header>
      <div class="photo-viewer-stage">
        <div class="photo-viewer-frame">
          <img class="photo-viewer-image" alt="" decoding="async">
          <div class="photo-viewer-message" role="status" aria-live="polite"><p></p><button type="button" class="photo-viewer-retry" hidden></button></div>
        </div>
      </div>
      <footer class="photo-viewer-footer">
        <div class="photo-viewer-caption" aria-live="polite" aria-atomic="true"><p class="photo-viewer-count"></p><h2 id="photo-viewer-title"></h2></div>
        <div class="photo-viewer-navigation"><button type="button" class="photo-viewer-previous"><span aria-hidden="true">←</span></button><button type="button" class="photo-viewer-next"><span aria-hidden="true">→</span></button></div>
        <p class="photo-viewer-help"><span class="photo-viewer-keyboard-help"></span><span class="photo-viewer-touch-help"></span></p>
      </footer>
    </div>`;
  document.body.append(dialog);

  const image = dialog.querySelector(".photo-viewer-image");
  const stage = dialog.querySelector(".photo-viewer-stage");
  const frame = dialog.querySelector(".photo-viewer-frame");
  const closeButton = dialog.querySelector(".photo-viewer-close");
  const previousButton = dialog.querySelector(".photo-viewer-previous");
  const nextButton = dialog.querySelector(".photo-viewer-next");
  const retryButton = dialog.querySelector(".photo-viewer-retry");
  const message = dialog.querySelector(".photo-viewer-message");
  const heading = dialog.querySelector("#photo-viewer-title");
  const count = dialog.querySelector(".photo-viewer-count");
  let selected = 0;
  let opener = null;
  let loadTimer = 0;
  let requestId = 0;
  let pointerFrame = 0;
  let stageBounds = null;
  let scrollSnapshot = null;

  function resetTilt() {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    frame.style.setProperty("--photo-x", "0deg");
    frame.style.setProperty("--photo-y", "0deg");
  }

  function refreshLabels() {
    const copy = text();
    sources.forEach((item) => {
      item.button.querySelector(".photo-open-label").textContent = copy.open;
      item.button.setAttribute("aria-label", `${copy.open} · ${titleFor(item)}`);
      if (item.card.classList.contains("photo-frame")) item.card.setAttribute("aria-label", titleFor(item));
    });
    dialog.querySelector(".photo-viewer-eyebrow").textContent = copy.gallery;
    closeButton.setAttribute("aria-label", copy.close);
    previousButton.setAttribute("aria-label", copy.previous);
    nextButton.setAttribute("aria-label", copy.next);
    retryButton.textContent = copy.retry;
    dialog.querySelector(".photo-viewer-keyboard-help").textContent = copy.help;
    dialog.querySelector(".photo-viewer-touch-help").textContent = copy.mobileHelp;
    heading.textContent = titleFor(sources[selected]);
    image.alt = titleFor(sources[selected]);
    count.textContent = `${String(selected + 1).padStart(2, "0")} / ${String(sources.length).padStart(2, "0")}`;
    count.setAttribute("aria-label", copy.count(selected + 1, sources.length));
    message.querySelector("p").textContent = dialog.dataset.imageState === "error" ? copy.error : copy.loading;
  }

  function setImageState(state) {
    dialog.dataset.imageState = state;
    stage.setAttribute("aria-busy", String(state === "loading"));
    message.hidden = state === "ready";
    retryButton.hidden = state !== "error";
    message.querySelector("p").textContent = state === "error" ? text().error : text().loading;
  }

  function displayPhoto(index) {
    selected = (index + sources.length) % sources.length;
    const currentRequest = ++requestId;
    clearTimeout(loadTimer);
    resetTilt();
    setImageState("loading");
    dialog.dataset.photoIndex = String(selected + 1);
    refreshLabels();
    image.onload = () => {
      if (requestId !== currentRequest || !dialog.open) return;
      clearTimeout(loadTimer);
      setImageState(image.naturalWidth > 0 ? "ready" : "error");
    };
    image.onerror = () => {
      if (requestId !== currentRequest || !dialog.open) return;
      clearTimeout(loadTimer);
      setImageState("error");
    };
    // Use the exact source already present on the page; no substitute or enlarged download.
    image.src = sources[selected].image.currentSrc || sources[selected].image.src;
    loadTimer = setTimeout(() => {
      if (requestId === currentRequest && dialog.open) setImageState("error");
    }, 15000);
    if (image.complete && image.naturalWidth > 0) {
      clearTimeout(loadTimer);
      setImageState("ready");
    }
  }

  function lockScroll() {
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    scrollSnapshot = { x: scrollX, y: scrollY, body: {}, overflow: rootStyle.overflow, scrollBehavior: rootStyle.scrollBehavior };
    ["position", "top", "left", "width", "overflow"].forEach((name) => { scrollSnapshot.body[name] = bodyStyle[name]; });
    rootStyle.overflow = "hidden";
    bodyStyle.position = "fixed";
    bodyStyle.top = `${-scrollSnapshot.y}px`;
    bodyStyle.left = `${-scrollSnapshot.x}px`;
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    document.documentElement.classList.add("photo-viewer-open");
  }

  function unlockScroll() {
    if (!scrollSnapshot) return;
    const saved = scrollSnapshot;
    scrollSnapshot = null;
    Object.entries(saved.body).forEach(([name, value]) => { document.body.style[name] = value; });
    document.documentElement.style.overflow = saved.overflow;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(saved.x, saved.y);
    document.documentElement.style.scrollBehavior = saved.scrollBehavior;
    document.documentElement.classList.remove("photo-viewer-open");
  }

  function openPhoto(index, source) {
    if (dialog.open) return;
    opener = source;
    lockScroll();
    dialog.showModal();
    displayPhoto(index);
    closeButton.focus({ preventScroll: true });
  }

  sources.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-open-button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", dialog.id);
    button.innerHTML = '<span aria-hidden="true">↗</span><span class="photo-open-label"></span>';
    item.button = button;
    item.card.append(button);
    item.card.classList.add("has-photo-viewer");
    // This card has a native full-card 3D link; only its photo button opens the album.
    if (item.card.querySelector('.cave-card-link')) {
      button.addEventListener("click", (event) => { event.stopPropagation(); openPhoto(index, button); });
      return;
    }
    item.card.setAttribute("aria-haspopup", "dialog");
    item.card.setAttribute("aria-controls", dialog.id);
    if (!item.card.hasAttribute("tabindex")) item.card.tabIndex = 0;
    if (!item.card.hasAttribute("role")) item.card.setAttribute("role", "group");
    if (item.heading && !item.card.hasAttribute("aria-labelledby")) {
      if (!item.heading.id) item.heading.id = `gallery-photo-title-${index + 1}`;
      item.card.setAttribute("aria-labelledby", item.heading.id);
    }
    button.addEventListener("click", (event) => { event.stopPropagation(); openPhoto(index, button); });
    item.card.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea, video, [contenteditable]")) return;
      if (window.getSelection()?.toString().trim()) return;
      openPhoto(index, item.card);
    });
    item.card.addEventListener("keydown", (event) => {
      if (event.target !== item.card || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      openPhoto(index, item.card);
    });
  });

  closeButton.addEventListener("click", () => dialog.close());
  previousButton.addEventListener("click", () => displayPhoto(selected - 1));
  nextButton.addEventListener("click", () => displayPhoto(selected + 1));
  retryButton.addEventListener("click", () => {
    image.removeAttribute("src");
    displayPhoto(selected);
    closeButton.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      displayPhoto(selected + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
  dialog.addEventListener("close", () => {
    ++requestId;
    clearTimeout(loadTimer);
    resetTilt();
    stageBounds = null;
    unlockScroll();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });
  stage.addEventListener("pointerenter", () => { stageBounds = stage.getBoundingClientRect(); });
  stage.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || !motionAllowed() || !stageBounds || !dialog.open) return;
    const x = Math.max(-1, Math.min(1, ((event.clientX - stageBounds.left) / stageBounds.width - .5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - stageBounds.top) / stageBounds.height - .5) * 2));
    cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!motionAllowed() || !dialog.open) return;
      frame.style.setProperty("--photo-x", `${(-y * 1.4).toFixed(2)}deg`);
      frame.style.setProperty("--photo-y", `${(x * 1.8).toFixed(2)}deg`);
    });
  });
  stage.addEventListener("pointerleave", () => { stageBounds = null; resetTilt(); });
  reducedMotion.addEventListener("change", resetTilt);
  window.addEventListener("resize", () => { if (dialog.open) { stageBounds = null; resetTilt(); } }, { passive: true });
  window.addEventListener("nanyang:language", refreshLabels);
  document.addEventListener("nanyang:language", refreshLabels);
  refreshLabels();
})();
