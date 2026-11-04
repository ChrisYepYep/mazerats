/* Gives every helper in netlify/functions a plain 404, on the way to the deploy
   (4 Nov 2026).

   Netlify makes a URL of every file in that folder, so /.netlify/functions/_auth
   and the rest of the shared helpers can be asked for like a function. Having no
   handler, each answered 502 with a stack trace of Netlify's paths, and each ask
   was an invocation the site pays for, past the rate limit and the Errors tab.

   The obvious fixes do not work. A netlify.toml redirect is refused outright:
   Netlify's parser will not take a `from` under /.netlify. Moving the helpers to
   a subfolder would (a folder with no file of its own name is not a function),
   but it rewrites a require in nearly every function, for files read by __dirname
   and listed in included_files.

   So each helper gets a handler here, appended in the throwaway clone Netlify
   builds from, where a new helper cannot be forgotten and nobody has to read it:
   a 404, from the CDN after the first ask at each edge (any query, so a changed
   one is not a new ask). The source files stay as they are, so `netlify dev`
   still answers 502 for them.

   Refuses to run anywhere but Netlify's build, as build-minify does: run by hand
   it would write to the working copy. --force and a folder to do it elsewhere. */
const fs = require("fs");
const path = require("path");

const force = process.argv.indexOf("--force");
const dir = force !== -1
    ? path.resolve(process.argv[force + 1] || "")
    : path.resolve(__dirname, "..", "netlify", "functions");
if (process.env.NETLIFY !== "true" && !process.env.DEPLOY_PRIME_URL && force === -1) {
    console.log("build-helper-urls (DRY RUN: not on Netlify, nothing written)");
    process.exit(0);
}

const HANDLER = `
;module.exports.handler = async () => ({
    statusCode: 404,
    headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=3600",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=604800",
        "Netlify-Vary": "query=_"
    },
    body: '{"error":"Not found"}'
});
`;

let done = 0;
for (const name of fs.readdirSync(dir)) {
    if (!/^_.*\.js$/.test(name)) continue;
    const file = path.join(dir, name);
    const source = fs.readFileSync(file, "utf8");
    // A failed deploy leaves the last good one live, so this is worth stopping for.
    if (/\bexports\.handler\b/.test(source)) {
        console.error(`build-helper-urls: ${name} is a helper with a handler of its own; a function's name must not start with _`);
        process.exit(1);
    }
    fs.writeFileSync(file, source + HANDLER, "utf8");
    done++;
}
console.log(`build-helper-urls: ${done} helpers answer 404`);
