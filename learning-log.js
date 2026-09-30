(function () {
  var entries = Array.isArray(window.learningLogData) ? clone(window.learningLogData) : [];
  var mount = document.getElementById("learning-log-list");
  var csrfToken = "";

  renderEntries();
  init();

  async function init() {
    var apiReady = await refreshEntries();
    if (!apiReady) {
      // Static hosting (e.g. GitHub Pages): read the committed store file directly.
      await loadStaticStore();
    }
    initAdminPanel(apiReady);
  }

  async function loadStaticStore() {
    try {
      var response = await fetch("learning-log-store.json", { cache: "no-cache" });
      if (!response.ok) {
        return;
      }
      var data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        entries = data;
        renderEntries();
      }
    } catch (_error) {
      // Keep bundled fallback entries (e.g. when opened via file://).
    }
  }

  function renderStats() {
    var books = 0;
    var articles = 0;
    entries.forEach(function (entry) {
      books += Array.isArray(entry.books) ? entry.books.length : 0;
      articles += Array.isArray(entry.articles) ? entry.articles.length : 0;
    });
    setText("stat-months", entries.length);
    setText("stat-books", books);
    setText("stat-articles", articles);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = String(value);
    }
  }

  function renderEntries() {
    renderStats();
    if (!mount) {
      return;
    }

    if (entries.length === 0) {
      mount.innerHTML = '<article class="card compact"><p>No entries yet.</p></article>';
      return;
    }

    mount.innerHTML = entries
      .map(function (entry, index) {
        var month = escapeHtml(entry.month || "Unknown Month");
        var openAttr = index === 0 ? " open" : "";
        var bookCount = Array.isArray(entry.books) ? entry.books.length : 0;
        var articleCount = Array.isArray(entry.articles) ? entry.articles.length : 0;
        var counts =
          bookCount + (bookCount === 1 ? " book" : " books") + " · " +
          articleCount + (articleCount === 1 ? " article" : " articles");

        return (
          '<details class="card log-entry"' + openAttr + ">" +
          '<summary class="log-summary">' +
          "<h3>" + month + "</h3>" +
          '<span class="log-counts">' + counts + "</span>" +
          '<span class="log-toggle" aria-hidden="true"></span>' +
          "</summary>" +
          '<div class="log-content">' +
          section("Books Read", formatBooks(entry.books)) +
          section("Articles Read", formatArticles(entry.articles)) +
          section("What I Learned", formatList(entry.learned)) +
          section("Applied / Built", formatList(entry.built)) +
          "</div>" +
          "</details>"
        );
      })
      .join("");
  }

  async function refreshEntries() {
    try {
      var response = await apiRequest("/api/learning-log", { method: "GET" }, false);
      if (response && Array.isArray(response.entries)) {
        entries = response.entries;
        renderEntries();
        return true;
      }
    } catch (_error) {
      // Keep currently loaded entries.
    }
    return false;
  }

  function initAdminPanel(apiReady) {
    var loginBtn = document.getElementById("admin-login-btn");
    var logoutBtn = document.getElementById("admin-logout-btn");
    var panel = document.getElementById("admin-panel");
    var editor = document.getElementById("admin-json-editor");
    var status = document.getElementById("admin-status");
    var message = document.getElementById("admin-message");
    var loadBtn = document.getElementById("admin-load-current-btn");
    var resetBtn = document.getElementById("admin-reset-default-btn");
    var saveBtn = document.getElementById("admin-save-btn");
    var adminSection = document.getElementById("admin-section");
    var isAdmin = false;

    if (!loginBtn || !logoutBtn || !panel || !editor || !status || !message || !loadBtn || !resetBtn || !saveBtn) {
      return;
    }

    // Admin tools only make sense when the local server (node server.js) is running.
    if (!apiReady) {
      return;
    }
    if (adminSection) {
      adminSection.hidden = false;
    }
    setAdminUi();
    hydrateSession();

    loginBtn.addEventListener("click", async function () {
      var password = window.prompt("Enter admin password");
      if (!password) {
        return;
      }

      try {
        var loginResponse = await apiRequest("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password: password })
        });
        if (!loginResponse || !loginResponse.csrfToken) {
          setMessage("Login failed.", true);
          return;
        }
        csrfToken = loginResponse.csrfToken;
        isAdmin = true;
        editor.value = JSON.stringify(entries, null, 2);
        setMessage("Admin mode enabled.", false);
        setAdminUi();
      } catch (_error) {
        setMessage("Invalid credentials or API unavailable.", true);
      }
    });

    logoutBtn.addEventListener("click", async function () {
      try {
        await apiRequest("/api/admin/logout", { method: "POST" }, false);
      } catch (_error) {
        // Best effort logout.
      }
      isAdmin = false;
      csrfToken = "";
      setMessage("Logged out.", false);
      setAdminUi();
    });

    loadBtn.addEventListener("click", async function () {
      if (!isAdmin) {
        return;
      }
      await refreshEntries();
      editor.value = JSON.stringify(entries, null, 2);
      setMessage("Loaded current entries.", false);
    });

    resetBtn.addEventListener("click", async function () {
      if (!isAdmin) {
        return;
      }
      try {
        var response = await apiRequest("/api/admin/learning-log/reset", {
          method: "POST",
          headers: {
            "X-CSRF-Token": csrfToken
          }
        });
        entries = Array.isArray(response.entries) ? response.entries : entries;
        renderEntries();
        editor.value = JSON.stringify(entries, null, 2);
        setMessage("Reset to default source data.", false);
      } catch (_error) {
        setMessage("Reset failed.", true);
      }
    });

    saveBtn.addEventListener("click", async function () {
      if (!isAdmin) {
        return;
      }

      try {
        var parsed = JSON.parse(editor.value);
        if (!Array.isArray(parsed)) {
          setMessage("JSON must be an array of monthly entries.", true);
          return;
        }
        await apiRequest("/api/admin/learning-log", {
          method: "PUT",
          headers: {
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify(parsed)
        });
        entries = parsed;
        renderEntries();
        setMessage("Saved successfully.", false);
      } catch (error) {
        var reason = "Save failed.";
        if (error instanceof SyntaxError) {
          reason = "Invalid JSON. Fix formatting and try again.";
        } else if (error && error.message === "Unauthorized") {
          reason = "Session expired. Log in again, then save (your edits are still in the editor).";
          isAdmin = false;
          csrfToken = "";
          loginBtn.hidden = false;
          logoutBtn.hidden = true;
        } else if (error && error.message) {
          reason =
            "Save failed: " + error.message +
            " Every entry needs a month; books need title + author; articles need title + a valid URL; no empty strings in learned/built.";
        }
        setMessage(reason, true);
      }
    });

    function setAdminUi() {
      panel.hidden = !isAdmin;
      loginBtn.hidden = isAdmin;
      logoutBtn.hidden = !isAdmin;
      status.textContent = isAdmin ? "Admin mode active." : "Viewer mode.";
      status.className = "";
    }

    function setMessage(text, isError) {
      message.textContent = text;
      message.className = isError ? "admin-error" : "admin-success";
      status.textContent = text;
      status.className = isError ? "admin-error" : "admin-success";
    }

    async function hydrateSession() {
      try {
        var sessionResponse = await apiRequest("/api/admin/session", { method: "GET" }, false);
        if (sessionResponse && sessionResponse.csrfToken) {
          csrfToken = sessionResponse.csrfToken;
          isAdmin = true;
          editor.value = JSON.stringify(entries, null, 2);
          setMessage("Admin session restored.", false);
          setAdminUi();
        }
      } catch (_error) {
        // Not logged in.
      }
    }
  }

  function section(title, content) {
    return (
      '<div class="log-block">' +
      '<p class="log-title">' + escapeHtml(title) + "</p>" +
      content +
      "</div>"
    );
  }

  function formatBooks(books) {
    if (!Array.isArray(books) || books.length === 0) {
      return "<p>None recorded.</p>";
    }

    return (
      '<ul class="log-list">' +
      books
        .map(function (book) {
          var title = escapeHtml((book && book.title) || "Untitled");
          var author = escapeHtml((book && book.author) || "Unknown");
          var note = escapeHtml((book && book.note) || "");
          return (
            "<li><strong>" + title + "</strong> - " + author +
            (note ? '<span class="log-note">' + note + "</span>" : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function formatArticles(articles) {
    if (!Array.isArray(articles) || articles.length === 0) {
      return "<p>None recorded.</p>";
    }

    return (
      '<ul class="log-list">' +
      articles
        .map(function (article) {
          var title = escapeHtml((article && article.title) || "Untitled");
          var url = (article && article.url) || "";
          var safeUrl = escapeAttribute(url);
          var note = escapeHtml((article && article.note) || "");
          var linkedTitle = safeUrl
            ? '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + title + "</a>"
            : title;
          return "<li>" + linkedTitle + (note ? '<span class="log-note">' + note + "</span>" : "") + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function formatList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "<p>None recorded.</p>";
    }

    return (
      '<ul class="log-list">' +
      items
        .map(function (item) {
          return "<li>" + escapeHtml(item) + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  async function apiRequest(path, options, throwOnError) {
    var shouldThrow = throwOnError !== false;
    var requestOptions = Object.assign(
      {
        credentials: "same-origin"
      },
      options || {}
    );
    requestOptions.headers = Object.assign(
      {
        "Content-Type": "application/json"
      },
      requestOptions.headers || {}
    );

    var response = await fetch(path, requestOptions);
    var data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }
    if (!response.ok) {
      if (shouldThrow) {
        throw new Error((data && data.error) || "request_failed");
      }
      return null;
    }
    return data;
  }
})();
