// App State
let bins = [];
let alerts = [];
let activeView = 'dashboard';
let directoryViewMode = 'table'; // 'table' or 'grid'
let currentTheme = 'dark'; // 'dark' or 'light'
let ws = null;

// Leaflet Map references
let mainMap = null;
let routeMap = null;
let mainMapTileLayer = null;
let routeMapTileLayer = null;
let mapMarkers = {};
let routePolyline = null;
let routeMarkers = [];

// Chart instances
let binsComparisonChart = null;
let wasteBreakdownChart = null;
let generationTrendChart = null;

// Sound notification ping
const playAlertSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    console.log('Audio blocked or unsupported.');
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  initWebSockets();
  initCharts();
  
  // Dashboard Action Listeners
  document.getElementById('btn-refresh-dashboard').addEventListener('click', () => {
    fetchBinsAndAlerts();
    showToast('Sync Completed', 'Latest data loaded from the database.', 'success');
  });

  document.getElementById('btn-empty-all-dashboard').addEventListener('click', () => {
    emptyAllBins();
  });

  // Table vs Grid View Selector Toggle
  const btnTable = document.getElementById('btn-view-table');
  const btnGrid = document.getElementById('btn-view-grid');
  const tableViewFrame = document.getElementById('directory-table-view');
  const gridViewFrame = document.getElementById('directory-grid-view');

  btnTable.addEventListener('click', () => {
    directoryViewMode = 'table';
    btnTable.classList.add('active');
    btnGrid.classList.remove('active');
    tableViewFrame.style.display = 'block';
    gridViewFrame.style.display = 'none';
    renderDashboard();
  });

  btnGrid.addEventListener('click', () => {
    directoryViewMode = 'grid';
    btnGrid.classList.add('active');
    btnTable.classList.remove('active');
    tableViewFrame.style.display = 'none';
    gridViewFrame.style.display = 'grid';
    renderDashboard();
  });

  // Map Search Listener
  document.getElementById('map-search').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterMapMarkers(query);
  });

  // Route Planning Slider Listener
  const thresholdSlider = document.getElementById('route-threshold');
  const thresholdVal = document.getElementById('route-threshold-val');
  thresholdSlider.addEventListener('input', (e) => {
    thresholdVal.innerText = `${e.target.value}%`;
  });

  document.getElementById('btn-calculate-route').addEventListener('click', () => {
    calculateOptimizedRoute();
  });

  document.getElementById('btn-clear-resolved-alerts').addEventListener('click', () => {
    clearAllAlerts();
  });

  // Fetch initial data
  fetchBinsAndAlerts();
});

// Theme Selector Initialization
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  currentTheme = savedTheme;
  document.body.setAttribute('data-theme', currentTheme);
  
  const themeToggleBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  
  // Set initial icon
  themeIcon.className = currentTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  
  themeToggleBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    
    // Toggle icon
    themeIcon.className = currentTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    
    // Refresh maps tiles if loaded
    updateMapTileThemes();
    // Refresh charts formatting
    applyThemeToCharts();
    
    showToast('Theme Changed', `Switched to ${currentTheme} mode.`, 'success');
  });
}

// View Navigation Handler
function initNavigation() {
  const menuItems = document.querySelectorAll('.menu-item');
  const viewPanels = document.querySelectorAll('.view-panel');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  const viewTitles = {
    'dashboard': { title: 'Overview Dashboard', subtitle: 'Real-time status of waste containers in Metropolitan Mumbai' },
    'map-tracker': { title: 'Live Map Tracker', subtitle: 'Geolocations and sensor nodes of all active bins' },
    'route-planner': { title: 'Optimized Route Planner', subtitle: 'Collection fleet dispatch and route efficiency logs (Scenario 1)' },
    'maintenance-alerts': { title: 'Proactive Maintenance Logs', subtitle: 'Sensor anomalies, batteries, and overflowing hardware alerts (Scenario 2)' },
    'analytics': { title: 'Data-Driven Analytics', subtitle: 'Historical waste generation patterns & campaign insights (Scenario 3)' }
  };

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      
      menuItems.forEach(m => m.classList.remove('active'));
      item.classList.add('active');
      
      viewPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `view-${targetView}`) {
          panel.classList.add('active');
        }
      });

      activeView = targetView;
      
      if (viewTitles[targetView]) {
        pageTitle.innerText = viewTitles[targetView].title;
        pageSubtitle.innerText = viewTitles[targetView].subtitle;
      }

      if (targetView === 'map-tracker') {
        setTimeout(initMainMap, 100);
      } else if (targetView === 'route-planner') {
        setTimeout(initRouteMap, 100);
      } else if (targetView === 'analytics') {
        updateChartsData();
      }
    });
  });
}

