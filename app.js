const translations = {
  en: {
    navMoments: "Moments", navRoute: "Journey", navPrice: "Invitation",
    heroEyebrow: "NANYANG JOURNEY COMMUNITY",
    heroMeta: "Guilin · Yangshuo 6 Days 5 Nights · Curated Journey",
    heroLine: "Don't just visit Guilin.<br><strong>Live it as a memory.</strong>",
    heroDescription: "The Li River, cloud-high peaks, an illuminated dragon parade, a private cave dinner and live music after dark. This time, we slow down and truly feel Guilin.",
    heroPrimary: "See what makes it special", heroSecondary: "Watch Guilin in 1 minute",
    factDays: "Unhurried days", factNights: "Curated nights", factMoments: "Lasting moments",
    sceneHelp: "Drag to rotate · Arrow keys to explore", sceneCaption: "A landscape in the palm of your hand.",
    sceneFallback: "Guilin landscape · Still view", sceneReset: "Reset view", motionPause: "Pause motion", motionPlay: "Play motion",
    timeDay: "Daylight", timeSunset: "Sunset", timeNight: "Night",
    sceneEnter: "Scroll into the landscape.",
    journeyHelp: "Scroll through six days or select a day. An artistic landscape, not a geographic map.",
    exploreDay: "Explore this day",
    whyTitle: "Why should everyone<br>see Guilin once?",
    whyLead: "Mountains in water.<br>People inside a painting.",
    whyBody: "Guilin's magic lies in the karst peaks that follow you from the Li River to Yangshuo and Ruyi Peak — layer after layer of mountains, water and life.",
    natureMountain: "Peaks", natureMountainCopy: "Karst formations", natureWater: "Water", natureWaterCopy: "The Li River", natureLife: "Life", natureLifeCopy: "Slow Yangshuo days",
    differenceTitle: "Getting to Guilin is easy.<br><span>Making it worthwhile is the art.</span>",
    differenceQuote: "Places fade.<br>Moments stay.",
    differenceBody: "We are not designing another bus—attraction—photo—bus tour. What matters is one unforgettable moment every day — the kind you still talk about years later.",
    momentsTitle: "6 included experiences<br><span>6 lasting moments</span>",
    momentsBody: "Not six more things, but six more memories worth bringing home.", totalValue: "TOTAL VALUE",
    giftPhoto: "Professional trip photography", giftPhotoCopy: "2–3 photographers travel with the group to capture the joy between friends, couples and families.",
    giftPicnic: "Riverside picnic", giftPicnicCopy: "A close encounter with nature and permission to truly slow down.",
    giftDinner: "Private cave wine dinner", giftDinnerCopy: "Ancient cave, candlelight and wine — a dinner with a sense of occasion.",
    giftBand: "Magpie Bar Live Band", giftBandCopy: "Mountains by day, songs and a drink after dark.",
    giftTea: "Terrace afternoon tea", giftTeaCopy: "An unhurried afternoon tucked between the fields.",
    giftDragon: "Illuminated dragon night cruise", giftDragonCopy: "Light, a dragon procession and the night landscape of Guilin.",
    eggTitle: "Secret extra | Ten-Mile Gallery ride", eggBody: "This experience is on top of the RM750 bundle. In Yangshuo, we don't just pass the landscape — we ride into it.",
    filmTitle: "Turn up the sound.<br>Feel Guilin in 1 minute.", filmCopy: "A landscape to see slowly — and listen to closely.", filmLabel: "60 seconds of Guilin · with sound",
    routeTitle: "Follow the Li River.<br>Turn six days into a painting.", routeCopy: "We keep the Guilin classics, but give each day one clear, unforgettable highlight.",
    day1Title: "Arrival & first impressions", day1Copy: "Airport pick-up · Hotel · Two Rivers and Four Lakes",
    day2Title: "Yangshuo countryside", day2Copy: "Yuanbao Rock · Afternoon tea · Dragon night cruise",
    day3Title: "Ruyi Peak & nightlife", day3Copy: "Cable car · Mountain walk · Live Band",
    day4Title: "Icons & cave dinner", day4Copy: "Elephant Hill · Old lanes · Private cave dinner",
    day5Title: "The soul of the Li River", day5Copy: "Bamboo raft · Gudong Waterfall · Photography",
    day6Title: "Tea & farewell", day6Copy: "Cultural experience · Airport transfer",
    valueTitle: "6 unforgettable moments.<br><span>Already inside your journey.</span>",
    priceTitle: "Now that you've seen it,<br>here is the price.", priceCopy: "You were invited by a Nanyang Journey member, so you receive our private friends-and-family rate.",
    marketPrice: "Comparable market package", originalPrice: "Nanyang Journey regular rate", memberPrice: "MEMBER FRIEND RATE",
    whatsappCta: "Check availability on WhatsApp", advisor: "Your journey advisor",
    proofTitle: "Nanyang travellers<br>just returned from Yunnan.", proofCopy: "A journey can sound beautiful on paper. What matters is that real people departed together, lived it together and came home with stories.", proofLabel: "Full Yunnan travel story",
    faqTitle: "You may be wondering", faq1q: "Does RM1,399 include flights?", faq1a: "International flights are not included. The price covers the local itinerary, accommodation, transport, selected meals and all six listed experiences.",
    faq2q: "Why do I receive the RM1,399 rate?", faq2a: "This is the private friends-and-family invitation rate. You entered through a member's personal link, so this benefit applies to you.",
    faq3q: "Are all six experiences included?", faq3a: "Yes. All six listed moments are included, while the Ten-Mile Gallery ride is an extra surprise.",
    faq4q: "How do I book?", faq4a: "Tap the WhatsApp button. Your referring member is included automatically, and an advisor will help confirm dates and availability.",
    closingTitle: "Some places shouldn't stay<br>on your <span>“one day” list.</span>", closingCopy: "Nanyang Guilin · Yangshuo 6 Days 5 Nights<br>RM1,399 member friend rate · International flights excluded", closingCta: "Book on WhatsApp",
    stickyLabel: "MEMBER FRIEND RATE", stickyCta: "WhatsApp booking"
  }
};

