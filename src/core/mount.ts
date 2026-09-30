/**
 * Mount path of this plugin's HTTP carrier.
 *
 * One source of truth for both halves: the host half registers its routes and
 * builds proxy URIs from it, and the client half points the sidebar panel's
 * iframe at the player page.
 *
 * Deliberately NOT under `/plugins/`: `@deepseek-ai/dsh-client-modules`
 * registers a PREFIX route on `/plugins` that serves client bundles and answers
 * every unknown sub-path with 404, so any carrier mounted there is shadowed on
 * every path except its own exact page route.
 */
export const MOUNT_PATH = "/qiaomu-radio";

/**
 * The player page itself.
 *
 * Note the trailing slash here but NOT in the registered prefix route: the
 * harness matches prefixes with `pathname.startsWith(prefix + "/")`, so a
 * prefix that carries its own slash only ever matches `/qiaomu-radio//app.js`.
 */
export const PLAYER_PATH = `${MOUNT_PATH}/`;
