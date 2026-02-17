import base64
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ovos_skill_config.main import SkillSettings, app, verify_credentials

client = TestClient(app)

# Test credentials
TEST_USERNAME = "test_user"
TEST_PASSWORD = "test_password"


def override_verify_credentials():
    return TEST_USERNAME


app.dependency_overrides[verify_credentials] = override_verify_credentials


@pytest.fixture
def mock_config_dir(tmp_path):
    """Create a temporary config directory for testing."""
    with patch("ovos_skill_config.main.get_config_dir", return_value=tmp_path):
        yield tmp_path


@pytest.fixture
def test_skill_id():
    return "test-skill"


@pytest.fixture
def skill_settings(mock_config_dir, test_skill_id):
    """Create a SkillSettings instance with a mock config directory."""
    settings = SkillSettings(test_skill_id)
    return settings


class TestSkillSettings:
    def test_init_creates_directory(self, mock_config_dir, test_skill_id):
        settings = SkillSettings(test_skill_id)
        assert settings.settings_path.parent.exists()
        assert str(settings.settings_path).endswith("settings.json")

    def test_get_setting_with_default(self, skill_settings):
        value = skill_settings.get_setting("nonexistent", default="default_value")
        assert value == "default_value"

    def test_update_setting(self, skill_settings):
        result = skill_settings.update_setting("test_key", "test_value")
        assert result == {"test_key": "test_value"}
        assert skill_settings.get_setting("test_key") == "test_value"

    def test_merge_settings(self, skill_settings):
        initial = {"key1": "value1"}
        additional = {"key2": "value2"}
        skill_settings.replace_settings(initial)

        result = skill_settings.merge_settings(additional)
        assert result == {"key1": "value1", "key2": "value2"}

    def test_replace_settings(self, skill_settings):
        initial = {"old_key": "old_value"}
        new_settings = {"new_key": "new_value"}

        skill_settings.replace_settings(initial)
        result = skill_settings.replace_settings(new_settings)

        assert result == new_settings
        assert "old_key" not in skill_settings.settings


