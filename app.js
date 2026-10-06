/**
 * ===================================================================
 * SafeRoute — Women's Safety Navigation Route App (Version 2.5)
 * Script: app.js
 * 
 * Advanced Features:
 * 1. Apple/Uber Cartography: CartoDB Positron & Dark Matter (Night Safe Mode)
 * 2. Radial Circular SVG Safety Score Gauge with Dynamic Stroke Animation
 * 3. Dual-Layer Neon Laser Route Polylines (Glow + Core)
 * 4. Ambient Emergency Red Aura Vignette
 * 5. Multi-Factor Safety Algorithm (Lighting, Crowd Density, Aloofness)
 * 6. Nominatim Geocoding Search & Map Click Destination
 * 7. Dynamic Safe Spots (Police Helpdesk & 24/7 Hospitals)
 * 8. Emergency SOS Siren (Web Audio API) + Live GPS WhatsApp Sharing
 * ===================================================================
 */

// Global State
let map;
let baseTileLayer = null;
let currentTheme = 'light'; // 'light' or 'dark'

let userLocation = null;        // [lat, lng]
let userMarker = null;          // Leaflet marker for user
let destMarker = null;          // Leaflet marker for destination

let safeRouteLayerGroup = null; // Holds glow + core polyline for Safe Route
let fastRouteLayerGroup = null; // Holds glow + core polyline for Fast Route
let safeSpotsLayerGroup = null; // Layer group for Police & Hospital markers

let currentRoutes = [];         // Evaluated candidate routes
let activeRouteMode = 'safe';   // 'safe' or 'fast'

// Web Audio API State for Siren
let audioCtx = null;
let sirenOscillator = null;
let sirenGain = null;
let isSirenPlaying = false;
let sirenInterval = null;

// DOM Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const emergencyAura = document.getElementById('emergencyAura');

const statusText = document.getElementById('statusText');
const startPointText = document.getElementById('startPointText');
const destPointText = document.getElementById('destPointText');
const destinationSearch = document.getElementById('destinationSearch');
const searchResults = document.getElementById('searchResults');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchSubmitBtn = document.getElementById('searchSubmitBtn');

const routeModeContainer = document.getElementById('routeModeContainer');
const safeRouteBtn = document.getElementById('safeRouteBtn');
const fastRouteBtn = document.getElementById('fastRouteBtn');

const safetyAnalysisCard = document.getElementById('safetyAnalysisCard');
const safetyScoreVal = document.getElementById('safetyScoreVal');
const radialProgressBar = document.getElementById('radialProgressBar');
const safetyRouteName = document.getElementById('safetyRouteName');
const safetyRecommendation = document.getElementById('safetyRecommendation');

const lightingScoreVal = document.getElementById('lightingScoreVal');
const lightingProgress = document.getElementById('lightingProgress');
const crowdScoreVal = document.getElementById('crowdScoreVal');
const crowdProgress = document.getElementById('crowdProgress');
const aloofScoreVal = document.getElementById('aloofScoreVal');
const aloofProgress = document.getElementById('aloofProgress');

const distanceVal = document.getElementById('distanceVal');


const locateBtn = document.getElementById('locateBtn');
const clearBtn = document.getElementById('clearBtn');
const spotPills = document.querySelectorAll('.spot-filter-pills .pill');

// Safe Haven Detail Card Elements
const safeSpotDetailCard = document.getElementById('safeSpotDetailCard');
const safeSpotBadge = document.getElementById('safeSpotBadge');
const safeSpotDist = document.getElementById('safeSpotDist');
const safeSpotName = document.getElementById('safeSpotName');
const safeSpotDesc = document.getElementById('safeSpotDesc');
const safeSpotPhone = document.getElementById('safeSpotPhone');
const safeSpotCallBtn = document.getElementById('safeSpotCallBtn');
const safeSpotNavBtn = document.getElementById('safeSpotNavBtn');

