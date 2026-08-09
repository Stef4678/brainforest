"""Async client for the DeepSeek chat completions API (OpenAI-compatible).

Yields SSE-style event dicts while streaming the response:
    {"type": "delta",     "content": "..."}   model output
    {"type": "reasoning", "content": "..."}   chain-of-thought (thinking mode)
Raises DeepSeekError / ApiKeyError on failure.
"""

import json

import httpx

DEFAULT_TIMEOUT = httpx.Timeout(120.0, connect=10.0)


class DeepSeekError(Exception):
    pass


class ApiKeyError(DeepSeekError):
    pass


def _chat_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return base + "/chat/completions"
    return base + "/v1/chat/completions"


async def stream_chat(messages, *, model, temperature, thinking, api_key, base_url, max_tokens=2048):
    if not api_key:
        raise ApiKeyError(
            "No DeepSeek API key configured. Set DEEPSEEK_API_KEY in the .env file "
            "or add it in Settings."
        )

    url = _chat_url(base_url)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": float(temperature),
        "stream": True,
        "max_tokens": max_tokens,
    }
    if thinking:
        payload["thinking"] = {"type": "enabled"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", "replace")
                try:
                    detail = json.loads(body)
                    message = detail.get("error", {}).get("message", body)
                except json.JSONDecodeError:
                    message = body
                raise DeepSeekError(
                    f"DeepSeek API returned {resp.status_code}: {message}"
                )

            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[len("data: "):].strip()
                if data == "[DONE]":
                    return
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta", {})
                reasoning = delta.get("reasoning_content")
                if reasoning:
                    yield {"type": "reasoning", "content": reasoning}
                content = delta.get("content")
                if content:
                    yield {"type": "delta", "content": content}


async def chat_json(messages, *, model, temperature, api_key, base_url, max_tokens=1024):
    """Non-streaming completion that returns parsed JSON.

    Forced into json_object mode with thinking disabled so the model returns a
    clean, parseable JSON object (used by idea extraction).
    """
    if not api_key:
        raise ApiKeyError(
            "No DeepSeek API key configured. Set DEEPSEEK_API_KEY in the .env file "
            "or add it in Settings."
        )

    url = _chat_url(base_url)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": float(temperature),
        "stream": False,
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
        # Thinking mode is off so the whole token budget goes to the JSON answer
        # (reasoning tokens otherwise crowd out long translations and truncate
        # the output mid-JSON).
        "thinking": {"type": "disabled"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            body = resp.text
            try:
                detail = json.loads(body)
                message = detail.get("error", {}).get("message", body)
            except json.JSONDecodeError:
                message = body
            raise DeepSeekError(
                f"DeepSeek API returned {resp.status_code}: {message}"
            )
        try:
            content = resp.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            raise DeepSeekError("DeepSeek API returned an unexpected response")
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            raise DeepSeekError("DeepSeek API did not return valid JSON")
