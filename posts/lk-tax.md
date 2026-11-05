---
title: I checked my tax library against all 75,590 rows of the official tables
description: Sri Lanka's tax rules change mid-year, so lk-tax stores every rule as dated data with its source. Then I tested it against every row of the Inland Revenue's own tables, and found two rows that break the table's own rule.
date: 2026-10-01
category: Tax and payments
project:
  name: lk-tax
  kind: Python package and web calculator
  links:
    - label: Calculator
      url: https://shalomhunukumbura.github.io/lk-tax/
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/lk-tax
    - label: PyPI
      url: https://pypi.org/project/lk-tax/
proof:
  command: pytest tests/test_apit_official_tables.py
tags: [python, finance, testing, srilanka]
---

Most payroll code I've seen has a line like this somewhere:

```python
MONTHLY_RELIEF = 150_000
```

It's correct today. It was wrong for every month before April 2025, when the relief was
Rs. 100,000, so any report, correction or recalculation for an earlier month comes out
wrong. And it'll be wrong again the next time the law changes, which in Sri Lanka is often,
and usually mid-year. In 2026 alone the SSCL registration threshold dropped, VAT on
financial services went to 20.5%, VAT on foreign digital services started, and more
professions came under withholding tax.

So [lk-tax](https://github.com/ShalomHunukumbura/lk-tax) doesn't have a "current rate". It
asks what date you mean:

```python
>>> import lk_tax
>>> lk_tax.apit_monthly(350_000, on="2026-09-30").tax
Decimal('32500.00')
>>> lk_tax.apit_monthly(350_000, on="2025-03-31").tax     # the old rates
Decimal('52500.00')
```

Same salary, Rs. 20,000 a month apart, because the second date is before the April 2025
change. Every answer also carries the rule it used, the dates that rule was in force, and
the Inland Revenue Department notice it came from.

## The rules are data, not code

Each tax lives in a TOML file, and a change in the law is a new version, never an edit:

```toml
[[versions]]
effective_from = 2026-07-01
note = "SSCL (Amendment) Act No. 10 of 2026."
rate = 0.025
quarter_threshold = 9_000_000
annual_threshold = 36_000_000
sources = [
    { title = "Notice PN/SSCL/2026-04/1: SSCL (Amendment) Act No. 10 of 2026", url = "https://www.ird.gov.lk/..." },
]
```

Tests hold the files to three rules: versions are in date order, the first one starts at
the coverage date (1 January 2023), and every version cites an `ird.gov.lk` source. A rule
without a source fails the tests.

It covers APIT (the monthly tax employers deduct from salaries), personal income tax,
withholding tax on 11 kinds of payment, VAT and SSCL. The details are where the bugs live,
so they're in the data too: WHT on service fees applies only once a month's payments to one
person pass Rs. 100,000, and then to the whole amount, not just the excess. If the payer
covers the WHT, the invoice is grossed up. WHT is worked out on the amount before VAT. And
money is `Decimal` all the way through, so `200_000.10` never quietly becomes
`200000.0999…`.

## Testing against the source

Unit tests with numbers I worked out by hand would only prove that the code agrees with me.
The real authority is the IRD's APIT Tax Table No. 01: a 280-page PDF of income ranges and
the tax to deduct for each, which is what employers are told to use.

So I extracted every row of the 2023/24 and 2025/26 tables into fixtures and test lk-tax
against both ends of every range:

```console
$ pytest tests/test_apit_official_tables.py
tests/test_apit_official_tables.py::test_every_row_of_the_official_table[apit_table01_2324.csv.gz-2024-06-30-309150-37794] PASSED [ 20%]
tests/test_apit_official_tables.py::test_every_row_of_the_official_table[apit_table01_2526.csv.gz-2026-09-30-366100-37796] PASSED [ 40%]
tests/test_apit_official_tables.py::test_above_the_table_is_last_row_plus_36_percent[apit_table01_2324.csv.gz-2024-06-30-309150-37794] PASSED [ 60%]
tests/test_apit_official_tables.py::test_above_the_table_is_last_row_plus_36_percent[apit_table01_2526.csv.gz-2026-09-30-366100-37796] PASSED [ 80%]
tests/test_apit_official_tables.py::test_ird_table_quirk_at_275000_is_reproduced PASSED [100%]
============================== 5 passed in 12.60s ==============================
```

That's 37,794 rows from one table and 37,796 from the other: 75,590 rows, every one
matched exactly. Getting there took two discoveries.

## The table doesn't round the way you'd think

The obvious way to get whole rupees from the tax formula is to round to the nearest rupee.
I measured it against the tables: that gets **75,247 of the 151,180 range ends wrong**,
about half of them.

The table is a staircase of whole rupees, and working back from the rows, each step comes
from a slightly different rule: for an income *m*, take the formula at *m* − 0.5 and round
up. It sounds like a detail. On a salary it's at most a rupee. But a library that's off by
a rupee on half the table can't say it matches the official table, and an employer
comparing its output with the PDF finds the difference on the first payslip.

## Two rows where the table breaks its own rule

With that rule, every row matched except two. For salaries of **Rs. 275,005 and 275,006**,
the 2025/26 table says to deduct Rs. 12,501. By the rule every other row follows, it should
be Rs. 12,502. The 275,000 mark is where the 18% band ends and the 24% band begins, and
those two rows were still worked out with the 18% band's formula.

It's one rupee, on two salaries. But it raised a real design question: when the official
table and the law disagree, which one does a tax library follow?

Employers are told to deduct using the table, so lk-tax gives both:

```python
>>> r = lk_tax.apit_monthly(275_005, on="2025-04-01")
>>> r.tax, r.exact_tax
(Decimal('12501.00'), Decimal('12501.20'))
```

`tax` reproduces the table exactly, `exact_tax` is the formula, unrounded, and the two rows
are recorded as an override in the rule data, with a comment saying why. Nobody has to
rediscover it.

## It runs in the browser, with nothing sent anywhere

There's a [web calculator](https://shalomhunukumbura.github.io/lk-tax/) for people who don't
write Python, and it's the same package: [Pyodide](https://pyodide.org) runs lk-tax in the
browser as WebAssembly, so a salary typed into it never leaves the page. GitHub Pages
rebuilds it on every push to `main`, and a test checks that the in-browser answers match
the HTTP API's.

```bash
pip install lk-tax            # the library, no dependencies
pip install "lk-tax[api]"     # plus the HTTP API and the calculator
```

## What I'd tell anyone writing tax code

- **Ask "on what date?"** A rate without a date is only right until the next budget.
- **Keep the source next to the number.** When someone asks "why this amount?", the answer
  should be a link to the notice, not a search through old commits.
- **Test against the authority, not against yourself.** The table found a rounding rule I'd
  have got wrong, and a mistake in the table I'd never have guessed.

lk-tax isn't tax advice, and it doesn't cover everything yet: APIT tables other than No. 01
(lump sums, secondary employment, leaving mid-year) aren't in it. If you find a rule that's
wrong, open an issue with the IRD notice, and it becomes a new version with that notice as
its source.
