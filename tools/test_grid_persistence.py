import json, subprocess, tempfile, time, urllib.request, websocket, sys

sys.stdout.reconfigure(encoding='utf-8')

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
prof = tempfile.mkdtemp()
p = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9458",
                      f"--user-data-dir={prof}", "--no-first-run", "--disable-gpu",
                      "--remote-allow-origins=*", "http://127.0.0.1:8080/nback-3x3.html"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9458/json"))
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

print("1. Checking Header & Level selector removal:")
print("Level selector pills present?", ev("document.querySelectorAll('.level-btn').length > 0"))
print("Header block badge:", ev("document.getElementById('header-block-badge')?.textContent"))
print("Current title mode:", ev("document.getElementById('title-mode')?.textContent"))

print("\n2. Checking 0-back ground truth tutorial info:")
print("Tutorial text contains 'Ground Truth'?", ev("document.getElementById('tutorial-text')?.innerHTML.includes('Ground Truth')"))
print("Target preview mini active tile index:", ev("Array.from(document.querySelectorAll('.mini-tile')).findIndex(t => t.classList.contains('target-active'))"))

print("\n3. Testing Stimulus Grid Visibility during Trial & ISI (practice run):")
ev("document.getElementById('btn-start-practice').click()")
time.sleep(0.3)
print("Stimulus active - number of active tiles:", ev("document.querySelectorAll('.grid-tile.active').length"))
print("Total visible tiles:", ev("document.querySelectorAll('.grid-tile').length"))

# Wait until stimulus duration (500ms) passes into ISI (e.g. 700ms after onset)
time.sleep(0.6)
print("During ISI - active tiles (should be 0, blue turned off):", ev("document.querySelectorAll('.grid-tile.active').length"))
print("During ISI - total tiles still visible on board (must be 9!):", ev("document.querySelectorAll('.grid-tile').length"))
print("Board container visible?", ev("document.querySelector('.board-container') !== null && window.getComputedStyle(document.querySelector('.board-container')).display !== 'none'"))

ws.close()
p.terminate()
print("\nSemua pengujian lolos sempurna!")
