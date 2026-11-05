# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown>=3.6", "pyyaml>=6", "jinja2>=3.1"]
# ///
"""Build the blog from posts/*.md: blog.html, blog/<slug>.html and blog/feed.xml.

Each post is Markdown with YAML front matter (title, description, date, category,
project). The output is plain HTML next to the rest of the site, so GitHub Pages serves
it as is. Run it after adding or editing a post, and commit what it writes:

    uv run scripts/build_blog.py
"""

from __future__ import annotations

import html
import math
import re
from dataclasses import dataclass, field
from datetime import date
from email.utils import format_datetime
from datetime import datetime, timezone
from pathlib import Path

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "posts"
OUT = ROOT / "blog"
SITE = "https://shalomhunukumbura.github.io/portfolio"
WORDS_PER_MINUTE = 230
PROOF_LINES = 6

FRONT_MATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
CONSOLE = re.compile(r"```console\n(.*?)```", re.DOTALL)


@dataclass
class Post:
    slug: str
    title: str
    description: str
    date: date
    category: str
    project: dict
    tags: list[str]
    body: Markup
    toc: list[dict]
    minutes: int
    proof: dict | None
    prev: "Post | None" = field(default=None, repr=False)
    next: "Post | None" = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"blog/{self.slug}.html"

    @property
    def category_id(self) -> str:
        return slugify(self.category)

    @property
    def date_label(self) -> str:
        return f"{self.date.day} {self.date:%b %Y}"


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


SEVERITY = re.compile(r"(?<![\w-])(error|warning|note|FAILED|PASSED|passed|failed)(?![\w-])")
RULE_CODE = re.compile(r"\b([A-Z]{2,3}\d{3})\b")


def highlight(line: str) -> str:
    """Colour rule codes and severities in console output. Takes and returns escaped HTML."""
    if line.startswith("$ "):
        return f'<span class="t-cmd">{line}</span>'
    line = RULE_CODE.sub(r'<span class="t-code">\1</span>', line)
    return SEVERITY.sub(lambda m: f'<span class="t-{m.group(1).lower()}">{m.group(1)}</span>', line)


def console_html(block: str) -> str:
    return "\n".join(highlight(line) for line in block.split("\n"))


def proof_of(source: str, chosen: dict | None) -> dict | None:
    """The terminal shown on a post's card: a command and a few lines of real output.

    By default it's the post's first console block. Front matter can pick another
    (`proof: {block: 2, command: pytest}`) or give the output itself
    (`proof: {command: alembic-guard, output: ...}`) when the post doesn't show it.
    """
    chosen = chosen or {}
    if "output" in chosen:
        text = chosen["output"]
    else:
        blocks = CONSOLE.findall(source)
        index = chosen.get("block", 1) - 1
        if index >= len(blocks):
            return None
        text = blocks[index]
    lines = text.rstrip("\n").split("\n")
    command = chosen.get("command", "")
    if lines and lines[0].startswith("$ "):
        command = command or lines[0][2:]
        lines.pop(0)
    # Banner lines (=== title ===) and fix lines take space without showing a finding.
    lines = [
        line
        for line in lines
        if not line.startswith("    fix:") and not re.fullmatch(r"=+( [^=]+ )?=+", line.strip())
    ][:PROOF_LINES]
    return {
        "command": command,
        "html": Markup("\n".join(highlight(html.escape(line, quote=False)) for line in lines)),
    }


def render_body(source: str) -> tuple[Markup, list[dict]]:
    md = markdown.Markdown(
        extensions=["fenced_code", "tables", "toc", "sane_lists", "smarty"],
        extension_configs={"toc": {"toc_depth": "2"}},
    )
    body = md.convert(source)
    # Console blocks become terminal frames with coloured codes and severities.
    body = re.sub(
        r'<pre><code class="language-console">(.*?)</code></pre>',
        lambda m: f'<pre class="term"><code>{console_html(m.group(1).rstrip())}</code></pre>',
        body,
        flags=re.DOTALL,
    )
    # Wide tables scroll inside their own box instead of widening the page.
    body = body.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    # Links out of the site open in a new tab, like the rest of the portfolio.
    body = re.sub(
        r'<a href="(https?://[^"]+)">',
        r'<a href="\1" target="_blank" rel="noopener noreferrer">',
        body,
    )
    toc = [{"id": t["id"], "name": html.unescape(t["name"])} for t in md.toc_tokens]
    return Markup(body), toc


def load() -> list[Post]:
    posts = []
    for path in sorted(POSTS.glob("*.md")):
        text = path.read_text()
        found = FRONT_MATTER.match(text)
        if not found:
            raise SystemExit(f"{path.name} has no front matter")
        meta = yaml.safe_load(found.group(1))
        source = text[found.end() :]
        body, toc = render_body(source)
        words = len(re.findall(r"\w+", source))
        posts.append(
            Post(
                slug=path.stem,
                title=meta["title"],
                description=meta["description"],
                date=meta["date"],
                category=meta["category"],
                project=meta["project"],
                tags=meta.get("tags", []),
                body=body,
                toc=toc,
                minutes=max(1, math.ceil(words / WORDS_PER_MINUTE)),
                proof=proof_of(source, meta.get("proof")),
            )
        )
    # Newest first; posts from the same day keep their file order.
    posts.sort(key=lambda p: p.date, reverse=True)
    for newer, older in zip(posts, posts[1:]):
        newer.next = older
        older.prev = newer
    return posts


def feed(posts: list[Post]) -> str:
    items = []
    for p in posts:
        published = datetime(p.date.year, p.date.month, p.date.day, tzinfo=timezone.utc)
        items.append(
            "  <item>\n"
            f"    <title>{html.escape(p.title)}</title>\n"
            f"    <link>{SITE}/{p.url}</link>\n"
            f"    <guid>{SITE}/{p.url}</guid>\n"
            f"    <pubDate>{format_datetime(published)}</pubDate>\n"
            f"    <description>{html.escape(p.description)}</description>\n"
            "  </item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n<channel>\n'
        "  <title>Shalom Hunukumbura, blog</title>\n"
        f"  <link>{SITE}/blog.html</link>\n"
        "  <description>One post for every project I ship.</description>\n"
        + "\n".join(items)
        + "\n</channel>\n</rss>\n"
    )


def main() -> None:
    posts = load()
    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )
    categories = sorted({p.category for p in posts})
    projects = len({p.project["name"] for p in posts})
    common = {"site": SITE, "year": date.today().year}

    (ROOT / "blog.html").write_text(
        env.get_template("blog.html.j2").render(
            posts=posts,
            categories=[{"id": slugify(c), "name": c} for c in categories],
            projects=projects,
            **common,
        )
    )
    OUT.mkdir(exist_ok=True)
    for stale in OUT.glob("*.html"):
        if stale.stem not in {p.slug for p in posts}:
            stale.unlink()
    for p in posts:
        (OUT / f"{p.slug}.html").write_text(env.get_template("post.html.j2").render(post=p, **common))
    (OUT / "feed.xml").write_text(feed(posts))
    print(f"built blog.html and {len(posts)} posts in blog/")


if __name__ == "__main__":
    main()
