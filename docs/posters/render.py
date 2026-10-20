"""Export the four HTML posters; no model, network or private notes are used.

Requires Python 3.10+, playwright, Pillow and opencv-python.
Install a Playwright Chromium browser, or pass --browser /path/to/chrome.
Fonts are not bundled. Pass --font /path/to/NotoSerifSC-VF.ttf for the headline.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import re
import tempfile

from PIL import Image
import cv2
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
FILES = ["01-find-the-passage.png", "02-remember-the-word.png",
         "03-check-the-source.png", "04-try-the-demo.png"]
TITLES = ["把那一段，找回来。", "记得「留白」，忘了哪篇？",
          "找到片段，也看原文。", "先用几篇笔记，试一次。"]
URL = "https://github.com/Yueyue673/obsidian-third-brain"


def export(browser_path=None, font_path=None, output=None):
    output = Path(output or ROOT)
    output.mkdir(parents=True, exist_ok=True)
    proof = []
    with sync_playwright() as pw:
        options = {"headless": True, "args": ["--disable-gpu"]}
        if browser_path:
            options["executable_path"] = str(Path(browser_path))
        browser = pw.chromium.launch(**options)
        try:
            page = browser.new_page(viewport={"width": 1080, "height": 1350},
                                    device_scale_factor=2)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto((ROOT / "posters.html").as_uri(), wait_until="load")
            if font_path:
                data = base64.b64encode(Path(font_path).read_bytes()).decode()
                page.add_style_tag(content=("@font-face{font-family:'Campaign Serif';"
                    "src:url(data:font/ttf;base64," + data + ") format('truetype');"
                    "font-weight:200 900;font-display:block}"))
            page.evaluate("document.fonts.ready")
            assert page.evaluate("[...document.images].every(i=>i.complete&&i.naturalWidth>0)"), "Missing image"
            for i, name in enumerate(FILES, 1):
                poster = page.locator(f"#poster-{i:02}")
                title = re.sub(r"\s+", "", poster.locator("h1").inner_text())
                assert title == TITLES[i - 1], "Headline mismatch"
                assert URL.removeprefix("https://") in poster.inner_text()
                boxes = poster.evaluate("""el => {
                  const base=el.getBoundingClientRect();
                  return [...el.querySelectorAll('[data-check],.brand,.footer')].map(n=>{
                    const r=n.getBoundingClientRect();
                    return {name:n.className,x:r.x-base.x,y:r.y-base.y,
                      w:r.width,h:r.height,sw:n.scrollWidth,cw:n.clientWidth};
                  });
                }""")
                for b in boxes:
                    assert b["x"] >= 0 and b["y"] >= 0 and b["x"]+b["w"] <= 1080.5 and b["y"]+b["h"] <= 1350.5, (name, b)
                    assert b["sw"] <= b["cw"] + 1, (name, "Text overflow", b)
                for a, box in enumerate(boxes):
                    for other in boxes[a + 1:]:
                        dx = min(box["x"]+box["w"], other["x"]+other["w"]) - max(box["x"], other["x"])
                        dy = min(box["y"]+box["h"], other["y"]+other["h"]) - max(box["y"], other["y"])
                        assert dx <= 2 or dy <= 2, (name, "Overlap", box["name"], other["name"])
                target = output / name
                poster.screenshot(path=str(target))
                with Image.open(target) as image:
                    assert image.size == (2160, 2700)
                proof.append({"file": name, "title": title, "size": [2160, 2700],
                              "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
            assert not errors, errors
        finally:
            browser.close()
    with tempfile.TemporaryDirectory(prefix="third-brain-posters-") as temp:
        mobile = Path(temp) / "mobile.png"
        with Image.open(output / FILES[3]) as image:
            image.resize((360, 450), Image.Resampling.LANCZOS).save(mobile)
        for file in [output / FILES[3], mobile]:
            decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(file)))
            assert decoded == URL, "QR failed at full or mobile size"
    result = {"posters": proof, "qrTarget": URL, "qrVerifiedAt": [[2160, 2700], [360, 450]],
              "source": "posters.html + posters.css + assets", "modelGenerated": False}
    (output / "export-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"exported": len(proof), "size": [2160, 2700], "qrVerified": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", help="Optional installed Chromium executable")
    parser.add_argument("--font", help="Optional locally installed Noto Serif SC TTF")
    parser.add_argument("--output", help="Output directory; defaults to this folder")
    args = parser.parse_args()
    export(args.browser, args.font, args.output)
