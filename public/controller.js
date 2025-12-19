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
      start: false
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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('Connecting to:', wsUrl);
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.updateConnectionStatus(true);
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(false);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.updateConnectionStatus(false);
      this.attemptReconnect();
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.connect();
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnect attempts reached');
    }
  }

  handleMessage(message) {
    if (message.type === 'connected') {
      this.controllerId = message.controllerId;
      console.log('Assigned controller ID:', this.controllerId);
    } else if (message.type === 'pong') {
      // Heartbeat response
    }
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    
    if (connected) {
      statusEl.className = 'connection-status connected';
      statusText.textContent = 'Connected';
    } else {
      statusEl.className = 'connection-status disconnected';
      statusText.textContent = 'Disconnected';
    }
  }

  setupSticks() {
    this.setupStick('left', 'left-stick-base', 'left-stick-handle');
    this.setupStick('right', 'right-stick-base', 'right-stick-handle');
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
    const maxDistance = radius - handleRadius - 5; // Add small padding

    let active = false;
    let touchId = null;

    const updateStick = (x, y) => {
      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
      const angle = Math.atan2(dy, dx);

      const stickX = Math.cos(angle) * distance;
      const stickY = Math.sin(angle) * distance;

      handle.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

      // Normalize to -1 to 1
      const normalizedX = stickX / maxDistance;
      const normalizedY = stickY / maxDistance;

      if (side === 'left') {
        this.leftStick = { x: normalizedX, y: normalizedY };
        this.leftStickActive = true;
      } else {
        this.rightStick = { x: normalizedX, y: normalizedY };
        this.rightStickActive = true;
      }

      this.pendingUpdate = true;
    };

    const resetStick = () => {
      handle.style.transform = 'translate(-50%, -50%)';
      if (side === 'left') {
        this.leftStick = { x: 0, y: 0 };
        this.leftStickActive = false;
      } else {
        this.rightStick = { x: 0, y: 0 };
        this.rightStickActive = false;
      }
      this.pendingUpdate = true;
    };

    // Touch events
    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!active && e.touches.length > 0) {
        active = true;
        touchId = e.touches[0].identifier;
        handle.classList.add('active');
        updateStick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    base.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active && touchId !== null) {
        const touch = Array.from(e.touches).find(t => t.identifier === touchId);
        if (touch) {
          updateStick(touch.clientX, touch.clientY);
        }
      }
    }, { passive: false });

    base.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active) {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId);
        if (touch) {
          active = false;
          touchId = null;
          handle.classList.remove('active');
          resetStick();
        }
      }
    }, { passive: false });

    base.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      active = false;
      touchId = null;
      handle.classList.remove('active');
      resetStick();
    }, { passive: false });

    // Mouse events for desktop testing
    let mouseActive = false;
    base.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mouseActive = true;
      handle.classList.add('active');
      updateStick(e.clientX, e.clientY);
    });

    base.addEventListener('mousemove', (e) => {
      if (mouseActive) {
        e.preventDefault();
        e.stopPropagation();
        updateStick(e.clientX, e.clientY);
      }
    });

    base.addEventListener('mouseup', (e) => {
      if (mouseActive) {
        e.preventDefault();
        e.stopPropagation();
        mouseActive = false;
        handle.classList.remove('active');
        resetStick();
      }
    });

    base.addEventListener('mouseleave', (e) => {
      if (mouseActive) {
        e.preventDefault();
        e.stopPropagation();
        mouseActive = false;
        handle.classList.remove('active');
        resetStick();
      }
    });
  }

  setupButtons() {
    const buttonIds = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start'];
    
    buttonIds.forEach(buttonId => {
      const btn = document.getElementById(`btn-${buttonId}`);
      if (!btn) {
        console.warn(`Button ${buttonId} not found`);
        return;
      }

      const handleButton = (pressed) => {
        this.buttons[buttonId] = pressed;
        btn.classList.toggle('active', pressed);
        this.pendingUpdate = true;
      };

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButton(true);
      });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButton(false);
      });

      btn.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButton(false);
      });

      // Also support mouse events for desktop testing
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handleButton(true);
      });

      btn.addEventListener('mouseup', (e) => {
        e.preventDefault();
        handleButton(false);
      });

      btn.addEventListener('mouseleave', (e) => {
        e.preventDefault();
        handleButton(false);
      });
    });
  }

  setupDpad() {
    const dpadButtons = document.querySelectorAll('.dpad-btn');
    
    dpadButtons.forEach(btn => {
      const direction = parseInt(btn.getAttribute('data-direction'));
      
      const handleDpad = (pressed) => {
        if (pressed) {
          this.dpad = direction;
          btn.classList.add('active');
        } else {
          if (this.dpad === direction) {
            this.dpad = 0;
          }
          btn.classList.remove('active');
        }
        this.pendingUpdate = true;
      };

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleDpad(true);
      });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleDpad(false);
      });

      btn.addEventListener('touchcancel', (e) => {
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
        rt: this.buttons.rt ? 1.0 : 0.0
      },
      dpad: this.dpad
    };

    try {
      this.ws.send(JSON.stringify({
        type: 'input',
        data: input
      }));
    } catch (error) {
      console.error('Error sending input:', error);
    }
  }

  startUpdateLoop() {
    const loop = () => {
      const now = Date.now();
      if (now - this.lastSendTime >= this.sendInterval) {
        if (this.pendingUpdate || this.leftStickActive || this.rightStickActive) {
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
document.addEventListener('DOMContentLoaded', () => {
  new Controller();
});

