/* set before the first tile's asked for: is the site wearing Christmas? */
(function () { try { if (/[?&]xmas=1/.test(location.search)) { window.hallwayXmas = true; return; } const p = window.parent !== window ? window.parent : window; window.hallwayXmas = !!(p.SkinWear && p.SkinWear.current && /christmas/i.test(String(p.SkinWear.current() || ""))); } catch (e) { window.hallwayXmas = false; } })();
window.hwTrack = n => { try { const p = window.parent !== window ? window.parent : window; if (p.Track && p.Track.event) p.Track.event(n); } catch (e) { /* not counted */ } };
