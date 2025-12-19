class Controller {
  constructor() {
    this.ws = null;
    this.controllerId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;

    // Stick state
    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };
    this.leftStickActive = false;
    this.rightStickActive = false;

    // Button state
    this.buttons = {
      a: false,
      b: false,
      x: false,
      y: false,
      lb: false,
      rb: false,
      lt: false,
      rt: false,
      back: false,
      start: false,
    };

    // D-pad state
    this.dpad = 0;

    // Send rate limiting
    this.sendInterval = 16; // ~60fps
    this.lastSendTime = 0;
    this.pendingUpdate = false;

    this.init();
  }

  init() {
    this.setupSticks();
    this.setupButtons();
    this.setupDpad();
    this.connect();
    this.startUpdateLoop();
  }

  connect() {
    // Show PIN entry screen first
    this.showPinEntry();
  }

  showPinEntry() {
    const pinScreen = document.getElementById("pin-entry-screen");
    const controllerContainer = document.getElementById("controller-container");
    const pinInput = document.getElementById("pin-input");
    const pinSubmitBtn = document.getElementById("pin-submit-btn");
    const pinError = document.getElementById("pin-error");

    if (pinScreen) {
      pinScreen.style.display = "flex";
    }
    if (controllerContainer) {
      controllerContainer.style.display = "none";
    }

    // Focus on PIN input
    if (pinInput) {
      pinInput.focus();
      pinInput.value = "";
    }

    // Handle PIN submission
    const submitPin = () => {
      const pin = pinInput.value.trim();
      if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        this.showPinError("Please enter a valid 6-digit PIN");
        return;
      }

      this.validatePin(pin);
    };

    if (pinSubmitBtn) {
      pinSubmitBtn.onclick = submitPin;
    }

    if (pinInput) {
      pinInput.onkeypress = (e) => {
        if (e.key === "Enter") {
          submitPin();
        }
      };
    }
  }

  hidePinEntry() {
    const pinScreen = document.getElementById("pin-entry-screen");
    const controllerContainer = document.getElementById("controller-container");

    if (pinScreen) {
      pinScreen.style.display = "none";
    }
    if (controllerContainer) {
      controllerContainer.style.display = "block";
    }
  }

  showPinError(message) {
    const pinError = document.getElementById("pin-error");
    if (pinError) {
      pinError.textContent = message;
      pinError.classList.remove("hidden");
    }
  }

  hidePinError() {
    const pinError = document.getElementById("pin-error");
    if (pinError) {
      pinError.classList.add("hidden");
    }
  }

  validatePin(pin) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connected, sending PIN...");
      // Send PIN for validation
      this.ws.send(
        JSON.stringify({
          type: "pin-submit",
          pin: pin,
        })
      );
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "pin-required") {
        // Server requires PIN, but we already sent it
        console.log("Server requires PIN (already sent)");
      } else if (message.type === "pin-valid") {
        console.log("PIN validated successfully");
        this.hidePinEntry();
        this.hidePinError();
      } else if (message.type === "pin-invalid") {
        console.log("PIN validation failed");
        this.showPinError("Invalid PIN. Please try again.");
        const pinInput = document.getElementById("pin-input");
        if (pinInput) {
          pinInput.value = "";
          pinInput.focus();
        }
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
      } else if (message.type === "connected") {
        console.log("Controller connected:", message.controllerId);
        this.controllerId = message.controllerId;
        this.reconnectAttempts = 0;
        this.updateConnectionStatus(true);
        this.hidePinEntry();
        this.hidePinError();
      } else if (message.type === "pong") {
        // Keep-alive response
      } else {
        // Handle other messages (input updates, etc.)
        this.handleMessage(message);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.updateConnectionStatus(false);
    };

    this.ws.onclose = () => {
      console.log("WebSocket closed");
      this.updateConnectionStatus(false);
      this.controllerId = null;
      this.ws = null;

      // If PIN was invalid, show PIN entry again
      // Otherwise, attempt reconnect if we were connected
      if (this.controllerId === null) {
        // Was never connected, show PIN entry again
        setTimeout(() => {
          this.showPinEntry();
        }, 1000);
      } else if (this.reconnectAttempts < this.maxReconnectAttempts) {
        // Was connected, attempt reconnect
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, this.reconnectDelay);
      }
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(
          `Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
        );
        this.connect();
      }, this.reconnectDelay);
    } else {
      console.error("Max reconnect attempts reached");
    }
  }

  handleMessage(message) {
    // This is now handled in validatePin's onmessage handler
    // Keeping for backward compatibility if needed
    if (message.type === "connected") {
      this.controllerId = message.controllerId;
      console.log("Assigned controller ID:", this.controllerId);
    } else if (message.type === "pong") {
      // Heartbeat response
    }
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById("connection-status");
    const statusText = document.getElementById("status-text");

    if (connected) {
      statusEl.className = "connection-status connected";
      statusText.textContent = "Connected";
    } else {
      statusEl.className = "connection-status disconnected";
      statusText.textContent = "Disconnected";
    }
  }

  setupSticks() {
    this.setupStick("left", "left-stick-base", "left-stick-handle");
    this.setupStick("right", "right-stick-base", "right-stick-handle");
  }

  setupStick(side, baseId, handleId) {
    const base = document.getElementById(baseId);
    const handle = document.getElementById(handleId);

    if (!base || !handle) {
      console.error(`Stick elements not found: ${baseId}, ${handleId}`);
      return;
    }

    const radius = base.offsetWidth / 2;
    const handleRadius = handle.offsetWidth / 2;
    // Maximum movement distance - allow handle to move almost to edge with good range
    const maxDistance = radius - 10; // Good range while keeping handle visible

    let active = false;
    let touchId = null;

    const updateStick = (x, y) => {
      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate offset from center (direction from center to touch point)
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Clamp distance to maxDistance and normalize direction
      const clampedDistance = Math.min(distance, maxDistance);
      const scale = distance > 0 ? clampedDistance / distance : 1;

      // Calculate stick position - INVERT both axes so handle moves toward touch point
      const stickX = -dx * scale;
      const stickY = -dy * scale;

      // Apply transform - move handle in the same direction as touch
      // The handle is centered at -50%, -50%, so we add the offset
      handle.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

      // Normalize to -1 to 1 for sending to server (don't invert for server)
      const normalizedX = (dx * scale) / maxDistance;
      const normalizedY = (dy * scale) / maxDistance;

      if (side === "left") {
        this.leftStick = { x: normalizedX, y: normalizedY };
        this.leftStickActive = true;
      } else {
        this.rightStick = { x: normalizedX, y: normalizedY };
        this.rightStickActive = true;
      }

      this.pendingUpdate = true;
    };

    const resetStick = () => {
      handle.style.transform = "translate(-50%, -50%)";
      if (side === "left") {
        this.leftStick = { x: 0, y: 0 };
        this.leftStickActive = false;
      } else {
        this.rightStick = { x: 0, y: 0 };
        this.rightStickActive = false;
      }
      this.pendingUpdate = true;
    };

    // Touch events
    base.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!active && e.touches.length > 0) {
          active = true;
          touchId = e.touches[0].identifier;
          handle.classList.add("active");
          updateStick(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      { passive: false }
    );

    base.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (active && touchId !== null) {
          const touch = Array.from(e.touches).find(
            (t) => t.identifier === touchId
          );
          if (touch) {
            updateStick(touch.clientX, touch.clientY);
          }
        }
      },
      { passive: false }
    );

    base.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (active) {
          const touch = Array.from(e.changedTouches).find(
            (t) => t.identifier === touchId
          );
          if (touch) {
            active = false;
            touchId = null;
            handle.classList.remove("active");
            resetStick();
          }
        }
      },
      { passive: false }
    );

    base.addEventListener(
      "touchcancel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        active = false;
        touchId = null;
        handle.classList.remove("active");
        resetStick();
      },
      { passive: false }
    );

    // Mouse events for desktop testing
    let mouseActive = false;
    base.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      mouseActive = true;
      handle.classList.add("active");
      updateStick(e.clientX, e.clientY);
    });

    base.addEventListener("mousemove", (e) => {
      if (mouseActive) {
        e.preventDefault();
        e.stopPropagation();
        updateStick(e.clientX, e.clientY);
      }
    });

    base.addEventListener("mouseup", (e) => {
      if (mouseActive) {
        e.preventDefault();
        e.stopPropagation();
        mouseActive = false;
        handle.classList.remove("active");
        resetStick();
      }
    });

    base.addEventListener("mouseleave", (e) => {
      if (mouseActive) {
        e.preventDefault();
        e.stopPropagation();
        mouseActive = false;
        handle.classList.remove("active");
        resetStick();
      }
    });
  }

  setupButtons() {
    const buttonIds = [
      "a",
      "b",
      "x",
      "y",
      "lb",
      "rb",
      "lt",
      "rt",
      "back",
      "start",
    ];

    buttonIds.forEach((buttonId) => {
      const btn = document.getElementById(`btn-${buttonId}`);
      if (!btn) {
        console.warn(`Button ${buttonId} not found`);
        return;
      }

      const handleButton = (pressed) => {
        this.buttons[buttonId] = pressed;
        btn.classList.toggle("active", pressed);
        this.pendingUpdate = true;
      };

      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButton(true);
      });

      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButton(false);
      });

      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButton(false);
      });

      // Also support mouse events for desktop testing
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handleButton(true);
      });

      btn.addEventListener("mouseup", (e) => {
        e.preventDefault();
        handleButton(false);
      });

      btn.addEventListener("mouseleave", (e) => {
        e.preventDefault();
        handleButton(false);
      });
    });
  }

  setupDpad() {
    const dpadButtons = document.querySelectorAll(".dpad-btn");

    dpadButtons.forEach((btn) => {
      const direction = parseInt(btn.getAttribute("data-direction"));

      const handleDpad = (pressed) => {
        if (pressed) {
          this.dpad = direction;
          btn.classList.add("active");
        } else {
          if (this.dpad === direction) {
            this.dpad = 0;
          }
          btn.classList.remove("active");
        }
        this.pendingUpdate = true;
      };

      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        handleDpad(true);
      });

      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        handleDpad(false);
      });

      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        handleDpad(false);
      });
    });
  }

  sendInput() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const input = {
      leftStick: this.leftStick,
      rightStick: this.rightStick,
      buttons: { ...this.buttons },
      triggers: {
        lt: this.buttons.lt ? 1.0 : 0.0,
        rt: this.buttons.rt ? 1.0 : 0.0,
      },
      dpad: this.dpad,
    };

    try {
      this.ws.send(
        JSON.stringify({
          type: "input",
          data: input,
        })
      );
    } catch (error) {
      console.error("Error sending input:", error);
    }
  }

  startUpdateLoop() {
    const loop = () => {
      const now = Date.now();
      if (now - this.lastSendTime >= this.sendInterval) {
        if (
          this.pendingUpdate ||
          this.leftStickActive ||
          this.rightStickActive
        ) {
          this.sendInput();
          this.pendingUpdate = false;
          this.lastSendTime = now;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// Initialize controller when page loads
document.addEventListener("DOMContentLoaded", () => {
  new Controller();
});
