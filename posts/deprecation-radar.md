---
title: The warnings you scroll past are your next upgrade outage
description: pytest already tells you what will break when Pydantic 3 or the next Python lands. It just says it in a way nobody reads.
date: 2026-10-29
category: Developer tools
project:
  name: deprecation-radar
  kind: pytest plugin
  links:
  - label: GitHub
    url: https://github.com/ShalomHunukumbura/deprecation-radar
  - label: PyPI
    url: https://pypi.org/project/pytest-deprecation-radar/
proof:
  block: 2
  command: pytest
tags:
- python
- testing
- pytest
- fastapi
---

Every pytest run ends like this for a lot of projects:

```console
=============================== warnings summary ===============================
.venv/lib/python3.12/site-packages/fastapi/testclient.py:1
  .../fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

app.py:10
  app.py:10: MovedIn20Warning: The ``declarative_base()`` function is now available as sqlalchemy.orm.declarative_base(). (deprecated since: 2.0) (Background on SQLAlchemy 2.0 at: https://sqlalche.me/e/b8d9)
    Base = declarative_base()

.venv/lib/python3.12/site-packages/pydantic/_internal/_config.py:408
  .../pydantic/_internal/_config.py:408: UserWarning: Valid config keys have changed in V2:
  * 'orm_mode' has been renamed to 'from_attributes'
    warnings.warn(message, UserWarning)

app.py:28
  app.py:28: DeprecationWarning:
          on_event is deprecated, use lifespan event handlers instead.

          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).

    @app.on_event("startup")

...six more like these...

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
======================== 2 passed, 10 warnings in 2.30s ========================
```

Ten warnings from two tests, in a 60-line block. On a real project it's hundreds of lines. Everyone learns to scroll past the block. Then a major
version comes out and those warnings turn into `AttributeError`s, all at once, in the week
you wanted to upgrade.

The information you need for a planned upgrade is already in that block. Here's why it's
so hard to use, and what I built to fix it.

## Why the warnings summary doesn't work

**It's grouped by location and test, not by problem.** A deprecated call that 40 tests go
through is listed under the names of all 40 tests. The same deprecated method called from
12 places is 12 separate entries, scattered through the block. What you want to know is
"which deprecated things do I use, and where", and the summary doesn't group it that way.

**Your problems are mixed with your dependencies' problems.** Some warnings point at your
code: you called `.dict()` on a Pydantic model. Others point inside a library: FastAPI's
test client uses a Starlette feature that Starlette has deprecated. You can fix the first
kind today. The second kind you fix by upgrading the dependency, or you wait. The summary
lists both the same way.

**It doesn't say when.** "Deprecated" can mean "removed next month" or "removed someday,
maybe". Pydantic's messages say `to be removed in V3.0`. Others say nothing. You can't plan
without reading every message.

**Some deprecations don't look like deprecations.** Python hides `DeprecationWarning` by
default outside `__main__`, so Starlette and FastAPI raise theirs as `UserWarning`
subclasses on purpose, to make sure people see them. That breaks the usual trick of
filtering on the category.

## The obvious fixes, and why they're not enough

**`-W error::DeprecationWarning`** turns every deprecation into a failure. It fails on day
one, mostly on warnings raised inside your dependencies that you can't fix, so you turn it
off by day two. It also misses the `UserWarning` ones.

**`filterwarnings = ignore::DeprecationWarning`** makes the block go away. That's the same
as scrolling past it, but permanent.

**Grepping for deprecated APIs** works if you already know the list. You don't: that's
what the warnings are for.

What you actually want is a report grouped by library, with removal versions, pointing at
your lines, and a gate that stops new uses getting in without failing on the old ones.

## So I built that

