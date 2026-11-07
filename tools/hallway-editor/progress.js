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
        const r = await fetch(FN, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(part) });
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
            if (JSON.stringify(both) !== JSON.stringify(merge(blank(), online))) { try { state = merge(state, await post(both)); localStorage.removeItem(KEY); tell(); } catch (e) { /* kept in the browser for next time */ } } else { try { localStorage.removeItem(KEY); } catch (e) { /* fine */ } }
            return state;
        })();
        return ready;
    }
    function save(part) {
        state = merge(state, merge(blank(), { ...state, ...part, hunts: part.hunts || {}, scraps: part.scraps || [], lost: part.lost || state.lost, key: !!part.key }));
        tell();
        if (signedIn) post(part).then(v => { state = merge(state, v); tell(); }).catch(() => writeLocal(state));
        else writeLocal(state);
        return state;
    }
    window.HallwayProgress = { load, save, get: () => state, get signedIn() { return signedIn; }, onChange(f) { listeners.add(f); return () => listeners.delete(f); }, _merge: merge, _blank: blank };
})();
