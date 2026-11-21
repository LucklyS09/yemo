'use strict';

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');

app.setName('墨夜');

let mainWindow = null;
let serverHandle = null;
let quitting = false;

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0e1118',
    title: '墨夜',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  window.loadURL(serverHandle.url);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    (async () => {
      try {
        await Promise.race([
          window.webContents.executeJavaScript('window.__inkFlush ? window.__inkFlush() : true'),
          new Promise((resolve) => setTimeout(resolve, 700)),
        ]);
      } catch {
        // Closing should not be blocked by a renderer already going away.
      }
      quitting = true;
      if (!window.isDestroyed()) window.close();
    })();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (serverHandle && url.startsWith(serverHandle.url)) return { action: 'allow' };
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  const localOrigin = new URL(serverHandle.url).origin;
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin)) event.preventDefault();
  });

  mainWindow = window;
  return window;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    process.env.INK_OPEN = '0';
    process.env.INK_DATA_DIR = path.join(app.getPath('userData'), 'data');

    try {
      const { start } = require('../server.js');
      serverHandle = await start({ port: 0, quiet: true, openBrowser: false });
      createWindow();
    } catch (error) {
      dialog.showErrorBox('墨夜启动失败', error?.stack || error?.message || String(error));
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    try {
      serverHandle?.server?.close();
    } catch {
      // The process is already leaving.
    }
  });

  app.on('activate', () => {
    if (!mainWindow && serverHandle) createWindow();
  });
}
