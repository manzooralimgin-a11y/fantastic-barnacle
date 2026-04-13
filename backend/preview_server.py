"""Preview-compatible dev server launcher.

Uses .venv-local site-packages so the preview sandbox can start the FastAPI
server without going through a shell script that may be restricted.
"""
import os
import sys

# ── Locate this file's directory (= backend/) ────────────────────────────────
backend_dir = os.path.dirname(os.path.abspath(__file__))

# ── Inject .venv-local site-packages so uvicorn + app deps are importable ───
venv_site = os.path.join(
    backend_dir, ".venv-local", "lib", "python3.12", "site-packages"
)
if os.path.isdir(venv_site):
    sys.path.insert(0, venv_site)

# ── Ensure backend/ is importable (for `app.*` imports) ─────────────────────
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# ── Change CWD so relative config paths inside the app resolve correctly ────
os.chdir(backend_dir)

import uvicorn  # noqa: E402 (imported after path manipulation)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("app.main:app", reload=True, host="0.0.0.0", port=port)