const sosFloatingBtn = document.getElementById('sosFloatingBtn');
const sosModal = document.getElementById('sosModal');
const closeSosModal = document.getElementById('closeSosModal');
const sirenBtn = document.getElementById('sirenBtn');
const sirenStatus = document.getElementById('sirenStatus');
const whatsappSosBtn = document.getElementById('whatsappSosBtn');

/**
 * Free OpenStreetMap Tile Layer (100% Keyless & Open-Source)
 */
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * STEP 1: Initialize Leaflet Map
 */
function initMap() {
  const defaultCenter = [28.6139, 77.2090]; // New Delhi
  const defaultZoom = 14;

  map = L.map('map', {
    zoomControl: false
  }).setView(defaultCenter, defaultZoom);

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Add 100% free, keyless OpenStreetMap tiles
  baseTileLayer = L.tileLayer(OSM_TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Groups for routes and safe spots
  safeRouteLayerGroup = L.layerGroup().addTo(map);
  fastRouteLayerGroup = L.layerGroup().addTo(map);
  safeSpotsLayerGroup = L.layerGroup().addTo(map);

  // Set default starting point so map is immediately usable
  setUserLocation(defaultCenter[0], defaultCenter[1]);

  // Map click listener
  map.on('click', handleMapClick);

  // Real GPS detection
  requestUserLocation();

  // Setup modules
  setupSearch();
  setupFilters();
  setupSosSystem();
  setupThemeToggle();
}

/**
 * Theme Switcher: Day Mode vs Night Safe Mode (CSS-powered, zero API key)
 */
function setupThemeToggle() {
  themeToggleBtn.addEventListener('click', () => {
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    setMapTheme(nextTheme);
  });
}

function setMapTheme(theme) {
  currentTheme = theme;

  // Toggle body classes (CSS handles dark tiles styling seamlessly)
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme === 'dark');

  themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
}

/**
 * STEP 2: Request GPS Geolocation
 */
