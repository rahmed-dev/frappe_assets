/**
 * `data/resource.js` — the guard that stops a slow answer overwriting a fast one,
 * and the three conveniences built on it.
 *
 * The sequence guard has a test here as well as in `test/dom/controller.test.js`,
 * and that is deliberate rather than duplication: it moved out of the controller
 * in v0.5.0, and the controller's copy proves the page still behaves, while this
 * one proves the object does. Either could break without the other.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Resource, key_of } from "../../data/resource.js";
import { State } from "../../data/state.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

/** A promise plus the handles to settle it later. */
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	resetHost();
	setHost(new TestHost({ today: "2026-03-01" }));
});

describe("construction", () => {
	it("refuses a resource with nothing to call", () => {
		expect(() => new Resource({})).toThrow(/fetch|method/);
	});

	it("takes a whitelisted method instead of a function", async () => {
		resetHost();
		setHost(new TestHost({ responses: { "app.api.summary": { total: 3 } } }));
		const r = new Resource({ method: "app.api.summary" });
		await r.reload({ from_date: "2026-01-01" });
		expect(r.data).toEqual({ total: 3 });
	});
});

describe("the sequence guard", () => {
	it("lets only the newest answer land", async () => {
		const first = deferred();
		const second = deferred();
		const queue = [first, second];
		const r = new Resource({ fetch: () => queue.shift().promise });

		r.reload({ n: 1 });
		const newest = r.reload({ n: 2 });

		second.resolve("newest");
		await newest;
		first.resolve("stale");
		await first.promise;

		expect(r.data).toBe("newest");
	});

	it("does not record a failure from a superseded request", async () => {
		const first = deferred();
		const second = deferred();
		const queue = [first, second];
		const r = new Resource({ fetch: () => queue.shift().promise });

		r.reload({ n: 1 }).catch(() => {});
		const newest = r.reload({ n: 2 });
		second.resolve("newest");
		await newest;

		first.reject(new Error("timed out"));
		await first.promise.catch(() => {});

		expect(r.error).toBeNull();
		expect(r.data).toBe("newest");
	});

	it("aborts the superseded request rather than leaving it running", async () => {
		// Ignoring the answer is not enough. On a dashboard whose aggregation is
		// expensive, clicking through four presets otherwise leaves four queries
		// competing for the same database for nothing.
		const signals = [];
		const r = new Resource({
			fetch: (params, { signal }) => {
				signals.push(signal);
				return new Promise(() => {});
			},
		});
		r.reload({ n: 1 });
		r.reload({ n: 2 });
		expect(signals[0].aborted).toBe(true);
		expect(signals[1].aborted).toBe(false);
	});
});

describe("failure", () => {
	it("is announced, recorded and rethrown", async () => {
		const r = new Resource({ fetch: () => Promise.reject(new Error("nope")) });
		const seen = [];
		r.on("error", ({ error }) => seen.push(error.message));
		await expect(r.reload({})).rejects.toThrow("nope");
		expect(seen).toEqual(["nope"]);
		expect(r.error.message).toBe("nope");
		expect(r.loading).toBe(false);
	});
});

describe("the cache", () => {
	it("is off unless a TTL was asked for", async () => {
		let calls = 0;
		const r = new Resource({ fetch: () => Promise.resolve(++calls) });
		await r.reload({ n: 1 });
		await r.reload({ n: 1 });
		expect(calls).toBe(2);
	});

	it("answers an identical question inside the TTL without asking again", async () => {
		let calls = 0;
		const r = new Resource({ cache: 10_000, fetch: () => Promise.resolve(++calls) });
		await r.reload({ n: 1 });
		await r.reload({ n: 1 });
		expect(calls).toBe(1);
	});

	it("does not confuse two different questions", async () => {
		let calls = 0;
		const r = new Resource({ cache: 10_000, fetch: () => Promise.resolve(++calls) });
		await r.reload({ n: 1 });
		await r.reload({ n: 2 });
		expect(calls).toBe(2);
	});

	it("keys on the question, not on the order it was written", async () => {
		expect(key_of({ a: 1, b: 2 })).toBe(key_of({ b: 2, a: 1 }));
	});

	it("still announces a hit, so a listener that redraws does", async () => {
		const r = new Resource({ cache: 10_000, fetch: () => Promise.resolve("x") });
		await r.reload({ n: 1 });
		let changes = 0;
		r.on("change", () => (changes += 1));
		await r.reload({ n: 1 });
		expect(changes).toBe(1);
	});

	it("expires", async () => {
		vi.useFakeTimers();
		try {
			let calls = 0;
			const r = new Resource({ cache: 1000, fetch: () => Promise.resolve(++calls) });
			await r.reload({ n: 1 });
			vi.advanceTimersByTime(1500);
			await r.reload({ n: 1 });
			expect(calls).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("is defeated by an explicit re-ask, which is what Refresh means", async () => {
		// A Refresh button that can return the answer already on screen is a button
		// that teaches people to press it twice.
		let calls = 0;
		const r = new Resource({ cache: 10_000, fetch: () => Promise.resolve(++calls) });
		await r.reload({ n: 1 });
		await r.refetch();
		expect(calls).toBe(2);
	});
});

describe("transform", () => {
	it("is applied before the answer is stored", async () => {
		const r = new Resource({
			fetch: () => Promise.resolve({ rows: [1, 2, 3] }),
			transform: (data) => data.rows.length,
		});
		await r.reload({});
		expect(r.data).toBe(3);
	});
});

describe("following a State", () => {
	it("fetches once now and again on every change", async () => {
		const asked = [];
		const state = new State({ dated: false, filters: [{ fieldname: "company" }] });
		const r = new Resource({
			fetch: (params) => {
				asked.push(params);
				return Promise.resolve(asked.length);
			},
		});
		await r.follow(state);
		state.set({ company: "Acme" });
		await Promise.resolve();

		expect(asked).toEqual([{}, { company: "Acme" }]);
	});

	it("stops following when destroyed", async () => {
		let calls = 0;
		const state = new State({ dated: false, filters: [{ fieldname: "company" }] });
		const r = new Resource({
			fetch: () => {
				calls += 1;
				return Promise.resolve(calls);
			},
		});
		await r.follow(state);
		r.destroy();
		state.set({ company: "Acme" });
		await Promise.resolve();
		expect(calls).toBe(1);
	});
});
