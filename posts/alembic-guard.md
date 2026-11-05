---
title: 5 Alembic migrations that will take down your prod DB
description: They pass code review and they pass tests. Then they meet a table with real data.
date: 2026-09-30
category: Developer tools
project:
  name: alembic-guard
  kind: CLI and GitHub Action
  links:
  - label: GitHub
    url: https://github.com/ShalomHunukumbura/alembic-guard
  - label: PyPI
    url: https://pypi.org/project/alembic-guard/
  - label: Marketplace
    url: https://github.com/marketplace/actions/alembic-guard
proof:
  command: alembic-guard
  output: |
    migrations/versions/0002_add_email.py:13:5  AG001 error  Adding NOT NULL column "users.email" without a server_default fails on a table with rows.
        fix: Add a server_default, or add the column as nullable, backfill it, then set NOT NULL in a later migration.
    migrations/versions/0002_add_email.py:14:5  AG002 warning  Creating index "ix_users_email" on "users" blocks writes until it is built.
        fix: Pass postgresql_concurrently=True and run it inside `with op.get_context().autocommit_block():`.
    migrations/versions/0002_add_email.py:15:5  AG004 error  Renaming "users.name" to "full_name" breaks code still using the old name.
        fix: Expand and contract: add the new column or table, write to both, backfill, move reads over, then drop the old one in a later release.
    migrations/versions/0002_add_email.py:16:5  AG008 warning  Foreign key from "orders" to "users" is validated while blocking writes on both tables.
        fix: Pass postgresql_not_valid=True, then run `ALTER TABLE ... VALIDATE CONSTRAINT ...` in a separate migration. Validation only takes a light lock.
    Found 2 errors and 2 warnings in 3 migrations.
tags:
- python
- postgres
- sqlalchemy
- devops
---

Here's a migration I'd have approved in code review without a second thought:

```python
def upgrade():
    op.add_column("users", sa.Column("email", sa.String(255), nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.alter_column("users", "name", new_column_name="full_name")
    op.create_foreign_key("fk_orders_user", "orders", "users", ["user_id"], ["id"])
```

It's clean and readable, and it passes CI. Every one of those four lines can break
production.

I've written a few dozen Alembic migrations on a production Postgres platform, and
the lesson that took me longest to learn is this: **a migration's Python can be
perfectly correct and still be dangerous.** The danger isn't in the code. It's in
how Postgres behaves on a table that already has data and traffic. Your dev
database has neither, so your tests can't see it.

Here are the five patterns I look for, what Postgres actually does with each one,
and how to write it safely. The errors below are real: I ran each migration
against Postgres 16 with a seeded table.

---

## 1. Adding a `NOT NULL` column without a default

```python
op.add_column("users", sa.Column("email", sa.String(255), nullable=False))
```

**What happens:** Postgres has to give every existing row a value for `email`.
The column is `NOT NULL` and you didn't give it a default, so there's no valid value
to use.

```
psycopg.errors.NotNullViolation: column "email" of relation "users" contains null values
```

On your empty dev database this works, because there are no rows to fill. On
production it fails halfway through the deploy.

A common trap: `default="..."` on the `Column` **does not help**. That's a
Python-side default SQLAlchemy uses on insert. The database never sees it. You need
`server_default`.

**Safe version:** add it nullable, backfill, then tighten it in a later migration.

```python
op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
# ...backfill in the app or a data migration...
# next migration: make it NOT NULL (see #5 for how to do that safely too)
```

Or, if a constant default makes sense, `server_default=sa.text("''")`. Since
Postgres 11 that's instant, and no rows are rewritten.

---

## 2. Creating an index the normal way

```python
op.create_index("ix_users_email", "users", ["email"], unique=True)
```

**What happens:** a plain `CREATE INDEX` takes a lock that **blocks every
`INSERT`, `UPDATE` and `DELETE`** on the table until the index is built. Reads
keep working, so it's easy to miss. On a big table that's minutes of failed
signups, failed checkouts, failed anything.

I tested it: with an index build open in one session, an insert from another
session with a 1-second `lock_timeout` got:

```
LockNotAvailable: canceling statement due to lock timeout
```

**Safe version:** build it `CONCURRENTLY`. It takes longer, but writes keep flowing.

```python
op.create_index(
    "ix_users_email", "users", ["email"], unique=True, postgresql_concurrently=True
)
```

...but if that's all you change, you walk straight into #3.

---

