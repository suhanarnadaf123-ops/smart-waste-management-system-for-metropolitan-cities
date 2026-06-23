import time
import random
import json
import threading
import sys
import websocket

# Server WebSocket URL
WS_URL = "ws://localhost:3000/iot"

# Initial setup for simulated metropolitan waste bins
BINS = [
    { "id": "bin_01", "name": "Worli Sea Face North", "lat": 19.0068, "lon": 72.8162, "fillLevel": 45.0, "weight": 15.2, "temperature": 24.5, "battery": 92.0, "status": "Normal" },
    { "id": "bin_02", "name": "Bandra Reclamation Park", "lat": 19.0433, "lon": 72.8231, "fillLevel": 78.0, "weight": 28.5, "temperature": 25.1, "battery": 88.0, "status": "Normal" },
    { "id": "bin_03", "name": "Juhu Beach Promenade", "lat": 19.1026, "lon": 72.8242, "fillLevel": 92.0, "weight": 42.1, "temperature": 26.0, "battery": 85.0, "status": "Overflow Warning" },
    { "id": "bin_04", "name": "Gateway of India Plaza", "lat": 18.9220, "lon": 72.8347, "fillLevel": 20.0, "weight": 8.0, "temperature": 23.8, "battery": 95.0, "status": "Normal" },
    { "id": "bin_05", "name": "Marine Drive Flyover", "lat": 18.9438, "lon": 72.8232, "fillLevel": 85.0, "weight": 35.0, "temperature": 24.2, "battery": 91.0, "status": "Overflow Warning" },
    { "id": "bin_06", "name": "Dadaji Kondadev Stadium Area", "lat": 19.1983, "lon": 72.9786, "fillLevel": 55.0, "weight": 22.3, "temperature": 28.4, "battery": 9.0, "status": "Low Battery" },
    { "id": "bin_07", "name": "Dadar Shivaji Park Gate 3", "lat": 19.0268, "lon": 72.8374, "fillLevel": 62.0, "weight": 25.1, "temperature": 58.2, "battery": 80.0, "status": "High Temperature Anomaly" },
    { "id": "bin_08", "name": "Colaba Causeway Shopping St", "lat": 18.9150, "lon": 72.8278, "fillLevel": 30.0, "weight": 11.2, "temperature": 24.0, "battery": 94.0, "status": "Normal" },
    { "id": "bin_09", "name": "Andheri West Link Road Mall", "lat": 19.1334, "lon": 72.8354, "fillLevel": 89.0, "weight": 39.5, "temperature": 24.9, "battery": 87.0, "status": "Overflow Warning" }
]

# ANSI colors for styling terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

ws_conn = None
running = True

