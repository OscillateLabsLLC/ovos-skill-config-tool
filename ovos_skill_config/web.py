"""Server-rendered web UI (Jinja2 + htmx) for the skill configuration tool."""

import base64
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from urllib.parse import parse_qsl

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from fastapi.templating import Jinja2Templates

import ovos_skill_config.main as core

router = APIRouter()

AUTH_COOKIE_NAME = "ovos_config_auth"
FIRSTRUN_KEY = "__mycroft_skill_firstrun"

# Signing key for session cookies; regenerated at startup, so sessions do not
# survive a restart (users just log in again). Credentials themselves are never
# stored client-side.
SESSION_SECRET = secrets.token_bytes(32)
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

# Per-skill single-level undo snapshots: {skill_id: settings before last change}
UNDO_SNAPSHOTS: Dict[str, Dict] = {}

_package_dir = Path(__file__).parent
templates = Jinja2Templates(directory=str(_package_dir / "templates"))

PathSegment = Union[str, int]


def get_skill_info(skill_id: str) -> Dict[str, str]:
    """Humanize a skill id into a display name and author.

    Port of the React UI's getSkillInfo, quirks included.
    """
    parts = skill_id.split(".")
    author = parts[-1] if len(parts) > 1 else "unknown"
    name_with_prefix = ".".join(parts[:-1]) or skill_id
    stripped = re.sub(r"^(skill-|ovos-skill-|ovos-)", "", name_with_prefix, count=1)
    words = re.split(r"[-_]", stripped)
    name = " ".join(word[:1].upper() + word[1:] for word in words)
    if name_with_prefix.startswith("skill"):
        name += " Skill"
    return {"name": name, "author": author}


def sign_session(username: str, expires_at: int) -> str:
    """Create a signed session token: hex(username).expiry.hmac

    Hex keeps the token free of characters that would make SimpleCookie
    quote the cookie value (base64 padding '=' triggers quoting).
    """
    payload = "{}.{}".format(username.encode("utf-8").hex(), expires_at)
    sig = hmac.new(SESSION_SECRET, payload.encode("ascii"), hashlib.sha256).hexdigest()
    return "{}.{}".format(payload, sig)


