/**
 * The lifecycle emitter.
 *
 * Small enough to look obviously correct and therefore worth testing, because
 * the two properties that matter here are both about what happens when a
 * consumer's handler misbehaves — and neither is visible by reading the happy
 * path.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Emitter } from "../../core/events.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

beforeEach(() => {
	resetHost();
	setHost(new TestHost());
});

describe("Emitter", () => {
	it("hands back an unbinder rather than expecting the same reference twice", () => {
		// The whole reason `on` returns a function: handlers are written as arrow
		// functions, and no two of those are ever the same reference.
		const emitter = new Emitter();
		const seen = [];
		const off = emitter.on("tick", (payload) => seen.push(payload));

		emitter.emit("tick", 1);
		off();
		emitter.emit("tick", 2);

		expect(seen).toEqual([1]);
	});

	it("runs every handler even when one of them throws", () => {
		// The emitter sits on the render and fetch path. A consumer's logging
		// callback must not be able to take the page down with it.
		const emitter = new Emitter();
		const after = vi.fn();
		emitter.on("tick", () => {
			throw new Error("consumer bug");
		});
		emitter.on("tick", after);

		expect(() => emitter.emit("tick", {})).not.toThrow();
		expect(after).toHaveBeenCalled();
	});

	it("survives a handler that unbinds itself mid-emit", () => {
		// The set is copied on write for this: mutating the collection being
		// iterated is undefined enough to be worth making impossible.
		const emitter = new Emitter();
		const seen = [];
		const off = emitter.on("tick", () => {
			seen.push("once");
			off();
		});
		emitter.on("tick", () => seen.push("other"));

		emitter.emit("tick");
		emitter.emit("tick");

		expect(seen).toEqual(["once", "other", "other"]);
	});

	it("once fires exactly once", () => {
		const emitter = new Emitter();
		const seen = [];
		emitter.once("tick", (n) => seen.push(n));
		emitter.emit("tick", 1);
		emitter.emit("tick", 2);
		expect(seen).toEqual([1]);
	});

	it("emitting an event nobody listens for is not an error", () => {
		expect(() => new Emitter().emit("nothing", {})).not.toThrow();
	});
});
