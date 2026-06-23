# Smart Waste Management System For Metropolitan Cities

An IoT-enabled smart waste management system designed for metropolitan environments. By simulating IoT weight, capacity, battery, and thermal sensors in waste bins across a city (Mumbai metropolitan area), this system visualizes live bin status, triggers proactive alerts for municipal maintenance teams, and dynamically plans optimized collection routes using a Traveling Salesperson (TSP) Nearest-Neighbor routing algorithm to reduce garbage truck fuel consumption, carbon emissions, and operational costs.

---

## 🏗️ System Architecture

1. **Python IoT Simulator (`iot_simulator/simulator.py`)**:
   - Simulates 9 smart bins with accurate coordinate mapping in Mumbai.
   - Dynamically calculates fill levels, weights, battery consumption, and ambient temperature.
   - Connects to the local server over WebSockets to transmit telemetry in real-time.
   - Listens for incoming commands (e.g. Empty Bin, Trigger Warning Buzzer, Reset Sensors) and prints physical reactions to the console.
   - Interactive console menu to manually trigger fire anomalies or low battery events.

2. **Node.js Gateway Server (`server/server.js`)**:
   - Simulates the Watson IoT Platform broker and Cloudant DB.
   - Exposes REST APIs for bin directories, alerts, and remote triggers.
   - Orchestrates WebSocket connections between simulators and dashboards.
   - Persists bin settings and alerts in a local database (`server/data/db.json`).
   - Runs automated rule evaluations to issue warnings for overflow (>80%), high-heat anomaly (>55°C), or low battery (<15%).

3. **Web Dashboard (`public/index.html`, `public/style.css`, `public/app.js`)**:
   - Single-page application using modern dark-mode glassmorphic styling.
   - **Live Map Tracker**: Interactive Leaflet.js map utilizing Carto DarkMatter styling, populated with color-coded custom pulsing SVG markers.
   - **Route Planner**: Dynamic route optimization solver plotting animated, directional dash-flows to clear overflowing containers.
   - **Maintenance Logs**: Panel for resolving active alerts and tracking hardware health.
   - **Data-Driven Analytics**: Chart.js charts reflecting capacity, waste composition, and weekly garbage loads.

---

## 🛠️ Installation & Setup

### Prerequisites
- Node.js installed (v16+)
- Python 3 installed (with `pip`)

### 1. Set Up Node.js Backend Server
Navigate to the `server/` directory, install packages, and boot the server:
```bash
cd server
npm install
npm start
```
The server will boot on port `3000`. You can visit the dashboard in your web browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

### 2. Set Up Python IoT Device Simulator
Open a new terminal session, navigate to the `iot_simulator/` directory, install dependencies, and launch the simulator:
```bash
cd iot_simulator
pip install -r requirements.txt
python simulator.py
```
The simulator will connect to `ws://localhost:3000/iot` and begin sending data.

---

## 🚛 Running the Scenarios

### Scenario 1: Optimized Waste Collection Routes
1. Open the **Route Planner** tab in the Web App.
2. Select a starting municipal depot and the capacity threshold (e.g. 80%).
3. Click **Generate Optimized Route** to calculate the Traveling Salesperson route.
4. Review metrics (Distance, Payload Weight, carbon offsets) and click **Dispatch Waste Fleet Now** to simulate truck routing and pickup (empties the routed bins after 6 seconds).

### Scenario 2: Proactive Maintenance Alerts
1. In the Python Simulator console, press `1` to trigger a simulated fire on bin 7 (`Dadar Shivaji Park Gate 3`), or `2` to drain bin 4's battery.
2. Observe the immediate warnings appearing on the dashboard feed and the red/purple pulsing marker on the Live Map.
3. Navigate to **Maintenance Logs** and click **Reset Sensor Node** to send a remote reset command back to the Python device, restoring normal operation.

### Scenario 3: Data-Driven Waste Reduction Initiatives
1. View the **Data Analytics** page to analyze fill levels, composition breakdown, and waste volume trends.
2. City officials can leverage these reports to target local recycling campaigns in areas displaying high recycling capacity.
