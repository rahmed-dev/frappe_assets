/**
 * @vitest-environment happy-dom
 *
 * The controller's stateful half — the part `render()` deliberately has none of.
 * These are the behaviours that cannot be seen in the gallery, because the
 * gallery renders once and never fetches.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Dashboard } from "../../dashboard/controller.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";
import { panels } from "../../core/spec.js";

/** The two properties of a Frappe page object this controller actually touches. */
function fake_page() {
	const main = document.createElement("div");
	const wrapper = document.createElement("div");
	wrapper.appendChild(main);
	document.body.appendChild(wrapper);
	return {
		main,
		wrapper,
		add_field: () => ({ get_value: () => null, set_value: () => Promise.resolve() }),
		set_primary_action: () => {},
	};
}

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
	document.body.innerHTML = "";
	resetHost();
	setHost(new TestHost());
});

describe("the sequence guard", () => {
	it("lets only the newest request write to the page", async () => {
		// The bug: responses land in the order the network returns them, not the
		// order they were asked for. Clicking 7d → 30d → 90d on a page whose
		// queries take unequal time could finish showing the 7d numbers under a lit
		// 90d chip, with nothing on screen saying so.
		const first = deferred();
		const second = deferred();
		const queue = [first, second];

		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => queue.shift().promise,
			spec: (data) => ({ title: "T", blocks: [{ type: "text", text: data }] }),
		});

		const settled = dash.refresh(); // the second request

		second.resolve("newest");
		await settled;
		first.resolve("stale"); // the first request answers late
		await first.promise;
		await Promise.resolve();

		expect(dash.body.textContent).toContain("newest");
		expect(dash.body.textContent).not.toContain("stale");
	});

	it("does not paint an error from a request that has been superseded", async () => {
		// A slow request that fails after a fast one succeeded must not replace a
		// correct page with "Could not load this dashboard".
		const first = deferred();
		const second = deferred();
		const queue = [first, second];

		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => queue.shift().promise,
			spec: (data) => ({ title: "T", blocks: [{ type: "text", text: data }] }),
		});

		const settled = dash.refresh();
		second.resolve("newest");
		await settled;

		first.reject(new Error("timed out"));
		await first.promise.catch(() => {});
		await Promise.resolve();

		expect(dash.body.textContent).toContain("newest");
		expect(dash.body.querySelector(".dd-error")).toBeNull();
	});
});

describe("failure", () => {
	it("says so on the page rather than leaving stale numbers looking current", async () => {
		// Frappe shows its own dialog for a server exception, but a network drop
		// leaves the last render on screen looking current — the worst of the three
		// outcomes, because nothing tells the reader the numbers are stale.
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.reject(new Error("network down")),
			spec: () => ({ title: "T", blocks: [] }),
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(dash.body.querySelector(".dd-error")).not.toBeNull();
		expect(dash.body.textContent).toContain("network down");
	});
});

describe("the entrance animation", () => {
	it("runs on the first paint only", async () => {
		// Animating every refresh would be worse than animating none: a date change
		// would read as a page load, and the slower the backend the more the
		// animation would look like the delay.
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.resolve("x"),
			spec: () => ({ title: "T", blocks: [] }),
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(dash.body.classList.contains("dd-enter")).toBe(true);

		await dash.refresh();
		expect(dash.body.classList.contains("dd-enter")).toBe(false);
	});
});

