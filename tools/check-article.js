/* The article import's cleaner, checked offline (26 Oct 2026).

   Habbo's article files have changed shape more than once — a prerender
   that went away (3 Oct), then WordPress block comments around every
   paragraph (26 Oct, The Secrets of Glukko, whose page showed a screen of
   "<!-- wp:paragraph -->"). Each time the import's cleaner met markup it had
   not been written for. This holds it to every shape seen so far, and to
   the things it exists to stop, so a change to netlify/functions/article.js
   that breaks one fails the build instead of reaching visitors.

   The articles here are made up in the shapes Habbo's files use; none of
   Habbo's own text is copied in. Run: node tools/check-article.js */
"use strict";
const path = require("path");
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "check-article";
const { extract, sanitiseHtml, cleanArticle, leftovers } = require(path.join(__dirname, "..", "netlify", "functions", "article.js"));

const BASE = "https://origins.habbo.com/community/article/1/x";
let checks = 0, failures = 0;
function ok(cond, what) {
    checks++;
    if (!cond) { failures++; console.error("FAIL: " + what); }
}
const visible = (html) => html.replace(/<[^>]*>/g, " ");

/* 1. A WordPress block-editor file, as Habbo's now are. */
const wpFile = `<html><body><article class="news">
  <header class="news-header">
    <img class="news-header__image" src="https://images.habbo.com/web_images/defaults/banner.png">
    <h1 class="news-header__title">A MADE-UP ARTICLE</h1>
    <time>{{ 1793052000000 | date: 'mediumDate' }}</time>
    <a class="news-header__category__link" translate="NEWS_CATEGORY_CAMPAIGNS_ACTIVITIES"></a>
    <p class="news-header__summary">A summary line.</p>
  </header>
  <div class="news-article">
    <p><!-- wp:separator --><br></p><hr class="wp-block-separator"><br><!-- /wp:separator --><p></p>
    <p><!-- wp:image {"id":51,"sizeSlug":"large","align":"center"} --><br></p><figure class="align-center"><img src="https://images.habbo.com/web_images/x.png" alt class="wp-image-51"><figcaption>A caption.</figcaption></figure><br><!-- /wp:image --><p></p>
    <p><!-- wp:heading --></p>
    <h2 class="wp-block-heading">A HEADING</h2>
    <p><!-- /wp:heading --></p>
    <p><!-- wp:paragraph --><br>First paragraph, it&apos;s here&#x2026;<br><!-- /wp:paragraph --></p>
    <p><!-- wp:paragraph --><br>Second, with <em>emphasis</em> and <a href="https://example.com/">a link</a>.<br><!-- /wp:paragraph --></p>
    <!--more-->
    <![CDATA[ hidden ]]>
    <?xml-stylesheet href="x"?>
  </div>
  <div class="news-footer"><a href="/community/article/2">Related news</a></div>
</article></body></html>`;
const a = extract(wpFile, BASE);
ok(a && a.title === "A MADE-UP ARTICLE", "title read");
ok(a && a.date === "Oct 26, 2026", "date filled from the template: " + (a && a.date));
ok(a && a.category === "Campaigns & Activities", "category from its key");
ok(a && a.image === "https://images.habbo.com/web_images/defaults/banner.png", "banner read");
ok(a && !/wp:|<!--|-->|CDATA|xml-stylesheet/.test(visible(a.body)) && !/&lt;/.test(a.body), "no comment, CDATA or PI left as text");
ok(a && a.body.includes("<h3>A HEADING</h3>"), "an <h2> kept as a heading (h3)");
ok(a && a.body.includes("<p>A caption.</p>"), "a figcaption kept as a paragraph");
ok(a && a.body.includes("<p>First paragraph, it&#39;s here…</p>"), "paragraph text with no <br> at its ends, entities decoded");
ok(a && a.body.includes('<a href="https://example.com/" target="_blank" rel="noopener noreferrer">a link</a>'), "links kept and marked as leaving");
ok(a && !/Related news/.test(a.body), "the news footer left out");
ok(a && leftovers(a.body).length === 0, "the import's leftovers check finds nothing: " + (a && leftovers(a.body)));
ok(a && sanitiseHtml(a.body, BASE) === a.body, "cleaning is idempotent");

