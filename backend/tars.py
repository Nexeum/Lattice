"""Tars — Lattice's AI ops assistant.

FastAPI service (port 5004) that answers questions about the live platform:
it gathers containers, deployments, events and host health from the containers
service (forwarding the caller's bearer token) and asks a local LLM through an
OpenAI-compatible API to answer grounded ONLY on that context.

Config (env):
- LATTICE_AI_URL: OpenAI-compatible base URL. Defaults to Ollama at
  http://localhost:11434/v1 — LM Studio, llama.cpp, vLLM or any hosted
  OpenAI-compatible provider work too.
- LATTICE_AI_MODEL: model id (default llama3.2).
- LATTICE_AI_KEY: optional API key, sent as "Authorization: Bearer <key>" for
  hosted providers. Ollama ignores it.

Talks to the provider directly with `requests` (no SDK, no Mongo).
"""
import json
import os
from typing import List

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth_shared import cors_origins, require_user

DEFAULT_AI_URL = "http://localhost:11434/v1"
DEFAULT_MODEL = "llama3.2"
DEFAULT_CONTAINERS_URL = "http://localhost:5001"

WORKSPACE_PREFIX = "lat-"          # workspace parents: lat-<first 8 chars of room id>
MAX_MESSAGES = 20                  # per /chat request
MAX_CONTENT_CHARS = 8000           # per message
MAX_REPLY_TOKENS = 1024
TEMPERATURE = 0.3
MAX_DEPLOYMENT_LOOKUPS = 5         # bound context-gathering latency
MAX_PROVIDER_MODELS = 5            # listed in /health
EVENTS_LIMIT = 20
CONTEXT_TIMEOUT_SECONDS = 5        # per call to the containers service
LLM_TIMEOUT_SECONDS = 120          # local models can be slow on first load
HEALTH_PROBE_TIMEOUT_SECONDS = 2
VALID_ROLES = ("user", "assistant")
UNAVAILABLE = "unavailable"

SYSTEM_PROMPT_TEMPLATE = (
    "You are Tars, the operations assistant for Lattice, a local Docker "
    "orchestration platform where workspaces are Docker-in-Docker parent "
    "containers (named lat-*) that host nested containers, plugin installs, "
    "CI runs and declarative stack deployments. "
    "Be concise and answer in the user's language. "
    "Base your answers ONLY on the live platform context provided below; if "
    "something is missing or marked unavailable, say so instead of guessing. "
    "When helpful, suggest concrete Lattice actions: which container to "
    "inspect, whose logs or terminal to open, which deployment or CI run to "
    "check. "
    "Current platform state: {context}"
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ai_url() -> str:
    return (os.environ.get("LATTICE_AI_URL") or DEFAULT_AI_URL).rstrip("/")


def api_key() -> str:
    return (os.environ.get("LATTICE_AI_KEY") or "").strip()


def model_name() -> str:
    return os.environ.get("LATTICE_AI_MODEL") or DEFAULT_MODEL


def containers_url() -> str:
    return (os.environ.get("LATTICE_CONTAINERS_URL") or DEFAULT_CONTAINERS_URL).rstrip("/")


def unreachable_detail() -> str:
    return (
        f"No LLM endpoint at {ai_url()}. Install Ollama (https://ollama.com) and run: "
        "ollama pull llama3.2 — or point LATTICE_AI_URL at any OpenAI-compatible API."
    )


def provider_headers() -> dict:
    headers = {"content-type": "application/json"}
    key = api_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


def validate_messages(messages: List[ChatMessage]) -> List[dict]:
    """Enforce the /chat contract; returns provider-ready message dicts."""
    if not messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    if len(messages) > MAX_MESSAGES:
        raise HTTPException(status_code=400, detail=f"Too many messages (max {MAX_MESSAGES})")
    validated = []
    for index, message in enumerate(messages):
        if message.role not in VALID_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"messages[{index}].role must be one of {list(VALID_ROLES)}",
            )
        if not message.content or not message.content.strip():
            raise HTTPException(status_code=400, detail=f"messages[{index}].content must not be empty")
        if len(message.content) > MAX_CONTENT_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"messages[{index}].content exceeds {MAX_CONTENT_CHARS} characters",
            )
        validated.append({"role": message.role, "content": message.content})
    if validated[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="The last message must have role 'user'")
    return validated


# ---------------------------------------------------------------------------
# Live platform context (containers service, caller's token forwarded)
# ---------------------------------------------------------------------------

