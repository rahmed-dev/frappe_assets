/**
 * The small amount of DOM this toolkit needs, without jQuery.
 *
 * Not a jQuery replacement and not an ambition to become one. It is four
 * functions, and they exist because jQuery was the last global keeping the
 * renderer from running anywhere other than a Desk session — `esc` needed
 * `frappe`, activation needed `$`, and between them the pure half of this
 * package could not be executed in a test without a stub pretending to be a
 * browser and a framework at once.
 *
 * Desk still hands us jQuery objects (`page.main`, `page.wrapper`), so `unwrap`
 * takes either and returns an element. That is the whole of the accommodation.
 */

/**
 * An `Element` from an element, a jQuery object, or a selector string.
 *
 * Frappe's page object exposes `main` and `wrapper` as jQuery, and a consumer
 * composing a `Dashboard` by hand will reasonably pass a plain element. Rather
 * than force either to convert, accept both at the boundary and be native
 * everywhere inside it.
 */
export function unwrap(target) {
	if (!target) {
		return null;
	}
	if (target instanceof Element) {
		return target;
	}
	if (typeof target === "string") {
		return document.querySelector(target);
	}
	// A jQuery object, or anything else array-like enough to be one.
	return target[0] instanceof Element ? target[0] : null;
}

/**
 * Delegate an event from a root that survives re-renders.
 *
 * Every refresh replaces the body's markup wholesale, so a handler bound to a
 * chip or an ⓘ button would be discarded with it. Delegation from the root is
 * what makes "bind once in the constructor" correct rather than a leak waiting
 * to happen.
 *
 * Returns its own unbinder. A framework that only offers `on` is a framework
 * whose consumers leak listeners, because the teardown path is the one nobody
 * writes until something is already wrong.
 */
export function delegate(root, type, selector, handler) {
	const listener = (event) => {
		const match = event.target.closest(selector);
		if (match && root.contains(match)) {
			handler(event, match);
		}
	};
	root.addEventListener(type, listener);
	return () => root.removeEventListener(type, listener);
}

/** A direct listener, with the same unbinder contract as `delegate`. */
export function listen(target, type, handler, options) {
	target.addEventListener(type, handler, options);
	return () => target.removeEventListener(type, handler, options);
}

/**
 * Replace an element's contents with a trusted HTML string.
 *
 * Named for what it is rather than for what it looks like. Everything reaching
 * it has already been through `esc` panel by panel, and the one node type that
 * has not — `{type: "html"}` — is documented as the unescaped escape hatch. A
 * single named function is also a single place to look when auditing that
 * claim, which `innerHTML` scattered across four files is not.
 */
export function fill(element, html) {
	element.innerHTML = html;
	return element;
}
