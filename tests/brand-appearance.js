import assert from "node:assert/strict";

function luminance(rgb) {
  return rgb
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(foreground, background) {
  const values = [foreground, background].map(luminance).sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
export async function checkBrand(page, theme) {
  await page.evaluate(() => document.fonts.ready);
  const green = theme === "dark" ? "rgb(78, 157, 108)" : "rgb(51, 133, 85)";
  assert.equal(await page.locator(".wordmark").textContent(), "RyCruit");
  assert.equal(
    await page.locator(".brand-mark path").getAttribute("d"),
    "M8 4 32 18 8 32Z",
  );
  assert.equal(
    await page
      .locator(".brand-ry")
      .evaluate((el) => getComputedStyle(el).color),
    green,
  );
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  assert(icon.endsWith(`/favicon-${theme}.svg`));
  const response = await page.request.get(new URL(icon, page.url()).href);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-type"], /image\/svg\+xml/);
  assert(
    (await response.text()).includes(theme === "dark" ? "#4e9d6c" : "#338555"),
  );
  const texts = await page
    .locator(".brand-ry,.table-actions a")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const style = getComputedStyle(el);
        let parent = el;
        while (
          getComputedStyle(parent).backgroundColor === "rgba(0, 0, 0, 0)" &&
          parent.parentElement
        )
          parent = parent.parentElement;
        return {
          color: style.color,
          background: getComputedStyle(parent).backgroundColor,
          large:
            parseFloat(style.fontSize) >= 24 ||
            (parseFloat(style.fontSize) >= 18.66 &&
              Number(style.fontWeight) >= 700),
        };
      }),
    );
  for (const text of texts)
    assert(contrast(text.color, text.background) >= (text.large ? 3 : 4.5));
  for (const primary of await page.locator(".primary:visible").all()) {
    for (const hover of [false, true]) {
      if (hover) await primary.hover();
      else await page.mouse.move(0, 0);
      const colors = await primary.evaluate((el) => [
        getComputedStyle(el).color,
        getComputedStyle(el).backgroundColor,
      ]);
      assert(contrast(...colors) >= 4.5, `Primary contrast: ${colors}`);
      if (!hover) assert.equal(colors[1], green);
    }
  }
  await page.locator(".wordmark").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineColor,
    ),
    green,
  );
  await page.mouse.click(0, 0);
}
