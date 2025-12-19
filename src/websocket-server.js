const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class WebSocketServer {
  constructor(port, controllerManager) {
    this.port = port;
    this.controllerManager = controllerManager;
    this.server = null;
    this.wss = null;
    this.httpServer = null;
    this.clientControllerMap = new Map(); // Map WebSocket to controller ID
  }

  start() {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.wss = new WebSocket.Server({ server: this.httpServer });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.httpServer.listen(this.port, () => {
        console.log(`WebSocket server listening on port ${this.port}`);
        resolve();
      });

      this.httpServer.on('error', (error) => {
        console.error('HTTP server error:', error);
        reject(error);
      });
    });
  }

  handleHttpRequest(req, res) {
    const url = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, '..', 'public', url);

    // Security: only serve files from public directory
    const publicDir = path.join(__dirname, '..', 'public');
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath);
      const contentType = this.getContentType(ext);
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  getContentType(ext) {
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };
    return types[ext] || 'application/octet-stream';
  }

  async handleConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    console.log(`New WebSocket connection from ${clientIp}`);

    let controllerId = null;

    try {
      // Create a virtual controller for this client
      controllerId = await this.controllerManager.createController();
      this.clientControllerMap.set(ws, controllerId);

      ws.send(JSON.stringify({
        type: 'connected',
        controllerId: controllerId
      }));

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      ws.on('close', async () => {
        console.log(`WebSocket connection closed from ${clientIp}`);
        if (controllerId !== null) {
          await this.controllerManager.removeController(controllerId);
          this.clientControllerMap.delete(ws);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
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
      if (message.type !== 'ping' && message.type !== 'pong') {
        console.warn('Received message from unknown client:', message.type);
      }
      return;
    }

    if (message.type === 'input') {
      this.controllerManager.updateController(controllerId, message.data);
    } else if (message.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log('WebSocket server closed');
          resolve();
        });
      } else {
        resolve();
      }

      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('HTTP server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getLocalIpAddress() {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  getConnectionUrl() {
    const ip = this.getLocalIpAddress();
    return `http://${ip}:${this.port}`;
  }
}

module.exports = WebSocketServer;