## 3. Using `CONCURRENTLY` inside Alembic's transaction

Alembic wraps each Postgres migration in a transaction. That's usually what you
want: if step 3 fails, steps 1 and 2 roll back. But Postgres flatly refuses to
run a concurrent index build inside a transaction:

```
ActiveSqlTransaction: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

This one is a guaranteed failure at deploy time, not a "maybe on a big table".

**Safe version:** step out of the transaction for just that operation.

```python
with op.get_context().autocommit_block():
    op.create_index(
        "ix_users_email", "users", ["email"], unique=True, postgresql_concurrently=True
    )
```

---

## 4. Renaming a column (or table)

```python
op.alter_column("users", "name", new_column_name="full_name")
```

**What happens:** the rename itself is instant, and that's the problem. Deploys
aren't. For a window of seconds to minutes, **the old version of your app is still
running**, still selecting `users.name`, and every one of those queries now fails.

Dropping a column has the same problem. SQLAlchemy selects every mapped column,
so even code that never touches the dropped column breaks if the model still has it.

**Safe version: expand and contract.**

1. Add `full_name`. Write to both columns.
2. Backfill `full_name` from `name`.
3. Switch reads to `full_name`. Deploy.
4. Remove `name` from the code. Deploy.
5. *Now* drop `name` in a migration.

It's more steps. It's also the only way to get zero downtime.

---

## 5. Adding a foreign key (or `NOT NULL`, or a check) to a busy table

```python
op.create_foreign_key("fk_orders_user", "orders", "users", ["user_id"], ["id"])
```

**What happens:** Postgres checks that every existing `orders.user_id` points at a
real user, and while it checks it **blocks writes on both tables**. `SET NOT NULL`
is even stronger: it scans the whole table while blocking reads *and* writes.

**Safe version:** add the constraint without checking old rows, then check them
separately under a much lighter lock.

```python
op.create_foreign_key(
    "fk_orders_user", "orders", "users", ["user_id"], ["id"], postgresql_not_valid=True
)
# next migration:
op.execute("ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user")
```

New rows are checked immediately, old rows are checked during `VALIDATE`, and
writes keep flowing the whole time.

For `NOT NULL`, the same trick works: add `CHECK (email IS NOT NULL) NOT VALID`,
validate it, then `SET NOT NULL`. Postgres 12+ sees the valid check and skips the
full scan.

---

## Why code review doesn't catch these

Look back at the migration at the top. Nothing about it is *wrong* Python. The
reviewer would need to know Postgres lock levels, Alembic's transaction behaviour,
and your deploy process, and remember all of it on every PR, forever.

That's a job for a machine.

## So I built one

[**alembic-guard**](https://github.com/ShalomHunukumbura/alembic-guard) is a
linter for Alembic migrations. It reads your migration files with Python's `ast`
module, so there's no database and nothing gets imported or executed, and it flags
all five patterns above plus a few more (type changes, volatile defaults like
`gen_random_uuid()`, unique constraints on existing tables).

![alembic-guard catching a dangerous migration](https://raw.githubusercontent.com/ShalomHunukumbura/alembic-guard/main/docs/demo.gif)

```bash
pip install alembic-guard
alembic-guard
```

Or as a GitHub Action that annotates the exact lines on the PR diff:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: ShalomHunukumbura/alembic-guard@v0
```

By default it only checks migrations the PR changes, so you can add it to a repo with
years of history without drowning in old warnings. It's also smart about context:
an index on a table created *in the same migration* isn't flagged, because
nobody can be using that table yet.

There's a [demo repo](https://github.com/ShalomHunukumbura/alembic-guard-demo/pulls)
with two open PRs building the same feature. The first is the migration from the top of this
post: alembic-guard flags it, and when CI runs it against 50,000 users and
200,000 orders, it crashes with the `NotNullViolation` above. The second is the
zero-downtime version, which passes both.

## One more thing: set a lock timeout

Even with a linter, set this at the top of your migrations (or in `env.py`):

```python
op.execute("SET lock_timeout = '5s'")
```

If a migration can't get its lock within 5 seconds, it fails instead of queueing
behind a long-running query while every other request queues behind *it*. A failed
migration you can retry. A 10-minute pile-up you can't undo.

---

If you use Alembic in production, I'd love to hear which patterns you've been
bitten by that aren't on this list. Issues and PRs are welcome on
[GitHub](https://github.com/ShalomHunukumbura/alembic-guard).
