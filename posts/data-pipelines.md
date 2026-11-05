---
title: "Four data pipelines, and the rule that kept every one of them honest"
description: "Exchange rates, job postings, rainfall and food prices, each from a source that wasn't built to be read by a program. Four stacks, from plain Python to dbt, Airflow and Delta Lake, and the same lessons each time."
date: 2026-10-30
category: Data engineering
project:
  name: Four data pipelines
  kind: Python, dbt, Airflow, Delta Lake
  links:
    - label: lkr-rates
      url: https://shalomhunukumbura.github.io/lkr-rates/
    - label: hiring-warehouse
      url: https://shalomhunukumbura.github.io/hiring-warehouse/
    - label: rain-watch
      url: https://shalomhunukumbura.github.io/rain-watch/
    - label: lk-prices
      url: https://shalomhunukumbura.github.io/lk-prices/
proof:
  command: lkr-rates check
  output: |
      ok       buy is below sell
      ok       data is fresh
      warning  no wild one-day moves: 21 row(s)
               2024-03-07, EGP, indicative, 9.966600, 6.212300
               2023-06-15, NGN, indicative, 0.655000, 0.497400
      ok       newest day has every currency
tags: [python, data-engineering, dbt, airflow, delta-lake, srilanka]
---

Over October I built four data pipelines, each over a source that publishes useful numbers
in a form that's hard to use:

