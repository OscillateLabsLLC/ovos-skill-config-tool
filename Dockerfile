# Stage 1: Build the frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend/ovos-settings-ui

# Copy frontend specific files
COPY frontend/ovos-settings-ui/package.json frontend/ovos-settings-ui/package-lock.json* ./
COPY frontend/ovos-settings-ui/index.html ./
COPY frontend/ovos-settings-ui/vite.config.ts ./
COPY frontend/ovos-settings-ui/tsconfig.json ./
COPY frontend/ovos-settings-ui/tsconfig.app.json ./
COPY frontend/ovos-settings-ui/tsconfig.node.json ./
COPY frontend/ovos-settings-ui/public ./public
COPY frontend/ovos-settings-ui/src ./src
COPY frontend/ovos-settings-ui/vite.config.ts ./
COPY frontend/ovos-settings-ui/tailwind.config.js ./
COPY frontend/ovos-settings-ui/postcss.config.js ./

# Install dependencies and build
RUN npm install
RUN npx vite build

# Stage 2: Build the backend dependencies
FROM python:3.13-slim AS backend-builder
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install system dependencies if needed (e.g., for packages with C extensions)
# RUN apt-get update && apt-get install -y --no-install-recommends some-package && rm -rf /var/lib/apt/lists/*

# Create a virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install build dependencies (if any)
# RUN pip install --no-cache-dir wheel

# Copy requirements and install backend dependencies
COPY --chown=appuser:appuser pyproject.toml uv.lock /app/
COPY --chown=appuser:appuser ovos_skill_config/ /app/ovos_skill_config
# Using uv for faster installs
RUN uv pip install .

# Stage 3: Final image
FROM python:3.13-slim AS final
WORKDIR /app

# Create a non-root user and group
RUN groupadd --system --gid 1001 appuser && \
    useradd --system --uid 1001 --gid 1001 appuser

# Copy virtual environment from builder stage
ARG VENV_PATH=/opt/venv # Keep VENV_PATH ARG for clarity here
COPY --chown=appuser:appuser --from=backend-builder ${VENV_PATH} ${VENV_PATH}
ENV PATH="${VENV_PATH}/bin:$PATH"

# Create the target static directory
RUN mkdir -p /app/static

# Copy built frontend assets to the new static location
COPY --chown=appuser:appuser --from=frontend-builder /app/frontend/ovos-settings-ui/dist /app/static

# Change ownership to the non-root user
# Ensure static dir, venv and config dir are owned by appuser
RUN mkdir -p /home/appuser/.config && \
    chown -R appuser:appuser /app/static ${VENV_PATH} /home/appuser
USER appuser

# Set default environment variables
ENV OVOS_CONFIG_USERNAME="ovos"
ENV OVOS_CONFIG_PASSWORD="ovos"
ENV CONFIG_PORT=8000
ENV XDG_CONFIG_HOME=/home/appuser/.config
# --- Add ENV var for static dir --- 
ENV OVOS_CONFIG_STATIC_DIR=/app/static
# ENV OVOS_CONFIG_BASE_FOLDER=mycroft # Keep commented unless needed

# Expose the default port
EXPOSE 8000

# Command to run the application using the installed script
CMD ["ovos-skill-config-tool"]