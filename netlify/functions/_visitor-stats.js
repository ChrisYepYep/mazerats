/* What visitors do on the site, worked out from site_events (js/track.js,
   netlify/functions/track.js) for the Warren's Activity page.

   Rebuilt 7 Oct 2026 (the owner's: "a full overhaul… plenty of stats",
   starting from "do we track how many people opened Pura Panic?").

   Everything here is COUNTED, never listed, as it always was: the rows carry
   no address and no account, and the only grouping key is a session id that
   lives as long as one browser tab. So a "visit" below is one tab's worth of
   site, not a person — somebody back tomorrow is a new visit — and nothing
   here can say who did anything.

   One call answers the whole page:
     totals     visits, interactions, things done per visit, the typical
                length of a visit that did more than one thing, one-click visits
     previous   the same headline numbers for the window just before, to
                say whether things are up or down (none for "all")
     liveNow    visits with something done in the last 15 minutes
     byDay      visits and interactions per day, empty days included
     heat       interactions by weekday and hour (UTC)
     depth      visits by how many things were done in them
     length     visits by how long they lasted, first click to last
     features   every kind of interaction: how often, and in how many visits
     labels     the named things inside some of them (which maze, which
                guide, which menu row…), each with uses and visits
     funnels    a visit's path through Pura Panic, the daily games and the
                mazes — what share went on from opening to playing to
                finishing, and how many opened and went no further

   Aggregated in the database, in a handful of pipelines, so the page costs
   the same however busy the site gets. */

const MAX_LABEL_GROUPS = 4000;

// The interactions whose label is worth breaking out.
const LABELLED = [
    "page", "menu", "maze-open", "event-open", "furni-open", "guide-open",
    "boards-open", "console-open", "profile-open", "daily-open", "daily-finish",
    "daily-share", "pura-play", "pura-finish", "pura-name", "pura-lights", "tab"
];

// A flag per visit: did anything of this name happen in it?
const flag = (name) => ({ $max: { $cond: [{ $eq: ["$name", name] }, 1, 0] } });
const FLAGS = {
    puraOpen: "pura-open", puraPlay: "pura-play", puraFinish: "pura-finish",
    puraSubmit: "pura-submit", puraContinue: "pura-continue", puraBoard: "pura-board",
    dailyOpen: "daily-open", dailyFinish: "daily-finish", dailyShare: "daily-share",
    mazeOpen: "maze-open", walked: "walked-toggle", saved: "saved-toggle", fav: "fav-toggle",
    shared: "share-copy", searched: "search", menu: "menu"
};

const sumOf = (field) => ({ $sum: "$" + field });
const both = (a, b) => ({ $sum: { $cond: [{ $and: [{ $eq: ["$" + a, 1] }, { $eq: ["$" + b, 1] }] }, 1, 0] } });
const onlyFirst = (a, b) => ({ $sum: { $cond: [{ $and: [{ $eq: ["$" + a, 1] }, { $ne: ["$" + b, 1] }] }, 1, 0] } });

const DEPTH = [1, 2, 6, 16, 51];
const DEPTH_LABELS = ["1 thing", "2–5", "6–15", "16–50", "51 or more"];
const LENGTH = [0, 10, 60, 300, 900, 3600];
const LENGTH_LABELS = ["Under 10 seconds", "10s – 1 min", "1 – 5 min", "5 – 15 min", "15 – 60 min", "Over an hour"];

const day = (d) => new Date(d).toISOString().slice(0, 10);