// WebSocket Connection Setup
function initWebSockets() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/dashboard`;
  
  ws = new WebSocket(wsUrl);
  
  const statusIndicator = document.getElementById('connection-status');
  const connectionText = document.getElementById('connection-text');

  ws.onopen = () => {
    statusIndicator.className = 'dot-blink connected';
    connectionText.innerText = 'Sim Online';
    showToast('IoT Gateway Connected', 'Receiving real-time sensor packets.', 'success');
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      
      if (payload.type === 'init') {
        bins = payload.bins;
        alerts = payload.alerts;
        renderDashboard();
        updateAlertBadge();
        if (mainMap) updateMapMarkers();
      } else if (payload.type === 'telemetry_update') {
        const updatedBin = payload.bin;
        
        const oldAlertsCount = alerts.filter(a => !a.resolved).length;
        alerts = payload.alerts;
        const newAlertsCount = alerts.filter(a => !a.resolved).length;

        if (newAlertsCount > oldAlertsCount) {
          playAlertSound();
          const latestAlert = alerts[0];
          showToast(`ALERT: ${latestAlert.binName}`, latestAlert.message, 'danger');
        }

        const index = bins.findIndex(b => b.id === updatedBin.id);
        if (index !== -1) {
          bins[index] = updatedBin;
        } else {
          bins.push(updatedBin);
        }

        logActivity(updatedBin);
        renderDashboard();
        updateAlertBadge();
        if (mainMap) updateMapMarkers();
        
        if (activeView === 'analytics') {
          updateChartsData();
        }
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  };

  ws.onclose = () => {
    statusIndicator.className = 'dot-blink';
    connectionText.innerText = 'Sim Offline';
    showToast('IoT Gateway Disconnected', 'Offline. Reconnecting...', 'warning');
    setTimeout(initWebSockets, 5000);
  };
}

// Fetch Fallback API data
async function fetchBinsAndAlerts() {
  try {
    const binsRes = await fetch('/api/bins');
    const alertsRes = await fetch('/api/alerts');
    if (binsRes.ok && alertsRes.ok) {
      bins = await binsRes.json();
      alerts = await alertsRes.json();
      renderDashboard();
      updateAlertBadge();
      if (mainMap) updateMapMarkers();
    }
  } catch (err) {
    console.error('API Fetch failed:', err);
  }
}

// Write system entries to the telemetry feed
function logActivity(bin) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const item = document.createElement('div');
  item.className = 'feed-item';

  let iconClass = 'fa-circle-info system';
  let feedType = 'system';
  if (bin.status === 'Normal') {
    iconClass = 'fa-square-check normal';
    feedType = 'normal';
  } else if (bin.status.includes('Anomaly') || bin.status.includes('Warning') || bin.status.includes('Low')) {
    iconClass = 'fa-triangle-exclamation alert';
    feedType = 'alert';
  }

  const timestamp = new Date().toLocaleTimeString();

  item.innerHTML = `
    <div class="feed-icon ${feedType}">
      <i class="fa-solid ${iconClass}"></i>
    </div>
    <div class="feed-content">
      <div class="feed-title">${bin.name}</div>
      <div class="feed-desc">Packet: capacity ${bin.fillLevel}%, weight ${bin.weight}kg, battery ${bin.battery}%</div>
      <div class="feed-time">${timestamp}</div>
    </div>
  `;

  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  feed.insertBefore(item, feed.firstChild);

  while (feed.children.length > 15) {
    feed.lastChild.remove();
  }
}

// Renders the overall dashboard table and computes high-level KPIs
function renderDashboard() {
  const totalWeight = bins.reduce((sum, b) => sum + (b.weight || 0), 0);
  const avgBattery = bins.length ? Math.round(bins.reduce((sum, b) => sum + (b.battery || 0), 0) / bins.length) : 100;
  const avgFillRate = bins.length ? Math.round(bins.reduce((sum, b) => sum + (b.fillLevel || 0), 0) / bins.length) : 0;
  const activeAlerts = alerts.filter(a => !a.resolved).length;
  const urgentBinsCount = bins.filter(b => b.fillLevel >= 80).length;

  document.getElementById('quick-avg-fill').innerText = `${avgFillRate}%`;
  document.getElementById('quick-urgent-bins').innerText = urgentBinsCount;
  document.getElementById('kpi-total-weight').innerText = `${totalWeight.toFixed(1)} kg`;
  document.getElementById('kpi-active-alerts').innerText = activeAlerts;
  document.getElementById('kpi-avg-battery').innerText = `${avgBattery}%`;
  
  document.getElementById('alerts-count').innerText = activeAlerts;

  // Render Subviews based on active display mode
  if (directoryViewMode === 'table') {
    renderTableMode();
  } else {
    renderGridCardsMode();
  }

  renderAlertsList();
}

// Table Directory Rendering
function renderTableMode() {
  const tableBody = document.getElementById('bins-table-body');
  if (!tableBody) return;

  if (bins.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center">No waste bins available. Connect Python simulator.</td></tr>`;
    return;
  }

  tableBody.innerHTML = '';
  bins.forEach(bin => {
    const row = document.createElement('tr');
    
    let statusClass = 'normal';
    if (bin.status.includes('Anomaly') || bin.status.includes('High')) statusClass = 'danger';
    else if (bin.status.includes('Warning') || bin.status.includes('Low')) statusClass = 'warning';

    let batteryIcon = 'fa-battery-full';
    let batteryClass = '';
    if (bin.battery < 20) {
      batteryIcon = 'fa-battery-empty';
      batteryClass = 'text-red';
    } else if (bin.battery < 50) {
      batteryIcon = 'fa-battery-quarter';
    } else if (bin.battery < 80) {
      batteryIcon = 'fa-battery-half';
    }

    let barColor = 'var(--green)';
    if (bin.fillLevel >= 80) barColor = 'var(--red)';
    else if (bin.fillLevel >= 50) barColor = 'var(--yellow)';

    row.innerHTML = `
      <td><strong>${bin.id.toUpperCase()}</strong></td>
      <td>${bin.name}</td>
      <td>
        <div class="fill-progress-container">
          <div class="fill-progress-bg">
            <div class="fill-progress-bar" style="width: ${bin.fillLevel}%; background-color: ${barColor};"></div>
          </div>
          <span class="fill-val">${Math.round(bin.fillLevel)}%</span>
        </div>
      </td>
      <td>${bin.weight.toFixed(1)} kg</td>
      <td class="${batteryClass}"><i class="fa-solid ${batteryIcon}"></i> ${bin.battery}%</td>
      <td><span style="color: ${bin.temperature > 50 ? 'var(--red)' : 'inherit'}; font-weight: ${bin.temperature > 50 ? '700' : 'normal'}">${bin.temperature.toFixed(1)}°C</span></td>
      <td><span class="status-pill ${statusClass}">${bin.status}</span></td>
      <td>
        <div class="panel-actions">
          <button class="btn btn-secondary btn-sm" onclick="sendBinCommand('${bin.id}', 'empty_bin')">
            <i class="fa-solid fa-trash-arrow-up"></i>
          </button>
          <button class="btn btn-secondary btn-sm" title="Remote Buzzer" onclick="sendBinCommand('${bin.id}', 'trigger_buzzer')">
            <i class="fa-solid fa-volume-high"></i>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// Cards Grid Directory Rendering
function renderGridCardsMode() {
  const gridWrapper = document.getElementById('directory-grid-view');
  if (!gridWrapper) return;

  if (bins.length === 0) {
    gridWrapper.innerHTML = `<div class="text-center" style="grid-column: 1/-1; padding: 40px 0; color: var(--text-secondary);">No waste bins available.</div>`;
    return;
  }

  gridWrapper.innerHTML = '';
  bins.forEach(bin => {
    const card = document.createElement('div');
    card.className = 'bin-card-wrapper';
    
    // Status color configurations
    let gaugeColor = 'var(--green)';
    let statusDotColor = 'var(--green)';
    if (bin.status.includes('Anomaly') || bin.status.includes('High') || bin.fillLevel >= 80) {
      gaugeColor = 'var(--red)';
      statusDotColor = 'var(--red)';
    } else if (bin.status.includes('Warning') || bin.status.includes('Low') || bin.fillLevel >= 50) {
      gaugeColor = 'var(--yellow)';
      statusDotColor = 'var(--yellow)';
    }

    // Circumference = 2 * Math.PI * 35 = 220
    const circumference = 220;
    const strokeDashoffset = circumference - (bin.fillLevel / 100) * circumference;

    card.innerHTML = `
      <div class="bin-card-header">
        <div class="bin-card-info">
          <h4>${bin.name}</h4>
          <span>${bin.id.toUpperCase()}</span>
        </div>
        <span class="bin-card-status-dot" style="background-color: ${statusDotColor}; box-shadow: 0 0 6px ${statusDotColor};" title="${bin.status}"></span>
      </div>
      
      <!-- Radial Gauge -->
      <div class="bin-card-gauge-area">
        <div class="bin-radial-gauge">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="35" class="bin-gauge-circle-bg"/>
            <circle cx="45" cy="45" r="35" class="bin-gauge-circle-fill" 
                    style="stroke: ${gaugeColor}; stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset};"/>
          </svg>
          <div class="bin-gauge-text">
            <span class="bin-gauge-pct">${Math.round(bin.fillLevel)}%</span>
            <span class="bin-gauge-label">CAPACITY</span>
          </div>
        </div>
      </div>
      
      <!-- Metrics sub-grid -->
      <div class="bin-card-metrics">
        <div class="card-metric-item">
          <div class="card-metric-label">Weight</div>
          <div class="card-metric-val">${bin.weight.toFixed(1)} kg</div>
        </div>
        <div class="card-metric-item">
          <div class="card-metric-label">Temp</div>
          <div class="card-metric-val" style="color: ${bin.temperature > 50 ? 'var(--red)' : 'inherit'}">${bin.temperature.toFixed(1)}°C</div>
        </div>
        <div class="card-metric-item">
          <div class="card-metric-label">Battery</div>
          <div class="card-metric-val" style="color: ${bin.battery < 20 ? 'var(--red)' : 'inherit'}">${bin.battery}%</div>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="bin-card-actions">
        <button class="btn btn-primary btn-sm" onclick="sendBinCommand('${bin.id}', 'empty_bin')">
          <i class="fa-solid fa-trash-arrow-up"></i> Empty Bin
        </button>
        <button class="btn btn-secondary btn-sm" title="Remote Buzzer" onclick="sendBinCommand('${bin.id}', 'trigger_buzzer')">
          <i class="fa-solid fa-volume-high"></i>
        </button>
      </div>
    `;
    gridWrapper.appendChild(card);
  });
}

// Render the Maintenance alerts list
function renderAlertsList() {
  const alertsList = document.getElementById('alerts-list');
  if (!alertsList) return;

  const unresolvedAlerts = alerts.filter(a => !a.resolved);
  
  document.getElementById('alert-stat-overflow').innerText = unresolvedAlerts.filter(a => a.type === 'overflow').length;
  document.getElementById('alert-stat-temp').innerText = unresolvedAlerts.filter(a => a.type === 'temperature').length;
  document.getElementById('alert-stat-battery').innerText = unresolvedAlerts.filter(a => a.type === 'battery').length;

  if (alerts.length === 0) {
    alertsList.innerHTML = `<div class="alerts-empty">No historical alert incident packets found.</div>`;
    return;
  }

  alertsList.innerHTML = '';
  alerts.forEach(alert => {
    const card = document.createElement('div');
    card.className = `alert-card ${alert.type} ${alert.resolved ? 'resolved' : ''}`;
    
    let iconClass = 'fa-circle-exclamation';
    if (alert.type === 'overflow') iconClass = 'fa-dumpster';
    else if (alert.type === 'temperature') iconClass = 'fa-fire-flame-curved';
    else if (alert.type === 'battery') iconClass = 'fa-battery-empty';

    const alertTime = new Date(alert.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const alertDate = new Date(alert.time).toLocaleDateString();

    card.innerHTML = `
      <div class="alert-card-icon">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div class="alert-card-details">
        <div class="alert-card-header">
          <span class="alert-card-title">${alert.binName} (${alert.binId.toUpperCase()})</span>
          <span class="alert-card-time">${alertDate} ${alertTime}</span>
        </div>
        <div class="alert-card-message">${alert.message}</div>
        ${!alert.resolved ? `
          <div class="alert-card-actions">
            ${alert.type === 'overflow' ? `
              <button class="btn btn-primary btn-sm" onclick="sendBinCommand('${alert.binId}', 'empty_bin')">
                <i class="fa-solid fa-truck-pickup"></i> Complete Dispatch
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm" onclick="sendBinCommand('${alert.binId}', 'reset_sensor')">
                <i class="fa-solid fa-screwdriver-wrench"></i> Reset Sensor Node
              </button>
            `}
          </div>
        ` : `
          <span class="status-pill normal" style="font-size:0.7rem;"><i class="fa-solid fa-check"></i> Resolved</span>
        `}
      </div>
    `;
    alertsList.appendChild(card);
  });
}

function updateAlertBadge() {
  const badge = document.getElementById('alerts-count');
  if (badge) {
    badge.innerText = alerts.filter(a => !a.resolved).length;
  }
}

// Leaflet Map Initializations
function initMainMap() {
  if (mainMap) return;

  mainMap = L.map('map').setView([19.03, 72.84], 12);
  
  // Save reference to layer to toggle it dynamically on theme switch
  const tileUrl = currentTheme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    
  mainMapTileLayer = L.tileLayer(tileUrl, {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(mainMap);

  updateMapMarkers();
}

// Update Map tiles when theme is changed
function updateMapTileThemes() {
  const tileUrl = currentTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  if (mainMap && mainMapTileLayer) {
    mainMap.removeLayer(mainMapTileLayer);
    mainMapTileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(mainMap);
  }

  if (routeMap && routeMapTileLayer) {
    routeMap.removeLayer(routeMapTileLayer);
    routeMapTileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(routeMap);
  }
}

// Create glowing SVG Leaflet Markers
function createHtmlIcon(color, isBlinking) {
  const svgHtml = `
    <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0 0 6px ${color});">
      <circle cx="12" cy="12" r="8" fill="${color}" stroke="var(--bg-color)" stroke-width="2"/>
      ${isBlinking ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${color}" stroke-width="1.5" class="svg-pulse-ring"/>` : ''}
    </svg>
  `;
  
  if (!document.getElementById('map-marker-pulse-css')) {
    const style = document.createElement('style');
    style.id = 'map-marker-pulse-css';
    style.innerHTML = `
      .svg-pulse-ring {
        animation: svgBlink 1.5s infinite ease-out;
        transform-origin: center;
      }
      @keyframes svgBlink {
        0% { transform: scale(0.6); opacity: 0.8; }
        100% { transform: scale(1.3); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  return L.divIcon({
    html: svgHtml,
    className: 'custom-leaflet-marker-div',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

// Update Map markers
function updateMapMarkers() {
  if (!mainMap) return;

  bins.forEach(bin => {
    if (!bin.lat || !bin.lon) return;

    let markerColor = 'var(--green)';
    let isBlinking = false;

    if (bin.status.includes('High Temperature')) {
      markerColor = 'var(--red)';
      isBlinking = true;
    } else if (bin.fillLevel >= 80) {
      markerColor = 'var(--red)';
      isBlinking = true;
    } else if (bin.fillLevel >= 50) {
      markerColor = 'var(--yellow)';
    } else if (bin.battery < 15) {
      markerColor = 'var(--purple)';
    }

    const popupHtml = `
      <div class="map-popup-card">
        <div class="map-popup-title">${bin.name}</div>
        <div class="map-popup-grid">
          <div><span class="map-popup-label">Bin ID</span><div class="map-popup-val">${bin.id.toUpperCase()}</div></div>
          <div><span class="map-popup-label">Status</span><div class="map-popup-val" style="color:${markerColor}">${bin.status}</div></div>
          <div><span class="map-popup-label">Fill Level</span><div class="map-popup-val">${Math.round(bin.fillLevel)}%</div></div>
          <div><span class="map-popup-label">Weight</span><div class="map-popup-val">${bin.weight.toFixed(1)} kg</div></div>
          <div><span class="map-popup-label">Battery</span><div class="map-popup-val">${bin.battery}%</div></div>
          <div><span class="map-popup-label">Temperature</span><div class="map-popup-val">${bin.temperature.toFixed(1)}°C</div></div>
        </div>
        <div class="map-popup-actions">
          <button class="btn btn-primary btn-sm" onclick="sendBinCommand('${bin.id}', 'empty_bin')">Empty</button>
          <button class="btn btn-secondary btn-sm" onclick="sendBinCommand('${bin.id}', 'trigger_buzzer')">Buzz</button>
        </div>
      </div>
    `;

    if (mapMarkers[bin.id]) {
      mapMarkers[bin.id].setLatLng([bin.lat, bin.lon]);
      mapMarkers[bin.id].setIcon(createHtmlIcon(markerColor, isBlinking));
      
      const popup = mapMarkers[bin.id].getPopup();
      if (popup) {
        popup.setContent(popupHtml);
      }
    } else {
      const marker = L.marker([bin.lat, bin.lon], {
        icon: createHtmlIcon(markerColor, isBlinking)
      }).addTo(mainMap);
      
      marker.bindPopup(popupHtml);
      mapMarkers[bin.id] = marker;
    }
  });
}

// Search filter on map
function filterMapMarkers(query) {
  bins.forEach(bin => {
    const marker = mapMarkers[bin.id];
    if (!marker) return;

    if (bin.name.toLowerCase().includes(query) || bin.id.toLowerCase().includes(query)) {
      marker.addTo(mainMap);
    } else {
      mainMap.removeLayer(marker);
    }
  });
}

// Route Map Initialization
function initRouteMap() {
  if (routeMap) return;

  routeMap = L.map('route-map').setView([19.03, 72.84], 12);
  
  const tileUrl = currentTheme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  routeMapTileLayer = L.tileLayer(tileUrl, {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(routeMap);

  if (!document.getElementById('route-path-flow-css')) {
    const style = document.createElement('style');
    style.id = 'route-path-flow-css';
    style.innerHTML = `
      .route-flow-line {
        stroke-dasharray: 8, 12;
        animation: dashOffset 25s linear infinite;
      }
      @keyframes dashOffset {
        to {
          stroke-dashoffset: -1000;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Scenario 1: TSP Nearest Neighbor Route Solver
function calculateOptimizedRoute() {
  if (!routeMap) initRouteMap();

  if (routePolyline) {
    routeMap.removeLayer(routePolyline);
    routePolyline = null;
  }
  routeMarkers.forEach(m => routeMap.removeLayer(m));
  routeMarkers = [];

  const threshold = parseInt(document.getElementById('route-threshold').value);
  const depotSelection = document.getElementById('route-depot').value;

  const DEPOTS = {
    depot_central: { name: 'Municipal HQ Depot (Bandra)', lat: 19.0433, lon: 72.8231 },
    depot_south: { name: 'South Ward Yard (Colaba)', lat: 18.9220, lon: 72.8347 },
    depot_north: { name: 'North Ward Depot (Andheri)', lat: 19.1334, lon: 72.8354 }
  };

  const startDepot = DEPOTS[depotSelection];

  let targets = bins.filter(b => b.fillLevel >= threshold && b.lat && b.lon);
  let usingFallbackDemo = false;

  if (targets.length === 0) {
    usingFallbackDemo = true;
    targets = [...bins]
      .filter(b => b.lat && b.lon)
      .sort((a, b) => b.fillLevel - a.fillLevel)
      .slice(0, 3);
  }

  if (targets.length === 0) {
    showToast('No Bins Configured', 'No bins possess GPS coordinates to route.', 'danger');
    return;
  }

  const route = [startDepot];
  const unvisited = [...targets];
  let currentLoc = startDepot;

  while (unvisited.length > 0) {
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = calculateDistance(currentLoc.lat, currentLoc.lon, unvisited[i].lat, unvisited[i].lon);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    currentLoc = unvisited[closestIndex];
    route.push(currentLoc);
    unvisited.splice(closestIndex, 1);
  }

  route.push(startDepot);

  let totalDist = 0;
  let totalWasteKg = 0;
  for (let i = 0; i < route.length - 1; i++) {
    totalDist += calculateDistance(route[i].lat, route[i].lon, route[i+1].lat, route[i+1].lon);
    if (route[i].weight) {
      totalWasteKg += route[i].weight;
    }
  }

  const depotIcon = L.divIcon({
    html: `<div style="background-color: var(--blue); width: 14px; height: 14px; border: 2.5px solid #fff; border-radius:50%; box-shadow: 0 0 8px var(--blue);"></div>`,
    className: 'depot-marker-icon',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  const depotMarker = L.marker([startDepot.lat, startDepot.lon], { icon: depotIcon })
    .bindPopup(`<strong>${startDepot.name}</strong><br>Fleet Dispatch Yard`)
    .addTo(routeMap);
  routeMarkers.push(depotMarker);

  const routeLatLngs = [];
  routeLatLngs.push([startDepot.lat, startDepot.lon]);

  for (let i = 1; i < route.length - 1; i++) {
    const node = route[i];
    routeLatLngs.push([node.lat, node.lon]);

    const nodeIcon = L.divIcon({
      html: `<div style="background-color: var(--purple); width: 14px; height: 14px; border: 2.5px solid #fff; border-radius:50%; box-shadow: 0 0 8px var(--purple); display:flex; align-items:center; justify-content:center; color:#fff; font-size:7px; font-weight:700;">${i}</div>`,
      className: 'route-node-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker([node.lat, node.lon], { icon: nodeIcon })
      .bindPopup(`<strong>Stop ${i}: ${node.name}</strong><br>Capacity: ${Math.round(node.fillLevel)}%<br>Estimated Weight: ${node.weight.toFixed(1)} kg`)
      .addTo(routeMap);
    
    routeMarkers.push(marker);
  }
  routeLatLngs.push([startDepot.lat, startDepot.lon]);

  routePolyline = L.polyline(routeLatLngs, {
    color: 'var(--purple)',
    weight: 4,
    opacity: 0.9,
    className: 'route-flow-line'
  }).addTo(routeMap);

  const bounds = L.latLngBounds(routeLatLngs);
  routeMap.fitBounds(bounds, { padding: [40, 40] });

  const summaryPanel = document.getElementById('route-summary');
  const collectionEstTime = Math.round((totalDist * 3) + ((route.length - 2) * 10));
  const carbonSavings = (totalDist * 0.28).toFixed(1);

  let routeTimelineHtml = '';
  route.forEach((stop, index) => {
    let typeClass = 'bin-node';
    let stepTitle = `Stop ${index}: ${stop.name}`;
    let stepMeta = stop.fillLevel ? `Capacity load: ${Math.round(stop.fillLevel)}% | Weight: ${stop.weight.toFixed(1)} kg` : 'Route Depot Point';

    if (index === 0) {
      typeClass = 'depot';
      stepTitle = `Start Dispatch: ${stop.name}`;
    } else if (index === route.length - 1) {
      typeClass = 'depot';
      stepTitle = `Return depot: ${stop.name}`;
    }

    routeTimelineHtml += `
      <div class="timeline-step">
        <div class="timeline-dot ${typeClass}"></div>
        <div class="timeline-content">
          <div class="timeline-name">${stepTitle}</div>
          <div class="timeline-meta">${stepMeta}</div>
        </div>
      </div>
    `;
  });

  summaryPanel.innerHTML = `
    <div class="route-header-summary">
      <span class="stat-label">Total Distance</span>
      <div class="route-tot-dist">${totalDist.toFixed(1)} km</div>
      ${usingFallbackDemo ? `<span style="font-size:0.75rem;color:var(--yellow);"><i class="fa-solid fa-triangle-exclamation"></i> Simulated demo (using highest fill bins)</span>` : ''}
    </div>
    
    <div class="route-meta-grid">
      <div class="route-meta-card">
        <span class="route-meta-num">${route.length - 2}</span>
        <span class="route-meta-lbl">Bins Swept</span>
      </div>
      <div class="route-meta-card">
        <span class="route-meta-num">${Math.round(totalWasteKg)} kg</span>
        <span class="route-meta-lbl">Payload load</span>
      </div>
      <div class="route-meta-card">
        <span class="route-meta-num">${collectionEstTime}m</span>
        <span class="route-meta-lbl">Est. Duration</span>
      </div>
      <div class="route-meta-card" style="border-color: var(--green-glow);">
        <span class="route-meta-num text-green">${carbonSavings} kg</span>
        <span class="route-meta-lbl text-green">CO₂ Offsets</span>
      </div>
    </div>
    
    <div class="panel-divider" style="margin: 8px 0;"></div>
    
    <div class="route-timeline">
      <span class="stat-label" style="margin-bottom:10px;">Dispatch Route Instructions</span>
      ${routeTimelineHtml}
    </div>

    <button class="btn btn-primary btn-block btn-sm" onclick="dispatchFleetRoute('${depotSelection}', ${route.length - 2})">
      <i class="fa-solid fa-paper-plane"></i> Dispatch Waste Fleet Now
    </button>
  `;

  document.getElementById('truck-status-badge').className = 'badge badge-alerts';
  document.getElementById('truck-status-badge').innerText = 'Route Plotted';
  showToast('Optimized Route Plotted', `Plotted path connecting ${route.length - 2} overflow points.`, 'success');
}

// Simulates sending the collection truck along the path
function dispatchFleetRoute(depotId, binsCount) {
  document.getElementById('truck-status-badge').className = 'badge badge-indigo';
  document.getElementById('truck-status-badge').innerText = 'Fleet Active / Sweeping';
  showToast('Fleet Dispatched', `Waste trucks leaving ${depotId.split('_')[1]} depot to collect from ${binsCount} bins.`, 'success');

  setTimeout(() => {
    const threshold = parseInt(document.getElementById('route-threshold').value);
    
    bins.forEach(bin => {
      if (bin.fillLevel >= threshold) {
        sendBinCommand(bin.id, 'empty_bin');
      }
    });

    document.getElementById('truck-status-badge').className = 'badge badge-indigo';
    document.getElementById('truck-status-badge').innerText = 'Fleet Idle / Collection Done';
    showToast('Collection Complete', `All selected containers have been emptied.`, 'success');
    
    const summaryPanel = document.getElementById('route-summary');
    summaryPanel.innerHTML = `<div class="empty-route-msg">Collection completed. All bins cleared.</div>`;
    if (routePolyline) {
      routeMap.removeLayer(routePolyline);
      routePolyline = null;
    }
    routeMarkers.forEach(m => routeMap.removeLayer(m));
    routeMarkers = [];
  }, 6000);
}

// Haversine formula to compute distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// REST Client Command Dispatch
async function sendBinCommand(deviceId, action) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'command',
        deviceId,
        action
      }));
    }

    let res;
    if (action === 'empty_bin') {
      res = await fetch(`/api/bins/reset/${deviceId}`, { method: 'POST' });
    }
    
    if (res && res.ok) {
      const data = await res.json();
      showToast('Command Confirmed', `Remote command ${action} dispatched.`, 'success');
      
      const index = bins.findIndex(b => b.id === deviceId);
      if (index !== -1) {
        bins[index] = data.bin;
      }
      renderDashboard();
    }
  } catch (err) {
    console.error('Failed to send control command:', err);
    showToast('Network Error', 'Could not transmit remote instruction.', 'danger');
  }
}

// Empty all bins API call
async function emptyAllBins() {
  try {
    for (const bin of bins) {
      await sendBinCommand(bin.id, 'empty_bin');
    }
    showToast('Collection Signal Sent', 'All municipal bin door locks toggled.', 'success');
  } catch (e) {
    console.error('Error emptying bins:', e);
  }
}

// Clear resolved alerts
async function clearAllAlerts() {
  try {
    const res = await fetch('/api/alerts/clear-all', { method: 'POST' });
    if (res.ok) {
      alerts = [];
      renderDashboard();
      updateAlertBadge();
      showToast('Logs Cleared', 'Historical alarm reports deleted.', 'success');
    }
  } catch (err) {
    console.error(err);
  }
}

// Toast Notifications System
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconClass = 'fa-circle-check';
  if (type === 'danger') iconClass = 'fa-triangle-exclamation';
  else if (type === 'warning') iconClass = 'fa-circle-exclamation';

  toast.innerHTML = `
    <div class="toast-icon">
      <i class="fa-solid ${iconClass}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <div class="toast-close">
      <i class="fa-solid fa-xmark"></i>
    </div>
  `;

  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => toast.remove(), 300);
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('toast-fadeout');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// ChartJS Visualizations
function initCharts() {
  const ctxBins = document.getElementById('chart-bins-comparison').getContext('2d');
  const ctxBreakdown = document.getElementById('chart-waste-breakdown').getContext('2d');
  const ctxTrend = document.getElementById('chart-generation-trend').getContext('2d');

  binsComparisonChart = new Chart(ctxBins, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Capacity Fill (%)',
        data: [],
        backgroundColor: [],
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8a9c94' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#8a9c94', font: { size: 9 } }
        }
      }
    }
  });

  wasteBreakdownChart = new Chart(ctxBreakdown, {
    type: 'doughnut',
    data: {
      labels: ['Organic / Kitchen', 'Recyclables (Paper/Plastics)', 'E-Waste', 'Hazardous', 'Other Landfill'],
      datasets: [{
        data: [52, 31, 3, 2, 12],
        backgroundColor: [
          '#10b981',
          '#3b82f6',
          '#8b5cf6',
          '#ff4d6d',
          '#6b7280'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#8a9c94', font: { size: 10 } }
        }
      }
    }
  });

  generationTrendChart = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Collected Waste Load (Tons)',
        data: [12.4, 14.1, 11.8, 15.6, 16.2, 9.8, 8.4],
        borderColor: '#00ffa3',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return null;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          
          if (currentTheme === 'dark') {
            gradient.addColorStop(0, 'rgba(0, 255, 163, 0.2)');
            gradient.addColorStop(1, 'rgba(0, 255, 163, 0)');
          } else {
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
          }
          return gradient;
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8a9c94' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#8a9c94' }
        }
      }
    }
  });

  // Apply theme settings
  applyThemeToCharts();
  updateChartsData();
}

// Adjust Chart.js fonts and lines matching current theme
function applyThemeToCharts() {
  if (!binsComparisonChart || !wasteBreakdownChart || !generationTrendChart) return;
  
  const textColor = currentTheme === 'dark' ? '#8a9c94' : '#4b5563';
  const gridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(16, 185, 129, 0.06)';

  // Chart 1
  binsComparisonChart.options.scales.y.ticks.color = textColor;
  binsComparisonChart.options.scales.y.grid.color = gridColor;
  binsComparisonChart.options.scales.x.ticks.color = textColor;
  binsComparisonChart.update();

  // Chart 2
  wasteBreakdownChart.options.plugins.legend.labels.color = textColor;
  wasteBreakdownChart.update();

  // Chart 3
  generationTrendChart.options.scales.y.ticks.color = textColor;
  generationTrendChart.options.scales.y.grid.color = gridColor;
  generationTrendChart.options.scales.x.ticks.color = textColor;
  
  // Re-generate background gradient color since theme changes
  generationTrendChart.data.datasets[0].borderColor = currentTheme === 'dark' ? '#00ffa3' : '#10b981';
  generationTrendChart.update();
}

// Update charts with live bin levels
function updateChartsData() {
  if (!binsComparisonChart || bins.length === 0) return;

  const labels = bins.map(b => b.name.split(' ')[0] || b.id);
  const data = bins.map(b => b.fillLevel);
  
  const colors = bins.map(b => {
    if (b.fillLevel >= 80) return 'var(--red)';
    if (b.fillLevel >= 50) return 'var(--yellow)';
    return 'var(--green)';
  });

  binsComparisonChart.data.labels = labels;
  binsComparisonChart.data.datasets[0].data = data;
  binsComparisonChart.data.datasets[0].backgroundColor = colors;
  binsComparisonChart.update();
}
