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

   Two renderers, one source: edit the wording here and both update.

   HOUSE STYLE, because this file is prose and prose drifts. Headings are
   sentence case and end in a full stop — they read as a lead-in to the
   paragraph in the console view, and renderPrivacyDocument below strips
   the stop for the standalone page. Half of them were Title Case with an
   ampersand and half were not, which is the sort of thing nobody notices
   one heading at a time and everybody notices reading the page.

   An aside is set off with an em dash (—), not a hyphen. Every other page
   on the site does; this one used " - " throughout, which is the only
   punctuation difference between the policy and the writing around it.

   And British spelling, as everywhere else: enquiry, authorised, honour. */
const PRIVACY_SECTIONS = [
    {
        heading: "What we collect.",
        body: "When you submit a form via the Contact Us page, we collect the details you provide — your message content, your Habbo Origins username, and an optional Discord handle — solely to process and respond to your enquiry. If you are signed in with Discord when you send it, the message also carries your Discord display name, username and ID, taken from your account in place of a typed handle, so that we can tell who it really came from; they are kept with the message and included in the notification email described under Who else handles it below. Sending what you know through Add Maze Info works the same way and is described in its own section below. A message is kept until an administrator deletes it, but the IP address it was sent from is kept with it only for spam and abuse handling — limiting how many messages one connection can send, and letting an administrator block one that is sending spam — and is removed from the message automatically soon after the message is 30 days old. An address that has been blocked stays on the block list until the block is lifted, or until a week after a block made for a set time has ended, and when it is lifted, the address is noted in the site's admin log, kept for 90 days, along with the administrator who lifted it. Attempts to sign in to the site's admin panel, successful or not and by anyone, are logged for 90 days, for security, with the IP address and browser they came from and the name that was typed — or, if that name is not an administrator's, only a scrambled stand-in for it, since a name typed there by mistake is so often a password. An administrator who signs in successfully is also given a cookie that lets the site recognise that device at their next sign-in, so that someone else's failed guesses at their name cannot lock them out; it holds only a random value and a signature, is sent to nothing but the sign-in itself, stops working when that administrator's password changes, and expires after 180 days. There is one other place an IP address is kept, for a different reason: every round of Fallin' Furni records the address it was played from, described in full below. Playing a daily game without signing in keeps a count of the answers checked from each connection that day, so one connection cannot check every answer; the connection is stored only as a one-way scrambled code, never as the address itself, and the count is deleted after two days. If you choose to sign in, we also hold what your Discord account tells us and what you do while signed in, both described below."
    },
    {
        heading: "Signing in with Discord.",
        body: "Signing in is entirely optional. The archive, the two daily games, Fallin' Furni and marking a maze as completed all work without an account. Only two things need one: sending images through Add Maze Info, so that the pictures can be answered for, and a place on the leaderboards — the daily games' and Fallin' Furni's — which show your Discord name, or a nickname if you choose one. If you do sign in, we ask Discord for one permission only: \"identify\", which returns your Discord user ID, your username, your display name and your avatar picture. We do not ask for your email address, your servers, your friends, or anything else, and we cannot see them. We keep your ID, username, display name and avatar URL, and the dates you first and last signed in. We also keep, with your account, a one-way scrambled code of the network you last used the site from — not your IP address, which is never stored against your account, and from which the address cannot be worked back out — and when it was last updated, so that if an account is used to troll or abuse the site, the administrators can block the network it is being used from, as described under Blocking accounts and networks below. You can also choose a nickname for this site: if you do, we keep it with your account, along with when you last changed it and how many times that day, and show it on the leaderboards and everywhere else your name appears in place of your Discord name; you can change it or remove it at any time from the console's Profile page. We also keep a short history of your last ten nickname changes, with when each was made and whether you or an administrator made it. If the administrators turn a nickname of yours down, it is kept on a list with your account — the last ten such names, stored in a simplified form with capitals, accents, spaces and punctuation taken out — so that the same name cannot simply be chosen again; and when an administrator turns down or locks your nickname, which administrator did it and when is kept with your account too. The site's administrators can see the list of everyone who has signed in — each person's Discord display name, username and ID, avatar, the dates they first and last signed in, their nickname and its history, counts of what they have played and sent, and whether they are blocked — and can set, change or remove a nickname, for example one that impersonates someone or breaks the site's rules, or lock it so that it can only be changed by asking them. Whenever an administrator sets, changes, removes, locks or reviews a nickname, that is also noted in the site's admin log, kept for 90 days, by your Discord ID rather than by any name, with what was done and the administrator who did it. That list is never shown publicly. The access token Discord issues during sign-in is used once to read that profile and is then discarded, never stored — so nothing here can act on your behalf on Discord, and there is no credential of yours for anyone to steal from us."
    },
    {
        heading: "Playing Fallin' Furni.",
        body: "Every round of Fallin' Furni is recorded so the game can be tuned — which levels people clear, which they run out of time on, and where a run ends. A record holds what happened in the game: the levels played, how long each took, how many seats were taken, how the round ended, the points scored, the size of the browser window, and whether the screen was a touchscreen. If you are signed in it carries your Discord display name and ID, the same account the leaderboard already shows. If you typed a Habbo Origins name into the game to play as that avatar, that name is kept on the record too, along with which Origins hotel you chose for it — the English, Spanish or Brazilian one — whether or not you are signed in, so that runs played without an account can be told apart instead of all counting as one anonymous player. It is only ever treated as something you told us rather than something we checked, it is never used to sign you in or to rank you, and it is never shown publicly — the leaderboard takes its name from your account alone: your nickname if you have chosen one, and your Discord name if not. It also holds the IP address the round was played from, whether or not you are signed in, and we group runs by that address so that we can see when one leaderboard is being played by several accounts from the same connection. That means a run played without signing in is not anonymous: it can be grouped with other runs from the same address, including ones where somebody did sign in. Apart from the admin panel's sign-in log described above, which is kept for security, this is the only part of the site that keeps an IP address against what you did, and the only one that keeps it to see how the site is used rather than to stop spam and abuse; it applies to Fallin' Furni alone — the interaction records described below still have no address on them. These records are never shown publicly and are only ever read by an administrator looking at how the game is playing; they are deleted automatically after 180 days, address and all."
    },
    {
        heading: "Adding what you know about a maze.",
        body: "The console's Add Maze Info form lets anyone send what they know about a maze or event, whether it is in the archive yet or not, and its Missing Pieces page lists the ones we most need help with. A submission holds what you write, which maze or event it is about, the Habbo Origins name you give if you give one, and — like a contact message — the IP address it was sent from, which is used only for spam and abuse handling and is removed from the submission automatically soon after the submission is 30 days old. If you are signed in with Discord it also carries your Discord display name, username and ID, and images can only be sent while signed in, so that the pictures can be answered for. Nothing in a submission is public: it is read by an administrator, and an image is only ever shown on the site if it is accepted into the archive, where it becomes one of that record's pictures. If a submission is accepted and you gave a name, it may be added to the site's list of contributors. Images from a rejected submission are deleted at once, and an image that was uploaded but never sent is deleted after a day or so. The words of a submission are kept with the archive's records until an administrator deletes them, and you can ask for yours to be removed at any time through the Contact Us form. An entry sent through Event Submission, on the same Contact page, holds the Habbo Origins username you give, the one picture you send, which event it was entered for and — if you are signed in with Discord, which it does not need — your Discord display name, username and ID; like a contact message it keeps the IP address it was sent from only for spam and abuse handling, removed automatically soon after the entry is 30 days old, and a one-way scrambled code of your connection or account is kept for two days to count how much has been sent from it. The picture is never public: only the administrators judging the event see it, and the entry and its picture are kept until an administrator deletes them, which you can ask for at any time through the Contact Us form."
    },
    {
        heading: "What your account holds.",
        body: "Signed in, the things this site would otherwise remember only in your browser are kept against your account instead, so they follow you between your phone and your computer: which mazes you have marked as completed, which you have saved to complete later, your progress through the current day of each daily game, and your finished daily scores. Your display name — or your nickname, if you have chosen one — your score and result grid — the row of coloured squares saying how each round went, which names no maze and so gives nothing away — and, only if you have not chosen a nickname, your Discord avatar are shown publicly on the daily games' leaderboards; the section on what's public on the leaderboards, below, has the detail. That is the entire purpose of signing in, and it is the only place your account is visible to anyone else. Which mazes you have completed, and which you have saved to complete later, are never shown to anybody but you. The console's Profile page gathers these together with your daily game streaks and places, your best Fallin' Furni run and what you have sent through Add Maze Info; it is worked out from the records described here each time you open it, nothing extra is stored to make it, and it is only ever shown to you."
    },
    {
        heading: "Use of data.",
        body: "Submitted information is used strictly to review, process, and reply to enquiries, including maze submissions, content corrections, and general feedback. Account information is used only to show you your own progress and to place your name on the leaderboards. We do not maintain marketing mailing lists, we do not profile you, and we do not use any of it for promotional purposes."
    },
    {
        heading: "Analytics and privacy.",
        body: "We use Umami, a lightweight, privacy-focused analytics service, to monitor aggregate website traffic and performance, and we keep our own record of which parts of the site are used — for example which mazes are opened, which tabs are viewed, or when an image is enlarged. These interaction records are not linked to you: no IP address or account is stored against them, nothing is shared with other websites, and the only identifier attached is a random value that lasts for a single browsing session and is discarded when you close the tab. What you type into the archive's search box is recorded by Umami, because the search is part of the page's address and Umami counts the addresses visited; we look at those terms to see what people are looking for and whether the archive has it. Like everything else Umami collects, a search is counted in aggregate and is not linked to you or to an account. We honour \"Do Not Track\" and Global Privacy Control signals and keep no interaction records at all when either is set, and every interaction record is deleted automatically after 60 days."
    },
    {
        heading: "Error reports.",
        body: "When something on the site goes wrong in your browser — a script fails, a picture or file does not load, or one of our servers does not answer — the page sends us a report so that it can be fixed, and our servers keep a report of their own failures in the same way. A report holds: what went wrong, with the error message, the file, line and technical trace where it happened; the page it happened on, with its address cut down to the page itself (anything you typed, such as a search, is removed, and a search is recorded only as how many characters it had); the page's title; when it happened, your time zone's offset from UTC, and how long the page had been open; your browser and operating system and their versions and whether the device is a phone, tablet or computer (worked out from what your browser tells every site, after which that description itself is discarded), your language, the size of your window and screen, whether the screen is a touchscreen, whether you were online, and your connection type and device memory where the browser offers them; the site's colour scheme, whether the site was open or closed, which of its windows were open, which version of the site you were running, and whether you were signed in, as a yes or no; the country your connection comes from, and nothing more precise; and the last fifteen things that happened on the page before the error, such as which buttons were clicked (by their labels, never anything typed into a field) and which pages were opened. It carries the same random, single-session identifier as the interaction records above, stored only in a scrambled form, so that we can count how many visits an error affected. No IP address, account, name or Discord ID is ever stored with a report. So that one connection cannot flood us with reports, we also count how many each connection sends; for that count the connection is kept only as a one-way scrambled code, never as the address itself, the code changes every day, and each count is deleted after about two hours. Because this is about keeping the site working rather than about how it is used, reports are still sent when \"Do Not Track\" is set, but never when Global Privacy Control is set. Reports are only read by an administrator, and are deleted automatically once an error has not been seen for 90 days."
    },
    {
        heading: "Browser storage.",
        body: "Your browser holds a small amount of information for this site on your own device. For visitors that is: a short-lived session identifier used only for the interaction records and error reports described above, with a count of the error reports sent during that session; a note of whether the site, and Fallin' Furni, were last seen as open, so the page can say the right thing if our server is briefly unreachable; the colour scheme you picked, and a copy of the site's current colours so the page does not flash while they load; for the daily games, how far your device's clock is from ours, so the games agree with everybody else about which day it is; and — if you have played either daily game, or marked a maze as completed or saved it for later — that progress, which stays on your device alone unless you sign in, and a note that you have been shown where saved mazes go, so it is only said once. If you sign in, it also keeps a note of which completed and saved mazes came from your account and which changes are still waiting to reach it, with each waiting change marked with the Discord ID of the account it was made under, so that a change is never sent to somebody else's account on a shared browser. While you're signed in, it also keeps your account's scrambled leaderboard stand-in, so that other tabs you have open notice when you sign in or out; it is cleared when you sign out. If you have played Fallin' Furni, it also remembers your room and avatar there, including any Habbo Origins name you typed into the game and the hotel you picked for it. If a block that closes the whole site applies to you, it keeps the note of when the block ends and the reason given, described under Blocking accounts and networks below. Signing in with Discord sets a cookie for ten minutes while you approve it, holding only a random value that lets us check the sign-in you come back with is the one you started; it is removed once you are back. After that, a session cookie lets the site know it is still you: it is marked HttpOnly, which means the page's own scripts cannot read it, it holds nothing but your Discord ID, username, display name and avatar, your nickname if you have chosen one, and whether you have been offered one yet, and it expires after thirty days. For signed-in administrators there is also an admin session token, along with a few of the admin panel's own conveniences — which of its pages was open last, which of its sections are folded, and unsaved drafts and previews of their own work. None of it is used to follow you across other websites, none of it is sold or shared, and clearing your browser data removes all of it."
    },
    {
        heading: "Who else handles it.",
        body: "We do not sell, rent, trade or share your personal information, and there is no advertising on this site. A small number of companies necessarily handle it in the course of running the site, and these are all of the ones we send it to. Netlify hosts the site, runs the code behind it and stores the pictures. MongoDB Atlas is the database that everything described above is kept in. Resend delivers a single notification email to us when you send a message through the Contact Us form or through Add Maze Info, carrying what you wrote, whatever name you put on it and, if you were signed in when you sent it, your Discord display name, username and ID, so that it is read rather than left sitting in a database. Umami collects the aggregate traffic figures described above. Discord holds your own account and tells us the profile described above when you choose to sign in — signing in sends you to Discord to approve it, which means Discord knows you signed in here; we send them nothing about you beyond the request itself, and no information about you travels the other way except that profile. Each of these is used for the one job named here and for nothing else."
    },
    {
        heading: "What your browser fetches from elsewhere.",
        body: "Some of what you see on the site is loaded by your browser straight from other companies' servers rather than from ours. When it does, that server receives your IP address and the ordinary details every web request carries — your browser and operating system, your language, the time, and which page asked for it — exactly as it would if you visited it yourself; we send it nothing else about you, and what it does with those details is covered by its own privacy policy, not this one. Google Fonts (fonts.googleapis.com and fonts.gstatic.com) supplies the site's typefaces, on every page. Habbo's own servers (habbo.com, through its habbo-imaging service) draw the Habbo avatars on the builders' and hosts' cards and your avatar in Fallin' Furni, and when an event shows the Habbo news article it comes from, the pictures inside that article are loaded from Habbo's servers too (origins.habbo.com and images.habbo.com). FurniIndex (furniindex.com and api.furniindex.com) supplies the pictures and icons of Habbo furni that some pages and games show. Discord's image server (cdn.discordapp.com) supplies the Discord avatars shown on the leaderboards and on your own account. Those four — Google Fonts, Habbo, FurniIndex and Discord, at the addresses named here — and Umami's analytics script described above, are all of them."
    },
    {
        heading: "What's public on the leaderboards.",
        body: "If you are signed in and play, the leaderboards show your name — your nickname if you have chosen one, and your Discord display name if you have not — with your scores. If you have not set a nickname, your Discord avatar is shown beside it too; setting a nickname hides your avatar there, so a nickname is not linked back to your Discord picture. A Fallin' Furni leaderboard entry also keeps which Origins hotel (the English, Spanish or Brazilian one) the habbo you played as was on, though never the Habbo name itself, and the hotel is not shown on the board. The leaderboards never show your Discord ID or username: each row carries a scrambled stand-in for your account that only this site can work out, which is how the page picks out your own row. Nicknames are checked against the site's word filter, and one that trips it is flagged for the administrators to review; an administrator may ask you to choose a different nickname, or change or remove it, as described under Signing in with Discord above. If an administrator asks you to choose a different nickname, you can keep browsing the site, but the games stay closed to you until you choose one."
    },
    /* Moderation (29 Sept 2026): the bans netlify/functions/_bans.js
       enforces, and the network code discord-auth.js stores. Change one,
       change both. */
    {
        heading: "Blocking accounts and networks.",
        body: "To deal with abuse, the site's administrators can block a Discord account, an internet connection or network (by its IP address or the block of addresses it belongs to), or the network a signed-in account was last used from (by the scrambled code described under Signing in with Discord above), either permanently or for a set time, after which the block ends by itself. A block either stops everything but reading — signing in, playing the games and appearing on the leaderboards, choosing a nickname, and sending messages or Add Maze Info — or closes the whole site, apart from this privacy policy. While a block that closes the whole site applies, your browser keeps a note of when it ends and the reason given, so that every page can stay closed to you without asking our server each time; the note is removed when the block ends or is lifted. The site checks your account and your connection against the list of blocks each time you use it, to tell whether a block applies to you, and the page is told whether it does and until when. A block records what it is on, how long it lasts, the reason given (which may be shown to you with the block) and which administrator made it; the list is only ever seen by the administrators. A block that has ended is deleted automatically a week later, and one that is lifted is deleted at once; making, changing or lifting a block is noted in the site's admin log, kept for 90 days, with what it was on and the administrator who did it."
    },
    {
        heading: "Data rights and contact.",
        body: "Signing out clears your session immediately, and Sign out on every device ends it on all of them at once; you can withdraw this site's access at any time from Discord's own Authorised Apps settings without asking us. To have the account itself deleted — your profile, your scores, your leaderboard entries, your Fallin' Furni run records and your completed mazes, permanently and in full — or to review or remove any stored contact data, send a message through the Contact Us form and your request will be processed promptly. The one exception is a block: a block on your account, or on a network you used, stays in force after your account is deleted, until it ends or an administrator lifts it, because otherwise anybody blocked for abuse could undo the block simply by asking to be forgotten. A block on your Discord account keeps your Discord ID, since that is what it is on; a block on the network your account was last used from keeps only the scrambled network code, and the link to your account is removed from it. Two other things outlast a deletion. The request itself is noted in the site's admin log by your Discord ID, as the administrators' nickname actions are, and that log keeps each entry for 90 days, so your ID can stay there for up to 90 days after the rest of your account has gone. And if you have been credited as a contributor — on the Contributors page under the console's Source tab, or for a Missing Pieces lead that was accepted — that credit stays, because it is public attribution that the administrators look after rather than part of your account; ask through the Contact Us form and it will be removed."
    },
    /* Who is answerable for all of the above, and when it last changed
       (29 Sept 2026). The name is the one the site already goes by
       everywhere else — the builder credits, The Little Maze, the event
       host's card — and the date is written out here rather than left to
       privacy.html's own "last revised" line, because the console's copy
       and the landing page's modal show only these sections. */
    {
        heading: "Who runs this site.",
        body: "Maze Rats is run by ChrisYepYep, who is responsible for the information described in this policy. Last updated: 1 October 2026."
    }
];

