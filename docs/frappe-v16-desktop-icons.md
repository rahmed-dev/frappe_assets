# Desktop Icons in Frappe v16 — A Practical Guide

This guide explains how the **Desktop Icon** system works in Frappe v16, how
app tiles get to the `/desk` landing grid, and how to add icons for a new
app the right way. It is grounded in the actual Frappe source paths so you
can verify every claim.

> TL;DR — `/desk` reads `frappe.boot.desktop_icons`, populated from the
> `Desktop Icon` DocType (table `tabDesktop Icon`), seeded by a JSON
> fixture per app at `{app}/{app}/desktop_icon/{name}.json`. Updating
> `hooks.py add_to_apps_screen` is **not** enough — that hook feeds the
> `/app` apps screen, a separate surface.

---

## 1. Two landing surfaces, two data sources

Frappe v16 still ships **two** Desk landing surfaces. They look similar
(an icon grid) but read from different data:

| URL | Renderer | Data source | Where defined |
|---|---|---|---|
| `/desk` | Page DocType "desktop" (legacy v12-era, kept active) | `frappe.boot.desktop_icons` | `Desktop Icon` DocType rows (JSON fixture per app) |
| `/app` | Workspace SPA (the v15/v16 native UI) | `frappe.boot.app_data` | `hooks.py add_to_apps_screen` + Workspace DocType |

Many users land on `/desk` because:
- Older sites have `User.home_page = "/desk"` set.
- `Website Settings.app_name` and other defaults still bookmark `/desk`.
- Some flows redirect `/app` → `/desk` via legacy patches.

So if you only wire up `add_to_apps_screen`, the app tile appears on
`/app` but is **missing on `/desk`**.

---

## 2. The Desktop Icon DocType

Source: `apps/frappe/frappe/desk/doctype/desktop_icon/desktop_icon.json`

Key fields:

| Field | Type | Purpose |
|---|---|---|
| `label` | Data | Display name and **primary key** (autoname=field:label). |
| `app` | Data | App slug (`cashew_integration`, `erpnext`, `frappe`, …). |
| `module_name` | Link → Module Def | Optional. Used by some helpers. |
| `icon_type` | Select | `App` \| `Link` \| `Folder`. Controls render and grouping. |
| `link_type` | Select | `External` \| `Workspace Sidebar` \| `URL` \| `Page` \| `Report`. |
| `link` | Data | URL for `link_type=External` (e.g. `/app/cashew-integration`). |
| `link_to` | Data | Target name for `link_type=Workspace Sidebar`/`Page`/`Report`. |
| `icon` | Data | Sprite name for the lucide sprite (e.g. `chart-pie`). Used when no `logo_url`. |
| `logo_url` | Data | File path to an SVG/PNG asset (e.g. `/assets/cashew_integration/images/cashew-integration-logo.svg`). |
| `parent_icon` | Link → Desktop Icon | Group icons under an App-type parent. |
| `standard` | Check | `1` = ships with the app (auto-imported, not user-editable). `0` = user-specific. |
| `hidden` | Check | `1` = filtered out of `/desk` render. |
| `idx` | Int | Sort order within a row. |
| `restrict_removal` | Check | Prevents users from removing this icon from their personal layout. |

### `icon_type` semantics

- **`App`** — the **group card** (an "app tile") on `/desk`. Renders as
  a large card with `logo_url` as the visual and `label` as the title.
  Typically links externally (`link_type=External`, `link=/app/<workspace>`).
- **`Link`** — an individual workspace shortcut. Renders as a small
  icon tile (uses `icon` from the lucide sprite). Often nested under an
  App-type parent via `parent_icon`.
- **`Folder`** — a custom user folder. Almost never shipped by apps.

---

## 3. The boot path

When a user loads `/desk`, the page boot fetches:

```python
# apps/frappe/frappe/boot.py
bootinfo.desktop_icons = get_desktop_icons(bootinfo=bootinfo)
```

`get_desktop_icons()` (in `apps/frappe/frappe/desk/doctype/desktop_icon/desktop_icon.py`):

1. Pulls all rows from `tabDesktop Icon` where:
   - `standard = 1`, OR
   - `standard = 0` AND `owner` IN (`Administrator`, current user).
2. Sorts by `idx`.
3. Filters by permission (`icon.is_permitted(bootinfo)`).
4. **Caches per-user** in Redis under `desktop_icons:<user>`.

The SPA at `/desk` reads `frappe.boot.desktop_icons` and renders the grid
(see `apps/frappe/frappe/desk/page/desktop/desktop.js` — `DesktopPage.prepare()`).

Critical filter (line ~187):

```javascript
const all_icons = icons.filter((icon) => {
    if (icon.hidden != 1) {
        // … render
        return true;
    } else {
        this.hidden_icons.push(icon);
    }
    return false;
});
```

