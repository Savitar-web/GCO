const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const APP_URL = 'https://gco-one.vercel.app'

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 820,
    minWidth: 360,
    minHeight: 640,
    title: 'GymCogOrigins',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
  })

  win.loadURL(APP_URL)

  // Enlaces externos (si los hubiera) en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})