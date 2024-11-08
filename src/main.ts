// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "./style.css";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

const APP_NAME = "Treasure Seeker 🏴‍☠️";
const START_LOCATION = leaflet.latLng(36.98949379578401, -122.06277128548504);
const MAP_ZOOM_LEVEL = 17;
const GRID_SIZE = 1e-4;
const SEARCH_RADIUS = 8;
const TREASURE_SPAWN_PROBABILITY = 0.1;

const app = document.querySelector<HTMLDivElement>("#app")!;
document.title = APP_NAME;
app.innerHTML = `
  <header class="app-header">
    <h1>${APP_NAME}</h1>
  </header>
  
  <div class="app-body">
    <main class="main-content">
      <div id="map" class="map-container"></div>
    </main>

    <aside class="sidebar" id="sidebar">
      <h2>Inventory</h2>
      <p id="inventoryCount">Coins: 0</p>
    </aside>
  </div>
`;

const map = leaflet.map("map", {
  center: START_LOCATION,
  zoom: MAP_ZOOM_LEVEL,
  minZoom: MAP_ZOOM_LEVEL,
  maxZoom: MAP_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet.marker(START_LOCATION);
playerMarker.bindTooltip("You are here!");
playerMarker.addTo(map);

let playerInventoryCount = 0;

function updateInventoryDisplay() {
  const inventoryCount = document.getElementById("inventoryCount")!;
  inventoryCount.textContent = `Coins: ${playerInventoryCount}`;
}

// Interfaces and Flyweight pattern
interface Cell {
  i: number;
  j: number;
}

interface Coin {
  cell: Cell;
  serial: number;
}

const cellCache: { [key: string]: Cell } = {};

function getCell(lat: number, lng: number): Cell {
  const i = Math.floor(lat * 1e4);
  const j = Math.floor(lng * 1e4);
  const key = `${i}:${j}`;
  if (!cellCache[key]) {
    cellCache[key] = { i, j };
  }
  return cellCache[key];
}

function spawnTreasure(i: number, j: number) {
  const origin = START_LOCATION;
  const treasureLocation = leaflet.latLng(
    origin.lat + i * GRID_SIZE,
    origin.lng + j * GRID_SIZE,
  );

  const cell = getCell(treasureLocation.lat, treasureLocation.lng);
  const numberOfTreasures = Math.floor(Math.random() * 5) + 1;
  const coins: Coin[] = Array.from(
    { length: numberOfTreasures },
    (_, serial) => ({ cell, serial }),
  );

  // Add a 🏴‍☠️ marker to represent the treasure
  const treasureMarker = leaflet.marker(treasureLocation, {
    icon: leaflet.divIcon({
      className: "treasure-icon",
      html: "🏴‍☠️",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  });
  treasureMarker.addTo(map);

  treasureMarker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `<div>Treasure at "${cell.i},${cell.j}"</div>`;

    const treasureList = document.createElement("ul");
    coins.forEach((coin, index) => {
      const treasureItem = document.createElement("li");
      treasureItem.textContent = `💎 ${cell.i}:${cell.j}#${coin.serial}`;

      const collectButton = document.createElement("button");
      collectButton.textContent = "Collect";
      collectButton.onclick = () => {
        playerInventoryCount++;
        updateInventoryDisplay();
        coins.splice(index, 1);
        treasureMarker.closePopup();
        treasureMarker.openPopup();
      };

      treasureItem.appendChild(collectButton);
      treasureList.appendChild(treasureItem);
    });
    popupDiv.appendChild(treasureList);

    const depositButton = document.createElement("button");
    depositButton.textContent = "Deposit Coin";
    depositButton.onclick = () => {
      if (playerInventoryCount > 0) {
        playerInventoryCount--;
        updateInventoryDisplay();
        const newCoin: Coin = { cell, serial: coins.length };
        coins.push(newCoin);
        treasureMarker.closePopup();
        treasureMarker.openPopup();
      } else {
        alert("No coins to deposit!");
      }
    };
    popupDiv.appendChild(depositButton);

    return popupDiv;
  });
}

for (let i = -SEARCH_RADIUS; i < SEARCH_RADIUS; i++) {
  for (let j = -SEARCH_RADIUS; j < SEARCH_RADIUS; j++) {
    if (luck([i, j].toString()) < TREASURE_SPAWN_PROBABILITY) {
      spawnTreasure(i, j);
    }
  }
}
