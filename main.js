const { app, BrowserWindow } = require('electron')
const path = require('path')

let splash
let mainWindow

function createSplash() {
  splash = new BrowserWindow({
    width: 600,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
  })
  splash.loadFile('splash.html')

  setTimeout(() => {
    createMainWindow()
    splash.close()
  }, 3000) // show splash for 3 seconds
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 650,
    fullscreen: true,
    icon: path.join(__dirname, 'assets/logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
  mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  createSplash()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
