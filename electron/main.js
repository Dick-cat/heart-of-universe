const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { promisify } = require('util');

const fsMkdir = promisify(fs.mkdir);
const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);
const fsReaddir = promisify(fs.readdir);
const fsStat = promisify(fs.stat);
const fsUnlink = promisify(fs.unlink);

const windows = new Set();
let server;

const isDev = process.env.NODE_ENV === 'development';
const SERVER_PORT = 3000;

const BACKUPS_DIR = path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS = 20;

async function ensureBackupsDir() {
  try {
    await fsMkdir(BACKUPS_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function backupFilePath(name) {
  const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_');
  return path.join(BACKUPS_DIR, `${safeName}.json`);
}

async function writeBackup(name, data) {
  await ensureBackupsDir();
  const filePath = backupFilePath(name);
  await fsWriteFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  await pruneOldBackups();
  return filePath;
}

async function readBackup(name) {
  const filePath = backupFilePath(name);
  const content = await fsReadFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function listBackups() {
  await ensureBackupsDir();
  const entries = await fsReaddir(BACKUPS_DIR);
  const files = await Promise.all(
    entries
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        const full = path.join(BACKUPS_DIR, f);
        const stat = await fsStat(full);
        return { name: f.replace(/\.json$/, ''), path: full, size: stat.size, mtime: stat.mtime.getTime() };
      })
  );
  return files.sort((a, b) => b.mtime - a.mtime);
}

async function pruneOldBackups() {
  const backups = await listBackups();
  if (backups.length <= MAX_BACKUPS) return;
  const toDelete = backups.slice(MAX_BACKUPS);
  await Promise.all(toDelete.map((b) => fsUnlink(b.path).catch(() => {})));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    title: '宇宙之心',
    icon: path.join(__dirname, '../public/icon.ico'),
    backgroundColor: '#0a0a0f',
    titleBarOverlay: {
      color: '#0a0a0f',
      symbolColor: '#e2e8f0',
    },
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenu(null);
  windows.add(win);

  if (isDev) {
    win.loadURL(`http://localhost:${SERVER_PORT}`);
    win.webContents.openDevTools();
  } else {
    startServerAndLoad(win);
  }

  win.on('closed', () => {
    windows.delete(win);
  });

  return win;
}

async function startServerAndLoad(win) {
  if (server) {
    win.loadURL(`http://localhost:${SERVER_PORT}`);
    return;
  }

  const appDir = path.join(process.resourcesPath, 'app.asar');

  try {
    const next = require(path.join(appDir, 'node_modules', 'next'));
    const nextApp = next({
      dev: false,
      dir: appDir,
      quiet: true,
    });
    const handle = nextApp.getRequestHandler();

    await nextApp.prepare();

    server = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error('Request handling error:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      });
    });

    await new Promise((resolve, reject) => {
      server.listen(SERVER_PORT, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    win.loadURL(`http://localhost:${SERVER_PORT}`);
  } catch (err) {
    console.error('Failed to start Next.js server:', err);
    win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<h1>启动失败</h1><pre>${err.stack || err.message}</pre>`
      )}`
    );
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // Allow camera access for local visual supervision; all processing stays on-device.
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  createWindow();

  ipcMain.handle('open-window', () => {
    createWindow();
  });

  ipcMain.handle('write-backup', async (_event, name, data) => {
    try {
      return { success: true, path: await writeBackup(name, data) };
    } catch (err) {
      console.error('write-backup error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('read-backup', async (_event, name) => {
    try {
      return { success: true, data: await readBackup(name) };
    } catch (err) {
      console.error('read-backup error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('list-backups', async () => {
    try {
      return { success: true, backups: await listBackups() };
    } catch (err) {
      console.error('list-backups error:', err);
      return { success: false, error: err.message };
    }
  });
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
    server = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
