# Web Controller

Phone-to-Gamepad Controller System - Control games using your phone as a virtual Xbox controller.

## Features

- **Touch Joysticks**: Full dual-stick support with touch controls
- **Complete Button Layout**: A, B, X, Y, triggers, bumpers, and D-pad
- **Multiple Controllers**: Support unlimited simultaneous phone controllers
- **PIN Security**: Rotating PIN (changes every 30 seconds) for secure access
- **Background Operation**: Runs in system tray, starts on boot
- **Cross-Platform**: Windows and Linux support

## Installation

### Prerequisites

- Node.js 16+ and npm
- Windows: Windows 10/11 (for XInput support)
- Linux: uinput access (user must be in `input` group or have `/dev/uinput` permissions)

### Linux Setup

For Linux, you need uinput access to create virtual controllers. Run one of the following:

```bash
# Option 1: Add user to input group (recommended)
sudo usermod -a -G input $USER
# Then log out and log back in

# Option 2: Temporary access (requires sudo each time)
sudo chmod 666 /dev/uinput
```

**Important**: After setup, the virtual controller will appear as a real gamepad in your system. You can verify it's working by:
- Running `jstest /dev/input/js0` (or js1, js2, etc.) to test the controller
- Checking `ls -la /dev/input/js*` to see available gamepad devices
- Using a gamepad tester application

### Development Setup

1. Clone or download this repository
2. Install dependencies:
```bash
npm install
```

3. Run the application:
```bash
npm start
```

**Note**: The start script includes `--no-sandbox` flag to avoid Linux sandbox permission issues. For production builds, you may want to properly configure the Electron sandbox by running:
```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

## Building Executables

### Windows

```bash
npm run build:win
```

This creates a Windows installer in the `dist` folder.

### Linux

```bash
npm run build:linux
```

This creates an AppImage and a launcher script in the `dist` folder.

**Running the AppImage:**
- **Recommended**: Use the launcher script (includes `--no-sandbox` flag automatically):
  ```bash
  ./dist/web-controller-launcher.sh
  ```
- **Alternative**: Run the AppImage directly with the flag:
  ```bash
  ./dist/Web\ Controller-1.0.0.AppImage --no-sandbox
  ```

## Usage

1. **Start the Application**: Run the executable or `npm start`
2. **Get Connection Info**: The config window shows:
   - Current PIN (changes every 30 seconds)
   - Connection URL (e.g., `http://192.168.1.100:4141`)
3. **Connect Your Phone**: 
   - Ensure your phone is on the same Wi-Fi network
   - Open the connection URL in your phone's browser
4. **Control**: Use touch joysticks and buttons on your phone to control games

## Configuration

The configuration window allows you to:

- **WebSocket Port**: Change the server port (default: 4141)
- **Per-Device PIN**: Require PIN for each phone connection
- **Auto-Start**: Start application on system boot
- **Minimize to Tray**: Keep app running in system tray when window is closed

## Security

- PIN rotates every 30 seconds automatically
- PIN required to access configuration window when minimized
- Per-device PIN option for additional security

## Virtual Controller Implementation

### Windows

Uses XInput API for virtual controller creation. The current implementation includes a mock layer - for production use, you'll need to integrate with an XInput library such as:
- `xinput-node`
- `node-xinput`
- Or implement direct XInput calls

### Linux

Uses uinput for virtual controller creation. The current implementation includes a mock layer - for production use, you'll need to integrate with:
- `node-uinput`
- Or implement direct uinput ioctl calls

**Note**: The virtual controller implementations currently log state to console. Replace the mock implementations with actual platform APIs for production use.

## Troubleshooting

### Connection Issues

- Ensure phone and computer are on the same Wi-Fi network
- Check firewall settings (port 4141 must be open)
- Verify the connection URL is correct

### Controller Not Working

- **Windows**: May require administrator rights for virtual controller creation
- **Linux**: Ensure uinput access (see Linux Setup above)
- Check console logs for errors

### PIN Not Working

- PIN changes every 30 seconds - use the current PIN shown in config window
- Ensure you're entering the 6-digit PIN correctly

### Electron Sandbox Error (Linux)

If you see an error about chrome-sandbox permissions:
- The start script includes `--no-sandbox` flag which should resolve this
- For proper sandbox setup (optional), run:
  ```bash
  sudo chown root:root node_modules/electron/dist/chrome-sandbox
  sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
  ```
  Then remove `--no-sandbox` from the start script in package.json

## Development

### Project Structure

```
web-controller/
├── main.js                 # Electron main process
├── preload.js              # Preload script (security)
├── index.html              # Config UI
├── renderer.js             # Renderer process
├── src/
│   ├── websocket-server.js      # WebSocket server
│   ├── controller-manager.js    # Controller management
│   ├── virtual-controller.js    # Base controller class
│   ├── virtual-controller-windows.js  # Windows implementation
│   ├── virtual-controller-linux.js    # Linux implementation
│   ├── pin-manager.js      # PIN rotation
│   └── config-manager.js   # Configuration
└── public/
    ├── index.html          # Phone web interface
    ├── controller.js       # Phone controller logic
    └── styles.css          # Phone UI styles
```

## License

MIT

