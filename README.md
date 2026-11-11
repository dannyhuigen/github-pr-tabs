# GitHub PR Inbox Tabs

Chrome extension that keeps every pull request from your
[GitHub PR inbox](https://github.com/pulls/inbox) open in a tab, sorted into one
tab group per inbox section.

<p align="center"><img src="icons/icon-128.png" width="96" alt=""></p>

## How it works

Click the toolbar icon and pick a menu item:

| Menu item         | Does                                               |
| ----------------- | -------------------------------------------------- |
| **Get all**       | Sync every inbox section                           |
| **Get _section_** | Sync one section (Needs your review, Your drafts…) |
| **Close all tabs**| Close every tab the extension opened               |

A sync:

1. Reloads the inbox page in a background tab and waits until every section,
   including "Load more", has finished loading.
2. Opens a tab for each PR that is not already open anywhere.
3. Files the tabs into a group named `github · <section>`, one group per section.
4. Collapses the groups and moves them to the end of the tab strip.

Tabs you already had open are reused, never duplicated. Tabs in groups you made
yourself are left alone. A sync never closes anything.

Chrome cannot nest tab groups, so sections become sibling groups rather than
children of one `github` group.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder.
4. Pin the icon. `Alt+Shift+P` also opens the menu.

Chrome 111 or newer.

## Notes

- Chrome auto-saves tab groups and pins them to the bookmarks bar. The extension
  cannot opt out. Right-click the bookmarks bar and untick **Show tab groups**
  to hide them.
- Section names live in `SECTIONS` at the top of `background.js`. Edit them if
  GitHub renames a section.
- Debug output: `chrome://extensions` → this extension → **service worker**.
