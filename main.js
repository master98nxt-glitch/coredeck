'use strict';

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Tray, Menu, nativeImage, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { exec } = require('child_process');

const DATA_FILE    = path.join(app.getPath('userData'), 'data.json');
const DEFAULT_DATA = {
  items: [
    { id:'1', name:'Google',     path:'https://google.com',                          type:'url',    tags:['web','search'], usage:0, lastOpened:0 },
    { id:'2', name:'GitHub',     path:'https://github.com',                          type:'url',    tags:['web','dev'],    usage:0, lastOpened:0 },
    { id:'3', name:'YouTube',    path:'https://youtube.com',                         type:'url',    tags:['web','media'],  usage:0, lastOpened:0 },
    { id:'4', name:'Notepad',    path:'C:\\Windows\\notepad.exe',                    type:'app',    tags:['tools','text'], usage:0, lastOpened:0 },
    { id:'5', name:'Calculator', path:'C:\\Windows\\System32\\calc.exe',             type:'app',    tags:['tools','math'], usage:0, lastOpened:0 },
    { id:'6', name:'Downloads',  path:path.join(app.getPath('home'),'Downloads'),   type:'folder', tags:['system','files'], usage:0, lastOpened:0 },
    { id:'7', name:'Documents',  path:app.getPath('documents'),                      type:'folder', tags:['system','files'], usage:0, lastOpened:0 }
  ],
  recentCommands: [],
  notes: 'Welcome to CoreDeck!\n\nType "help" for commands.\nUse ↑↓ to navigate, Enter to open.'
};

let win = null, tray = null;

// ── SECURITY HELPERS ───────────────────────────────────────────────────────
const ALLOWED_URL_PROTOCOLS  = ['https:', 'http:'];
const ALLOWED_APP_EXTENSIONS = ['.exe', '.bat', '.cmd', '.lnk', '.app', '.sh'];

function isSafeUrl(u) {
  try {
    const { protocol } = new URL(u);
    return ALLOWED_URL_PROTOCOLS.includes(protocol);
  } catch { return false; }
}

function isSafePath(p) {
  if (!path.isAbsolute(p))  return false; // must be a full path, not relative
  if (p.includes('..'))     return false; // no directory traversal
  const ext = path.extname(p).toLowerCase();
  return ext === '' || ALLOWED_APP_EXTENSIONS.includes(ext); // folders (no ext) or known safe extensions only
}
// ──────────────────────────────────────────────────────────────────────────

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
}

function buildTrayIcon() {
  const p = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(p)) return nativeImage.createFromPath(p).resize({ width:16, height:16 });
  return nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIUlEQVQ4jWNgYGD4z8BAAAAEgAF/Qq4oAAAAABJRU5ErkJggg==');
}

function createWindow() {
  win = new BrowserWindow({
    width:1200, height:760, minWidth:800, minHeight:550,
    frame:false, show:false, skipTaskbar:true, backgroundColor:'#13131a',
    icon: path.join(__dirname,'assets','icon.png'),
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:false }
  });
  win.loadFile('index.html');
  ipcMain.handle('window-minimize',     () => win.minimize());
  ipcMain.handle('window-maximize',     () => win.isMaximized() ? win.unmaximize() : win.maximize());
  ipcMain.handle('window-close',        () => hideWindow());
  ipcMain.handle('window-is-maximized', () => win.isMaximized());
  win.on('maximize',   () => win.webContents.send('window-state-change', true));
  win.on('unmaximize', () => win.webContents.send('window-state-change', false));
  win.on('close', e => { e.preventDefault(); hideWindow(); });
}

function showWindow()  { if(!win) return; win.setSkipTaskbar(false); win.center(); win.show(); win.focus(); win.webContents.send('focus-search'); }
function hideWindow()  { if(!win) return; win.setSkipTaskbar(true); win.hide(); }
function toggleWindow(){ if(!win) return; (win.isVisible()&&win.isFocused()) ? hideWindow() : showWindow(); }

function createTray() {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('CoreDeck — Ctrl+Space to toggle');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label:'Show CoreDeck', click:()=>showWindow() },
    { type:'separator' },
    { label:'Quit CoreDeck', click:()=>{ app.removeAllListeners('window-all-closed'); win.removeAllListeners('close'); app.quit(); }}
  ]));
  tray.on('click',       ()=>toggleWindow());
  tray.on('double-click',()=>showWindow());
}

const SYSTEM_CMDS = {
  'settings':'start ms-settings:','control panel':'start control','control':'start control',
  'task manager':'start taskmgr','taskmgr':'start taskmgr','notepad':'start notepad',
  'cmd':'start cmd','command prompt':'start cmd',
  'terminal':process.platform==='win32'?'start cmd':'open -a Terminal',
  'explorer':'start explorer','file explorer':'start explorer','paint':'start mspaint',
  'wordpad':'start wordpad','calc':'start calc','calculator':'start calc',
  'device manager':'start devmgmt.msc','disk management':'start diskmgmt.msc',
  'registry':'start regedit','regedit':'start regedit','snip':'start snippingtool',
  'snipping tool':'start snippingtool','store':'start ms-windows-store:','windows store':'start ms-windows-store:',
};

ipcMain.handle('open-item', async (_e, itemPath, type) => {
  try {
    if (type === 'url') {
      if (!isSafeUrl(itemPath)) return { success:false, error:'Blocked: unsafe URL protocol' };
      await shell.openExternal(itemPath);
    } else {
      if (!isSafePath(itemPath)) return { success:false, error:'Blocked: unsafe file path' };
      const r = await shell.openPath(itemPath);
      if (r) return { success:false, error:r };
    }
    return { success:true };
  } catch(err) { return { success:false, error:err.message }; }
});

ipcMain.handle('run-system-cmd', async (_e, keyword) => {
  const cmd = SYSTEM_CMDS[keyword.trim().toLowerCase()];
  if (!cmd) return {success:false,notFound:true};
  return new Promise(res => exec(cmd,{shell:true},err => err ? res({success:false,error:err.message}) : res({success:true})));
});

// ── FILE PICKER ────────────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async (_e, opts = {}) => {
  if (!win) return { canceled: true };
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const filters = isWin
    ? [{ name:'Applications', extensions:['exe','bat','cmd','lnk'] }, { name:'All Files', extensions:['*'] }]
    : isMac
      ? [{ name:'Applications', extensions:['app'] }, { name:'All Files', extensions:['*'] }]
      : [{ name:'All Files', extensions:['*'] }];
  const result = await dialog.showOpenDialog(win, {
    title: opts.title || 'Select Application',
    properties: ['openFile'],
    filters
  });
  return result;
});

ipcMain.handle('read-data',  ()     => { try{ ensureDataFile(); return JSON.parse(fs.readFileSync(DATA_FILE,'utf-8')); } catch{ return DEFAULT_DATA; } });
ipcMain.handle('write-data', (_e,d) => { try{ ensureDataFile(); fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2),'utf-8'); return {success:true}; } catch(e){ return {success:false,error:e.message}; } });
ipcMain.handle('get-data-path', ()  => DATA_FILE);

app.whenReady().then(() => {
  ensureDataFile(); createWindow(); createTray();
  globalShortcut.register('CommandOrControl+Space', toggleWindow);
  app.on('activate', () => { if(!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('will-quit',         () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});
