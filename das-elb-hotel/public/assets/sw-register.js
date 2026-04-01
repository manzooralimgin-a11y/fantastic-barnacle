(function () {
  var VERSION = window.DAS_ELB_ASSET_VERSION || "20260401a";

  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js?v=" + encodeURIComponent(VERSION), { updateViaCache: "none" })
      .then(function (registration) {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        registration.update().catch(function () {});

        registration.addEventListener("updatefound", function () {
          var worker = registration.installing;
          if (!worker) {
            return;
          }
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(function (error) {
        console.warn("[das-elb] service worker registration failed", error);
      });
  });

  var hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hasReloaded) {
      return;
    }
    hasReloaded = true;
    window.location.reload();
  });
})();
