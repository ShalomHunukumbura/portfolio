---
title: The one-line bug that takes your whole site down
description: A call with no timeout passes review and every test, then holds a worker forever the day a dependency stalls. no-hang finds them in Python, JavaScript, TypeScript and Go.
date: 2026-11-05
category: Developer tools
project:
  name: no-hang
  kind: CLI and GitHub Action
  links:
  - label: GitHub
    url: https://github.com/ShalomHunukumbura/no-hang
  - label: Release
    url: https://github.com/ShalomHunukumbura/no-hang/releases/latest
tags:
- python
- javascript
- go
- devops
---

This line passes code review and every test:

```python
requests.post(GATEWAY_URL, json=payment)
```

`requests` has no default timeout. The day the payment gateway accepts connections but
stops answering, every worker that calls it waits. Not for 30 seconds: forever, or until
the process is restarted. The worker pool fills up, and the whole site stops responding,
including the pages that never touch the gateway.

Tests don't catch it, because tests mock the network or the network answers fast. Code
review doesn't catch it, because nothing on the line looks wrong. You find out from the
incident.

## It isn't just requests

Most clients that talk over a network have a default for how long to wait, and a lot of
those defaults are "forever":

| Library | Default |
| --- | --- |
| Python `requests`, and a `requests.Session` | no timeout |
| `urllib.request.urlopen`, `smtplib`, `http.client` | the socket default: none |
| redis-py | `socket_timeout=None` |
| asyncpg | connects in 60 s, but `command_timeout=None` |
| axios | `timeout: 0`, which means none |
| node-postgres `Pool` | no `connectionTimeoutMillis`: a full pool queues forever |
| ioredis | connects in 10 s, no `commandTimeout` |
| Go `http.Get` and `http.DefaultClient` | `Timeout` is 0, none |

And some are fine. `httpx` gives up after 5 seconds, `aiohttp` after 5 minutes, Node's
built-in `fetch` after 300 seconds without headers, boto3 after 60. A tool that flags every
HTTP call without a timeout argument is mostly noise.

I read each default in the library's own source before writing a check for it: Python
3.12's standard library, redis-py 6.2, asyncpg, SQLAlchemy 2.0, axios, pg-pool, undici,
ioredis 6.0 and Go 1.26. Getting one wrong means either a false alarm on every call or a
real hang it never reports.

## no-hang

So I built [no-hang](https://github.com/ShalomHunukumbura/no-hang), an open-source CLI
and GitHub Action that finds these calls. Here it is on a small app with a Python service,
a TypeScript API and a Go worker:

```console
$ no-hang
app/payments.py:10:16  NH001 error  self.session.post() has no timeout, and a requests.Session has no default, so it waits forever if the server stops answering. Setting the session's .timeout does nothing in requests.
    fix: Pass timeout=(connect, read) in seconds, e.g. timeout=(3.05, 30). The read timeout is the longest gap between bytes, not the total time.
web/db.ts:4:21  NH006 warning  new Pool() has no connectionTimeoutMillis, so once every connection is busy, the next query waits forever for one.
    fix: Pass connectionTimeoutMillis: 5000.
web/db.ts:5:20  NH001 error  axios.create() has no timeout, so every request through this instance waits forever if the server stops answering.
    fix: Pass { timeout: 10000 } in milliseconds, or set it once with axios.create({ timeout }) or axios.defaults.timeout.
worker/main.go:6:12  NH001 error  http.Get() uses http.DefaultClient, which has no timeout, so it waits forever if the server stops answering.
    fix: Make an http.Client{Timeout: 10 * time.Second}, or build requests with http.NewRequestWithContext and a context.WithTimeout.
Found 3 errors and 1 warning in 3 files.
```

The first finding is the one I like most. The code sets `self.session.timeout = 10`,
which looks like it fixes the problem. It doesn't: `requests` ignores that attribute. The
session is created in `__init__` and used in another method, and no-hang follows it there
and says why the line above didn't help.

## Reading code, not grepping it

no-hang parses each file with tree-sitter, so a call inside a comment or a string is never
reported, and `import requests as r` or `const { execSync } = require('child_process')` is
followed to the real function. It also follows clients from where they're made to where
they're used: `with requests.Session() as s`, `self.session` across methods, sessions
created inline.

The harder part was knowing when to stay quiet:

- A session that mounts an adapter, or a socket that calls `settimeout()`, may have a
  timeout no-hang can't see, so it's left alone.
- A session passed in as a parameter was set up by the caller, so only an explicit
  `timeout=None` on it is reported.
- `socket.setdefaulttimeout(10)` in a file bounds the standard library's clients, and
  no-hang takes that into account.
- A Go `http.Client{}` without a `Timeout` is fine if the file builds its requests with a
  context, or if its Transport sets `ResponseHeaderTimeout`.
- A connection string from settings can't be read. Those calls get a note, which never
  fails the run, instead of a guess either way.

Some of these came straight from false positives on real code. anyio passes non-blocking
sockets around as parameters, which is where the parameter rule came from. pprof's client
sets `ResponseHeaderTimeout` on its Transport. And gevent calls `connect()` on a UDP
socket, which never waits, so UDP sockets are skipped too.

## What it found

I pointed it at the packages installed on my laptop, about 14,000 Python files, which took
about 6 seconds. Some of what it found:

- redis-py's OCSP certificate check calls `requests.get(issuer_url)` and
  `requests.get(ocsp_url, ...)` with no timeout, still there in 6.2.0. A slow OCSP
  responder stalls the Redis connection that's being verified.
- tqdm's Discord and Telegram notifiers post through a `requests.Session` with no timeout.
- fsspec's Jupyter and WebHDFS backends send requests through a session with no
  timeout.
- huggingface_hub's default `httpx` clients are built with `timeout=None`, turning off
  httpx's 5 second default for any request that doesn't pass its own.

And in my own code: a node-postgres `Pool` with no `connectionTimeoutMillis`, eight axios
calls with no timeout in a Next.js frontend, and a test that calls `urlopen` with no
timeout.

Go's own source, 7,700 files, takes 2 seconds.

## Calls that are meant to wait

Some calls should wait. A release build takes as long as it takes; a queue worker blocks on
`BLPOP` by design. Say so on the line:

```python
subprocess.run(["make", "release"])  # no-hang: ignore[NH003] a release build takes what it takes
```

The summary counts what comments turned off, so nothing disappears silently. Subprocess
calls are warnings rather than errors for the same reason, and only fail the run with
`--strict`.

## Adopting it without fixing everything first

```bash
no-hang --write-baseline .no-hang-baseline.json   # save what's there today
no-hang --baseline .no-hang-baseline.json         # fail only on new findings
```

Findings are matched by file, rule and the call they name, not by line number, so editing
the rest of a file doesn't bring old ones back.

## In CI

```yaml
- uses: actions/checkout@v4
- uses: ShalomHunukumbura/no-hang@v0.1.0
```

Findings show up on the pull request's diff, and the full report goes in the job summary.
The action downloads a prebuilt binary for Linux, macOS or Windows and checks its SHA-256
before running it. There's nothing to install, and it doesn't need Python, Node or Go on
the runner.

## Try it

- GitHub: [github.com/ShalomHunukumbura/no-hang](https://github.com/ShalomHunukumbura/no-hang)
- `no-hang --explain NH001` says why each rule exists, with the fix for each language.

If it reports something you think is wrong, open an issue with the snippet. That's how
the quiet rules above got written.
