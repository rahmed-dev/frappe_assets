/**
 * The errors this toolkit throws, each carrying a `code`.
 *
 * A framework that throws bare `Error` objects forces its consumers to match on
 * message text, which then cannot be reworded without breaking them. A `code` is
 * the stable half: the message is for a human reading a console and may be
 * improved at any time, the code is contract.
 *
 * Every one of these is a **programming** error — a panel type that does not
 * exist, a registry name defined twice, a spec key that is not a key. They are
 * thrown loudly and are not meant to be caught in normal operation. The one
 * thing that legitimately fails at runtime on a working page is a fetch, and
 * that is not an error class, it is a state on a `Resource`.
 */

export class DdError extends Error {
	constructor(code, message, detail) {
		super(message);
		this.name = "DdError";
		this.code = code;
		if (detail) {
			this.detail = detail;
		}
	}
}

/**
 * A spec named a panel type nothing has defined.
 *
 * Loud on purpose, and it always has been: a silently skipped panel looks
 * exactly like a backend that returned no data for it, and the wrong half of the
 * stack gets debugged. The known names are listed in the message because the
 * cause is almost always a typo, and the answer is then on screen.
 */
export class UnknownPanelError extends DdError {
	constructor(type, known) {
		super(
			"unknown_panel",
			`dd: unknown panel type "${type}". Defined: ${known.join(", ")}`,
			{ type, known },
		);
		this.name = "UnknownPanelError";
	}
}

/**
 * Two things claimed the same name in a registry.
 *
 * Thrown rather than last-one-wins. Silent overwrite is how an app that defines
 * a `table` panel of its own shadows the built-in for every other page in the
 * same Desk session, and the symptom appears somewhere the definition is not.
 * A consumer who genuinely means to replace one says so with `redefine()`.
 */
export class DuplicateDefinitionError extends DdError {
	constructor(kind, name) {
		super(
			"duplicate_definition",
			`dd: ${kind} "${name}" is already defined. Use redefine() to replace it deliberately.`,
			{ kind, name },
		);
		this.name = "DuplicateDefinitionError";
	}
}

/** Something asked a registry for a name nothing defined. */
export class UnknownDefinitionError extends DdError {
	constructor(kind, name, known) {
		super(
			"unknown_definition",
			`dd: no ${kind} named "${name}". Defined: ${known.join(", ")}`,
			{ kind, name, known },
		);
		this.name = "UnknownDefinitionError";
	}
}

/**
 * A spec declared a chart and no charting engine is loaded.
 *
 * Since v0.4.0 the ECharts adapter is its own entry point rather than part of
 * the barrel, so a dashboard that draws no charts does not carry ~550 KB of
 * charting engine it never calls. The cost of that is exactly this error, and
 * the message therefore has to be the fix: the one import line that resolves it.
 */
export class NoChartEngineError extends DdError {
	constructor(known) {
		super(
			"no_chart_engine",
			known.length
				? `dd: no chart engine selected. Registered: ${known.join(", ")}. Call use_engine(name).`
				: 'dd: a spec declares a chart and no engine is loaded. Add `import "frappe-assets/charts/echarts";` to your bundle.',
			{ known },
		);
		this.name = "NoChartEngineError";
	}
}

/**
 * The host adapter was needed before one was installed.
 *
 * Only reachable outside Desk — `DeskHost` installs itself the moment `frappe`
 * exists — so the message is written for the case that actually produces it: a
 * test, a build script or a gallery that imported a module and called it without
 * setting a host first.
 */
export class NoHostError extends DdError {
	constructor(what) {
		super(
			"no_host",
			`dd: ${what} needs a host adapter and none is installed. Call setHost(new TestHost()) outside Desk.`,
			{ what },
		);
		this.name = "NoHostError";
	}
}