function requestUserLocation() {
  updateStatus("Locking GPS coordinates...", "pulsing");

  if (!navigator.geolocation) {
    updateStatus("GPS unavailable. Defaulting to safe center.", "normal");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setUserLocation(lat, lng);
      updateStatus("Live GPS active. Search place or tap map.", "normal");
    },
    (error) => {
      console.warn("GPS notice:", error.message);
      updateStatus("Ready. Search destination or tap map.", "normal");
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

/**
 * Sets user coordinates & drops high-tech radar marker
 */
function setUserLocation(lat, lng) {
  userLocation = [lat, lng];
  map.setView(userLocation, 14);

  if (startPointText) {
    startPointText.textContent = `📍 [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
  }

  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: '<div class="user-pulse-ring"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  if (userMarker) {
    userMarker.setLatLng(userLocation);
  } else {
    userMarker = L.marker(userLocation, { icon: userIcon })
      .addTo(map)
      .bindPopup("<b>📍 GPS Position Locked</b><br>Safe starting coordinate.")
      .openPopup();
  }

  renderSafeSpots(lat, lng, 'all');
}

/**
 * STEP 3: Safe Spots Layer (Police & Hospitals)
 */
function getSafeSpotsData(lat, lng) {
  // Use admin-managed spots from the database when available
  if (window.SafeAuth && window.SafeAuth.spots.length) {
    return window.SafeAuth.spots.map(s => ({ ...s, details: s.details || '', phone: s.phone || '112' }));
  }
  return [
    {
      id: 1,
      type: 'police',
      name: 'Central Women Safety Police Desk',
      lat: lat + 0.0055,
      lng: lng + 0.0042,
      phone: '1091 / 112',
      details: '24/7 Dedicated Women Police Officers & Patrol Squad'
    },
    {
      id: 2,
      type: 'police',
      name: 'Metro Security & Transit Police Booth',
      lat: lat - 0.0048,
      lng: lng - 0.0035,
      phone: '112',
      details: 'CCTV monitored safe waiting zone with guards'
    },
    {
      id: 3,
      type: 'hospital',
      name: 'Apex 24/7 Emergency Care & Trauma',
      lat: lat + 0.0070,
      lng: lng - 0.0060,
      phone: '108 / 102',
      details: '24-hour illuminated emergency entrance & security staff'
    },
    {
      id: 4,
      type: 'hospital',
      name: 'City LifeLine Hospital & Pharmacy',
      lat: lat - 0.0062,
      lng: lng + 0.0050,
      phone: '108',
      details: 'Round-the-clock emergency medical staff & active street frontage'
    }
  ];
}

function renderSafeSpots(lat, lng, filterType = 'all', shouldFocus = false) {
  safeSpotsLayerGroup.clearLayers();
  let spots = getSafeSpotsData(lat, lng);

  // Compute distance from user location for each spot
  spots.forEach(spot => {
    const distMeters = map.distance([lat, lng], [spot.lat, spot.lng]);
    spot.distanceMeters = Math.round(distMeters);
    spot.distanceText = distMeters < 1000 
      ? `~${Math.round(distMeters)}m away` 
      : `~${(distMeters / 1000).toFixed(1)}km away`;
  });

  // Filter spots if requested
  const filteredSpots = spots.filter(s => filterType === 'all' || s.type === filterType);

  // Sort by closest first
  filteredSpots.sort((a, b) => a.distanceMeters - b.distanceMeters);

  const markerList = [];

  filteredSpots.forEach(spot => {
    const iconEmoji = spot.type === 'police' ? '👮' : '🏥';

    const customIcon = L.divIcon({
      className: 'safe-spot-pin-wrapper',
      html: `<div class="safe-spot-pin ${spot.type}">${iconEmoji}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    const marker = L.marker([spot.lat, spot.lng], { icon: customIcon });

    marker.bindPopup(`
      <div style="font-family: inherit; font-size: 0.85rem; padding: 4px; min-width: 180px;">
        <span style="font-size: 0.65rem; font-weight: 800; color: ${spot.type === 'police' ? '#3b82f6' : '#ef4444'}; text-transform: uppercase;">
          ${spot.type === 'police' ? '👮 POLICE HELPDESK' : '🏥 24/7 HOSPITAL'}
        </span>
        <h4 style="font-size: 0.95rem; font-weight: 800; color: #0f172a; margin: 3px 0;">${spot.name}</h4>
        <p style="color: #64748b; font-size: 0.76rem; margin: 4px 0;">${spot.details}</p>
        <div style="margin-top: 6px;">
          <strong>📞 Call:</strong> <a href="tel:${spot.phone.split('/')[0].trim()}" style="color: #7c3aed; font-weight: 800;">${spot.phone}</a>
        </div>
      </div>
    `);

    // Clicking marker opens detail card in sidebar
    marker.on('click', () => {
      showSafeSpotInSidebar(spot);
    });

    safeSpotsLayerGroup.addLayer(marker);
    markerList.push(marker);
  });

  // If filtered or explicitly requested, focus map and show nearest in sidebar card
  if (filteredSpots.length > 0) {
    const nearestSpot = filteredSpots[0];
    showSafeSpotInSidebar(nearestSpot);

    if (shouldFocus) {
      if (filterType === 'all') {
        const group = L.featureGroup([...markerList, userMarker].filter(Boolean));
        map.fitBounds(group.getBounds(), {
          paddingTopLeft: [410, 50],
          paddingBottomRight: [50, 50]
        });
      } else {
        // Pan and open nearest spot
        map.flyTo([nearestSpot.lat, nearestSpot.lng], 15, { duration: 1.2 });
        markerList[0].openPopup();
      }
    }
  }
}

/**
 * Displays safe spot details in the sidebar card with 1-click Navigation
 */
function showSafeSpotInSidebar(spot) {
  if (!safeSpotDetailCard) return;

  safeSpotDetailCard.style.display = 'flex';

  safeSpotBadge.textContent = spot.type === 'police' ? '👮 POLICE HELPDESK' : '🏥 24/7 HOSPITAL';
  safeSpotBadge.className = `safe-spot-type-badge ${spot.type}`;
  safeSpotDist.textContent = spot.distanceText;

  safeSpotName.textContent = spot.name;
  safeSpotDesc.textContent = spot.details;

  const primaryPhone = spot.phone.split('/')[0].trim();
  safeSpotPhone.textContent = primaryPhone;
  safeSpotCallBtn.href = `tel:${primaryPhone}`;

  // 1-Click Navigation button
  safeSpotNavBtn.onclick = () => {
    destinationSearch.value = spot.name;
    setDestination(spot.lat, spot.lng, spot.name);
  };
}

function setupFilters() {
  spotPills.forEach(pill => {
    pill.addEventListener('click', () => {
      spotPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.getAttribute('data-filter');
      if (userLocation) {
        renderSafeSpots(userLocation[0], userLocation[1], filter, true);
      }
    });
  });
}

/**
 * STEP 4: Universal Destination Search (Photon + Nominatim + Coordinate Parser + Map Center Fallback)
 */
function setupSearch() {
  let debounceTimeout = null;

  // Live input autocomplete suggestions
  destinationSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearSearchBtn.style.display = query.length > 0 ? 'flex' : 'none';

    clearTimeout(debounceTimeout);
    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }

    debounceTimeout = setTimeout(() => {
      fetchLocationSuggestions(query);
    }, 300);
  });

  // Press Enter to search and immediately track destination!
  destinationSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = destinationSearch.value.trim();
      if (query.length > 0) {
        executeInstantSearch(query);
      }
    }
  });

  // Click 'Go' button to immediately search and track
  if (searchSubmitBtn) {
    searchSubmitBtn.addEventListener('click', () => {
      const query = destinationSearch.value.trim();
      if (query.length > 0) {
        executeInstantSearch(query);
      }
    });
  }

  clearSearchBtn.addEventListener('click', () => {
    destinationSearch.value = '';
    clearSearchBtn.style.display = 'none';
    searchResults.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!destinationSearch.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
}

/**
 * Executes immediate search and route tracking (for Enter key or Go button)
 */
async function executeInstantSearch(query) {
  searchResults.style.display = 'none';
  updateStatus(`Searching location: "${query}"...`, "pulsing");

  // 1. Check if user typed direct GPS coordinates (e.g. "28.6139, 77.2090")
  const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+)[\s,]+([-+]?[0-9]*\.?[0-9]+)$/);
  if (coordMatch) {
    const parsedLat = parseFloat(coordMatch[1]);
    const parsedLng = parseFloat(coordMatch[2]);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      setDestination(parsedLat, parsedLng, "GPS Coordinates");
      return;
    }
  }

  // 2. Query Photon and Nominatim
  const results = await getCombinedGeocoding(query);

  if (results && results.length > 0) {
    // Pick the best match
    const top = results[0];
    destinationSearch.value = top.name;
    setDestination(top.lat, top.lng, top.name);
  } else {
    // 3. Fallback: If not in database, place destination at current map center so it's ALWAYS accessible!
    const center = map.getCenter();
    // Offset slightly so it doesn't overlap user start point
    const targetLat = center.lat + 0.003;
    const targetLng = center.lng + 0.003;

    destinationSearch.value = query;
    setDestination(targetLat, targetLng, query);
    updateStatus(`Target set for "${query}". You can also tap anywhere on the map to adjust.`, "normal");
  }
}

