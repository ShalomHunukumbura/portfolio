// Fallback copy of learning-log-store.json for file:// viewing. Regenerate after editing the store (see README).
window.learningLogData = [
  {
    "month": "September 2026",
    "books": [
      {
        "title": "Software Engineering at Google",
        "author": "Titus Winters, Tom Manshreck, Hyrum Wright",
        "note": "Engineering as programming integrated over time: code review, testing culture and Hyrum's Law."
      },
      {
        "title": "Designing Machine Learning Systems",
        "author": "Chip Huyen",
        "note": "Data distribution shifts, feature stores and monitoring models after deployment."
      }
    ],
    "articles": [
      {
        "title": "Your AI Product Needs Evals",
        "url": "https://hamel.dev/blog/posts/evals/",
        "note": "Build evaluation sets and look at real traces before tuning prompts."
      },
      {
        "title": "OWASP Top 10 for LLM Applications",
        "url": "https://genai.owasp.org/llm-top-10/",
        "note": "Prompt injection, insecure output handling and excessive agency as concrete risks."
      },
      {
        "title": "Falsehoods Programmers Believe About Time",
        "url": "https://infiniteundo.com/post/25326999628/falsehoods-programmers-believe-about-time",
        "note": "A checklist for date logic in tax periods, due dates and invoices."
      }
    ],
    "learned": [
      "Any observable behaviour of an API will eventually be depended on (Hyrum's Law), so response shapes deserve the same care as documented contracts.",
      "LLM features need an evaluation set before prompt changes, otherwise 'improvements' are just vibes.",
      "Treat model output as untrusted input: validate it, and never let it trigger privileged actions without checks.",
      "Store timestamps in UTC and convert at the edges; business dates (filing deadlines) are a separate concept from instants."
    ],
    "built": [
      "Built DocSage, a RAG pipeline from scratch (FAISS + BM25 hybrid retrieval, cited answers) with a 54-question eval set showing hybrid search beats either method alone.",
      "Built and published alembic-guard to PyPI: a linter and GitHub Action that flags Alembic migrations likely to lock Postgres tables or break running code.",
      "Redesigned this portfolio and moved the learning log to a single committed JSON source so updates publish reliably."
    ]
  },
  {
    "month": "August 2026",
    "books": [
      {
        "title": "Accelerate",
        "author": "Nicole Forsgren, Jez Humble, Gene Kim",
        "note": "The four key metrics: deployment frequency, lead time, change failure rate and time to restore."
      },
      {
        "title": "Web Application Security",
        "author": "Andrew Hoffman",
        "note": "Recon, common web attacks and defensive design from both sides."
      }
    ],
    "articles": [
      {
        "title": "Continuous Integration",
        "url": "https://martinfowler.com/articles/continuousIntegration.html",
        "note": "Integrate small changes frequently and keep the mainline always releasable."
      },
      {
        "title": "OWASP Top Ten",
        "url": "https://owasp.org/www-project-top-ten/",
        "note": "Broken access control remains the most common real-world issue."
      },
      {
        "title": "The Twelve-Factor App",
        "url": "https://12factor.net/",
        "note": "Config in the environment, stateless processes, dev/prod parity."
      }
    ],
    "learned": [
      "Small, frequent merges reduce both lead time and change failure rate; big-bang releases hide risk.",
      "Authorization checks belong in the service layer on every endpoint, not only in the frontend.",
      "Keeping environments close to production is what makes migrations and deploys boring."
    ],
    "built": [
      "Tightened CI workflows with automated migration checks so schema drift fails the pipeline, not production.",
      "Reviewed endpoint permissions on a feature I own and added missing ownership checks."
    ]
  },
  {
    "month": "July 2026",
    "books": [
      {
        "title": "Working Effectively with Legacy Code",
        "author": "Michael Feathers",
        "note": "Seams, characterization tests and safe ways to change untested code."
      },
      {
        "title": "Tidy First?",
        "author": "Kent Beck",
        "note": "Small structural cleanups separated from behaviour changes."
      }
    ],
    "articles": [
      {
        "title": "Strangler Fig Application",
        "url": "https://martinfowler.com/bliki/StranglerFigApplication.html",
        "note": "Replace legacy systems gradually behind a stable interface."
      },
      {
        "title": "Things You Should Never Do, Part I",
        "url": "https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/",
        "note": "Why full rewrites throw away years of accumulated bug fixes."
      },
      {
        "title": "Is High Quality Software Worth the Cost?",
        "url": "https://martinfowler.com/articles/is-quality-worth-cost.html",
        "note": "Internal quality pays for itself within weeks, not years."
      }
    ],
    "learned": [
      "Write characterization tests that pin current behaviour before refactoring legacy code.",
      "Keep tidying commits separate from behaviour commits so reviews are faster and reverts are safe.",
      "Incremental replacement beats rewrites: every step ships and every step can be rolled back."
    ],
    "built": [
      "Split a large refactor into a structural PR and a behaviour PR, which made review noticeably faster.",
      "Added tests around an existing invoicing flow before changing its calculation logic."
    ]
  },
  {
    "month": "June 2026",
    "books": [
      {
        "title": "Site Reliability Engineering",
        "author": "Betsy Beyer, Chris Jones, Jennifer Petoff, Niall Richard Murphy",
        "note": "SLOs, error budgets, toil and blameless postmortems."
      },
      {
        "title": "Release It! (2nd Edition)",
        "author": "Michael T. Nygard",
        "note": "Stability patterns: timeouts, circuit breakers and bulkheads."
      }
    ],
    "articles": [
      {
        "title": "Postmortem Culture: Learning from Failure",
        "url": "https://sre.google/sre-book/postmortem-culture/",
        "note": "Blameless write-ups focused on systems, not people."
      },
      {
        "title": "Monitoring Distributed Systems",
        "url": "https://sre.google/sre-book/monitoring-distributed-systems/",
        "note": "The four golden signals: latency, traffic, errors, saturation."
      },
      {
        "title": "Designing Robust and Predictable APIs with Idempotency",
        "url": "https://stripe.com/blog/idempotency",
        "note": "Idempotency keys make retries on payment endpoints safe."
      }
    ],
    "learned": [
      "Every outbound call needs a timeout; a missing timeout turns one slow dependency into a full outage.",
      "Payment and invoice endpoints must be idempotent because clients and networks will retry.",
      "A good incident write-up covers timeline, root cause, impact and concrete follow-ups, without blame."
    ],
    "built": [
      "Wrote structured root-cause notes for production incidents I handled, using a consistent template.",
      "Reviewed payment flows for retry safety and duplicate-request handling."
    ]
  },
  {
    "month": "May 2026",
    "books": [
      {
        "title": "AI Engineering",
        "author": "Chip Huyen",
        "note": "Building applications on foundation models: evaluation, RAG, agents and inference cost."
      },
      {
        "title": "Build a Large Language Model (From Scratch)",
        "author": "Sebastian Raschka",
        "note": "Tokenization, attention and training loops, built step by step in PyTorch."
      }
    ],
    "articles": [
      {
        "title": "Building Effective Agents",
        "url": "https://www.anthropic.com/engineering/building-effective-agents",
        "note": "Prefer simple, composable workflows before reaching for autonomous agents."
      },
      {
        "title": "Introducing Contextual Retrieval",
        "url": "https://www.anthropic.com/news/contextual-retrieval",
        "note": "Adding chunk-level context plus BM25 hybrid search improves retrieval."
      },
      {
        "title": "Patterns for Building LLM-based Systems & Products",
        "url": "https://eugeneyan.com/writing/llm-patterns/",
        "note": "Evals, RAG, guardrails, caching and collecting user feedback."
      }
    ],
    "learned": [
      "Most 'agent' problems are better solved as fixed workflows: prompt chaining, routing and tool calls with clear steps.",
      "Retrieval quality, not the model, is usually the bottleneck in RAG; chunking and hybrid search matter more than prompt tweaks.",
      "Understanding attention and tokenization makes context-window and cost trade-offs much easier to reason about."
    ],
    "built": [
      "Experimented with hybrid (keyword + embedding) retrieval on a set of compliance documents.",
      "Worked through the from-scratch GPT notebooks in my ai-ml-learning repository."
    ]
  },
  {
    "month": "April 2026",
    "books": [
      {
        "title": "SQL Performance Explained",
        "author": "Markus Winand",
        "note": "How B-tree indexes work and how to write queries that can use them."
      },
      {
        "title": "Refactoring (2nd Edition)",
        "author": "Martin Fowler",
        "note": "A catalogue of small, behaviour-preserving changes backed by tests."
      }
    ],
    "articles": [
      {
        "title": "Use The Index, Luke",
        "url": "https://use-the-index-luke.com/",
        "note": "Free online companion to the book: composite indexes, pagination and joins."
      },
      {
        "title": "Using EXPLAIN (PostgreSQL docs)",
        "url": "https://www.postgresql.org/docs/current/using-explain.html",
        "note": "Reading query plans, row estimates and actual timings."
      },
      {
        "title": "Accounting for Developers, Part I",
        "url": "https://www.moderntreasury.com/journal/accounting-for-developers-part-i",
        "note": "Double-entry basics: debits, credits and why ledgers must balance."
      }
    ],
    "learned": [
      "Column order in a composite index decides which queries can use it.",
      "Keyset pagination scales better than OFFSET for large tables.",
      "Double-entry thinking makes invoicing and payment data models much easier to validate."
    ],
    "built": [
      "Used EXPLAIN ANALYZE to diagnose slow list endpoints and added targeted indexes via Alembic migrations.",
      "Applied small, test-backed refactors to backend services instead of large rewrites."
    ]
  },
  {
    "month": "March 2026",
    "books": [
      {
        "title": "A Philosophy of Software Design",
        "author": "John Ousterhout",
        "note": "Deep modules, information hiding and fighting complexity incrementally."
      },
      {
        "title": "The Staff Engineer's Path",
        "author": "Tanya Reilly",
        "note": "Big-picture thinking, executing projects and raising the level of the team."
      }
    ],
    "articles": [
      {
        "title": "The Law of Leaky Abstractions",
        "url": "https://www.joelonsoftware.com/2002/11/11/the-law-of-leaky-abstractions/",
        "note": "ORMs and frameworks eventually leak; you still need to know what is underneath."
      },
      {
        "title": "The Joel Test: 12 Steps to Better Code",
        "url": "https://www.joelonsoftware.com/2000/08/09/the-joel-test-12-steps-to-better-code/",
        "note": "A quick health check for team practices."
      },
      {
        "title": "Implementing Stripe-like Idempotency Keys in Postgres",
        "url": "https://brandur.org/idempotency-keys",
        "note": "Atomic phases and recovery points for safe retries."
      }
    ],
    "learned": [
      "Deep modules hide complexity behind small interfaces; shallow wrappers add cost without value.",
      "SQLAlchemy is a leaky abstraction: reading the generated SQL prevents N+1 queries and surprises.",
      "Senior impact comes from writing things down and unblocking others, not just from shipping code."
    ],
    "built": [
      "Turned on SQL echo while debugging and removed N+1 query patterns from a relationship-heavy endpoint.",
      "Started writing short design notes before larger features to align with teammates early."
    ]
  },
  {
    "month": "February 2026",
    "books": [
      {
        "title": "Designing Data-Intensive Applications",
        "author": "Martin Kleppmann",
        "note": "Focused on reliability, scalability, and maintainability patterns."
      },
      {
        "title": "Systems Engineering: Principles and Practice",
        "author": "Alexander Kossiakoff, William N. Sweet, Samuel J. Seymour, Steven M. Biemer",
        "note": "Studied systems thinking and lifecycle-driven engineering practices."
      },
      {
        "title": "Coders at Work: Reflections on the Craft of Programming",
        "author": "Peter Seibel",
        "note": "Long-form interviews with influential programmers on how they learn, debug and design."
      }
    ],
    "articles": [
      {
        "title": "Brillant Python Programmers",
        "url": "https://thedailywtf.com/articles/brillant-python-programmers",
        "note": "Read as a cautionary example of code quality and maintainability."
      },
      {
        "title": "The Wrong Abstraction",
        "url": "https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction",
        "note": "Reinforced the cost of premature abstractions and how to back out safely."
      },
      {
        "title": "The Process of Designing a Product",
        "url": "https://www.joelonsoftware.com/2000/05/09/the-process-of-designing-a-product/",
        "note": "Activity-based planning: design around what users are actually trying to do."
      },
      {
        "title": "The Iceberg Secret, Revealed",
        "url": "https://www.joelonsoftware.com/2002/02/13/the-iceberg-secret-revealed/",
        "note": "Why stakeholders judge progress by what they can see on screen."
      }
    ],
    "learned": [
      "How to design APIs and services for easier long-term maintenance.",
      "How to reduce production debugging time through better observability and schema discipline.",
      "Why removing the wrong abstraction early is often cheaper than scaling accidental complexity.",
      "Effective product design starts by identifying real user activities and designing around how people actually accomplish their goals.",
      "Most of the real effort in software is hidden below the surface; since non-technical stakeholders judge progress by what they see, I need to manage expectations and communicate progress deliberately."
    ],
    "built": [
      "Refined portfolio structure to support dedicated long-term learning logs.",
      "Documented monthly learning workflow for consistent updates."
    ]
  },
  {
    "month": "January 2026",
    "books": [
      {
        "title": "Clean Architecture",
        "author": "Robert C. Martin",
        "note": "Focused on boundaries, dependency direction, and maintainable module design."
      },
      {
        "title": "The Pragmatic Programmer",
        "author": "Andrew Hunt, David Thomas",
        "note": "Reinforced practical engineering habits and iterative delivery."
      }
    ],
    "articles": [
      {
        "title": "Choose Boring Technology",
        "url": "https://boringtechnology.club/",
        "note": "Helped evaluate when stability is better than novelty."
      },
      {
        "title": "A Philosophy of Software Design Notes",
        "url": "https://danluu.com/simple-design/",
        "note": "Captured ideas around reducing complexity and deep modules."
      }
    ],
    "learned": [
      "How to break features into clear layers to reduce cross-module coupling.",
      "Why simple interfaces and consistent naming reduce debugging time.",
      "How to make trade-offs between shipping fast and preserving long-term code quality."
    ],
    "built": [
      "Added collapsible monthly cards for the learning log page.",
      "Improved log structure for easier month-by-month updates."
    ]
  }
];