class TestAPI:
    def test_list_skills_empty_dir(self, mock_config_dir):
        response = client.get("/api/v1/skills")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_skills_with_data(self, mock_config_dir, test_skill_id):
        # Create a test skill with settings
        settings = SkillSettings(test_skill_id)
        settings.update_setting("test_key", "test_value")

        response = client.get("/api/v1/skills")
        assert response.status_code == 200
        skills = response.json()
        assert len(skills) == 1
        assert skills[0]["id"] == test_skill_id
        assert skills[0]["settings"]["test_key"] == "test_value"

    def test_get_skill_settings(self, mock_config_dir, test_skill_id):
        # Set up test data
        settings = SkillSettings(test_skill_id)
        settings.update_setting("test_key", "test_value")

        response = client.get(f"/api/v1/skills/{test_skill_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_skill_id
        assert data["settings"]["test_key"] == "test_value"

    def test_get_skill_auto_creates_settings(self, mock_config_dir):
        """Test that accessing a nonexistent skill creates empty settings."""
        skill_path = mock_config_dir / "new-skill" / "settings.json"
        assert not skill_path.exists()

        response = client.get("/api/v1/skills/new-skill")
        assert response.status_code == 200
        assert skill_path.exists()
        assert response.json()["id"] == "new-skill"
        assert response.json()["settings"] == {}

    def test_merge_skill_settings(self, mock_config_dir, test_skill_id):
        # Create skill with initial settings
        settings = SkillSettings(test_skill_id)
        settings.update_setting("existing_key", "existing_value")

        new_settings = {"new_key": "new_value"}
        response = client.post(
            f"/api/v1/skills/{test_skill_id}/merge", json=new_settings
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["existing_key"] == "existing_value"
        assert data["settings"]["new_key"] == "new_value"

    def test_replace_skill_settings(self, mock_config_dir, test_skill_id):
        # Create skill with initial settings
        settings = SkillSettings(test_skill_id)
        settings.update_setting("old_key", "old_value")

        new_settings = {"new_key": "new_value"}
        response = client.post(f"/api/v1/skills/{test_skill_id}", json=new_settings)
        assert response.status_code == 200
        data = response.json()
        assert "old_key" not in data["settings"]
        assert data["settings"]["new_key"] == "new_value"

    def test_unauthorized_access(self, mock_config_dir, test_skill_id):
        """Test that endpoints require authentication when override is removed."""
        # Temporarily remove the override for this test
        app.dependency_overrides.pop(verify_credentials, None)

        # Test without auth headers
        response = client.get("/api/v1/skills")
        assert response.status_code == 401

        response = client.get(f"/api/v1/skills/{test_skill_id}")
        assert response.status_code == 401

        response = client.post(
            f"/api/v1/skills/{test_skill_id}/merge", json={"test": "value"}
        )
        assert response.status_code == 401

        response = client.post(
            f"/api/v1/skills/{test_skill_id}", json={"test": "value"}
        )
        assert response.status_code == 401

        # Restore the override after the test
        app.dependency_overrides[verify_credentials] = override_verify_credentials

    def test_invalid_auth(self, mock_config_dir, test_skill_id):
        """Test that invalid auth headers are rejected when override is removed."""
        # Temporarily remove the override for this test
        app.dependency_overrides.pop(verify_credentials, None)

        invalid_headers = {"Authorization": "Basic invalid"}
        response = client.get("/api/v1/skills", headers=invalid_headers)
        assert response.status_code == 401

        # Restore the override after the test
        app.dependency_overrides[verify_credentials] = override_verify_credentials

    def test_login_success(self):
        """Test successful login via /api/v1/auth/login endpoint."""
        # Use default credentials from the app
        from ovos_skill_config.main import DEFAULT_PASSWORD, DEFAULT_USERNAME

        credentials = f"{DEFAULT_USERNAME}:{DEFAULT_PASSWORD}"
        encoded = base64.b64encode(credentials.encode()).decode()
        headers = {"Authorization": f"Basic {encoded}"}

        response = client.post("/api/v1/auth/login", headers=headers)
        assert response.status_code == 200
        assert response.json()["authenticated"] is True
        assert response.json()["username"] == DEFAULT_USERNAME

    def test_login_missing_header(self):
        """Test login with missing authorization header."""
        response = client.post("/api/v1/auth/login")
        assert response.status_code == 401
        assert "Invalid authorization header" in response.json()["detail"]

    def test_login_invalid_header_format(self):
        """Test login with invalid header format."""
        headers = {"Authorization": "NotBasic xyz"}
        response = client.post("/api/v1/auth/login", headers=headers)
        assert response.status_code == 401

    def test_login_invalid_base64(self):
        """Test login with invalid base64 in header."""
        headers = {"Authorization": "Basic !!!invalid!!!"}
        response = client.post("/api/v1/auth/login", headers=headers)
        assert response.status_code == 401

    def test_login_invalid_credentials(self):
        """Test login with incorrect credentials."""
        from ovos_skill_config.main import DEFAULT_USERNAME

        credentials = f"{DEFAULT_USERNAME}:wrong_password"
        encoded = base64.b64encode(credentials.encode()).decode()
        headers = {"Authorization": f"Basic {encoded}"}

        response = client.post("/api/v1/auth/login", headers=headers)
        assert response.status_code == 401
        assert "Incorrect username or password" in response.json()["detail"]

    def test_get_specific_setting(self, mock_config_dir, test_skill_id):
        """Test getting a specific setting value."""
        settings = SkillSettings(test_skill_id)
        settings.update_setting("specific_key", "specific_value")

        response = client.get(f"/api/v1/skills/{test_skill_id}/settings/specific_key")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_skill_id
        assert data["key"] == "specific_key"
        assert data["value"] == "specific_value"

    def test_list_skills_skips_files(self, mock_config_dir):
        """Test that list_skills skips non-directory entries."""
        # Create a file in the skills directory (not a directory)
        (mock_config_dir / "not-a-directory.txt").touch()

        # Create a valid skill
        skill_settings = SkillSettings("valid-skill")
        skill_settings.update_setting("key", "value")

        response = client.get("/api/v1/skills")
        assert response.status_code == 200
        skills = response.json()
        # Should only have the valid skill, not the file
        assert len(skills) == 1
        assert skills[0]["id"] == "valid-skill"

    def test_list_skills_skips_missing_settings(self, mock_config_dir):
        """Test that list_skills skips directories without settings.json."""
        # Create a directory without settings.json
        (mock_config_dir / "no-settings-skill").mkdir()

        # Create a valid skill
        skill_settings = SkillSettings("valid-skill")
        skill_settings.update_setting("key", "value")

        response = client.get("/api/v1/skills")
        assert response.status_code == 200
        skills = response.json()
        # Should only have the valid skill
        assert len(skills) == 1
        assert skills[0]["id"] == "valid-skill"

    def test_valid_auth_on_api_endpoint(self, mock_config_dir):
        """Test that valid credentials work on protected API endpoints."""
        # Remove override to test real auth
        app.dependency_overrides.pop(verify_credentials, None)

        from ovos_skill_config.main import DEFAULT_PASSWORD, DEFAULT_USERNAME

        credentials = f"{DEFAULT_USERNAME}:{DEFAULT_PASSWORD}"
        encoded = base64.b64encode(credentials.encode()).decode()
        headers = {"Authorization": f"Basic {encoded}"}

        response = client.get("/api/v1/skills", headers=headers)
        assert response.status_code == 200

        # Restore the override
        app.dependency_overrides[verify_credentials] = override_verify_credentials

    def test_list_skills_handles_corrupted_settings(self, mock_config_dir):
        """Test that list_skills handles corrupted settings gracefully."""
        # Create a valid skill
        valid_settings = SkillSettings("valid-skill")
        valid_settings.update_setting("key", "value")

        # Create a skill with corrupted settings.json
        corrupted_dir = mock_config_dir / "corrupted-skill"
        corrupted_dir.mkdir()
        corrupted_settings = corrupted_dir / "settings.json"
        corrupted_settings.write_text("{ invalid json }")

        response = client.get("/api/v1/skills")
        assert response.status_code == 200
        skills = response.json()
        # JsonStorage recovers from corrupted JSON with empty settings
        assert len(skills) == 2
        skill_ids = {s["id"] for s in skills}
        assert "valid-skill" in skill_ids
        assert "corrupted-skill" in skill_ids
        # Corrupted skill should have empty settings
        corrupted = next(s for s in skills if s["id"] == "corrupted-skill")
        assert corrupted["settings"] == {}


class TestGetConfigDir:
    def test_default_config_dir(self):
        """Test default config directory path."""
        from ovos_skill_config.main import get_config_dir

        # Clear the lru_cache to test fresh
        get_config_dir.cache_clear()

        with patch.dict(
            "os.environ", {"XDG_CONFIG_HOME": "", "OVOS_CONFIG_BASE_FOLDER": ""}, clear=False
        ):
            # Remove env vars if set
            import os
            xdg = os.environ.pop("XDG_CONFIG_HOME", None)
            base = os.environ.pop("OVOS_CONFIG_BASE_FOLDER", None)
            get_config_dir.cache_clear()

            try:
                config_dir = get_config_dir()
                assert str(config_dir).endswith(".config/mycroft/skills")
            finally:
                # Restore env vars
                if xdg is not None:
                    os.environ["XDG_CONFIG_HOME"] = xdg
                if base is not None:
                    os.environ["OVOS_CONFIG_BASE_FOLDER"] = base
                get_config_dir.cache_clear()

    def test_custom_xdg_config_home(self, tmp_path):
        """Test XDG_CONFIG_HOME override."""
        from ovos_skill_config.main import get_config_dir

        get_config_dir.cache_clear()

        with patch.dict("os.environ", {"XDG_CONFIG_HOME": str(tmp_path)}, clear=False):
            import os
            os.environ.pop("OVOS_CONFIG_BASE_FOLDER", None)
            get_config_dir.cache_clear()

            config_dir = get_config_dir()
            assert str(config_dir) == str(tmp_path / "mycroft" / "skills")
            get_config_dir.cache_clear()

    def test_custom_base_folder(self, tmp_path):
        """Test OVOS_CONFIG_BASE_FOLDER override."""
        from ovos_skill_config.main import get_config_dir

        get_config_dir.cache_clear()

        with patch.dict(
            "os.environ",
            {"XDG_CONFIG_HOME": str(tmp_path), "OVOS_CONFIG_BASE_FOLDER": "ovos"},
            clear=False,
        ):
            get_config_dir.cache_clear()
            config_dir = get_config_dir()
            assert str(config_dir) == str(tmp_path / "ovos" / "skills")
            get_config_dir.cache_clear()


class TestSkillSettingsErrors:
    def test_settings_property_empty_db(self, mock_config_dir, test_skill_id):
        """Test settings property returns empty dict for fresh database."""
        settings = SkillSettings(test_skill_id)
        # Fresh settings should return empty dict
        assert settings.settings == {}

    def test_init_db_creates_valid_json_for_empty_file(self, mock_config_dir):
        """Test that _init_db initializes empty files with valid JSON."""
        skill_id = "empty-file-skill"
        skill_dir = mock_config_dir / skill_id
        skill_dir.mkdir(parents=True)
        settings_file = skill_dir / "settings.json"
        settings_file.touch()  # Create empty file

        # This should not raise
        settings = SkillSettings(skill_id)
        assert settings.settings == {}
