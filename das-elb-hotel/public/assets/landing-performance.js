(function () {
  var VIDEO_VARIANTS = [
    {
      id: "hero",
      matcher: /hero/i,
      mp4: "/video/hero.mp4",
      webm: "/video/hero.webm",
      poster: "/video/hero-poster.webp",
      eager: true,
      resetOnExit: false,
    },
    {
      id: "about",
      matcher: /about/i,
      mp4: "/videos/about.mp4",
      webm: "/videos/about.webm",
      poster: "/videos/about-poster.webp",
      eager: false,
      resetOnExit: true,
    },
    {
      id: "grill-show",
      matcher: /grill-show/i,
      mp4: "/video/grill-show.mp4",
      webm: "/video/grill-show.webm",
      poster: "/video/grill-show-poster.webp",
      eager: false,
      resetOnExit: true,
    },
  ];
  var GALLERY_SOURCE_SEGMENT = "/images/gallary/";
  var GALLERY_OPTIMIZED_SEGMENT = "/images/gallary/optimized/";

  var userActivatedPlayback = false;
  var visibleVideos = new Set();
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var videoObserver = null;
  var imageObserver = null;
  var roomCardRefreshTimer = 0;
  var luxuryRevealObserver = null;
  var luxuryMotionTicking = false;
  var luxuryParallaxTargets = [];

  function sourceHint(node) {
    var childSources = [];
    if (node.querySelectorAll) {
      var sourceNodes = node.querySelectorAll("source");
      for (var i = 0; i < sourceNodes.length; i++) {
        childSources.push(sourceNodes[i].src || sourceNodes[i].getAttribute("src") || "");
      }
    }
    return [
      node.currentSrc,
      node.src,
      node.getAttribute("src"),
      node.getAttribute("data-lazy-src"),
      node.getAttribute("poster"),
      node.dataset ? node.dataset.lazySrc : "",
      childSources.join(" "),
    ].join(" ");
  }

  function getVariant(video) {
    var hint = sourceHint(video);
    for (var i = 0; i < VIDEO_VARIANTS.length; i++) {
      if (VIDEO_VARIANTS[i].matcher.test(hint)) {
        return VIDEO_VARIANTS[i];
      }
    }
    return null;
  }

  function stripVideoControls(video) {
    video.controls = false;
    video.removeAttribute("controls");
    video.disablePictureInPicture = true;
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback nofullscreen");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.setAttribute("loop", "");
    video.setAttribute("autoplay", "");
    video.autoplay = true;
    video.removeAttribute("tabindex");
  }

  function sanitizeVideoSourceAttributes(video, variant) {
    var rawSrc = video.getAttribute("src");
    var lazySrc = video.getAttribute("data-lazy-src");

    if (rawSrc === "null" || rawSrc === "undefined") {
      video.removeAttribute("src");
    }
    if (lazySrc === "null" || lazySrc === "undefined") {
      video.removeAttribute("data-lazy-src");
    }

    if (
      variant &&
      !variant.eager &&
      !video.getAttribute("src") &&
      !video.getAttribute("data-lazy-src") &&
      !video.querySelector("source")
    ) {
      video.setAttribute("data-lazy-src", variant.mp4);
    }
  }

  function buildSources(video, variant) {
    if (!variant) {
      return;
    }
    if (video.dataset.sourcesReady === "1") {
      return;
    }

    video.dataset.sourcesReady = "1";
    video.dataset.managedVideo = variant.eager ? "hero" : "ambient";
    video.dataset.resetOnExit = variant.resetOnExit ? "1" : "0";

    while (video.firstChild) {
      video.removeChild(video.firstChild);
    }
    video.removeAttribute("src");

    if (variant.poster && !video.getAttribute("poster")) {
      video.setAttribute("poster", variant.poster);
    }

    var mp4Source = document.createElement("source");
    mp4Source.src = variant.mp4;
    mp4Source.type = "video/mp4";
    video.appendChild(mp4Source);

    var webmSource = document.createElement("source");
    webmSource.src = variant.webm;
    webmSource.type = "video/webm";
    video.appendChild(webmSource);
  }

  function tryPlay(video) {
    if (reducedMotion) {
      return;
    }

    var playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {
        video.dataset.autoplayBlocked = "1";
      });
    }
  }

  function pauseVideo(video) {
    try {
      video.pause();
      if (video.dataset.resetOnExit === "1") {
        video.currentTime = 0;
      }
    } catch (_error) {}
  }

  function onVideoVisible(video, variant) {
    buildSources(video, variant);
    video.preload = variant && variant.eager ? "auto" : "metadata";
    if (variant && variant.eager) {
      video.setAttribute("fetchpriority", "high");
    }
    if (!video.dataset.loadedOnce) {
      video.load();
      video.dataset.loadedOnce = "1";
    }
    visibleVideos.add(video);
    tryPlay(video);
  }

  function upgradeVideo(video) {
    if (video.dataset.lpBound === "1") {
      return;
    }

    var variant = getVariant(video);
    video.dataset.lpBound = "1";
    stripVideoControls(video);
    sanitizeVideoSourceAttributes(video, variant);
    video.dataset.managedVideo = variant && variant.eager ? "hero" : "ambient";
    video.dataset.resetOnExit = variant && variant.resetOnExit ? "1" : "0";

    if (variant && !video.getAttribute("poster")) {
      video.setAttribute("poster", variant.poster);
    }

    video.preload = variant && variant.eager ? "auto" : "metadata";
    video.addEventListener("ended", function () {
      video.currentTime = 0;
      tryPlay(video);
    });
    video.addEventListener("pause", function () {
      if (visibleVideos.has(video) && !document.hidden && !reducedMotion) {
        tryPlay(video);
      }
    });
    video.addEventListener("loadeddata", function () {
      if (visibleVideos.has(video)) {
        tryPlay(video);
      }
    });
    video.addEventListener("canplay", function () {
      if (visibleVideos.has(video)) {
        tryPlay(video);
      }
    });

    if (variant && variant.eager) {
      onVideoVisible(video, variant);
    } else if (videoObserver) {
      videoObserver.observe(video);
    } else {
      onVideoVisible(video, variant);
    }
  }

  function attachVideoObserver() {
    if (!("IntersectionObserver" in window) || videoObserver) {
      return;
    }

    videoObserver = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var video = entry.target;
          var variant = getVariant(video);
          if (entry.isIntersecting) {
            onVideoVisible(video, variant);
          } else {
            visibleVideos.delete(video);
            pauseVideo(video);
          }
        }
      },
      {
        rootMargin: "180px 0px",
        threshold: 0.2,
      },
    );
  }

  function hydrateImage(image) {
    if (image.dataset.lpImage === "1") {
      return;
    }
    image.dataset.lpImage = "1";

    if (!image.closest("#hero")) {
      maybeSwapToOptimizedGallerySource(image);
    }

    if (!image.hasAttribute("loading")) {
      image.setAttribute("loading", image.closest("#hero") ? "eager" : "lazy");
    }
    if (!image.hasAttribute("decoding")) {
      image.setAttribute("decoding", "async");
    }
    if (image.closest("#hero")) {
      image.setAttribute("fetchpriority", "high");
    } else if (!image.hasAttribute("fetchpriority")) {
      image.setAttribute("fetchpriority", "low");
    }

    if (image.naturalWidth && !image.getAttribute("width")) {
      image.setAttribute("width", String(image.naturalWidth));
      image.setAttribute("height", String(image.naturalHeight));
    }

    if (image.complete) {
      image.classList.add("loaded");
    } else {
      image.addEventListener(
        "load",
        function () {
          image.classList.add("loaded");
          if (image.naturalWidth && !image.getAttribute("width")) {
            image.setAttribute("width", String(image.naturalWidth));
            image.setAttribute("height", String(image.naturalHeight));
          }
        },
        { once: true },
      );
    }
  }

  function maybeSwapToOptimizedGallerySource(image) {
    if (image.dataset.optimizedSwapDone === "1") {
      return;
    }

    var currentSrc = image.getAttribute("src") || "";
    if (!currentSrc || currentSrc.indexOf(GALLERY_SOURCE_SEGMENT) === -1 || currentSrc.indexOf(GALLERY_OPTIMIZED_SEGMENT) !== -1) {
      image.dataset.optimizedSwapDone = "1";
      return;
    }

    var optimizedSrc = currentSrc.replace(GALLERY_SOURCE_SEGMENT, GALLERY_OPTIMIZED_SEGMENT);
    image.dataset.optimizedSwapDone = "1";
    image.dataset.originalSrc = currentSrc;
    image.dataset.optimizedSrc = optimizedSrc;

    image.addEventListener(
      "error",
      function onOptimizedError() {
        if (image.dataset.originalSrc && image.currentSrc !== image.dataset.originalSrc) {
          image.src = image.dataset.originalSrc;
        }
      },
      { once: true },
    );

    if (!image.complete || image.getAttribute("loading") === "lazy") {
      image.src = optimizedSrc;
    }
  }

  function attachImageObserver() {
    if (!("IntersectionObserver" in window) || imageObserver) {
      return;
    }
    imageObserver = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) {
            continue;
          }
          hydrateImage(entries[i].target);
          imageObserver.unobserve(entries[i].target);
        }
      },
      {
        rootMargin: "200px 0px",
        threshold: 0.01,
      },
    );
  }

  function upgradeImages(root) {
    var images = (root.querySelectorAll ? root : document).querySelectorAll("img");
    for (var i = 0; i < images.length; i++) {
      var image = images[i];
      if (image.closest("#hero") || image.getAttribute("fetchpriority") === "high") {
        hydrateImage(image);
        continue;
      }
      if (imageObserver) {
        imageObserver.observe(image);
      } else {
        hydrateImage(image);
      }
    }
  }

  function upgradeVideos(root) {
    var videos = (root.querySelectorAll ? root : document).querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) {
      upgradeVideo(videos[i]);
    }
  }

  function retryBlockedVideos() {
    visibleVideos.forEach(function (video) {
      if (video.dataset.autoplayBlocked === "1") {
        delete video.dataset.autoplayBlocked;
        tryPlay(video);
      }
    });
  }

  function bindUserActivationFallback() {
    var activate = function () {
      if (userActivatedPlayback) {
        return;
      }
      userActivatedPlayback = true;
      retryBlockedVideos();
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("touchstart", activate, true);
      window.removeEventListener("keydown", activate, true);
    };

    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("touchstart", activate, true);
    window.addEventListener("keydown", activate, true);
  }

  function bindVisibilityHandling() {
    document.addEventListener("visibilitychange", function () {
      visibleVideos.forEach(function (video) {
        if (document.hidden) {
          video.pause();
        } else {
          tryPlay(video);
        }
      });
    });
  }

  function isDesktopRoomInteraction() {
    if (window.innerWidth < 1024) {
      return false;
    }
    if (!window.matchMedia) {
      return true;
    }
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function getExpandedRoomPanel(card) {
    return (
      card.querySelector(".relative.z-10.p-6.md\\:p-7.flex.flex-col.h-full") ||
      card.querySelector(".relative.z-10.p-6.flex.flex-col.h-full") ||
      card.querySelector(".relative.z-10.flex.flex-col.h-full")
    );
  }

  function syncRoomCardStates() {
    var cards = document.querySelectorAll("#rooms-view [data-room-card]");
    if (!cards.length) {
      return;
    }

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var panels = card.querySelectorAll(".absolute.inset-0.flex.flex-col, .relative.z-10.flex.flex-col, [class*='flex-col'][class*='h-full']");
      for (var panelIndex = 0; panelIndex < panels.length; panelIndex++) {
        panels[panelIndex].setAttribute("data-room-panel", "1");
      }

      var titles = card.querySelectorAll("h3, .card-title");
      for (var titleIndex = 0; titleIndex < titles.length; titleIndex++) {
        titles[titleIndex].setAttribute("data-room-title", "1");
      }

      var subtitles = card.querySelectorAll(".card-subtitle, p[class*='tracking'], p[class*='uppercase']");
      for (var subtitleIndex = 0; subtitleIndex < subtitles.length; subtitleIndex++) {
        subtitles[subtitleIndex].setAttribute("data-room-subtitle", "1");
      }

      var prices = card.querySelectorAll(".card-price");
      for (var priceIndex = 0; priceIndex < prices.length; priceIndex++) {
        prices[priceIndex].setAttribute("data-room-price", "1");
      }

      var chips = card.querySelectorAll("span[class*='rounded'], span[class*='tracking']");
      for (var chipIndex = 0; chipIndex < chips.length; chipIndex++) {
        chips[chipIndex].setAttribute("data-room-chip", "1");
      }

      var buttons = card.querySelectorAll("button, a, [role='button']");
      for (var buttonIndex = 0; buttonIndex < buttons.length; buttonIndex++) {
        var button = buttons[buttonIndex];
        if (/buch|mehr|details|ansehen|jetzt/i.test((button.textContent || "").trim())) {
          button.setAttribute("data-room-cta", "1");
        }
      }

      var expandedPanel = getExpandedRoomPanel(card);
      var state = expandedPanel ? "expanded" : "preview";
      card.dataset.roomState = state;
      card.setAttribute("aria-expanded", state === "expanded" ? "true" : "false");
    }
  }

  function queueRoomCardStateSync() {
    window.clearTimeout(roomCardRefreshTimer);
    roomCardRefreshTimer = window.setTimeout(syncRoomCardStates, 60);
    window.setTimeout(syncRoomCardStates, 220);
  }

  function activateRoomCard(card) {
    if (!card || card.dataset.roomState === "expanded") {
      return;
    }

    card.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    queueRoomCardStateSync();
  }

  function bindRoomCardInteractions() {
    var cards = document.querySelectorAll("#rooms-view [data-room-card]");
    if (!cards.length) {
      return;
    }

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];

      if (card.dataset.roomInteractiveBound === "1") {
        continue;
      }

      card.dataset.roomInteractiveBound = "1";

      card.addEventListener("mouseenter", function (event) {
        if (!isDesktopRoomInteraction()) {
          return;
        }
        activateRoomCard(event.currentTarget);
      });

      card.addEventListener("focus", function (event) {
        if (!isDesktopRoomInteraction()) {
          return;
        }
        activateRoomCard(event.currentTarget);
      });
    }
  }

  function retargetTagungenCta() {
    var section = document.getElementById("tagungen");
    if (!section) {
      return;
    }

    var cta = section.querySelector(".mt-10 a[href*='restaurant-view']");
    if (!cta) {
      return;
    }

    var targetHref = "/tagungen.html";
    cta.setAttribute("href", targetHref);

    var labelHost = cta.querySelector("span") || cta;
    var textUpdated = false;
    for (var i = 0; i < labelHost.childNodes.length; i++) {
      var node = labelHost.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE && (node.textContent || "").trim()) {
        node.textContent = "Tagung anfragen";
        textUpdated = true;
        break;
      }
    }

    if (!textUpdated) {
      labelHost.insertBefore(document.createTextNode("Tagung anfragen"), labelHost.firstChild);
    }

    if (cta.dataset.tagungenCtaBound === "1") {
      return;
    }

    cta.dataset.tagungenCtaBound = "1";
    cta.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        window.location.href = targetHref;
      },
      true,
    );
  }

  function stabilizeManagedVideos() {
    var videos = document.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) {
      var video = videos[i];
      var variant = getVariant(video);
      if (!variant) {
        continue;
      }
      stripVideoControls(video);
      sanitizeVideoSourceAttributes(video, variant);
      video.dataset.managedVideo = variant.eager ? "hero" : "ambient";
      video.dataset.resetOnExit = variant.resetOnExit ? "1" : "0";
      if (variant.eager) {
        tryPlay(video);
        continue;
      }
      var rect = video.getBoundingClientRect();
      var isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (isVisible) {
        onVideoVisible(video, variant);
      }
    }
  }

  function ensureLuxuryRevealObserver() {
    if (luxuryRevealObserver || !("IntersectionObserver" in window)) {
      return;
    }

    luxuryRevealObserver = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (!entry.isIntersecting) {
            continue;
          }
          entry.target.classList.add("luxury-visible");
          luxuryRevealObserver.unobserve(entry.target);
        }
      },
      {
        threshold: 0.2,
        rootMargin: "0px 0px -8% 0px",
      },
    );
  }

  function markLuxuryReveal(node, index, kind) {
    if (!node || node.nodeType !== 1) {
      return;
    }

    ensureLuxuryRevealObserver();

    if (node.dataset.luxuryRevealBound !== "1") {
      node.dataset.luxuryRevealBound = "1";
      node.setAttribute("data-luxury-reveal", kind || "fade-up");
    }

    if (kind) {
      node.dataset.luxuryKind = kind;
    }

    node.style.setProperty("--luxury-delay", String((index || 0) * 0.12) + "s");
    if (luxuryRevealObserver) {
      luxuryRevealObserver.observe(node);
    } else {
      node.classList.add("luxury-visible");
    }
  }

  function pushUnique(targets, element) {
    if (!element || element.nodeType !== 1) {
      return;
    }
    if (targets.indexOf(element) === -1) {
      targets.push(element);
    }
  }

  function isVisibleCandidate(element) {
    if (!element || !element.getBoundingClientRect) {
      return false;
    }
    var style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function enhanceHeroMotion() {
    var hero = document.getElementById("hero");
    if (!hero) {
      return;
    }

    hero.classList.add("luxury-hero-ready");

    var heroTargets = [];
    var preferredTargets = hero.querySelectorAll("[data-hero-text], h1, p, a[data-interactive], button[data-interactive], .gold-glow-btn");
    for (var i = 0; i < preferredTargets.length; i++) {
      if (isVisibleCandidate(preferredTargets[i])) {
        pushUnique(heroTargets, preferredTargets[i]);
      }
    }

    for (var targetIndex = 0; targetIndex < heroTargets.length; targetIndex++) {
      heroTargets[targetIndex].classList.add("luxury-hero-text");
      markLuxuryReveal(heroTargets[targetIndex], targetIndex, "hero");
    }

    var heroMedia = hero.querySelector("video, img");
    if (heroMedia) {
      heroMedia.classList.add("luxury-hero-media");
      markLuxuryReveal(heroMedia, 0, "hero-media");
      if (!heroMedia.dataset.luxuryParallax) {
        heroMedia.dataset.luxuryParallax = "0.08";
      }
    }

    var scrollCue = hero.querySelector("a[href='#rooms-view']");
    if (scrollCue) {
      scrollCue.setAttribute("data-luxury-float", "1");
    }
  }

  function enhanceSectionMotion() {
    ensureLuxuryRevealObserver();

    var sections = document.querySelectorAll("main section[id]");
    for (var sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      var section = sections[sectionIndex];
      if (!section || section.id === "hero") {
        continue;
      }

      section.classList.add("luxury-section");
      section.dataset.luxurySectionBound = "1";

      var targets = [];
      var selectors = [
        "h2",
        "h3",
        "p",
        "[data-room-card]",
        "[data-tag-card]",
        "[data-event-card]",
        "[data-location-card]",
        "[data-stat-item]",
        "[data-interactive]",
        "img",
        "video",
        ".rounded-2xl",
        ".rounded-3xl",
      ];

      for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
        var nodes = section.querySelectorAll(selectors[selectorIndex]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          var node = nodes[nodeIndex];
          if (!isVisibleCandidate(node)) {
            continue;
          }
          if (node.closest("#footer")) {
            continue;
          }
          pushUnique(targets, node);
        }
      }

      var limit = Math.min(targets.length, 14);
      for (var targetIndex = 0; targetIndex < limit; targetIndex++) {
        var target = targets[targetIndex];
        var kind = "fade-up";
        if (target.matches("h2, h3, .font-serif")) {
          target.classList.add("luxury-heading");
          kind = "heading";
        } else if (target.matches("[data-grill-featured], video")) {
          kind = "cinematic";
        } else if (target.matches("[data-room-card], [data-tag-card], [data-event-card], [data-location-card], .rounded-2xl, .rounded-3xl")) {
          kind = "card";
        }
        markLuxuryReveal(target, targetIndex, kind);
      }
    }
  }

  function registerLuxuryParallaxTargets() {
    luxuryParallaxTargets = [];
    var candidates = document.querySelectorAll("[data-luxury-parallax], #hero video, #hero img, #events [data-grill-featured], [data-about-image]");
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      var factor = Number.parseFloat(node.dataset.luxuryParallax || (node.closest("#hero") ? "0.08" : "0.04"));
      luxuryParallaxTargets.push({
        node: node,
        factor: Number.isFinite(factor) ? factor : 0.04,
      });
    }
  }

  function updateLuxuryParallax() {
    luxuryMotionTicking = false;
    if (reducedMotion) {
      return;
    }

    var viewportHeight = window.innerHeight || 1;
    for (var i = 0; i < luxuryParallaxTargets.length; i++) {
      var item = luxuryParallaxTargets[i];
      if (!item.node || !item.node.isConnected) {
        continue;
      }
      var rect = item.node.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewportHeight) {
        continue;
      }
      var offset = (rect.top - viewportHeight * 0.5) * item.factor * -0.1;
      item.node.style.setProperty("--luxury-parallax-y", offset.toFixed(2) + "px");
    }
  }

  function requestLuxuryParallaxUpdate() {
    if (luxuryMotionTicking) {
      return;
    }
    luxuryMotionTicking = true;
    window.requestAnimationFrame(updateLuxuryParallax);
  }

  function bindLuxuryParallax() {
    if (document.documentElement.dataset.luxuryParallaxBound === "1") {
      registerLuxuryParallaxTargets();
      updateLuxuryParallax();
      return;
    }

    document.documentElement.dataset.luxuryParallaxBound = "1";
    registerLuxuryParallaxTargets();
    updateLuxuryParallax();
    window.addEventListener("scroll", requestLuxuryParallaxUpdate, { passive: true });
    window.addEventListener("resize", requestLuxuryParallaxUpdate, { passive: true });
  }

  function getLuxurySocialMarkup() {
    var icons = {
      tiktok:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 3.2c.7 1.8 2.2 3.2 4 3.8v2.8c-1.5-.1-2.9-.6-4-1.5v6.4c0 3-2.4 5.3-5.5 5.3S4 17.8 4 14.8 6.4 9.5 9.3 9.5c.4 0 .8 0 1.2.1v2.9c-.4-.2-.8-.2-1.2-.2-1.4 0-2.4 1-2.4 2.5s1 2.5 2.4 2.5 2.5-1 2.5-2.5V2h3z" fill="currentColor"/></svg>',
      instagram:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4zm9.75 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill="currentColor"/></svg>',
      youtube:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.2 7.2a2.7 2.7 0 0 0-1.9-1.9C17.5 5 12 5 12 5s-5.5 0-7.3.3A2.7 2.7 0 0 0 2.8 7.2C2.5 9 2.5 12 2.5 12s0 3 .3 4.8a2.7 2.7 0 0 0 1.9 1.9C6.5 19 12 19 12 19s5.5 0 7.3-.3a2.7 2.7 0 0 0 1.9-1.9c.3-1.8.3-4.8.3-4.8s0-3-.3-4.8zM10 15.2V8.8l5.2 3.2z" fill="currentColor"/></svg>',
    };

    var items = [
      {
        label: "TikTok",
        kind: "tiktok",
        placeholder: true,
      },
      {
        label: "Instagram",
        kind: "instagram",
        href: "https://www.instagram.com/das_elb_hotel/",
      },
      {
        label: "YouTube",
        kind: "youtube",
        placeholder: true,
      },
    ];

    var markup = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var icon = icons[item.kind];
      if (item.placeholder) {
        markup.push(
          '<button type="button" class="luxury-footer__social" data-luxury-float="1" data-social-placeholder="1" aria-label="' +
            item.label +
            '">' +
            icon +
            "</button>",
        );
      } else {
        markup.push(
          '<a class="luxury-footer__social" data-luxury-float="1" aria-label="' +
            item.label +
            '" href="' +
            item.href +
            '" target="_blank" rel="noopener noreferrer">' +
            icon +
            "</a>",
        );
      }
    }

    return markup.join("");
  }

  function rebuildLuxuryFooter() {
    var footer = document.getElementById("footer");
    if (!footer || footer.dataset.luxuryFooter === "1") {
      return;
    }

    footer.dataset.luxuryFooter = "1";
    footer.className = "luxury-footer";
    footer.innerHTML = [
      '<div class="luxury-footer__divider" aria-hidden="true"></div>',
      '<div class="luxury-footer__grain" aria-hidden="true"></div>',
      '<div class="luxury-footer__shell">',
      '  <div class="luxury-footer__brand-panel" data-footer-col="brand">',
      '    <p class="luxury-footer__eyebrow" data-luxury-float="1">Singh Laly präsentiert</p>',
      '    <h2 class="luxury-footer__hero">LALY DER REISKÖNIG</h2>',
      '    <p class="luxury-footer__lede">Ein Haus voller Gewürze, Ruhe und Gastgeberkultur: warmes Licht, präzise Aromen und ein Abendgefühl, das noch lange nach dem letzten Gang bleibt.</p>',
      '    <button type="button" class="luxury-footer__backtop" data-back-to-top="1" data-luxury-float="1" aria-label="Zurück nach oben">',
      '      <span class="luxury-footer__backtop-icon">↑</span>',
      '      <span>Nach oben</span>',
      "    </button>",
      "  </div>",
      '  <div class="luxury-footer__grid">',
      '    <section class="luxury-footer__col" data-footer-col="nav">',
      '      <p class="luxury-footer__label">Navigation</p>',
      '      <a href="#hero">Start</a>',
      '      <a href="#restaurant-view">Kulinarik</a>',
      '      <a href="#events">Events</a>',
      '      <a href="#kontakt">Kontakt</a>',
      "    </section>",
      '    <section class="luxury-footer__col" data-footer-col="contact">',
      '      <p class="luxury-footer__label">Kontakt</p>',
      '      <p>Seilerweg 19<br>39114 Magdeburg</p>',
      '      <a href="tel:+4939175632660">+49 391 756 326 60</a>',
      '      <a href="mailto:rezeption@das-elb.de">rezeption@das-elb.de</a>',
      "    </section>",
      '    <section class="luxury-footer__col" data-footer-col="social">',
      '      <p class="luxury-footer__label">Social Media</p>',
      '      <div class="luxury-footer__social-row">' + getLuxurySocialMarkup() + "</div>",
      '      <p class="luxury-footer__muted">TikTok und YouTube können bei Bedarf direkt mit den finalen Kanälen verknüpft werden.</p>',
      "    </section>",
      '    <section class="luxury-footer__col" data-footer-col="hours">',
      '      <p class="luxury-footer__label">Öffnungszeiten</p>',
      '      <div class="luxury-footer__hours">',
      '        <span>Rezeption</span><strong>07:00 - 21:30</strong>',
      '        <span>Check-in</span><strong>ab 13:00</strong>',
      '        <span>Check-out</span><strong>bis 11:00</strong>',
      "      </div>",
      "    </section>",
      "  </div>",
      '  <div class="luxury-footer__bottom">',
      '    <p>&copy; <span data-current-year="1"></span> Singh Laly im Das ELB. Alle Rechte vorbehalten.</p>',
      '    <div class="luxury-footer__legal">',
      '      <a href="/impressum">Impressum</a>',
      '      <a href="/impressum?tab=datenschutz">Datenschutz</a>',
      '      <a href="/impressum?tab=agb">AGB</a>',
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");

    var year = footer.querySelector("[data-current-year='1']");
    if (year) {
      year.textContent = String(new Date().getFullYear());
    }

    var backToTop = footer.querySelector("[data-back-to-top='1']");
    if (backToTop && backToTop.dataset.backtopBound !== "1") {
      backToTop.dataset.backtopBound = "1";
      backToTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    var placeholders = footer.querySelectorAll("[data-social-placeholder='1']");
    for (var i = 0; i < placeholders.length; i++) {
      placeholders[i].addEventListener("click", function () {
        var contact = document.getElementById("kontakt");
        if (contact) {
          contact.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    enhanceFooterMotion(footer);
  }

  function enhanceFooterMotion(footer) {
    if (!footer) {
      footer = document.getElementById("footer");
    }
    if (!footer) {
      return;
    }

    footer.classList.add("luxury-footer-ready");
    var footerTargets = footer.querySelectorAll(
      ".luxury-footer__eyebrow, .luxury-footer__hero, .luxury-footer__lede, .luxury-footer__col, .luxury-footer__bottom, .luxury-footer__social, .luxury-footer__backtop",
    );

    for (var i = 0; i < footerTargets.length; i++) {
      var kind = "footer";
      if (footerTargets[i].classList.contains("luxury-footer__social")) {
        kind = "footer-pop";
      } else if (footerTargets[i].classList.contains("luxury-footer__hero")) {
        kind = "heading";
      }
      markLuxuryReveal(footerTargets[i], i, kind);
    }
  }

  function upgradeLuxuryMotionSystem() {
    document.documentElement.classList.add("luxury-motion-ready");
    enhanceHeroMotion();
    enhanceSectionMotion();
    rebuildLuxuryFooter();
    enhanceFooterMotion();
    bindLuxuryParallax();
  }

  function init() {
    attachVideoObserver();
    attachImageObserver();
    upgradeVideos(document);
    upgradeImages(document);
    bindUserActivationFallback();
    bindVisibilityHandling();
    stabilizeManagedVideos();
    syncRoomCardStates();
    bindRoomCardInteractions();
    retargetTagungenCta();
    upgradeLuxuryMotionSystem();
    window.addEventListener("load", stabilizeManagedVideos, { once: true });
    window.addEventListener("load", syncRoomCardStates, { once: true });
    window.addEventListener("load", retargetTagungenCta, { once: true });
    window.addEventListener("load", upgradeLuxuryMotionSystem, { once: true });
    window.addEventListener("resize", queueRoomCardStateSync, { passive: true });
    window.setTimeout(stabilizeManagedVideos, 400);
    window.setTimeout(stabilizeManagedVideos, 1600);
    window.setTimeout(stabilizeManagedVideos, 3200);
    window.setTimeout(syncRoomCardStates, 500);
    window.setTimeout(syncRoomCardStates, 1400);
    window.setTimeout(retargetTagungenCta, 600);
    window.setTimeout(upgradeLuxuryMotionSystem, 700);

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        for (var j = 0; j < mutations[i].addedNodes.length; j++) {
          var node = mutations[i].addedNodes[j];
          if (node.nodeType !== 1) {
            continue;
          }
          upgradeVideos(node);
          upgradeImages(node);
        }
      }
      stabilizeManagedVideos();
      bindRoomCardInteractions();
      queueRoomCardStateSync();
      retargetTagungenCta();
      upgradeLuxuryMotionSystem();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
