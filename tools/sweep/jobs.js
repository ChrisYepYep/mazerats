/* What tools/sweep.js loads: every page, at each size, in each look.

   A JOB is one page load at one size in one look, then a run of views
   opened in it (tools/sweep/steps.js). The full sweep is every look at a
   computer and a phone, and the commonest looks at every other size;
   --quick keeps a computer and a phone in the looks most visitors see. */
const SIZES = {
    "1440": [1440, 900, false], "1024": [1024, 768, false], "768": [768, 1024, true], "414": [414, 896, true],
    "390": [390, 844, true], "360": [360, 740, true], "844x390": [844, 390, true]
};
const YEAR = new Date().getUTCFullYear();
/* The looks. A palette is the site's setting (skin off); a season is the
   date moved to inside its skin's dates, with the skin left to them. Dark on
   is the bulb; under the Frost palette (and so the Christmas skin) the bulb
   is the daytime light mode instead (css/theme-frostlight.css), so those
   two with the bulb on are named "frostlight". */
const pal = t => ({ patch: { skin: "off", theme: t } });
const MODES = {
    classic: pal("classic"), crimson: pal("crimson"), purple: pal("purple"), frost: pal("frost"), pumpkin: pal("pumpkin"), witch: pal("witch"),
    halloween: { date: `${YEAR}-10-31T12:00:00Z`, patch: { skin: "auto" } },
    christmas: { date: `${YEAR}-12-05T12:00:00Z`, patch: { skin: "auto" } }
};
const HOME_VIEWS = ["load", "menuFolds", "mazes", "sortList", "maze", "mazeScrolled", "mazeClose", "events", "event", "search", "searchNone",
    "timeline", "furni", "whatsnew", "guides", "articles", "article", "missing", "boards", "profile", "guess", "odd", "pura", "altcodes",
    "console", "cProfile", "cContact", "cContactForm", "cPeople", "cPrivacy", "cClose", "mw", "pagebottom"];
const KEY_VIEWS = ["tabHome", "tabMenu", "tabMaze", "tabConsole", "tabGuides"];
const SIGNED_VIEWS = ["load", "console", "cEdit", "cClose", "profile"];
/* The other pages. `/?landing` keeps the landing page from going straight
   on to /home, as an admin's link to it does (index.html). */
const PAGES = {
    landing: { path: "/?landing", views: ["load", "pagebottom"] },
    maintenance: { path: "/?landing", views: ["load", "pagebottom"], patch: { landingState: "maintenance" } },
    wizard: { path: "/wizard", views: ["load", "pagebottom"] },
    privacy: { path: "/privacy", views: ["load", "pagebottom"] },
    notfound: { path: "/no-such-page-here", views: ["load"] },
    deepmaze: { path: "/maze/the-little-maze", views: ["load", "mazeScrolled"], wait: 8000 },
    deepevent: { path: "/event/halloween-2024-collab-maze", views: ["load", "mazeScrolled"], wait: 8000 }
};

function build({ quick, sizes }) {
    const jobs = [];
    const add = (kind, size, mode, dark, extra) => {
        if (sizes && !sizes.includes(size)) return;
        const [w, h, mobile] = SIZES[size];
        const m = MODES[mode];
        const j = { name: `${kind}-${size}-${mode}${dark ? (mode === "christmas" || mode === "frost" ? "-frostlight" : "-dark") : ""}`, kind, size, mode, dark, w, h, mobile, date: m.date, patch: Object.assign({}, m.patch) };
        Object.assign(j, extra);
        if (extra && extra.patch) j.patch = Object.assign({}, m.patch, extra.patch);
        jobs.push(j);
    };
    const ALL = Object.keys(SIZES);
    const BIG = ["1440", "390"];
    const homeJob = { path: "/home", views: HOME_VIEWS, wait: 8000 };
    if (quick) {
        for (const [mode, dark] of [["classic", false], ["classic", true], ["halloween", false], ["christmas", false], ["christmas", true]]) for (const size of BIG) add("home", size, mode, dark, homeJob);
        for (const kind of Object.keys(PAGES)) for (const [mode, dark] of [["classic", false], ["christmas", true]]) for (const size of BIG) add(kind, size, mode, dark, PAGES[kind]);
        for (const size of BIG) add("keys", size, "classic", false, { path: "/home", views: KEY_VIEWS, wait: 8000 });
        return jobs;
    }
    for (const mode of Object.keys(MODES)) for (const dark of [false, true]) for (const size of BIG) add("home", size, mode, dark, homeJob);
    for (const mode of ["classic", "halloween", "christmas"]) for (const dark of [false, true]) for (const size of ALL) if (!BIG.includes(size)) add("home", size, mode, dark, homeJob);
    for (const kind of Object.keys(PAGES)) {
        for (const mode of Object.keys(MODES)) for (const dark of [false, true]) for (const size of BIG) add(kind, size, mode, dark, PAGES[kind]);
        for (const [mode, dark] of [["classic", false], ["christmas", true]]) for (const size of ALL) if (!BIG.includes(size)) add(kind, size, mode, dark, PAGES[kind]);
    }
    for (const [mode, dark] of [["classic", false], ["classic", true], ["purple", false], ["halloween", false], ["christmas", false], ["christmas", true]]) for (const size of BIG)
        add("keys", size, mode, dark, { path: "/home", views: KEY_VIEWS, wait: 8000 });
    for (const [mode, dark] of [["classic", false], ["classic", true], ["christmas", false], ["christmas", true]]) for (const size of BIG)
        add("signed", size, mode, dark, { path: "/home", views: SIGNED_VIEWS, wait: 8000, signedIn: true });
    for (const dark of [false, true]) for (const size of BIG)
        add("advent", size, "christmas", dark, { path: "/home", views: ["load", "advent", "adventDoor"], wait: 9000, signedIn: true, fakes: { "functions/advent": { year: YEAR, opened: [1, 2, 3] } } });
    return jobs;
}

/* --only: a page kind (home, landing, maintenance, wizard, privacy, notfound,
   deepmaze, deepevent, keys, signed, advent) keeps those jobs; a view name
   (maze, console, guides…) keeps the jobs that have it and only that view,
   with "load" and whatever it needs opened first. Several, comma-separated. */
function only(jobs, list, STEPS) {
    if (!list || !list.length) return jobs;
    const kinds = new Set(list.filter(x => jobs.some(j => j.kind === x)));
    const views = list.filter(x => !kinds.has(x));
    const unknown = views.filter(v => !STEPS[v]);
    if (unknown.length) throw new Error("--only: no page or view called " + unknown.join(", ") + ". Pages: " + [...new Set(jobs.map(j => j.kind))].join(", ") + ". Views: " + Object.keys(STEPS).join(", "));
    const want = new Set();
    for (const v of views) { want.add(v); for (let n = STEPS[v].needs; n; n = STEPS[n].needs) want.add(n); }
    const out = [];
    for (const j of jobs) {
        if (kinds.has(j.kind)) { out.push(j); continue; }
        if (!views.length || !views.some(v => j.views.includes(v))) continue;
        const keep = j.views.filter(v => v === "load" || want.has(v));
        // A window left open by a view is shut by the view that closes it, if the job has one.
        if (keep.includes("maze") && j.views.includes("mazeClose") && !keep.includes("mazeClose")) keep.push("mazeClose");
        if (keep.includes("console") && j.views.includes("cClose") && !keep.includes("cClose")) keep.push("cClose");
        out.push(Object.assign({}, j, { views: j.views.filter(v => keep.includes(v)) }));
    }
    return out;
}

module.exports = { build, only, SIZES, MODES, PAGES };
