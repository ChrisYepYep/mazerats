/* Type-to-jump, site-wide — pressing a single letter (while not typing into
   a text field elsewhere on the page) scrolls every currently-visible
   .chrome-list on the page to its first entry whose name starts with that
   letter, same convention as a native file picker's list view. Originally
   admin-only and hardcoded to the rooms list; generalized here to run on
   any page that loads this script and react to every list on it (admin's
   rooms/events/admins lists, the homepage's browse and featured lists) —
   whichever ones are actually visible at the time, so a hidden tab's list
   is left alone. Reads whatever's actually rendered right now, so it
   respects each list's current search/sort — jumping to "the first M"
   means the first one in view, not necessarily alphabetically first if the
   list isn't sorted by name. */
document.addEventListener("keydown", e => {
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;

    const letter = e.key.toLowerCase();
    document.querySelectorAll(".chrome-list").forEach(list => {
        if (list.offsetParent === null) return;
        const match = Array.from(list.querySelectorAll(":scope > .chrome-list-row")).find(row => {
            const h3 = row.querySelector("h3");
            return h3 && h3.textContent.trim().toLowerCase().startsWith(letter);
        });
        if (match) match.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
});