So `hidden = 1` rows go into a "hidden" stash, not the main grid.

---

## 4. JSON fixture format

Apps ship Desktop Icons as JSON files under
`{app}/{app}/desktop_icon/{name}.json`. Frappe auto-imports them on
`bench --site <site> migrate` (via the standard doctype JSON sync path,
the same mechanism that imports Workspace and Print Format fixtures).

Example — ERPNext's app-tile fixture
(`apps/erpnext/erpnext/desktop_icon/erpnext.json`):

```json
{
 "app": "erpnext",
 "creation": "2025-11-17 13:19:04.178534",
 "docstatus": 0,
 "doctype": "Desktop Icon",
 "hidden": 1,
 "icon_type": "App",
 "idx": 100,
 "label": "ERPNext",
 "link": "/app/home",
 "link_type": "External",
 "logo_url": "/assets/erpnext/images/erpnext-logo.svg",
 "modified": "2025-11-17 16:33:37.520201",
 "modified_by": "Administrator",
 "name": "ERPNext",
 "owner": "Administrator",
 "roles": [],
 "standard": 1
}
```

Note `hidden: 1` — ERPNext intentionally hides its own App-type group
card so workspace tiles render flat in the grid. Most third-party apps
will use `hidden: 0`.

Example — ERPNext's workspace-link fixture
(`apps/erpnext/erpnext/desktop_icon/buying.json`):

```json
{
 "app": "erpnext",
 "doctype": "Desktop Icon",
 "icon": "buying",
 "icon_type": "Link",
 "label": "Buying",
 "link_to": "Buying",
 "link_type": "Workspace Sidebar",
 "name": "Buying",
 "standard": 1
}
```

---

## 5. How fixtures get into the DB

Three pathways:

### a) `bench migrate` (production)

Standard. `bench --site <site> migrate` walks each installed app's
`desktop_icon/` directory and imports each `*.json` via
`frappe.modules.import_file.import_file_by_path()`. New rows are
inserted; existing rows are **only updated if `standard=1`** (so the
fixture is the source of truth for standard icons).

### b) `frappe.new_doc("Desktop Icon").insert()` in dev mode

In a developer site (`developer_mode=1`), inserting a `Desktop Icon`
auto-exports the JSON back to `{app}/{app}/desktop_icon/{name}.json` so
the fixture stays in sync with the DB. This is how ERPNext seeds its
icons during development.

### c) `create_desktop_icons_from_workspace()` helper

`apps/frappe/frappe/desk/doctype/desktop_icon/desktop_icon.py:223` —
iterates every `public=1` Workspace and creates a Desktop Icon Link
entry for each. Useful for legacy migration. Modern apps should ship the
JSON fixtures directly rather than rely on this.

---

## 6. Workspace ↔ Desktop Icon coupling

The `Desktop Icon` doctype is **separate** from the `Workspace` doctype.
A workspace and its Desktop Icon are related only by:

- `Desktop Icon.link_to == Workspace.name` (for `link_type=Workspace Sidebar`).
- `Desktop Icon.app == Workspace.app` (manually kept in sync).

There is **no foreign key**, so changing a workspace name without
updating the Desktop Icon row will silently break the link.

There is also an **auto-hide rule** in `create_desktop_icons_from_workspace`
(line 246): if a workspace's name matches its app's title AND the app's
App-type icon already links to a `/app/…` route, the workspace's Link
icon is hidden (`hidden=1`, `parent_icon=None`). This avoids duplicate
"Cashew Integration" tiles when an app has a single workspace named the
same as the app.

---

## 7. Visibility & permissions

A Desktop Icon row is rendered only if **all** of the following pass:

1. `hidden = 0` (or `null`).
2. `standard = 1` OR `owner ∈ {Administrator, <current user>}`.
3. `icon.is_permitted(bootinfo)` — see the method on
   `apps/frappe/frappe/desk/doctype/desktop_icon/desktop_icon.py`. Checks
   role membership against the icon's module and against the linked
   workspace/page/report.

If a tile is missing from `/desk` but the row exists, walk these three
in order.

---

## 8. Caching

Three layers, all per-user:

1. Redis hash `desktop_icons:<user>` — invalidate via
   `frappe.desk.doctype.desktop_icon.desktop_icon.clear_desktop_icons_cache(user)`.
2. Redis hash `bootinfo:<user>` — invalidated by `clear_desktop_icons_cache`
   as a side effect.
3. The browser's per-session `frappe.boot` — re-fetched on full page
   reload.

`bench --site <site> clear-cache` clears all three for all users.

---

## 9. How to add icons for a new app

Step-by-step for shipping the `/desk` tile properly:

### Step 1 — Author the App-type fixture

Create `{app}/{app}/desktop_icon/{app}.json`:

