"""Follow-up Questions Generator.

A tiny standalone app: type a word, get six categories of follow-up
questions (scientific, practical, comparative, historical, causal,
critical), two questions each, every question in English and Romanian.

Reuses deepseek_client.py and the .env settings from this project.

Run with:  python followup_questions.py
Then open: http://localhost:8001
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import deepseek_client

# override=True so a key set in .env wins over a stale DEEPSEEK_API_KEY
# that may already be in the user's environment.
load_dotenv(override=True)

BASE_DIR = Path(__file__).resolve().parent

GROUPS = ["scientific", "practical", "comparative", "historical", "causal", "critical"]

app = FastAPI(title="Follow-up Questions")


class WordIn(BaseModel):
    word: str
    level: str = "complex"


def resolve_settings():
    return {
        "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        "api_key": os.environ.get("DEEPSEEK_API_KEY", ""),
    }


def system_prompt(level: str) -> str:
    level = "simple" if level == "simple" else "complex"
    style = (
        "Write thorough, detailed questions that go deeper into the topic at a "
        "technical level. Keep each question under 20 words."
        if level == "complex" else
        "Write every question in plain, everyday language that a non-expert can "
        "understand. Avoid jargon, technical terms, and academic phrasing. Keep "
        "each question short and concrete, and ground it in everyday life or "
        "familiar examples whenever possible."
    )
    return (
        "You generate follow-up questions for a single word or short topic.\n"
        "Return SIX groups, each with exactly 2 questions. Every question must be "
        'written in BOTH English (field "en") and Romanian (field "ro") — the same '
        "question, translated naturally so each one reads like a native speaker "
        "wrote it.\n\n"
        "Return JSON exactly of the form:\n"
        '{"scientific": [{"en": "...", "ro": "..."}, {"en": "...", "ro": "..."}],\n'
        ' "practical": [{"en": "...", "ro": "..."}, {"en": "...", "ro": "..."}],\n'
        ' "comparative": [{"en": "...", "ro": "..."}, {"en": "...", "ro": "..."}],\n'
        ' "historical": [{"en": "...", "ro": "..."}, {"en": "...", "ro": "..."}],\n'
        ' "causal": [{"en": "...", "ro": "..."}, {"en": "...", "ro": "..."}],\n'
        ' "critical": [{"en": "...", "ro": "..."}, {"en": "...", "ro": "..."}]}\n\n'
        "Each group approaches the word from its own angle:\n"
        "- scientific: explores the word deeper and conceptually — what it is, how it works, its underlying mechanisms or research.\n"
        "- practical: simple, everyday and actionable — a concrete real-life application or use.\n"
        "- comparative: compares the word with related or opposite concepts.\n"
        "- historical: asks how the word's idea evolved and what influenced it over time.\n"
        "- causal: asks what causes it and what its consequences are.\n"
        "- critical: raises the strongest objections, counterarguments, or weaknesses.\n\n"
        "Make every question specific to the word itself, not generic.\n\n"
        + style
    )


@app.post("/api/questions")
async def generate_questions(body: WordIn):
    word = body.word.strip()
    if not word:
        raise HTTPException(status_code=400, detail="Enter a word first.")

    level = "simple" if body.level == "simple" else "complex"
    settings = resolve_settings()
    messages = [
        {"role": "system", "content": system_prompt(level)},
        {"role": "user", "content": f"Word: {word}"},
    ]
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.5,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = result if isinstance(result, dict) else {}

    def clean_group(key):
        raw = result.get(key)
        if not isinstance(raw, list):
            return []
        out = []
        for item in raw[:2]:
            if not isinstance(item, dict):
                continue
            en = (item.get("en") or "").strip()
            ro = (item.get("ro") or "").strip()
            if en or ro:
                out.append({"en": en, "ro": ro})
        return out

    questions = {key: clean_group(key) for key in GROUPS}
    if not any(questions.values()):
        raise HTTPException(status_code=502, detail="The model did not return any questions.")
    return {"word": word, "level": level, "questions": questions}


@app.get("/", response_class=HTMLResponse)
def index():
    return HTML_PAGE


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Follow-up Questions</title>
<style>
  :root {
    --bg: #f5f4f1;
    --panel: #ffffff;
    --border: #e2e0da;
    --text: #23201b;
    --muted: #8a857c;
    --accent: #3b6fd4;
    --accent-soft: #e8effc;
    --accent-text: #2c54a8;
    --danger: #c0392b;
    --danger-soft: #fbeae8;
    --shadow: 0 2px 12px rgba(35, 32, 27, 0.08);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
    background: var(--bg);
  }

  header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 12px 20px;
    background: var(--panel); border-bottom: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-dot {
    width: 14px; height: 14px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #ffd28a, #d97b3a);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  }
  .brand h1 { font-size: 17px; margin: 0; letter-spacing: -0.2px; }
  .brand small { color: var(--muted); font-size: 12px; }

  #export-btn {
    padding: 8px 16px; font-size: 14px; font-weight: 600;
    border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
    background: var(--panel); color: var(--accent-text);
  }
  #export-btn:hover { background: var(--accent-soft); }
  #export-btn:disabled { opacity: 0.6; cursor: default; }

  .header-actions { display: flex; align-items: center; gap: 12px; }
  .switch { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; }
  .switch input { position: absolute; opacity: 0; pointer-events: none; }
  .switch-track {
    width: 38px; height: 22px; border-radius: 999px; background: var(--border);
    position: relative; transition: background 0.15s ease; flex: none;
  }
  .switch-track::after {
    content: ""; position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: left 0.15s ease;
  }
  .switch input:checked + .switch-track { background: var(--accent); }
  .switch input:checked + .switch-track::after { left: 19px; }
  .switch-label { color: var(--muted); min-width: 58px; }
  .switch input:checked ~ .switch-label { color: var(--accent-text); font-weight: 600; }

  main { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }

  #word-form { display: flex; gap: 10px; }
  #word-input {
    flex: 1; padding: 12px 14px; font-size: 15px;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--panel); color: var(--text);
    outline: none;
  }
  #word-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  #word-form button {
    padding: 12px 22px; font-size: 15px; font-weight: 600;
    border: none; border-radius: 8px; cursor: pointer;
    background: var(--accent); color: #fff;
  }
  #word-form button:disabled { opacity: 0.6; cursor: default; }

  .examples { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
  .examples .hint { font-size: 12px; color: var(--muted); align-self: center; }
  .chip {
    font-size: 13px; padding: 4px 12px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--panel);
    color: var(--accent-text); cursor: pointer;
  }
  .chip:hover { background: var(--accent-soft); }

  #status {
    margin-top: 18px; padding: 12px 14px; font-size: 14px;
    color: var(--muted); background: var(--panel);
    border: 1px solid var(--border); border-radius: 8px;
  }
  #error {
    margin-top: 18px; padding: 12px 14px; font-size: 14px;
    color: var(--danger); background: var(--danger-soft);
    border: 1px solid #f3c2bc; border-radius: 8px;
  }
  .hidden { display: none; }

  #results { margin-top: 20px; display: flex; flex-direction: column; gap: 16px; }
  .card {
    background: var(--panel); border: 1px solid var(--border);
    border-left: 4px solid var(--accent); border-radius: 10px;
    box-shadow: var(--shadow); overflow: hidden;
  }
  .card-head {
    display: flex; align-items: baseline; gap: 8px;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
  }
  .card-name { font-size: 15px; font-weight: 700; }
  .card-name-ro { font-size: 12px; color: var(--muted); }

  .q-list { padding: 8px 0; }
  .q-row { display: flex; gap: 12px; padding: 10px 16px; }
  .q-row + .q-row { border-top: 1px solid var(--border); }
  .q-num {
    flex: none; width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent-soft); color: var(--accent-text);
    font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    margin-top: 2px;
  }
  .q-text { flex: 1; min-width: 0; }
  .q-line { display: flex; gap: 8px; align-items: baseline; line-height: 1.45; font-size: 14px; }
  .q-line + .q-line { margin-top: 6px; }
  .badge {
    flex: none; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    padding: 2px 6px; border-radius: 4px; margin-top: 2px;
    background: var(--accent-soft); color: var(--accent-text);
  }
  .badge.ro { background: #ecf7f1; color: var(--green, #3a9d5d); }
  .q-text-en { color: var(--text); }
  .q-text-ro { color: var(--muted); font-style: italic; }

  .copy-btn {
    flex: none; align-self: flex-start; margin-top: 2px;
    width: 28px; height: 28px; padding: 0;
    border: none; border-radius: 6px; cursor: pointer;
    background: transparent; color: var(--muted);
    display: flex; align-items: center; justify-content: center;
    opacity: 0.45; transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .q-row:hover .copy-btn, .q-line:hover .copy-btn, .copy-btn:focus-visible { opacity: 1; }
  .copy-btn:hover { background: var(--accent-soft); color: var(--accent-text); }
  .copy-btn.copied { opacity: 1; color: var(--green, #3a9d5d); }
  .copy-inline { width: 20px; height: 20px; margin-left: 6px; align-self: center; }
</style>
</head>
<body>

<header>
  <div class="brand">
    <span class="brand-dot"></span>
    <h1>Follow-up Questions</h1>
    <small>EN + RO</small>
  </div>
  <div class="header-actions">
    <label class="switch" title="Switch between complex and simple questions">
      <input type="checkbox" id="simple-toggle" />
      <span class="switch-track"></span>
      <span class="switch-label" id="mode-label">Complex</span>
    </label>
    <button id="export-btn" disabled title="Download the questions as a Markdown file">Export .md</button>
  </div>
</header>

<main>
  <form id="word-form">
    <input id="word-input" type="text" placeholder="Type a word…" autocomplete="off" autofocus />
    <button id="generate-btn" type="submit">Generate</button>
  </form>

  <div class="examples">
    <span class="hint">Try:</span>
    <button class="chip" data-word="photosynthesis">photosynthesis</button>
    <button class="chip" data-word="gravity">gravity</button>
    <button class="chip" data-word="democracy">democracy</button>
    <button class="chip" data-word="coffee">coffee</button>
  </div>

  <div id="status" class="hidden"></div>
  <div id="error" class="hidden"></div>
  <div id="results"></div>
</main>

<script>
  const GROUPS = [
    { key: "scientific", label: "Scientific", labelRo: "științific",  color: "#3b6fd4" },
    { key: "practical",  label: "Practical",  labelRo: "practic",     color: "#3a9d5d" },
    { key: "comparative", label: "Comparative", labelRo: "comparativ", color: "#b98a1f" },
    { key: "historical", label: "Historical", labelRo: "istoric",     color: "#a55d2f" },
    { key: "causal",     label: "Causal",     labelRo: "cauzal",      color: "#7a5fb0" },
    { key: "critical",   label: "Critical",   labelRo: "critic",      color: "#c0392b" },
  ];

  const form = document.getElementById("word-form");
  const input = document.getElementById("word-input");
  const btn = document.getElementById("generate-btn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const resultsEl = document.getElementById("results");
  const exportBtn = document.getElementById("export-btn");
  const simpleToggle = document.getElementById("simple-toggle");
  const modeLabel = document.getElementById("mode-label");

  let lastWord = "";
  let lastLevel = "complex";
  let lastQuestions = null;

  function currentLevel() {
    return simpleToggle.checked ? "simple" : "complex";
  }

  simpleToggle.addEventListener("change", () => {
    modeLabel.textContent = simpleToggle.checked ? "Simple" : "Complex";
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.word;
      form.dispatchEvent(new Event("submit"));
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const word = input.value.trim();
    if (!word) return;

    const level = currentLevel();
    lastWord = "";
    lastLevel = level;
    lastQuestions = null;
    exportBtn.disabled = true;
    errorEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    statusEl.textContent = "Generating " + level + " follow-up questions for “" + word + "”…";
    statusEl.classList.remove("hidden");
    btn.disabled = true;

    try {
      const resp = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, level }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Request failed");
      lastWord = data.word || word;
      lastLevel = data.level || level;
      lastQuestions = data.questions;
      render(lastQuestions);
      exportBtn.disabled = false;
    } catch (err) {
      statusEl.classList.add("hidden");
      errorEl.textContent = err.message || "Something went wrong.";
      errorEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  });

  exportBtn.addEventListener("click", exportMarkdown);

  function exportMarkdown() {
    if (!lastQuestions) return;
    const mode = lastLevel === "simple" ? "Simple" : "Complex";
    const lines = [
      "# Follow-up Questions", "",
      "**Word:** " + lastWord,
      "**Mode:** " + mode, "",
    ];
    GROUPS.forEach(g => {
      const qs = (lastQuestions[g.key] || []).filter(q => q && (q.en || q.ro));
      if (!qs.length) return;
      lines.push("## " + g.label + " (" + g.labelRo + ")", "");
      qs.forEach((q, i) => {
        if (q.en) lines.push((i + 1) + ". **EN:** " + q.en);
        if (q.ro) lines.push("   **RO:** " + q.ro);
        lines.push("");
      });
    });
    const blob = new Blob([lines.join("\\n").trim() + "\\n"], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "followup_questions_" + sanitizeFilename(lastWord) + "_" + lastLevel + ".md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sanitizeFilename(s) {
    return (s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "word");
  }

  const CLIPBOARD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
  const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  function copyText(text, btn) {
    const originalTitle = btn.title || "Copy";
    const done = () => {
      const original = btn.innerHTML;
      btn.innerHTML = CHECK_SVG;
      btn.classList.add("copied");
      btn.title = "Copied";
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove("copied");
        btn.title = originalTitle;
      }, 1200);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    ta.remove();
  }

  function render(questions) {
    statusEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    GROUPS.forEach(g => {
      const qs = (questions[g.key] || []).filter(q => q && (q.en || q.ro));
      if (!qs.length) return;

      const card = document.createElement("div");
      card.className = "card";
      card.style.borderLeftColor = g.color;

      const head = document.createElement("div");
      head.className = "card-head";
      head.innerHTML = '<span class="card-name"></span><span class="card-name-ro"></span>';
      head.querySelector(".card-name").textContent = g.label;
      head.querySelector(".card-name-ro").textContent = g.labelRo;

      const list = document.createElement("div");
      list.className = "q-list";
      qs.forEach((q, i) => {
        const row = document.createElement("div");
        row.className = "q-row";
        const inner = '<span class="q-num">' + (i + 1) + '</span>' +
          '<div class="q-text">' +
          langLine("en", q) +
          langLine("ro", q) +
          '</div>';
        row.innerHTML = inner;
        const enEl = row.querySelector(".q-text-en");
        if (enEl) enEl.textContent = q.en;
        const roEl = row.querySelector(".q-text-ro");
        if (roEl) roEl.textContent = q.ro;
        wireCopyButtons(row);
        list.appendChild(row);
      });

      card.appendChild(head);
      card.appendChild(list);
      resultsEl.appendChild(card);
    });
  }

  function langLine(lang, q) {
    const text = q[lang] || "";
    if (!text) return "";
    const isRo = lang === "ro";
    const badge = isRo ? '<span class="badge ro">RO</span>' : '<span class="badge">EN</span>';
    const textClass = isRo ? "q-text-ro" : "q-text-en";
    const title = isRo ? "Copy Romanian question" : "Copy English question";
    return '<div class="q-line">' + badge +
      '<span class="' + textClass + '"></span>' +
      '<button type="button" class="copy-btn copy-inline" title="' + title +
      '" aria-label="' + title + '">' + CLIPBOARD_SVG + '</button>' +
      '</div>';
  }

  function wireCopyButtons(row) {
    row.querySelectorAll(".q-line").forEach(line => {
      const btn = line.querySelector(".copy-btn");
      const textEl = line.querySelector(".q-text-en, .q-text-ro");
      if (!btn || !textEl) return;
      btn.addEventListener("click", () => copyText(textEl.textContent, btn));
    });
  }
</script>
</body>
</html>
"""


def main():
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    print(f"Follow-up Questions running at http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
