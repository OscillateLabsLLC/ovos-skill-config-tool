image_name := "ovos-skill-config-tool:latest"

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

docker-build:
  echo "Building Docker image as {{image_name}} ..."
  docker build -t {{image_name}} .

docker-run:
  echo "Running Docker image {{image_name}} ..."
  docker run --rm --name ovos-config -p 8000:8000 -v $HOME/.config:/home/appuser/.config {{image_name}}

docker-run-dev:
  echo "Running Docker image {{image_name}} with dev overrides..."
  echo "Ensure my-config.json and my-logo.png exist or remove the mounts."
  docker run --rm --name ovos-config -p 8000:8000 \
    -v $(pwd)/my-config.json:/app/static/config.json \
    -v $(pwd)/my-logo.png:/app/static/my-logo.png \
    -v $HOME/.config:/home/appuser/.config \
    -e OVOS_CONFIG_USERNAME=dev \
    -e OVOS_CONFIG_PASSWORD=dev \
    {{image_name}}

docker-stop:
  echo "Stopping Docker container ovos-config ..."
  docker stop ovos-config
