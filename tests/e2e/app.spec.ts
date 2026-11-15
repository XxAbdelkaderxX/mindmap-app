import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { boot, center, createNote, input, newBoard, touch, zoomPercent } from './helpers';

test.describe('layout', () => {
  test('loads the welcome board with all controls on screen', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator('.node--text')).toHaveCount(5);
    await expect(page.locator('.node--group')).toHaveCount(1);
    await expect(page.locator('g.edge')).toHaveCount(4);
    const vs = page.viewportSize()!;
    // Every toolbar button is fully visible and at least 32px (touch-friendly)
    for (const b of await page.locator('.toolbar button:visible').all()) {
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vs.width);
      expect(box.y + box.height).toBeLessThanOrEqual(vs.height);
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(32);
    }
    // Fitted content does not sit under the toolbar or title
    const tb = (await page.locator('.toolbar').boundingBox())!;
    const title = (await page.locator('.topbar').boundingBox())!;
    for (const n of await page.locator('.node--text').all()) {
      const nb = (await n.boundingBox())!;
      const overlap = (a: typeof nb, b: typeof nb) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(overlap(nb, tb)).toBe(false);
      expect(overlap(nb, title)).toBe(false);
    }
    // No horizontal page scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('uses a vertical toolbar in phone landscape and horizontal in portrait', async ({ page }, info) => {
    await boot(page);
    const box = (await page.locator('.toolbar').boundingBox())!;
    if (info.project.name === 'phone-landscape' || info.project.name === 'android-landscape') {
      expect(box.height).toBeGreaterThan(box.width);
    } else {
      expect(box.width).toBeGreaterThan(box.height);
    }
  });
});

test.describe('nodes', () => {
  test('create via double-tap, write Markdown, render it', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width / 2, y: vs.height / 2 }, '# Title\nSome **bold** and *italic*\n- [ ] todo');
    const node = page.locator('.node--text');
    await expect(node).toHaveCount(1);
    await expect(node.locator('h1')).toHaveText('Title');
    await expect(node.locator('strong')).toHaveText('bold');
    await expect(node.locator('em')).toHaveText('italic');
    // Task checkbox toggles the source
    await node.locator('input.md-task').click();
    await expect(node.locator('input.md-task')).toBeChecked();
    // Node grew to fit content while typing
    expect((await node.boundingBox())!.height).toBeGreaterThan(90 * (await zoomPercent(page)));
  });

  test('edit an existing note with double-tap', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width / 2, y: vs.height / 2 }, 'first');
    const inp = await input(page);
    await inp.doubleTap(await center(page, '.node--text'));
    const editor = page.locator('.node__editor');
    await expect(editor).toBeFocused();
    await editor.fill('second version');
    // Tapping empty canvas commits the edit
    await inp.tap({ x: vs.width - 24, y: vs.height / 2 });
    await expect(page.locator('.node--text .md')).toHaveText('second version');
  });

  test('move a node by dragging and resize it by the corner', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    const start = { x: vs.width / 2, y: vs.height / 2 - 40 };
    await createNote(page, start, 'drag me');
    const inp = await input(page);
    const node = page.locator('.node--text');
    const before = (await node.boundingBox())!;
    await inp.drag(await center(page, '.node--text'), { x: start.x - 60, y: start.y + 80 });
    const after = (await node.boundingBox())!;
    expect(after.x).toBeLessThan(before.x - 40);
    expect(after.y).toBeGreaterThan(before.y + 50);

    // Select and resize
    await inp.tap(await center(page, '.node--text'));
    const handle = await center(page, '.node--text .resize');
    await inp.drag(handle, { x: handle.x + 60, y: handle.y + 60 });
    const resized = (await node.boundingBox())!;
    expect(resized.width).toBeGreaterThan(after.width + 40);
    expect(resized.height).toBeGreaterThan(after.height + 40);
  });

  test('change color, shape and style; duplicate and delete', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width / 2, y: vs.height / 2 }, 'style me');
    const inp = await input(page);
    await inp.tap(await center(page, '.node--text'));
    const tb = page.getByRole('toolbar', { name: 'Node actions' });
    await tb.getByRole('button', { name: 'Color' }).click();
    await tb.getByRole('button', { name: 'Green' }).click();
    await expect(page.locator('.node--text')).toHaveClass(/has-color/);
    await tb.getByRole('button', { name: 'Back' }).click();
    await tb.getByRole('button', { name: 'Shape & style' }).click();
    await tb.getByRole('button', { name: 'Ellipse' }).click();
    await tb.getByRole('button', { name: 'Outline' }).click();
    await expect(page.locator('.node--text')).toHaveClass(/shape-ellipse/);
    await expect(page.locator('.node--text')).toHaveClass(/style-outline/);
    await tb.getByRole('button', { name: 'Back' }).click();
    await tb.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.locator('.node--text')).toHaveCount(2);
    await expect(page.locator('.node--text.shape-ellipse')).toHaveCount(2);
    await tb.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.node--text')).toHaveCount(1);
  });
});

