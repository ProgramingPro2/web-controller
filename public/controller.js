// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let reconnectTimeout = null;

// Connection state
let isConnected = false;
let controllerId = null;
let requiresPin = false;
let pendingPin = null; // Store PIN if entered before connection is ready

// Input state
const inputState = {
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    buttons: {
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
    },
    triggers: {
        lt: 0,
        rt: 0
    },
    dpad: 0
};

// Joystick state
const joysticks = {
    left: {
        element: null,
        base: null,
        stick: null,
        active: false,
        centerX: 0,
        centerY: 0,
        radius: 0,
        currentX: 0,
        currentY: 0
    },
    right: {
        element: null,
        base: null,
        stick: null,
        active: false,
        centerX: 0,
        centerY: 0,
        radius: 0,
        currentX: 0,
        currentY: 0
    }
};

// Input transmission
let lastInputSent = null;
let inputSendInterval = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    // Show PIN screen by default when page loads
    showPinScreen();
    connectWebSocket();
    setupInputTransmission();
});

// Initialize UI elements
function initializeUI() {
    // PIN input
    const pinInput = document.getElementById('pin-input');
    if (pinInput) {
        // Allow typing immediately - submit as soon as 6 digits entered
        pinInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            // Submit PIN immediately when 6 digits are entered
            if (e.target.value.length === 6) {
                // Submit immediately if WebSocket is open
                if (ws && ws.readyState === WebSocket.OPEN) {
                    submitPin(e.target.value);
                } else {
                    // Store PIN to submit as soon as connection is ready
                    pendingPin = e.target.value;
                }
            } else {
                pendingPin = null;
            }
        });
        
        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && pinInput.value.length === 6 && ws && ws.readyState === WebSocket.OPEN) {
                submitPin(pinInput.value);
            }
        });
        
        // Enable input field immediately
        pinInput.disabled = false;
        pinInput.readOnly = false;
    }
    
    // Initialize joysticks
    initializeJoystick('left');
    initializeJoystick('right');
    
    // Initialize buttons
    initializeButtons();
    
    // Initialize triggers
    initializeTriggers();
    
    // Initialize D-pad
    initializeDpad();
}

// Initialize joystick
function initializeJoystick(side) {
    const container = document.querySelector(`.${side}-joystick`);
    if (!container) return;
    
    const base = container.querySelector('.joystick-base');
    const stick = container.querySelector(`#${side}-stick`);
    
    if (!base || !stick) return;
    
    joysticks[side].element = container;
    joysticks[side].base = base;
    joysticks[side].stick = stick;
    
    // Calculate center and radius
    const updateJoystickBounds = () => {
        const rect = base.getBoundingClientRect();
        joysticks[side].centerX = rect.left + rect.width / 2;
        joysticks[side].centerY = rect.top + rect.height / 2;
        joysticks[side].radius = rect.width / 2 - 30; // 30px for stick radius
    };
    
    updateJoystickBounds();
    window.addEventListener('resize', updateJoystickBounds);
    
    // Touch events
    const handleStart = (e) => {
        e.preventDefault();
        joysticks[side].active = true;
        updateJoystickBounds();
        const touch = e.touches ? e.touches[0] : e;
        updateJoystickPosition(side, touch.clientX, touch.clientY);
    };
    
    const handleMove = (e) => {
        if (!joysticks[side].active) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        updateJoystickPosition(side, touch.clientX, touch.clientY);
    };
    
    const handleEnd = (e) => {
        if (!joysticks[side].active) return;
        e.preventDefault();
        resetJoystick(side);
    };
    
    base.addEventListener('touchstart', handleStart, { passive: false });
    base.addEventListener('touchmove', handleMove, { passive: false });
    base.addEventListener('touchend', handleEnd, { passive: false });
    base.addEventListener('touchcancel', handleEnd, { passive: false });
    
    // Mouse events for desktop testing
    base.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
}

