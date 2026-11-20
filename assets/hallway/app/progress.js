/* What this visitor has found in the Hallway. Guests keep it in the browser; signed-in players keep it on their account (netlify/functions/hallway-progress.js) and carry on from any device. A guest who signs in has what they found merged in. It only ever adds, here and on the server, so two devices can't undo anything. */
(function () {
    "use strict";
    const KEY = "hallway-progress", FN = "/.netlify/functions/hallway-progress";
    const blank = () => ({ scraps: [], key: false, lost: { day: "", streak: 0, shelf: [], points: 0, best: 0, missed: 0 }, hunts: {} });
    const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
    function merge(a, b) {
        const out = { scraps: union(a.scraps, b.scraps), key: !!(a.key || b.key), lost: { ...a.lost }, hunts: { ...a.hunts } };
        const al = a.lost || {}, bl = b.lost || {};
        out.lost = { day: (bl.day || "") >= (al.day || "") ? bl.day || "" : al.day || "", streak: Math.max(al.streak || 0, bl.streak || 0), shelf: union(al.shelf, bl.shelf) };
        /* Lost Property's totals only go up */
        for (const k of ["points", "best", "missed"]) out.lost[k] = Math.max(al[k] || 0, bl[k] || 0);
        for (const [id, h] of Object.entries(b.hunts || {})) { const o = out.hunts[id] || { found: [], done: false }; out.hunts[id] = { found: union(o.found, h.found), done: !!(o.done || h.done), ...(o.place || h.place ? { place: o.place || h.place } : {}) }; }
        return out;
    }
    const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? merge(blank(), v) : blank(); } catch (e) { return blank(); } };
    const writeLocal = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode: it lasts this visit */ } };

    let state = readLocal(), signedIn = false, ready = null;
    const listeners = new Set(), tell = () => { for (const f of listeners) { try { f(state); } catch (e) { console.error(e); } } };
    async function post(part) {
        const adminHeader = () => { try { const t = localStorage.getItem("mazerats_admin_token"); return t ? { "x-admin-token": t } : {}; } catch (e) { return {}; } };      // an admin walking it before it opens still saves (10 Nov scan, server finding 7)
        const r = await fetch(FN, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", ...adminHeader() }, body: JSON.stringify(part) });
        if (!r.ok) throw new Error("hallway progress: " + r.status);
        return r.json();
    }
    /* who's here: 401 is a guest, and anything else going wrong leaves what's in the browser, untouched */
    function load() {
        if (ready) return ready;
        ready = (async () => {
            let r; try { r = await fetch(FN, { credentials: "same-origin", headers: { Accept: "application/json" } }); } catch (e) { return state; }
            if (!r.ok) return state;
            let online; try { online = await r.json(); } catch (e) { return state; }
            signedIn = true;
            const had = state, both = merge(online, had);
            state = both; tell();
            /* anything found as a guest goes up once, then the browser's copy is done with */
            if (JSON.stringify(both) !== JSON.stringify(merge(blank(), online))) { try { const v = await post(both); state = merge(state, v); localStorage.removeItem(KEY); tell(); catchUp(v); } catch (e) { /* kept in the browser for next time */ } } else { try { localStorage.removeItem(KEY); } catch (e) { /* fine */ } }
            return state;
        })();
        return ready;
    }
    /* The server takes a hunt's clues one a save, at least 8 seconds after the one before (9 Nov 2026 scan, finding 4), so a guest's hunt
       merged at sign-in, or two clues found close together, leave it behind what's been found here. While it is, the hunts it's behind on
       go again every CATCH_UP_MS, and are kept in the browser meanwhile so a reload carries on from them. Done when it has them all. */
    const CATCH_UP_MS = 9000, HUNT_CLUE = /^c\d+$/; let catchTimer = 0, idle = 0;
    function behind(v) {
        const out = {};
        for (const [id, h] of Object.entries(state.hunts || {})) { const s = v && v.hunts && v.hunts[id]; if (!s || s.done) continue; const mine = (h.found || []).filter(k => HUNT_CLUE.test(k)); if (mine.some(k => !(s.found || []).includes(k))) out[id] = { found: mine, n: (s.found || []).length }; }
        return out;
    }
    function catchUp(v) {
        clearTimeout(catchTimer); const b = behind(v), ids = Object.keys(b);
        if (!ids.length) { idle = 0; return; }
        try { const had = JSON.parse(localStorage.getItem(KEY) || "null") || {}; localStorage.setItem(KEY, JSON.stringify({ ...had, hunts: { ...(had.hunts || {}), ...Object.fromEntries(ids.map(id => [id, { found: b[id].found }])) } })); } catch (e) { /* this visit only */ }
        catchTimer = setTimeout(() => {
            post({ hunts: Object.fromEntries(ids.map(id => [id, { found: b[id].found }])) }).then(r => {
                state = merge(state, r); tell();
                /* the server didn't move at all three times running (a hunt taken off the map, say): leave it for the next visit */
                const moved = ids.some(id => r.hunts && r.hunts[id] && ((r.hunts[id].found || []).length > b[id].n || r.hunts[id].done));
                idle = moved ? 0 : idle + 1; if (idle < 3) catchUp(r);
                /* only the hunts that have caught up leave the browser's copy, not the whole of it (scan 18 Nov evening: that threw away a copy
                   kept from an earlier failed save too) */
                const still = behind(r), caught = ids.filter(id => !still[id]);
                if (caught.length) { try { const had = JSON.parse(localStorage.getItem(KEY) || "null"); if (had && typeof had === "object") { const hs = { ...(had.hunts || {}) }; for (const id of caught) delete hs[id]; const rest = { ...had, hunts: hs }; if (!Object.keys(hs).length) delete rest.hunts; if (Object.keys(rest).length) localStorage.setItem(KEY, JSON.stringify(rest)); else localStorage.removeItem(KEY); } } catch (e) { /* fine */ } }
            }).catch(() => { /* kept in the browser for next time */ });
        }, CATCH_UP_MS);
    }
    function save(part) {
        state = merge(state, merge(blank(), { ...state, ...part, hunts: part.hunts || {}, scraps: part.scraps || [], lost: part.lost || state.lost, key: !!part.key }));
        tell();
        if (signedIn) post(part).then(v => { state = merge(state, v); tell(); if (part.hunts) catchUp(v); }).catch(() => writeLocal(state));
        else writeLocal(state);
        return state;
    }
    window.HallwayProgress = { load, save, get: () => state, get signedIn() { return signedIn; }, onChange(f) { listeners.add(f); return () => listeners.delete(f); }, _merge: merge, _blank: blank };
})();