[**deprecation-radar**](https://github.com/ShalomHunukumbura/deprecation-radar) is a pytest
plugin. Here is the same app's test run with it installed. It's a small FastAPI app
written the way many 2023 tutorials wrote it, run against real, pinned versions of
FastAPI, Pydantic, SQLAlchemy and Starlette:

```console
============================== deprecation-radar ===============================
pydantic 2.14.1: 5 deprecations, removal in 3.0
  PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. ...
    app.py:20 in User
  PydanticDeprecatedSince20: The `dict` method is deprecated; use `model_dump` instead. ...
    app.py:36 in get_user
  PydanticDeprecatedSince20: The `json` method is deprecated; use `model_dump_json` instead. ...
    test_app.py:12 in test_user_json
  PydanticDeprecatedSince20: The `parse_obj` method is deprecated; use `model_validate` instead. ...
    app.py:35 in get_user
  UserWarning: Valid config keys have changed in V2: * 'orm_mode' has been renamed to 'from_attributes'
    inside pydantic: pydantic/_internal/_config.py:408
fastapi 0.162.0: 1 deprecation
  DeprecationWarning: on_event is deprecated, use lifespan event handlers instead. ...
    app.py:28 in <module>
    inside fastapi: fastapi/applications.py:4723
Python 3.12 standard library: 1 deprecation
  DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. ...
    app.py:30 in startup
SQLAlchemy 2.1.6: 1 deprecation
  MovedIn20Warning: The ``declarative_base()`` function is now available as sqlalchemy.orm.declarative_base(). (deprecated since: 2.0) ...
    app.py:10 in <module>
starlette 1.10.0: 1 deprecation, used only inside other packages
  StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    inside fastapi: fastapi/testclient.py:1
deprecation-radar: 9 deprecations from 5 sources, used at 7 places in your code.
```

Read it top to bottom and it's an upgrade plan:

- **Pydantic 3 will break five things**, and four of them are on lines you can fix today.
  Libraries with a known removal version come first.
- **FastAPI's `on_event`** is used at `app.py:28`.
- **`datetime.utcnow()`** is deprecated in the standard library since Python 3.12.
- **Starlette's deprecation is FastAPI's problem**, not yours. It's marked "used only inside
  other packages", so you know the fix is a FastAPI upgrade, not a code change.

### Working out who deprecated what

The hard part is the library name at the top of each group. A warning doesn't say which
package it came from. deprecation-radar works it out in order: the warning class's module
(`PydanticDeprecatedSince20` lives in `pydantic`), then package names in the message, then
the file that raised it. When none of those say, it files the warning under "Unknown
source" instead of guessing. CI runs the demo app against the pinned real libraries and
checks that every deprecation is credited to the right package and line, so a library
release can't quietly break that.

### Stopping new ones getting in

A report doesn't stop the list growing. So:

```bash
pytest --deprecation-radar-update-baseline   # record what you use today; commit the file
pytest                                       # a new use of a deprecated API fails the run
```

```console
pydantic 2.14.1: 5 deprecations, removal in 3.0
  PydanticDeprecatedSince20: The `json` method is deprecated; use `model_dump_json` instead. ...
    NEW app.py:40 in export
    test_app.py:12 in test_user_json
...
deprecation-radar: 9 deprecations from 5 sources, used at 8 places in your code; 1 new use fails the run.
```

Two details make this usable on a real codebase. Only uses in **your** code can fail the
run: deprecations inside dependencies are reported but never block you. And baseline
entries are keyed by file, function, warning class and message, not line number, so
adding code above an old call doesn't make it look new. Links are stripped from messages
too, because Pydantic's links include the installed minor version
(`errors.pydantic.dev/2.14/...`), and a minor upgrade would otherwise make every entry look
new.

On GitHub Actions, uses in your code also show up as notes on the pull request diff.

```bash
pip install pytest-deprecation-radar
pytest
```

## What it can't do

It sees what your tests run, so untested code isn't checked. And a library decides which
line a warning points at (`stacklevel`). When it points inside the library, the report says
`inside pydantic: ...` rather than guessing at your line.

---

If you're putting off a Pydantic, SQLAlchemy or Django upgrade, run it once and see how
long the list really is. Issues and ideas are welcome on
[GitHub](https://github.com/ShalomHunukumbura/deprecation-radar).
