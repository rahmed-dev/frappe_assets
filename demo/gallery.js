/**
 * The toolkit gallery: every primitive and every chart type, on one page.
 *
 * WHY THIS EXISTS
 * "What does this thing look like?" was answerable only by building a dashboard
 * and deploying it. That is a slow way to find out that a funnel chart is not
 * what you wanted. It also means the chart types nobody has used yet are
 * unproven — the `chart` panel shipped with no consumer at all and stayed that
 * way until this page.
 *
 * It runs the REAL renderer and the REAL chart layer, not a copy. If a panel
 * draws here it draws on a Desk page, and when it stops drawing here it has
 * stopped drawing there too. That is the only property that makes a gallery
 * worth maintaining, and it is why the frappe stubs next door stay as thin as
 * they are.
 *
 * The mount loop below is a deliberate near-duplicate of
 * `controller.js#run_mounts`. The controller cannot be reused: it wants a
 * Frappe page object with `add_field` and `set_primary_action`, and stubbing
 * those would be stubbing more of Desk than this page is worth.
 */

import "./frappe-stub.js";

// The charting engine is its own entry point since v0.4.0, so this bare import
// is exactly what a consuming app writes in its own bundle file. The gallery
// draws charts, so the gallery pays for the engine; a dashboard of KPIs and a
// table does not.
import "../charts/echarts.js";

import { render, panels } from "../index.js";
import { colour, markers, bounds } from "../index.js";
import { fmt } from "../index.js";

const { blank } = fmt;

/* ─────────────────────────────────────────────────────────── sample data ── */

/**
 * A deterministic pseudo-random walk.
 *
 * Seeded rather than `Math.random` so the gallery draws the same shapes on every
 * reload: comparing two screenshots is how a theme or spacing regression gets
 * noticed, and that only works if the data holds still.
 */
function walk(seed, count, base, spread) {
	let state = seed;
	const out = [];
	for (let i = 0; i < count; i++) {
		state = (state * 1103515245 + 12345) % 2147483648;
		out.push(Math.round(base + ((state / 2147483648) * 2 - 1) * spread));
	}
	return out;
}

const DAYS = Array.from({ length: 30 }, (_, i) => `Jun ${i + 1}`);
const OPENED = walk(7, 30, 62, 18);
const RESOLVED = walk(21, 30, 58, 16);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"];

/* A measurement with a rule attached, for the panels where a value is graded:
   response time per node, against the two limits it is judged by. */
const NODES = ["edge-01", "edge-02", "edge-03", "edge-04", "edge-05", "edge-06", "edge-07"];
const LATENCY = [42, 61, 88, 104, 152, 210, 73];
// The nodes that also relay for their neighbours — a category, not a verdict,
// which is what a row tone and a tag are for.
const RELAYS = ["edge-02", "edge-05"];
const LIMITS = [
	{ value: 100, tone: "warning", label: "target" },
	{ value: 200, tone: "danger", label: "breach" },
];
const grade = (ms) => (ms >= 200 ? "danger" : ms >= 100 ? "warning" : "success");
/* The word for each tone. A pill says the state, the tone colours it — the two
   have to agree, and reading them off one grade is how they stay agreeing. */
const STATE = { success: "Healthy", warning: "Slow", danger: "Breached" };

/* ────────────────────────────────────────────────────────── chart options ── */

/**
 * Every option here is a plain ECharts option — that is the whole contract.
 * The toolkit merges its own axes, tooltip, type scale and colour ramp
 * underneath, so nothing below sets a font, a gridline or a palette.
 *
 * The ones written as `(colours) => ...` need a token value at build time. That
 * form exists so a semantic colour still follows the theme: a hard-coded green
 * is the wrong green in dark mode, and a canvas cannot read `var(--dd-success)`.
 */
