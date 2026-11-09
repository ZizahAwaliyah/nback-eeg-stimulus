"""Uji end-to-end aplikasi N-back lewat CDP Chrome headless.

Menguji: alur layar, countdown, blok 3x3, respons SPASI & klik, isi CSV, dan
bahwa timestamp/reaction_time_ms terisi benar.
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://127.0.0.1:8080/index.html"
PORT = 9333


def start_chrome(download_dir):
    profile = tempfile.mkdtemp(prefix="nbprofile-")
    args = [
        CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
        f"--user-data-dir={profile}", "--no-first-run", "--disable-gpu",
        "--window-size=1400,900", "--autoplay-policy=no-user-gesture-required",
        "--remote-allow-origins=*", BASE,
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1)
            return proc, profile
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Chrome tidak start")


class CDP:
    def __init__(self):
        import websocket
        self.ws_module = websocket
        tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
        page = [t for t in tabs if t["type"] == "page" and "127.0.0.1:8080" in t.get("url", "")]
        if not page:
            raise RuntimeError("Tab aplikasi tidak ditemukan: " + str([t.get("url") for t in tabs]))
        page = page[0]
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=60)
        self.id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method, **params):
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.id:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})

    def js(self, expr, await_promise=False):
        res = self.send("Runtime.evaluate", expression=expr, returnByValue=True,
                        awaitPromise=await_promise)
        if res.get("exceptionDetails"):
            raise RuntimeError(json.dumps(res["exceptionDetails"])[:600])
        return res["result"].get("value")

    def goto(self, url):
        self.send("Page.navigate", url=url)
        time.sleep(2.0)

    def wait_for(self, expr, timeout=30, poll=0.2):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.js(expr):
                    return True
            except Exception:
                pass
            time.sleep(poll)
        return False

    def press_space(self):
        for t in ("rawKeyDown", "keyUp"):
            self.send("Input.dispatchKeyEvent", type=t, windowsVirtualKeyCode=32,
                      nativeVirtualKeyCode=32, code="Space", key=" ",
                      text=(" " if t == "rawKeyDown" else ""))

    def click_xy(self, x, y):
        for t in ("mousePressed", "mouseReleased"):
            self.send("Input.dispatchMouseEvent", type=t, x=x, y=y, button="left",
                      clickCount=1, buttons=(1 if t == "mousePressed" else 0))


def main():
    download_dir = tempfile.mkdtemp(prefix="nbdl-")
    proc, profile = start_chrome(download_dir)
    log = []
    try:
        cdp = CDP()
        cdp.goto(BASE)
        log.append(("1. Halaman dimuat", cdp.js("document.title")))

        # Isi form: 1/2/3-back, latihan OFF, 1 menit per blok, ISI 500ms supaya cepat
        cdp.js("""
        (() => {
          document.getElementById('preset-select').value = 'presets/mutiah.json';
          document.getElementById('participant-name').value = 'Siti Uji';
          document.getElementById('researcher-name').value = 'Mutiah Arinil';
          document.getElementById('n-levels').value = '1,2,3';
          document.getElementById('block-duration').value = '1';
          document.getElementById('isi').value = '500';
          document.getElementById('stim-duration').value = '200';
          document.getElementById('enable-practice').checked = false;
          document.getElementById('source-form-url').value = 'https://forms.gle/contoh123';
          document.getElementById('btn-start').click();
          return true;
        })()
        """)
        time.sleep(0.5)
        log.append(("2. Layar setelah klik Mulai", cdp.js("document.querySelector('.screen.active').id")))
        log.append(("3. Instruksi n=1 memuat kotak 3x3?",
                    cdp.js("!!document.querySelector('#instructions-body .grid-3x3')")))
        log.append(("4. Teks instruksi", cdp.js("document.getElementById('instructions-body').innerText.slice(0,90).replace(/\\n/g,' | ')")))

        # Lanjut → countdown → blok otomatis (tanpa KSS)
        cdp.js("document.getElementById('btn-continue-to-practice-or-fatigue').click()")
        seen_countdown = cdp.wait_for("document.getElementById('screen-countdown').classList.contains('active')", 5)
        log.append(("5. Layar countdown muncul", seen_countdown))

        in_block = cdp.wait_for("document.getElementById('screen-block').classList.contains('active')", 15)
        log.append(("6. Blok 1 mulai", in_block))
        log.append(("7. Grid terlihat di blok?",
                    cdp.js("!document.getElementById('grid-3x3').classList.contains('hidden')")))

        # Tunggu beberapa trial, tekan SPASI + klik sekali
        time.sleep(2.0)
        cdp.press_space()
        time.sleep(0.3)
        cdp.press_space()
        time.sleep(1.0)
        # klik di tengah grid
        box = cdp.js("(() => { const r = document.getElementById('grid-3x3').getBoundingClientRect(); return JSON.stringify({x: r.left + r.width/2, y: r.top + r.height/2}); })()")
        b = json.loads(box)
        cdp.click_xy(b["x"], b["y"])
        time.sleep(0.5)
        cdp.press_space()
        log.append(("8. Respons terekam sementara?",
                    cdp.js("document.getElementById('key-indicator').classList.contains('pressed')")))

        # Tunggu blok 1 selesai (60 trial x 0.5s = 30s) + respons terus
        for _ in range(70):
            if cdp.js("document.getElementById('screen-block-summary').classList.contains('active')"):
                break
            cdp.press_space()
            time.sleep(0.45)
        log.append(("9. Layar ringkasan blok aktif",
                    cdp.js("document.getElementById('screen-block-summary').classList.contains('active')")))
        log.append(("10. Isi ringkasan blok",
                    cdp.js("document.getElementById('block-summary-content').innerText.replace(/\\n/g,' | ').slice(0,220)")))

        # Lanjut blok 2, tunggu selesai, lalu blok 3
        for blok in (2, 3):
            cdp.js("document.getElementById('btn-continue-from-block-summary').click()")
            if blok == 2:
                ok = cdp.wait_for("document.getElementById('screen-instructions').classList.contains('active')", 8)
                log.append((f"11. Blok {blok}: layar instruksi", ok))
                cdp.js("document.getElementById('btn-continue-to-practice-or-fatigue').click()")
            cdp.wait_for("document.getElementById('screen-block').classList.contains('active')", 15)
            for _ in range(70):
                if cdp.js("document.getElementById('screen-block-summary').classList.contains('active')"):
                    break
                cdp.press_space()
                time.sleep(0.45)

        cdp.js("document.getElementById('btn-continue-from-block-summary').click()")
        finish = cdp.wait_for("document.getElementById('screen-finished').classList.contains('active')", 10)
        log.append(("12. Layar Sesi Selesai", finish))

        log.append(("12b. Status internal", cdp.js(
            "JSON.stringify({layar:document.querySelector('.screen.active').id,"
            "adaConfig:!!currentConfig, adaLogger:!!currentLogger, "
            "adaFungsi:typeof currentLogger})")))

        # Ambil data dari logger di halaman
        stats = cdp.js("""
        (() => {
          const t = currentLogger.getAllTrials();
          const withResp = t.filter(x => x.response).length;
          const withRt = t.filter(x => x.reaction_time_ms !== '' && x.reaction_time_ms !== null).length;
          const clicks = t.filter(x => x.response === 'click').length;
          const spaces = t.filter(x => x.response === 'spacebar').length;
          const blocks = [...new Set(t.map(x => x.block_index))];
          const stimTypes = [...new Set(t.map(x => /^r\\dc\\d$/.test(x.stimulus)))];
          const pertama = t[0];
          return JSON.stringify({total:t.length, withResp, withRt, clicks, spaces, blocks,
            kolomCSV: Object.keys(pertama), contohBaris: pertama});
        })()
        """)
        log.append(("13. Statistik logger", stats))

        csv = cdp.js("currentLogger.toCSV()")
        log.append(("14. Baris CSV", len(csv.strip().split("\n"))))
        log.append(("15. Header CSV", csv.split("\n")[0]))
        for line in csv.split("\n")[1:4]:
            log.append(("16. Contoh baris", line))

        rep = cdp.js("currentLogger.buildReportText().slice(0, 700)")
        log.append(("17. Laporan sesi", rep.replace("\n", " | ")[:500]))
    except Exception as e:
        try:
            log.append((f"GAGAL ({type(e).__name__})", str(e)[:200]))
            log.append(("Status internal", str(cdp.js(
                "JSON.stringify({layar:document.querySelector('.screen.active').id,"
                "adaLogger:!!currentLogger, adaConfig:!!currentConfig})"))[:200]))
            log.append(("Isi layar", str(cdp.js("document.body.innerText.slice(0,300)"))[:300]))
        except Exception as e2:
            log.append(("dump gagal", str(e2)[:150]))
    finally:
        try:
            proc.terminate()
        except Exception:
            pass
        shutil.rmtree(profile, ignore_errors=True)

    print("\n".join(f"{k}: {v}" for k, v in log))


if __name__ == "__main__":
    main()