def _get_json(path: str, authorization: str, params: dict = None):
    response = requests.get(
        f"{containers_url()}{path}",
        headers={"Authorization": authorization} if authorization else {},
        params=params,
        timeout=CONTEXT_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def summarize_containers(containers: list) -> list:
    return [
        {
            "name": container.get("Names"),
            "image": container.get("Image"),
            "status": container.get("Status"),
        }
        for container in containers
        if isinstance(container, dict)
    ]


def workspace_parents(container_summaries: list) -> List[str]:
    names = [
        summary["name"] for summary in container_summaries
        if isinstance(summary.get("name"), str) and summary["name"].startswith(WORKSPACE_PREFIX)
    ]
    return names[:MAX_DEPLOYMENT_LOOKUPS]


def fetch_deployments(parents: List[str], authorization: str) -> dict:
    """One /deployments/{parent} lookup per workspace; 404 means the workspace
    simply has no declarative stack, so it is skipped silently."""
    deployments = {}
    for parent in parents:
        try:
            deployments[parent] = _get_json(f"/deployments/{parent}", authorization)
        except requests.HTTPError as error:
            if error.response is not None and error.response.status_code == 404:
                continue
            deployments[parent] = UNAVAILABLE
        except requests.RequestException:
            deployments[parent] = UNAVAILABLE
    return deployments


def gather_platform_context(authorization: str) -> dict:
    """Best-effort snapshot of the platform; every piece degrades to
    'unavailable' on its own so a flaky containers service never breaks chat."""
    context = {}
    try:
        context["containers"] = summarize_containers(_get_json("/containers", authorization))
    except Exception:
        context["containers"] = UNAVAILABLE
    try:
        context["host_health"] = _get_json("/system/health", authorization)
    except Exception:
        context["host_health"] = UNAVAILABLE
    try:
        context["recent_events"] = _get_json("/events", authorization, params={"limit": EVENTS_LIMIT})
    except Exception:
        context["recent_events"] = UNAVAILABLE
    if isinstance(context["containers"], list):
        context["deployments"] = fetch_deployments(
            workspace_parents(context["containers"]), authorization,
        )
    else:
        context["deployments"] = UNAVAILABLE
    return context


def build_system_prompt(context: dict) -> str:
    compact = json.dumps(context, separators=(",", ":"), default=str)
    return SYSTEM_PROMPT_TEMPLATE.format(context=compact)


# ---------------------------------------------------------------------------
# LLM provider (OpenAI-compatible chat completions; Ollama by default)
# ---------------------------------------------------------------------------

def extract_reply_text(payload: dict) -> str:
    try:
        text = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="The LLM provider returned no message content")
    if text is None:
        raise HTTPException(status_code=502, detail="The LLM provider returned no message content")
    return text


def _provider_error_message(response) -> str:
    try:
        body = response.json()
        error = body.get("error")
        if isinstance(error, dict):
            return error.get("message") or response.text
        return error or body.get("message") or response.text
    except ValueError:
        return response.text


def _raise_for_provider_error(response, model: str):
    message = _provider_error_message(response)
    model_missing = response.status_code == 404 or (
        response.status_code == 400 and "model" in str(message).lower()
    )
    if model_missing:
        raise HTTPException(
            status_code=502,
            detail=f"Model '{model}' not available — run: ollama pull {model}",
        )
    raise HTTPException(
        status_code=502,
        detail=f"LLM provider error ({response.status_code}): {message}",
    )


def call_llm(model: str, system_prompt: str, messages: List[dict]) -> str:
    try:
        response = requests.post(
            f"{ai_url()}/chat/completions",
            headers=provider_headers(),
            json={
                "model": model,
                "messages": [{"role": "system", "content": system_prompt}, *messages],
                "max_tokens": MAX_REPLY_TOKENS,
                "temperature": TEMPERATURE,
            },
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="The LLM provider timed out")
    except requests.RequestException:
        raise HTTPException(status_code=503, detail=unreachable_detail())

    if response.status_code >= 400:
        _raise_for_provider_error(response, model)
    try:
        return extract_reply_text(response.json())
    except ValueError:
        raise HTTPException(status_code=502, detail="The LLM provider returned an invalid response")


def probe_provider_models():
    """Returns (reachable: bool, model ids list)."""
    try:
        response = requests.get(
            f"{ai_url()}/models",
            headers=provider_headers(),
            timeout=HEALTH_PROBE_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json().get("data") or []
        ids = [entry.get("id") for entry in data if isinstance(entry, dict) and entry.get("id")]
        return True, ids[:MAX_PROVIDER_MODELS]
    except requests.HTTPError:
        # Endpoint answered (e.g. auth error on a hosted provider): reachable.
        return True, []
    except Exception:
        return False, []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def get_health(user=Depends(require_user)):
    reachable, provider_models = probe_provider_models()
    if not reachable:
        return {"configured": False, "detail": unreachable_detail()}
    return {"configured": True, "model": model_name(), "provider_models": provider_models}


@app.post("/chat")
async def chat(body: ChatRequest, user=Depends(require_user), authorization: str = Header(None)):
    messages = validate_messages(body.messages)
    context = gather_platform_context(authorization)
    reply = call_llm(model_name(), build_system_prompt(context), messages)
    return {"reply": reply, "model": model_name()}
