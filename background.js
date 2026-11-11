const INBOX_URL = 'https://github.com/pulls/inbox';
const GROUP_PREFIX = 'github · ';

// Inbox sections, in the order their tab groups are created.
const SECTIONS = [
  { title: 'Needs your review', color: 'red' },
  { title: "Needs your teams' review", color: 'orange' },
  { title: 'Your drafts', color: 'grey' },
  { title: 'Waiting for review or checks', color: 'yellow' },
  { title: 'Needs action', color: 'pink' },
  { title: 'Ready to merge', color: 'green' },
];

const PR_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
const prKey = (url) => (url && url.match(PR_RE) || [null])[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const run =
    msg.type === 'sections' ? Promise.resolve(SECTIONS.map((s) => s.title))
    : msg.type === 'sync' ? sync(msg.titles)
    : msg.type === 'closeAll' ? closeAll()
    : Promise.reject(new Error('unknown message ' + msg.type));
  run.then(
    (result) => sendResponse({ ok: true, result }),
    (err) => {
      console.error('[pr-inbox-tabs]', err);
      badge('!', '#d1242f');
      sendResponse({ ok: false, error: String(err.message || err) });
    },
  );
  return true; // keep sendResponse alive for the async work
});

// titles: inbox sections to sync; omitted means all of them.
async function sync(titles) {
  const selected = titles ? SECTIONS.filter((s) => titles.includes(s.title)) : SECTIONS;
  badge('…', '#6e7781');
  const inboxTab = await getInboxTab();
  const data = await scrapeWithRetry(inboxTab.id, selected.map((s) => s.title));
  console.log('[pr-inbox-tabs] scraped', data);

  const windowId = inboxTab.windowId;
  // A tab that is still loading (or was just created) has no url yet, only pendingUrl.
  const tabByPr = new Map();
  for (const t of await chrome.tabs.query({})) {
    const key = prKey(t.url) || prKey(t.pendingUrl);
    if (key && !tabByPr.has(key)) tabByPr.set(key, t);
  }
  console.log('[pr-inbox-tabs] open PR tabs', tabByPr.size);

  const groups = await chrome.tabGroups.query({ windowId });
  const ownGroupIds = new Set(
    groups.filter((g) => (g.title || '').startsWith(GROUP_PREFIX)).map((g) => g.id),
  );

  let opened = 0;
  for (const section of selected) {
    const found = data.sections.find((s) => s.title === section.title);
    if (!found || found.prs.length === 0) continue;

    const tabIds = [];
    for (const pr of found.prs) {
      const key = prKey(pr.url);
      if (!key) continue;
      let tab = tabByPr.get(key);
      if (!tab) {
        tab = await chrome.tabs.create({ url: key, windowId, active: false });
        tabByPr.set(key, tab);
        opened++;
        tabIds.push(tab.id);
      } else if (
        tab.windowId === windowId &&
        (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || ownGroupIds.has(tab.groupId))
      ) {
        // Already open here: (re)file it into the right section group.
        // Tabs in groups the user made themselves are left alone.
        tabIds.push(tab.id);
      }
    }
    if (tabIds.length === 0) continue;

    const title = GROUP_PREFIX + section.title;
    const existing = groups.find((g) => g.title === title);
    if (existing) {
      await chrome.tabs.group({ tabIds, groupId: existing.id });
      await collapse(existing.id);
    } else {
      const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title, color: section.color });
      await collapse(groupId);
      groups.push({ id: groupId, title });
      ownGroupIds.add(groupId);
    }
  }

  // Keep our groups at the end of the tab strip, in section order.
  for (const section of SECTIONS) {
    const group = groups.find((g) => g.title === GROUP_PREFIX + section.title);
    if (group) await chrome.tabGroups.move(group.id, { index: -1 });
  }

  badge(String(opened), '#1a7f37');
  setTimeout(() => badge(''), 4000);
  return { opened };
}

// Chrome refuses to collapse a group that holds the active tab; not worth failing the sync over.
async function collapse(groupId) {
  try {
    await chrome.tabGroups.update(groupId, { collapsed: true });
  } catch (err) {
    console.warn('[pr-inbox-tabs] could not collapse group', groupId, err.message);
  }
}

