import { expect, type Page } from '@playwright/test';

export interface Pt {
  x: number;
  y: number;
}

/** Real touch input via the Chrome DevTools protocol (supports multi-touch). */
export async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, pts: Pt[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  return {
    start: (pts: Pt[]) => send('touchStart', pts),
    move: (pts: Pt[]) => send('touchMove', pts),
    end: () => send('touchEnd', []),
    async tap(p: Pt) {
      await send('touchStart', [p]);
      await send('touchEnd', []);
    },
    async doubleTap(p: Pt) {
      await this.tap(p);
      await page.waitForTimeout(60);
      await this.tap(p);
    },
    async drag(from: Pt, to: Pt, steps = 12, holdMs = 0) {
      await send('touchStart', [from]);
      if (holdMs) await page.waitForTimeout(holdMs);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await send('touchMove', [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }]);
      }
      await page.waitForTimeout(30);
      await send('touchEnd', []);
    },
    async longPress(p: Pt, ms = 650) {
      await send('touchStart', [p]);
      await page.waitForTimeout(ms);
      await send('touchEnd', []);
    },
    async pinch(c: Pt, d0: number, d1: number, steps = 10) {
      const pts = (d: number) => [
        { x: c.x - d / 2, y: c.y },
        { x: c.x + d / 2, y: c.y },
      ];
      await send('touchStart', pts(d0));
      for (let i = 1; i <= steps; i++) await send('touchMove', pts(d0 + ((d1 - d0) * i) / steps));
      await send('touchEnd', []);
    },
  };
}

export type Touch = Awaited<ReturnType<typeof touch>>;

/** Input abstraction that uses touch on touch devices and the mouse otherwise. */
export async function input(page: Page) {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  const t = hasTouch ? await touch(page) : null;
  const m = page.mouse;
  return {
    hasTouch,
    touch: t,
    async tap(p: Pt) {
      if (t) await t.tap(p);
      else await m.click(p.x, p.y);
    },
    async doubleTap(p: Pt) {
      if (t) await t.doubleTap(p);
      else {
        await m.click(p.x, p.y);
        await page.waitForTimeout(40);
        await m.click(p.x, p.y);
      }
    },
    async drag(from: Pt, to: Pt, steps = 12) {
      if (t) return t.drag(from, to, steps);
      await m.move(from.x, from.y);
      await m.down();
      for (let i = 1; i <= steps; i++) await m.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await m.up();
    },
  };
}

export async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.locator('.node').first()).toBeVisible();
  return errors;
}

/** Open the menu and start a new empty board. */
export async function newBoard(page: Page) {
  await page.getByRole('button', { name: 'Boards and menu' }).click();
  await page.locator('.panel').getByRole('button', { name: 'New' }).click();
  await expect(page.locator('.panel')).not.toHaveClass(/is-open/);
  await expect(page.locator('.empty-hint')).toBeVisible();
}

export async function center(page: Page, selector: string, nth = 0): Promise<Pt> {
  const box = await page.locator(selector).nth(nth).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function viewportSize(page: Page) {
  return page.viewportSize()!;
}

/** Create a note at screen point p by double-tapping, type text and finish. */
export async function createNote(page: Page, p: Pt, text: string) {
  const inp = await input(page);
  await inp.doubleTap(p);
  const editor = page.locator('.node__editor');
  await expect(editor).toBeFocused();
  await editor.fill(text);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(editor).toHaveCount(0);
}

export async function zoomPercent(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.world') as HTMLElement;
    const m = /scale\(([\d.]+)\)/.exec(el.style.transform);
    return m ? Number(m[1]) : NaN;
  });
}
