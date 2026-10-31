/* The privacy policy text, in one place.

   It renders in three separate spots: the homepage console modal's Privacy
   page (js/console.js), the landing page's own privacy modal
   (js/welcome.js), and the formal page at /privacy (privacy.html), which is
   the one with an address of its own: linkable, printable, and readable
   without a 204px porthole. The landing page needs its own copy of the view
   because home.html is off-limits to regular visitors during Coming Soon/
   Maintenance (the gate in home.html's <head> bounces them straight back to
   index.html), so a footer link pointing at home.html#privacy simply
   dead-ends for exactly the visitors who can only ever see the landing page.

   Two renderers, one source: edit the wording here and both update.

   SHORT POINTS SINCE 30 OCT 2026 (the owner's: "rework our privacy policy so
   it's more readable, make it so its shorter and easy to read bullet points
   ... make it so it looks like it was written by a human, so for example
   dont use any emdashes"). Each section is a heading and a few points. Keep
   it that way when something is added:

     - one fact per point, in plain words, as you'd say it to somebody;
     - no em dashes or en dashes, and no " - " asides either: a full stop,
       a comma or brackets instead;
     - straight quotes and apostrophes only. Volter Goldfish, which the
       console sets this in, draws the curly ones (and the bullet character)
       as pictures, which is why the bullets are drawn by CSS;
     - British spelling, as everywhere else: authorised, honour.

   Each point still has to be TRUE of the code. The notes beside a section
   say which files decide what it promises: change one, change both. */