/* Fills a container with the policy: one .console-blurb per section, with a
   .console-hashline rule between each pair (not after the last). Built from
   DOM nodes rather than an innerHTML string so the copy above never has to
   be HTML-escaped by hand.

   Both callers pass a container that already sits inside console-styled
   chrome, so the classes are the console's own either way.

   EVERY EM DASH IS BORROWED FROM ROBOTO. Inside the homepage console this
   text is set in Volter Goldfish, which draws U+2014 as a PICTURE — a
   musical note (see PICTURE_GLYPHS in js/site.js) — so the policy's
   asides, and there are dozens, were each punctuated with a little note.
   The dashes are right (see HOUSE STYLE above), and the policy is shared
   with privacy.html, which is not in Volter at all, so the words stay as
   they are and just that one character changes face: the same trick
   .row-date-dot and .timeline-sep use. On the landing page's modal, which
   is not Volter either, the span is harmless. */
function appendPrivacyText(parent, text) {
    const parts = String(text).split("—");
    parts.forEach((part, i) => {
        if (i > 0) {
            const dash = document.createElement("span");
            dash.className = "console-dash";
            dash.textContent = "—";
            parent.appendChild(dash);
        }
        if (part) parent.appendChild(document.createTextNode(part));
    });
}

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
        appendPrivacyText(p, " " + section.body);
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
