/* Checks the shared admin password sent by the admin page on every write
   request. Not a full user-account system — just enough to stop random
   visitors from hitting the API directly and changing data. */
function isAuthorized(event) {
    const token = event.headers["x-admin-token"] || "";
    return Boolean(process.env.ADMIN_PASSWORD) && token === process.env.ADMIN_PASSWORD;
}

const UNAUTHORIZED = {
    statusCode: 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Unauthorized" })
};

module.exports = { isAuthorized, UNAUTHORIZED };
