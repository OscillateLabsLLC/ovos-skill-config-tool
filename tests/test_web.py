"""Tests for the server-rendered web UI (Jinja2 + htmx)."""

import base64
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ovos_skill_config.main import (
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
    SkillSettings,
    app,
)
from ovos_skill_config.web import AUTH_COOKIE_NAME, UNDO_SNAPSHOTS, get_skill_info

client = TestClient(app)


def _basic_token() -> str:
    return base64.b64encode(f"{DEFAULT_USERNAME}:{DEFAULT_PASSWORD}".encode()).decode()


def _basic_headers() -> dict:
    return {"Authorization": f"Basic {_basic_token()}"}


@pytest.fixture
def mock_config_dir(tmp_path):
    """Create a temporary config directory for testing."""
    with patch("ovos_skill_config.main.get_config_dir", return_value=tmp_path):
        yield tmp_path


@pytest.fixture(autouse=True)
def clear_undo_snapshots():
    UNDO_SNAPSHOTS.clear()
    yield
    UNDO_SNAPSHOTS.clear()


@pytest.fixture
def auth_client():
    """A client with a valid auth cookie set."""
    c = TestClient(app)
    c.cookies.set(AUTH_COOKIE_NAME, _basic_token())
    return c


class TestGetSkillInfo:
    def test_dotted_id_with_ovos_skill_prefix(self):
        info = get_skill_info("ovos-skill-notes.openvoiceos")
        assert info["name"] == "Notes"
        assert info["author"] == "openvoiceos"

    def test_skill_prefix_appends_skill_suffix(self):
        info = get_skill_info("skill-weather.author")
        assert info["name"] == "Weather Skill"
        assert info["author"] == "author"

    def test_no_dot_id(self):
        info = get_skill_info("my_skill")
        assert info["name"] == "My Skill"
        assert info["author"] == "unknown"

    def test_ovos_prefix(self):
        info = get_skill_info("ovos-date-time.openvoiceos")
        assert info["name"] == "Date Time"
        assert info["author"] == "openvoiceos"

    def test_underscores_and_hyphens(self):
        info = get_skill_info("skill-ovos-fallback_unknown.openvoiceos")
        assert info["name"] == "Ovos Fallback Unknown Skill"
        assert info["author"] == "openvoiceos"

    def test_word_case_preserved_after_first_letter(self):
        # JS charAt(0).toUpperCase() + slice(1) leaves the rest untouched
        info = get_skill_info("myABCSkill.author")
        assert info["name"] == "MyABCSkill"


class TestSortKeys:
    """OVOS_CONFIG_SORT_KEYS controls top-level key sorting (#28)."""

    def _make_skill(self, skill_id="sort-skill"):
        settings = SkillSettings(skill_id)
        settings.replace_settings({"zebra": 1, "apple": 2, "mango": 3})
        return skill_id

    def test_default_preserves_file_order(self, mock_config_dir, monkeypatch):
        monkeypatch.delenv("OVOS_CONFIG_SORT_KEYS", raising=False)
        skill_id = self._make_skill()
        response = client.get(f"/api/v1/skills/{skill_id}", headers=_basic_headers())
        assert response.status_code == 200
        assert list(response.json()["settings"].keys()) == ["zebra", "apple", "mango"]

    def test_sorting_enabled_sorts_keys(self, mock_config_dir, monkeypatch):
        monkeypatch.setenv("OVOS_CONFIG_SORT_KEYS", "true")
        skill_id = self._make_skill()
        response = client.get(f"/api/v1/skills/{skill_id}", headers=_basic_headers())
        assert response.status_code == 200
        assert list(response.json()["settings"].keys()) == ["apple", "mango", "zebra"]

    def test_sorting_enabled_list_endpoint(self, mock_config_dir, monkeypatch):
        monkeypatch.setenv("OVOS_CONFIG_SORT_KEYS", "1")
        self._make_skill()
        response = client.get("/api/v1/skills", headers=_basic_headers())
        assert response.status_code == 200
        skills = response.json()
        assert list(skills[0]["settings"].keys()) == ["apple", "mango", "zebra"]

    def test_sorting_off_list_endpoint(self, mock_config_dir, monkeypatch):
        monkeypatch.setenv("OVOS_CONFIG_SORT_KEYS", "false")
        self._make_skill()
        response = client.get("/api/v1/skills", headers=_basic_headers())
        assert response.status_code == 200
        skills = response.json()
        assert list(skills[0]["settings"].keys()) == ["zebra", "apple", "mango"]


