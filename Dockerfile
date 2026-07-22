# Stage 1: Build the backend dependencies
FROM python:3.13-slim AS backend-builder
# Add ARGs for build platform
ARG TARGETPLATFORM 
ARG TARGETARCH
WORKDIR /app

# Install curl for downloading uv
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download and install static uv binary for the target architecture
# Pin a specific version for stability
ARG UV_VERSION=0.4.1 
RUN set -eux; \
    arch=$TARGETARCH; \
    # Map Docker arch names to uv release artifact names
    case $arch in \
        amd64) uv_arch="x86_64-unknown-linux-gnu" ;; \
        arm64) uv_arch="aarch64-unknown-linux-gnu" ;; \
        *) echo >&2 "error: unsupported architecture: $arch"; exit 1 ;; \
    esac; \
    echo "Downloading uv version ${UV_VERSION} for ${uv_arch}..."; \
    curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uv_arch}.tar.gz" -o uv.tar.gz; \
    tar -xzf uv.tar.gz -C /usr/local/bin --strip-components=1; \
    chmod +x /usr/local/bin/uv; \
    rm uv.tar.gz; \
    # Verify installation
    uv --version

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

# Stage 2: Final image
FROM python:3.13-slim AS final
WORKDIR /app

# Create a non-root user and group
RUN groupadd --system --gid 1000 appuser && \
    useradd --system --uid 1000 --gid 1000 appuser

# Copy virtual environment from builder stage
ARG VENV_PATH=/opt/venv # Keep VENV_PATH ARG for clarity here
COPY --chown=appuser:appuser --from=backend-builder ${VENV_PATH} ${VENV_PATH}
ENV PATH="${VENV_PATH}/bin:$PATH"

# Copy static assets (CSS, JS, vendored htmx, branding) to the volume-mountable
# static location; templates ship inside the installed package
COPY --chown=appuser:appuser ovos_skill_config/static /app/static

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

HEALTHCHECK --interval=60s --timeout=10s --retries=3 --start-period=60s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/status', timeout=5)" || kill 1
# Command to run the application using the installed script
CMD ["ovos-skill-config-tool"]
