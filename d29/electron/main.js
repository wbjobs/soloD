const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let noiseCalculator;
try {
  noiseCalculator = require('../build/Release/noise_calculator');
} catch (e) {
  console.log('C++ addon not found, using JavaScript fallback');
  noiseCalculator = require('./noise_calculator_fallback');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('calculate-noise', async (event, circuitData) => {
  try {
    const result = noiseCalculator.calculateNoise(circuitData);
    return result;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('monte-carlo-analysis', async (event, circuitData, options) => {
  try {
    const result = noiseCalculator.monteCarloAnalysis 
      ? noiseCalculator.monteCarloAnalysis(circuitData, options)
      : require('./noise_calculator_fallback').monteCarloAnalysis(circuitData, options);
    return result;
  } catch (error) {
    console.error('Monte Carlo error:', error);
    throw error;
  }
});
