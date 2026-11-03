// Runs before first paint: lets CSS hide scroll-reveal elements until home.js shows them.
// If home.js never signals ready (blocked script, old browser), show everything after 3s.
document.documentElement.classList.add("js");
setTimeout(function () {
  if (!window.__homeReady) document.documentElement.classList.remove("js");
}, 3000);