const PRIVACY_SECTIONS = [
    {
        heading: "The short version.",
        points: [
            "We don't sell or share your data, and there are no adverts.",
            "You can read the archive and play Fallin' Furni and Pura Panic without an account.",
            "Signing in with Discord is optional. We only ask Discord for your basic profile.",
            "We count how the site is used without following you around, and nothing here tracks you on other websites.",
            "We don't keep mailing lists, build profiles of you or use your data for marketing.",
            "Ask us through the Contact Us form and we'll delete what we hold about you."
        ]
    },
    /* discord-auth.js, _originsbot.js, player-nick.js, players-admin.js. */
    {
        heading: "Signing in with Discord.",
        points: [
            "You need to sign in to play the daily games, send pictures through Add Maze Info, appear on the leaderboards (apart from Pura Panic's) and have a profile people can find.",
            "We only ask Discord for the \"identify\" permission. That gives us your user ID, username, display name and avatar. We can't see your email, servers or friends.",
            "We keep those details, plus the dates you first and last signed in.",
            "The token Discord gives us is used once to read your profile and then thrown away, so we can't do anything on Discord as you.",
            "When you sign in, and about once a week until it finds one, we send your Discord ID (and nothing else) to OriginsBot to see if you've linked a Habbo Origins account. If you have, we keep that Habbo name and hotel, and it becomes your nickname here, locked so it matches the hotel.",
            "If that Habbo name can't be used, or is too close to another player's nickname, nobody's name is taken away. The admins sort it out by hand.",
            "We keep a scrambled code of the network you last used. It isn't your IP address, and nobody outside the site can turn it back into one. It lets the admins block a network that's being used to abuse the site."
        ]
    },
    {
        heading: "Your nickname.",
        points: [
            "You can choose a nickname, and it's shown instead of your Discord name everywhere on the site. You can change or remove it from the console's Profile page.",
            "We keep your last ten nickname changes, when each was made and by whom, and how many times you changed it that day.",
            "Nicknames go through a word filter. The admins can ask you to pick another, change or remove it, or lock it. Until you pick a new one when asked, the games stay closed to you.",
            "If the admins turn a nickname down, we keep a simplified copy (up to ten) so the same name can't just be picked again.",
            "Anything an admin does to your nickname or motto goes in the admin log for 90 days, under your Discord ID."
        ]
    },
    {
        heading: "What your account keeps.",
        points: [
            "Mazes you've marked as completed or saved for later, your daily game progress and scores, and in December the advent calendar doors you've opened. This means they follow you between devices.",
            "Your favourite maze, featured badge, whether your profile is hidden, and when the site first showed you your profile.",
            "Which console notifications you've read or deleted.",
            "If the admins make you a Fallin' Furni beta tester, that mark, who added it and when. It's never shown publicly.",
            "If a Habbo with your nickname is suggested as yours, we keep its name and hotel with your account, and so that they aren't suggested again, up to ten Habbos that were unlinked from you or that you said aren't yours.",
            "The admins can see a list of everyone who has signed in: Discord names, ID and avatar, sign-in dates, nickname history, counts of what each person has played and sent, and whether they're blocked. That list is never public."
        ]
    },
    /* profiles.js decides what a profile shows and who is found by search. */
    {
        heading: "What other people can see.",
        points: [
            "Leaderboards show your nickname, your scores and the head of your linked Habbo (or a plain disc). The daily games also show your result grid, which gives nothing about the maze away. Without a nickname you're not on the boards at all.",
            "Your Discord avatar, username and ID are never shown anywhere. Each leaderboard row carries a scrambled stand-in for your account so the page can find your own row.",
            "Your profile stays hidden until the site has shown you what a profile is, or you choose to show it. After that anyone can find it by your nickname or your linked Habbo. Before then, a search for your linked Habbo only shows the Habbo, the month you joined and that your profile isn't active yet.",
            "A profile shows your name, the month you joined, the mazes you've completed and what they add up to, your badges, favourite maze and featured badge, daily game streaks and points, your best Fallin' Furni run and Pura Panic game, and how many of your Add Maze Info sends were accepted.",
            "With a Habbo linked, it also shows that Habbo's name, avatar, motto and whether it's online, as Habbo itself does. With no Habbo linked, a Habbo with exactly your nickname is shown marked \"Not verified\" (never whether it's online). You can prove it's yours with a code in your motto, or tell us it isn't you.",
            "The Contributor, Maze Owner and Event Host badges are worked out from your Habbo name and checked again at most every half hour.",
            "A motto with a filtered word in it isn't shown. We keep a note of it so an admin can approve it or keep it hidden.",
            "You can hide your profile at any time. Your To do list is never shown to anyone but you."
        ]
    },
    /* ff-runs.js and ff-scores.js. */
    {
        heading: "Playing Fallin' Furni.",
        points: [
            "Every round is recorded so we can tune the game: levels played, times, seats taken, how it ended, points, your window size and whether it was a touchscreen.",
            "Signed in, a round carries your Discord name and ID. If you typed a Habbo name to play as, it keeps that name and hotel too. We don't check that name and never show it.",
            "Each round also keeps the IP address it was played from, signed in or not, so we can spot one connection playing on several accounts. This means a round played signed out isn't anonymous.",
            "Only the admins see these records, and they're deleted after 180 days.",
            "Your best run is kept while you have no nickname, but it isn't shown on the boards until you choose one."
        ]
    },
    /* pura-scores.js (GUESTS, THE GAME LOG, CONTINUING) and js/pura-panic.js. */
    {
        heading: "Playing Pura Panic.",
        points: [
            "Every finished game is recorded so we can tune it: score, rows, level, pieces, length, how it ended, the clears and chains made, and whether it was continued. We also note whether you were on a touchscreen, had the lights off or muted the music.",
            "A game in progress is sent each time it reaches a new level, so one cut short by a closed tab still counts. We also note each press of Play, to see how many games go unfinished.",
            "Signed in, a record carries your Discord ID and the name you go by here. Signed out, it carries your proved Habbo or your Guest Rat number.",
            "No IP address is kept. The records are only seen by the admins and are deleted after 180 days.",
            "The leaderboard keeps each player's best game until they delete their account or ask us to remove it.",
            "Signed out, you can play as your Habbo. We check with Habbo Origins that it exists, and you prove it's yours with a short code in your motto. We only keep a scrambled copy of the code, and delete it within the hour. Or you can play as a numbered Guest Rat.",
            "Your browser keeps a token so you can play as that Habbo or Guest Rat again. \"Not you?\" on the first screen makes it forget them.",
            "To stop a score counting twice, we keep a short note for each game sent (for four hours) and each game continued (for just over a day)."
        ]
    },
    /* contact.js, dead-end-leads.js, event-entries.js. */
    {
        heading: "Messages and submissions.",
        points: [
            "Contact Us keeps your message, Habbo name and an optional Discord handle. If you're signed in it uses your Discord name, username and ID instead of a typed handle.",
            "Add Maze Info keeps what you write, which maze or event it's about, a Habbo name if you give one and, if you're signed in, your Discord name, username and ID. Pictures need you to be signed in. Accepted pictures go into the archive, and rejected ones are deleted straight away.",
            "Event Submission keeps your Habbo name, your picture, which event it's for and, if you're signed in, your Discord details. Only the admins judging the event see the picture.",
            "All three keep the IP address they were sent from, only for dealing with spam and abuse. It's removed after 30 days. Event entries also keep a scrambled code for two days to count how many have been sent.",
            "Messages and submissions are kept until an admin deletes them. Ask and we'll delete yours. If a submission of yours is accepted, your name may go on the Contributors list."
        ]
    },
    /* track.js, error-report.js and site-errors.js, presence.js, _ratelimit.js. */
    {
        heading: "Analytics and keeping the site running.",
        points: [
            "Umami counts visits and visitors in total, without knowing who anyone is. Archive searches are part of the page address, so Umami sees what was searched for, but not who searched.",
            "We also log which parts of the site get used, like which mazes are opened. No IP address or account is attached, just a random ID that's gone when you close the tab. These logs are deleted after 60 days.",
            "If your browser sends \"Do Not Track\" or Global Privacy Control, none of that is logged. Bots and search engine crawlers aren't logged either.",
            "If something breaks in your browser, it sends us an error report: what went wrong, the page (with anything you typed taken out), your browser and device type, window size, the country you're in and the last few buttons clicked. No IP address, account or name. Reports are deleted once an error hasn't happened for 90 days. They're sent with Do Not Track on, but not with Global Privacy Control.",
            "When the site is about to go down for maintenance, an open page tells us it's still there every few seconds, using a random ID made for that tab. That's how we know everyone has left. Nothing else is sent, and each ID is deleted a few minutes after its last message.",
            "To stop anyone flooding the site, we count each connection's requests using a scrambled code that changes daily. A few Pura Panic steps (motto codes, new Guest Rat numbers, game starts) are counted by the network code instead. The counts are deleted within a couple of hours.",
            "Sign-in attempts on the admin panel are logged for 90 days with the IP address, browser and name typed (scrambled if it isn't an admin's name). Admins who sign in get a cookie for 180 days so other people's wrong guesses can't lock them out."
        ]
    },
    /* Everything in localStorage, sessionStorage and cookies.
       TO ADD WHEN SCOUT'S TRAIL GOES LIVE (26 Oct 2026): a point saying it
       keeps the furthest zone and rubies found (mazerats_ratrace_progress),
       best scores (mazerats_ratrace_best2), lights (mazerats_ratrace_dark)
       and music (mazerats_ratrace_music), all on the device alone. */
    {
        heading: "What's stored in your browser.",
        points: [
            "Your colour scheme and a copy of the site's colours, whether the site was last seen open, seasonal decoration settings, and how far your clock is from ours (so the daily games agree on the day).",
            "Mazes you've completed or saved (only on your device unless you sign in), and which notifications you've seen.",
            "Daily game progress, marked with a scrambled stand-in for your account, never your Discord ID.",
            "Fallin' Furni: your room, your avatar, any Habbo name you typed, and your window and sound settings.",
            "Pura Panic: your lights and music settings, your proved Habbo or Guest Rat and its token, a game you left part-way (for up to a day) and a finished game waiting to be saved after you were signed out (for up to three hours).",
            "The Halloween bat game's best score, which never leaves your device. In December, signed in, a copy of which advent doors you've opened, so the button can show when one is waiting.",
            "If a site-wide block applies to you, when it ends and why.",
            "Cookies: one for ten minutes while you approve Discord sign-in, then a session cookie for 30 days that the page's scripts can't read. Admins also have a session token and their own panel settings.",
            "None of it follows you to other websites, and clearing your browser data removes all of it."
        ]
    },
    {
        heading: "Who else handles your data.",
        points: [
            "Netlify hosts the site and stores its pictures. MongoDB Atlas is our database.",
            "Resend emails us a copy of each Contact Us and Add Maze Info message, including your Discord details if you were signed in.",
            "Umami does our visitor counts, and Discord handles signing in (so Discord knows you signed in here).",
            "OriginsBot is only sent your Discord ID. Habbo Origins is only sent Habbo names, to look up profiles, check motto codes and run the profile search. Habbo's imaging service is only sent an avatar's look, to draw heads.",
            "Habbos we look up are kept for 90 days after they were last checked, for as long as an account is linked to them, or for good if they're credited in the archive.",
            "Your browser also loads things straight from Google Fonts, Habbo (avatars and article pictures), FurniIndex (furni pictures) and Umami. Like any website, they see your IP address and browser."
        ]
    },
    /* _bans.js and discord-auth.js. */
    {
        heading: "Blocks.",
        points: [
            "To deal with abuse, the admins can block a Discord account, an IP address or range, or a network code, for good or for a set time.",
            "A block either stops everything except reading, or closes the whole site apart from this policy.",
            "The site checks blocks each time you use it. A block keeps what it's on, how long it lasts, the reason and which admin made it. Only the admins see the list.",
            "Ended blocks are deleted a week later, and lifted ones straight away. Making, changing or lifting one goes in the admin log for 90 days."
        ]
    },
    {
        heading: "Deleting your data.",
        points: [
            "You can sign out at any time, or sign out on every device at once. You can also remove our access in Discord's Authorised Apps settings.",
            "To delete your account (your profile, scores, leaderboard rows, game records, completed mazes and advent doors), ask through the Contact Us form.",
            "Played Pura Panic signed out? Ask the same way and we'll remove that leaderboard row and those records.",
            "A block stays after your account is deleted, or anyone blocked could just ask to be forgotten.",
            "Your deletion request stays in the admin log for up to 90 days, under your Discord ID. Contributor credits stay unless you ask us to remove them too."
        ]
    },
    /* Who is answerable for all of the above, and when it last changed. The
       date is here rather than in privacy.html, because the console's copy
       and the landing page's modal show only these sections. */
    {
        heading: "Who runs this site.",
        points: [
            "Maze Rats is run by ChrisYepYep, who is responsible for everything in this policy.",
            "Last updated: 30 October 2026."
        ]
    }
];