test.describe('connections', () => {
  test('tap a side handle to grow a connected note', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width / 2, y: vs.height / 2 }, 'root');
    const inp = await input(page);
    await inp.tap(await center(page, '.node--text'));
    await inp.tap(await center(page, '.node--text .handle--bottom'));
    await expect(page.locator('.node--text')).toHaveCount(2);
    await expect(page.locator('g.edge')).toHaveCount(1);
    // The new note opens in edit mode
    await expect(page.locator('.node__editor')).toBeFocused();
  });

  test('drag from a handle onto another note connects them; style the line', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    const landscape = vs.width > vs.height;
    const a = landscape ? { x: vs.width * 0.32, y: vs.height / 2 } : { x: vs.width / 2, y: vs.height * 0.3 };
    const b = landscape ? { x: vs.width * 0.72, y: vs.height / 2 } : { x: vs.width / 2, y: vs.height * 0.65 };
    await createNote(page, a, 'A');
    await createNote(page, b, 'B');
    const inp = await input(page);
    await inp.tap(await center(page, '.node--text', 0));
    const handle = await center(page, `.node--text.is-selected .handle--${landscape ? 'right' : 'bottom'}`);
    await inp.drag(handle, await center(page, '.node--text', 1), 16);
    await expect(page.locator('g.edge')).toHaveCount(1);
    await expect(page.locator('.node--text')).toHaveCount(2);
    // New edge is selected and its toolbar is shown
    const tb = page.getByRole('toolbar', { name: 'Connection actions' });
    await expect(tb).toBeVisible();
    await tb.getByRole('button', { name: 'Line style' }).click();
    await tb.getByRole('button', { name: 'Dashed' }).click();
    await tb.getByRole('button', { name: 'Elbow' }).click();
    await expect(page.locator('g.edge .edge__line')).toHaveAttribute('stroke-dasharray', /\d/);
    await tb.getByRole('button', { name: 'Back' }).click();
    await tb.getByRole('button', { name: /Arrows/ }).click();
    await expect(page.locator('g.edge .edge__arrow')).toHaveCount(2);
    await tb.getByRole('button', { name: 'Edit label' }).click();
    await page.locator('.edge-label input').fill('depends on');
    await page.locator('.edge-label input').press('Enter');
    await expect(page.locator('.edge-label')).toHaveText('depends on');
    // Tap the label to (re)select the line, then delete it
    await inp.tap(await center(page, '.edge-label'));
    await tb.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('g.edge')).toHaveCount(0);
  });

  test('drop a connection on empty canvas creates a new note', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width * 0.4, y: vs.height * 0.4 }, 'src');
    const inp = await input(page);
    await inp.tap(await center(page, '.node--text'));
    const h = await center(page, '.node--text .handle--right');
    await inp.drag(h, { x: h.x + 120, y: h.y + 120 }, 14);
    await expect(page.locator('.node--text')).toHaveCount(2);
    await expect(page.locator('g.edge')).toHaveCount(1);
  });
});

test.describe('groups & selection', () => {
  test('box-select, group, and drag the group with its contents', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    const landscape = vs.width > vs.height;
    const p1 = landscape ? { x: vs.width * 0.35, y: vs.height * 0.45 } : { x: vs.width * 0.5, y: vs.height * 0.33 };
    const p2 = landscape ? { x: vs.width * 0.65, y: vs.height * 0.45 } : { x: vs.width * 0.5, y: vs.height * 0.55 };
    await createNote(page, p1, 'one');
    await createNote(page, p2, 'two');
    await page.getByRole('button', { name: 'Box select' }).click();
    const inp = await input(page);
    await inp.drag({ x: 4 + (landscape ? 70 : 0), y: 60 }, { x: vs.width - 6, y: vs.height * 0.75 }, 10);
    await expect(page.locator('.node--text.is-selected')).toHaveCount(2);
    await page.getByRole('button', { name: 'Box select' }).click();
    await page.getByRole('toolbar', { name: 'Node actions' }).getByRole('button', { name: 'Group', exact: true }).click();
    await expect(page.locator('.node--group')).toHaveCount(1);
    const n1 = (await page.locator('.node--text').first().boundingBox())!;
    // Drag the (selected) group by its body: contents move too
    const gb = (await page.locator('.node--group').boundingBox())!;
    const grip = { x: Math.max(gb.x, 0) + 12, y: gb.y + gb.height - 12 };
    await inp.drag(grip, { x: grip.x + 30, y: grip.y + 50 });
    const n1b = (await page.locator('.node--text').first().boundingBox())!;
    expect(n1b.y).toBeGreaterThan(n1.y + 30);
  });

  test('long-press adds notes to a multi-selection (touch)', async ({ page }) => {
    await boot(page);
    const inp = await input(page);
    test.skip(!inp.hasTouch, 'touch only');
    const t = await touch(page);
    await t.tap(await center(page, '.node--text', 1));
    await t.longPress(await center(page, '.node--text', 2));
    await expect(page.locator('.node--text.is-selected')).toHaveCount(2);
  });

  test('long-press empty canvas opens the quick menu (touch)', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const t = await input(page);
    test.skip(!t.hasTouch, 'touch only');
    const vs = page.viewportSize()!;
    await t.touch!.longPress({ x: vs.width / 2, y: vs.height / 2 });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Add group here' }).click();
    await expect(page.locator('.node--group')).toHaveCount(1);
  });
});

