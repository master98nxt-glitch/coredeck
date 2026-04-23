[README.md](https://github.com/user-attachments/files/27006386/README.md)
# CoreDeck 🚀

> **Personal Command Center** — Lightning-fast launcher with fuzzy search, smart ranking, keyboard navigation, and intelligent command execution.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Mac%20%7C%20Linux-brightgreen)

## ✨ Features

- **⚡ Lightning Fast** — Instant fuzzy search with smart abbreviation matching
  - `yt` → YouTube
  - `gh` → GitHub
  - `ggl` → Google

- **🎯 Smart Ranking** — AI learns from your usage patterns and predicts what you need
  - Tracks usage frequency
  - Time-aware suggestions (work apps in morning, entertainment at night)
  - Recent items rank higher automatically

- **⌨️ Pure Keyboard Navigation** — No mouse needed
  - `↑↓` Navigate results
  - `Enter` Open selected item
  - `Esc` Clear and close

- **🔧 System Commands** — Quick access to Windows/Mac utilities
  - Settings, Task Manager, Terminal, Control Panel, etc.
  - Just type the command name

- **🎨 Multiple Themes** — Customize your look
  - Obsidian, Frost, Ember, Void, Cyber, Yin, Steel, Gold

- **📋 Flow System** — Execute multiple apps/URLs in sequence
  - Pre-built flows: work, study, chill, dev
  - Create custom flows easily

- **🧠 Natural Language** — Talk to CoreDeck like a human
  - "im bored" → chill flow
  - "start work" → work flow
  - "lets code" → dev flow

## 🚀 Quick Start

### Requirements
- Node.js 14+ 
- npm or yarn
- Windows 10+, macOS 10.13+, or Linux

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/master98nxt-glitch/coredeck.git
   cd coredeck
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run CoreDeck:**
   ```bash
   npm start
   ```

### Build for Distribution

**Windows:**
```bash
npm run build:win
```

**macOS:**
```bash
npm run build:mac
```

**Linux:**
```bash
npm run build:linux
```

Installers will be in the `dist/` folder.

## 🎮 Usage

### Launch CoreDeck
- **Keyboard Shortcut:** `Ctrl+Space` (Windows/Linux) or `Cmd+Space` (Mac)
- Or click the tray icon

### Quick Commands

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate results |
| `Enter` | Open selected |
| `Esc` | Close/Clear |
| `>` prefix | Enter GT mode for advanced commands |

### GT Mode (Advanced Commands)

```
> add              Open file picker to add new app
> yt <query>       Search YouTube
> g <query>        Search Google
> calc <expr>      Calculate math expression
> flow             List all flows
> flow run <n>     Run specific flow
```

### Example Searches

```
Google           Opens google.com
Notepad          Launches Notepad
Downloads        Opens Downloads folder
settings         Opens Windows Settings
task manager     Opens Task Manager
```

## 🏗️ Project Structure

```
coredeck/
├── main.js              # Electron main process
├── preload.js           # Security bridge
├── renderer.js          # Frontend logic
├── index.html           # UI markup
├── style.css            # Styling
├── package.json         # Dependencies
├── data.json            # Default data & flows
└── assets/              # Icons and resources
```

## 🔧 Configuration

### data.json Structure

```json
{
  "items": [
    {
      "id": "1",
      "name": "Google",
      "path": "https://google.com",
      "type": "url",
      "tags": ["web", "search"],
      "usage": 0,
      "lastOpened": 0
    }
  ],
  "flows": {
    "work": [...],
    "study": [...],
    "chill": [...],
    "dev": [...]
  }
}
```

**Types:** `url`, `app`, `folder`
**Tags:** Organize items for better searching

## 🎨 Themes

Switch themes by typing: `theme <name>`

Available themes:
- obsidian (dark, default)
- frost (cool blues)
- ember (warm reds)
- void (pure black)
- cyber (neon)
- yin (balanced)
- steel (metallic)
- gold (premium)

## 🧠 AI Brain Features

CoreDeck learns from your behavior:

- **Usage Tracking** — Items you open frequently rank higher
- **Pattern Recognition** — Learns which items you pick for each query
- **Time-Aware** — Suggests different items based on time of day
- **Trending Badge** — Shows recently used items with ⚡ badge
- **Predictive Badge** — Shows AI predictions with ✦ badge

## 🔒 Privacy & Security

- ✅ All data stored locally on your machine
- ✅ No cloud sync or external tracking
- ✅ No analytics or telemetry
- ✅ Open source — audit the code yourself
- ✅ Runs completely offline

## 🐛 Troubleshooting

### App won't start
```bash
rm -rf node_modules
npm install
npm start
```

### Keyboard shortcut not working
- Check if another app is using `Ctrl+Space`
- Restart CoreDeck

### Files not showing up
- Verify the file path is correct
- Use forward slashes on all platforms

## 📚 Development

### Dev Mode
```bash
npm run dev
```

### Scripts
```bash
npm start        # Run app
npm run dev      # Run with dev tools
npm run build    # Build all platforms
npm run build:win    # Build Windows installer
npm run build:mac    # Build macOS DMG
npm run build:linux  # Build Linux AppImage
```

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📝 License

MIT License — See LICENSE file for details

## 🙏 Acknowledgments

Built with [Electron](https://www.electronjs.org/) ⚛️

## 📞 Support

Having issues? 
- Check existing [Issues](https://github.com/master98nxt-glitch/coredeck/issues)
- Create a new issue with details
- Include screenshots if possible

---

**Made with ❤️ for productivity lovers**

⭐ If you find CoreDeck useful, please give it a star on GitHub!
