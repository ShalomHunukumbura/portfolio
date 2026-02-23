(function () {
  var entries = Array.isArray(window.learningLogData) ? window.learningLogData : [];
  var mount = document.getElementById("learning-log-list");

  if (!mount) {
    return;
  }

  if (entries.length === 0) {
    mount.innerHTML = '<article class="card compact"><p>No entries yet.</p></article>';
    return;
  }

  mount.innerHTML = entries
    .map(function (entry) {
      return (
        '<article class="card">' +
        '<h3>' + escapeHtml(entry.month || "Unknown Month") + "</h3>" +
        section("Books Read", formatBooks(entry.books)) +
        section("Articles Read", formatArticles(entry.articles)) +
        section("What I Learned", formatList(entry.learned)) +
        section("Applied / Built", formatList(entry.built)) +
        "</article>"
      );
    })
    .join("");

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
          return "<li><strong>" + title + "</strong> by " + author + (note ? " - " + note : "") + "</li>";
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
          return "<li>" + linkedTitle + (note ? " - " + note : "") + "</li>";
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
      items.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join("") +
      "</ul>"
    );
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
})();