const CHARTS = {
	area: {
		xAxis: { type: "category", data: DAYS, boundaryGap: false },
		yAxis: { type: "value" },
		// A filled area at full strength reads as a solid block and buries its own
		// line. The fill is there to weight the shape, not to be the shape.
		series: [
			{
				type: "line",
				data: OPENED,
				smooth: true,
				showSymbol: false,
				areaStyle: { opacity: 0.12 },
			},
		],
	},

	multi_line: {
		xAxis: { type: "category", data: DAYS, boundaryGap: false },
		yAxis: { type: "value" },
		legend: { data: ["Opened", "Resolved"], bottom: 0 },
		grid: { bottom: 28 },
		// Two lines on a monochrome ramp are two greys, and on a busy series they
		// cross often enough to be one line. Dash the second: shape separates them
		// where hue no longer can, and it survives being printed or colour-blind.
		series: [
			{ name: "Opened", type: "line", data: OPENED, smooth: true, showSymbol: false },
			{
				name: "Resolved",
				type: "line",
				data: RESOLVED,
				smooth: true,
				showSymbol: false,
				lineStyle: { type: "dashed" },
			},
		],
	},

	bars: {
		xAxis: { type: "category", data: ["Billing", "Outage", "Setup", "Hardware", "Other"] },
		yAxis: { type: "value" },
		series: [{ type: "bar", data: [412, 287, 196, 143, 88], barMaxWidth: 34 }],
	},

	// The sanctioned exception to the monochrome ramp: each bar's colour IS its
	// verdict, so it comes from the tone map rather than from series position.
	// `markers` draws the thresholds those verdicts were read against, and
	// `bounds` is what keeps the higher of them on the axis — a threshold drawn
	// off the top of the chart is a rule the reader is being judged by and cannot
	// see.
	graded: (colours) => ({
		xAxis: { type: "category", data: NODES },
		// Zero is in `include` because these are BARS: their length is the reading,
		// and an axis that starts at 25 makes 42 ms look like a fifth of 104 ms.
		// A line chart is the opposite case and should stay fitted.
		yAxis: {
			type: "value",
			...bounds(LATENCY, { include: [0, ...LIMITS.map((l) => l.value)], pad: [0, 0.1] }),
		},
		series: [
			{
				type: "bar",
				barMaxWidth: 34,
				data: LATENCY.map((value) => ({
					value,
					itemStyle: { color: colour(colours, grade(value)) },
				})),
				markLine: markers(LIMITS, colours),
			},
		],
	}),

	// Horizontal is a category y-axis, not a chart type. Worth showing, because
	// frappe-charts has no horizontal bar at all and that gap is what sent this
	// toolkit to ECharts in the first place.
	horizontal_bars: {
		xAxis: { type: "value" },
		yAxis: { type: "category", data: ["Priya", "Sam", "Alex", "Jordan", "Mika"] },
		series: [{ type: "bar", data: [64, 71, 88, 96, 124], barMaxWidth: 18 }],
	},

	stacked_bars: {
		xAxis: { type: "category", data: ["W22", "W23", "W24", "W25", "W26", "W27"] },
		yAxis: { type: "value" },
		legend: { bottom: 0 },
		grid: { bottom: 28 },
		series: ["Email", "Chat", "Phone"].map((name, i) => ({
			name,
			type: "bar",
			stack: "channel",
			barMaxWidth: 32,
			data: walk(3 + i * 5, 6, 40 - i * 8, 12),
		})),
	},

	scatter: {
		xAxis: { type: "value", name: "First reply (min)" },
		yAxis: { type: "value", name: "CSAT", min: 1, max: 5 },
		tooltip: { trigger: "item" },
		series: [
			{
				type: "scatter",
				symbolSize: 9,
				data: walk(11, 40, 45, 40).map((minutes, i) => [
					Math.max(2, minutes),
					Math.min(5, Math.max(1, 5 - minutes / 40 + (i % 5) * 0.12)),
				]),
			},
		],
	},

	heatmap: (colours) => ({
		xAxis: { type: "category", data: HOURS, splitArea: { show: true } },
		yAxis: { type: "category", data: WEEKDAYS, splitArea: { show: true } },
		tooltip: { trigger: "item" },
		grid: { top: 10, bottom: 44 },
		visualMap: {
			min: 0,
			max: 40,
			orient: "horizontal",
			left: "center",
			bottom: 0,
			itemHeight: 60,
			textStyle: { color: colours.muted },
			inRange: { color: [colours.surface, colours.accent] },
		},
		series: [
			{
				type: "heatmap",
				data: WEEKDAYS.flatMap((_, y) =>
					walk(31 + y, HOURS.length, 18, 16).map((value, x) => [x, y, Math.max(0, value)]),
				),
			},
		],
	}),

	donut: {
		legend: { bottom: 0 },
		series: [
			{
				type: "pie",
				radius: ["48%", "72%"],
				center: ["50%", "44%"],
				itemStyle: { borderWidth: 2 },
				label: { show: false },
				data: [
					{ name: "Fibre 1G", value: 486 },
					{ name: "Fibre 500", value: 372 },
					{ name: "Cable 200", value: 241 },
					{ name: "Cable 100", value: 118 },
				],
			},
		],
	},

	funnel: (colours) => ({
		series: [
			{
				type: "funnel",
				left: "4%",
				right: "34%",
				top: 8,
				bottom: 8,
				gap: 2,
				// Outside, not inside. The ramp runs dark to light down the funnel, so
				// one label colour cannot sit on all five segments — light text
				// disappears on the last band and dark text on the first.
				label: { position: "right", color: colours.ink },
				data: [
					{ name: "Visits", value: 4820 },
					{ name: "Availability", value: 3140 },
					{ name: "Plan chosen", value: 1690 },
					{ name: "Signed up", value: 742 },
					{ name: "Ordered", value: 508 },
				],
			},
		],
	}),

	treemap: (colours) => ({
		series: [
			{
				type: "treemap",
				roam: false,
				breadcrumb: { show: false },
				itemStyle: { borderWidth: 2, gapWidth: 2 },
				// A treemap writes its label ON the tile, so the tiles have to stay
				// dark enough for one label colour to work across all of them. The
				// pale end of the ramp is dropped for that reason alone.
				label: { color: colours.surface },
				levels: [{ color: colours.series.slice(0, 3) }],
				data: [
					{ name: "Québec", value: 1840 },
					{ name: "Ontario", value: 1420 },
					{ name: "Alberta", value: 610 },
					{ name: "B.C.", value: 540 },
					{ name: "Manitoba", value: 210 },
					{ name: "Other", value: 130 },
				],
			},
		],
	}),

	sunburst: {
		series: [
			{
				type: "sunburst",
				radius: [16, "88%"],
				label: { minAngle: 18 },
				data: [
					{
						name: "Billing",
						children: [
							{ name: "Refund", value: 142 },
							{ name: "Dispute", value: 96 },
							{ name: "Method", value: 74 },
						],
					},
					{
						name: "Service",
						children: [
							{ name: "Outage", value: 188 },
							{ name: "Speed", value: 121 },
						],
					},
					{
						name: "Account",
						children: [
							{ name: "Move", value: 63 },
							{ name: "Cancel", value: 44 },
						],
					},
				],
			},
		],
	},

	sankey: (colours) => ({
		tooltip: { trigger: "item" },
		series: [
			{
				type: "sankey",
				left: 4,
				right: 96,
				top: 10,
				bottom: 10,
				emphasis: { focus: "adjacency" },
				// One colour for every node, not the ramp. A sankey's nodes are stages
				// of the same thing, so colouring them apart implies a distinction that
				// is not there — the ribbons already carry the whole message.
				itemStyle: { color: colours.series[1], borderColor: "transparent" },
				label: { color: colours.ink },
				lineStyle: { color: "source", opacity: 0.3 },
				data: [
					{ name: "Visits" },
					{ name: "Availability" },
					{ name: "Plan chosen" },
					{ name: "Signed up" },
					{ name: "Ordered" },
					{ name: "Left" },
				],
				links: [
					{ source: "Visits", target: "Availability", value: 3140 },
					{ source: "Visits", target: "Left", value: 1680 },
					{ source: "Availability", target: "Plan chosen", value: 1690 },
					{ source: "Availability", target: "Left", value: 1450 },
					{ source: "Plan chosen", target: "Signed up", value: 742 },
					{ source: "Plan chosen", target: "Left", value: 948 },
					{ source: "Signed up", target: "Ordered", value: 508 },
					{ source: "Signed up", target: "Left", value: 234 },
				],
			},
		],
	}),

	gauge: (colours) => ({
		series: [
			{
				type: "gauge",
				startAngle: 200,
				endAngle: -20,
				min: 0,
				max: 100,
				radius: "94%",
				center: ["50%", "62%"],
				progress: { show: true, width: 12, itemStyle: { color: colours.success } },
				axisLine: { lineStyle: { width: 12, color: [[1, colours.line]] } },
				axisTick: { show: false },
				splitLine: { show: false },
				axisLabel: { show: false },
				pointer: { show: false },
				detail: { offsetCenter: [0, 0], fontSize: 26, color: colours.ink, formatter: "{value}%" },
				data: [{ value: 94 }],
			},
		],
	}),

	radar: {
		tooltip: { trigger: "item" },
		legend: { bottom: 0 },
		radar: {
			radius: "62%",
			center: ["50%", "44%"],
			indicator: [
				{ name: "Speed", max: 100 },
				{ name: "Quality", max: 100 },
				{ name: "Volume", max: 100 },
				{ name: "CSAT", max: 100 },
				{ name: "Backlog", max: 100 },
			],
		},
		series: [
			{
				type: "radar",
				areaStyle: { opacity: 0.15 },
				data: [
					{ name: "This month", value: [82, 91, 74, 88, 63] },
					{ name: "Last month", value: [71, 86, 81, 79, 72] },
				],
			},
		],
	},
};

