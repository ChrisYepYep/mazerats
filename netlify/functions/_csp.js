/* The site's Content-Security-Policy, in one place (4 Nov 2026).

   'unsafe-inline' is gone from script-src. It was only there for the inline
   <script>s the pages keep in their <head> (the Coming Soon/Maintenance gate
   above all, which has to run before anything else loads), and it let any
   script injected into a page run. Each inline script is now named by its
   hash, and nothing else inline runs.

   A hash is only right for the exact bytes, and build-minify rewrites every
   inline script as it builds, so a hash written down by hand would be wrong by
   the time the page shipped, and the script it named (the gate!) would not run.
   So nobody writes them down; they are worked out from the page itself:

     tools/build-dist.js  reads every page in dist/ and writes dist/_headers.
     share.js             reads the home.html it is about to serve.

   Editing an inline script needs nothing else, then. A handler written in
   markup (onclick="...") or a javascript: address cannot be given a hash, so
   build-dist.js fails the build on one rather than ship a dead button.

   NOT IN netlify.toml. Netlify lets netlify.toml override _headers for the
   same path and header, so a copy there would quietly put 'unsafe-inline'
   back. tools/check-share-headers.js fails the build if one appears. So pages
   served as files under `netlify dev` have no policy; share.js's do. */
const crypto = require("crypto");

const POLICY = (scriptHashes) => [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")} https://cloud.umami.is`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://www.habbo.com https://images.habbo.com https://origins.habbo.com https://api.furniindex.com https://cdn.discordapp.com",
    "connect-src 'self' https://cloud.umami.is https://gateway.umami.is",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
].join("; ");

/* The same reading of a page as build-minify's: an HTML comment is only a
   comment outside the elements whose text the browser takes raw, so whichever
   starts first wins. A script with a src has no text to run, and a type other
   than JavaScript (JSON-LD) is data, which a policy doesn't govern. */
const RAW_OR_COMMENT = /<!--[\s\S]*?-->|<(script|style|textarea|title)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const SRC_ATTR = /\ssrc\s*=/i;
const TYPE_ATTR = /\stype\s*=\s*["']?([^"'\s>]*)/i;
const JS_TYPES = /^(?:|module|(?:text|application)\/(?:java|ecma)script)$/i;

function inlineScripts(html) {
    const out = [];
    for (const m of String(html).matchAll(RAW_OR_COMMENT)) {
        if (!m[1] || m[1].toLowerCase() !== "script" || SRC_ATTR.test(m[2]) || !m[3]) continue;
        const type = TYPE_ATTR.exec(m[2]);
        if (type && !JS_TYPES.test(type[1])) continue;
        out.push(m[3]);
    }
    return out;
}

// The browser hashes the script as it parsed it, and parsing makes every line end \n.
const hashOf = (text) => "'sha256-" + crypto.createHash("sha256")
    .update(text.replace(/\r\n?/g, "\n"), "utf8").digest("base64") + "'";

function scriptHashes(pages) {
    const all = new Set();
    for (const html of pages) inlineScripts(html).forEach(s => all.add(hashOf(s)));
    return [...all].sort();
}

// The policy for pages holding these documents. Every page it covers must be among them.
const policyFor = (pages) => POLICY(scriptHashes(pages));

module.exports = { policyFor, scriptHashes, inlineScripts };