const zhFallback = new Map();
document.querySelectorAll("[data-i18n]").forEach((el) => zhFallback.set(el.dataset.i18n, el.innerHTML));

const langButtons = [...document.querySelectorAll(".lang-btn")];
let language = "zh";

function setLanguage(next) {
  language = next === "en" ? "en" : "zh";
  document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
  document.body.dataset.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.innerHTML = language === "en" ? (translations.en[key] || zhFallback.get(key) || "") : (zhFallback.get(key) || "");
  });
  langButtons.forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateWhatsAppLinks();
  const sceneCanvas = document.querySelector("#guilin-3d");
  if (sceneCanvas) sceneCanvas.setAttribute("aria-label", language === "en" ? "Interactive 3D Guilin landscape. Drag or use arrow keys to rotate." : "可旋转的桂林山水三维模型，拖动或使用方向键探索。");
  try { localStorage.setItem("nanyang-language", language); } catch (_) {}
  window.dispatchEvent(new CustomEvent("nanyang:language", { detail: { language } }));
}

langButtons.forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.lang)));

const params = new URLSearchParams(location.search);
const refCode = params.get("ref") || "limshimin";
const knownReferrers = { limshimin: "LIM SHI MIN" };
const referrer = knownReferrers[refCode.toLowerCase()] || refCode.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
document.querySelectorAll("[data-referrer]").forEach((node) => { node.textContent = referrer; });

function updateWhatsAppLinks() {
  const textZh = `你好，我是通过 ${referrer} 的专属链接看到《南洋沐漓·桂林阳朔6天5晚》的。\n我想了解 RM1,399 会员朋友专享价。\n\n姓名：\n人数：\n推荐会员：${referrer}\n\n请问还有名额吗？`;
  const textEn = `Hi, I found the Nanyang Guilin & Yangshuo 6D5N journey through ${referrer}'s invitation link.\nI would like to know more about the RM1,399 member friend rate.\n\nName:\nNumber of travellers:\nReferring member: ${referrer}\n\nIs there still availability?`;
  const url = `https://wa.me/60127509024?text=${encodeURIComponent(language === "en" ? textEn : textZh)}`;
  document.querySelectorAll(".whatsapp-link").forEach((link) => { link.href = url; });
}

try {
  const preferred = localStorage.getItem("nanyang-language");
  if (preferred === "en") setLanguage("en"); else updateWhatsAppLinks();
} catch (_) { updateWhatsAppLinks(); }

const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionPreference.matches;
const coarsePointer = matchMedia("(pointer: coarse)").matches;
const hero = document.querySelector(".hero");
const topbar = document.querySelector(".topbar");
const sticky = document.querySelector(".sticky-cta");
const motionIsPaused = () => document.documentElement.classList.contains("motion-paused") || (reducedMotion && document.documentElement.dataset.motionChoice !== "play");
motionPreference.addEventListener("change", (event) => {
  reducedMotion = event.matches;
  document.querySelectorAll("[data-tilt], [data-depth-card]").forEach((card) => {
    card.style.setProperty("--rx", 0);
    card.style.setProperty("--ry", 0);
  });
  updateScrollEffects();
});