/* ──────────────────────────────────────────────────────────────── the spec ── */

/** A chart in a titled card — the shape every gallery entry takes. */
const showcase = (title, hint, key, height) => ({
	type: "card",
	title,
	hint,
	body: { type: "chart", option: CHARTS[key], height: height || 260 },
});

/* ───────────────────────────────────────────────────── a panel of our own ── */

/**
 * What a consuming app writes to add a panel type, drawn on this page so the
 * extension point is exercised rather than only described.
 *
 * Both halves are here: `render` is pure and returns a string, `mount` is handed
 * the element once it is on the page and returns its own teardown. Before v0.4.0
 * neither existed for anything but a chart, and a panel that needed to *do*
 * something had to be `{type: "html"}` — the escape hatch that is documented as
 * unescaped and has already put values scraped off a supplier's portal into
 * hand-escaped strings.
 *
 * Note `fmt.esc` on the label. A panel written outside this repo is held to the
 * same rule as one written inside it, and nothing enforces that for you.
 */
panels.define("counter", {
	render(node, pass) {
		return `
			<div class="dd-field" data-dd-mount="${pass.defer("counter", node)}">
				<div class="dd-field-label">${fmt.esc(node.label)}</div>
				<div class="dd-field-value" data-count>0</div>
			</div>`;
	},
	mount(el, node) {
		const output = el.querySelector("[data-count]");
		let n = 0;
		const tick = () => {
			n += 1;
			output.textContent = String(n);
		};
		el.addEventListener("click", tick);
		// The teardown. The controller runs it before the next draw replaces this
		// element, which is what stops a live panel leaking across a refresh.
		return () => el.removeEventListener("click", tick);
	},
});

