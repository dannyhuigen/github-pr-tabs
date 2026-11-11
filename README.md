# GitHub PR Inbox Tabs

Chrome extension. One click scrapes <https://github.com/pulls/inbox> and makes sure every PR
listed there is open in a tab, grouped per inbox section.

Chrome cannot nest tab groups, so instead of one `github` group with sub-groups you get one
group per section, all prefixed `github · `:

| Group                                  | Colour |
| -------------------------------------- | ------ |
| `github · Needs your review`           | red    |
| `github · Needs your teams' review`    | orange |
| `github · Your drafts`                 | grey   |
| `github · Waiting for review or checks`| yellow |
| `github · Needs action`                | pink   |
| `github · Ready to merge`              | green  |

## Install

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Pin the extension. Click it (or press `Alt+Shift+P`) for the menu:
   - **Get all** – sync every section.
   - **Get <section>** – sync one section only.
   - **Close all tabs** – close every tab in a `github · ` group, which removes the groups.

## What a sync does

1. Reloads the inbox tab (opens one if missing) and waits for it to finish loading.
2. Scrapes PR links under each section header. Collapsed sections are expanded first.
3. For each PR: if no tab with that PR is open anywhere, opens one in the background.
4. Files the tab into the section's group. Tabs that are ungrouped or already in a
   `github · ` group get moved; tabs in groups you made yourself are left alone.
5. Badge and popup show how many new tabs were opened. `!` means an error (see service worker console).

A sync never closes tabs. Use **Close all tabs** or close a group by hand.

## Debugging the scraper

GitHub ships its own markup, so if a section comes back empty:

1. `chrome://extensions` → this extension → **service worker** link → console.
   Each sync logs the scraped result including an `expected` count per section
   (parsed from the `(N)` next to the header) so you can compare with what was found.
2. Section titles live in `SECTIONS` at the top of `background.js`. Edit them if GitHub renames one.
