/**
 * The lifecycle seam.
 *
 * A framework that only lets a consumer supply `fetch` and `spec` forces every
 * other need into one of those two — a timing measurement wrapped around the
 * fetch, a "no rows today" banner grafted onto the spec, an analytics ping that
 * has nowhere honest to live at all. An emitter costs almost nothing and gives
 * each of those its own place.
 *
 * Two deliberate choices:
 *
 * `on` returns its own unbinder, exactly as `core/dom.js` does. A framework
 * whose only way to detach is to hand back the identical function reference is
 * one whose consumers do not detach, because arrow functions are how people
 * write handlers and none of them are the same reference twice.
 *
 * A throwing handler does not stop the emit. The emitter sits on the render and
 * fetch path, and a consumer's logging callback must not be able to take the
 * page down with it. The error is reported through the host and the remaining
 * handlers still run.
 */

import { host } from "./host.js";

export class Emitter {
	constructor() {
		this.handlers = new Map();
	}

	/**
	 * Listen. Returns the unbinder.
	 *
	 * The set is copied on write rather than mutated in place, so a handler that
	 * unbinds itself — or binds another — cannot change the collection being
	 * iterated mid-emit.
	 */
	on(event, handler) {
		const set = new Set(this.handlers.get(event));
		set.add(handler);
		this.handlers.set(event, set);
		return () => this.off(event, handler);
	}

	/** Listen for exactly one emit. */
	once(event, handler) {
		const off = this.on(event, (...args) => {
			off();
			handler(...args);
		});
		return off;
	}

	off(event, handler) {
		const set = this.handlers.get(event);
		if (!set || !set.has(handler)) {
			return this;
		}
		const next = new Set(set);
		next.delete(handler);
		if (next.size) {
			this.handlers.set(event, next);
		} else {
			this.handlers.delete(event);
		}
		return this;
	}

	/** Every handler runs, even if an earlier one threw. */
	emit(event, payload) {
		const set = this.handlers.get(event);
		if (!set) {
			return this;
		}
		for (const handler of set) {
			try {
				handler(payload);
			} catch (error) {
				host("Emitter").error(error);
			}
		}
		return this;
	}

	/** Drop every handler. Called by `Dashboard#destroy`. */
	clear() {
		this.handlers.clear();
		return this;
	}
}
