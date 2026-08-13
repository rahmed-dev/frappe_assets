/**
 * One request, managed: sequence, abort, cache, poll, realtime.
 *
 * Until v0.5.0 the whole data layer was the `fetch(range, {signal})` callback a
 * page handed the controller, plus a sequence guard the controller kept to stop
 * a slow response overwriting a fast one. That guard is the interesting part —
 * it is easy to leave out, its absence is invisible on a fast connection, and
 * the failure it prevents is a page showing last window's numbers under this
 * window's heading with nothing on screen saying so.
 *
 * Wrapping it in an object buys the three things that guard implies but that
 * nobody writes by hand:
 *
 *   abort   the superseded request is cancelled, not merely ignored — on a
 *           dashboard whose aggregation is expensive, clicking through four
 *           presets otherwise leaves four queries competing for one database
 *   cache   an optional TTL, so flipping back to a window looked at ten seconds
 *           ago is instant and free
 *   poll    an interval that pauses when the tab is hidden, because a dashboard
 *           left open on a wall-mounted screen is the case that asks for polling
 *           and a laptop lid closed overnight is the case that punishes it
 *
 * WHAT IS DELIBERATELY NOT HERE: in-flight dedupe.
 * Sharing one promise between two `reload`s with equal params reads like a free
 * saving and is not one. Within a single Resource the repeated ask is a Refresh
 * button or a poll tick, and both of them mean "ask again" — answering them with
 * the request already in the air makes Refresh a button that can return the
 * answer already on screen. The duplicate work that *is* worth removing is two
 * panels calling the same method at once, and that needs a registry shared
 * between resources rather than a map inside one; the TTL cache covers most of
 * it in the meantime, and honestly.
 *
 * A dashboard may hold one Resource or one **per panel**. The second is what
 * makes per-panel loading and error states possible: one failing query stops
 * blanking the other five panels.
 */

import { Emitter } from "../core/events.js";
import { host } from "../core/host.js";

/**
 * A stable string for a params object — the cache key.
 *
 * Keys are sorted, so `{a: 1, b: 2}` and `{b: 2, a: 1}` are one entry rather
 * than two — they are the same question, and a cache that stored them twice
 * would miss on the second asking. `JSON.stringify` is enough because the values reaching
 * here are a date window and declared filter values, all of them serialisable by
 * construction.
 */
export function key_of(params) {
	if (params == null) {
		return "";
	}
	const keys = Object.keys(params).sort();
	return JSON.stringify(keys.map((key) => [key, params[key]]));
}

export class Resource {
	/**
	 * @param {object} options
	 *   fetch(params, {signal})  → Promise<data>   required
	 *   method                   → "app.api.thing" alternative to `fetch`; called
	 *                                through the host, resolving to `message`
	 *   cache                    → 0               ms to reuse a previous answer
	 *   poll                     → 0               ms between automatic reloads
	 *   realtime                 → ""              a Frappe realtime event that
	 *                                                triggers a reload
	 *   transform(data, params)  → data            optional, applied before the
	 *                                                answer is stored
	 */
	constructor(options = {}) {
		if (typeof options.fetch !== "function" && !options.method) {
			throw new TypeError("dd: a Resource needs a `fetch` function or a `method`");
		}
		this.options = options;
		this.events = new Emitter();

		this.data = undefined;
		this.error = null;
		this.loading = false;
		/** True once an answer has landed — the flag that says a skeleton is over. */
		this.loaded = false;
		/** The params the current `data` was fetched for. */
		this.params = null;

		// A monotonic request counter. Every request takes the next number and only
		// the newest may write to `data` — see `reload`.
		this.sequence = 0;
		this.pending = null;

		this.cache = new Map();
		this.timers = [];
		this.unbinders = [];

		if (options.realtime) {
			this.unbinders.push(host("Resource").on_realtime(options.realtime, () => this.refetch()));
		}
	}

	/** The underlying call, whichever of the two forms the consumer chose. */
	request(params, signal) {
		if (this.options.fetch) {
			return Promise.resolve(this.options.fetch(params, { signal }));
		}
		return host("Resource").call(this.options.method, params, { signal });
	}

