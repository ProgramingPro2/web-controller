const Store = require('electron-store');

class ConfigManager {
  constructor() {
    this.store = new Store({
      defaults: {
        port: 4141,
        perDevicePin: false,
        autoStart: false,
        minimizeToTray: true,
        controllerMapping: {}
      }
    });
  }

  get(key) {
    return this.store.get(key);
  }

  set(key, value) {
    this.store.set(key, value);
  }

  getAll() {
    return this.store.store;
  }

  reset() {
    this.store.clear();
  }
}

module.exports = ConfigManager;

