/* Drives the welcome/splash screen (index.html) — swaps the Enter button's
   label and behavior based on the landing state set from the admin page
   (see netlify/functions/settings.js). Defaults to a working "Enter" link
   if the check fails, so a live/API hiccup never locks visitors out. */
document.addEventListener("DOMContentLoaded", async () => {
    const btn = document.getElementById("welcome-btn");
    const label = document.getElementById("welcome-btn-label");

    const { landingState } = await Api.getSiteSettings();

    if (landingState === "coming-soon") {
        label.textContent = "Coming Soon";
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
    } else if (landingState === "maintenance") {
        label.textContent = "Maintenance, Back Soon!";
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
    } else {
        label.textContent = "Enter";
        btn.setAttribute("href", "home.html");
        btn.classList.remove("is-disabled");
    }
});