class TestWebAuth:
    def test_index_unauthenticated_redirects_to_login(self, mock_config_dir):
        response = client.get("/", follow_redirects=False)
        assert response.status_code in (302, 303, 307)
        assert response.headers["location"] == "/login"

    def test_login_page_renders(self):
        response = client.get("/login")
        assert response.status_code == 200
        assert "Sign in" in response.text

    def test_login_success_sets_cookie_and_redirects(self):
        c = TestClient(app)
        response = c.post(
            "/login",
            data={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert response.headers["location"] == "/"
        set_cookie = response.headers["set-cookie"]
        assert AUTH_COOKIE_NAME in set_cookie
        assert "HttpOnly" in set_cookie
        assert "SameSite=lax" in set_cookie

    def test_login_failure_shows_error(self):
        response = client.post(
            "/login",
            data={"username": DEFAULT_USERNAME, "password": "wrong"},
        )
        assert response.status_code == 401
        assert "Invalid username or password" in response.text

    def test_authenticated_index_renders(self, mock_config_dir, auth_client):
        response = auth_client.get("/")
        assert response.status_code == 200
        assert "Skill Settings" in response.text

    def test_basic_auth_header_works_for_index(self, mock_config_dir):
        response = client.get("/", headers=_basic_headers())
        assert response.status_code == 200

    def test_logout_clears_cookie_and_redirects(self, auth_client):
        response = auth_client.get("/logout", follow_redirects=False)
        assert response.status_code in (302, 303)
        assert response.headers["location"] == "/login"
        set_cookie = response.headers.get("set-cookie", "")
        assert AUTH_COOKIE_NAME in set_cookie
        # Cookie deletion sets an immediate expiry
        assert "Max-Age=0" in set_cookie or "expires" in set_cookie.lower()

    def test_login_page_redirects_when_authenticated(self, auth_client):
        response = auth_client.get("/login", follow_redirects=False)
        assert response.status_code in (302, 303)
        assert response.headers["location"] == "/"


class TestIndexRendering:
    def test_skill_list_humanized(self, mock_config_dir, auth_client):
        settings = SkillSettings("ovos-skill-notes.openvoiceos")
        settings.replace_settings({"greeting": "hi"})

        response = auth_client.get("/")
        assert response.status_code == 200
        assert "Notes" in response.text
        assert "openvoiceos" in response.text

    def test_firstrun_filtered_from_html(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"__mycroft_skill_firstrun": True, "greeting": "hi"})

        response = auth_client.get("/")
        assert response.status_code == 200
        assert "__mycroft_skill_firstrun" not in response.text
        assert "greeting" in response.text

    def test_settings_values_escaped(self, mock_config_dir, auth_client):
        """XSS: malicious setting values must be escaped in the HTML."""
        settings = SkillSettings("evil-skill")
        settings.replace_settings({"payload": "<script>alert(1)</script>"})

        response = auth_client.get("/")
        assert response.status_code == 200
        assert "<script>alert(1)</script>" not in response.text
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in response.text

    def test_settings_keys_escaped(self, mock_config_dir, auth_client):
        """XSS: malicious setting keys must be escaped in the HTML."""
        settings = SkillSettings("evil-skill")
        settings.replace_settings({"<img src=x onerror=alert(1)>": "v"})

        response = auth_client.get("/")
        assert response.status_code == 200
        assert "<img src=x onerror=alert(1)>" not in response.text


class TestMutationEndpoints:
    def test_set_string(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"name": "old"})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["name"]', "type": "string", "value": "new"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"name": "new"}
        assert "new" in response.text

    def test_set_number(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"volume": 5})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["volume"]', "type": "number", "value": "7"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"volume": 7}

    def test_set_float(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"rate": 1})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["rate"]', "type": "number", "value": "1.5"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"rate": 1.5}

    def test_set_invalid_number_rejected(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"volume": 5})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["volume"]', "type": "number", "value": "abc"},
        )
        assert response.status_code == 400
        assert SkillSettings("test-skill").settings == {"volume": 5}

    def test_set_boolean(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"enabled": True})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["enabled"]', "type": "boolean", "value": "false"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"enabled": False}

    def test_set_nested_path(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"outer": {"inner": "a"}})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["outer", "inner"]', "type": "string", "value": "b"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"outer": {"inner": "b"}}

    def test_set_array_item(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"items": ["a", "b"]})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["items", 1]', "type": "string", "value": "c"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"items": ["a", "c"]}

    def test_set_invalid_path_rejected(self, mock_config_dir, auth_client):
        settings = SkillSettings("test-skill")
        settings.replace_settings({"a": 1})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["missing", "x"]', "type": "string", "value": "v"},
        )
        assert response.status_code == 400
        assert SkillSettings("test-skill").settings == {"a": 1}

    def test_set_malformed_path_rejected(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"a": 1})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": "notjson", "type": "string", "value": "v"},
        )
        assert response.status_code == 400

    def test_set_array_index_out_of_range(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"items": ["a"]})

        response = auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["items", 5]', "type": "string", "value": "v"},
        )
        assert response.status_code == 400

    def test_delete_key(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"a": 1, "b": 2})

        response = auth_client.post(
            "/web/skills/test-skill/delete", data={"path": '["a"]'}
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"b": 2}

    def test_delete_array_item(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"items": ["a", "b"]})

        response = auth_client.post(
            "/web/skills/test-skill/delete", data={"path": '["items", 0]'}
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"items": ["b"]}

    def test_delete_invalid_path_rejected(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"a": 1})

        response = auth_client.post(
            "/web/skills/test-skill/delete", data={"path": '["missing"]'}
        )
        assert response.status_code == 400

    def test_add_object_entry(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({})

        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={
                "container_path": "[]",
                "key": "newkey",
                "type": "string",
                "value": "v",
            },
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"newkey": "v"}

    def test_add_array_entry_appends(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"items": ["a"]})

        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={"container_path": '["items"]', "type": "number", "value": "3"},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"items": ["a", 3]}

    def test_add_empty_object_and_array(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({})

        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={"container_path": "[]", "key": "obj", "type": "object", "value": ""},
        )
        assert response.status_code == 200
        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={"container_path": "[]", "key": "arr", "type": "array", "value": ""},
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"obj": {}, "arr": []}

    def test_add_boolean_entry(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({})

        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={
                "container_path": "[]",
                "key": "flag",
                "type": "boolean",
                "value": "true",
            },
        )
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"flag": True}

    def test_add_to_object_requires_key(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({})

        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={"container_path": "[]", "key": "", "type": "string", "value": "v"},
        )
        assert response.status_code == 400

    def test_add_invalid_container_path(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"scalar": 1})

        response = auth_client.post(
            "/web/skills/test-skill/add",
            data={
                "container_path": '["scalar"]',
                "key": "k",
                "type": "string",
                "value": "v",
            },
        )
        assert response.status_code == 400

    def test_mutation_unauthenticated_rejected(self, mock_config_dir):
        SkillSettings("test-skill").replace_settings({"a": 1})

        response = client.post(
            "/web/skills/test-skill/set",
            data={"path": '["a"]', "type": "number", "value": "2"},
            follow_redirects=False,
        )
        assert response.status_code in (302, 303, 401)
        assert SkillSettings("test-skill").settings == {"a": 1}


