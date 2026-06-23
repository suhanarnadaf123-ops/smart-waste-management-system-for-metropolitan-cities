const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Create DB directory if not exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initial/default bins in Mumbai metropolitan area
const DEFAULT_BINS = [
  { id: 'bin_01', name: 'Worli Sea Face North', lat: 19.0068, lon: 72.8162, fillLevel: 45, weight: 15.2, temperature: 24.5, battery: 92, status: 'Normal', lastUpdate: new Date().toISOString() },
  { id: 'bin_02', name: 'Bandra Reclamation Park', lat: 19.0433, lon: 72.8231, fillLevel: 78, weight: 28.5, temperature: 25.1, battery: 88, status: 'Normal', lastUpdate: new Date().toISOString() },
  { id: 'bin_03', name: 'Juhu Beach Promenade', lat: 19.1026, lon: 72.8242, fillLevel: 92, weight: 42.1, temperature: 26.0, battery: 85, status: 'Overflow Warning', lastUpdate: new Date().toISOString() },
  { id: 'bin_04', name: 'Gateway of India Plaza', lat: 18.9220, lon: 72.8347, fillLevel: 20, weight: 8.0, temperature: 23.8, battery: 95, status: 'Normal', lastUpdate: new Date().toISOString() },
  { id: 'bin_05', name: 'Marine Drive Flyover', lat: 18.9438, lon: 72.8232, fillLevel: 85, weight: 35.0, temperature: 24.2, battery: 91, status: 'Overflow Warning', lastUpdate: new Date().toISOString() },
  { id: 'bin_06', name: 'Dadaji Kondadev Stadium Area', lat: 19.1983, lon: 72.9786, fillLevel: 55, weight: 22.3, temperature: 28.4, battery: 9, status: 'Low Battery', lastUpdate: new Date().toISOString() }, // Dadar/Thane area - let's keep Dadar area: lat: 19.0178, lon: 72.8478
  { id: 'bin_07', name: 'Dadar Shivaji Park Gate 3', lat: 19.0268, lon: 72.8374, fillLevel: 62, weight: 25.1, temperature: 58.2, battery: 80, status: 'High Temperature Anomaly', lastUpdate: new Date().toISOString() }, // Anomaly example
  { id: 'bin_08', name: 'Colaba Causeway Shopping St', lat: 18.9150, lon: 72.8278, fillLevel: 30, weight: 11.2, temperature: 24.0, battery: 94, status: 'Normal', lastUpdate: new Date().toISOString() },
  { id: 'bin_09', name: 'Andheri West Link Road Mall', lat: 19.1334, lon: 72.8354, fillLevel: 89, weight: 39.5, temperature: 24.9, battery: 87, status: 'Overflow Warning', lastUpdate: new Date().toISOString() }
];

let db = {
  bins: DEFAULT_BINS,
  alerts: [
    { id: 'a_01', binId: 'bin_03', binName: 'Juhu Beach Promenade', type: 'overflow', message: 'Garbage fill level is at 92%, exceeding threshold of 80%', time: new Date().toISOString(), resolved: false },
    { id: 'a_02', binId: 'bin_05', binName: 'Marine Drive Flyover', type: 'overflow', message: 'Garbage fill level is at 85%, exceeding threshold of 80%', time: new Date().toISOString(), resolved: false },
    { id: 'a_03', binId: 'bin_06', binName: 'Dadaji Kondadev Stadium Area', type: 'battery', message: 'Sensor battery is critically low (9%)', time: new Date().toISOString(), resolved: false },
    { id: 'a_04', binId: 'bin_07', binName: 'Dadar Shivaji Park Gate 3', type: 'temperature', message: 'High temperature detected (58.2°C) - Potential Fire Hazard!', time: new Date().toISOString(), resolved: false }
  ]
};

// Load database from file if exists
const loadDb = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(data);
      console.log('Loaded database from', DB_FILE);
    } else {
      saveDb();
    }
  } catch (err) {
    console.error('Error loading database:', err);
  }
};

// Save database to file
const saveDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
};

loadDb();

// Clients tracking
const ioTClients = new Map(); // deviceId -> socket
const dashboardClients = new Set();

