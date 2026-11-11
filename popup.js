const menu = document.getElementById('menu');
const status = document.getElementById('status');
const buttons = () => document.querySelectorAll('button');

function addButton(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => run(label, onClick));
  menu.appendChild(b);
}

async function run(label, action) {
  buttons().forEach((b) => (b.disabled = true));
  status.textContent = label + '…';
  try {
    const res = await action();
    if (!res || !res.ok) throw new Error(res ? res.error : 'no response');
    const r = res.result;
    status.textContent = 'opened' in r ? `Opened ${r.opened} new tab(s)` : `Closed ${r.closed} tab(s)`;
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  } finally {
    buttons().forEach((b) => (b.disabled = false));
  }
}

chrome.runtime.sendMessage({ type: 'sections' }).then((res) => {
  const titles = res.result;
  addButton('Get all', () => chrome.runtime.sendMessage({ type: 'sync' }));
  for (const title of titles) {
    addButton('Get ' + title, () => chrome.runtime.sendMessage({ type: 'sync', titles: [title] }));
  }
});

document.getElementById('close').addEventListener('click', () =>
  run('Close all tabs', () => chrome.runtime.sendMessage({ type: 'closeAll' })),
);
