CoreDeck

CoreDeck is an open-source, lightweight keyboard launcher and automation utility designed for
Windows and Linux. It allows you to instant-launch applications, web links, and file directories
entirely from your home row, featuring intelligent local ranking and multi-action sequential workflows.
version: 1.1.0 license: MIT platform: Windows | Mac | Linux

Features

Fuzzy Search & Abbreviations: Instantly matches queries using short-hand tags (e.g., yt for YouTube,
gh for GitHub).
Adaptive Local Ranking: Tracks usage patterns, recency, and time-of-day history to surface your most
relevant tools when you need them.
Sequential Workflows (Flows): Chain multiple apps, directories, or links together to launch complete
environments (e.g., triggering a dev or `chill` workflow with one command).
Pure Keyboard Navigation: Full focus on speed. Move through menus without touching your mouse.
Local-First Privacy: Zero cloud synchronization, zero tracking, and zero telemetry. All paths, notes, and
metrics remain localized on your hard drive.

Quick Start

Installation

For users running from source, ensure you have Node.js (v14+) installed.
1. Clone the repository:

git clone https://github.com/master98nxt-glitch/coredeck.git
cd coredeck

2. Install dependencies:

npm install

3. Start the application:
•

•

•

•
•

CoreDeck v1.1.0 Launcher Manual 1

npm start

Tip: Windows users can alternatively grab the pre-compiled standalone executable directly from the Releases
tab.

Global Hotkey
Windows / Linux: Ctrl + Space

Navigation & Console Commands

Core Shortcuts
↑ / ↓ or Ctrl + J / Ctrl + K : Navigate up and down through search results.
Enter : Execute the selected item or flow.
Esc : Clear the input window or hide the overlay.
Advanced Action Console (GT Mode)
Prefix your input string with > to access targeted operations:
Command Syntax Action Behavior
> add Opens a native system file picker to index an app or folder.
> yt <query> Launches your browser directly into a YouTube search.
> g <query> Launches your browser directly into a Google search.
> calc <expr> Evaluates algebraic expressions inline.
> flow Displays all configured automation sequences.
> flow run <name> Instantly fires a sequence from the workflow inventory.
theme <name> Changes the visual look of the UI instantly (No prefix required).
•
•

•
•
•

CoreDeck v1.1.0 Launcher Manual 2

Available Themes

Switch themes on the fly by typing theme <name> directly into the search bar:
obsidian (Default Matrix Dark)
frost (Cool Blues)
ember (Warm Crimson)
void (Deep Pure Black)
cyber (Neon/Synthwave)
yin (High-Contrast Monochrome)
steel (Industrial Metallic)
gold (Premium Accents)

Project Architecture

coredeck/
├── main.js # Electron main process (lifecycle & shortcuts)
├── preload.js # Context isolation bridge
├── renderer.js # Front-end UI logic, filtering, and key listeners
├── index.html # Window layout
├── style.css # Core interface styling & theme configurations
├── data.json # Local storage matrix for profiles and flows
└── package.json # Project manifest & build targets

Distribution Compiling
To bundle and compile a standalone production binary for your current environment:

# Windows
npm run build:win
# macOS
npm run build:mac
# Linux
npm run build:linux

Compiled targets will be generated inside your local /dist directory.
•
•
•
•
•
•
•
•

CoreDeck v1.1.0 Launcher Manual 3

Troubleshooting

Hotkey Conflicts: If Ctrl + Space fails to call up the terminal, verify that another background service
(such as PowerToys, Raycast, or global system shortcuts) is not capturing the event.
Directory Path Failures: When adding paths manually to data.json , ensure you use forward slashes
( / ) consistently across all OS distributions to prevent tracking breaks.
Dependency Errors: If the application crashes on start, clear out the workspace caches and reinstall:

rm -rf node_modules package-lock.json && npm install

Project Origin & Contributing

CoreDeck was built out of a personal desire for a minimal, modular workspace launcher tailored to a local
workflow. Built using software engineering assistance from LLMs, breaking, and
refactoring.
Pull Requests, bug fixes, and feature implementations (especially native desktop integrations) are highly
welcome. Feel free to open an issue or submit a fork!
License: idk use whatever you want it was a side 3am thought projet