async function visitorStats(db, collection, since, keepDays) {
    const col = db.collection(collection);
    const window = since ? { at: { $gte: since } } : {};
    const withSession = { ...window, session: { $nin: [null, ""] } };

    const perVisit = [
        { $match: withSession },
        {
            $group: {
                _id: "$session",
                n: { $sum: 1 },
                first: { $min: "$at" },
                last: { $max: "$at" },
                ...Object.fromEntries(Object.entries(FLAGS).map(([k, name]) => [k, flag(name)]))
            }
        },
        { $project: { _id: 0, n: 1, secs: { $divide: [{ $subtract: ["$last", "$first"] }, 1000] }, ...Object.fromEntries(Object.keys(FLAGS).map(k => [k, 1])) } }
    ];

    const prevSince = since ? new Date(since.getTime() - (Date.now() - since.getTime())) : null;

    const [events, visits, prev, live] = await Promise.all([
        col.aggregate([
            { $match: window },
            {
                $facet: {
                    total: [{ $count: "n" }],
                    byDay: [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, n: { $sum: 1 } } }],
                    visitsByDay: [
                        { $match: { session: { $nin: [null, ""] } } },
                        { $group: { _id: { d: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, s: "$session" } } },
                        { $group: { _id: "$_id.d", n: { $sum: 1 } } }
                    ],
                    heat: [{ $group: { _id: { w: { $isoDayOfWeek: "$at" }, h: { $hour: "$at" } }, n: { $sum: 1 } } }],
                    features: [
                        { $group: { _id: { name: "$name", s: "$session" }, n: { $sum: 1 } } },
                        { $group: { _id: "$_id.name", events: { $sum: "$n" }, visits: { $sum: 1 } } },
                        { $sort: { events: -1 } }, { $limit: 60 }
                    ],
                    labels: [
                        { $match: { name: { $in: LABELLED }, label: { $nin: [null, ""] } } },
                        { $group: { _id: { name: "$name", label: "$label", s: "$session" }, n: { $sum: 1 } } },
                        { $group: { _id: { name: "$_id.name", label: "$_id.label" }, events: { $sum: "$n" }, visits: { $sum: 1 } } },
                        { $sort: { events: -1 } }, { $limit: MAX_LABEL_GROUPS }
                    ]
                }
            }
        ]).toArray(),
        col.aggregate([
            ...perVisit,
            {
                $facet: {
                    summary: [{
                        $group: {
                            _id: null,
                            visits: { $sum: 1 },
                            events: { $sum: "$n" },
                            secs: { $sum: "$secs" },
                            oneThing: { $sum: { $cond: [{ $lte: ["$n", 1] }, 1, 0] } },
                            ...Object.fromEntries(Object.keys(FLAGS).map(k => [k, sumOf(k)])),
                            puraOpenedOnly: onlyFirst("puraOpen", "puraPlay"),
                            puraPlayedNotFinished: onlyFirst("puraPlay", "puraFinish"),
                            puraOpenPlay: both("puraOpen", "puraPlay"),
                            dailyOpenFinish: both("dailyOpen", "dailyFinish"),
                            dailyFinishShare: both("dailyFinish", "dailyShare"),
                            mazeWalked: both("mazeOpen", "walked"),
                            mazeSaved: both("mazeOpen", "saved"),
                            mazeFav: both("mazeOpen", "fav")
                        }
                    }],
                    depth: [{ $bucket: { groupBy: "$n", boundaries: [...DEPTH, Number.MAX_SAFE_INTEGER], default: "other", output: { n: { $sum: 1 } } } }],
                    length: [{ $bucket: { groupBy: "$secs", boundaries: [...LENGTH, Number.MAX_SAFE_INTEGER], default: "other", output: { n: { $sum: 1 } } } }],
                    // The typical length of a visit that did more than one thing: most
                    // visits are a single page view (0 seconds), and a few tabs left
                    // open for hours make an average meaningless.
                    secsSorted: [{ $match: { n: { $gt: 1 } } }, { $sort: { secs: 1 } }, { $group: { _id: null, all: { $push: "$secs" } } }, { $project: { _id: 0, mid: { $arrayElemAt: ["$all", { $floor: { $divide: [{ $size: "$all" }, 2] } }] } } }]
                }
            }
        ]).toArray(),
        prevSince ? col.aggregate([
            { $match: { at: { $gte: prevSince, $lt: since }, session: { $nin: [null, ""] } } },
            { $group: { _id: "$session", n: { $sum: 1 }, puraOpen: flag("pura-open"), puraPlay: flag("pura-play"), dailyFinish: flag("daily-finish"), mazeOpen: flag("maze-open") } },
            { $group: { _id: null, visits: { $sum: 1 }, events: { $sum: "$n" }, puraOpen: sumOf("puraOpen"), puraPlay: sumOf("puraPlay"), dailyFinish: sumOf("dailyFinish"), mazeOpen: sumOf("mazeOpen") } }
        ]).toArray() : Promise.resolve(null),
        col.aggregate([
            { $match: { at: { $gte: new Date(Date.now() - 15 * 60 * 1000) }, session: { $nin: [null, ""] } } },
            { $group: { _id: "$session" } }, { $count: "n" }
        ]).toArray()
    ]);

    const e = events[0] || {};
    const v = visits[0] || {};
    const s = (v.summary || [])[0] || {};
    const totalEvents = ((e.total || [])[0] || { n: 0 }).n;

    // Every day in the window, the quiet ones too: a chart of only the busy
    // days draws a fortnight of silence as a steady line (ff-runs.js says the same).
    const evByDay = new Map((e.byDay || []).map(r => [r._id, r.n]));
    const viByDay = new Map((e.visitsByDay || []).map(r => [r._id, r.n]));
    const days = [];
    const keys = [...evByDay.keys()].sort();
    const end = new Date(); end.setUTCHours(0, 0, 0, 0);
    const start = new Date(since || (keys[0] ? keys[0] + "T00:00:00Z" : end));
    start.setUTCHours(0, 0, 0, 0);
    const earliest = new Date(end.getTime() - (keepDays - 1) * 86400000);
    if (start < earliest) start.setTime(earliest.getTime());
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = day(d);
        days.push({ day: k, visits: viByDay.get(k) || 0, events: evByDay.get(k) || 0 });
    }

    const heat = (e.heat || []).map(r => ({ w: r._id.w, h: r._id.h, n: r.n }));

    const bucket = (rows, bounds, labels) => labels.map((label, i) => ({
        label, n: ((rows || []).find(r => r._id === bounds[i]) || { n: 0 }).n
    }));

    const labels = {};
    for (const r of e.labels || []) {
        const k = r._id.name;
        (labels[k] = labels[k] || []).push({ label: r._id.label, events: r.events, visits: r.visits });
    }
    Object.values(labels).forEach(list => list.sort((a, b) => b.events - a.events));

    const p = prev && prev[0];
    const visitsN = s.visits || 0;
    return {
        keepDays,
        totals: {
            visits: visitsN,
            events: totalEvents,
            perVisit: visitsN ? Math.round((s.events / visitsN) * 10) / 10 : 0,
            engagedMedianSecs: Math.round((((v.secsSorted || [])[0] || {}).mid) || 0),
            oneThing: s.oneThing || 0,
            searched: s.searched || 0,
            usedMenu: s.menu || 0
        },
        previous: p ? { visits: p.visits, events: p.events, puraOpen: p.puraOpen, puraPlay: p.puraPlay, dailyFinish: p.dailyFinish, mazeOpen: p.mazeOpen } : null,
        liveNow: ((live || [])[0] || { n: 0 }).n,
        byDay: days,
        heat,
        depth: bucket(v.depth, DEPTH, DEPTH_LABELS),
        length: bucket(v.length, LENGTH, LENGTH_LABELS),
        features: (e.features || []).map(r => ({ name: r._id, events: r.events, visits: r.visits })),
        labels,
        funnels: {
            pura: {
                opened: s.puraOpen || 0, played: s.puraPlay || 0, finished: s.puraFinish || 0,
                submitted: s.puraSubmit || 0, continued: s.puraContinue || 0, board: s.puraBoard || 0,
                openedOnly: s.puraOpenedOnly || 0, playedNotFinished: s.puraPlayedNotFinished || 0,
                openThenPlay: s.puraOpenPlay || 0
            },
            daily: { opened: s.dailyOpen || 0, finished: s.dailyFinish || 0, shared: s.dailyShare || 0, openThenFinish: s.dailyOpenFinish || 0, finishThenShare: s.dailyFinishShare || 0 },
            mazes: { opened: s.mazeOpen || 0, walked: s.mazeWalked || 0, saved: s.mazeSaved || 0, fav: s.mazeFav || 0, shared: s.shared || 0 }
        }
    };
}

module.exports = { visitorStats };
