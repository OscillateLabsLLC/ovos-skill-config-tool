# OVOS Skill Config Tool

A modern web interface for configuring OpenVoiceOS and Neon AI skills, built with React and FastAPI.

## Features

- Clean, intuitive UI for managing voice assistant skills
- Support for skill-specific configuration settings
- Dark mode support
- Skill grouping and organization
- Basic Authentication for security

## Screenshots

![OVOS Skill Config Interface](skills-interface.webp)

## Technology Stack

- **Frontend**: React with Vite
- **Backend**: FastAPI
- **Styling**: Modern Tailwind CSS with dark mode support
- **Security**: Basic Authentication

## Installation & Usage

You can run the OVOS Skill Config Tool either directly via Pip or using the official Docker container.

### Method 1: Pip Install (Local/Virtual Env)

#### Installation

Ensure you have Python 3.9+ and Pip installed. It's recommended to use a virtual environment.

```bash
# Create and activate a virtual environment (optional but recommended)
python -m venv .venv
source .venv/bin/activate  # On Windows use `.venv\Scripts\activate`

# Install the tool
pip install ovos-skill-config-tool
```

#### Running

Once installed, run the tool from your terminal (ensure your virtual environment is active if you used one):

```bash
ovos-skill-config-tool
```

The application will be available at `http://0.0.0.0:8000` by default.

#### Authentication (Pip Install)

By default, the application uses Basic Authentication with the credentials:

- **Username**: `ovos`
- **Password**: `ovos`

You can override these by setting environment variables _before_ running the application:

- `OVOS_CONFIG_USERNAME`: Sets the username.
- `OVOS_CONFIG_PASSWORD`: Sets the password.

Example:

```bash
export OVOS_CONFIG_USERNAME=myuser
export OVOS_CONFIG_PASSWORD=mypassword
ovos-skill-config-tool
```

All API endpoints under `/api/v1/` require Basic Authentication.

#### Customization (Pip Install)

When installed via Pip, the application serves static files (like `index.html`, CSS, JavaScript, and `config.json`) directly from its installation directory within your Python environment's `site-packages`.

1.  **Find the Installation Directory:** You can find the location using pip:

    ```bash
    pip show ovos-skill-config-tool
    # Look for the "Location:" line, e.g., /path/to/.venv/lib/python3.11/site-packages
    ```

    The static files will be inside `ovos_skill_config/static` within that location (e.g., `/path/to/.venv/lib/python3.11/site-packages/ovos_skill_config/static`).

2.  **Modify `config.json`:** Edit the `config.json` file found in the static directory. See the configuration options below.

3.  **Add Custom Logo:** Place your custom logo file (e.g., `my-logo.png`) in the same static directory alongside `config.json`. Update the `src` path in `config.json` accordingly (e.g., `"/my-logo.png"`).

**Note:** Modifications made directly within the `site-packages` directory may be overwritten when you update the `ovos-skill-config-tool` package using pip.

**(Advanced):** You can alternatively override the static file directory entirely by setting the `OVOS_CONFIG_STATIC_DIR` environment variable to point to a local directory containing your customized frontend build assets (including `index.html`, JS/CSS, `config.json`, and your logo).

### Method 2: Docker

Using Docker provides a convenient and isolated way to run the application.

#### Pulling the Image

Pull the latest official image from the GitHub Container Registry:

```bash
docker pull ghcr.io/oscillatelabsllc/ovos-skill-config-tool:latest
# Or replace :latest with a specific version tag
```

#### Running the Container

Run the container, mapping the port and optionally setting authentication credentials:

```bash
docker run --rm --name ovos-config -p 8000:8000 \
  -e OVOS_CONFIG_USERNAME=myuser \
  -e OVOS_CONFIG_PASSWORD=mypass \
  -v $HOME/.config:/home/appuser/.config \
  ghcr.io/oscillatelabsllc/ovos-skill-config-tool:latest
```

- `--rm`: Removes the container when it stops.
- `--name ovos-config`: Assigns a name to the container.
- `-p 8000:8000`: Maps port 8000 on your host to port 8000 in the container.
- `-e OVOS_CONFIG_USERNAME=...`: Sets the authentication username. Defaults to `ovos`.
- `-e OVOS_CONFIG_PASSWORD=...`: Sets the authentication password. Defaults to `ovos`.
- `-v $HOME/.config:/home/appuser/.config`: **(Recommended)** Mounts a local directory to persist skill configuration data saved via the UI. Adjust the host path (`$HOME/.config`) as needed. The container path should remain `/home/appuser/.config`.

The application will be available at `http://localhost:8000`.

#### Customization (Docker)

When running the Docker image, you can customize the appearance and logo by mounting specific files into the container's static assets directory (`/app/static`).

##### Configuration File (`config.json`)

The UI behavior and logo configuration are controlled by a `config.json` file located within the container at `/app/static/config.json`. Create your own `config.json` file locally with the following structure:

```json
{
  "logo": {
    "type": "image", // "image" or "text"
    "src": "/my-logo.png", // Path to the logo file *relative to /app/static* inside the container
    "alt": "My Custom Logo", // Alt text for accessibility
    "width": 32, // Optional, defaults to 32
    "height": 32, // Optional, defaults to 32
    "text": "OVOS" // Text to display if type is "text"
  }
  // Add other future configuration options here
}
```

**Important:** The `src` path for the logo should be relative to the static root (`/app/static`) within the container.

##### Running with Customizations

To use your custom files, add Docker's volume mount (`-v`) flags when running the container. Mount your local files to their corresponding paths inside `/app/static`.

**Example:**

Assuming you have `my-config.json` and `my-logo.png` in your current directory:

```bash
docker run --rm --name ovos-config -p 8000:8000 \
  -v $(pwd)/my-config.json:/app/static/config.json \
  -v $(pwd)/my-logo.png:/app/static/my-logo.png \
  -v $HOME/.config:/home/appuser/.config \
  -e OVOS_CONFIG_USERNAME=myuser \
  -e OVOS_CONFIG_PASSWORD=mypass \
  ghcr.io/oscillatelabsllc/ovos-skill-config-tool:latest
```

**Explanation:**

- `-v $(pwd)/my-config.json:/app/static/config.json`: Mounts your local `my-config.json` over the default one in the container.
- `-v $(pwd)/my-logo.png:/app/static/my-logo.png`: Mounts your local `my-logo.png` into the container at the path specified in your `my-config.json`.
- Remaining flags are as described in the basic run command.

If no custom `config.json` is mounted, the application will use the default configuration built into the image.

## Developer Installation

1. Clone the repository:

```bash
git clone https://github.com/OscillateLabsLLC/ovos-skill-config-tool.git
cd ovos-skill-config-tool
```

2. Install dependencies:

```bash
# Backend
pip install .

# Frontend
cd frontend/ovos-settings-ui
npm install
```

## Development

This project uses [just](https://github.com/casey/just) as a command runner. Common commands:

```bash
# Build frontend
just build-fe

# Run the application
just run

# Run tests
just test

# Format code
just fmt

# Lint code
just lint
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenVoiceOS community
- Neon AI community
- All contributors who have helped shape this tool
- Mycroft for the original open source voice assistant

## Support

For support, please:

1. Open an issue in the GitHub repository
1. [Join the OpenVoiceOS community chat in Matrix](https://matrix.to/#/!XFpdtmgyCoPDxOMPpH:matrix.org?via=matrix.org)