/* 2. A copy saved while the bug was live: the comments stored as TEXT. */
const saved = { url: BASE, title: "T", body: "<p>&lt;!-- wp:paragraph --&gt;<br></p><p>Kept.</p><p>&lt;!-- wp:image {&quot;id&quot;:5} --&gt;<br></p><p>&lt;!--more--&gt;</p>" };
ok(leftovers(saved.body).length > 0, "the leftovers check sees the broken saved copy");
const cleaned = cleanArticle(saved);
ok(cleaned.body === "<p>Kept.</p>", "a broken saved copy cleans to its text: " + cleaned.body);

/* 3. The older shape (before WordPress): plain markup, unchanged. */
const old = `<article><div class="news-article"><p>Plain <b>old</b> article.</p><ul><li>One</li></ul></div></article>`;
ok(extract(old, BASE).body === "<p>Plain <b>old</b> article.</p><ul><li>One</li></ul>", "an article in the old shape is untouched");

/* 4. The box renamed: the body still found, without its header or footer. */
const renamed = `<article><header><h1 class="news-header__title">R</h1></header><div class="news-content"><p>Body text.</p></div><div class="news-footer"><p>Related</p></div></article>`;
const r = extract(renamed, BASE);
ok(r && r.body.includes("<p>Body text.</p>") && !/Related/.test(r.body) && !/>R</.test(r.body), "a renamed body box still read: " + (r && r.body));

/* 5. What the cleaner is there to stop. */
const nasty = sanitiseHtml(`<p onclick="alert(1)">x</p><script>alert(2)</script><a href="javascript:alert(3)">y</a><img src="data:text/html,z"><style>p{}</style><!--><script>alert(4)</script>-->`, BASE);
ok(!/onclick|<script|javascript:|data:|<style|alert/.test(nasty), "handlers, scripts, bad URLs and styles stopped: " + nasty);
ok(sanitiseHtml("<p>unclosed <!-- comment runs to the end <script>x</script>", BASE) === "<p>unclosed </p>", "an unclosed comment is dropped to the end, as a browser reads it");
ok(leftovers("<p>Plain text with [sic] and 3 &lt; 4</p>").length === 0, "ordinary text is not flagged");
ok(leftovers("<p>&lt;div&gt; and {{ name }}</p>").length === 2, "markup-as-text and placeholders are flagged");

/* 6. Time (27 Oct 2026). events.js cleans every stored article on public
   reads, so a body built to make the cleaner backtrack is an outage, not a
   slow save: 320KB of "<a" took 35 seconds before the tag pattern stopped
   at "<", and the overnight scan found the comment patterns doing the same.
   Generous bounds, so a slow build machine does not fail them. */
const timed = (label, fn) => { const t = Date.now(); fn(); const ms = Date.now() - t; ok(ms < 1500, `${label} cleaned in ${ms}ms`); };
timed("320KB of \"<a\"", () => sanitiseHtml("<a".repeat(160 * 1024), BASE));
timed("320KB of \"<!a\"", () => sanitiseHtml("<!a".repeat(110 * 1024), BASE));
timed("320KB of \"<!--\"", () => sanitiseHtml("<!--".repeat(80 * 1024), BASE));
timed("2MB article saved through cleanArticle", () => cleanArticle({ url: BASE, body: "<p>" + "<a".repeat(1024 * 1024) }));

if (failures) {
    console.error(`check-article: ${failures} of ${checks} checks failed.`);
    process.exit(1);
}
console.log(`check-article OK — ${checks} checks: WordPress block files, saved broken copies, the old shape, a renamed body box, what the cleaner stops, and how long it takes.`);
