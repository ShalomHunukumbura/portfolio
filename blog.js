// Blog: category filter on the index; reading progress and "on this page" on a post.
// Everything here is an enhancement: without it, every post is listed and readable.

(function () {
  // ---------- Index: filter by category ----------
  var chips = document.querySelectorAll(".chip[data-filter]");
  var cards = document.querySelectorAll(".post-card");
  var empty = document.querySelector(".blog-empty");

  function show(filter) {
    var first = true;
    cards.forEach(function (card) {
      var match = filter === "all" || card.dataset.category === filter;
      card.hidden = !match;
      // The newest visible post is the featured one.
      card.classList.toggle("is-featured", match && first);
      if (match) first = false;
      if (match) card.classList.add("is-in");
    });
    if (empty) empty.hidden = !first;
    chips.forEach(function (chip) {
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === filter));
    });
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      show(chip.dataset.filter);
      if (history.replaceState) {
        history.replaceState(null, "", chip.dataset.filter === "all" ? location.pathname : "#" + chip.dataset.filter);
      }
    });
  });

  if (chips.length && location.hash) {
    var wanted = location.hash.slice(1);
    if (document.querySelector('.chip[data-filter="' + wanted + '"]')) show(wanted);
  }

  // ---------- Post: reading progress ----------
  var bar = document.querySelector(".reading-progress");
  var prose = document.querySelector(".prose");
  if (bar && prose) {
    var ticking = false;
    var update = function () {
      var rect = prose.getBoundingClientRect();
      var total = rect.height - window.innerHeight * 0.6;
      var done = Math.min(Math.max(-rect.top / Math.max(total, 1), 0), 1);
      bar.style.setProperty("--progress", done.toFixed(4));
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }

  // ---------- Post: highlight the section being read ----------
  var tocLinks = document.querySelectorAll(".post-toc a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) {
      byId[a.getAttribute("href").slice(1)] = a;
    });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          tocLinks.forEach(function (a) {
            a.classList.toggle("is-active", a === byId[entry.target.id]);
          });
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    Object.keys(byId).forEach(function (id) {
      var heading = document.getElementById(id);
      if (heading) spy.observe(heading);
    });
  }
})();
