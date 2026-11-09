import json, subprocess, tempfile, time, urllib.request, websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
prof = tempfile.mkdtemp()
p = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9337",
                      f"--user-data-dir={prof}", "--no-first-run", "--disable-gpu",
                      "--remote-allow-origins=*", "http://127.0.0.1:8080/index.html"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(4)
tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9337/json"))
page = [t for t in tabs if "127.0.0.1:8080" in t.get("url", "")][0]
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30)
i = [0]


def ev(expr, awaitp=False):
    i[0] += 1
    ws.send(json.dumps({"id": i[0], "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True, "awaitPromise": awaitp}}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == i[0]:
            res = r.get("result", {})
            if res.get("exceptionDetails"):
                d = res["exceptionDetails"]
                return "EXC: " + str(d.get("exception", {}).get("description"))[:400]
            return res.get("result", {}).get("value")


# Tangkap semua error console & exception di halaman
ws.send(json.dumps({"id": 900, "method": "Runtime.enable", "params": {}}))
ws.send(json.dumps({"id": 901, "method": "Log.enable", "params": {}}))

errors = []
ws.settimeout(1.0)

setup = """
document.getElementById('participant-name').value='Siti Uji';
document.getElementById('researcher-name').value='Mutiah Arinil';
document.getElementById('n-levels').value='1,2,3';
document.getElementById('block-duration').value='1';
document.getElementById('isi').value='500';
document.getElementById('stim-duration').value='200';
document.getElementById('enable-practice').checked=false;
document.getElementById('source-form-url').value='https://forms.gle/contoh';
'diisi';
"""
print("1) isi form:", ev(setup))
print("2) panggil handleStartExperiment (async):", ev("handleStartExperiment().then(()=> 'selesai').catch(e=>'ERR: '+e.message)", awaitp=True))
time.sleep(1)
print("3) layar aktif:", ev("document.querySelector('.screen.active').id"))
print("4) currentConfig ada?", ev("!!currentConfig"), "| errors dari validasi:", ev("(typeof validateConfig==='function') ? JSON.stringify(validateConfig(readConfigFromForm())) : 'no fn'"))
print("5) instruction body:", str(ev("document.getElementById('instructions-body').innerText"))[:200])
print("6) tips body:", str(ev("document.getElementById('tips-body').innerText"))[:200])
print("7) grid preview di instruksi:", ev("!!document.querySelector('#instructions-body .grid-3x3')"))
print("8) error console:", errors)
p.terminate()
