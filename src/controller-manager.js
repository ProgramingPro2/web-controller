const os = require('os');
const VirtualController = require('./virtual-controller');
const WindowsVirtualController = require('./virtual-controller-windows');
const LinuxVirtualController = require('./virtual-controller-linux');

class ControllerManager {
  constructor() {
    this.controllers = new Map();
    this.nextControllerId = 0;
    this.platform = os.platform();
    
    // Determine which controller implementation to use
    if (this.platform === 'win32') {
      this.ControllerClass = WindowsVirtualController;
    } else if (this.platform === 'linux') {
      this.ControllerClass = LinuxVirtualController;
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async createController() {
    const controllerId = this.nextControllerId++;
    const controller = new this.ControllerClass(controllerId);
    
    const connected = await controller.connect();
    if (!connected) {
      throw new Error(`Failed to create virtual controller ${controllerId}`);
    }
    
    this.controllers.set(controllerId, controller);
    console.log(`Created virtual controller ${controllerId} (${this.controllers.size} total)`);
    
    return controllerId;
  }

  async removeController(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (controller) {
      await controller.disconnect();
      this.controllers.delete(controllerId);
      console.log(`Removed virtual controller ${controllerId} (${this.controllers.size} remaining)`);
    }
  }

  getController(controllerId) {
    return this.controllers.get(controllerId);
  }

  updateController(controllerId, input) {
    const controller = this.controllers.get(controllerId);
    if (controller) {
      controller.updateFromInput(input);
    } else {
      console.warn(`Controller ${controllerId} not found`);
    }
  }

  getAllControllers() {
    return Array.from(this.controllers.values());
  }

  getControllerCount() {
    return this.controllers.size;
  }

  async removeAllControllers() {
    const promises = Array.from(this.controllers.keys()).map(id => 
      this.removeController(id)
    );
    await Promise.all(promises);
  }
}

module.exports = ControllerManager;

