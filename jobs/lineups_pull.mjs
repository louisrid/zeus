/* RETIRED.
 *
 * This scraped Fantasy Football Pundit for predicted line-ups. It failed three times: the site challenges
 * automated requests and answers a server with a 202 and an empty body, from this sandbox and from GitHub
 * Actions alike. The line-ups now live in config/lineups.json, transcribed from the source's published
 * graphics. A file that is right beats a job that does not run.
 *
 * Exits non-zero so a scheduled run cannot look like a success. The tidy workflow deletes it and its
 * workflow file properly.
 */
console.error("RETIRED. Predicted line-ups come from config/lineups.json. Delete this job and its workflow.");
process.exit(1);
