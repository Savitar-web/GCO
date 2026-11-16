const { app, BrowserWindow, shell, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const APP_ORIGIN = 'https://gco-one.vercel.app'

async function installPackagedWeb() {
  const root = path.resolve(app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'dist'))
  protocol.handle('https', async request => {
    const url = new URL(request.url)
    if (url.origin !== APP_ORIGIN) return net.fetch(request, { bypassCustomProtocolHandlers: true })
    let relative
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') } catch { return new Response('Invalid path', {status:400}) }
    let file = path.resolve(root, relative)
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('Forbidden', {status:403})
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(relative)) return new Response('Not found', {status:404})
      file = path.join(root, 'index.html')
    }
    return net.fetch(pathToFileURL(file).toString())
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000, height: 800, minWidth: 360, minHeight: 540,
    title: 'GymCogOrigins', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  win.loadURL(APP_ORIGIN)
  win.webContents.setWindowOpenHandler(({url}) => {
    const destination = new URL(url)
    if (destination.origin === APP_ORIGIN) {
      win.loadURL(url)
    } else if (['https:', 'http:'].includes(destination.protocol)) {
      shell.openExternal(url)
    }
    return {action:'deny'}
  })
}
app.whenReady().then(async () => {
  await installPackagedWeb()
  createWindow()
  app.on('activate', () => {if (BrowserWindow.getAllWindows().length === 0) createWindow()})
})
app.on('window-all-closed', () => {if (process.platform !== 'darwin') app.quit()})