def verify_session(token: str) -> Optional[str]:
    """Return the username for a valid, unexpired session token, else None."""
    try:
        encoded_user, expires_str, sig = token.split(".")
        payload = "{}.{}".format(encoded_user, expires_str)
        expected = hmac.new(
            SESSION_SECRET, payload.encode("ascii"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        if int(expires_str) < int(time.time()):
            return None
        username = bytes.fromhex(encoded_user).decode("utf-8")
    except Exception:
        return None
    if secrets.compare_digest(username, core.DEFAULT_USERNAME):
        return username
    return None


def get_web_username(request: Request) -> Optional[str]:
    """Validate a Basic Authorization header or the session cookie.

    Returns the username on success, None otherwise. Never raises, so HTML
    routes can redirect to /login instead of triggering the browser's native
    Basic auth prompt.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header.split(" ", 1)[1]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except Exception:
            return None
        correct_username = secrets.compare_digest(username, core.DEFAULT_USERNAME)
        correct_password = secrets.compare_digest(password, core.DEFAULT_PASSWORD)
        if correct_username and correct_password:
            return username
        return None
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        return None
    return verify_session(token)


def _login_redirect() -> RedirectResponse:
    return RedirectResponse(url="/login", status_code=303)


async def _form_data(request: Request) -> Dict[str, str]:
    """Parse an application/x-www-form-urlencoded body.

    Starlette's request.form() requires python-multipart even for urlencoded
    bodies; HTML forms and htmx only ever send urlencoded here, so parse it
    directly and avoid the extra dependency.
    """
    body = (await request.body()).decode("utf-8", errors="replace")
    return dict(parse_qsl(body, keep_blank_values=True))


def get_logo_config() -> Dict[str, Any]:
    """Read the logo config from the active static dir's config.json."""
    static_dir = Path(os.getenv("OVOS_CONFIG_STATIC_DIR", str(_package_dir / "static")))
    try:
        data = json.loads((static_dir / "config.json").read_text())
        logo = data.get("logo")
        if isinstance(logo, dict) and logo.get("type") in ("image", "text"):
            return logo
    except Exception:
        pass
    return {"type": "text", "text": "OVOS"}


def _prepare_skill(skill_id: str, settings: Dict) -> Dict[str, Any]:
    """Build the template context for one skill card."""
    filtered = {k: v for k, v in settings.items() if k != FIRSTRUN_KEY}
    filtered = core.maybe_sort_settings(filtered)
    info = get_skill_info(skill_id)
    return {
        "id": skill_id,
        "settings": filtered,
        "name": info["name"],
        "author": info["author"],
        "count": len(filtered),
        "has_undo": skill_id in UNDO_SNAPSHOTS,
    }


def _prepare_skills() -> List[Dict[str, Any]]:
    skills = [
        _prepare_skill(skill["id"], skill["settings"])
        for skill in core.load_all_skills()
    ]
    # Non-empty skills first, each group sorted by display name
    skills.sort(key=lambda s: (s["count"] == 0, s["name"].casefold()))
    return skills


def _render_skill_card(request: Request, skill_id: str) -> Response:
    skill = core.SkillSettings(skill_id)
    return templates.TemplateResponse(
        request=request,
        name="partials/skill_card.html",
        context={"skill": _prepare_skill(skill_id, skill.settings), "open": True},
    )


# --- Path-based settings mutation helpers ---


def _parse_path(raw: str) -> List[PathSegment]:
    try:
        path = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid path") from exc
    if not isinstance(path, list) or not all(
        isinstance(seg, (str, int)) and not isinstance(seg, bool) for seg in path
    ):
        raise HTTPException(status_code=400, detail="Invalid path")
    return path


def _walk(document: Any, path: List[PathSegment]) -> Any:
    """Resolve a path against a settings document, 400 on any bad segment."""
    node = document
    for segment in path:
        if isinstance(node, dict) and isinstance(segment, str) and segment in node:
            node = node[segment]
        elif (
            isinstance(node, list)
            and isinstance(segment, int)
            and 0 <= segment < len(node)
        ):
            node = node[segment]
        else:
            raise HTTPException(status_code=400, detail="Invalid setting path")
    return node


def _parse_scalar(value_type: str, raw: str) -> Any:
    if value_type == "number":
        try:
            return int(raw)
        except ValueError:
            try:
                return float(raw)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400, detail="Invalid number input"
                ) from exc
    if value_type == "boolean":
        return raw == "true"
    if value_type == "object":
        return {}
    if value_type == "array":
        return []
    return raw


def _mutate_and_persist(skill_id: str, mutate) -> None:
    """Snapshot current settings, apply a mutation, and persist the result."""
    skill = core.SkillSettings(skill_id)
    current = skill.settings
    working = copy.deepcopy(current)
    mutate(working)
    UNDO_SNAPSHOTS[skill_id] = copy.deepcopy(current)
    skill.replace_settings(working)


def _set_at_path(document: Dict, path: List[PathSegment], value: Any) -> None:
    if not path:
        raise HTTPException(status_code=400, detail="Invalid setting path")
    parent = _walk(document, path[:-1])
    final = path[-1]
    if isinstance(parent, dict) and isinstance(final, str):
        parent[final] = value
    elif (
        isinstance(parent, list) and isinstance(final, int) and 0 <= final < len(parent)
    ):
        parent[final] = value
    else:
        raise HTTPException(status_code=400, detail="Invalid setting path")


def _delete_at_path(document: Dict, path: List[PathSegment]) -> None:
    if not path:
        raise HTTPException(status_code=400, detail="Invalid setting path")
    parent = _walk(document, path[:-1])
    final = path[-1]
    if isinstance(parent, dict) and isinstance(final, str) and final in parent:
        del parent[final]
    elif (
        isinstance(parent, list) and isinstance(final, int) and 0 <= final < len(parent)
    ):
        parent.pop(final)
    else:
        raise HTTPException(status_code=400, detail="Invalid setting path")


def _add_entry(
    document: Dict, container_path: List[PathSegment], key: str, value: Any
) -> None:
    container = _walk(document, container_path)
    if isinstance(container, dict):
        if not key:
            raise HTTPException(status_code=400, detail="Field key cannot be empty")
        container[key] = value
    elif isinstance(container, list):
        container.append(value)
    else:
        raise HTTPException(status_code=400, detail="Cannot add entry to target")


# --- Auth pages ---


@router.get("/login")
async def login_page(request: Request):
    if get_web_username(request):
        return RedirectResponse(url="/", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"logo": get_logo_config(), "error": None},
    )


