# SafeRoute — Women's Safety Navigation & Risk Analysis App (Version 2.0)

A comprehensive, beginner-friendly frontend navigation and safety intelligence app designed for a college group project.

---

## 📁 Project Architecture

```text
womens-safety-nav/
├── index.html      # UI structure with search bar, safety meters, SOS modal
├── style.css       # Modern styling with safety gauges, pulsing markers, and SOS dialog
├── app.js          # Core intelligence (Safety audit formula, OSRM routing, Web Audio siren)
└── README.md       # Project documentation & college viva defense guide
```

---

## 🛡️ Multi-Factor Safety Route Analysis Engine

In Version 2.0, the app evaluates pedestrian routes based on 3 critical safety pillars:

### 1. 💡 Street Lighting & Night Visibility Index (0–100%)
- **Arterial / Primary Roads**: Wide boulevards, commercial avenues, and high-traffic streets receive an 85–96% illumination score.
- **Narrow Alleys & Service Lanes**: Unlit footpaths and backalleys receive low illumination penalties.

### 2. 👥 People Presence & Footfall Density (0–100%)
- Evaluates public activity. Higher footfall (near markets, transit stops, college corridors) dramatically lowers individual vulnerability.

### 3. ⚠️ Aloofness & Isolation Vulnerability (0–100%)
- Measures secluded, deserted, or blind-corner stretches.
- **Lower Aloofness is Safer**: Routes avoiding deserted dead-ends keep this score low.

### 🧮 Weighted Safety Score Formula (For Viva & Presentation)
$$\text{Safety Score} = (0.40 \times \text{Lighting}) + (0.35 \times \text{Crowd Density}) + (0.25 \times (100 - \text{Aloofness}))$$

- **Score $\ge$ 75**: 🟢 **Safe Route** (High confidence, well-lit, active corridor).
- **Score 60–74**: 🟡 **Moderate Caution** (Reasonable during daylight).
- **Score $<$ 60**: 🔴 **High Isolation Risk** (Deserted or unlit alleys; avoid after dark).

---

## ✨ Version 2.0 Feature Highlights

1. **🛡️ Safe Route (Green) vs ⚡ Shortest Route (Orange)**:
   - Compares the safest illuminated corridor against the shortest path (which may cut through deserted alleys).
   - Allows users to toggle between both options and observe the safety trade-off.

2. **🔍 Destination Search (OpenStreetMap Nominatim API)**:
   - Type any college, hospital, metro station, or street name with instant autocomplete suggestions.

3. **👮 Nearby Safe Havens Layer**:
   - Displays nearby **Police Stations / Women Helpdesks** (`👮`) and **24/7 Hospitals** (`🏥`) with phone numbers (`112`, `1091`, `108`).
   - Quick filter pills to toggle between Police and Hospitals.

4. **🚨 Emergency SOS System**:
   - **Distress Siren**: Generates a loud 950Hz/650Hz emergency siren directly through the browser's native **Web Audio API** (100% offline, zero audio file downloads required).
   - **WhatsApp Broadcast**: Automatically drafts an urgent SOS message containing the user's exact live GPS latitude/longitude and a direct Google Maps link.
   - **One-tap 112 Call**: Direct national emergency dispatcher shortcut.

---

## 🚀 How to Run

1. Open your browser tab where the app was already running and press **`Ctrl + R`** (or **`F5`**) to refresh.
2. Or open [`index.html`](file:///C:/Users/sakshi/.gemini/antigravity/scratch/womens-safety-nav/index.html) in Chrome/Edge.
3. Test destination search by typing a landmark or clicking on the map.
4. Test the red **EMERGENCY SOS** button in the bottom right!

---

## 🎓 College Viva & Defense Questions

| Question | Strong Answer |
| :--- | :--- |
| **Why not just choose the shortest distance?** | Shortest paths often route through deserted, unlit alleyways or isolated footpaths. SafeRoute prioritizes user safety over distance by routing along major, well-illuminated, high-footfall avenues. |
| **How does the siren work without an MP3 file?** | It uses the HTML5 **Web Audio API** (`AudioContext`), synthesizing a frequency-shifting oscillator in real-time. This eliminates loading delays and works completely offline. |
| **What APIs are used?** | Leaflet.js (map visualization), OpenStreetMap (tiles), OSRM (pedestrian routing geometry), Nominatim (geocoding search), and the browser's native Geolocation API. |