test.describe('viewport', () => {
  test('pan with one finger and pinch to zoom', async ({ page }) => {
    await boot(page);
    const inp = await input(page);
    test.skip(!inp.hasTouch, 'touch only');
    const t = inp.touch!;
    const vs = page.viewportSize()!;
    const node = page.locator('.node--text').first();
    const before = (await node.boundingBox())!;
    // Pan on an empty spot near the top
    const empty = { x: vs.width / 2, y: 70 };
    await t.drag(empty, { x: empty.x + 50, y: empty.y + 40 }, 8);
    await page.waitForTimeout(500); // allow inertia to settle
    const after = (await node.boundingBox())!;
    expect(after.x).toBeGreaterThan(before.x + 40);
    const z0 = await zoomPercent(page);
    await t.pinch({ x: vs.width / 2, y: vs.height / 2 }, 100, 220);
    const z1 = await zoomPercent(page);
    expect(z1 / z0).toBeGreaterThan(1.8);
    await t.pinch({ x: vs.width / 2, y: vs.height / 2 }, 220, 100);
    expect(await zoomPercent(page)).toBeCloseTo(z0, 1);
  });

  test('zoom to fit and reset zoom', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Zoom to fit' }).click();
    await page.waitForTimeout(450);
    const fitted = await zoomPercent(page);
    expect(fitted).toBeLessThanOrEqual(1);
    await page.keyboard.press('0');
    await page.waitForTimeout(400);
    expect(await zoomPercent(page)).toBeCloseTo(1, 2);
  });
});

test.describe('history & persistence', () => {
  test('undo and redo from the toolbar', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width / 2, y: vs.height / 2 }, 'hello');
    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    await undo.click(); // typing
    await expect(page.locator('.node--text .md--empty')).toHaveCount(1);
    await undo.click(); // creation
    await expect(page.locator('.node--text')).toHaveCount(0);
    await expect(undo).toBeDisabled();
    await redo.click();
    await redo.click();
    await expect(page.locator('.node--text .md')).toHaveText('hello');
    await expect(redo).toBeDisabled();
  });

  test('autosaves and restores after reload', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    const vs = page.viewportSize()!;
    await createNote(page, { x: vs.width / 2, y: vs.height / 2 }, 'remember **me**');
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.locator('.node--text strong')).toHaveText('me');
    await expect(page.locator('.topbar__title')).toHaveText('Untitled board');
  });

  test('boards: create, rename, switch and delete', async ({ page }) => {
    await boot(page);
    await newBoard(page);
    await page.locator('.topbar__title').click();
    await page.locator('.topbar__input').fill('Project X');
    await page.locator('.topbar__input').press('Enter');
    await expect(page.locator('.topbar__title')).toHaveText('Project X');
    await page.getByRole('button', { name: 'Boards and menu' }).click();
    const panel = page.locator('.panel');
    await expect(panel.locator('.board-item')).toHaveCount(2);
    await panel.locator('.board-item__main', { hasText: 'Welcome' }).click();
    await expect(page.locator('.topbar__title')).toHaveText('Welcome');
    await expect(page.locator('.node--text')).toHaveCount(5);
    await page.getByRole('button', { name: 'Boards and menu' }).click();
    await panel.getByRole('button', { name: 'More actions for Project X' }).click();
    await panel.getByRole('button', { name: 'Delete' }).click();
    await panel.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(panel.locator('.board-item')).toHaveCount(1);
  });
});

test.describe('import / export', () => {
  test('export .canvas and import it back', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Boards and menu' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export .canvas' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Welcome.canvas');
    const path = await file.path();
    const json = JSON.parse(readFileSync(path, 'utf8'));
    expect(json.nodes).toHaveLength(6);
    expect(json.edges).toHaveLength(4);

    await page.getByRole('button', { name: 'Boards and menu' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import file' }).click();
    await (await chooser).setFiles(path);
    await expect(page.locator('.topbar__title')).toHaveText('Welcome');
    await page.getByRole('button', { name: 'Boards and menu' }).click();
    await expect(page.locator('.panel .board-item')).toHaveCount(2);
  });

  test('export PNG and Markdown outline', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Boards and menu' }).click();
    let dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG' }).click();
    const png = await dl;
    expect(png.suggestedFilename()).toBe('Welcome.png');
    const buf = readFileSync(await png.path());
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.length).toBeGreaterThan(5000);

    await page.getByRole('button', { name: 'Boards and menu' }).click();
    dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export outline' }).click();
    const md = readFileSync(await (await dl).path(), 'utf8');
    expect(md).toContain('# Welcome');
    expect(md).toContain('- Canvas Mind');
  });
});

test.describe('PWA service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('registers a service worker for offline use', async ({ page }) => {
    await boot(page);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toContain('localhost:4173');
  });
});

test.describe('PWA', () => {
  test('has a valid manifest and icons', async ({ page, request }) => {
    await boot(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(href!)).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    expect((await request.get('sw.js')).ok()).toBe(true);
  });
});
