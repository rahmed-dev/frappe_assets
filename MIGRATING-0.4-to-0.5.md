# Migrating from v0.4.0 to v0.5.0

**An existing page needs no edits.** This note is here for the two internals
that were removed and for the three things now worth deleting from a page that
hand-rolled them.

Read [`CHANGELOG.md`](CHANGELOG.md) for what changed and why.

---

## 1. Nothing to do, in the ordinary case

A v0.4.0 dashboard with no `filters` declared behaves exactly as it did:

```js
new Dashboard(page, {
  fetch: (range, {signal}) => frappe.call({method: "myapp.api.summary", args: range}),
  spec: (data, range) => ({ ... }),
});
```

`fetch` and `spec` still receive `{from_date, to_date}`, because with nothing
declared that **is** the whole state. The parameter is worth renaming from
`range` to `state` when you next touch the file, since it will carry filters the
moment you declare one — but nothing breaks if you do not.

## 2. Two controller internals were removed

Both were undocumented and neither is in `CONTRACT.md`. Listed because a page
that reached into the controller anyway will fail loudly rather than quietly:

| Gone | Use instead |
|---|---|
| `dashboard.from_date` / `dashboard.to_date` | `dashboard.controls.from_date` / `.to_date`, or `dashboard.range()` |
| `dashboard.suspended` | nothing — a state patch is atomic, so there is no window to suspend |
| `dashboard.sequence` / `dashboard.pending` | `dashboard.resource.sequence` / `.pending` |

## 3. Three things now worth deleting

### A filter you built by hand

```js
// before — four places per filter, in every app
const company = page.add_field({fieldtype: "Link", options: "Company", ...,
  change: () => dashboard.refresh()});
// …and remember to pass it to fetch, and to the drill, and to the URL

// after
new Dashboard(page, {
  filters: [{fieldname: "company", fieldtype: "Link", options: "Company"}],
  ...
});
```

The control, the change handler, the value reaching `fetch`, the query string and
the drill inheritance all follow from the declaration.

### Your own request bookkeeping

If the page wrapped `fetch` to cache an answer, to abort a previous call, or to
poll on a timer, hand those to the Resource instead:

```js
new Dashboard(page, {
  method: "myapp.api.summary",   // instead of a `fetch` that calls frappe.call
  cache: 30_000,
  poll: 60_000,                  // skips ticks while the tab is hidden
  realtime: "myapp:summary",
});
```

### `{type: "html"}` used for an empty or failed panel

```js
// before
data.rows.length ? {type: "table", ...} : {type: "html", html: "<p>No data</p>"}

// after
{type: "table", state: data.rows.length ? "ready" : "empty", ...}
```

## 4. The one behaviour that changed on screen

**Refresh now defeats the cache.** It had no cache to defeat before, so this only
affects a page that adds `cache`. It is the intended reading of the button: one
that can return the answer already on screen teaches people to press it twice.

## 5. A page file can now be one call

Optional, and the classes remain:

```js
frappe.pages["my-dashboard"].on_page_load = (wrapper) =>
  myapp.dash.dd.page(wrapper, {
    title: __("My Dashboard"),
    filters: [{fieldname: "company", fieldtype: "Link", options: "Company"}],
    method: "myapp.api.summary",
    spec: (data, state) => ({ ... }),
  });
```

`dd.page` is idempotent per wrapper, which fixes a bug most pages have without
knowing: Desk calls `on_page_load` once per route entry, and a second controller
on the same wrapper means two sets of delegated handlers and two fetches per date
change.

## 6. Rolling back

Put the old tag back, `yarn install`, `bench build --app <app>`,
`bench --site <site> clear-cache`. Nothing on the site is migrated and there is
no state to unwind — except the query string, which a v0.4.0 build simply
ignores.
