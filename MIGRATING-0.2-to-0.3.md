# Migrating from v0.2.0 to v0.3.0

Four edits. None of them is subtle, and three of them fail loudly if you miss
them.

**You do not have to do this today.** v0.2.0 is a tag, and a tag is immutable —
an app pinned to `#v0.2.0` with a committed `yarn.lock` keeps resolving the exact
commit it was built against no matter what happens on `main` or `next`. Nothing
in this release can reach a page you do not choose to move.

---

## 1. The SCSS import path

```diff
  // <app>/public/scss/dash.bundle.scss
- @use "~frappe-assets/dashboard/dash.scss";
+ @use "~frappe-assets/ui/styles/dash.scss";
```

Fails loudly: a missing sass import is a build error, not a silent one. That is
why the file was allowed to move at all — a renamed *class* would have been a
different decision entirely, and none of them moved.

## 2. The JS import

```diff
  // <app>/public/js/dash.bundle.js
- export * from "frappe-assets/dashboard";
+ export * from "frappe-assets";
```

`frappe-assets/dashboard` still resolves and still exports the dashboard module,
so this edit is optional. Take it anyway: the barrel is where the host adapter,
the registries and everything added after this release live, and an app on the
narrower entry will keep discovering things it cannot reach.

## 3. `fmt.delta` takes an object

```diff
- delta: fmt.delta(12, "up", "%")
+ delta: { value: 12, good: "up", unit: "%" }
```

The `kpis` item's `delta` key used to hold the **HTML string** `fmt.delta`
returned, which the panel interpolated raw — the one spec value in the whole
renderer that reached the page without passing through `esc`. It now holds the
reading and the panel renders it.

`fmt.delta` itself still exists and still returns the same markup; it just takes
`{value, good, unit}` now. If you call it anywhere other than inside a spec,
update the call the same way.

Fails loudly-ish: passing the old three arguments gives `fmt.delta(12, ...)`,
whose `spec.value` is undefined, so the chip renders as nothing. Grep for
`fmt.delta(` and for `delta:` in your spec builders.

## 4. Outside Desk, install a host

Only if you render specs anywhere without Frappe — a build script, a test, a
node harness:

```js
import { setHost, TestHost } from "frappe-assets";
setHost(new TestHost());
```

Inside Desk nothing changes: `DeskHost` installs itself on first use whenever
`frappe` exists. The five-global stub some harnesses carried can be deleted.

---

## What did *not* move

- **Every CSS class and every `--dd-*` token.** A renamed class fails silently,
  which is the failure `CONTRACT.md` exists to prevent, and no cleanup was worth
  it. There is now a contract test that fails if one goes missing.
- **The spec vocabulary**, apart from `delta` above. Panel type names, keys,
  tone names and drill descriptor shapes are unchanged.
- **`Dashboard`'s options.** `fetch` now receives a second `{signal}` argument;
  ignoring it is fine and is what every existing implementation does.

## After upgrading

1. Edit the tag in the app's `package.json`, `yarn install`, commit the changed
   `yarn.lock`.
2. `bench build --app <app>` and `bench --site <site> clear-cache`. Neither is
   optional when the bundle content moved.
3. Open every dashboard page, **both themes**.
4. If a page draws charts, open two dashboards at once if you can — the palette
   scoping fix is the one change whose old behaviour was invisible.

Rolling back is putting the old tag back and repeating steps 1–2. Nothing on the
site is migrated by the toolkit and there is no state to unwind.
