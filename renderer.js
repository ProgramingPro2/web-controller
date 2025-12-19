let currentPin = '------';
let connectionUrl = '';
let config = {};

async function init() {
  // Load initial data
  await loadPin();
  await loadConnectionUrl();
  await loadConfig();
  await updateControllerCount();

  // Set up PIN change listener
  window.electronAPI.onPinChange((pin) => {
    currentPin = pin;
    updatePinDisplay();
  });

  // Update controller count periodically
  setInterval(updateControllerCount, 2000);

  // Check if window should be locked
  checkWindowLock();
}

async function loadPin() {
  try {
    currentPin = await window.electronAPI.getPin();
    updatePinDisplay();
  } catch (error) {
    console.error('Error loading PIN:', error);
  }
}

function updatePinDisplay() {
  const pinValue = document.getElementById('pin-value');
  if (pinValue) {
    pinValue.textContent = currentPin;
  }
}

async function loadConnectionUrl() {
  try {
    connectionUrl = await window.electronAPI.getConnectionUrl();
    const urlElement = document.getElementById('connection-url');
    if (urlElement) {
      urlElement.textContent = connectionUrl;
    }
  } catch (error) {
    console.error('Error loading connection URL:', error);
  }
}

async function loadConfig() {
  try {
    config = await window.electronAPI.getConfig();
    
    // Populate form fields
    const portInput = document.getElementById('port');
    if (portInput) {
      portInput.value = config.port || 4141;
    }

    const perDevicePin = document.getElementById('per-device-pin');
    if (perDevicePin) {
      perDevicePin.checked = config.perDevicePin || false;
    }

    const autoStart = document.getElementById('auto-start');
    if (autoStart) {
      autoStart.checked = config.autoStart || false;
    }

    const minimizeToTray = document.getElementById('minimize-to-tray');
    if (minimizeToTray) {
      minimizeToTray.checked = config.minimizeToTray !== false;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

async function saveConfig() {
  try {
    const port = parseInt(document.getElementById('port').value);
    const perDevicePin = document.getElementById('per-device-pin').checked;
    const autoStart = document.getElementById('auto-start').checked;
    const minimizeToTray = document.getElementById('minimize-to-tray').checked;

    await window.electronAPI.setConfig('port', port);
    await window.electronAPI.setConfig('perDevicePin', perDevicePin);
    await window.electronAPI.setConfig('autoStart', autoStart);
    await window.electronAPI.setConfig('minimizeToTray', minimizeToTray);

    alert('Settings saved! Restart the application for port changes to take effect.');
  } catch (error) {
    console.error('Error saving config:', error);
    alert('Error saving settings: ' + error.message);
  }
}

async function updateControllerCount() {
  try {
    const count = await window.electronAPI.getControllerCount();
    const countElement = document.getElementById('controller-count');
    if (countElement) {
      countElement.textContent = count;
    }
  } catch (error) {
    console.error('Error updating controller count:', error);
  }
}

async function checkWindowLock() {
  // This will be called by main process if window needs PIN entry
  // For now, we'll show PIN entry if needed
}

async function submitPin() {
  const pinInput = document.getElementById('pin-input');
  const pin = pinInput.value.trim();

  if (pin.length !== 6 || !/^\d+$/.test(pin)) {
    alert('Please enter a valid 6-digit PIN');
    return;
  }

  try {
    const valid = await window.electronAPI.validatePin(pin);
    if (valid) {
      await window.electronAPI.showWindow();
      const pinEntrySection = document.getElementById('pin-entry-section');
      if (pinEntrySection) {
        pinEntrySection.classList.add('hidden');
      }
      pinInput.value = '';
    } else {
      alert('Invalid PIN');
      pinInput.value = '';
      pinInput.focus();
    }
  } catch (error) {
    console.error('Error validating PIN:', error);
    alert('Error validating PIN: ' + error.message);
  }
}

// Handle Enter key in PIN input
document.addEventListener('DOMContentLoaded', () => {
  const pinInput = document.getElementById('pin-input');
  if (pinInput) {
    pinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitPin();
      }
    });
  }

  init();
});

