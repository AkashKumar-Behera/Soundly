# Soundly laptop agent

Runs on your own computer and does the heavy lifting for song requests. It keeps **one outbound WebSocket** open to the
Soundly Worker (a Durable Object), so nothing on your laptop is exposed and there is no tunnel to run. The moment a
request becomes claimable the Worker pushes a "wake" message, and the agent processes the queue:

```
wake (push) -> claim the oldest queued request -> yt-dlp download -> mp3 (192 kbps) + cover (webp)
            -> upload to Cloudflare R2 through the API -> song appears in everyone's library
```

- **No polling** while the push connection is up, only a slow safety check every 5 minutes (`safety_poll_seconds`).
  If the connection drops, the agent reconnects with backoff and polls every `poll_seconds` meanwhile, so it never
  gets stuck. `"use_push": false` forces plain polling.
- The agent reports its status (home Wi-Fi, current job) over the same connection, which is what the admin sees.

- **Home Wi-Fi only.** It claims work only while the laptop is on a Wi-Fi network listed in `home_ssids`. Elsewhere it
  keeps sending heartbeats (so the admin sees "paused, not home") and leaves the queue alone.
- **Laptop off?** Requests wait in the queue and are picked up next time the agent starts.
- **Failures.** A transient error (network, upload) requeues the job, up to 3 attempts. Permanent ones (private or
  removed video, live stream, longer than `max_duration_sec`) fail immediately with the reason, and an admin can retry.
- **Safety.** Stuck jobs are released by the server after 30 minutes. A job in progress is requeued if you stop the agent.

## Setup (Windows)

```powershell
cd "C:\Development\Spotify clone\agent"
pip install -r requirements.txt
copy config.example.json config.json     # then edit it
```

`config.json` (gitignored):

| Key | Meaning |
|---|---|
| `api_url` | the API, e.g. `https://soundly-api.<you>.workers.dev/api` |
| `token_file` | file holding the agent token (`../api/.prod-agent-token`); a bare token or an `AGENT_TOKEN=` line |
| `home_ssids` | Wi-Fi names that count as home (empty list = anywhere) |
| `allow_ethernet` | treat a wired connection as home |
| `ffmpeg` | path to `ffmpeg` (needs libmp3lame and libwebp) |
| `max_duration_sec` | skip anything longer (default 1200) |
| `use_push` | use the WebSocket push channel (default true) |
| `safety_poll_seconds` | slow safety check while push is up (default 300) |

Check your current Wi-Fi name with `netsh wlan show interfaces`.

## Run

```powershell
python agent.py                  # run until Ctrl+C
python agent.py --once           # handle at most one job, then exit
python agent.py --config config.local.json   # against a local `wrangler dev` API
```

Logs go to the console and `agent.log` (rotated).

## Start automatically at login

`install-startup.ps1` registers a Windows scheduled task that starts the agent when you sign in (and `-Remove`
unregisters it). It changes your system's task list, so read it first and run it yourself:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```

## YouTube search

Searching YouTube from the app does **not** need this agent: the Worker calls the YouTube Data API (key stored as the
`YOUTUBE_API_KEY` secret), so people can search and queue songs even when the laptop is off.
