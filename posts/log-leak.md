---
title: 6 ways personal data gets into your Python logs (and how your tests can catch it)
description: Nobody writes log.info(password) on purpose. It gets in through f-strings, exceptions, dicts and connection strings.
date: 2026-10-29
category: Developer tools
project:
  name: log-leak
  kind: pytest plugin
  links:
  - label: GitHub
    url: https://github.com/ShalomHunukumbura/log-leak
  - label: PyPI
    url: https://pypi.org/project/pytest-log-leak/
proof:
  command: pytest
tags:
- python
- security
- testing
- logging
---

Nobody writes `log.info(user_password)` on purpose. Personal data gets into logs sideways:
through a debugging f-string that never got removed, an exception message, a dict logged
whole, a database URL printed at startup.

And logs travel. They go to a log platform, get kept for months, get exported to a bucket,
get pasted into a Slack thread while someone debugs. A user's email address in a database
row is protected by access control. The same address in a log line is readable by everyone
who can read logs.

I work on a tax and compliance platform, where the data in a request is exactly the data
that shouldn't be in a log. Here are six ways it gets in. The report near the end is real
output from running a small demo app's tests (linked at the bottom).

---

## 1. The f-string

```python
log.info(f"created user {email}")
```

This is the most common one by far. It's useful while you build the feature, it reads fine
in review, and it ships. From then on every signup writes an email address to your logs.

**Fix:** log the ID you already have.

```python
log.info("created user %s", user.id)
```

---

## 2. The exception message

```python
try:
    db.add(user)
    db.commit()
except IntegrityError:
    log.exception("signup failed")
```

The log message is harmless. The exception isn't. A unique constraint violation from
Postgres carries the duplicate value in its text:

```
DETAIL:  Key (email)=(amal@example.com) already exists.
```

`log.exception` writes that whole message, plus the traceback, into the log record. Your
code never mentions the email, and it's logged anyway.

**Fix:** catch it, log what happened in your own words, and don't attach the exception text
when it can carry user input. Or turn the database error into your own exception with a
safe message before it gets logged.

---

## 3. The whole dict

```python
log.warning("login failed for %s", form)
```

Logging a whole request body, form or model is convenient, because you get everything. That's
the problem: you get everything, including the `password` field.

**Fix:** log the fields you need (`form["username"]`), or mask sensitive keys before
logging.

---

## 4. Headers

```python
log.debug("calling payments API with %s", headers)
```

The `Authorization` header is a credential. A `Bearer` token or an API key in a DEBUG log
is one log-level change away from production, and many teams turn on DEBUG in production
for a while to chase a bug.

**Fix:** never log headers whole. If you need them, drop `Authorization`, `Cookie` and
anything named like a key first.

---

## 5. The connection string

```python
log.info("connecting to %s", settings.database_url)
```

`postgresql://app:s3cretpw@db.internal/prod`. That's the production database password,
written to the logs every time the app starts.

**Fix:** SQLAlchemy can do this for you:
`engine.url.render_as_string(hide_password=True)`.

---

## 6. `extra={...}`

```python
log.info("sending OTP", extra={"to": phone})
```

Structured logging is great, and `extra` fields end up as searchable columns in your log
platform. That also makes them the easiest place to search for a phone number.

**Fix:** same as the f-string: log an internal ID, or only the last few digits.

---

## Why code review doesn't catch these

Each of these lines looks reasonable on its own. Number 2 doesn't even mention the data.
Number 5 depends on what's in an environment variable. To catch them in review, the
reviewer has to know what every variable will hold at runtime.

But your tests know. They already run these code paths with realistic data: a test user
with an email, a login with a wrong password, a duplicate signup. The data goes through the
logging calls during the test run. Something just needs to look at it.

## So I built that

[**log-leak**](https://github.com/ShalomHunukumbura/log-leak) is a pytest plugin. While your
tests run, it reads every log record your code writes and checks the message, any logged
exception, and `extra` fields for emails, phone numbers, NIC numbers, card numbers,
passwords, tokens, API keys and URLs with passwords in them.

```bash
pip install pytest-log-leak
pytest
```

There's nothing to configure. Here's what it printed for the six examples above:

```console
=================================== log-leak ===================================
app/auth.py:7  LL006 credential  A value under a key like password, secret or token was logged.
    in login(), logger 'app.auth' at WARNING
    message: login failed for {'username': 'amal', 'password': '<credential>'}
    template: login failed for %s
    first seen in: test_app.py::test_login
    fix: Log only the fields you need, or mask sensitive keys before logging.
app/auth.py:11  LL003 api-key  An API key in a known format was logged.
    in call_api(), logger 'app.auth' at DEBUG
    message: calling payments API with {'Authorization': 'Bearer <api-key>'}
    template: calling payments API with %s
    first seen in: test_app.py::test_api
    fix: Remove the key from the log call. If it reached real logs, rotate it.
app/auth.py:15  LL004 url-credentials  A URL with a password in it was logged.
    in connect(), logger 'app.auth' at INFO
    message: connecting to postgresql://app:<url-credentials>@db.internal/prod
    template: connecting to %s
    first seen in: test_app.py::test_connect
    fix: Log the URL with the password masked, e.g. SQLAlchemy's `url.render_as_string(hide_password=True)`.
app/users.py:14  LL009 email  An email address was logged.
    in create_user(), logger 'app.users' at INFO
    message: created user <email>
    first seen in: test_app.py::test_register_twice
    fix: Log an internal user ID instead.
app/users.py:24  LL009 email  An email address was logged.
    in register(), logger 'app.users' at ERROR
    exception: app.users.DuplicateEmail: Key (email)=(<email>) already exists.
    first seen in: test_app.py::test_register_twice
    fix: Log an internal user ID instead.
app/users.py:28  LL010 phone  A phone number was logged.
    in send_otp(), logger 'app.users' at INFO
    extra:to: <phone>
    first seen in: test_app.py::test_otp
    fix: Log an internal user ID, or only the last few digits.
log-leak: found 6 leaks at 6 call sites, logged by 5 tests.
```

A few decisions worth explaining:

- **The report never shows the leaked value.** It shows where the log call is and the
  message with the value masked. Otherwise your CI log would become a second leak.
- **Fake test data counts.** If a test logs `amal@example.com`, the same line logs real
  addresses in production. The test data isn't the problem; the line is.
- **It fails the run.** A warning at the bottom of a test run gets scrolled past forever.
  For a project with existing leaks, `pytest --log-leak-update-baseline` records them, and
  only new ones fail the run.
- **It has to be almost never wrong,** or people turn it off. I tuned the detectors against
  32,000 real log lines from 16 systems in [Loghub](https://github.com/logpai/loghub). The
  first run had 67 false positives: HDFS block IDs that pass the card checksum, timestamps
  that looked like phone numbers, `token=Token{a64f992}` object descriptions. Each one is
  fixed and kept as a test. The 12 hits left are all real email addresses.

On GitHub Actions it also adds each leak as an annotation on the pull request diff, at the
logging line.

## What it can't do

It only sees code your tests run, and only records that reach the root logger. It doesn't
support pytest-xdist yet. It's a net under your tests, not a scanner for your whole
codebase.

---

The demo app is [in this gist / repo link]. If you try log-leak on a real project, I'd like
to hear what it found, and especially any false positives. Issues are welcome on
[GitHub](https://github.com/ShalomHunukumbura/log-leak).