- **[lkr-rates](https://github.com/ShalomHunukumbura/lkr-rates):** every rupee exchange
  rate the Central Bank of Sri Lanka has published since 2010, from a web form that returns
  HTML tables. Plain Python, Parquet, a static page.
- **[hiring-warehouse](https://github.com/ShalomHunukumbura/hiring-warehouse):** a star
  schema in dbt over the job postings [Unlisted](unlisted.html) collects, so the history
  survives after Unlisted deletes old jobs.
- **[rain-watch](https://github.com/ShalomHunukumbura/rain-watch):** rainfall for all 25
  districts every morning, compared with the same week in every year since 2015, with phone
  alerts. Apache Airflow over an S3-compatible data lake.
- **[lk-prices](https://github.com/ShalomHunukumbura/lk-prices):** ten years of food prices
  from about 2,450 Central Bank PDFs, turned into Delta Lake tables and a monthly food price
  index. Polars and delta-rs, no Spark.

They're four different stacks on purpose: I wanted to learn each tool on a real source
rather than a tutorial dataset. But the problems that mattered weren't the tools. They were
the same in every project.

## Keep the source exactly as it arrived

Every pipeline saves what the source sent, untouched, before parsing anything: lkr-rates
keeps the raw HTML pages, rain-watch the raw API responses in the lake, lk-prices the PDFs
as served. Parsing happens after, from those files.

That's what makes every parser bug cheap. When lk-prices' parser changed, `lk-prices
rebuild` re-parsed all ten years from the saved PDFs, without asking the Central Bank for
any of them again, and the previous table stayed readable through Delta Lake's time travel.
lkr-rates has the same command. A pipeline that parses as it downloads can only fix old
data by downloading it all again, and some sources don't let you.

## Load twice, change nothing

A daily job will run twice someday: a retry, a timer that fires late, me running it by hand.
So every load is idempotent. lkr-rates merges rows keyed by date, currency and rate type.
lk-prices loads with a Delta `MERGE`. rain-watch writes one Parquet file per day and
replaces it on a rerun, so a single past day can be rerun on its own. Run any of them twice
and the second run changes nothing.

hiring-warehouse goes further: dbt rebuilds every table from all the saved extracts, from an
empty database, on every run. That's also why its job history is built from the extracts
with window functions instead of dbt snapshots. Snapshots keep history only inside the
database, so they can't be rebuilt.

## The checks decide what gets published

This is the rule from the title. Each pipeline has a quality gate between loading and
publishing, and if a check fails, the run stops and nothing is published. Yesterday's page
is better than a wrong one. Here are lkr-rates' checks, run today:

```console
$ lkr-rates check
  ok       rates are positive
  ok       codes and types are valid
  ok       no dates in the future
  ok       buy is below sell
  ok       data is fresh
  ok       no long gaps in USD
  ok       nothing quarantined recently
  warning  no wild one-day moves: 21 row(s)
           why it matters: a move of more than 20% in a day is rare; check it is real
           2024-03-07, EGP, indicative, 9.966600, 6.212300
           2023-06-15, NGN, indicative, 0.655000, 0.497400
           2022-03-04, RUB, indicative, 2.741700, 1.833000
  ok       newest day has every currency
```

The difference between `ok`, `warning` and a failure is a design decision. A buy rate above
the sell rate can't be right, so that one fails. A move of more than 20% in a day is usually a
mistake, but not always: those rows are Egypt's devaluation in March 2024, Nigeria floating the naira
in June 2023, and the rouble in March 2022. They're real, so they warn, and a person looks.

rain-watch's gate checks every district and day is present, rain is between 0 and 1,000 mm,
and the districts aren't all identical, which is what a broken upstream response tends to
look like. lk-prices rejects a report with too few prices, duplicate rows, or retail prices
below half of wholesale, the sign of a misread column. hiring-warehouse has a dbt test on
every model, including "every job has exactly one current version".

## Wrong data at the source goes in quarantine

Sometimes the source itself is wrong. The Central Bank published a yen sell rate of
2,785.9084 rupees on 25 March 2011. Leaving it in breaks every chart; deleting it hides that
the source said it. So lkr-rates moves the 26 rates like that into `quarantine.csv`, with
the reason, and leaves them out of the main table.

lk-prices does the same at a finer grain. It keeps every price as printed, then flags the
ones the index shouldn't trust, like coconut oil at Rs 570, then 85, then 570 again: a
typing slip. It found nine in ten years. It also uses the source to check itself: each
report repeats the previous report's prices in a "Yesterday" column, and 99.73% of 243,686
of them agree with what the parser read the day before. That's a check on the parser as
much as on the Central Bank.

## Parse what's on the page, not what you expect

The PDFs were the hardest source. lk-prices handles three layouts the Central Bank has used
since 2016, and a PDF that matches none of them is an error, never a guess. It reads the
price table by position, not as text, because a blank cell in plain text slides every
number after it into the wrong market. Reports before June 2017 print no year at all, only
"12-Aug", so the year is the one that puts that day nearest the listing date. And the dates
come from inside each PDF, because the listing's dates are wrong for a few dozen reports.

The result is a food price index from nothing but the Central Bank's market prices. It
stood at 322 in October 2026 (August 2016 = 100). From October 2021 to October 2022 it rose
88%, which falls between the official food inflation figures for September 2022: 85.8% on
the national index, 94.9% in Colombo. Landing between two official numbers is good evidence
the method is sound.

## Ask first, then go slowly

Before scraping anything, I read the terms, not just `robots.txt`. The Central Bank's site
says "All Rights Reserved" and offers no reuse licence, so lk-prices publishes derived
figures only (the index, monthly medians, margins) and links to the original PDFs instead of
republishing the tables. Supermarket sites I looked at forbid redistribution outright, so
they're not in it. Open-Meteo's data is CC BY 4.0, and rain-watch's page credits it.

`cbsl.gov.lk/robots.txt` asks for 10 seconds between requests, so lk-prices waits 10
seconds between every request, and the first full download took about eight hours. The
Central Bank also blocks GitHub's servers, which means lkr-rates and lk-prices can't update
from GitHub Actions. They run on a systemd timer on an ordinary machine instead, and push
the results to GitHub, which publishes the pages.

## What I took from all four

- **Raw first.** Saving the source untouched turns every parser bug into a rebuild instead of
  a re-download.
- **Idempotent loads.** A job that's safe to run twice is a job you can rerun without
  thinking.
- **A gate before publishing.** Stale is better than wrong, and the checks are where you
  decide which mistakes are impossible and which are just unusual.
- **Read the terms.** What you're allowed to publish shapes the product as much as what you
  can parse.

All four are tested (205 tests between them) and update on their own: lkr-rates, rain-watch
and lk-prices from timers, hiring-warehouse from GitHub Actions. Their pages are linked at
the top.
