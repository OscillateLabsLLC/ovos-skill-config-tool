build-fe:
  rm -rf static && mkdir -p static && cd frontend/ovos-settings-ui && npx vite build && cp -R dist/* ../../static
run:
  python ovos_skill_config/main.py
test:
  pytest
fmt:
  ruff format .
lint:
  ruff check ovos_skill_config/*.py --fix