class TestUndo:
    def test_undo_restores_previous_settings(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"a": 1})

        auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["a"]', "type": "number", "value": "2"},
        )
        assert SkillSettings("test-skill").settings == {"a": 2}

        response = auth_client.post("/web/skills/test-skill/undo")
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"a": 1}

    def test_undo_is_single_level(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"a": 1})

        auth_client.post(
            "/web/skills/test-skill/set",
            data={"path": '["a"]', "type": "number", "value": "2"},
        )
        auth_client.post("/web/skills/test-skill/undo")

        # Snapshot slot is cleared: second undo has nothing to restore
        response = auth_client.post("/web/skills/test-skill/undo")
        assert response.status_code == 400
        assert SkillSettings("test-skill").settings == {"a": 1}

    def test_undo_after_delete(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"a": 1, "b": 2})

        auth_client.post("/web/skills/test-skill/delete", data={"path": '["a"]'})
        assert SkillSettings("test-skill").settings == {"b": 2}

        response = auth_client.post("/web/skills/test-skill/undo")
        assert response.status_code == 200
        assert SkillSettings("test-skill").settings == {"a": 1, "b": 2}


class TestExport:
    def test_export_returns_pretty_json_attachment(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings({"key": "value"})

        response = auth_client.get("/export")
        assert response.status_code == 200
        assert "attachment" in response.headers["content-disposition"]
        assert "skill-settings.json" in response.headers["content-disposition"]

        data = json.loads(response.content)
        assert data == [{"id": "test-skill", "settings": {"key": "value"}}]
        # Pretty-printed with 2-space indent
        assert b'\n  "id"' in response.content or b"\n  {" in response.content

    def test_export_filters_firstrun(self, mock_config_dir, auth_client):
        SkillSettings("test-skill").replace_settings(
            {"__mycroft_skill_firstrun": True, "key": "value"}
        )

        response = auth_client.get("/export")
        data = json.loads(response.content)
        assert data[0]["settings"] == {"key": "value"}

    def test_export_requires_auth(self, mock_config_dir):
        response = client.get("/export", follow_redirects=False)
        assert response.status_code in (302, 303, 401)


class TestStaticPassthrough:
    def test_status_endpoint_still_works(self):
        response = client.get("/status")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_logo_svg_served(self):
        response = client.get("/logo.svg")
        assert response.status_code == 200

    def test_config_json_served(self):
        response = client.get("/config.json")
        assert response.status_code == 200

    def test_htmx_vendored(self):
        response = client.get("/vendor/htmx.min.js")
        assert response.status_code == 200
        assert "htmx" in response.text[:500]
