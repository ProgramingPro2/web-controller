const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

class WebSocketServer {
  constructor(port, controllerManager, pinManager = null) {
    this.port = port;
    this.controllerManager = controllerManager;
    this.pinManager = pinManager;
    this.server = null;
    this.wss = null;
    this.httpServer = null;
    this.clientControllerMap = new Map(); // Map WebSocket to controller ID
    this.pendingConnections = new Map(); // Store connections waiting for PIN validation
    this.clientInfo = new Map(); // Map WebSocket to client info {ip, deviceName, connectedAt, controllerId}
  }

  start() {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.wss = new WebSocket.Server({ server: this.httpServer });

      this.wss.on("connection", (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.httpServer.listen(this.port, "0.0.0.0", () => {
        console.log(
          `WebSocket server listening on port ${this.port} (all interfaces)`
        );
        resolve();
      });

      this.httpServer.on("error", (error) => {
        console.error("HTTP server error:", error);
        reject(error);
      });
    });
  }

  handleHttpRequest(req, res) {
    const url = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(__dirname, "..", "public", url);

    // Security: only serve files from public directory
    const publicDir = path.join(__dirname, "..", "public");
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      const ext = path.extname(filePath);
      const contentType = this.getContentType(ext);

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  }

  getContentType(ext) {
    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };
    return types[ext] || "application/octet-stream";
  }

  async handleConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"] || "Unknown Device";
    console.log(`New WebSocket connection from ${clientIp}`);

    // Extract device name from user agent or use IP as fallback
    const deviceName = this.extractDeviceName(userAgent, clientIp);

    // If PIN manager is enabled, require PIN validation
    if (this.pinManager) {
      this.pendingConnections.set(ws, {
        ip: clientIp,
        validated: false,
        deviceName,
      });
      this.clientInfo.set(ws, {
        ip: clientIp,
        deviceName: deviceName,
        connectedAt: new Date(),
        controllerId: null,
        validated: false,
      });

      ws.send(
        JSON.stringify({
          type: "pin-required",
        })
      );

      const messageHandler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "pin-submit") {
            this.handlePinValidation(ws, message.pin, clientIp);
          } else {
            // Ignore other messages until PIN is validated
            console.log(
              `Ignoring message from unvalidated client ${clientIp}: ${message.type}`
            );
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };

      ws.on("message", messageHandler);
    } else {
      // No PIN required, create controller immediately
      await this.createControllerForClient(ws, clientIp);
    }

    ws.on("close", async () => {
      console.log(`WebSocket connection closed from ${clientIp}`);
      this.pendingConnections.delete(ws);
      this.clientInfo.delete(ws);
      const controllerId = this.clientControllerMap.get(ws);
      if (controllerId !== undefined && controllerId !== null) {
        await this.controllerManager.removeController(controllerId);
        this.clientControllerMap.delete(ws);
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  }

  async handlePinValidation(ws, pin, clientIp) {
    const pending = this.pendingConnections.get(ws);
    if (!pending || pending.validated) {
      return;
    }

    const valid = this.pinManager && this.pinManager.validatePin(pin);

    if (valid) {
      console.log(`PIN validated for client ${clientIp}`);
      pending.validated = true;
      ws.send(
        JSON.stringify({
          type: "pin-valid",
        })
      );
      await this.createControllerForClient(ws, clientIp);
    } else {
      console.log(`Invalid PIN attempt from ${clientIp}`);
      ws.send(
        JSON.stringify({
          type: "pin-invalid",
        })
      );
    }
  }

  extractDeviceName(userAgent, ip) {
    // Try to extract device name from user agent
    if (userAgent.includes("iPhone")) {
      return "iPhone";
    } else if (userAgent.includes("iPad")) {
      return "iPad";
    } else if (userAgent.includes("Android")) {
      // Try to extract Android device model
      const match = userAgent.match(/Android.*?;\s*([^)]+)\)/);
      if (match && match[1]) {
        return match[1].trim();
      }
      return "Android Device";
    } else if (userAgent.includes("Windows")) {
      return "Windows Device";
    } else if (userAgent.includes("Mac")) {
      return "Mac Device";
    } else if (userAgent.includes("Linux")) {
      return "Linux Device";
    }
    // Fallback to IP
    return ip || "Unknown Device";
  }

  async createControllerForClient(ws, clientIp) {
    let controllerId = null;

    try {
      // Create a virtual controller for this client
      controllerId = await this.controllerManager.createController();
      this.clientControllerMap.set(ws, controllerId);

      // Update client info with controller ID
      const clientInfo = this.clientInfo.get(ws);
      if (clientInfo) {
        clientInfo.controllerId = controllerId;
        clientInfo.validated = true;
      } else {
        this.clientInfo.set(ws, {
          ip: clientIp,
          deviceName: this.extractDeviceName("Unknown", clientIp),
          connectedAt: new Date(),
          controllerId: controllerId,
          validated: true,
        });
      }

      ws.send(
        JSON.stringify({
          type: "connected",
          controllerId: controllerId,
        })
      );

      // Set up message handler for validated connections
      ws.removeAllListeners("message");
      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      });
    } catch (error) {
      console.error(`Failed to create controller for ${clientIp}:`, error);
      ws.close();
    }
  }

  handleMessage(ws, message) {
    const controllerId = this.clientControllerMap.get(ws);
    if (controllerId === undefined || controllerId === null) {
      // Only warn if it's not a ping/pong message
      if (message.type !== "ping" && message.type !== "pong") {
        console.warn("Received message from unknown client:", message.type);
      }
      return;
    }

    if (message.type === "input") {
      this.controllerManager.updateController(controllerId, message.data);
    } else if (message.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log("WebSocket server closed");
          resolve();
        });
      } else {
        resolve();
      }

      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log("HTTP server closed");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getLocalIpAddress() {
    const interfaces = require("os").networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
    return "localhost";
  }

  getConnectionUrl() {
    const ip = this.getLocalIpAddress();
    return `http://${ip}:${this.port}`;
  }

  getClientList() {
    const clients = [];
    for (const [ws, info] of this.clientInfo.entries()) {
      if (info.validated && info.controllerId !== null) {
        clients.push({
          controllerId: info.controllerId,
          deviceName: info.deviceName,
          ip: info.ip,
          connectedAt: info.connectedAt,
        });
      }
    }
    return clients;
  }
}

module.exports = WebSocketServer;
