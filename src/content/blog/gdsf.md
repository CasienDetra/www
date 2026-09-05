---
draft: false
date: "30-01-2026"
title: "download folder from github repo without cloning the whole project"
description: "Download a specific folder from any public GitHub repository without cloning the entire project."
category: "tool"
tags: ["golang", "cli", "typescript", "open-source", "tui"]
author: "Yanouk"
---

# GDSF — GitHub Download Sub-Folder

Download a specific folder from any public GitHub repository without cloning the entire project.

## Features

- **Interactive TUI** — browse repos, navigate directories, multi-select files and folders with live side-panel preview
- **Multi-folder downloads** — select multiple folders across any directory level to download together
- **CLI mode** — pass a GitHub link directly for quick one-off downloads
- **Live progress bar** — per-file byte-level progress during download
- **GitHub token support** — set `GITHUB_TOKEN` to avoid API rate limits (60 → 5000 req/hr)
- **Recursive downloads** — fetches all files and subdirectories automatically
- **Cross-platform** — works on Windows, macOS, and Linux

## Installation

```bash
git clone https://github.com/CasienDetra/GDSF.git
cd GDSF
go build -o gdsf .
```

Or run directly:

```bash
go run .
```

## Usage

### Interactive TUI (no arguments)

```bash
./gdsf
```

1. Enter the **owner** and **repo** (tab to switch between fields), or press **u** to paste a GitHub URL directly
2. Press **Enter** to load the repository
3. Navigate the file tree and select files or folders:
   - `↑↓` — move selection
   - `→` / `Enter` — enter a directory
   - `←` / `Backspace` — go up one directory
   - `Space` — toggle selection of the highlighted file or folder (selected items appear on the right side)
   - `a` — select/toggle current directory
   - `Tab` — switch focus between file tree and Selected Items panel (press `x` to remove, `c` to clear)
   - `d` / `s` — proceed to download selected folder(s)
4. Set an output directory name (or leave blank for current dir)
5. Press **Enter** to start downloading

### CLI mode (with link)

```bash
./gdsf https://github.com/owner/repo/tree/main/path/to/folder
./gdsf -d ./output https://github.com/owner/repo/tree/main/path/to/folder
```

## GitHub Token

Without a token, GitHub allows 60 API requests per hour. Browsing directories burns through that fast. With a token, you get 5000 req/hr.

### Get a token

1. Go to **https://github.com/settings/tokens** (Settings → Developer settings → Personal access tokens → Tokens (classic))
2. Click **Generate new token** (classic)
3. Name it, set expiration, **no scopes needed** for public repos
4. Copy the token (you won't see it again)

### Set it

**Windows PowerShell (permanent):**

```powershell
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "ghp_yourtokenhere", "User")
```

**Linux/macOS (permanent):**

```bash
echo 'export GITHUB_TOKEN="ghp_yourtokenhere"' >> ~/.bashrc
source ~/.bashrc
```

The app reads `GITHUB_TOKEN` automatically — no flags needed.

## Keybindings (TUI)

| Key               | Action                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `Tab`             | Switch between Owner / Repo fields (or Left/Right panels in Browse) |
| `u`               | URL mode (or paste GitHub link directly)                            |
| `Esc`             | Back / Exit URL mode / Return from Selected panel                   |
| `Enter`           | Load repo / Enter directory / Start download                        |
| `↑↓`              | Navigate list                                                       |
| `←` / `Backspace` | Go up one directory                                                 |
| `Space`           | Select / unselect highlighted file or folder                        |
| `a`               | Select / unselect current folder                                    |
| `d` / `s`         | Proceed to download selected item(s)                                |
| `x` / `Delete`    | Remove item from selection (in Selected panel)                      |
| `c`               | Clear all selections (in Selected panel)                            |
| `q` / `Ctrl+C`    | Quit                                                                |

## Project Structure

```
GDSF/
├── cmd/main.go                  # Entry point (TUI or CLI)
├── internal/
│   ├── cli/args.go              # CLI argument parsing
│   ├── downloader/downloader.go # Recursive download with progress
│   ├── github/                  # GitHub API (contents, default branch)
│   └── tui/                     # Bubbletea TUI (browse, confirm, progress)
├── go.mod
└── README.md
```

## License

MIT
