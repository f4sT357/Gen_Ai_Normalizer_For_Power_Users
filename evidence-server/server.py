from __future__ import annotations

import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = os.getenv("GANFPU_EVIDENCE_HOST", "127.0.0.1")
PORT = int(os.getenv("GANFPU_EVIDENCE_PORT", "8787"))


def search_web(query: str, limit: int) -> tuple[list[dict], list[str]]:
    command = ["webserp", query, "--max-results", str(limit)]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except FileNotFoundError:
        return [], ["webserp executable was not found. Install the webserp package first."]
    except subprocess.TimeoutExpired:
        return [], ["webserp search timed out."]

    if completed.returncode != 0:
        message = completed.stderr.strip() or f"webserp exited with code {completed.returncode}."
        return [], [message]

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return [], ["webserp returned invalid JSON."]

    results = []
    for item in payload.get("results", []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        snippet = str(item.get("content") or item.get("snippet") or "").strip()
        source = str(item.get("engine") or "").strip()
        if not (title or url or snippet):
            continue
        results.append({"title": title, "url": url, "snippet": snippet, "source": source})

    return results, list(payload.get("unresponsive_engines") or [])


class EvidenceHandler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/evidence/search":
            self._json(404, {"results": [], "errors": ["Not found."]})
            return

        params = parse_qs(parsed.query)
        query = (params.get("q") or [""])[0].strip()
        try:
            limit = max(1, min(20, int((params.get("limit") or ["8"])[0])))
        except ValueError:
            limit = 8

        if not query:
            self._json(400, {"results": [], "errors": ["Query is required."]})
            return

        results, errors = search_web(query, limit)
        self._json(200, {"results": results, "errors": errors})

    def log_message(self, format: str, *args) -> None:
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), EvidenceHandler)
    print(f"GANFPU Evidence Server listening on http://{HOST}:{PORT}")
    server.serve_forever()
