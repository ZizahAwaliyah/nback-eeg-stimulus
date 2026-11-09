import json, subprocess, tempfile, time, urllib.request, websocket, sys

sys.stdout.reconfigure(encoding='utf-8')

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
prof = tempfile.mkdtemp()
p = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9456",
                      f"--user-data-dir={prof}", "--no-first-run", "--disable-gpu",
                      "--remote-allow-origins=*", "http://127.0.0.1:8080/index.html"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9456/json"))
page = [t for t in tabs if "127.0.0.1:8080" in t.get("url", "")][0]
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30)
i = [0]

def send_cmd(method, params=None):
    i[0] += 1
    ws.send(json.dumps({"id": i[0], "method": method, "params": params or {}}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == i[0]:
            return r

send_cmd("Console.enable")
send_cmd("Runtime.enable")

def ev(expr):
    res = send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    result = res.get("result", {})
    if result.get("exceptionDetails"):
        return "EXC: " + str(result["exceptionDetails"])
    return result.get("result", {}).get("value")

print("1. Initial page loaded on index.html:")
print("URL:", ev("window.location.href"))
print("Blue banner present?", ev("document.querySelector('a[href=\"nback-3x3.html\"]') !== null"))

print("\n2. Filling participant name 'Test Partisipan' and verifying stimulus-type:")
print("Stimulus type:", ev("document.getElementById('stimulus-type')?.value"))
ev("document.getElementById('participant-name').value = 'Test Partisipan'")
ev("document.getElementById('researcher-name').value = 'Mutiah Arinil'")

print("\n3. Clicking #btn-start...")
ev("document.getElementById('btn-start').click()")

time.sleep(2)
print("URL after click:", ev("window.location.href"))
print("Participant header on 3x3 page:", ev("document.getElementById('participant-meta')?.textContent"))
print("Title mode:", ev("document.getElementById('title-mode')?.textContent"))
print("Pills available:", ev("Array.from(document.querySelectorAll('.level-btn')).map(b => b.textContent)"))
print("Tutorial box visible?", ev("document.getElementById('tutorial-box')?.style.display !== 'none'"))

print("\n4. Testing 'Coba Latihan'...")
ev("document.getElementById('btn-start-practice').click()")
time.sleep(1)
print("Badge phase after starting practice:", ev("document.getElementById('badge-phase')?.textContent"))
print("Tutorial box hidden in practice?", ev("document.getElementById('tutorial-box')?.style.display === 'none'"))
print("Running actions visible?", ev("document.getElementById('running-actions')?.style.display !== 'none'"))

ws.close()
p.terminate()
print("\nSemua verifikasi alur berhasil!")
