# Contributing to OVOS Skill Config Tool

Thanks for your interest in contributing!

## Development Setup

### Prerequisites

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) package manager
- [just](https://github.com/casey/just) task runner (optional but recommended)

### Getting Started

```bash
git clone https://github.com/OscillateLabsLLC/ovos-skill-config-tool
cd ovos-skill-config-tool
uv sync --dev
```

### Running Locally

```bash
just run
# or: uv run python -m ovos_skill_config.main
```

The application will be available at `http://localhost:8000`.

## Common Commands

```bash
just test      # Run tests
just fmt       # Format code
just lint      # Lint code
just --list    # Show all commands
```

## Code Style

This project uses [Ruff](https://docs.astral.sh/ruff/) for linting and formatting. Run `just fmt` and `just lint` before committing.

## Testing

New features should include tests. Run the test suite with:

```bash
uv run pytest --cov=ovos_skill_config --cov-report=term-missing
```

## Pull Requests

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes and add tests
3. Run `just fmt` and `just lint`
4. Run `just test` to ensure all tests pass
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat:`, `fix:`, `docs:`)
6. Open a pull request

## Docker

```bash
docker build -t ovos-skill-config-tool .
docker run -p 8000:8000 \
  -v $HOME/.config:/home/appuser/.config \
  -e OVOS_CONFIG_USERNAME=admin \
  -e OVOS_CONFIG_PASSWORD=admin \
  ovos-skill-config-tool
```

## Questions?

- Open an issue for bugs or feature requests
- Join the [OpenVoiceOS Matrix chat](https://matrix.to/#/!XFpdtmgyCoPDxOMPpH:matrix.org?via=matrix.org)

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
