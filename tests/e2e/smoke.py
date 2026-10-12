"""Browser smoke test (Playwright for Python). Requires the app running on http://localhost:8080.
    pip install playwright && python -m playwright install chromium
    python tests/e2e/smoke.py
Flow: all five routes load, 3D asset loads, demo profile -> real prediction -> LAD focus -> real SHAP explanation.
Chromium uses software WebGL here; pass your own GPU flags if desired."""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

async def main() -> int:
    errors: list[str] = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        page = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        for route in ("/", "/inputs", "/workspace", "/evidence", "/methods"):
            await page.goto(BASE + route, wait_until="networkidle")
            assert await page.locator("main").count() == 1, route
        await page.goto(BASE + "/", wait_until="networkidle"); await page.wait_for_selector(".viewer[data-phase=ready]", timeout=60000)
        await page.goto(BASE + "/workspace", wait_until="networkidle")
        await page.get_by_role("button", name="Load demo profile").click()
        await page.get_by_role("button", name="Run prediction").click(); await page.wait_for_selector("text=Run prediction again", timeout=60000)
        await page.locator(".trow", has_text="LAD").click()
        await page.get_by_role("button", name="Explain LAD score").click(); await page.wait_for_selector(".shap-row", timeout=90000)
        await b.close()
    assert not errors, errors
    print("smoke OK")
    return 0

sys.exit(asyncio.run(main()))
