# macOS Setup for CRM_Automation

This folder contains helper scripts to set up and run the project on macOS (e.g. MacBook Air).

Files
- `install_deps.sh` — Install Homebrew (if missing), Python3, Node.js and project dependencies. Creates a Python virtualenv at `backend/.venv`.
- `start_servers.sh` — Start backend (uvicorn), WhatsApp gateway (node) and frontend (Next.js) in background and write logs to `logs/`.
- `stop_servers.sh` — Stop common development processes (best-effort).

Quick usage
1. Make scripts executable:
   ```bash
   chmod +x mac_setup/*.sh
   ```
2. Install dependencies (requires internet and Homebrew access):
   ```bash
   ./mac_setup/install_deps.sh
   ```
3. Start services:
   ```bash
   ./mac_setup/start_servers.sh
   ```
4. Stop services:
   ```bash
   ./mac_setup/stop_servers.sh
   ```

Notes
- `install_deps.sh` will create a Python virtual environment at `backend/.venv` and install packages from `backend/requirements.txt`.
- Modify ports by exporting env variables before running `start_servers.sh`:
  ```bash
  export BACKEND_PORT=8000
  export FRONTEND_PORT=3000
  ./mac_setup/start_servers.sh
  ```
- For production use, prefer process managers such as `pm2`, `tmux`, or system services.



