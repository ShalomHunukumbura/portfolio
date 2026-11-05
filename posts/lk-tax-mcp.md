---
title: "Designing tools for a user that's a language model"
description: "lk-tax-mcp gives Claude and other AI assistants exact, sourced Sri Lankan tax calculations instead of rates recalled from memory. Most of the work went into the parts a model reads: descriptions, choices and error messages."
date: 2026-10-05
category: AI engineering
project:
  name: lk-tax-mcp
  kind: MCP server
  links:
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/lk-tax-mcp
    - label: PyPI
      url: https://pypi.org/project/lk-tax-mcp/
proof:
  command: calculate_salary_tax(350000, "2026-09-30")
tags: [python, mcp, llm, tax, srilanka]
---

Ask a language model how much tax is deducted from a Sri Lankan salary and it answers
straight away, confidently, with rates from whenever its training data was written. Sri
Lanka rebuilt its salary tax bands in April 2025, and in 2026 alone the SSCL threshold
dropped, VAT on financial services rose and withholding tax reached more professions. A
model recalling "the rate" is right for some dates, wrong for others, and can't show where
any number came from.

[lk-tax-mcp](https://github.com/ShalomHunukumbura/lk-tax-mcp) fixes that by not asking
the model to know anything. It's an [MCP](https://modelcontextprotocol.io) server: a set of
tools an assistant like Claude can call. The arithmetic and the rules come from
[lk-tax](lk-tax.html), my tax library that matches every row of the official tables.
The model only has to pick the right tool and pass the right numbers.

```bash
claude mcp add lk-tax -- uvx lk-tax-mcp
```

## What the model gets back

Here's one call, made through an MCP client the way an assistant makes it:

```console
$ calculate_salary_tax(monthly_income=350000, pay_date="2026-09-30")
APIT on a monthly income of Rs. 350,000.00 paid on 2026-09-30 is Rs. 32,500.00.
The first Rs. 150,000.00 a month is tax-free. Rule in force from 2025-04-01 and
still in force; source: Notice PN/IT/2025-01: revision of income tax rates from 01.04.2025.
```

That's the `summary` field. Next to it are the exact amounts as decimal strings, the bands,
and the rule version with its dates and Inland Revenue sources. I put the one-sentence
summary first because that's what a model quotes. If the sentence already says the date,
the rule and the source, the answer the user sees usually does too.

In a real Claude Code session with only this server connected, a question about a Rs.
350,000 salary "this month and before the April 2025 change" made Claude call the tool
twice, once per date, and answer Rs. 32,500 and Rs. 52,500, each with its IRD notice.

## The user is a model

Every tool in the server is a few lines that call lk-tax. The work was in everything around
those lines, because the person reading the interface isn't a person. A model reads the
tool's description, the description of each parameter and the error messages, then decides
what to do. Each of those is a prompt, and each was written for that reader.

**Dates are explicit.** Every calculation takes the date it applies to, the pay date or the
invoice date, with today as the default. "What was it last year?" gets last year's rules.
A model can't get that from a tool that only knows "the current rate".

**Choices are enumerated.** Withholding tax has 11 payment types, and each one is an enum
value in the schema with its own description:

```text
service_fee: fees to a resident individual who isn't an employee (teaching, commissions,
independent professionals). interest: interest or discount. rent_resident: rent to a
resident. dividend. winnings: lottery, betting or gambling. ...
```

The model doesn't have to guess that "consulting fee" means `service_fee`. If it invents a
type anyway, the call is rejected with the list of valid ones.

**Errors say what to fix.** These are the real messages the model sees:

```console
monthly_income="three lakhs"   →  monthly_income must be a number, got 'three lakhs'
pay_date="2022-06-30"          →  Not covered: lk-tax covers 2023-01-01 onwards, not 2022-06-30.
```

A model that gets "Error" tries again with the same input, or gives up and guesses. A model
that gets "must be a number" converts "three lakhs" to 300000. One that gets "Not covered"
tells the user the date is outside what the server knows, which is the right answer.

There's a detail in how that works. The MCP SDK hides the text of unexpected exceptions
from the model, on purpose: a stack trace can leak internals. So the server turns lk-tax's
input errors, and only those, into `ToolError`, the one exception whose message the model
sees. Anything else is a bug, and stays hidden.

**It says what it doesn't cover.** The server's instructions tell the model the gaps: lump
sums, bonuses paid once, non-resident employees, deciding whether a supply is VAT-exempt,
and dates before 2023. They tell it to say so rather than estimate. A tool that only
describes what it can do invites the model to stretch it.

## Safe to call without asking

Every tool is a pure calculation: no network access, no files, no credentials. All nine
are annotated `readOnlyHint` and `idempotentHint`, so a client can let the model call them
freely, without asking the user each time.

The tests hold the whole surface to that. Every tool must be read-only, idempotent and not
destructive. Every tool and every parameter must have a description. And one test starts
the real `lk-tax-mcp` command and talks to it over stdio, the way a client would, so a
packaging mistake fails the tests too. Another checks that the enums list exactly the payment
types and activities lk-tax knows, so the two can't drift apart. That's 29 tests, all passing.

| Tool | Answers |
| --- | --- |
| `calculate_salary_tax` | APIT on a month's salary, from the official table |
| `calculate_annual_income_tax` | Income tax for a year, with the bands |
| `calculate_withholding_tax` | WHT on 11 payment types, with thresholds and grossing up |
| `calculate_vat`, `check_vat_registration` | VAT on a price, and whether a business must register |
| `calculate_sscl`, `check_sscl_registration` | SSCL on turnover, and the registration test |
| `get_tax_rules`, `get_rule_history` | The rules on a date, and every change since 2023 |

It's on PyPI and listed in the official MCP Registry, so `uvx lk-tax-mcp` is the whole
install.

## What I'd tell anyone writing tools for models

- **Write descriptions for the reader you have.** Every string the model sees is part of
  the prompt, so it needs the care a prompt gets.
- **Make errors actionable.** The model will act on them. Give it something to act on.
- **Put the source in the answer.** If the result carries its rule and its notice, the model
  passes them on, and the user can check the number.

It isn't tax advice. Every figure it returns links to the IRD document it came from, so
anyone can check it.