// Closes every tab in a group this extension made, which also removes the groups.
async function closeAll() {
  const groups = await chrome.tabGroups.query({});
  const ids = [];
  for (const g of groups) {
    if (!(g.title || '').startsWith(GROUP_PREFIX)) continue;
    for (const t of await chrome.tabs.query({ groupId: g.id })) ids.push(t.id);
  }
  if (ids.length) await chrome.tabs.remove(ids);
  badge('');
  return { closed: ids.length };
}

async function getInboxTab() {
  const [existing] = await chrome.tabs.query({ url: INBOX_URL + '*' });
  let tab;
  if (existing) {
    tab = await chrome.tabs.reload(existing.id).then(() => chrome.tabs.get(existing.id));
  } else {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    tab = await chrome.tabs.create({ url: INBOX_URL, windowId: win.id, active: false });
  }
  await waitForLoad(tab.id);
  return chrome.tabs.get(tab.id);
}

function waitForLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('inbox tab did not finish loading'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// wanted: section titles the caller needs complete before the scrape is accepted.
async function scrapeWithRetry(tabId, wanted, attempts = 60, delayMs = 500) {
  const titles = SECTIONS.map((s) => s.title);
  let last = null;
  let stable = 0;
  for (let i = 0; i < attempts; i++) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeInbox,
      args: [titles],
    });
    const signature = JSON.stringify(result.sections.map((s) => [s.found, s.expected, s.prs.map((p) => p.url)]));
    stable = last && last.signature === signature ? stable + 1 : 0;
    last = { ...result, signature };

    const complete =
      !result.busy &&
      !result.clicked &&
      result.sections
        .filter((s) => wanted.includes(s.title))
        .every((s) => s.found && (s.expected == null || s.prs.length >= s.expected));
    if (complete) return result;
    // Sections with zero PRs are not rendered at all, so also stop once nothing changes for 3 s.
    if (stable >= 6 && !result.busy && !result.clicked && result.headers > 0) return result;
    await sleep(delayMs);
  }
  if (!last || last.headers === 0) throw new Error('no inbox sections found on the page');
  return last;
}

// Runs inside the inbox page. Must be self-contained (no closures).
// Markup: <section aria-label="Needs your review" data-testid="pulls-inbox-section-…">
//           header: h2 title, [data-testid^="pulls-inbox-section-count-"] "(N)", collapse button
//           body:   [aria-busy] > ul > li > h3 > a[href$="/pull/N"], optional "Load more" button
function scrapeInbox(titles) {
  const norm = (s) => (s || '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
  const PR_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

  const byTitle = new Map();
  let busy = false;
  let clicked = false;
  for (const sec of document.querySelectorAll('section[data-testid^="pulls-inbox-section-"]')) {
    const title = norm(sec.getAttribute('aria-label') || sec.querySelector('h2')?.textContent);
    if (!title) continue;

    const collapse = sec.querySelector('button[aria-controls][aria-expanded="false"]');
    if (collapse) { collapse.click(); clicked = true; }
    if (sec.querySelector('[aria-busy="true"]')) busy = true;
    const more = [...sec.querySelectorAll('button')].find((b) => norm(b.textContent) === 'Load more');
    if (more) { more.click(); clicked = true; }

    const countText = sec.querySelector('[data-testid^="pulls-inbox-section-count-"]')?.textContent || '';
    const countMatch = countText.match(/\d+/);

    const prs = new Map();
    for (const a of sec.querySelectorAll('li a[href]')) {
      const m = (a.href || '').match(PR_RE);
      if (!m) continue;
      const text = norm(a.textContent);
      if (!prs.has(m[0]) || (!prs.get(m[0]) && text)) prs.set(m[0], text);
    }
    byTitle.set(title, { expected: countMatch ? Number(countMatch[0]) : null, prs });
  }

  const sections = titles.map((title) => {
    const hit = byTitle.get(norm(title));
    return {
      title,
      found: Boolean(hit),
      expected: hit ? hit.expected : null,
      prs: hit ? [...hit.prs].map(([url, text]) => ({ url, title: text })) : [],
    };
  });
  return { url: location.href, headers: byTitle.size, busy, clicked, sections };
}

function badge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}