// Update joystick position
function updateJoystickPosition(side, clientX, clientY) {
    const joy = joysticks[side];
    if (!joy.active) return;
    
    const dx = clientX - joy.centerX;
    const dy = clientY - joy.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let x = dx;
    let y = dy;
    
    // Clamp to circle
    if (distance > joy.radius) {
        x = (dx / distance) * joy.radius;
        y = (dy / distance) * joy.radius;
    }
    
    // Apply dead zone (5% of radius)
    const deadZone = joy.radius * 0.05;
    if (distance < deadZone) {
        x = 0;
        y = 0;
    }
    
    // Update visual position
    joy.stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    joy.currentX = x;
    joy.currentY = y;
    
    // Update input state (-1.0 to 1.0)
    const normalizedX = x / joy.radius;
    const normalizedY = y / joy.radius;
    
    if (side === 'left') {
        inputState.leftStick.x = normalizedX;
        inputState.leftStick.y = normalizedY;
    } else {
        inputState.rightStick.x = normalizedX;
        inputState.rightStick.y = normalizedY;
    }
}

// Reset joystick
function resetJoystick(side) {
    const joy = joysticks[side];
    joy.active = false;
    joy.currentX = 0;
    joy.currentY = 0;
    joy.stick.style.transform = 'translate(-50%, -50%)';
    
    if (side === 'left') {
        inputState.leftStick.x = 0;
        inputState.leftStick.y = 0;
    } else {
        inputState.rightStick.x = 0;
        inputState.rightStick.y = 0;
    }
}

// Initialize buttons
function initializeButtons() {
    const buttonMap = {
        'btn-a': 'a',
        'btn-b': 'b',
        'btn-x': 'x',
        'btn-y': 'y',
        'btn-lb': 'lb',
        'btn-rb': 'rb',
        'btn-back': 'back',
        'btn-start': 'start',
        'btn-left-stick': 'leftStick',
        'btn-right-stick': 'rightStick'
    };
    
    Object.keys(buttonMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        
        const buttonName = buttonMap[btnId];
        
        const handlePress = (e) => {
            e.preventDefault();
            inputState.buttons[buttonName] = true;
            btn.classList.add('pressed');
        };
        
        const handleRelease = (e) => {
            e.preventDefault();
            inputState.buttons[buttonName] = false;
            btn.classList.remove('pressed');
        };
        
        btn.addEventListener('touchstart', handlePress, { passive: false });
        btn.addEventListener('touchend', handleRelease, { passive: false });
        btn.addEventListener('touchcancel', handleRelease, { passive: false });
        btn.addEventListener('mousedown', handlePress);
        btn.addEventListener('mouseup', handleRelease);
        btn.addEventListener('mouseleave', handleRelease);
    });
}

// Initialize triggers
function initializeTriggers() {
    const triggerMap = {
        'btn-lt': 'lt',
        'btn-rt': 'rt'
    };
    
    Object.keys(triggerMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        
        const triggerName = triggerMap[btnId];
        let isPressed = false;
        
        const handlePress = (e) => {
            e.preventDefault();
            isPressed = true;
            inputState.triggers[triggerName] = 1.0;
            btn.classList.add('pressed');
        };
        
        const handleRelease = (e) => {
            e.preventDefault();
            isPressed = false;
            inputState.triggers[triggerName] = 0;
            btn.classList.remove('pressed');
        };
        
        btn.addEventListener('touchstart', handlePress, { passive: false });
        btn.addEventListener('touchend', handleRelease, { passive: false });
        btn.addEventListener('touchcancel', handleRelease, { passive: false });
        btn.addEventListener('mousedown', handlePress);
        btn.addEventListener('mouseup', handleRelease);
        btn.addEventListener('mouseleave', handleRelease);
    });
}

// Initialize D-pad
function initializeDpad() {
    const dpadButtons = document.querySelectorAll('.dpad-btn');
    
    dpadButtons.forEach(btn => {
        const dpadValue = parseInt(btn.getAttribute('data-dpad'));
        
        const handlePress = (e) => {
            e.preventDefault();
            inputState.dpad = dpadValue;
            btn.classList.add('pressed');
        };
        
        const handleRelease = (e) => {
            e.preventDefault();
            inputState.dpad = 0;
            btn.classList.remove('pressed');
        };
        
        btn.addEventListener('touchstart', handlePress, { passive: false });
        btn.addEventListener('touchend', handleRelease, { passive: false });
        btn.addEventListener('touchcancel', handleRelease, { passive: false });
        btn.addEventListener('mousedown', handlePress);
        btn.addEventListener('mouseup', handleRelease);
        btn.addEventListener('mouseleave', handleRelease);
    });
}

