"""Headless render loop for the scene engine.

usage:
  python3 agent_render.py <engine.html> <scene.js> <out_dir> [camera ...] [--view N] [--size WxH] [--eval "js"]...
  python3 agent_render.py <engine.html> <scene.js> --bundle <index.html>     # inline scene.js into a publishable page

Writes <out_dir>/report.json and one PNG per camera (all presets if none named).
three.js is served from a local node_modules copy so this works offline.
"""
import asyncio, base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
THREE = os.environ.get("THREE_DIR", os.path.join(HERE, "..", "node_modules", "three"))

def bundle(engine, scene):
    tpl = open(engine, encoding="utf-8").read()
    src = open(scene, encoding="utf-8").read()
    assert "/*SCENE*/" in tpl, "engine template has no /*SCENE*/ slot"
    assert "</script" not in src, "scene.js must not contain </script"
    return tpl.replace("/*SCENE*/", src)

async def main():
    args = sys.argv[1:]
    if "--bundle" in args:
        i = args.index("--bundle")
        open(args[i + 1], "w", encoding="utf-8").write(bundle(args[0], args[1]))
        print("bundled ->", args[i + 1]); return
    view, size, evals = 0, (1280, 760), []
    while "--eval" in args:
        i = args.index("--eval"); evals.append(args[i + 1]); del args[i:i + 2]
    if "--view" in args:
        i = args.index("--view"); view = int(args[i + 1]); del args[i:i + 2]
    if "--size" in args:
        i = args.index("--size"); w, h = args[i + 1].split("x"); size = (int(w), int(h)); del args[i:i + 2]
    engine, scene, out = args[:3]
    cams = args[3:]
    os.makedirs(out, exist_ok=True)
    page = "<!doctype html><html><head><meta charset='utf-8'></head><body>" + bundle(engine, scene) + "</body></html>"

    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": size[0], "height": size[1]})
        logs = []
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text))
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)))

        async def route(r):
            u = r.request.url
            if u.startswith("http://local.test/"):
                await r.fulfill(body=page, content_type="text/html")
            elif "three.min.js" in u:
                await r.fulfill(path=os.path.join(THREE, "build", "three.min.js"), content_type="application/javascript")
            elif "OrbitControls" in u:
                await r.fulfill(path=os.path.join(THREE, "examples", "js", "controls", "OrbitControls.js"), content_type="application/javascript")
            else:
                await r.abort()
        await pg.route("**/*", route)
        await pg.goto("http://local.test/")
        try:
            await pg.wait_for_function("window.__mapReady === true", timeout=300000, polling=500)
        except Exception as e:
            print("TIMEOUT waiting for build", e)
        report = await pg.evaluate("window.mapEditor ? window.mapEditor.report() : null")
        json.dump(report, open(os.path.join(out, "report.json"), "w"), ensure_ascii=False, indent=1)
        await pg.evaluate("window.mapEditor && mapEditor.pause(true)")
        for ex in evals:
            print("eval", ex, "=>", json.dumps(await pg.evaluate(ex), ensure_ascii=False))
        if view:
            await pg.evaluate(f"mapEditor.view({view})")
        for ci, n in enumerate(cams or (report or {}).get("cameras", [])):
            if n.startswith("{"):
                spec = json.loads(n)
                await pg.evaluate(f"mapEditor.camera({n})")
                n = spec.get("name", f"custom{ci}")
            else:
                await pg.evaluate(f"mapEditor.camera({json.dumps(n)})")
            await pg.evaluate("mapEditor.step(2.5)")
            url = await pg.evaluate("mapEditor.snapshot()")
            open(os.path.join(out, f"{n}.png"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
        errs = [l for l in logs if ("error" in l.lower() or "PAGEERROR" in l) and "ERR_FAILED" not in l and "MAP_REPORT" not in l]
        print("console errors:", "\n".join(e[:600] for e in errs[:12]) or "none")
        if report:
            print("build", report["buildMs"], "ms", report.get("timing"), "| errors", report["errors"], "| warnings", report["warnings"])
            print("logs", report.get("logs"))
            print("counts", report["counts"])
            for o in report["ops"]:
                if o["status"] != "ok" or o["op"] in ("lake", "river", "scatter"):
                    print(f'  L{o.get("line")} {o["call"]:<14} {o["status"]:<4} {o["ms"]:>5}ms  {o["note"]}')
        await b.close()

asyncio.run(main())
