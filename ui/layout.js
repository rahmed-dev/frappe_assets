/**
 * Layout values that are facts about the stylesheet.
 *
 * This lives in `ui/` rather than the kernel because the clamp below is not a
 * general truth about columns — it is what `ui/styles/dash.scss` actually
 * paints. Move the stylesheet and this moves with it.
 */

/**
 * The column count, as a number, for a `dd-grid-N` class.
 *
 * Coerced rather than interpolated: the count reaches a class attribute, and
 * `dd-grid-` followed by whatever a spec happened to hold is either a class that
 * does not exist (a silent one-column grid) or, with a space in it, a second
 * class that does. `dash.scss` styles `dd-grid-2` through `dd-grid-5` and leaves
 * one column as the base, so anything above five is clamped rather than dropped:
 * a seven-item rail drawn as five columns is a layout complaint, drawn as one is
 * a broken page.
 */
export function columns_of(value, fallback) {
	const count = Number(value) || Number(fallback) || 1;
	return Math.min(Math.max(Math.trunc(count), 1), 5);
}
