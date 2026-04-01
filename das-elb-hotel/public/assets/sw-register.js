(function () {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js")
      .then(function (registration) {
        registration.update().catch(function () {});
      })
      .catch(function (error) {
        console.warn("[das-elb] service worker registration failed", error);
      });
  });
})();