describe("the page wrapper", () => {
	it("carries the measure class and the version stamp", async () => {
		// "Which toolkit is live on this site" has to be answerable by inspecting
		// the element, because a site builds this from whatever was in node_modules
		// and records the version nowhere.
		const page = fake_page();
		new Dashboard(page, {
			dated: false,
			fetch: () => Promise.resolve("x"),
			spec: () => ({ title: "T", blocks: [] }),
		});
		expect(page.wrapper.classList.contains("dd-host")).toBe(true);
		expect(page.wrapper.getAttribute("data-dd-version")).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

describe("destroy", () => {
	it("releases the body and the document handlers", async () => {
		const page = fake_page();
		const dash = new Dashboard(page, {
			dated: false,
			fetch: () => Promise.resolve("x"),
			spec: () => ({ title: "T", blocks: [] }),
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		dash.destroy();
		expect(page.main.querySelector(".dd-page")).toBeNull();
	});

	it("stops a request that outlives the page from drawing into it", async () => {
		const late = deferred();
		const spec = vi.fn(() => ({ title: "T", blocks: [] }));
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => late.promise,
			spec,
		});

		dash.destroy();
		late.resolve("x");
		await late.promise;
		await Promise.resolve();

		expect(spec).not.toHaveBeenCalled();
	});
});

describe("the mount phase", () => {
	const added = [];

	const define = (name, panel) => {
		panels.define(name, panel);
		added.push(name);
	};

	afterEach(() => {
		for (const name of added.splice(0)) {
			panels.entries.delete(name);
		}
	});

	/** A dashboard that draws one instance of `type` and resolves once painted. */
	async function draw(type, options = {}) {
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.resolve("x"),
			spec: () => ({ title: "T", blocks: [{ type }] }),
			...options,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		return dash;
	}

	it("gives a panel its element after the markup is on the page", async () => {
		// Deferred a frame because anything that measures its container — every
		// chart there is — sizes to 0px and draws nothing when built in the same
		// tick as the markup. Silently, which is what makes it worth a test.
		let element = null;
		define("live", {
			render: (node, pass) => `<div class="live" data-dd-mount="${pass.defer("live", node)}"></div>`,
			mount: (el) => {
				element = el;
			},
		});

		const dash = await draw("live");
		expect(element).not.toBeNull();
		expect(element.isConnected).toBe(true);
		expect(dash.body.contains(element)).toBe(true);
	});

	it("runs a panel's teardown before the next draw replaces its element", async () => {
		// The ordering is the whole point. An observer released after its element
		// is detached has already kept that element, its canvas and whatever the
		// option closed over alive for the rest of the Desk session.
		const order = [];
		define("live", {
			render: (node, pass) => `<div data-dd-mount="${pass.defer("live", node)}"></div>`,
			mount: (el) => {
				order.push("mount");
				return () => order.push(el.isConnected ? "release-attached" : "release-detached");
			},
		});

		const dash = await draw("live");
		await dash.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(order).toEqual(["mount", "release-attached", "mount"]);
	});

	it("releases every mounted panel on destroy", async () => {
		const released = vi.fn();
		define("live", {
			render: (node, pass) => `<div data-dd-mount="${pass.defer("live", node)}"></div>`,
			mount: () => released,
		});

		const dash = await draw("live");
		dash.destroy();
		expect(released).toHaveBeenCalledTimes(1);
	});

	it("lets one panel fail to mount without blanking the other eleven", async () => {
		// A chart panel with no engine loaded is the common case. A dashboard with
		// a gap in it is a better page than a dashboard that is one error message.
		define("broken", {
			render: (node, pass) => `<div data-dd-mount="${pass.defer("broken", node)}"></div>`,
			mount: () => {
				throw new Error("no engine");
			},
		});

		const errors = [];
		const dash = await draw("broken", { on: { error: (payload) => errors.push(payload) } });

		expect(errors).toHaveLength(1);
		expect(errors[0].panel).toBe("broken");
		expect(dash.body.querySelector(".dd-header")).not.toBeNull();
	});

	it("does not mount into a body a later render already replaced", async () => {
		// A preset clicked twice quickly does exactly this: two renders, and the
		// first render's paint callback arriving after the second render's markup.
		// Mounting then draws into detached elements and leaks every one of them.
		let mounts = 0;
		define("live", {
			render: (node, pass) => `<div data-dd-mount="${pass.defer("live", node)}"></div>`,
			mount: () => {
				mounts += 1;
			},
		});

		const dash = await draw("live");
		expect(mounts).toBe(1);

		dash.release_mounts(); // what a redraw does before writing new markup
		dash.run_mounts([]); // …and an empty queue draws nothing
		expect(mounts).toBe(1);
	});
});

describe("the lifecycle events", () => {
	it("fires in the order a consumer would assume", async () => {
		const seen = [];
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.resolve({ n: 1 }),
			spec: () => ({ title: "T", blocks: [] }),
			on: {
				before_fetch: () => seen.push("before_fetch"),
				after_fetch: () => seen.push("after_fetch"),
				before_render: () => seen.push("before_render"),
				after_render: () => seen.push("after_render"),
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(seen).toEqual(["before_fetch", "after_fetch", "before_render", "after_render"]);
		dash.destroy();
	});

	it("carries the data and the spec, so a consumer need not wrap fetch to see them", async () => {
		let fetched;
		let rendered;
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.resolve({ n: 7 }),
			spec: () => ({ title: "Titled", blocks: [] }),
			on: {
				after_fetch: (payload) => (fetched = payload),
				after_render: (payload) => (rendered = payload),
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fetched.data).toEqual({ n: 7 });
		expect(rendered.spec.title).toBe("Titled");
		expect(rendered.body.querySelector("h2").textContent).toBe("Titled");
		dash.destroy();
	});

	it("reports a failed fetch to `error` as well as to the page", async () => {
		const seen = [];
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.reject(new Error("gone")),
			spec: () => ({ title: "T", blocks: [] }),
			on: { error: (payload) => seen.push(payload.error.message) },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(seen).toEqual(["gone"]);
		expect(dash.body.querySelector(".dd-error")).not.toBeNull();
		dash.destroy();
	});

	it("dashboard.on returns its own unbinder", async () => {
		const seen = [];
		const dash = new Dashboard(fake_page(), {
			dated: false,
			fetch: () => Promise.resolve(1),
			spec: () => ({ title: "T", blocks: [] }),
		});
		const off = dash.on("after_render", () => seen.push(1));
		await dash.refresh();
		off();
		await dash.refresh();

		expect(seen).toHaveLength(1);
		dash.destroy();
	});
});

describe("declared filters", () => {
	/** A page whose `add_field` remembers, because the range logic reads it back. */
	function recording_page() {
		const page = fake_page();
		page.fields = [];
		page.add_field = (spec) => {
			let value = spec.default;
			const control = {
				df: spec,
				get_value: () => value,
				set_value: (next) => {
					value = next;
					spec.change?.();
					return Promise.resolve(next);
				},
			};
			page.fields.push(control);
			return control;
		};
		return page;
	}

	it("become controls, and their values reach `fetch`", async () => {
		const asked = [];
		const dash = new Dashboard(recording_page(), {
			dated: false,
			filters: [{ fieldname: "company", fieldtype: "Link", options: "Company" }],
			fetch: (params) => {
				asked.push(params);
				return Promise.resolve("x");
			},
			spec: () => ({ title: "T", blocks: [] }),
		});
		await Promise.resolve();

		expect(dash.controls.company.df.options).toBe("Company");
		dash.state.set({ company: "Acme" });
		await Promise.resolve();
		await Promise.resolve();

		expect(asked).toEqual([{}, { company: "Acme" }]);
		expect(dash.controls.company.get_value()).toBe("Acme");
	});

	it("fetch once for a preset that moves two dates", async () => {
		// The bug this replaces: a control's `set_value` fires its own `change`, so
		// setting the pair unguarded fetched twice and rendered the first answer
		// against the second window. The controller used to carry a `suspended` flag
		// for it; making the patch the unit of change removes the need.
		let calls = 0;
		const dash = new Dashboard(recording_page(), {
			fetch: () => {
				calls += 1;
				return Promise.resolve("x");
			},
			spec: () => ({ title: "T", blocks: [] }),
		});
		await Promise.resolve();
		expect(calls).toBe(1);

		dash.apply_range(7);
		await Promise.resolve();
		await Promise.resolve();
		expect(calls).toBe(2);
		expect(dash.range().from_date).toBe(dash.controls.from_date.get_value());
	});

	it("are handed to a drill that asked to inherit them", () => {
		const dash = new Dashboard(recording_page(), {
			dated: false,
			filters: [{ fieldname: "company" }],
			fetch: () => Promise.resolve("x"),
			spec: () => ({ title: "T", blocks: [] }),
		});
		dash.state.set({ company: "Acme" });
		expect(dash.drill_context().filters).toEqual({ company: "Acme" });
	});
});
