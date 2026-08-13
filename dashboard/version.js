/**
 * The release this build came from, kept in step with `package.json` by the same
 * commit — see CONTRIBUTING.md § Cutting a release.
 *
 * It lives in its own module rather than in `index.js` because the controller
 * stamps it on the page and `index.js` imports the controller; declaring it at
 * the surface would make that a cycle.
 */
export const VERSION = "0.2.0";
