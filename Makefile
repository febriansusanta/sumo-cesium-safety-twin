.PHONY: setup build up down reset test lint demo clean-runs rebuild-network smoke

setup:
	python scripts/bootstrap.py

build: setup
	cd web && npm run build

up:
	python scripts/dev.py

down:
	@echo "The development server runs in the foreground; press Ctrl+C in its terminal."

reset:
	python scripts/clean.py all --yes
	python scripts/bootstrap.py

test:
	python scripts/test_all.py

lint:
	.venv/bin/python -m ruff check api pipeline scripts
	cd web && npm run lint

demo:
	.venv/bin/python scripts/demo.py

clean-runs:
	python scripts/clean.py runs --yes

rebuild-network:
	.venv/bin/python -m pipeline.entrypoint network --force-build

smoke:
	.venv/bin/python scripts/smoke.py
