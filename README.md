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

## Installation

`pip install ovos-skill-config-tool`

Then run `ovos-skill-config-tool` from your virtual environment.

## Authentication

By default, the application uses Basic Authentication with the following credentials:

- **Username**: `ovos`
- **Password**: `ovos`

You can override these credentials by setting the following environment variables before running the application:

- `OVOS_CONFIG_USERNAME`: Sets the username.
- `OVOS_CONFIG_PASSWORD`: Sets the password.

All API endpoints under `/api/v1/` require Basic Authentication.

## Logo Customization

The application logo can be customized by providing a `config.json` file in the public directory. This is particularly useful when running in a container environment.

### Configuration Options

Create a `config.json` file with the following structure:

```json
{
  "logo": {
    "type": "image", // or "text"
    "src": "/logo.png", // path to your logo image (relative to public directory)
    "alt": "My Custom Logo", // alt text for accessibility
    "width": 32, // optional, defaults to 32
    "height": 32, // optional, defaults to 32
    "text": "OVOS" // text to display if type is "text"
  }
}
```

### Using in a Container

When running in a container, you can mount your custom configuration and logo:

```bash
docker run -v /path/to/your/config.json:/app/public/config.json \
           -v /path/to/your/logo.png:/app/public/logo.png \
           your-image
```

If no configuration is provided, the application will default to displaying "OVOS" as text.

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