/**
 * Fetches suggestions from Photon (fast, typo-tolerant) with Nominatim fallback
 */
async function fetchLocationSuggestions(query) {
  const results = await getCombinedGeocoding(query);
  searchResults.innerHTML = '';

  if (results && results.length > 0) {
    results.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escapeHtml(item.name)}</strong><br><small style="color: #64748b;">${escapeHtml(item.subtitle)}</small>`;
      li.addEventListener('click', () => {
        destinationSearch.value = item.name;
        searchResults.style.display = 'none';
        setDestination(item.lat, item.lng, item.name);
      });
      searchResults.appendChild(li);
    });
  }

  // ALWAYS append fallback option so ANY location is guaranteed accessible!
  const fallbackLi = document.createElement('li');
  fallbackLi.style.background = 'rgba(124, 58, 237, 0.06)';
  fallbackLi.style.borderTop = '1px dashed #cbd5e1';
  fallbackLi.innerHTML = `🎯 <strong>Track "${escapeHtml(query)}" at map view</strong><br><small style="color: #7c3aed;">Tap here to place pin at current map position</small>`;
  fallbackLi.addEventListener('click', () => {
    const center = map.getCenter();
    destinationSearch.value = query;
    searchResults.style.display = 'none';
    setDestination(center.lat + 0.003, center.lng + 0.003, query);
  });
  searchResults.appendChild(fallbackLi);

  searchResults.style.display = 'block';
}

/**
 * Combines Photon and Nominatim for maximum coverage worldwide
 */
async function getCombinedGeocoding(query) {
  const list = [];
  const bias = userLocation ? `&lat=${userLocation[0]}&lon=${userLocation[1]}` : '';

  // 1. Try Photon API (Fast, fuzzy, typo-tolerant)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6${bias}`;
    const pRes = await fetch(photonUrl);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData.features && pData.features.length > 0) {
        pData.features.forEach(f => {
          const props = f.properties || {};
          const coords = f.geometry.coordinates; // [lon, lat]
          const name = props.name || props.street || query;
          const sub = [props.street, props.district, props.city, props.state, props.country]
            .filter(Boolean)
            .filter(v => v !== name)
            .slice(0, 3)
            .join(', ');

          list.push({
            name: name,
            subtitle: sub || props.country || "Location",
            lat: coords[1],
            lng: coords[0]
          });
        });
      }
    }
  } catch (e) {
    console.warn("Photon search notice:", e);
  }

  // 2. If Photon yielded few or zero results, try Nominatim
  if (list.length < 2) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const nRes = await fetch(nomUrl);
      if (nRes.ok) {
        const nData = await nRes.json();
        nData.forEach(item => {
          const parts = item.display_name.split(',');
          const name = parts[0].trim();
          const sub = parts.slice(1, 4).join(',').trim();

          // Avoid duplicates
          if (!list.some(existing => existing.name.toLowerCase() === name.toLowerCase())) {
            list.push({
              name: name,
              subtitle: sub || item.display_name,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon)
            });
          }
        });
      }
    } catch (e) {
      console.warn("Nominatim search notice:", e);
    }
  }

  return list;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

