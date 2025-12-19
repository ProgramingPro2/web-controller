class VirtualController {
  constructor(controllerId) {
    this.controllerId = controllerId;
    this.isConnected = false;
    
    // Stick positions (-1.0 to 1.0)
    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };
    
    // Buttons (boolean)
    this.buttons = {
      a: false,
      b: false,
      x: false,
      y: false,
      lb: false,
      rb: false,
      back: false,
      start: false,
      leftStick: false,
      rightStick: false
    };
    
    // Triggers (0.0 to 1.0)
    this.triggers = {
      lt: 0,
      rt: 0
    };
    
    // D-pad (0-8: 0=center, 1-8=directions)
    this.dpad = 0;
  }

  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  updateLeftStick(x, y) {
    this.leftStick.x = this.clamp(x, -1, 1);
    this.leftStick.y = this.clamp(y, -1, 1);
    this.applyState();
  }

  updateRightStick(x, y) {
    this.rightStick.x = this.clamp(x, -1, 1);
    this.rightStick.y = this.clamp(y, -1, 1);
    this.applyState();
  }

  updateButton(button, pressed) {
    if (this.buttons.hasOwnProperty(button)) {
      this.buttons[button] = pressed;
      this.applyState();
    }
  }

  updateTrigger(trigger, value) {
    if (this.triggers.hasOwnProperty(trigger)) {
      this.triggers[trigger] = this.clamp(value, 0, 1);
      this.applyState();
    }
  }

  updateDpad(direction) {
    this.dpad = direction;
    this.applyState();
  }

  updateFromInput(input) {
    if (input.leftStick) {
      this.updateLeftStick(input.leftStick.x, input.leftStick.y);
    }
    if (input.rightStick) {
      this.updateRightStick(input.rightStick.x, input.rightStick.y);
    }
    if (input.buttons) {
      Object.keys(input.buttons).forEach(button => {
        this.updateButton(button, input.buttons[button]);
      });
    }
    if (input.triggers) {
      Object.keys(input.triggers).forEach(trigger => {
        this.updateTrigger(trigger, input.triggers[trigger]);
      });
    }
    if (input.dpad !== undefined) {
      this.updateDpad(input.dpad);
    }
  }

  applyState() {
    throw new Error('applyState() must be implemented by subclass');
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  reset() {
    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };
    Object.keys(this.buttons).forEach(key => {
      this.buttons[key] = false;
    });
    this.triggers.lt = 0;
    this.triggers.rt = 0;
    this.dpad = 0;
    this.applyState();
  }
}

module.exports = VirtualController;