const SPEC = {
	title: "Dashboard toolkit — gallery",
	meta: ["Sample data", "Every panel and chart type the toolkit can draw"],
	caveat:
		"Nothing here is real. The numbers are a seeded random walk so the page draws identically on every reload.",

	// Each entry is a [title, body] pair, not an object.
	explain: {
		bars: [
			"Proportion bars",
			"Hover any row for the counts behind the split. The segments grow on load, and grow again whenever the data changes.",
		],
	},

	blocks: [
		{ type: "section", title: "Renderer primitives" },
		{
			type: "kpis",
			columns: 4,
			items: [
				{ label: "Open tickets", value: "1,126", sub: "across all queues" },
				{ label: "First reply", value: "42m", sub: "median this month", dot: "success" },
				{ label: "Breached SLA", value: "18", sub: "6% of resolved", dot: "danger" },
				{ label: "CSAT", value: "4.4", sub: "from 318 responses" },
			],
		},
		{
			type: "split",
			columns: [
				{
					type: "card",
					title: "Where visits are lost",
					hint: "each stage against the one above",
					explain: "bars",
					body: {
						type: "bars",
						legend: ["Continued to next stage", "Stopped here"],
						scale: 4820,
						items: [
							{ label: "Visits", count: 4820, kept: 3140, lost: 1680 },
							{ label: "Checked availability", count: 3140, kept: 1690, lost: 1450, rate: "65% of visits" },
							{ label: "Selected a plan", count: 1690, kept: 742, lost: 948, rate: "54% of checks" },
							{ label: "Completed signup", count: 742, kept: 508, lost: 234, rate: "44% of plan picks" },
							{ label: "Order created", count: 508, kept: 508, lost: 0, rate: "68% of signups" },
						],
					},
				},
				{
					type: "card",
					title: "Stability",
					body: {
						type: "rows",
						items: [
							{
								name: "Card setup failed",
								why: "Gateway declined 3-D Secure on retry.",
								count: 24,
								rate: "2% of signups",
								series: walk(2, 12, 6, 5).map((v) => Math.max(0, v)),
							},
							{
								name: "Availability check failed",
								why: "No failure in this range.",
								count: 0,
								series: [],
							},
							{
								name: "Order submission failed",
								why: "Timeouts against the provisioning API.",
								count: 9,
								rate: "1% of signups",
								series: walk(6, 12, 4, 4).map((v) => Math.max(0, v)),
							},
						],
					},
				},
			],
		},

		{
			type: "card",
			title: "A panel this repo does not define",
			hint: "registered by the gallery with panels.define — click it",
			body: {
				type: "grid",
				columns: 3,
				blocks: [
					{ type: "counter", label: "Clicks on this card" },
					{ type: "counter", label: "And on this one" },
					{
						type: "text",
						text: "Both are the same panel type, mounted separately, each with its own teardown.",
					},
				],
			},
		},

		{
			type: "card",
			title: "A panel with no numbers yet",
			hint: "any panel takes `state`, and the panel itself never sees the node",
			body: {
				type: "grid",
				columns: 3,
				blocks: [
					{ type: "kpis", state: "loading", label: "Loading", items: [] },
					{ type: "kpis", state: "empty", label: "Empty", items: [] },
					{
						type: "kpis",
						state: "error",
						label: "Error",
						message: "Timed out after 30s.",
						items: [],
					},
				],
			},
		},

		{ type: "section", title: "Fields and tables" },
		{
			type: "split",
			columns: [
				{
					type: "card",
					title: "Node edge-06",
					hint: "what the record says about itself",
					body: [
						{
							type: "fields",
							columns: 3,
							items: [
								{ label: "Region", value: "eu-west" },
								{ label: "Uplink", value: "1 Gbps" },
								{ label: "Firmware", value: "4.2.1" },
								{ label: "Last seen", value: "2 min ago" },
								{ label: "Response", value: "210 ms", tone: "danger" },
								{ label: "Serial", value: blank(null) },
							],
						},
						{
							type: "text",
							text: "An unanswered field prints an em dash, never a zero — see fmt.blank.",
							style: "caveat",
						},
					],
				},
				{
					type: "card",
					title: "Nodes",
					hint: "a tone on the cell that carries the finding, a tint on the rows that are a set",
					body: {
						type: "table",
						columns: [
							{ label: "Node", key: "node" },
							{ label: "Response", key: "response", numeric: true },
							{ label: "State", key: "state", align: "center" },
						],
						rows: NODES.map((node, i) => ({
							// A row tone is a fact about the RECORD — these two also relay
							// for their neighbours — and never a louder copy of the cell
							// verdict beside it: edge-06 is breached and unremarkable, and
							// the two tinted rows are fine.
							tone: RELAYS.includes(node) ? "info" : undefined,
							// A tag says what the value also is. The cell is still the node.
							node: { value: node, tag: RELAYS.includes(node) ? "RELAY" : undefined },
							// A tone tints the reading; a pill is for a cell holding a
							// state rather than a measurement. All of it keeps its escaping.
							response: { value: `${LATENCY[i]} ms`, tone: grade(LATENCY[i]) },
							state: { value: STATE[grade(LATENCY[i])], tone: grade(LATENCY[i]), pill: true },
						})),
					},
				},
			],
		},

		{ type: "section", title: "Cartesian" },
		{
			type: "grid",
			columns: 2,
			blocks: [
				showcase("Line", "with an area fill", "area"),
				showcase("Line — two series", "a legend below the plot", "multi_line"),
				showcase("Bar", "categories on the x-axis", "bars"),
				showcase("Bar — horizontal", "a category y-axis, not a chart type", "horizontal_bars"),
				showcase("Bar — stacked", "one stack id per series", "stacked_bars"),
				showcase("Bar — graded", "colour is the verdict, dashed lines the rule", "graded"),
				showcase("Scatter", "two measures against each other", "scatter"),
			],
		},
		showcase("Heatmap", "two categories and an intensity", "heatmap", 300),

		{ type: "section", title: "Part to whole" },
		{
			type: "grid",
			columns: 2,
			blocks: [
				showcase("Donut", "a pie with a hole is easier to read", "donut"),
				showcase("Funnel", "stages that only shrink", "funnel"),
				showcase("Treemap", "area is the value", "treemap"),
				showcase("Sunburst", "a treemap with a hierarchy", "sunburst"),
			],
		},

		{ type: "section", title: "Flow, progress and profile" },
		showcase("Sankey", "where the volume actually goes", "sankey", 320),
		{
			type: "grid",
			columns: 2,
			blocks: [
				showcase("Gauge", "one number against a target", "gauge"),
				showcase("Radar", "several measures on one shape", "radar"),
			],
		},
	],

	footer: [
		{ label: "dashboard/README.md", href: "../dashboard/README.md" },
		{ label: "ui/styles/dash.scss", href: "../ui/styles/dash.scss" },
	],
};