```json
{
 "app": "<your_app>",
 "creation": "2026-05-25 00:00:00.000000",
 "docstatus": 0,
 "doctype": "Desktop Icon",
 "hidden": 0,
 "icon_type": "App",
 "idx": 100,
 "label": "<Your App Title>",
 "link": "/app/<your-default-workspace-slug>",
 "link_type": "External",
 "logo_url": "/assets/<your_app>/images/<your_logo>.svg",
 "modified": "2026-05-25 00:00:00.000000",
 "modified_by": "Administrator",
 "name": "<Your App Title>",
 "owner": "Administrator",
 "roles": [],
 "standard": 1
}
```

The `name` and `label` must match (autoname=field:label). Pick a unique
title across all installed apps — Desktop Icon labels are a global
namespace.

### Step 2 — (Optional) Workspace Link fixtures

If your app has multiple public workspaces and you want them all on
`/desk`, ship one Link-type fixture per workspace (see
`apps/erpnext/erpnext/desktop_icon/buying.json` above). Skip this if
your app has only one workspace with the same name as the app — the
auto-hide rule will collapse the duplicate anyway.

### Step 3 — Make sure the logo exists

The asset referenced in `logo_url` must exist under
`{app}/public/images/`. After `bench build --app <your_app>` it copies
to `sites/assets/<your_app>/images/`. If the path 404s, Frappe silently
falls back to the Frappe placeholder.

### Step 4 — Apply

For an existing site:
```bash
bench --site <site> migrate
bench --site <site> clear-cache
```

For dev iteration: in dev mode (`developer_mode=1`), inserting via
`frappe.new_doc("Desktop Icon").insert()` auto-exports the JSON to
disk. Then call
`frappe.desk.doctype.desktop_icon.desktop_icon.clear_desktop_icons_cache()`
to invalidate the boot cache.

---

## 10. Verification checklist

Run these from `bench --site <site> console` after deploying:

```python
import frappe
# 1. Row exists with the right shape:
frappe.db.get_all(
    "Desktop Icon",
    filters={"app": "<your_app>"},
    fields=["name", "icon_type", "link", "logo_url", "hidden", "standard"],
)

# 2. Boot contains the icon:
boot = frappe.sessions.get()
[d for d in boot.desktop_icons if d.app == "<your_app>"]

# 3. The asset URL serves:
#    curl -sS -o /dev/null -w "%{http_code}\n" http://<host>/assets/<your_app>/images/<your_logo>.svg
```

Then load `/desk` in a browser as a non-Administrator user with the
relevant role and confirm the tile renders.

---

## 11. Common pitfalls

1. **Updating `hooks.py add_to_apps_screen` only.** That hook feeds the
   `/app` apps screen, not `/desk`. Two surfaces, two data sources.

2. **Broken `logo_url`.** Frappe doesn't warn; it silently falls back to
   `/assets/frappe/images/frappe-framework-logo.svg`. Test the URL with
   `curl` after `bench build`.

3. **Duplicate `label`.** Desktop Icon's primary key is `label`. If two
   apps both ship a `Desktop Icon` named `Settings`, the second insert
   fails. Prefix labels with the app name for safety
   (e.g., `Cashew Settings`, not `Settings`).

4. **`standard=0` icons.** These are per-user. They won't show for any
   other user (including new users) and won't survive a re-install.
   Standard icons (`standard=1`) are what apps should ship.

5. **Workspace `icon` field drift.** The Workspace doctype has its own
   `icon` field (a lucide sprite name). It's user-editable, so
   `bench migrate` doesn't overwrite an existing row's icon. If you
   change the workspace JSON's icon and the row already exists, also
   `frappe.db.set_value("Workspace", "<name>", "icon", "<new>")` and
   clear-cache. Otherwise the disk JSON and DB drift.

6. **Cache, cache, cache.** If a fixture change isn't visible: clear
   the Desktop Icon cache (per-user), the boot cache (per-user), and
   the browser cache. `bench --site <site> clear-cache` covers the
   server side.

7. **Workspace name == app title.** Auto-hide kicks in and your
   workspace's Link icon won't appear. This is usually what you want
   (no duplicate tile), but if you wanted both visible, give the
   workspace a different name from the app title.

---

## 12. Sources

- `apps/frappe/frappe/desk/doctype/desktop_icon/desktop_icon.py` —
  `get_desktop_icons`, `clear_desktop_icons_cache`,
  `create_desktop_icons_from_workspace`.
- `apps/frappe/frappe/desk/doctype/desktop_icon/desktop_icon.json` —
  DocType schema.
- `apps/frappe/frappe/boot.py` — `bootinfo.desktop_icons` injection.
- `apps/frappe/frappe/desk/page/desktop/desktop.js` —
  `DesktopPage.prepare()` render loop.
- `apps/erpnext/erpnext/desktop_icon/*.json` — reference fixtures.