// Connect WebSocket
function connectWebSocket() {
    // Clear any existing reconnection timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    // Use the same host and port as the current page
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // This includes port if present
    const wsUrl = `${protocol}//${host}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    console.log('Current location:', window.location.href);
    console.log('Protocol:', window.location.protocol);
    console.log('Host:', window.location.host);
    updateConnectionStatus('connecting', 'Connecting...');
    
    try {
        // Close existing connection if any
        if (ws) {
            ws.onopen = null;
            ws.onclose = null;
            ws.onerror = null;
            ws.onmessage = null;
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        }
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket connected successfully');
            reconnectAttempts = 0;
            // Show PIN screen immediately on connection
            showPinScreen();
            updateConnectionStatus('connecting', 'Enter PIN');
            
            // If we have a pending PIN, submit it immediately
            if (pendingPin && pendingPin.length === 6) {
                submitPin(pendingPin);
            }
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus('error', 'Connection error');
        };
        
        ws.onclose = (event) => {
            console.log('WebSocket closed', event.code, event.reason);
            isConnected = false;
            updateConnectionStatus('disconnected', 'Disconnected');
            
            // Attempt reconnection only if not a clean close
            if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
                console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
                updateConnectionStatus('connecting', `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
                reconnectTimeout = setTimeout(() => {
                    connectWebSocket();
                }, delay);
            } else if (reconnectAttempts >= maxReconnectAttempts) {
                updateConnectionStatus('error', 'Connection failed');
            }
        };
    } catch (error) {
        console.error('Error creating WebSocket:', error);
        updateConnectionStatus('error', 'Connection failed: ' + error.message);
        
        // Try to reconnect after a delay
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = 1000;
            reconnectTimeout = setTimeout(() => {
                connectWebSocket();
            }, delay);
        }
    }
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    console.log('Received message:', message.type, message);
    
    switch (message.type) {
        case 'pin-required': {
            requiresPin = true;
            showPinScreen();
            updateConnectionStatus('pin-required', 'Enter PIN');
            // Focus the PIN input when server requests PIN
            const pinInput = document.getElementById('pin-input');
            if (pinInput) {
                pinInput.disabled = false;
                pinInput.readOnly = false;
                // If user already entered 6 digits while waiting, submit immediately
                if (pendingPin && pendingPin.length === 6) {
                    submitPin(pendingPin);
                    pendingPin = null;
                } else if (pinInput.value && pinInput.value.length === 6) {
                    submitPin(pinInput.value);
                } else {
                    setTimeout(() => pinInput.focus(), 50);
                }
            }
            break;
        }
            
        case 'pin-valid':
            requiresPin = false;
            hidePinError();
            updateConnectionStatus('validating', 'PIN accepted, connecting...');
            break;
            
        case 'pin-invalid': {
            showPinError('Invalid PIN. Please try again.');
            updateConnectionStatus('error', 'Invalid PIN');
            const pinInput = document.getElementById('pin-input');
            if (pinInput) {
                pinInput.value = '';
                pinInput.focus();
            }
            break;
        }
            
        case 'connected':
            isConnected = true;
            controllerId = message.controllerId;
            showGamepadScreen();
            updateConnectionStatus('connected', 'Connected');
            document.getElementById('controller-id').textContent = controllerId;
            break;
            
        case 'pong':
            // Keepalive response
            break;
            
        default:
            console.log('Unknown message type:', message.type);
    }
}

// Submit PIN
function submitPin(pin) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // If not ready, store for later
        pendingPin = pin;
        return;
    }
    
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        showPinError('Please enter a valid 6-digit PIN');
        return;
    }
    
    hidePinError();
    updateConnectionStatus('validating', 'Validating PIN...');
    
    // Submit immediately
    try {
        ws.send(JSON.stringify({
            type: 'pin-submit',
            pin: pin
        }));
    } catch (error) {
        console.error('Error sending PIN:', error);
        showPinError('Failed to send PIN. Please try again.');
    }
}

