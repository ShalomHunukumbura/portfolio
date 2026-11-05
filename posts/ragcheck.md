---
title: "The pull request that broke four answers out of five, and passed review"
description: "Changes that break a RAG pipeline rarely look dangerous. ragcheck runs yours on questions with known answers and fails CI when the answer, its evidence or the right document stops coming back. No LLM judge, no API key."
date: 2026-10-29
category: AI engineering
project:
  name: ragcheck
  kind: CLI and GitHub Action
  links:
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/ragcheck
    - label: PyPI
      url: https://pypi.org/project/ragcheck-ci/
    - label: Demo pull request
      url: https://github.com/ShalomHunukumbura/ragcheck-demo/pull/1
proof:
  block: 1
  command: ragcheck-ci --dataset questions.jsonl ... --k 3
tags: [python, rag, llm, testing, ci]
---

Here's a pull request I'd approve. A RAG assistant sends every retrieved document to the
model, and that costs tokens, so the change keeps only the first sentence of each document.
Two lines. The diff is obviously correct, the unit tests pass, and retrieval still works.

The assistant stops answering four questions out of five.

The answers were in the second and third sentences. Nothing in the diff says so, nothing in
the tests checks it, and nobody notices until a customer asks how long they have to request
a refund.

## Tests for what the pipeline says

[ragcheck](https://github.com/ShalomHunukumbura/ragcheck) is a test for that. You write
down a few questions your users really ask, with what any correct answer must contain:

```json
{"id": "refund-window", "question": "How long do customers have to request a refund?", "answer_contains": ["30 days"], "relevant_doc_ids": ["policy-refunds"]}
```

Your pipeline answers each one and writes down what it did: the answer, and the chunks it
retrieved, in order. ragcheck checks three things for every question, and fails CI when any
of them drops below its threshold.

Here's the trimming change, run against the example pipeline in the repo:

```console
$ ragcheck-ci --dataset questions.jsonl --predictions predictions.jsonl --k 3
ragcheck: 5 cases, retrieval cutoff k=3

  Answer pass rate     20.0%  needs 100.0%  below
  Grounded pass rate   20.0%  needs 100.0%  below
  Retrieval recall@3   60.0%  needs 100.0%  below

Cases needing attention:
  refund-window
    missing answer phrase: "30 days"
    missing evidence phrase: "30 days"
  colombo-delivery
    missing answer phrase: "2 working days"
    missing evidence phrase: "2 working days"
    missing relevant docs: shipping-times

RAG checks failed: 3 of 3 metrics below their threshold.
```

I've cut two of the four failing cases to keep it short. Without the change, the same run
passes all three metrics at 100% and exits 0. With it, the exit code is 1 and the build
fails. The [demo pull request](https://github.com/ShalomHunukumbura/ragcheck-demo/pull/1)
shows the same change failing its check on a real pull request.

## Three checks, because RAG fails in three places

- **Answer pass rate.** Does the answer contain every required phrase? This is what the
  user sees.
- **Grounded pass rate.** Does the answer pass, *and* is every phrase in the retrieved text
  too? An answer that says "30 days" when the retrieved chunks don't is guessing, or
  remembering. It might be right today. It's not grounded, and it'll drift.
- **Retrieval recall@k.** Of the documents that should come back, how many are in the top
  *k*? This one tells you whether retrieval broke, or generation did.

Together they point at the broken part. In the output above, `refund-window` lost its
answer and its evidence, but not its document: the right document still came back, cut
short. `colombo-delivery` lost the document too. Retrieval matches words, and with only
one sentence left, the shipping page no longer matched the question.

## Why there's no LLM judge

Most RAG evaluation tools ask another model to grade the answers. That's useful when you're
exploring. It's a poor fit for CI. A model grader costs money on every pull request, needs
an API key in CI, and can give a different grade to the same answer twice. A check that
flickers gets ignored, and then it's worse than none.

ragcheck's checks are phrase matches, case-insensitive, and nothing else. The same inputs
always give the same result, so when it fails, something in your pipeline changed. It has
no dependencies beyond Python 3.10, and the 29 tests run in under a second.

The trade-off is real, and the README says it plainly. A paraphrase fails: "one month"
doesn't contain "30 days". And a long answer can contain the phrase and still say
something wrong. So it's a regression signal, not a judge of correctness. The trick is to
pick phrases any correct answer must contain: numbers, names, the steps of a procedure.
"30 days" is a good phrase. "Refunds are easy" isn't.

## In a pull request

```yaml
- uses: ShalomHunukumbura/ragcheck@v0
  with:
    dataset: eval/questions.jsonl
    predictions: /tmp/predictions.jsonl
    command: python eval/run_pipeline.py
    min-answer-pass-rate: "0.95"
    min-grounded-pass-rate: "0.95"
    min-retrieval-recall: "0.90"
```

The Action runs your pipeline, checks the result, puts the full table in the job summary,
and marks each metric below its threshold as an error on the pull request. Ten to thirty
questions covering the answers that matter most is enough to start.

## Where it came from

[DocSage](docsage.html), my RAG project from a month earlier, taught me that its evaluation
set was the most useful thing in it: every design decision came from it. An eval script
only helps when someone runs it, though. ragcheck is the part of that idea that belongs in
CI: small, fast, deterministic, and run on every change, including the ones that look too
small to matter.

```bash
pip install ragcheck-ci
```

(`ragcheck` was taken on PyPI, so the package and the command are `ragcheck-ci`.)
