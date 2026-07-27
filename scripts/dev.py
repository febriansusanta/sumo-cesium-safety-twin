from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import TextIO

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.platform import ROOT, venv_python


def load_dotenv() -> dict[str, str]:
    environment = os.environ.copy()
    path = ROOT / ".env"
    if not path.is_file():
        return environment
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        environment.setdefault(key.strip(), value.strip())
    return environment


def assert_port_available(host: str, port: int, label: str) -> None:
    with socket.socket() as probe:
        probe.settimeout(0.5)
        if probe.connect_ex((host, port)) == 0:
            raise SystemExit(f"{label} port {host}:{port} is already in use")


def stream(label: str, output: TextIO) -> None:
    for line in iter(output.readline, ""):
        print(f"[{label}] {line}", end="")


def terminate(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            capture_output=True,
        )
    else:
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    if not venv_python().is_file():
        raise SystemExit(
            "Project environment is missing. Run `python scripts/bootstrap.py` first."
        )
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        raise SystemExit("npm is missing")
    environment = load_dotenv()
    api_host = environment.get("API_HOST", "127.0.0.1")
    api_port = int(environment.get("API_PORT", "8000"))
    web_host = environment.get("WEB_HOST", "127.0.0.1")
    web_port = int(environment.get("WEB_PORT", "5173"))
    assert_port_available(api_host, api_port, "API")
    assert_port_available(web_host, web_port, "web")
    environment["PYTHONPATH"] = os.pathsep.join([str(ROOT / "api"), str(ROOT)])
    environment["VITE_API_PROXY"] = f"http://{api_host}:{api_port}"
    creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    processes = [
        subprocess.Popen(
            [
                str(venv_python()),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                api_host,
                "--port",
                str(api_port),
            ],
            cwd=ROOT / "api",
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags,
            start_new_session=os.name != "nt",
        ),
        subprocess.Popen(
            [npm, "run", "dev", "--", "--host", web_host, "--port", str(web_port)],
            cwd=ROOT / "web",
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags,
            start_new_session=os.name != "nt",
        ),
    ]
    labels = ("api", "web")
    threads: list[threading.Thread] = []
    for label, process in zip(labels, processes, strict=True):
        if process.stdout is None:
            continue
        thread = threading.Thread(
            target=stream, args=(label, process.stdout), daemon=True
        )
        thread.start()
        threads.append(thread)
    print(f"API: http://{api_host}:{api_port}/docs")
    print(f"Web: http://{web_host}:{web_port}")
    print("Press Ctrl+C to stop both processes.")
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping local services…")
    finally:
        for process in processes:
            terminate(process)
        for thread in threads:
            thread.join(timeout=1)
    return next((process.returncode for process in processes if process.returncode), 0)


if __name__ == "__main__":
    raise SystemExit(main())
