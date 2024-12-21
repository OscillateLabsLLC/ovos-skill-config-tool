import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from json_database import JsonStorage
from json_database.exceptions import DatabaseNotCommitted

app = FastAPI(title="OVOS/Neon Skill Configuration API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        self.settings_path = self.config_dir / skill_id / "settings.json"
        self.db: JsonStorage
        self._init_db()

    def _init_db(self):
        """Initialize the JsonStorage database."""
        if not self.settings_path.parent.exists():
            self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.settings_path.touch(exist_ok=True)
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
            self.db.merge(new_settings)
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


@app.get("/api/v1/skills")
async def list_skills() -> List[Dict]:
    """List all available skills with their settings."""
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


@app.get("/api/v1/skills/{skill_id}")
async def get_skill_settings(skill_id: str) -> Dict:
    """Get settings for a specific skill."""
    try:
        skill_settings = SkillSettings(skill_id)
        return {"id": skill_id, "settings": skill_settings.settings}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Skill not found") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/v1/skills/{skill_id}/settings/{key}")
async def get_skill_setting(skill_id: str, key: str) -> Dict:
    """Get a specific setting value for a skill."""
    try:
        skill_settings = SkillSettings(skill_id)
        value = skill_settings.get_setting(key)
        return {"id": skill_id, "key": key, "value": value}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Skill not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v1/skills/{skill_id}/merge")
async def merge_skill_settings(skill_id: str, settings: Dict) -> Dict:
    """Merge new settings with existing ones."""
    try:
        skill_settings = SkillSettings(skill_id)
        merged = skill_settings.merge_settings(settings)
        return {"id": skill_id, "settings": merged}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Skill not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v1/skills/{skill_id}")
async def replace_skill_settings(skill_id: str, settings: Dict) -> Dict:
    """Replace all settings for a skill."""
    try:
        skill_settings = SkillSettings(skill_id)
        replaced = skill_settings.replace_settings(settings)
        return {"id": skill_id, "settings": replaced}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Skill not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


package_dir = Path(__file__).parent
static_dir = os.path.join(package_dir, "static")

# Mount the static files
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


def main():
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
