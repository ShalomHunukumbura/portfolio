---
title: A PayHere handler can check the signature and still give away 500 credits
description: PayHere tells your server about payments by POSTing to a URL you can't test on localhost. The bugs that cost money are on the paths you never click through. payhere-sim sends them all, signed, to your machine.
date: 2026-10-05
category: Tax and payments
project:
  name: payhere-sim
  kind: CLI and Python library
  links:
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/payhere-sim
    - label: PyPI
      url: https://pypi.org/project/payhere-sim/
proof:
  command: payhere-sim check http://localhost:8000/payhere/notify
tags: [python, payments, webhooks, srilanka]
---

Here's a PayHere notification handler. It checks the signature, and it skips orders that
are already paid:

```python
if order["status"] == "paid":
    return
send_receipt_email(order["id"])
conn.execute("update orders set status = 'paid' ...")
conn.execute("update users set credits = credits + 100 ...")
```

It passes the obvious tests. Pay once: 100 credits. Send the same notification again: it
sees the order is paid and does nothing. It looks done.

Now send five copies of that notification at the same moment, the way retries can arrive.
The customer pays Rs. 1,000 once and gets **500 credits**.

## Why nobody tests this

[PayHere](https://www.payhere.lk) is how a lot of Sri Lankan sites take card payments. When
a payment happens, PayHere POSTs a signed notification to your server's `notify_url`, and
that's the real confirmation. The customer's redirect back to your site proves nothing: they
can close the tab before it happens, or type the URL themselves.

PayHere's own documentation says it plainly: "you cannot test the payment notification on
localhost." So most integrations get tested once, through the sandbox, behind a tunnel,
on the happy path. The bugs that cost money are on every other path:

- **Duplicates.** A notification can arrive more than once, sometimes at the same moment.
- **Order.** A failed attempt's notification can arrive after the successful one.
- **Forgeries.** `notify_url` is public. Anyone can POST to it.
- **Wrong amounts.** If the checkout hash is made in the browser, a customer can change
  the price and pay less.

## payhere-sim

[payhere-sim](https://github.com/ShalomHunukumbura/payhere-sim) sends all of those to your
machine, signed exactly as PayHere signs them, and checks what your app did with each one.
It can't see your database, so you give it two hooks: a URL (or a shell command) that
creates a fresh unpaid order, and one that reads an order's state back as JSON. Every
scenario gets its own order, so one bug can't hide another.

Here it is against the handler above. This is the
[example shop](https://github.com/ShalomHunukumbura/payhere-sim/tree/main/examples/credits-shop)
in the repo, running with its buggy handler on purpose:

```console
$ payhere-sim check http://localhost:8000/payhere/notify --new-order http://localhost:8000/orders --probe "http://localhost:8000/orders/{order_id}"
payhere-sim check → http://localhost:8000/payhere/notify

  ✓ ignores a notification with a forged signature
  ✗ ignores a signed success for less than the order total
      state changed: credits: 0 → 100; status: unpaid → paid
  ✗ ignores a signed success in the wrong currency
      state changed: credits: 0 → 100; status: unpaid → paid
  ✓ records a valid success notification
  ✓ processes a repeated notification only once
  ✗ keeps the order paid when a late 'pending' arrives
      state changed: status: paid → pending
  ✗ keeps the order paid when an earlier failed attempt arrives late
      state changed: status: pending → failed
  ✗ processes simultaneous duplicates only once
      5 at once vs one: credits: 100 → 500
  ✓ answers valid notifications with HTTP 2xx
  ✓ records a chargeback

5 passed, 5 failed · orders used: 1, 2, 3, 4, 5
```

I've cut the advice under each failure to keep it short. In the real output, every ✗ says
how to fix it, and the exit code is 1, so it runs in CI.

Look at the fifth and eighth checks together. "Processes a repeated notification only once"
passes, and "processes simultaneous duplicates only once" fails. That's the trap: the
"already paid?" check works when duplicates arrive one after another, so a manual retest
in the sandbox says it's fixed. It fails only when two requests both read "unpaid" before
either one writes "paid".

## The fix is a few lines

```python
# one atomic update decides who fulfils the order
paid = conn.execute(
    "update orders set status = 'paid' ... where id = ? and status != 'paid'", ...
).rowcount
if paid:
    conn.execute("update users set credits = credits + 100 ...")
```

The database decides who wins. Exactly one of the five requests changes a row, and only
that one adds credits. A unique constraint on `payment_id` does the same job. The other
failures are just as short: check `payhere_amount` and `payhere_currency` against the
order before marking it paid, and never move an order backwards from paid because an older
status arrived late.

With those changes, the same shop passes every check:

```console
$ payhere-sim check http://localhost:8000/payhere/notify ...
  ✓ ignores a notification with a forged signature
  ✓ ignores a signed success for less than the order total
  ✓ ignores a signed success in the wrong currency
  ✓ records a valid success notification
  ✓ processes a repeated notification only once
  ✓ keeps the order paid when a late 'pending' arrives
  ✓ keeps the order paid when an earlier failed attempt arrives late
  ✓ processes simultaneous duplicates only once
  ✓ answers valid notifications with HTTP 2xx
  ✓ records a chargeback

10 passed · orders used: 1, 2, 3, 4, 5
```

## A checkout that explains itself

The other painful part of a PayHere integration is the checkout hash. Get it wrong and the
sandbox says "Unauthorized payment request", and nothing else.

`payhere-sim serve` runs a local checkout page. Point your form at it instead of the
sandbox, and it checks every field, verifies the hash, and if the hash is wrong, works out
the usual mistake: the amount not formatted as `1000.00`, the secret not hashed or not
uppercased, a lowercase hash, fields in the wrong order. Then you pick success, failure,
pending or cancel, and it sends the signed notification to your `notify_url`, localhost
included, and shows you what your app answered.

## How I know the signatures are right

A simulator with a slightly wrong signature is worse than none: your handler would learn to
accept notifications PayHere never sends. The fields, status codes and both MD5 signatures
follow PayHere's Checkout API documentation, and they're tested against an independent
implementation, not just against payhere-sim's own code.

What it doesn't claim: PayHere's docs don't describe its retry schedule, so the duplicate
and ordering checks are what any webhook handler should survive, not a model of exactly
when PayHere retries.

```bash
pipx install payhere-sim
payhere-sim check http://localhost:8000/payhere/notify --new-order ... --probe ...
```

It has no dependencies beyond Python 3.10, and it isn't affiliated with PayHere. If your
handler passes everything, you've closed the paths where payments go wrong. If it doesn't,
you found out on your laptop instead of from a customer.