/* ────────────────────────────────────────────────────────────────── mount ── */

// `?theme=dark` opens straight into the dark palette. Applied here, before the
// first render, because the chart layer resolves its colours at mount — flipping
// the attribute afterwards works too, but only because a MutationObserver
// rebuilds every canvas, and a screenshot taken between the two is neither.
if (new URLSearchParams(location.search).get("theme") === "dark") {
	document.documentElement.setAttribute("data-theme", "dark");
}

const body = document.querySelector(".dd-page");

// What the controller does before its first draw, and only its first draw.
body.classList.add("dd-enter");

// Since v0.3.0 `render` takes a plain element. It used to write through
// jQuery's `.html()`, and the gallery handed it a one-method shim rather than
// pull in jQuery for a single call.
const pass = render(body, SPEC);

// Mirrors `controller.js#run_mounts`, including the deferral: ECharts measures
// its container at init, and the markup above was written this same tick, so a
// chart built synchronously sizes to 0px and draws nothing at all — silently,
// which is what makes it worth repeating here.
//
// Since v0.4.0 this loop knows nothing about charts. Each mount slot records
// which panel claimed it, and the panel mounts itself — which is the same code
// path a consuming app's own panel takes, so the gallery exercises the
// extension point rather than a special case beside it.
requestAnimationFrame(() => {
	const context = { range: () => ({}), follow: () => {} };
	body.querySelectorAll("[data-dd-mount]").forEach((el) => {
		const entry = pass.mounts[Number(el.getAttribute("data-dd-mount"))];
		const panel = entry && panels.find(entry.panel);
		panel?.mount?.(el, entry.data, context);
	});
});

/* ─────────────────────────────────────────────────────────── theme toggle ── */

// Stamps the same attribute Desk's own theme switcher stamps, so this button
// exercises the real path: the stylesheet's dark block keys off `data-theme` on
// <html>, and the chart layer's MutationObserver watches that same attribute to
// rebuild every live canvas. Nothing here is gallery-only.
document.querySelector("#theme").addEventListener("click", () => {
	const root = document.documentElement;
	root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
