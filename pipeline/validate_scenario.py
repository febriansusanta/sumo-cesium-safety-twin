from app.models.scenario import ScenarioConfig

print(ScenarioConfig().model_dump_json(by_alias=True, indent=2))