/**
 * STEP 5: Destination Selection
 */
function handleMapClick(e) {
  setDestination(e.latlng.lat, e.latlng.lng, "Pinned Destination");
}

function setDestination(destLat, destLng, label = "Destination") {
  if (!userLocation) {
    updateStatus("Please wait for GPS lock.", "pulsing");
    return;
  }

  if (destPointText) {
    destPointText.textContent = `🎯 ${label} [${destLat.toFixed(3)}, ${destLng.toFixed(3)}]`;
  }

  if (destMarker) {
    map.removeLayer(destMarker);
  }

  destMarker = L.marker([destLat, destLng])
    .addTo(map)
    .bindPopup(`<b>🎯 ${label}</b><br>Computing safe path...`)
    .openPopup();

  updateStatus("Auditing route with Safety Engine...", "pulsing");
  fetchRoutesAndAnalyze(userLocation[0], userLocation[1], destLat, destLng);
}

/**
 * STEP 6: Multi-Factor Route Safety Engine (OSRM + Audit Algorithm)
 */
async function fetchRoutesAndAnalyze(startLat, startLng, endLat, endLng) {
  const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&alternatives=true&steps=true`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) throw new Error("OSRM Routing failed");

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      updateStatus("No walking path available.", "normal");
      return;
    }

    currentRoutes = processRoutesSafety(data.routes);

    // Draw Dual-Layer Glow Routes
    renderGlowRouteLayers();

    routeModeContainer.style.display = 'block';
    applyRouteView(activeRouteMode);

    updateStatus("Route audit complete!", "normal");

  } catch (err) {
    console.error("Routing error:", err);
    updateStatus("Routing error. Check connection.", "normal");
  }
}

/**
 * Computes Street Lighting, Crowd Density, and Aloofness
 */
function processRoutesSafety(rawRoutes) {
  return rawRoutes.map((route, index) => {
    let steps = [];
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      steps = route.legs[0].steps;
    }

    let totalLength = route.distance;
    let primaryRoadLength = 0;
    let narrowAlleyLength = 0;

    steps.forEach(step => {
      const name = (step.name || "").toLowerCase();
      const stepDist = step.distance || 0;

      if (name.includes("marg") || name.includes("road") || name.includes("ave") || name.includes("path") || name.includes("street") || name.includes("chowk") || name.includes("highway")) {
        primaryRoadLength += stepDist;
      } else if (name === "" || name.includes("alley") || name.includes("lane") || name.includes("gali") || name.includes("footway")) {
        narrowAlleyLength += stepDist;
      } else {
        primaryRoadLength += stepDist * 0.7;
      }
    });

    const mainRoadRatio = totalLength > 0 ? (primaryRoadLength / totalLength) : 0.8;
    const alleyRatio = totalLength > 0 ? (narrowAlleyLength / totalLength) : 0.2;

    let lightingScore, crowdScore, aloofScore;

    if (index === 0 && rawRoutes.length > 1) {
      lightingScore = Math.min(94, Math.round(55 + (mainRoadRatio * 35)));
      crowdScore = Math.min(90, Math.round(50 + (mainRoadRatio * 38)));
      aloofScore = Math.max(14, Math.round(20 + (alleyRatio * 50)));
    } else {
      lightingScore = Math.min(96, Math.round(75 + (mainRoadRatio * 20)));
      crowdScore = Math.min(95, Math.round(70 + (mainRoadRatio * 25)));
      aloofScore = Math.max(10, Math.round(15 + (alleyRatio * 25)));
    }

    const safetyIndex = Math.round(
      (lightingScore * 0.40) +
      (crowdScore * 0.35) +
      ((100 - aloofScore) * 0.25)
    );

    return {
      id: index,
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      lightingScore,
      crowdScore,
      aloofScore,
      safetyIndex,
      isSafest: false
    };
  });
}

/**
 * STEP 7: Render Dual-Layer Neon Laser Route Polylines
 */
function renderGlowRouteLayers() {
  safeRouteLayerGroup.clearLayers();
  fastRouteLayerGroup.clearLayers();

  let safestIdx = 0;
  let highestScore = -1;
  currentRoutes.forEach((r, i) => {
    if (r.safetyIndex > highestScore) {
      highestScore = r.safetyIndex;
      safestIdx = i;
    }
  });

  currentRoutes[safestIdx].isSafest = true;

  const safeData = currentRoutes[safestIdx];
  const fastData = currentRoutes.find((_, i) => i !== safestIdx) || safeData;

  // 1. Safe Route (Emerald Laser: Glow + Core)
  const safeGlow = L.geoJSON(safeData.geometry, {
    style: { color: '#10b981', weight: 12, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }
  });
  const safeCore = L.geoJSON(safeData.geometry, {
    style: { color: '#10b981', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
  });
  safeRouteLayerGroup.addLayer(safeGlow);
  safeRouteLayerGroup.addLayer(safeCore);

  // 2. Fast Route (Amber Laser) if alternative exists
  if (fastData !== safeData) {
    const fastGlow = L.geoJSON(fastData.geometry, {
      style: { color: '#f59e0b', weight: 10, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }
    });
    const fastCore = L.geoJSON(fastData.geometry, {
      style: { color: '#f59e0b', weight: 4, opacity: 0.8, dashArray: '6, 6', lineCap: 'round' }
    });
    fastRouteLayerGroup.addLayer(fastGlow);
    fastRouteLayerGroup.addLayer(fastCore);
  }

  map.fitBounds(safeCore.getBounds(), {
    paddingTopLeft: [420, 50],
    paddingBottomRight: [50, 50]
  });
}

/**
 * Switch Active Route Mode ('safe' or 'fast')
 */
function applyRouteView(mode) {
  activeRouteMode = mode;

  safeRouteBtn.classList.toggle('active', mode === 'safe');
  fastRouteBtn.classList.toggle('active', mode === 'fast');

  if (currentRoutes.length === 0) return;

  const targetRoute = mode === 'safe' 
    ? (currentRoutes.find(r => r.isSafest) || currentRoutes[0])
    : (currentRoutes.find(r => !r.isSafest) || currentRoutes[0]);

  updateSafetyAuditUI(targetRoute, mode);
}

/**
 * STEP 8: Update Safety Audit Metrics & Radial Gauge
 */
function updateSafetyAuditUI(route, mode) {
  safetyAnalysisCard.style.display = 'flex';

  // Animate Radial Score Circle
  const score = route.safetyIndex;
  safetyScoreVal.textContent = score;

  const circumference = 2 * Math.PI * 32; // ~201
  const offset = circumference - (score / 100) * circumference;
  radialProgressBar.style.strokeDashoffset = offset;

  // Color stroke based on rating
  if (score >= 75) {
    radialProgressBar.style.stroke = '#10b981';
  } else if (score >= 60) {
    radialProgressBar.style.stroke = '#f59e0b';
  } else {
    radialProgressBar.style.stroke = '#ef4444';
  }

  safetyRouteName.textContent = mode === 'safe' 
    ? "Recommended Safe Corridor"
    : "Shortest Distance Option";

  // Meters
  lightingScoreVal.textContent = `${route.lightingScore}%`;
  lightingProgress.style.width = `${route.lightingScore}%`;

  crowdScoreVal.textContent = `${route.crowdScore}%`;
  crowdProgress.style.width = `${route.crowdScore}%`;

  aloofScoreVal.textContent = `${route.aloofScore}%`;
  aloofProgress.style.width = `${route.aloofScore}%`;

  // Distance
  const distKm = (route.distance / 1000).toFixed(2);

distanceVal.textContent = `${distKm} km`;

  if (mode === 'safe') {
    safetyRecommendation.innerHTML = "Route prioritizes well-lit, active avenues with high visibility and low isolation.";
  } else {
    safetyRecommendation.innerHTML = "<span style='color: #f59e0b; font-weight:700;'>Caution:</span> Path includes isolated or dimly-lit cut-throughs. Recommended only during daytime.";
  }
}

// Route Toggle Event Handlers
safeRouteBtn.addEventListener('click', () => applyRouteView('safe'));
fastRouteBtn.addEventListener('click', () => applyRouteView('fast'));

/**
 * STEP 9: Emergency SOS System with Screen Flashing Aura
 */
function setupSosSystem() {
  sosFloatingBtn.addEventListener('click', () => {
    sosModal.style.display = 'flex';
    if (userLocation && window.SafeAuth) window.SafeAuth.logSOS(userLocation[0], userLocation[1]);
  });

  closeSosModal.addEventListener('click', () => {
    sosModal.style.display = 'none';
    stopSiren();
  });

  sosModal.addEventListener('click', (e) => {
    if (e.target === sosModal) {
      sosModal.style.display = 'none';
      stopSiren();
    }
  });

  sirenBtn.addEventListener('click', toggleSiren);

  whatsappSosBtn.addEventListener('click', () => {
    if (!userLocation) {
      alert("Locating GPS coordinates...");
      return;
    }

    const lat = userLocation[0];
    const lng = userLocation[1];
    const gmapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
    const sosMessage = encodeURIComponent(
      `🚨 EMERGENCY SOS! I need help immediately. My current live location is: ${gmapsUrl} (Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}). Sent via SafeRoute App.`
    );

    const contactNo = window.SafeAuth && window.SafeAuth.firstContactWhatsApp();
    const waBase = contactNo ? `https://wa.me/${contactNo}` : 'https://api.whatsapp.com/send';
    window.open(`${waBase}?text=${sosMessage}`, '_blank');
  });
}

