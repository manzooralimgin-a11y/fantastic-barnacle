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
    window.addEventListener("load", stabilizeManagedVideos, { once: true });
    window.addEventListener("load", syncRoomCardStates, { once: true });
    window.addEventListener("resize", queueRoomCardStateSync, { passive: true });
    window.setTimeout(stabilizeManagedVideos, 400);
    window.setTimeout(stabilizeManagedVideos, 1600);
    window.setTimeout(stabilizeManagedVideos, 3200);
    window.setTimeout(syncRoomCardStates, 500);
    window.setTimeout(syncRoomCardStates, 1400);

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