@router.post("/login")
async def login_submit(request: Request):
    form = await _form_data(request)
    username = str(form.get("username", ""))
    password = str(form.get("password", ""))
    correct_username = secrets.compare_digest(username, core.DEFAULT_USERNAME)
    correct_password = secrets.compare_digest(password, core.DEFAULT_PASSWORD)
    if not (correct_username and correct_password):
        return templates.TemplateResponse(
            request=request,
            name="login.html",
            context={
                "logo": get_logo_config(),
                "error": "Invalid username or password",
            },
            status_code=401,
        )
    token = sign_session(username, int(time.time()) + SESSION_TTL_SECONDS)
    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
    )
    return response


@router.get("/logout")
async def logout(request: Request):
    response = _login_redirect()
    response.delete_cookie(AUTH_COOKIE_NAME)
    return response


# --- Pages ---


@router.get("/")
async def index(request: Request):
    username = get_web_username(request)
    if username is None:
        return _login_redirect()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "logo": get_logo_config(),
            "username": username,
            "skills": _prepare_skills(),
        },
    )


@router.get("/export")
async def export_settings(request: Request):
    if get_web_username(request) is None:
        return _login_redirect()
    skills = [
        {
            "id": skill["id"],
            "settings": core.maybe_sort_settings(
                {k: v for k, v in skill["settings"].items() if k != FIRSTRUN_KEY}
            ),
        }
        for skill in core.load_all_skills()
    ]
    skills.sort(key=lambda s: get_skill_info(s["id"])["name"].casefold())
    return Response(
        content=json.dumps(skills, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="skill-settings.json"'},
    )


# --- htmx mutation endpoints ---


@router.post("/web/skills/{skill_id}/set")
async def web_set_setting(skill_id: str, request: Request):
    if get_web_username(request) is None:
        return _login_redirect()
    form = await _form_data(request)
    path = _parse_path(str(form.get("path", "")))
    value = _parse_scalar(str(form.get("type", "string")), str(form.get("value", "")))
    _mutate_and_persist(skill_id, lambda doc: _set_at_path(doc, path, value))
    return _render_skill_card(request, skill_id)


@router.post("/web/skills/{skill_id}/add")
async def web_add_entry(skill_id: str, request: Request):
    if get_web_username(request) is None:
        return _login_redirect()
    form = await _form_data(request)
    container_path = _parse_path(str(form.get("container_path", "")))
    key = str(form.get("key", "")).strip()
    value = _parse_scalar(str(form.get("type", "string")), str(form.get("value", "")))
    _mutate_and_persist(
        skill_id, lambda doc: _add_entry(doc, container_path, key, value)
    )
    return _render_skill_card(request, skill_id)


@router.post("/web/skills/{skill_id}/delete")
async def web_delete_setting(skill_id: str, request: Request):
    if get_web_username(request) is None:
        return _login_redirect()
    form = await _form_data(request)
    path = _parse_path(str(form.get("path", "")))
    _mutate_and_persist(skill_id, lambda doc: _delete_at_path(doc, path))
    return _render_skill_card(request, skill_id)


@router.post("/web/skills/{skill_id}/undo")
async def web_undo(skill_id: str, request: Request):
    if get_web_username(request) is None:
        return _login_redirect()
    snapshot = UNDO_SNAPSHOTS.pop(skill_id, None)
    if snapshot is None:
        raise HTTPException(status_code=400, detail="Nothing to undo")
    core.SkillSettings(skill_id).replace_settings(snapshot)
    return _render_skill_card(request, skill_id)
