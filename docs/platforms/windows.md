# Windows 11

## Tested environment

- Windows 11 build 26200, x64
- Python 3.13.7 at `C:\Python313\python.exe`
- Node.js 22.20.0 and npm 10.9.3
- Git 2.50.1
- Project-local Eclipse SUMO 1.27.1 fallback

Install Python 3.12 or 3.13 and Node.js 22 or newer using their official installers. The
project does not require WSL, Docker, administrator access after installation, or a global
Python package install.

Run:

```powershell
python .\scripts\doctor.py
python .\scripts\bootstrap.py
python .\scripts\dev.py
```

The initial doctor run may report SUMO as missing. Bootstrap installs the pinned SUMO and
libsumo wheels into `.venv` without changing PATH or `SUMO_HOME`. Alternatively, install
the official Eclipse SUMO Windows package and set `SUMO_HOME` for that PowerShell session.

If execution policy blocks npm's PowerShell shim, scripts use `npm.cmd` automatically.
Paths are passed as subprocess argument arrays, so spaces and backslashes are supported.

