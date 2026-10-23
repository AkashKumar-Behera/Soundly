#!/usr/bin/env python3
"""Soundly laptop agent.

Runs on your own computer and keeps ONE outbound WebSocket open to the Soundly Worker (nothing here is exposed to
the internet). The moment a request becomes claimable the Worker pushes a "wake" message, and the agent does:

    claim the oldest queued request -> download with yt-dlp -> mp3 + cover -> upload to R2 -> complete

There is no polling while the push connection is up (only a slow safety check every few minutes). If the push
channel is unavailable the agent falls back to polling every few seconds, so it never gets stuck.

It only claims work while the laptop is on your home Wi-Fi. If the laptop was off, requests simply wait in the
queue and the agent drains them as soon as it starts.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import shutil
import subprocess
import tempfile
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

import requests
import yt_dlp

try:
    import websocket  # websocket-client
except ImportError:  # push is optional; polling still works
    websocket = None

VERSION = '0.4.0'
HERE = Path(__file__).resolve().parent
log = logging.getLogger('soundly-agent')

# yt-dlp messages that mean another attempt cannot succeed.
FATAL_HINTS = (
    'video unavailable', 'video is unavailable', 'private video', 'this video has been removed', 'is not available', 'members-only',
    'sign in to confirm your age', 'copyright', 'account associated with this video has been terminated',
    'premieres in', 'live event will begin',
)
THUMB_EXTS = {'.webp', '.jpg', '.jpeg', '.png'}


class JobError(Exception):
    def __init__(self, message: str, fatal: bool = False):
        super().__init__(message)
        self.fatal = fatal


# ---------------------------------------------------------------- config


def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding='utf-8'))
    base = path.parent
    cfg.setdefault('poll_seconds', 15)  # used only while the push connection is down
    cfg.setdefault('safety_poll_seconds', 300)  # slow safety net while push is up
    cfg.setdefault('use_push', True)
    cfg.setdefault('heartbeat_seconds', 30)
    cfg.setdefault('max_duration_sec', 1200)
    cfg.setdefault('home_ssids', [])
    cfg.setdefault('allow_ethernet', False)
    cfg.setdefault('agent_id', 'laptop')
    cfg['api_url'] = cfg['api_url'].rstrip('/')

    token_file = (base / cfg['token_file']).resolve()
    raw = token_file.read_text(encoding='utf-8').strip()
    # Accepts a bare token (api/.prod-agent-token) or a KEY=VALUE line (api/.dev.vars).
    match = re.search(r'^AGENT_TOKEN=(.+)$', raw, re.M)
    cfg['token'] = (match.group(1) if match else raw).strip()
    if not cfg['token']:
        raise SystemExit(f'No agent token found in {token_file}')

    ffmpeg = Path(cfg.get('ffmpeg', 'ffmpeg'))
    cfg['ffmpeg'] = str((base / ffmpeg).resolve()) if not ffmpeg.is_absolute() and (base / ffmpeg).exists() else str(ffmpeg)
    return cfg


# ---------------------------------------------------------------- network location


def current_ssid() -> str | None:
    """Wi-Fi network name on Windows, or None when not on Wi-Fi."""
    try:
        out = subprocess.run(['netsh', 'wlan', 'show', 'interfaces'], capture_output=True, text=True, timeout=8, errors='replace').stdout
    except (OSError, subprocess.SubprocessError):
        return None
    # `BSSID` lines also contain "SSID", so anchor to the start of the line.
    m = re.search(r'^\s*SSID\s*:\s*(.+?)\s*$', out, re.M)
    return m.group(1) if m else None


def on_home_network(cfg: dict) -> bool:
    ssid = current_ssid()
    if ssid is None:
        return bool(cfg['allow_ethernet'])
    return not cfg['home_ssids'] or ssid in cfg['home_ssids']


# ---------------------------------------------------------------- progress reporting


class ProgressFile:
    """File-like request body that reports how many bytes have been sent (requests streams it with a known length)."""

    def __init__(self, path: Path, on_progress=None):
        self._fh = path.open('rb')
        self._size = path.stat().st_size
        self._sent = 0
        self._cb = on_progress
        self._start = time.time()

    def __len__(self) -> int:
        return self._size

    def read(self, n: int = -1) -> bytes:
        chunk = self._fh.read(n)
        if chunk:
            self._sent += len(chunk)
            if self._cb:
                self._cb(self._sent, self._size, time.time() - self._start)
        return chunk

    def __iter__(self):
        return iter(lambda: self.read(65536), b'')

    def close(self) -> None:
        self._fh.close()


class Reporter:
    """Sends live progress of one job to the server, at most every 1.5 s (always on a stage change)."""

    MIN_GAP = 1.5

    def __init__(self, api: 'Api', job_id: str):
        self.api, self.job_id = api, job_id
        self.last = 0.0
        self.stage = ''

    def send(self, stage: str, overall: float, eta: float | None = None, speed: float | None = None, force: bool = False) -> None:
        now = time.time()
        if not force and stage == self.stage and now - self.last < self.MIN_GAP:
            return
        self.stage, self.last = stage, now
        try:
            self.api.progress(self.job_id, stage, max(0.0, min(1.0, overall)), eta, speed)
        except requests.RequestException:
            pass  # progress is cosmetic; never let it fail a download


# ---------------------------------------------------------------- API client


class Api:
    def __init__(self, cfg: dict):
        self.base = cfg['api_url']
        self.http = requests.Session()
        self.http.headers['Authorization'] = f"Bearer {cfg['token']}"

    def _post(self, path: str, body: dict | None = None, timeout: int = 20) -> dict:
        r = self.http.post(f'{self.base}{path}', json=body or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()

    def heartbeat(self, agent_id: str, on_home: bool, job_id: str | None) -> None:
        self._post('/agent/heartbeat', {'agentId': agent_id, 'onHomeWifi': on_home, 'version': VERSION, 'currentJobId': job_id})

    def claim(self) -> dict | None:
        return self._post('/agent/claim').get('job')

    def uploading(self, job_id: str) -> None:
        self._post(f'/agent/jobs/{job_id}/uploading')

    def upload(self, key: str, path: Path, content_type: str, on_progress=None) -> None:
        body = ProgressFile(path, on_progress)
        try:
            r = self.http.put(f'{self.base}/agent/upload', params={'key': key}, data=body, headers={'Content-Type': content_type}, timeout=600)
        finally:
            body.close()
        r.raise_for_status()

    def songs(self) -> list[dict]:
        r = self.http.get(f'{self.base}/agent/songs', timeout=30)
        r.raise_for_status()
        return r.json()['songs']

    def progress(self, job_id: str, stage: str, progress: float, eta: float | None, speed: float | None) -> None:
        self._post(f'/agent/jobs/{job_id}/progress', {'stage': stage, 'progress': progress, 'etaSec': eta, 'speedBps': speed}, timeout=8)

    def complete(self, job_id: str, payload: dict) -> dict:
        return self._post(f'/agent/jobs/{job_id}/complete', payload, timeout=30)

    def fail(self, job_id: str, error: str, fatal: bool) -> None:
        self._post(f'/agent/jobs/{job_id}/fail', {'error': error, 'fatal': fatal})


# ---------------------------------------------------------------- download pipeline

_NOISE = re.compile(r'\s*[\(\[](?:official|lyrics?|audio|video|music video|visuali[sz]er|hd|hq|4k|remaster(?:ed)?)[^\)\]]*[\)\]]', re.I)


def clean_title(title: str) -> str:
    return _NOISE.sub('', title).strip(' -|') or title


def pick_artist(info: dict) -> str:
    artist = info.get('artist') or info.get('creator') or info.get('channel') or info.get('uploader') or 'Unknown Artist'
    return re.sub(r'\s*-\s*Topic$', '', str(artist)).split(',')[0].strip() or 'Unknown Artist'


def make_cover(ffmpeg: str, source: Path, dest: Path) -> bool:
    # Square, centred crop (YouTube Music thumbnails are 16:9 with the cover in the middle), up to 720px, high quality.
    vf = "crop='min(iw,ih)':'min(iw,ih)',scale='min(720,iw)':-2"
    cmd = [ffmpeg, '-y', '-loglevel', 'error', '-i', str(source), '-vf', vf, '-quality', '92', str(dest)]
    try:
        return subprocess.run(cmd, timeout=60).returncode == 0 and dest.exists()
    except (OSError, subprocess.SubprocessError):
        return False


def download(cfg: dict, job: dict, workdir: Path, rep: Reporter | None = None) -> tuple[dict, Path, Path | None]:
    # Overall bar: download 0-65%, MP3 conversion 65-75%, upload 75-97%, saving to 100%.
    def on_download(d: dict) -> None:
        if rep is None:
            return
        if d.get('status') == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            frac = (d.get('downloaded_bytes') or 0) / total if total else 0.0
            rep.send('downloading', 0.02 + 0.63 * frac, d.get('eta'), d.get('speed'))
        elif d.get('status') == 'finished':
            rep.send('downloading', 0.65, 0, None, force=True)

    def on_convert(d: dict) -> None:
        if rep is not None and d.get('status') == 'started':
            rep.send('converting', 0.70, None, None, force=True)

    opts = {
        'progress_hooks': [on_download],
        'postprocessor_hooks': [on_convert],
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
        'noplaylist': True,
        'format': 'bestaudio/best',
        'outtmpl': str(workdir / '%(id)s.%(ext)s'),
        'ffmpeg_location': cfg['ffmpeg'],
        'writethumbnail': True,
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(job['url'], download=False)
            if info.get('is_live'):
                raise JobError('live streams cannot be downloaded', fatal=True)
            duration = info.get('duration') or 0
            if duration > cfg['max_duration_sec']:
                raise JobError(f'too long ({duration // 60} min, limit {cfg["max_duration_sec"] // 60})', fatal=True)
            ydl.process_ie_result(info, download=True)
    except JobError:
        raise
    except yt_dlp.utils.DownloadError as e:
        message = re.sub(r'\x1b\[[0-9;]*m', '', str(e))
        raise JobError(message[:280], fatal=any(h in message.lower() for h in FATAL_HINTS)) from e

    mp3 = next(iter(sorted(workdir.glob('*.mp3'))), None)
    if mp3 is None:
        raise JobError('mp3 was not produced', fatal=False)
    thumb = next((p for p in sorted(workdir.iterdir()) if p.suffix.lower() in THUMB_EXTS), None)
    return info, mp3, thumb


def process_job(api: Api, cfg: dict, job: dict) -> None:
    vid = job['youtubeId']
    log.info('job %s: %s (%s)', job['id'][:8], job['title'], vid)
    workdir = Path(tempfile.mkdtemp(prefix='soundly_'))
    rep = Reporter(api, job['id'])
    rep.send('starting', 0.01, force=True)
    try:
        info, mp3, thumb = download(cfg, job, workdir, rep)
        api.uploading(job['id'])
        rep.send('uploading', 0.75, None, None, force=True)

        def on_upload(sent: int, size: int, elapsed: float) -> None:
            speed = sent / elapsed if elapsed > 0 else None
            eta = (size - sent) / speed if speed else None
            rep.send('uploading', 0.75 + 0.22 * (sent / size if size else 1), eta, speed)

        song_key = f'songs/{vid}.mp3'
        api.upload(song_key, mp3, 'audio/mpeg', on_upload)

        thumb_key = None
        if thumb is not None:
            cover = workdir / 'cover.webp'
            if make_cover(cfg['ffmpeg'], thumb, cover):
                thumb_key = f'thumbs/{vid}.webp'
                api.upload(thumb_key, cover, 'image/webp')
        rep.send('saving', 0.98, None, None, force=True)

        result = api.complete(
            job['id'],
            {
                'title': (info.get('track') or clean_title(info.get('title') or job['title']))[:200],
                'artist': pick_artist(info),
                'album': info.get('album') or '',
                'durationSec': int(info.get('duration') or job.get('durationSec') or 0) or None,
                'r2Key': song_key,
                'thumbKey': thumb_key,
                'sizeBytes': mp3.stat().st_size,
                'bitrateKbps': 192,
            },
        )
        log.info('job %s done -> song %s (%.1f MB%s)', job['id'][:8], result.get('songId'), mp3.stat().st_size / 1e6, ', cover' if thumb_key else '')
    finally:
        for p in workdir.glob('*'):
            p.unlink(missing_ok=True)
        workdir.rmdir()


# ---------------------------------------------------------------- main loop


class State:
    def __init__(self) -> None:
        self.job_id: str | None = None
        self.on_home = False
        self.push_connected = False


def ws_url(cfg: dict) -> str:
    base = cfg['api_url']
    return ('wss://' if base.startswith('https://') else 'ws://') + base.split('://', 1)[1] + '/agent/ws'


class Push(threading.Thread):
    """Outbound WebSocket to the Worker. Sets `wake` whenever the server says a job is waiting."""

    def __init__(self, cfg: dict, state: State, wake: threading.Event, stop: threading.Event):
        super().__init__(daemon=True)
        self.cfg, self.state, self.wake, self.stop = cfg, state, wake, stop
        self.app = None

    def status_message(self, kind: str) -> str:
        return json.dumps({'type': kind, 'agentId': self.cfg['agent_id'], 'version': VERSION, 'onHomeWifi': self.state.on_home, 'jobId': self.state.job_id})

    def run(self) -> None:
        delay = 2
        while not self.stop.is_set():
            connected_at = 0.0

            def on_open(app):
                nonlocal connected_at
                connected_at = time.time()
                self.state.push_connected = True
                app.send(self.status_message('hello'))
                log.info('push channel connected')
                threading.Thread(target=self._ticker, args=(app,), daemon=True).start()
                self.wake.set()  # drain anything that queued while we were away

            def on_message(_app, message):
                try:
                    if json.loads(message).get('type') == 'wake':
                        self.wake.set()
                except ValueError:
                    pass

            def on_error(_app, error):
                log.warning('push channel error: %s', error)

            self.app = websocket.WebSocketApp(
                ws_url(self.cfg),
                header=[f"Authorization: Bearer {self.cfg['token']}"],
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
            )
            self.app.run_forever(ping_interval=20, ping_timeout=10)
            self.state.push_connected = False
            if self.stop.is_set():
                break
            # Stay connected for a while? then retry quickly; failing right away? back off.
            delay = 2 if time.time() - connected_at > 60 else min(delay * 2, 60)
            log.info('push channel closed, reconnecting in %ss (polling meanwhile)', delay)
            self.stop.wait(delay)

    def _ticker(self, app) -> None:
        """Tells the server how we are doing (home wifi, current job). Also keeps NAT/proxies from dropping us."""
        while not self.stop.is_set() and app is self.app and self.state.push_connected:
            if self.stop.wait(25):
                break
            try:
                app.send(self.status_message('status'))
            except Exception:  # noqa: BLE001 - connection is gone; run() reconnects
                break

    def close(self) -> None:
        if self.app is not None:
            self.app.close()


def heartbeat_loop(api: Api, cfg: dict, state: State, stop: threading.Event) -> None:
    while not stop.is_set():
        if not state.push_connected:  # while the push channel is up it reports our status itself
            try:
                api.heartbeat(cfg['agent_id'], state.on_home, state.job_id)
            except requests.RequestException as e:
                log.warning('heartbeat failed: %s', e)
        stop.wait(cfg['heartbeat_seconds'])


def run(cfg: dict, once: bool) -> None:
    api = Api(cfg)
    state = State()
    stop = threading.Event()
    wake = threading.Event()
    state.on_home = on_home_network(cfg)  # so the first status report is already correct
    threading.Thread(target=heartbeat_loop, args=(api, cfg, state, stop), daemon=True).start()
    push: Push | None = None
    if cfg['use_push'] and websocket is not None:
        push = Push(cfg, state, wake, stop)
        push.start()
    elif cfg['use_push']:
        log.warning('websocket-client is not installed (pip install websocket-client); polling instead')
    log.info('agent %s started, API %s, home networks: %s, mode: %s', VERSION, cfg['api_url'], cfg['home_ssids'] or 'any', 'push' if push else 'polling')

    def idle(seconds: float) -> None:
        """Sleep until the server wakes us, or `seconds` pass (a safety net), whichever is first."""
        wake.wait(seconds)
        wake.clear()

    was_home: bool | None = None
    backoff = cfg['poll_seconds']
    try:
        while not stop.is_set():
            state.on_home = on_home_network(cfg)
            if state.on_home != was_home:
                log.info('network: %s (%s)', 'home, working' if state.on_home else 'not home, paused', current_ssid() or 'no wifi')
                was_home = state.on_home
            if not state.on_home:
                idle(cfg['poll_seconds'])  # re-check the network every few seconds, push or not
                continue

            try:
                job = api.claim()
                backoff = cfg['poll_seconds']
            except requests.RequestException as e:
                backoff = min(backoff * 2, 300)
                log.warning('cannot reach API (%s), retrying in %ss', e, backoff)
                stop.wait(backoff)
                continue

            if job is None:
                if once:
                    log.info('queue is empty')
                    return
                # Queue drained: wait for a push (or the slow safety check; fast polling only without push).
                idle(cfg['safety_poll_seconds'] if state.push_connected else cfg['poll_seconds'])
                continue

            state.job_id = job['id']
            try:
                process_job(api, cfg, job)
            except JobError as e:
                log.error('job %s failed%s: %s', job['id'][:8], ' (fatal)' if e.fatal else ' (will retry)', e)
                _report_failure(api, job['id'], str(e), e.fatal)
            except requests.RequestException as e:
                log.error('job %s upload/API error: %s', job['id'][:8], e)
                _report_failure(api, job['id'], f'network: {e}'[:280], False)
            except KeyboardInterrupt:
                _report_failure(api, job['id'], 'agent stopped', False)
                raise
            except Exception as e:  # noqa: BLE001 - one bad job must not kill the agent
                log.exception('job %s crashed', job['id'][:8])
                _report_failure(api, job['id'], f'agent error: {e}'[:280], False)
            finally:
                state.job_id = None
            if once:
                return
    except KeyboardInterrupt:
        log.info('stopping')
    finally:
        stop.set()
        if push is not None:
            push.close()


def _report_failure(api: Api, job_id: str, message: str, fatal: bool) -> None:
    try:
        api.fail(job_id, message, fatal)
    except requests.RequestException as e:
        log.warning('could not report failure for %s: %s', job_id[:8], e)


def refresh_covers(cfg: dict) -> None:
    """Re-fetches every library cover in the new square, high-quality format and overwrites it in R2 (same keys)."""
    api = Api(cfg)
    songs = api.songs()
    log.info('refreshing %d covers', len(songs))
    for n, song in enumerate(songs, 1):
        workdir = Path(tempfile.mkdtemp(prefix='soundly_cover_'))
        try:
            opts = {
                'quiet': True, 'no_warnings': True, 'noplaylist': True, 'skip_download': True, 'writethumbnail': True,
                'outtmpl': str(workdir / '%(id)s.%(ext)s'), 'ffmpeg_location': cfg['ffmpeg'],
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={song['youtubeId']}"])
            thumb = next((p for p in sorted(workdir.iterdir()) if p.suffix.lower() in THUMB_EXTS), None)
            cover = workdir / 'cover.webp'
            if thumb is not None and make_cover(cfg['ffmpeg'], thumb, cover):
                api.upload(song['thumbKey'], cover, 'image/webp')
                log.info('[%d/%d] %s', n, len(songs), song['title'])
            else:
                log.warning('[%d/%d] no cover for %s', n, len(songs), song['title'])
        except Exception as e:  # one bad video must not stop the rest
            log.warning('[%d/%d] %s failed: %s', n, len(songs), song['title'], e)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
    log.info('covers done')


def main() -> None:
    parser = argparse.ArgumentParser(description='Soundly laptop agent')
    parser.add_argument('--config', default=str(HERE / 'config.json'))
    parser.add_argument('--once', action='store_true', help='process at most one job, then exit')
    parser.add_argument('--refresh-covers', action='store_true', help='re-fetch all library covers in square high quality, then exit')
    args = parser.parse_args()

    cfg = load_config(Path(args.config))
    handlers: list[logging.Handler] = [logging.StreamHandler(), RotatingFileHandler(HERE / 'agent.log', maxBytes=1_000_000, backupCount=2, encoding='utf-8')]
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', handlers=handlers)
    if args.refresh_covers:
        refresh_covers(cfg)
        return
    run(cfg, args.once)


if __name__ == '__main__':
    main()