let framePending = false;
function updateScrollEffects() {
  framePending = false;
  const y = window.scrollY;
  const heroProgress = Math.min(1, y / Math.max(hero.offsetHeight, 1));
  hero.style.setProperty("--scroll", motionIsPaused() ? "0" : heroProgress.toFixed(3));
  const pageLength = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty("--reading", pageLength > 0 ? Math.max(0, Math.min(1, y / pageLength)).toFixed(4) : "0");
  topbar.classList.toggle("is-scrolled", y > 60);
  sticky.classList.toggle("is-visible", y > hero.offsetHeight * .7 && y < document.documentElement.scrollHeight - innerHeight * 1.05);
  updateRouteBoat();
}

addEventListener("scroll", () => {
  if (!framePending) { framePending = true; requestAnimationFrame(updateScrollEffects); }
}, { passive: true });

if (!coarsePointer) {
  hero.addEventListener("pointermove", (event) => {
    if (motionIsPaused()) return;
    const x = event.clientX / innerWidth - .5;
    const y = event.clientY / innerHeight - .5;
    hero.style.setProperty("--mx", x.toFixed(3));
    hero.style.setProperty("--my", y.toFixed(3));
  });
  hero.addEventListener("pointerleave", () => {
    hero.style.setProperty("--mx", 0);
    hero.style.setProperty("--my", 0);
  });
}

document.querySelectorAll(".moment-card").forEach((card) => {
  const media = document.createElement("div");
  media.className = "moment-card-media";
  card.prepend(media);
  media.append(card.querySelector("img"), card.querySelector(".card-shade"));
  card.tabIndex = 0;
  card.setAttribute("role", "group");
  const title = card.querySelector("h3");
  title.id = `moment-${title.dataset.i18n}`;
  card.setAttribute("aria-labelledby", title.id);
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  });
}, { rootMargin: "0px 0px -10%", threshold: .1 });
document.querySelectorAll(".reveal").forEach((node, index) => {
  node.style.transitionDelay = `${Math.min(index % 3, 2) * 70}ms`;
  observer.observe(node);
});

if (!coarsePointer) {
  document.querySelectorAll("[data-tilt], [data-depth-card]").forEach((card) => {
    let bounds;
    let tiltFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    card.addEventListener("pointerenter", () => { bounds = card.getBoundingClientRect(); });
    card.addEventListener("pointermove", (event) => {
      if (motionIsPaused() || !bounds) return;
      pointerX = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
      pointerY = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
      if (tiltFrame) return;
      tiltFrame = requestAnimationFrame(() => {
        tiltFrame = 0;
        if (motionIsPaused()) return;
        card.style.setProperty("--rx", pointerX.toFixed(3));
        card.style.setProperty("--ry", pointerY.toFixed(3));
      });
    });
    card.addEventListener("pointerleave", () => {
      cancelAnimationFrame(tiltFrame);
      tiltFrame = 0;
      bounds = null;
      card.style.setProperty("--rx", 0); card.style.setProperty("--ry", 0);
    });
  });
}

document.querySelectorAll(".faq-item button").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    const open = !item.classList.contains("is-open");
    document.querySelectorAll(".faq-item").forEach((other) => {
      other.classList.remove("is-open");
      other.querySelector("button").setAttribute("aria-expanded", "false");
      other.querySelector(".faq-answer").setAttribute("aria-hidden", "true");
    });
    item.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    item.querySelector(".faq-answer").setAttribute("aria-hidden", String(!open));
  });
});

const routeMap = document.querySelector("#route-map");
const journeyPath = document.querySelector("#journeyPath");
const routeBoat = document.querySelector("#routeBoat");
const journeyLength = journeyPath ? journeyPath.getTotalLength() : 0;
function updateRouteBoat() {
  if (!routeMap || !journeyPath || !routeBoat || innerWidth <= 900) return;
  const rect = routeMap.getBoundingClientRect();
  const progress = motionIsPaused() ? .45 : Math.max(0, Math.min(1, (innerHeight * .72 - rect.top) / (rect.height * .95)));
  const length = journeyLength;
  const point = journeyPath.getPointAtLength(length * progress);
  const next = journeyPath.getPointAtLength(Math.min(length, length * progress + 2));
  const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
  routeBoat.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
}

addEventListener("resize", updateScrollEffects, { passive: true });
updateScrollEffects();