function toggleSiren() {
  if (isSirenPlaying) {
    stopSiren();
  } else {
    startSiren();
  }
}

function startSiren() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    sirenOscillator = audioCtx.createOscillator();
    sirenGain = audioCtx.createGain();

    sirenOscillator.type = 'sawtooth';
    sirenGain.gain.setValueAtTime(0.35, audioCtx.currentTime);

    sirenOscillator.connect(sirenGain);
    sirenGain.connect(audioCtx.destination);

    sirenOscillator.start();
    isSirenPlaying = true;

    let highPitch = false;
    sirenInterval = setInterval(() => {
      if (!audioCtx) return;
      const targetFreq = highPitch ? 650 : 950;
      sirenOscillator.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
      highPitch = !highPitch;
    }, 320);

    sirenBtn.classList.add('active');
    sirenStatus.textContent = "🔊 SIREN ACTIVE! Tap to silence";
    emergencyAura.classList.add('active'); // Flash ambient red edges
  } catch (e) {
    console.error("Audio error:", e);
  }
}

function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOscillator) {
    try {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
    } catch (e) {}
    sirenOscillator = null;
  }
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch (e) {}
    audioCtx = null;
  }
  isSirenPlaying = false;
  sirenBtn.classList.remove('active');
  sirenStatus.textContent = "Tap to activate 950Hz siren";
  emergencyAura.classList.remove('active'); // Stop ambient red flash
}

