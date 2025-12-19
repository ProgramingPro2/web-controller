const VirtualController = require("./virtual-controller");
const fs = require("fs");

class LinuxVirtualController extends VirtualController {
  constructor(controllerId) {
    super(controllerId);
    this.uinput = null;
    this.device = null;
    this.Events = null;
  }

  async connect() {
    try {
      console.log(`[Linux] Connecting virtual controller ${this.controllerId}`);

      // Check if /dev/uinput exists and is accessible
      try {
        fs.accessSync("/dev/uinput", fs.constants.W_OK);
      } catch (error) {
        console.warn(
          "[Linux] /dev/uinput not accessible. User may need to be in input group or use sudo."
        );
        console.warn(
          "[Linux] Run: sudo chmod 666 /dev/uinput (or add user to input group)"
        );
        console.warn(
          "[Linux] Or: sudo usermod -a -G input $USER (then log out and back in)"
        );
        // Continue anyway - might work with permissions
      }

      // Try to use uinput2 if available
      try {
        const UInput = require("uinput2");
        this.Events = UInput;

        // Setup options for gamepad
        const setupOptions = {
          UI_SET_EVBIT: [UInput.EV_KEY, UInput.EV_ABS, UInput.EV_SYN],
          UI_SET_KEYBIT: [
            UInput.BTN_A,
            UInput.BTN_B,
            UInput.BTN_X,
            UInput.BTN_Y,
            UInput.BTN_TL, // Left Bumper
            UInput.BTN_TR, // Right Bumper
            UInput.BTN_SELECT, // Back
            UInput.BTN_START,
            UInput.BTN_THUMBL, // Left stick click
            UInput.BTN_THUMBR, // Right stick click
            UInput.BTN_DPAD_UP,
            UInput.BTN_DPAD_DOWN,
            UInput.BTN_DPAD_LEFT,
            UInput.BTN_DPAD_RIGHT,
            UInput.BTN_TL2, // Left Trigger (as button)
            UInput.BTN_TR2, // Right Trigger (as button)
          ],
          UI_SET_ABSBIT: [
            UInput.ABS_X, // Left stick X
            UInput.ABS_Y, // Left stick Y
            UInput.ABS_RX, // Right stick X
            UInput.ABS_RY, // Right stick Y
            UInput.ABS_Z, // Left Trigger
            UInput.ABS_RZ, // Right Trigger
            UInput.ABS_HAT0X, // D-pad X
            UInput.ABS_HAT0Y, // D-pad Y
          ],
        };

        // Create the device using setup
        this.device = await UInput.setup(setupOptions);

        // Increase max listeners to prevent memory leak warnings
        if (this.device.stream && this.device.stream.setMaxListeners) {
          this.device.stream.setMaxListeners(20);
        }

        // Create the device with proper ID
        // Note: uinput2's AbsArray uses writeUInt32LE which requires unsigned values
        // Convert signed values to unsigned: use bitwise >>> 0 to convert to unsigned 32-bit
        const toUInt32 = (val) => val >>> 0;

        await this.device.create({
          name: `Web Controller ${this.controllerId}`,
          id: {
            busType: UInput.BUS_USB,
            vendor: 0x045e, // Microsoft
            product: 0x028e, // Xbox 360 Controller
            version: 1,
          },
          absMax: [
            UInput.Abs(UInput.ABS_X, 32767),
            UInput.Abs(UInput.ABS_Y, 32767),
            UInput.Abs(UInput.ABS_RX, 32767),
            UInput.Abs(UInput.ABS_RY, 32767),
            UInput.Abs(UInput.ABS_Z, 255),
            UInput.Abs(UInput.ABS_RZ, 255),
            UInput.Abs(UInput.ABS_HAT0X, 1),
            UInput.Abs(UInput.ABS_HAT0Y, 1),
          ],
          // Convert negative values to unsigned 32-bit representation
          // -32768 becomes 4294967168, -1 becomes 4294967295
          absMin: [
            UInput.Abs(UInput.ABS_X, toUInt32(-32768)),
            UInput.Abs(UInput.ABS_Y, toUInt32(-32768)),
            UInput.Abs(UInput.ABS_RX, toUInt32(-32768)),
            UInput.Abs(UInput.ABS_RY, toUInt32(-32768)),
            UInput.Abs(UInput.ABS_Z, 0),
            UInput.Abs(UInput.ABS_RZ, 0),
            UInput.Abs(UInput.ABS_HAT0X, toUInt32(-1)),
            UInput.Abs(UInput.ABS_HAT0Y, toUInt32(-1)),
          ],
        });

        this.uinput = UInput;
        this.isConnected = true;
        console.log(
          `[Linux] Virtual controller ${this.controllerId} created successfully`
        );
        console.log(
          `[Linux] Controller should now appear in system as "Web Controller ${this.controllerId}"`
        );
        return true;
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          console.error(
            "[Linux] uinput2 not installed. Install with: npm install uinput2"
          );
          console.error("[Linux] Falling back to mock mode");
        } else {
          console.error(`[Linux] Failed to create uinput device:`, error);
          console.error(`[Linux] Error details:`, error.message);
          if (error.stack) {
            console.error(`[Linux] Stack:`, error.stack);
          }
        }
        // Fall back to mock mode
        this.isConnected = true;
        return true;
      }
    } catch (error) {
      console.error(
        `[Linux] Failed to connect controller ${this.controllerId}:`,
        error
      );
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      this.reset();
      if (this.device) {
        try {
          // uinput2 doesn't have explicit destroy, but closing the stream should work
          if (this.device.stream) {
            // Remove all listeners to prevent memory leaks
            this.device.stream.removeAllListeners();
            this.device.stream.end();
            this.device.stream.destroy();
          }
          console.log(
            `[Linux] Destroyed uinput device for controller ${this.controllerId}`
          );
        } catch (error) {
          console.error(`[Linux] Error destroying uinput device:`, error);
        }
      }
      this.isConnected = false;
      this.device = null;
      this.uinput = null;
      this.Events = null;
      console.log(
        `[Linux] Disconnected virtual controller ${this.controllerId}`
      );
    }
  }

  async applyState() {
    // Early return if not connected or device is null
    if (!this.isConnected || !this.device || !this.Events) {
      return;
    }

    try {
      // Send stick positions
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_X,
        Math.round(this.leftStick.x * 32767),
        false
      );
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_Y,
        Math.round(this.leftStick.y * 32767),
        false
      );
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_RX,
        Math.round(this.rightStick.x * 32767),
        false
      );
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_RY,
        Math.round(this.rightStick.y * 32767),
        false
      );

      // Send triggers
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_Z,
        Math.round(this.triggers.lt * 255),
        false
      );
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_RZ,
        Math.round(this.triggers.rt * 255),
        false
      );

      // Send buttons
      await this.device.keyEvent(this.Events.BTN_A, this.buttons.a);
      await this.device.keyEvent(this.Events.BTN_B, this.buttons.b);
      await this.device.keyEvent(this.Events.BTN_X, this.buttons.x);
      await this.device.keyEvent(this.Events.BTN_Y, this.buttons.y);
      await this.device.keyEvent(this.Events.BTN_TL, this.buttons.lb);
      await this.device.keyEvent(this.Events.BTN_TR, this.buttons.rb);
      await this.device.keyEvent(this.Events.BTN_SELECT, this.buttons.back);
      await this.device.keyEvent(this.Events.BTN_START, this.buttons.start);
      await this.device.keyEvent(
        this.Events.BTN_THUMBL,
        this.buttons.leftStick
      );
      await this.device.keyEvent(
        this.Events.BTN_THUMBR,
        this.buttons.rightStick
      );

      // Send D-pad
      let dpadX = 0;
      let dpadY = 0;
      if (this.dpad === 1 || this.dpad === 7 || this.dpad === 8) dpadY = -1; // Up
      if (this.dpad === 3 || this.dpad === 5 || this.dpad === 6) dpadY = 1; // Down
      if (this.dpad === 2 || this.dpad === 6 || this.dpad === 7) dpadX = -1; // Left
      if (this.dpad === 4 || this.dpad === 5 || this.dpad === 8) dpadX = 1; // Right

      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_HAT0X,
        dpadX,
        false
      );
      await this.device.sendEvent(
        this.Events.EV_ABS,
        this.Events.ABS_HAT0Y,
        dpadY,
        true
      ); // Sync on last event
    } catch (error) {
      console.error(
        `[Linux] Error applying state for controller ${this.controllerId}:`,
        error
      );
    }
  }
}

module.exports = LinuxVirtualController;
