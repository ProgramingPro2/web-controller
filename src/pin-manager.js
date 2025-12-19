class PinManager {
  constructor() {
    this.currentPin = this.generatePin();
    this.rotationInterval = null;
    this.listeners = [];
    this.startRotation();
  }

  generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  startRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }

    this.rotationInterval = setInterval(() => {
      this.currentPin = this.generatePin();
      this.notifyListeners();
    }, 30000);
  }

  stopRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }

  getCurrentPin() {
    return this.currentPin;
  }

  validatePin(pin) {
    return pin === this.currentPin;
  }

  onPinChange(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.currentPin);
      } catch (error) {
        console.error('Error in PIN change listener:', error);
      }
    });
  }
}

module.exports = PinManager;