// Show PIN screen
function showPinScreen() {
    document.getElementById('pin-screen').classList.remove('hidden');
    document.getElementById('gamepad-screen').classList.add('hidden');
    const pinInput = document.getElementById('pin-input');
    if (pinInput) {
        // Always enable the input field
        pinInput.disabled = false;
        pinInput.readOnly = false;
        // Focus after a short delay to ensure screen is visible
        setTimeout(() => {
            pinInput.focus();
            // On mobile, we might need to click to focus
            if (document.activeElement !== pinInput) {
                pinInput.click();
            }
        }, 100);
    }
}

// Show gamepad screen
function showGamepadScreen() {
    document.getElementById('pin-screen').classList.add('hidden');
    document.getElementById('gamepad-screen').classList.remove('hidden');
}

// Update connection status
function updateConnectionStatus(status, text) {
    // Update status in PIN screen
    const pinScreenStatusDot = document.querySelector('#pin-screen .status-dot');
    const pinScreenStatusText = document.querySelector('#pin-screen .status-text');
    
    if (pinScreenStatusDot) {
        pinScreenStatusDot.className = 'status-dot';
        if (status === 'connected') {
            pinScreenStatusDot.classList.add('connected');
        }
    }
    
    if (pinScreenStatusText) {
        pinScreenStatusText.textContent = text;
    }
    
    // Also update status in gamepad screen if it exists
    const gamepadScreenStatusDot = document.querySelector('#gamepad-screen .status-dot');
    const gamepadScreenStatusText = document.querySelector('#gamepad-screen .status-text');
    
    if (gamepadScreenStatusDot) {
        gamepadScreenStatusDot.className = 'status-dot';
        if (status === 'connected') {
            gamepadScreenStatusDot.classList.add('connected');
        }
    }
    
    if (gamepadScreenStatusText) {
        gamepadScreenStatusText.textContent = text;
    }
}

// Show PIN error
function showPinError(message) {
    const errorEl = document.getElementById('pin-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

// Hide PIN error
function hidePinError() {
    const errorEl = document.getElementById('pin-error');
    if (errorEl) {
        errorEl.classList.add('hidden');
    }
}

// Setup input transmission
function setupInputTransmission() {
    // Send input at 60fps using requestAnimationFrame
    let lastTime = 0;
    const targetFPS = 60;
    const frameTime = 1000 / targetFPS;
    
    function sendInput() {
        if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
            requestAnimationFrame(sendInput);
            return;
        }
        
        const currentTime = performance.now();
        if (currentTime - lastTime >= frameTime) {
            // Create input message
            const inputMessage = {
                type: 'input',
                data: {
                    leftStick: { ...inputState.leftStick },
                    rightStick: { ...inputState.rightStick },
                    buttons: { ...inputState.buttons },
                    triggers: { ...inputState.triggers },
                    dpad: inputState.dpad
                }
            };
            
            // Only send if state changed
            const stateStr = JSON.stringify(inputMessage.data);
            if (stateStr !== lastInputSent) {
                ws.send(JSON.stringify(inputMessage));
                lastInputSent = stateStr;
            }
            
            lastTime = currentTime;
        }
        
        requestAnimationFrame(sendInput);
    }
    
    // Start sending
    requestAnimationFrame(sendInput);
    
    // Send ping every 5 seconds for keepalive
    setInterval(() => {
        if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 5000);
}

// Prevent default touch behaviors
document.addEventListener('touchstart', (e) => {
    // Allow touch on interactive elements
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
        return;
    }
    // Prevent scrolling on gamepad
    if (document.getElementById('gamepad-screen') && !document.getElementById('gamepad-screen').classList.contains('hidden')) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (e.target.tagName === 'INPUT') {
        return;
    }
    if (document.getElementById('gamepad-screen') && !document.getElementById('gamepad-screen').classList.contains('hidden')) {
        e.preventDefault();
    }
}, { passive: false });

// Prevent context menu on long press
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

