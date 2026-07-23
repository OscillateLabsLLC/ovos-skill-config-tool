import base64
import os
import secrets
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from json_database import JsonStorage
from json_database.exceptions import DatabaseNotCommitted

app = FastAPI(title="OVOS/Neon Skill Configuration API")

# Basic auth security
security = HTTPBasic()

# Default credentials (can be overridden by environment variables)
DEFAULT_USERNAME = os.getenv("OVOS_CONFIG_USERNAME", "ovos")
DEFAULT_PASSWORD = os.getenv("OVOS_CONFIG_PASSWORD", "ovos")


def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, DEFAULT_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, DEFAULT_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    return credentials.username


# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# No auth - for healthchecks
@app.get("/status")
async def healthcheck_status(request: Request):
    return {"status": "ok"}


@app.post("/api/v1/auth/login")
async def login(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Basic "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    try:
        auth = auth_header.split(" ")[1]
        decoded = base64.b64decode(auth).decode("utf-8")
        username, password = decoded.split(":", 1)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        ) from exc

    correct_username = secrets.compare_digest(username, DEFAULT_USERNAME)
    correct_password = secrets.compare_digest(password, DEFAULT_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    return {"authenticated": True, "username": username}


def sort_keys_enabled() -> bool:
    """Whether top-level settings keys should be sorted (issue #28).

    Controlled by the OVOS_CONFIG_SORT_KEYS env var, read at request time.
    Default: off (file order preserved).
    """
    return os.getenv("OVOS_CONFIG_SORT_KEYS", "").strip().lower() in (
        "true",
        "1",
        "yes",
    )


def maybe_sort_settings(settings: Dict) -> Dict:
    """Sort top-level settings keys alphabetically when enabled."""
    if sort_keys_enabled():
        return {key: settings[key] for key in sorted(settings)}
    return settings


@lru_cache()
def get_config_dir() -> Path:
    """Get the XDG config directory for skills."""
    # Get base config folder from env var, default to 'mycroft'
    config_folder = os.getenv("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))
    base_folder = os.getenv("OVOS_CONFIG_BASE_FOLDER", "mycroft")
    return Path(config_folder) / base_folder / "skills"


class SkillSettings:
    """Wrapper class for skill settings using json_database."""

    def __init__(self, skill_id: str):
        self.skill_id = skill_id
        self.config_dir = get_config_dir()
        self.settings_path = self._safe_settings_path(skill_id)
        self.db: JsonStorage
        self._init_db()

    def _safe_settings_path(self, skill_id: str) -> Path:
        """Resolve the settings path, refusing ids that escape the config dir."""
        if (
            not skill_id
            or skill_id in (".", "..")
            or skill_id != os.path.basename(skill_id)
        ):
            raise ValueError(f"Invalid skill id: {skill_id!r}")
        root = os.path.realpath(str(self.config_dir))
        resolved = os.path.realpath(os.path.join(root, skill_id, "settings.json"))
        if not resolved.startswith(root + os.sep):
            raise ValueError(f"Invalid skill id: {skill_id!r}")
        return Path(resolved)

    def _init_db(self):
        """Initialize the JsonStorage database, ensuring it contains valid JSON."""
        if not self.settings_path.parent.exists():
            self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            # Ensure file exists
            self.settings_path.touch(exist_ok=True)
            # Check if file is empty and initialize if necessary
            if self.settings_path.stat().st_size == 0:
                with open(self.settings_path, "w") as f:
                    f.write("{}")
            self.db = JsonStorage(
                str(self.settings_path)
            )  # JsonStorage expects string path
        except Exception as e:
            raise RuntimeError(
                f"Failed to initialize settings database: {str(e)}"
            ) from e

    def get_setting(self, key: str, default: Any = None) -> Any:
        """Get a specific setting value."""
        try:
            return self.db.get(key, default)
        except Exception as e:
            raise ValueError(f"Error getting setting {key}: {str(e)}") from e

    def update_setting(self, key: str, value: Any) -> Dict:
        """Update a single setting."""
        try:
            self.db[key] = value
            self.db.store()  # Persist changes immediately
            return {key: value}
        except Exception as e:
            raise ValueError(f"Error updating setting {key}: {str(e)}") from e

    def merge_settings(self, new_settings: Dict) -> Dict:
        """Merge new settings with existing ones."""
        try:
            self.db.merge(new_settings, merge_lists=True, skip_empty=False)
            self.db.store()
            return dict(self.db)
        except Exception as e:
            raise ValueError(f"Error merging settings: {str(e)}") from e

    def replace_settings(self, new_settings: Dict) -> Dict:
        """Replace all settings with new values."""
        try:
            self.db.clear()
            # skip_empty=False: a faithful replace must keep empty values
            # ({}, [], "") instead of silently dropping them
            self.db.merge(new_settings, skip_empty=False)
            self.db.store()
            return dict(self.db)
        except Exception as e:
            raise ValueError(f"Error replacing settings: {str(e)}") from e

    @property
    def settings(self) -> Dict:
        """Get all current settings."""
        try:
            self.db.reload()  # Ensure we have latest data
            return dict(self.db)
        except DatabaseNotCommitted:
            return {}  # Return empty dict for new/empty settings
        except Exception as e:
            raise ValueError(f"Error getting settings: {str(e)}") from e


def load_all_skills() -> List[Dict]:
    """Load every skill directory that contains a settings.json file."""
    skills_dir = get_config_dir()
    if not skills_dir.exists():
        return []

    skills = []
    for skill_dir in skills_dir.iterdir():
        if not skill_dir.is_dir():
            continue

        settings_file = skill_dir / "settings.json"
        if not settings_file.exists():
            continue

        try:
            skill_settings = SkillSettings(skill_dir.name)
            skills.append({"id": skill_dir.name, "settings": skill_settings.settings})
        except Exception as e:
            print(f"Error loading settings for {skill_dir.name}: {e}")
            continue

    return skills


@app.get("/api/v1/skills")
async def list_skills(username: str = Depends(verify_credentials)) -> List[Dict]:
    """List all available skills with their settings."""
    return [
        {"id": skill["id"], "settings": maybe_sort_settings(skill["settings"])}
        for skill in load_all_skills()
    ]


@app.get("/api/v1/skills/{skill_id}")
async def get_skill_settings(
    skill_id: str, username: str = Depends(verify_credentials)
) -> Dict:
    """Get settings for a specific skill. Creates empty settings if skill doesn't exist."""
    try:
        skill_settings = SkillSettings(skill_id)
        return {
            "id": skill_id,
            "settings": maybe_sort_settings(skill_settings.settings),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/v1/skills/{skill_id}/settings/{key}")
async def get_skill_setting(
    skill_id: str, key: str, username: str = Depends(verify_credentials)
) -> Dict:
    """Get a specific setting value for a skill. Creates empty settings if skill doesn't exist."""
    try:
        skill_settings = SkillSettings(skill_id)
        value = skill_settings.get_setting(key)
        return {"id": skill_id, "key": key, "value": value}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v1/skills/{skill_id}/merge")
async def merge_skill_settings(
    skill_id: str, settings: Dict, username: str = Depends(verify_credentials)
) -> Dict:
    """Merge new settings with existing ones. Creates skill if it doesn't exist."""
    try:
        skill_settings = SkillSettings(skill_id)
        merged = skill_settings.merge_settings(settings)
        return {"id": skill_id, "settings": merged}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v1/skills/{skill_id}")
async def replace_skill_settings(
    skill_id: str, settings: Dict, username: str = Depends(verify_credentials)
) -> Dict:
    """Replace all settings for a skill. Creates skill if it doesn't exist."""
    try:
        skill_settings = SkillSettings(skill_id)
        replaced = skill_settings.replace_settings(settings)
        return {"id": skill_id, "settings": replaced}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# HTML routes (server-rendered UI) must be registered before the static mount.
# Imported here (not at the top) because ovos_skill_config.web imports back into
# this module for SkillSettings and friends.
# When run as a script (python -m ovos_skill_config.main), this module loads as
# "__main__"; register it under its canonical name so web's import binds to this
# same module instead of re-executing it (circular-import crash otherwise).
sys.modules.setdefault("ovos_skill_config.main", sys.modules[__name__])
from ovos_skill_config.web import router as web_router  # noqa: E402

app.include_router(web_router)

package_dir = Path(__file__).parent
# Define the default path relative to the package
default_static_dir = package_dir / "static"
# Get the static directory from env var, defaulting to the package's static dir
static_dir_path = os.getenv("OVOS_CONFIG_STATIC_DIR", str(default_static_dir))
# Ensure it's a Path object for consistency if needed, although StaticFiles accepts string
static_dir = Path(static_dir_path)

# Mount the static files LAST so real routes ("/", "/login", API, ...) win.
# html=False: "/" is now a server-rendered route, not a SPA index.html.
# Root-level files like /logo.svg and /config.json remain reachable (Docker
# deployments volume-mount over them).
app.mount("/", StaticFiles(directory=str(static_dir), html=False), name="static")


def main():
    import uvicorn

    port = os.getenv("CONFIG_PORT", "8000")

    uvicorn.run(app, host="0.0.0.0", port=int(port))


if __name__ == "__main__":
    main()
