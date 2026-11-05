---
title: Embeddings and keyword search miss different questions. That's why you use both.
description: DocSage answers questions from 37 engineering documents and cites every claim. I built the retrieval without a framework, measured each piece on 54 questions, and kept the refusal threshold that scored worse on paper.
date: 2026-09-30
category: AI engineering
project:
  name: DocSage
  kind: RAG in plain Python
  links:
    - label: GitHub
      url: https://github.com/ShalomHunukumbura/docsage
proof:
  command: python eval/run_eval.py
  output: |
    | Mode    | Hit@1 | Hit@3 | Hit@5 | MRR   |
    | dense   | 86%   | 93%   | 100%  | 0.911 |
    | keyword | 86%   | 95%   | 98%   | 0.915 |
    | hybrid  | 93%   | 100%  | 100%  | 0.960 |
tags: [python, rag, llm, search, evaluation]
---

Ask [DocSage](https://github.com/ShalomHunukumbura/docsage) "How should an app store its
configuration?" and it answers from the Twelve-Factor App, with numbered citations that
link to the exact section. Ask it who won the 2018 World Cup and it says it doesn't know,
without calling the LLM at all.

It's retrieval-augmented generation over 37 openly licensed engineering documents: the
Twelve-Factor App, Google's code review guide, the OWASP Top 10, SemVer, Conventional
Commits and three PEPs. I wrote it without LangChain or LlamaIndex. That wasn't to prove a
point. In RAG, the answer can only be as good as the passages the model is given, and I
wanted every step that picks those passages to be a small file I could read, measure and
change.

## Measure retrieval before you tune anything

Most RAG demos are judged by reading a few answers and deciding they look good. That
tells you nothing about the questions you didn't try. So before tuning anything, I wrote
an evaluation set: 42 questions the documents can answer, each labelled with the document
that answers it, and 12 they can't.

The questions paraphrase the documents instead of quoting them. A question that copies the
document's wording gives keyword search a free win and makes the numbers look better than
real use.

The eval scores retrieval only, with no LLM involved. It asks one thing: is a passage from
the right document near the top? Here it is, rerun today against the saved index:

```console
$ python eval/run_eval.py
42 answerable and 12 unanswerable questions over 37 documents (312 chunks of up to 200 words).

| Mode    | Hit@1 | Hit@3 | Hit@5 | MRR   |
| dense   | 86%   | 93%   | 100%  | 0.911 |
| keyword | 86%   | 95%   | 98%   | 0.915 |
| hybrid  | 93%   | 100%  | 100%  | 0.960 |
```

Dense is embedding search (`all-MiniLM-L6-v2` in an exact FAISS index). Keyword is BM25.
Hybrid merges the two.

## They fail on different questions

Dense and keyword search score the same at the top, 86%, but they don't miss the same
questions. That's the whole case for hybrid search, and two questions from the eval show
it:

```console
# rank of the right document, for two of the eval's questions
What should a process do when it receives SIGTERM?
  dense    rank 4
  keyword  rank 1
  hybrid   rank 2
Should my app write and rotate its own log files?
  dense    rank 1
  keyword  rank 4
  hybrid   rank 1
```

Embeddings are bad at exact terms. "SIGTERM" is a precise token, and the embedding for the
question lands closer to passages about processes and concurrency in general than to the
one that names the signal. BM25 finds it straight away.

BM25 is bad at paraphrase. The Twelve-Factor page on logs never says "rotate my own log
files" the way the question does, so BM25 ranks a Conventional Commits page first, because
it happens to share more of the question's words. The embedding understands what's being
asked.

Hybrid search runs both and merges them with reciprocal rank fusion. Each passage scores
`1 / (60 + rank)` in each list, and the scores add up:

```python
for ranking in rankings:
    for rank, (pos, _) in enumerate(ranking, start=1):
        fused[pos] = fused.get(pos, 0.0) + 1.0 / (RRF_K + rank)
```

The 60 is the usual constant, and it's what makes fusion work. It flattens the gap between
first and second place, so a passage both methods rank well beats one that only a single
method ranked first. Fusion uses only ranks, so it never has to compare a cosine
similarity with a BM25 score, which are on different scales.

That's five lines, and BM25 itself is about fifty. The result: the right document first for
93% of questions instead of 86%, and every question's answer in the top 3.

To be honest about the size: 93% against 86% of 42 questions is 39 against 36. Three
questions. It's a real, repeatable difference on this set, not a benchmark result, and the
more useful number is the second one: hybrid has no question outside its top 3, while each
method alone has some at rank 4 or lower.

## Chunks that know where they came from

A passage like "Use a safe API… parameterized queries" doesn't always say *injection*. Cut out of its page, neither search method knows what it's
about.

So documents are split along their own headings, lists and code blocks are kept whole, and
each chunk is embedded with its heading path in front: `A03: Injection > How to Prevent`.
Both kinds of search get the context the text itself leaves out.

I also measured chunk size. 100, 200 and 300 words scored an MRR of 0.966, 0.960 and 0.964,
which is noise on 42 questions. The default stays at 200 words, which gives the model more
context per citation. Knowing that a setting doesn't matter is a result too.

## The threshold that scored worse on paper

DocSage refuses before calling the LLM when the closest passage in the whole index is
below a cosine similarity threshold. The eval sweeps it:

| Threshold | Answerable questions let through | Unanswerable questions stopped |
| --- | --- | --- |
| 0.30 | 100% | 75% |
| **0.35 (default)** | **100%** | **83%** |
| 0.40 | 98% | 100% |
| 0.50 | 88% | 100% |

On paper, 0.40 wins: it stops every unanswerable question and loses only one answerable
one. I kept 0.35, and the reason is in the similarity scores:

```console
# closest passage's similarity, per question
0.115  Who won the 2018 World Cup?
0.370  How do I write a SQL window function?
0.375  Which algorithms should be used to hash stored passwords?
0.395  How do I set up a Python virtual environment?
```

The password question is real: OWASP answers it. The other two are near misses that the
documents don't cover. And the real one sits *between* them. No threshold separates those
cleanly, and picking one that happens to fit 12 unanswerable examples would be fitting to
noise.

So the gate does a narrower job. It throws out the clearly off-topic questions, which score
around 0.1 to 0.2, for free. Near misses go to the LLM, which is told to answer "I don't
know" when the sources don't contain the answer. A wrong refusal costs more than one extra
LLM call.

## What I took from it

- **Write the eval first.** Every decision here, from hybrid search to chunk size to the
  threshold, came from a table, not from reading three answers and liking them.
- **Use two retrievers that fail differently.** Their mistakes don't overlap, so merging
  them by rank fixes both.
- **Don't let the metric pick the threshold.** The best-scoring value on 12 examples was the
  wrong one, and only looking at the actual questions showed it.

It runs with any OpenAI-compatible API, with Groq's free tier as the default. Search works
with no key at all. The index is under 1 MB, there's a Docker image, and 42 tests run
offline with a fake embedder and a fake LLM.
