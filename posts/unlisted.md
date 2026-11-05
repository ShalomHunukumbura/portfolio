---
title: Every job on 10,000 career pages, in a 500 MB free database
description: Unlisted reads job listings straight from the systems companies post them on, works out where a "remote" role can really be done from, and fits it all in a free Postgres. The hard part was the 500 MB.
date: 2026-10-22
category: Products
project:
  name: Unlisted
  kind: Job search, Next.js and Python
  links:
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/unlisted
proof:
  command: python -c "from jobsite.remote_scope import classify; ..."
tags: [python, nextjs, postgres, scraping, srilanka]
---

Almost every company's careers page is run by an applicant tracking system: Greenhouse,
Ashby, Lever, Recruitee. That's where a role appears first. Some get cross-posted to
LinkedIn and job boards days later. Many never do, and you only find them if you already
know the company.

[Unlisted](https://github.com/ShalomHunukumbura/unlisted) reads those career pages
directly, across more than 10,000 companies, and puts every role in one search. Each listing
links to the employer's own apply page, and each job page checks with the employer's board,
live, that the role is still open.

For anyone looking for remote work from Sri Lanka, two more things waste time. Roles found through
the usual sites have often been open for weeks, with hundreds of applicants. And "remote"
often means "remote, if you live in the US".

## "Remote" isn't an answer

A job board's `remote: true` tells you almost nothing. "Remote - Portugal" is remote, and
you can't apply from Colombo. So every remote role in Unlisted gets one more field,
`open_to`: anywhere, a region (EU, APAC, LATAM…), or one country. Here's the classifier on
real location strings:

```console
$ python -c "from jobsite.remote_scope import classify; ..."
'Remote'                                 -> anywhere
'Remote - Worldwide'                     -> anywhere
'Remote: United States'                  -> country
'Argentina - Fully Remote'               -> country
'Anywhere in Belgium'                    -> country
'Remote (EMEA)'                          -> region
'Remote, APAC'                           -> region
'Canada - Remote (ON, AB, BC only)'      -> country
'Remote (must overlap with PST)'         -> country
```

It's pessimistic on purpose. If a remote role names any place it recognises, the role is
restricted, even when the wording says "fully remote" or "anywhere". And if there's text it
can't place at all, like that last line, it assumes a restriction too. The costs aren't
equal: showing a job you can't apply to wastes real time, while hiding a vague one only costs a
little recall.

The filter people use is "Remote, open to Sri Lanka": unrestricted roles, plus APAC-wide
ones, plus roles open to India or Sri Lanka.

## Finding 10,000 boards

No applicant tracking system will list its customers, and there's no public dataset that
maps companies to their boards. That was the hard part of getting data at all.

The trick is that every supported system answers a clean 404 for a board that doesn't
exist. So `jobsite discover` takes plain company names, tries the likely slugs on each
system, and keeps what answers. Boards with no jobs are rejected, because abandoned empty
boards are common: Vercel has an empty Ashby board next to its real Greenhouse one, so the
board with the most jobs wins. For the long tail, it starts from an
[MIT-licensed list](https://github.com/kalil0321/ats-scrapers) of 13,045 boards. A sample
check found about 87% still live, and every token is validated before it's used.

All of these are public, documented APIs. The sync sends a User-Agent with contact details,
stays at 5 requests a second per system, honours `Retry-After`, and checks boards with
open roles every two hours and quiet ones every six.

## The 500 MB problem

The public copy runs on free plans, so the database is a free Postgres with about 500 MB.
On the first full sync there were **227,719** open jobs across all the boards, and 1.16 GB
of them. But 82% had been posted more than two weeks earlier. A role that's been open
that long has its applicants already, so keeping only recent jobs was the right product
call and the only way to fit.

Two weeks didn't fit for long, though. The commit history is a record of the database
filling up:

- **Indexes.** The search index stored every word's position in every description, which
  only quoted phrases need. Description words now go in without positions, and quoted
  phrases search a small title, location and team index instead: 195 MB down to 124 MB.
- **Dead rows.** Freshly loaded, two weeks of jobs was about 390 MB. Then it reached
  489 MB in a day. When Postgres updates a row it writes a new version and leaves the old
  one behind; it reuses that space later, but never gives it back. A database that's
  constantly updated grows past its fresh size.
- **One setting, 20,000 writes.** Cutting the window from 14 days to 7 should have shrunk
  the database. Instead the next sync marked every job past the new limit as closed, which
  rewrote about 20,000 rows at once and filled the disk. Now jobs past the limit are
  deleted straight away and never closed first.
- **A field that would rewrite everything.** Pay read from a description is left out of a
  job's change fingerprint. With it in, adding pay extraction would have changed the
  fingerprint of every job with pay, and the next sync would have rewritten all of them
  together.

It now keeps three days, plus a small copy of each week's roles for the weekly report,
about 5 MB a week. The lesson I keep coming back to: on a small database, how many rows
you *write at once* matters more than how many you keep.

The other free-plan limit was compute, not storage. In October the first database host's
monthly compute hours ran out on the 20th, because every page view queried Postgres and
crawlers never stop. Now pages read from a cache that's refreshed after each sync, and the sync
itself downloads everything with no database connection open, then writes it all in one
burst of under a minute.

## Never trust an empty answer

One bug class worries me more than any other in a scraper: an upstream hiccup that looks
like real data. If a board returns zero jobs, the naive sync closes every role that
company had. One bad response, and a whole company disappears from the site.

So there's a guard. If a board comes back empty while Unlisted holds more than five open
roles from it, the run is marked `suspicious` and closes nothing. A company really closing
every role at once is rare. A flaky response is not.

## A feed for one person, with no account

The "For you" page ranks every role for one person, from the roles and skills they want
and, optionally, their CV. The CV never leaves the browser: pdf.js reads the text, and
[Transformers.js](https://huggingface.co/docs/transformers.js) runs a small embedding model
(`all-MiniLM-L6-v2`, 23 MB) on the page. Only 384 numbers are saved. The worker embeds
jobs with the same model through ONNX Runtime. Its vectors match the full-precision model
to five decimal places, and the 8-bit version the browser runs is 0.994 cosine-similar.

The first version of that query took 8 seconds. Two changes brought it to about 100 ms:
looking up skills through the indexes before joining, instead of letting Postgres unpack a
large text column for every row and skill, and turning off JIT for it, because Postgres
guessed the query was expensive and spent 2 seconds compiling it.

## What I'd do again

- **Decide what a wrong answer costs.** The remote classifier and the pay parser both
  prefer saying nothing over saying something false, because a false "open to anywhere" or
  a made-up salary costs the user more than a blank.
- **On a small database, count writes.** Every near-disaster came from one change that
  rewrote thousands of rows together.
- **Treat empty upstream data as suspicious.** Absence is the easiest thing for a broken
  source to fake.

The workers have 184 tests, mostly on the messy parts: locations, HTML sanitising, each
system's quirks, experience levels and pay. Real-world data is messy enough to break
anything that isn't tested against it.