	/**
	 * Ask for `params`, and let the answer land only if it is still the newest.
	 *
	 * Returns a promise of the data, which rejects on a real failure and resolves
	 * to `undefined` when the request was superseded. A caller that only wants to
	 * paint a page can ignore the return entirely and listen for `change`.
	 */
	reload(params = this.params || {}) {
		const key = key_of(params);
		const hit = this.cached(key);
		if (hit) {
			// A hit still emits `after_fetch` and `change`. A cache that answered
			// silently would leave a listener that redraws on change looking at the
			// previous window's markup, which is a worse bug than a slow page.
			this.adopt(hit.data, params);
			return Promise.resolve(hit.data);
		}

		this.pending?.abort();
		const controller = typeof AbortController === "function" ? new AbortController() : null;
		this.pending = controller;
		const seq = ++this.sequence;

		this.params = params;
		this.loading = true;
		this.error = null;
		this.events.emit("before_fetch", { params });

		return this.request(params, controller?.signal).then(
			(answer) => {
				if (seq !== this.sequence) {
					return undefined;
				}
				const data = this.options.transform ? this.options.transform(answer, params) : answer;
				if (this.options.cache) {
					this.cache.set(key, { at: Date.now(), data });
				}
				this.adopt(data, params);
				return data;
			},
			(error) => {
				if (seq !== this.sequence || controller?.signal.aborted) {
					return undefined;
				}
				this.loading = false;
				this.error = error;
				host("Resource").error(error);
				this.events.emit("error", { error, params });
				this.events.emit("change", { resource: this, error });
				throw error;
			},
		);
	}

	/** Ask again for whatever was last asked, ignoring the cache. */
	refetch() {
		return this.reload(this.invalidate(this.params || {}));
	}

	/** Forget the cached answer for these params. Returns the params, for chaining. */
	invalidate(params) {
		this.cache.delete(key_of(params));
		return params;
	}

	/** A cache entry that has not expired, or null. */
	cached(key) {
		if (!this.options.cache) {
			return null;
		}
		const hit = this.cache.get(key);
		if (!hit) {
			return null;
		}
		if (Date.now() - hit.at > this.options.cache) {
			this.cache.delete(key);
			return null;
		}
		return hit;
	}

	/** Store an answer and announce it. */
	adopt(data, params) {
		this.data = data;
		this.params = params;
		this.loading = false;
		this.loaded = true;
		this.error = null;
		this.events.emit("after_fetch", { data, params });
		this.events.emit("change", { resource: this, data, params });
	}

	/**
	 * Reload every `interval` ms, skipping ticks while the tab is hidden.
	 *
	 * The visibility check is the whole reason this is here rather than a
	 * `setInterval` at the call site: a dashboard left open in a background tab
	 * overnight is otherwise several thousand aggregate queries nobody read. The
	 * catch-up fetch on becoming visible is what makes the skip safe — the reader
	 * comes back to current numbers, not to whatever was true when they left.
	 */
	start_polling(interval = this.options.poll) {
		if (!interval) {
			return this;
		}
		this.stop_polling();
		const tick = setInterval(() => {
			if (typeof document !== "undefined" && document.hidden) {
				return;
			}
			this.refetch();
		}, interval);
		this.timers.push(() => clearInterval(tick));

		if (typeof document !== "undefined" && document.addEventListener) {
			const wake = () => {
				if (!document.hidden) {
					this.refetch();
				}
			};
			document.addEventListener("visibilitychange", wake);
			this.timers.push(() => document.removeEventListener("visibilitychange", wake));
		}
		return this;
	}

	stop_polling() {
		this.timers.forEach((stop) => stop());
		this.timers = [];
		return this;
	}

	/**
	 * Follow a `State`: refetch whenever it changes, starting now.
	 *
	 * This is the only place the two objects meet, and it is one line of each
	 * knowing about the other's public surface rather than either importing the
	 * other's internals — which is what lets a page use a Resource with no State,
	 * or drive one from something else entirely.
	 */
	follow(state) {
		this.unbinders.push(state.on(() => this.reload(state.get())));
		return this.reload(state.get());
	}

	/** Abandon whatever is in flight. The answer is discarded, not applied. */
	abort() {
		this.pending?.abort();
		this.sequence += 1;
		this.loading = false;
		return this;
	}

	on(event, handler) {
		return this.events.on(event, handler);
	}

	off(event, handler) {
		this.events.off(event, handler);
		return this;
	}

	destroy() {
		this.abort();
		this.stop_polling();
		this.unbinders.forEach((unbind) => unbind());
		this.unbinders = [];
		this.cache.clear();
		this.events.clear();
	}
}

/** `resource({...})` — the same thing, for a page that does not want `new`. */
export function resource(options) {
	return new Resource(options);
}
