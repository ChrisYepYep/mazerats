/* How long an open archive page is warned before Maintenance moves it to
   the landing page (30 Oct 2026, the owner's: "Site will be offline in
   [2 minute countdown]"). settings.js stamps maintenanceAt when the switch
   goes to Maintenance and answers maintenanceKickAt = that + this;
   presence.js tells the Warren the same moment. */
const MAINTENANCE_WARN_MS = 2 * 60 * 1000;

function maintenanceKickAt(doc) {
    if (!doc || doc.landingState !== "maintenance") return "";
    const at = Date.parse(doc.maintenanceAt);
    return Number.isFinite(at) ? new Date(at + MAINTENANCE_WARN_MS).toISOString() : "";
}

module.exports = { MAINTENANCE_WARN_MS, maintenanceKickAt };