// WebSocket routing
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/iot') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.clientType = 'iot';
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/dashboard') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.clientType = 'dashboard';
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  console.log(`New WebSocket client connected. Type: ${ws.clientType}`);

  if (ws.clientType === 'dashboard') {
    dashboardClients.add(ws);
    // Send initial configuration to the dashboard
    ws.send(JSON.stringify({ type: 'init', bins: db.bins, alerts: db.alerts }));
  }

  let clientDeviceId = null;

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message);

      if (ws.clientType === 'iot') {
        if (payload.type === 'register') {
          clientDeviceId = payload.deviceId;
          ioTClients.set(clientDeviceId, ws);
          console.log(`IoT Simulator device registered: ${clientDeviceId}`);
        } else if (payload.type === 'telemetry') {
          handleTelemetry(payload);
        }
      } else if (ws.clientType === 'dashboard') {
        if (payload.type === 'command') {
          // Forward command to the specified IoT client
          const targetDevice = payload.deviceId;
          const targetSocket = ioTClients.get(targetDevice);
          if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(JSON.stringify(payload));
            console.log(`Forwarded command to IoT client ${targetDevice}:`, payload);
          } else {
            console.log(`IoT client ${targetDevice} is not connected. Executing fallback locally...`);
            // Run fallback logic for direct simulation on DB if simulator is offline
            executeFallbackCommand(payload);
          }
        }
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    if (ws.clientType === 'dashboard') {
      dashboardClients.delete(ws);
      console.log('Dashboard client disconnected.');
    } else if (ws.clientType === 'iot' && clientDeviceId) {
      ioTClients.delete(clientDeviceId);
      console.log(`IoT Simulator device disconnected: ${clientDeviceId}`);
    }
  });
});

// Process telemetry data from Python simulator
function handleTelemetry(data) {
  const { deviceId, fillLevel, weight, temperature, battery, lat, lon } = data;
  
  // Find or create bin in DB
  let bin = db.bins.find(b => b.id === deviceId);
  if (!bin) {
    bin = { id: deviceId, name: `Smart Bin ${deviceId.split('_')[1] || deviceId}` };
    db.bins.push(bin);
  }

  // Update values
  bin.fillLevel = parseFloat(fillLevel.toFixed(1));
  bin.weight = parseFloat(weight.toFixed(1));
  bin.temperature = parseFloat(temperature.toFixed(1));
  bin.battery = Math.max(0, Math.min(100, Math.round(battery)));
  if (lat && lon) {
    bin.lat = parseFloat(lat);
    bin.lon = parseFloat(lon);
  }
  bin.lastUpdate = new Date().toISOString();

  // Set general status text based on rules
  if (bin.temperature > 55) {
    bin.status = 'High Temperature Anomaly';
  } else if (bin.fillLevel > 80) {
    bin.status = 'Overflow Warning';
  } else if (bin.battery < 15) {
    bin.status = 'Low Battery';
  } else {
    bin.status = 'Normal';
  }

  // Evaluate alerts
  checkThresholds(bin);
  saveDb();

  // Broadcast to all dashboard clients
  broadcastToDashboards({
    type: 'telemetry_update',
    bin,
    alerts: db.alerts
  });
}

// Fallback execution when simulator is offline
function executeFallbackCommand(payload) {
  const { deviceId, action } = payload;
  const bin = db.bins.find(b => b.id === deviceId);
  if (!bin) return;

  if (action === 'empty_bin') {
    bin.fillLevel = 0;
    bin.weight = 0;
    bin.status = 'Normal';
    bin.lastUpdate = new Date().toISOString();

    // Resolve any overflow alerts for this bin
    db.alerts = db.alerts.map(alert => {
      if (alert.binId === deviceId && alert.type === 'overflow') {
        return { ...alert, resolved: true };
      }
      return alert;
    });

    saveDb();
    broadcastToDashboards({
      type: 'telemetry_update',
      bin,
      alerts: db.alerts
    });
  } else if (action === 'reset_sensor') {
    bin.temperature = 24.0;
    bin.battery = 100;
    bin.status = 'Normal';
    bin.lastUpdate = new Date().toISOString();

    db.alerts = db.alerts.map(alert => {
      if (alert.binId === deviceId && (alert.type === 'temperature' || alert.type === 'battery')) {
        return { ...alert, resolved: true };
      }
      return alert;
    });

    saveDb();
    broadcastToDashboards({
      type: 'telemetry_update',
      bin,
      alerts: db.alerts
    });
  }
}

