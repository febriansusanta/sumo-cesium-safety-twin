# Linux

Install Python 3.12 or 3.13, Node.js 22 or newer, npm, Git and Eclipse SUMO using the
supported mechanism for your distribution. On Debian-based systems, verify the installed
SUMO release is compatible with the project before running the pipeline.

```bash
python3 scripts/doctor.py
python3 scripts/bootstrap.py
python3 scripts/dev.py
```

Set `SUMO_HOME`, `SUMO_BINARY`, `NETCONVERT_BINARY`, `DUAROUTER_BINARY` or
`SUMO_TOOLS_DIR` in `.env` when tools are outside PATH. Bootstrap may use the pinned
project-local SUMO wheels when no compatible system installation is discoverable.

