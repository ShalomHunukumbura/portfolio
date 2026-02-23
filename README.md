# Portfolio

Minimal single-page portfolio plus a long-term `Learning Log` page.

## Run locally

1. Start a local server:

```bash
python3 -m http.server 8080
```

2. Open `http://localhost:8080`.

## Monthly updates (Learning Log)

Update only `learning-log-data.js`.

1. Add a new object at the top of `window.learningLogData`.
2. Fill these fields:
   - `month`: e.g. `"March 2026"`
   - `books`: list of `{ title, author, note }`
   - `articles`: list of `{ title, url, note }`
   - `learned`: list of key learnings
   - `built`: list of practical outcomes
3. Save, refresh `learning-log.html`, and your new month appears automatically.