// Evaluate telemetry thresholds and generate/resolve alerts
function checkThresholds(bin) {
  const OVERFLOW_LIMIT = 80.0;
  const TEMP_LIMIT = 55.0;
  const BATT_LIMIT = 15;

  // 1. Check Fill Level Overflow
  let overflowAlert = db.alerts.find(a => a.binId === bin.id && a.type === 'overflow' && !a.resolved);
  if (bin.fillLevel > OVERFLOW_LIMIT) {
    if (!overflowAlert) {
      db.alerts.unshift({
        id: `a_${Date.now()}_of`,
        binId: bin.id,
        binName: bin.name,
        type: 'overflow',
        message: `Garbage fill level is at ${bin.fillLevel}%, exceeding threshold of ${OVERFLOW_LIMIT}%`,
        time: new Date().toISOString(),
        resolved: false
      });
      console.log(`Alert: Overflow on bin ${bin.id}`);
    }
  } else {
    // If fill level went below 80, resolve it
    if (overflowAlert) {
      overflowAlert.resolved = true;
      console.log(`Alert Resolved: Bin ${bin.id} is no longer overflowing`);
    }
  }

  // 2. Check Temperature
  let tempAlert = db.alerts.find(a => a.binId === bin.id && a.type === 'temperature' && !a.resolved);
  if (bin.temperature > TEMP_LIMIT) {
    if (!tempAlert) {
      db.alerts.unshift({
        id: `a_${Date.now()}_temp`,
        binId: bin.id,
        binName: bin.name,
        type: 'temperature',
        message: `High temperature detected (${bin.temperature}°C) - Potential fire hazard!`,
        time: new Date().toISOString(),
        resolved: false
      });
      console.log(`Alert: High temperature anomaly on bin ${bin.id}`);
    }
  } else {
    if (tempAlert) {
      tempAlert.resolved = true;
      console.log(`Alert Resolved: Temperature normalized for bin ${bin.id}`);
    }
  }

  // 3. Check Battery
  let battAlert = db.alerts.find(a => a.binId === bin.id && a.type === 'battery' && !a.resolved);
  if (bin.battery < BATT_LIMIT) {
    if (!battAlert) {
      db.alerts.unshift({
        id: `a_${Date.now()}_batt`,
        binId: bin.id,
        binName: bin.name,
        type: 'battery',
        message: `Sensor battery level is critically low (${bin.battery}%)`,
        time: new Date().toISOString(),
        resolved: false
      });
      console.log(`Alert: Low battery alert on bin ${bin.id}`);
    }
  } else {
    if (battAlert) {
      battAlert.resolved = true;
      console.log(`Alert Resolved: Battery recharged for bin ${bin.id}`);
    }
  }
}

function broadcastToDashboards(payload) {
  const json = JSON.stringify(payload);
  dashboardClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

// REST APIs
app.get('/api/bins', (req, res) => {
  res.json(db.bins);
});

app.get('/api/alerts', (req, res) => {
  res.json(db.alerts);
});

app.post('/api/bins/reset/:id', (req, res) => {
  const { id } = req.params;
  const bin = db.bins.find(b => b.id === id);
  if (!bin) return res.status(404).json({ error: 'Bin not found' });

  bin.fillLevel = 0;
  bin.weight = 0;
  bin.status = 'Normal';
  bin.lastUpdate = new Date().toISOString();

  // Resolve overflow alerts for this bin
  db.alerts = db.alerts.map(a => {
    if (a.binId === id && a.type === 'overflow') {
      return { ...a, resolved: true };
    }
    return a;
  });

  saveDb();
  broadcastToDashboards({ type: 'telemetry_update', bin, alerts: db.alerts });
  
  // Also send command to connected python simulator if any
  const iotSocket = ioTClients.get(id);
  if (iotSocket && iotSocket.readyState === WebSocket.OPEN) {
    iotSocket.send(JSON.stringify({ type: 'command', deviceId: id, action: 'empty_bin' }));
  }

  res.json({ message: `Bin ${id} successfully emptied`, bin });
});

app.post('/api/alerts/clear-all', (req, res) => {
  db.alerts = [];
  saveDb();
  broadcastToDashboards({ type: 'init', bins: db.bins, alerts: db.alerts });
  res.json({ message: 'All alerts cleared' });
});

// Start express server
server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`  Smart Waste Management Server running at http://localhost:${PORT}`);
  console.log(`  WebSocket endpoints:`);
  console.log(`    - IoT Simulators: ws://localhost:${PORT}/iot`);
  console.log(`    - Web Dashboard:  ws://localhost:${PORT}/dashboard`);
  console.log(`================================================================`);
});
