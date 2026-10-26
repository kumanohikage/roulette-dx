// ルーレットDX の管理の部分(ヘッダー・組のメニュー・右のパネル)だけを melta UI の lint と axe(WCAG 2.1 AA)で検査する。
// ルーレット本体(舞台)と演出は対象外。道具はドラフト会議アプリ(E:/Claude/draft-app)に入っているものを借りる
// 使い方: リポジトリの上で `python -m http.server 5190` を動かしてから `electron scripts/check-ui.js`(結果は ui-check/)
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const fs = require('fs'), path = require('path');
const DA = 'E:/Claude/draft-app/node_modules';
const OUT = path.join(__dirname, '../ui-check');
const URL_ = process.env.URL_ || 'http://localhost:5190/dev/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { lint } = await import('file:///' + DA + '/melta-ds-mcp/dist/utils/lint.js');
  const AXE = fs.readFileSync(DA + '/axe-core/axe.min.js', 'utf8');
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  let errors = 0, warns = 0; const seen = new Set();
  const win = new BrowserWindow({ width: 1600, height: 900, useContentSize: true, show: false, webPreferences: { partition: 'uicheck' } });
  async function run(label, w, h, setup) {
    win.setContentSize(w, h);
    await win.loadURL(URL_); await win.webContents.executeJavaScript('localStorage.clear(); 1'); await win.loadURL(URL_); await wait(3500);
    const js = (c) => win.webContents.executeJavaScript(c);
    if (setup) { await js(setup); await wait(400); }
    // 管理の部分だけの HTML(見た目の決まりは同じ <style> を使う)
    const html = await js(`'<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>check</title>' + [...document.querySelectorAll('style')].map((s) => s.outerHTML).join('') + '</head><body>' + document.getElementById('topbar').outerHTML + document.getElementById('panel').outerHTML + '</body></html>'`);
    fs.writeFileSync(path.join(OUT, label + '.html'), html);
    fs.writeFileSync(path.join(OUT, label + '.png'), (await win.webContents.capturePage()).toPNG());
    const r = lint(html, { sourceType: 'html' });
    await js(AXE);
    const ax = await js(`axe.run({ include: [['#topbar'], ['#panel']] }, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }).then((r) => ({ passes: r.passes.length, list: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\\n').slice(1, 2).join('')).slice(0, 4) })) }))`);
    errors += r.errorCount + ax.list.length; warns += r.warnCount;
    console.log(`${r.passed && !ax.list.length ? '✓' : '✗'} ${label}: melta error ${r.errorCount} / warn ${r.warnCount}  axe 違反 ${ax.list.length}（合格 ${ax.passes} 項目）`);
    for (const v of ax.list) { const k = 'axe ' + v.id; if (!seen.has(k)) { seen.add(k); console.log(`    [axe:${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.join('\n      ')}`); } }
    for (const v of r.violations) { const k = `${v.severity} ${v.ruleId} ${v.token || ''}`; if (!seen.has(k)) { seen.add(k); console.log(`    [${v.severity}] ${v.ruleId}: ${v.token || ''} → ${v.alternative || ''} ${v.message || ''}`.slice(0, 300)); } }
  }
  await run('01-wide', 1600, 900);
  await run('02-menu', 1600, 900, `document.querySelector('#set-btn').click(); 1`);
  await run('03-editing', 1600, 900, `const n = document.querySelector('.it .nm'); n.value = 'カレーライス'; n.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#set-name').dispatchEvent(new Event('input')); 1`);
  await run('04-off', 1600, 900, `const c = document.querySelectorAll('.it .ck'); c[1].click(); c[2].click(); 1`);
  await run('05-phone', 390, 844);
  console.log(`\n合計 error ${errors} / warn ${warns}  (HTML とスクショ: ${OUT})`);
  app.quit();
});
