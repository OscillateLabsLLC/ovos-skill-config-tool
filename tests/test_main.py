from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
import base64

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

    def test_get_nonexistent_skill(self, mock_config_dir):
        # Ensure the settings file doesn't exist already
        skill_path = mock_config_dir / "faaaake" / "settings.json"
        assert not skill_path.exists()

        response = client.get("/api/v1/skills/faaaake")
        assert response.status_code == 200  # Non-existent skill creates settings
        assert skill_path.exists()
        # Check if the created file has valid JSON
        with open(skill_path, "r") as f:
            import json

            assert json.load(f) == {}

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
