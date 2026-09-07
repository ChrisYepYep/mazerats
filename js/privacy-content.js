/* The privacy policy text, in one place.

   It renders in three separate spots: the homepage console modal's Privacy
   page (js/console.js), the landing page's own privacy modal
   (js/welcome.js), and the formal page at /privacy (privacy.html), which is
   the one with an address of its own — linkable, printable, and readable
   without a 204px porthole. The landing page needs its own copy of the view
   because
   home.html is off-limits to regular visitors during Coming Soon/
   Maintenance — the gate in home.html's <head> bounces them straight back
   to index.html — so a footer link pointing at home.html#privacy simply
   dead-ends for exactly the visitors who can only ever see the landing
   page. Same reasoning as the Upcoming Events widget having its own
   lightweight modal there.

   Two renderers, one source: edit the wording here and both update. */
const PRIVACY_SECTIONS = [
    {
        heading: "What we collect.",
        body: "When you submit a form via the Contact Us page, we collect the details you provide - such as your message content, Habbo Origins username, and optional Discord handle; solely to process and respond to your inquiry. Short-term IP logging is implemented exclusively for automated spam prevention and security filtering. If you choose to sign in, we also hold what your Discord account tells us and what you do while signed in, both described below."
    },
    {
        heading: "Signing in with Discord.",
        body: "Signing in is entirely optional. Everything on this site - the archive, the daily game, marking a maze as walked - works without an account, and nothing is hidden behind one. If you do sign in, we ask Discord for one permission only: \"identify\", which returns your Discord user ID, your display name and your avatar picture. We do not ask for your email address, your servers, your friends, or anything else, and we cannot see them. We keep your ID, display name and avatar URL, and the dates you first signed in and were last seen. The access token Discord issues during sign-in is used once to read that profile and is then discarded, never stored - so nothing here can act on your behalf on Discord, and there is no credential of yours for anyone to steal from us."
    },
    {
        heading: "What your account holds.",
        body: "Signed in, the things this site would otherwise remember only in your browser are kept against your account instead, so they follow you between your phone and your computer: which mazes you have marked as walked, which you have saved to walk later, your progress in the current day of the daily game, and your finished daily scores. Your display name, avatar, score and result grid - the five coloured squares saying how each room went, which name no maze and give nothing away - are shown publicly on the daily game's leaderboards. That is the entire purpose of signing in, and it is the only place your account is visible to anyone else. Which mazes you have walked, and which you have saved to walk later, are never shown to anybody but you."
    },
    {
        heading: "Use of Data.",
        body: "Submitted information is used strictly to review, process, and reply to user inquiries, including maze submissions, content corrections, and general feedback. Account information is used only to show you your own progress and to place your name on the leaderboards. We do not maintain marketing mailing lists, we do not profile you, and we do not use any of it for promotional purposes."
    },
    {
        heading: "Analytics & Privacy.",
        body: "We use a lightweight, privacy-focused third-party tool to monitor aggregate website traffic and performance, and we keep our own record of which parts of the site are used - for example which mazes are opened, which tabs are viewed, or when an image is enlarged. These interaction records are not linked to you: no IP address or account is stored against them, nothing is shared with other websites, and the only identifier attached is a random value that lasts for a single browsing session and is discarded when you close the tab. What you type into the search box is never recorded, only that a search happened. We honour \"Do Not Track\" and Global Privacy Control signals and log nothing at all when either is set, and every interaction record is deleted automatically after 60 days."
    },
    {
        heading: "Browser Storage.",
        body: "Your browser holds a small amount of information for this site on your own device. For visitors that is a short-lived session identifier used only for the interaction records described above, a note of whether the site was last seen as open so the page still behaves correctly if our server is briefly unreachable, and - if you have played the daily game or marked a maze as walked - that progress, which stays on your device alone unless you sign in. Signing in adds a session cookie so the site knows it is still you: it is marked HttpOnly, which means the page's own scripts cannot read it, it holds nothing but your Discord ID, display name and avatar, and it expires after thirty days. For signed-in administrators there is also an admin session token. None of it is used to follow you across other websites, none of it is sold or shared, and clearing your browser data removes all of it."
    },
    {
        heading: "Third-Party Sharing.",
        body: "We do not sell, rent, trade, or share your personal information with third parties, except as necessary to deliver transactional system alerts through our integrated infrastructure providers mentioned above. Signing in sends you to Discord to approve it, which means Discord knows you signed in here; we send them nothing about you beyond the request itself, and no information about you travels the other way except the profile described above."
    },
    {
        heading: "Data Rights & Contact.",
        body: "Signing out clears your session immediately, and you can withdraw this site's access at any time from Discord's own Authorised Apps settings without asking us. To have the account itself deleted - your profile, your scores, your leaderboard entries and your walked mazes, permanently and in full - or to review or remove any stored contact data, send a message through the Contact Us form and your request will be processed promptly."
    }
];

/* Fills a container with the policy: one .console-blurb per section, with a
   .console-hashline rule between each pair (not after the last). Built from
   DOM nodes rather than an innerHTML string so the copy above never has to
   be HTML-escaped by hand.

   Both callers pass a container that already sits inside console-styled
   chrome, so the classes are the console's own either way. */
function renderPrivacySections(container) {
    if (!container) return;
    container.innerHTML = "";
    PRIVACY_SECTIONS.forEach((section, i) => {
        if (i > 0) {
            const rule = document.createElement("div");
            rule.className = "console-hashline";
            rule.setAttribute("aria-hidden", "true");
            container.appendChild(rule);
        }
        const p = document.createElement("p");
        p.className = "console-blurb";
        const strong = document.createElement("strong");
        strong.textContent = section.heading;
        p.appendChild(strong);
        p.appendChild(document.createTextNode(" " + section.body));
        container.appendChild(p);
    });
}

/* The same policy as an ordinary document, for privacy.html.

   A separate renderer rather than a flag on the one above, because the two
   want genuinely different markup: the console version is a run of styled
   paragraphs inside chrome that already supplies the heading, while this is
   a standalone legal page and its sections need to be real headings a
   screen reader, a search engine and a print stylesheet can all navigate by.

   The wording is shared, which is the whole point — the console page and
   this page cannot drift apart, because there is only one copy of the
   words. */
function renderPrivacyDocument(container) {
    if (!container) return;
    container.innerHTML = "";
    PRIVACY_SECTIONS.forEach(section => {
        const sec = document.createElement("section");
        sec.className = "legal-section";

        const h = document.createElement("h2");
        // The stored headings end in a full stop, which reads correctly as a
        // lead-in to a paragraph and wrongly as a heading of its own.
        h.textContent = section.heading.replace(/\.\s*$/, "");
        sec.appendChild(h);

        const p = document.createElement("p");
        p.textContent = section.body;
        sec.appendChild(p);

        container.appendChild(sec);
    });
}