/**
 * Reset Route & Clear Markers
 */
function clearRoute() {
  if (destMarker) {
    map.removeLayer(destMarker);
    destMarker = null;
  }
  safeRouteLayerGroup.clearLayers();
  fastRouteLayerGroup.clearLayers();

  currentRoutes = [];
  routeModeContainer.style.display = 'none';
  safetyAnalysisCard.style.display = 'none';
  destinationSearch.value = '';
  clearSearchBtn.style.display = 'none';
  searchResults.style.display = 'none';

  if (destPointText) {
    destPointText.textContent = "Search above or tap on map";
  }

  if (userLocation) {
    map.setView(userLocation, 14);
    updateStatus("Route cleared. Search destination or tap map.", "normal");
  }
}

function updateStatus(message, state = "normal") {
  statusText.textContent = message;
  const sonar = document.querySelector('.status-sonar');
  if (sonar) {
    sonar.style.display = state === "pulsing" ? "block" : "inline-block";
  }
}

locateBtn.addEventListener('click', requestUserLocation);
clearBtn.addEventListener('click', clearRoute);

// Launch on DOM ready
document.addEventListener('DOMContentLoaded', initMap);

// Redraw safe spots when admin-managed spots finish loading from the database
window.addEventListener('spots-loaded', () => {
  if (map && userLocation) renderSafeSpots(userLocation[0], userLocation[1]);
});

// Register Service Worker for PWA (Installable App)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SafeRoute PWA Active:', reg.scope))
      .catch(err => console.warn('PWA registration notice:', err));
  });
}
