/**
 * The dashboard module — the spec renderer, the controller and the chart adapter.
 *
 * One module of several since v0.3.0. The kernel it is built on (`core/`), the
 * design system it paints with (`ui/`) and the data layer it fetches through
 * live beside it and are usable without it; the root `index.js` is the barrel
 * that gathers all of them, and it is what a consuming app's bundle re-exports.
 *
 * What this file exports is the contract — see CONTRACT.md. A module reached by
 * path instead is internal and may be renamed in a patch release.
 */

export { VERSION } from "../core/version.js";
export { Dashboard } from "./controller.js";
export { render, render_to_string, panels } from "./render.js";
export { palette, token, colour, markers, bounds } from "../charts/helpers.js";
export { engine, engines, has_engine, use_engine } from "../charts/adapter.js";
export { follow as drill } from "./drill.js";
