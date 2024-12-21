build-fe:
  rm -rf ovos_skill_config/static && \
  mkdir -p ovos_skill_config/static && \
  cd frontend/ovos-settings-ui && \
  npx vite build && \
  cp -R dist/* ../../ovos_skill_config/static
run:
  python ovos_skill_config/main.py
test:
  pytest
fmt:
  ruff format .
lint:
  ruff check ovos_skill_config/*.py --fix
