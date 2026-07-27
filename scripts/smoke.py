from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.config import get_settings
from app.models.scenario import DemandConfig, ScenarioConfig
from app.services.network_service import build_network
from app.services.simulation_service import execute_run
from scripts.platform import ROOT, venv_python


def wait_for(url: str, timeout: float = 20) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"timed out waiting for {url}")


def terminate(process: subprocess.Popen[bytes]) -> None:
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


def assert_port(port: int) -> None:
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            raise RuntimeError(f"smoke-test port {port} is already in use")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="sumo-cesium-smoke-") as temporary:
        work = Path(temporary)
        settings = get_settings().model_copy(update={"data_dir": work})
        fixture = ROOT / "tests/fixtures/tiny-network.osm.xml"
        network = build_network(settings, fixture).network_path
        scenario = ScenarioConfig(
            duration=30,
            demand=DemandConfig(period=5, departure_end=20, minimum_distance=10),
        )
        summary = execute_run(work / "run", network, scenario)
        trajectories = work / "run/trajectories.json"
        if summary.routed_vehicle_count < 1 or not trajectories.is_file():
            raise RuntimeError("fixture simulation did not produce a valid result")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        raise RuntimeError("npm is unavailable")
    subprocess.run([npm, "run", "build"], cwd=ROOT / "web", check=True)
    api_port, web_port = 8099, 5199
    assert_port(api_port)
    assert_port(web_port)
    environment = os.environ.copy()
    environment["PYTHONPATH"] = os.pathsep.join([str(ROOT / "api"), str(ROOT)])
    environment["VITE_API_PROXY"] = f"http://127.0.0.1:{api_port}"
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    processes = [
        subprocess.Popen(
            [
                str(venv_python()),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(api_port),
            ],
            cwd=ROOT / "api",
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            start_new_session=os.name != "nt",
        ),
        subprocess.Popen(
            [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", str(web_port)],
            cwd=ROOT / "web",
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            start_new_session=os.name != "nt",
        ),
    ]
    try:
        wait_for(f"http://127.0.0.1:{api_port}/api/health")
        wait_for(f"http://127.0.0.1:{web_port}")
        wait_for(f"http://127.0.0.1:{web_port}/api/health")
    finally:
        for process in processes:
            terminate(process)
    print(
        f"Smoke passed: {summary.routed_vehicle_count} routed fixture vehicles, "
        "API and web health ready."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
