# Portfolio

Minimal single-page portfolio plus a long-term `Learning Log` page.

## Secure Admin Setup

This repo now uses a server-enforced admin flow.

### 1) Generate password record and session secret

Run:

```bash
node -e "const crypto=require('crypto'); const password='REPLACE_WITH_STRONG_PASSWORD'; const iterations=210000; const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.pbkdf2Sync(password, Buffer.from(salt,'hex'), iterations, 64, 'sha512').toString('hex'); console.log('ADMIN_PASSWORD_RECORD=pbkdf2_sha512$'+iterations+'$'+salt+'$'+hash); console.log('SESSION_SECRET='+crypto.randomBytes(48).toString('hex'));"
```

Create `.env`:

```bash
ADMIN_PASSWORD_RECORD='pbkdf2_sha512$...'
SESSION_SECRET='...'
PORT=8080
HOST=127.0.0.1
NODE_ENV=development
```

### 2) Start server

```bash
set -a && source .env && set +a
node server.js
```

Open `http://127.0.0.1:8080`.

## Monthly updates (Learning Log)

The live site is static (GitHub Pages), so the admin panel only works locally.
The page loads entries in this order: `/api/learning-log` (local server) →
`learning-log-store.json` (static hosting) → `learning-log-data.js` (file:// fallback).

1. Run the server locally (see above) and open `learning-log.html`.
   The Admin box only appears when the server is running.
2. Click `Admin Login`, edit the JSON and click `Save Changes`
   (or edit `learning-log-store.json` by hand - newest month first).
3. Regenerate the file:// fallback:
   ```bash
   node -e "const d=require('./learning-log-store.json');require('fs').writeFileSync('learning-log-data.js', 'window.learningLogData = '+JSON.stringify(d,null,2)+';\n')"
   ```
4. Commit and push `learning-log-store.json` (and `learning-log-data.js`) to publish.

Validation rules (a save is rejected otherwise): every entry needs `month`; books need
`title` + `author`; articles need `title` + a valid `url`; no empty strings in `learned` /
`built`. Admin sessions expire after 1 hour - log in again if a save says the session expired.

Data files:
- `learning-log-store.json`: live source of truth.
- `learning-log-default.json`: reset baseline.

## Security Notes

- Admin auth is enforced server-side only.
- Session cookie is `HttpOnly` and `SameSite=Strict`.
- CSRF token is required for write operations.
- Login endpoint has rate limiting.
- Input payloads are validated before writing.
- In production, run behind HTTPS and set `NODE_ENV=production` for HSTS + secure cookies.

## Blog

One post per shipped project. Posts are Markdown in `posts/`; `scripts/build_blog.py`
renders `blog.html`, `blog/<slug>.html` and `blog/feed.xml`, which are committed so GitHub
Pages serves them with no build step.

```bash
uv run scripts/build_blog.py
```

Front matter:

```yaml
title: The one-line bug that takes your whole site down
description: One or two sentences for the card, the post's lead and search results.
date: 2026-11-05            # the project's first release
category: Developer tools   # the filter chips on the index come from these
project:
  name: no-hang
  kind: CLI and GitHub Action
  links:
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/no-hang
tags: [python, go]
proof:                      # optional: the terminal on the card
  block: 2                  # which console block (default: the first)
  command: pytest           # the command shown when the block doesn't start with "$ "
  # output: |               # or give the output itself
```

Console output goes in ```` ```console ```` blocks: rule codes and severities are coloured,
and the first one becomes the card's terminal. `##` headings make the post's "On this page"
list. The same Markdown can be pasted into dev.to; set its `canonical_url` to the post's URL
here.
