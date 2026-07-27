# macOS

Install Python 3.12 or 3.13 and Node.js 22 or newer from supported upstream installers.
Install Eclipse SUMO using its current official macOS instructions, then verify it rather
than assuming a Homebrew prefix.

```bash
python3 scripts/doctor.py
python3 scripts/bootstrap.py
python3 scripts/dev.py
```

If SUMO is not in PATH, set `SUMO_HOME` and the tool overrides in `.env`. The application
does not require SUMO-GUI, XQuartz, Docker or Cesium ion. libsumo wheel availability can
vary by macOS/Python combination; the doctor reports the selected fallback mode.