function pointList(points, className) {
    const ul = document.createElement("ul");
    ul.className = className;
    points.forEach(text => {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
    });
    return ul;
}

/* Fills a container with the policy for the two console-styled views: each
   section's heading as a .console-blurb, its points as a list, and a
   .console-hashline rule between sections (not after the last). Built from
   DOM nodes rather than an innerHTML string so the copy above never has to
   be HTML-escaped by hand. */
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
        p.className = "console-blurb console-privacy-head";
        const strong = document.createElement("strong");
        strong.textContent = section.heading;
        p.appendChild(strong);
        container.appendChild(p);
        container.appendChild(pointList(section.points, "console-privacy-list"));
    });
}

/* The same policy as an ordinary document, for privacy.html: real headings
   that a screen reader, a search engine and a print stylesheet can all
   navigate by. The wording is shared, so the pages cannot drift apart. */
function renderPrivacyDocument(container) {
    if (!container) return;
    container.innerHTML = "";
    PRIVACY_SECTIONS.forEach(section => {
        const sec = document.createElement("section");
        sec.className = "legal-section";

        const h = document.createElement("h2");
        // The stored headings end in a full stop, which reads correctly as a
        // lead-in in the console and wrongly as a heading of its own.
        h.textContent = section.heading.replace(/\.\s*$/, "");
        sec.appendChild(h);
        sec.appendChild(pointList(section.points, "legal-list"));

        container.appendChild(sec);
    });
}
