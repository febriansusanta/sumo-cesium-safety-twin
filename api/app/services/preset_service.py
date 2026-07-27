from __future__ import annotations

from pathlib import Path

import yaml

from app.models.scenario import ScenarioConfig


def load_presets(directory: Path) -> list[dict[str, object]]:
    presets: list[dict[str, object]] = []
    for path in sorted(directory.glob("*.yaml")):
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
        scenario = ScenarioConfig.model_validate(payload["scenario"])
        presets.append(
            {
                "id": scenario.preset_id,
                "name": scenario.name,
                "description": payload["description"],
                "scenario": scenario.model_dump(mode="json", by_alias=True),
                "limitations": payload.get("limitations", []),
            }
        )
    return presets