def print_log(level, msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    prefix = f"[{timestamp}] "
    if level == "INFO":
        print(f"{prefix}{Colors.OKCYAN}[INFO]{Colors.ENDC} {msg}")
    elif level == "SUCCESS":
        print(f"{prefix}{Colors.OKGREEN}[SUCCESS]{Colors.ENDC} {msg}")
    elif level == "WARN":
        print(f"{prefix}{Colors.WARNING}[WARN]{Colors.ENDC} {msg}")
    elif level == "ERROR":
        print(f"{prefix}{Colors.FAIL}[ERROR]{Colors.ENDC} {msg}")
    elif level == "CMD":
        print(f"{prefix}{Colors.HEADER}{Colors.BOLD}[COMMAND RECEIVED]{Colors.ENDC} {msg}")

def simulate_telemetry_changes():
    """Periodically increments fill level, weight, temp, and battery drain."""
    while running:
        for bin_device in BINS:
            # 1. Increment fill level by a small random amount (0.2% to 1.5%)
            # Except if the bin is already close to 100%
            if bin_device["fillLevel"] < 100.0:
                increment = random.uniform(0.2, 1.5)
                # Random spike simulation (5% chance of garbage disposal event)
                if random.random() < 0.05:
                    increment += random.uniform(5.0, 15.0)
                    print_log("INFO", f"Disposal event on {bin_device['name']} (+{increment:.1f}%)")
                
                bin_device["fillLevel"] = min(100.0, bin_device["fillLevel"] + increment)

            # 2. Correlate weight with fill level (approx 0.45 kg per 1% fill) plus jitter
            weight_jitter = random.uniform(-0.5, 0.5)
            bin_device["weight"] = max(0.0, (bin_device["fillLevel"] * 0.45) + weight_jitter)

            # 3. Simulate battery drain (slowly, e.g. 0.01% - 0.05% per cycle)
            bin_device["battery"] = max(0.0, bin_device["battery"] - random.uniform(0.01, 0.05))

            # 4. Temperature variation
            # If Dadar Shivaji Park bin has a fire simulation running, keep temp high
            if bin_device["id"] == "bin_07" and bin_device["temperature"] > 50:
                # Slow dissipation unless reset
                bin_device["temperature"] += random.uniform(-0.5, 0.2)
            else:
                # Hover around 23-27 deg C
                target_temp = random.uniform(23.0, 27.0)
                bin_device["temperature"] += (target_temp - bin_device["temperature"]) * 0.1

            # Check if socket is open and send
            if ws_conn and ws_conn.sock and ws_conn.sock.connected:
                payload = {
                    "type": "telemetry",
                    "deviceId": bin_device["id"],
                    "fillLevel": bin_device["fillLevel"],
                    "weight": bin_device["weight"],
                    "temperature": bin_device["temperature"],
                    "battery": bin_device["battery"],
                    "lat": bin_device["lat"],
                    "lon": bin_device["lon"]
                }
                try:
                    ws_conn.send(json.dumps(payload))
                except Exception as e:
                    print_log("ERROR", f"Failed to send telemetry for {bin_device['id']}: {e}")
        
        # Interval between updates
        time.sleep(3.0)

def on_message(ws, message):
    try:
        data = json.loads(message)
        if data.get("type") == "command":
            device_id = data.get("deviceId")
            action = data.get("action")
            
            # Find the bin locally
            bin_device = next((b for b in BINS if b["id"] == device_id), None)
            if not bin_device:
                print_log("WARN", f"Received command for unknown device {device_id}")
                return

            print_log("CMD", f"Device: {device_id} ({bin_device['name']}) -> Action: {action}")
            
            # Perform action simulation
            if action == "empty_bin":
                bin_device["fillLevel"] = 0.0
                bin_device["weight"] = 0.0
                print_log("SUCCESS", f"[{device_id}] Bins physical door unlocked. Waste collected. Fill level reset to 0%.")
            elif action == "trigger_buzzer":
                print(f"{Colors.WARNING}  >>> [BUZZER ACTIVE] Bins warning buzzer sounding! BEEP! BEEP! BEEP! <<<{Colors.ENDC}")
            elif action == "reset_sensor":
                bin_device["temperature"] = 24.0
                bin_device["battery"] = 100.0
                print_log("SUCCESS", f"[{device_id}] Sensor hardware reset. Temperature: 24°C, Battery: 100%.")
    except Exception as e:
        print_log("ERROR", f"Error handling message: {e}")

def on_error(ws, error):
    print_log("ERROR", f"WebSocket error occurred: {error}")

def on_close(ws, close_status_code, close_msg):
    print_log("WARN", f"Disconnected from Smart Waste Server (Code: {close_status_code}, Msg: {close_msg})")

def on_open(ws):
    print_log("SUCCESS", "Connected to Smart Waste Management Server!")
    # Register as the simulator client
    reg_msg = {
        "type": "register",
        "deviceId": "python_multi_simulator"
    }
    ws.send(json.dumps(reg_msg))
    print_log("INFO", "Registered simulator stream with backend.")

def run_ws_client():
    global ws_conn
    while running:
        print_log("INFO", f"Connecting to {WS_URL}...")
        ws_conn = websocket.WebSocketApp(
            WS_URL,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )
        # Run WebSocket thread
        ws_conn.run_forever()
        if running:
            print_log("INFO", "Reconnecting in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    print(f"{Colors.HEADER}================================================================{Colors.ENDC}")
    print(f"{Colors.HEADER}     Smart Waste Management - Metropolitan IoT Simulator        {Colors.ENDC}")
    print(f"{Colors.HEADER}================================================================{Colors.ENDC}")
    
    # Start Web Socket Thread
    ws_thread = threading.Thread(target=run_ws_client)
    ws_thread.daemon = True
    ws_thread.start()

    # Start Telemetry Simulator Thread
    sim_thread = threading.Thread(target=simulate_telemetry_changes)
    sim_thread.daemon = True
    sim_thread.start()

    try:
        # Keep main thread alive and support local simulation trigger commands
        while True:
            cmd = input("\nEnter commands to simulate field situations (or 'exit' to quit):\n"
                        "  1: Trigger fire anomaly on bin_07 ( शिवाजी पार्क )\n"
                        "  2: Drain battery of bin_04 to 4%\n"
                        "  3: Fast-fill all bins to 95%\n"
                        "  4: Empty all bins\n"
                        "cmd > ")
            if cmd == "1":
                bin_07 = next(b for b in BINS if b["id"] == "bin_07")
                bin_07["temperature"] = 72.5
                print_log("WARN", "Fire anomaly triggered on Shivaji Park bin (bin_07). Temperature rose to 72.5°C.")
            elif cmd == "2":
                bin_04 = next(b for b in BINS if b["id"] == "bin_04")
                bin_04["battery"] = 4.0
                print_log("WARN", "Battery level for Gateway of India Plaza bin (bin_04) dropped to 4%.")
            elif cmd == "3":
                for b in BINS:
                    b["fillLevel"] = 95.0
                    b["weight"] = 42.7
                print_log("WARN", "All bins set to 95% full (Triggering route planning scenario).")
            elif cmd == "4":
                for b in BINS:
                    b["fillLevel"] = 0.0
                    b["weight"] = 0.0
                print_log("SUCCESS", "All bins emptied physically.")
            elif cmd.strip().lower() == "exit":
                break
    except KeyboardInterrupt:
        pass
    finally:
        running = False
        if ws_conn:
            ws_conn.close()
        print("\nSimulator shut down successfully.")
        sys.exit(0)
