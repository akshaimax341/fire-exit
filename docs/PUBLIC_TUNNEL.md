# Public tunnels (local API → Wokwi / ESP32)

Cloud tools like **Wokwi** cannot call `http://localhost:8000`. Expose your local FastAPI with a public HTTPS URL, then POST to `/api/telemetry`.

---

## Option A — Cloudflare quick tunnel (recommended)

No Cloudflare account required for a temporary `*.trycloudflare.com` URL.

### 1. Install `cloudflared` (Windows)

```powershell
winget install Cloudflare.cloudflared
```

Close and reopen the terminal, then confirm:

```powershell
cloudflared --version
```

### 2. Start the FireExit backend locally

```powershell
cd D:\FIRE-EXIT\backend
.\.venv\Scripts\activate   # if you use a venv
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Or with Docker Compose (backend already on host port 8000):

```powershell
cd D:\FIRE-EXIT
docker compose up -d backend
```

Verify locally first:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

### 3. Start the Cloudflare tunnel

In a **second** PowerShell window:

```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```

Leave this window open. Look for a line like:

```text
https://random-words-xxxx.trycloudflare.com
```

That HTTPS URL is your public API base.

### 4. Point Wokwi / ESP32 at it

```cpp
#define API_BASE "https://random-words-xxxx.trycloudflare.com"
// POST to: API_BASE + "/api/telemetry"
```

### 5. Smoke-test the public URL

```powershell
$base = "https://YOUR-SUBDOMAIN.trycloudflare.com"

Invoke-RestMethod "$base/api/health"

Invoke-RestMethod -Method POST -Uri "$base/api/telemetry" `
  -ContentType "application/json" `
  -Body '{"deviceId":"WOKWI001","room":"Office 101","type":"ROOM","floor":1,"temperature":42,"humidity":35,"gasLevel":1300,"status":"WARNING","battery":88,"signal":-62}'
```

### Notes

- Keep **both** uvicorn and `cloudflared` running while Wokwi posts.
- The `trycloudflare.com` URL changes each time you restart the tunnel.
- Quick tunnels are for testing (not production).
- Docker alternative (no local install):

```powershell
docker run --rm -it cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:8000
```

---

## Option B — Ngrok in Docker

Host `ngrok.exe` is often blocked by antivirus. Run the official image instead.

### Quick start (local uvicorn on :8000)

1. Put your token in `.env`:

```env
NGROK_AUTHTOKEN=your_token_here
```

2. Start Docker Desktop, then:

```powershell
.\scripts\start-ngrok-docker.ps1
```

Or manually:

```powershell
$env:NGROK_AUTHTOKEN = "YOUR_TOKEN"
docker compose --profile tunnel-host up -d ngrok-host
```

3. Inspector: http://localhost:4040  
4. ESP32 / Wokwi base URL = the `https://….ngrok-free.app` shown there  
5. POST path: `/api/telemetry`

### Full compose stack (backend in Docker)

```powershell
$env:NGROK_AUTHTOKEN = "YOUR_TOKEN"
docker compose --profile tunnel up -d backend ngrok
```

### Stop

```powershell
docker compose --profile tunnel-host stop ngrok-host
# or
docker compose --profile tunnel stop ngrok
```

---

## Option C — Railway (no local tunnel)

Deploy the backend to Railway and set:

```cpp
#define API_BASE "https://YOUR-RAILWAY-DOMAIN.up.railway.app"
```

See [DEPLOYMENT.md — Railway](DEPLOYMENT.md#railway-backend).
