/* The privacy policy text, in one place.

   It renders in two separate spots: the homepage console modal's Privacy
   page (js/console.js) and the landing page's own privacy modal
   (js/welcome.js). The landing page needs its own copy of the view because
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
        body: "When you submit a form via the Contact Us page, we collect the details you provide - such as your message content, Habbo Origins username, and optional Discord handle; solely to process and respond to your inquiry. Short-term IP logging is implemented exclusively for automated spam prevention and security filtering."
    },
    {
        heading: "Use of Data.",
        body: "Submitted information is used strictly to review, process, and reply to user inquiries, including maze submissions, content corrections, and general feedback. We do not maintain marketing mailing lists or use your details for promotional purposes."
    },
    {
        heading: "Analytics & Privacy.",
        body: "We use a lightweight, privacy-focused tool to monitor aggregate website traffic and performance without tracking individual users. This analytics solution does not collect personal data, track activity across other websites, or rely on cookies. Local browser storage is strictly reserved for administrative logins and is never used on standard visitor devices."
    },
    {
        heading: "Third-Party Sharing.",
        body: "We do not sell, rent, trade, or share your personal information with third parties, except as necessary to deliver transactional system alerts through our integrated infrastructure providers mentioned above."
    },
    {
        heading: "Data Rights & Contact.",
        body: "If you wish to request the removal, review, or deletion of any stored contact data associated with your account, please send a message through the Contact Us form, and your request will be processed promptly."
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
