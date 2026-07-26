# Ngrok in Docker (recommended on Windows)

Host `ngrok.exe` is often blocked by antivirus. Run the official image instead.

## Quick start (local uvicorn on :8000)

1. Put your token in `.env` (copy from `.env.example`):

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

3. Open the inspector: http://localhost:4040  
4. ESP32 base URL = the `https://….ngrok-free.app` shown there  
5. POST path: `/api/telemetry`

## Full compose stack (backend in Docker)

```powershell
$env:NGROK_AUTHTOKEN = "YOUR_TOKEN"
docker compose --profile tunnel up -d backend ngrok
```

## Stop

```powershell
docker compose --profile tunnel-host stop ngrok-host
# or
docker compose --profile tunnel stop ngrok
```
