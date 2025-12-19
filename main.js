const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const ConfigManager = require("./src/config-manager");
const PinManager = require("./src/pin-manager");
const ControllerManager = require("./src/controller-manager");
const WebSocketServer = require("./src/websocket-server");
const AutoLaunch = require("auto-launch");

// Add --no-sandbox flag for Linux to avoid sandbox permission issues
if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
}

let mainWindow = null;
let tray = null;
let configManager = null;
let pinManager = null;
let controllerManager = null;
let wsServer = null;
let autoLauncher = null;
let windowLocked = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "assets", "icon.png"),
    show: false,
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("close", (event) => {
    const minimizeToTray = configManager.get("minimizeToTray");
    if (minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      windowLocked = true; // Lock window when minimized
      if (tray) {
        tray.displayBalloon({
          title: "Web Controller",
          content: "Application minimized to tray. Click icon to restore.",
        });
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");

  // Fallback to a default icon if custom icon doesn't exist
  let actualIconPath = iconPath;
  if (!fs.existsSync(iconPath)) {
    // Use Electron's default icon or create a simple one
    actualIconPath = iconPath; // Will use system default if file doesn't exist
  }

  try {
    tray = new Tray(actualIconPath);
  } catch (error) {
    console.error("Error creating tray icon:", error);
    // Create tray without icon (will use default)
    tray = new Tray(iconPath);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Window",
      click: () => {
        showWindowWithPin();
      },
    },
    {
      label: "Current PIN: " + pinManager.getCurrentPin(),
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Web Controller");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    showWindowWithPin();
  });

  // Update PIN in tray menu periodically
  setInterval(() => {
    if (tray && contextMenu) {
      contextMenu.items[1].label = "Current PIN: " + pinManager.getCurrentPin();
      tray.setContextMenu(contextMenu);
    }
  }, 1000);
}

async function showWindowWithPin() {
  if (!mainWindow) {
    createWindow();
  }

  if (windowLocked) {
    // Show window with PIN entry
    mainWindow.show();
    mainWindow.focus();
    // Send message to renderer to show PIN entry
    mainWindow.webContents.send("show-pin-entry");
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function setupAutoLaunch() {
  // Get the executable path - use process.execPath in production, app.getPath('exe') in packaged app
  const exePath = app.isPackaged ? app.getPath("exe") : process.execPath;

  autoLauncher = new AutoLaunch({
    name: "Web Controller",
    path: exePath,
    isHidden: true,
  });

  const autoStart = configManager.get("autoStart");
  if (autoStart) {
    autoLauncher.enable().catch((err) => {
      console.error("Error enabling auto-launch:", err);
    });
  } else {
    autoLauncher.disable().catch((err) => {
      console.error("Error disabling auto-launch:", err);
    });
  }
}

async function initializeServices() {
  try {
    // Initialize managers
    configManager = new ConfigManager();
    pinManager = new PinManager();
    controllerManager = new ControllerManager();

    // Initialize WebSocket server
    const port = configManager.get("port") || 4141;
    wsServer = new WebSocketServer(port, controllerManager, pinManager);
    await wsServer.start();

    // Set up PIN change notifications
    pinManager.onPinChange((pin) => {
      console.log(`[PIN] PIN changed to: ${pin}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("pin-changed", pin);
      }
    });

    // Log initial PIN
    console.log(`[PIN] Initial PIN: ${pinManager.getCurrentPin()}`);

    console.log("Services initialized successfully");
  } catch (error) {
    console.error("Error initializing services:", error);
    dialog.showErrorBox(
      "Initialization Error",
      `Failed to initialize services: ${error.message}\n\nPlease check console for details.`
    );
  }
}

function setupIpcHandlers() {
  ipcMain.handle("get-pin", () => {
    return pinManager.getCurrentPin();
  });

  ipcMain.handle("get-connection-url", () => {
    return wsServer ? wsServer.getConnectionUrl() : "Not available";
  });

  ipcMain.handle("get-config", () => {
    return configManager.getAll();
  });

  ipcMain.handle("set-config", (event, key, value) => {
    configManager.set(key, value);

    // Handle special config changes
    if (key === "autoStart") {
      setupAutoLaunch();
    }

    return true;
  });

  ipcMain.handle("validate-pin", (event, pin) => {
    const valid = pinManager.validatePin(pin);
    if (valid) {
      windowLocked = false;
      // Hide PIN entry section - let renderer handle it via the return value
      // The renderer will hide it when it receives the valid response
    }
    return valid;
  });

  ipcMain.handle("show-window", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  });

  ipcMain.handle("get-controller-count", () => {
    return controllerManager ? controllerManager.getControllerCount() : 0;
  });

  ipcMain.handle("get-client-list", () => {
    return wsServer ? wsServer.getClientList() : [];
  });
}

app.whenReady().then(async () => {
  await initializeServices();
  createWindow();
  createTray();
  setupAutoLaunch();
  setupIpcHandlers();

  // Lock window initially (require PIN to access when hidden)
  windowLocked = false; // Start unlocked so config UI is accessible on first launch

  // Show window on startup
  const minimizeToTray = configManager.get("minimizeToTray");
  if (!minimizeToTray) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    // Even if minimize to tray, show once on first launch
    mainWindow.show();
    mainWindow.focus();
    // Lock after showing initially
    setTimeout(() => {
      windowLocked = true;
    }, 1000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep app running on Windows/Linux when all windows are closed
    // (we have system tray)
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", async () => {
  // Cleanup
  if (pinManager) {
    pinManager.stopRotation();
  }

  if (controllerManager) {
    await controllerManager.removeAllControllers();
  }

  if (wsServer) {
    await wsServer.stop();
  }
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
});
