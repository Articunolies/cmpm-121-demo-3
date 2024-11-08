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
      <div class="controls">
        <button id="move-north">⬆️</button>
        <button id="move-south">⬇️</button>
        <button id="move-west">⬅️</button>
        <button id="move-east">➡️</button>
      </div>
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
let playerLocation = START_LOCATION;

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

interface Cache {
  cell: Cell;
  coins: Coin[];
}

const cellCache: { [key: string]: Cell } = {};
const cacheState: { [key: string]: Cache } = {};

function getCell(lat: number, lng: number): Cell {
  const i = Math.floor(lat * 1e4);
  const j = Math.floor(lng * 1e4);
  const key = `${i}:${j}`;
  if (!cellCache[key]) {
    cellCache[key] = { i, j };
  }
  return cellCache[key];
}

function saveCacheState(cache: Cache) {
  const key = `${cache.cell.i}:${cache.cell.j}`;
  cacheState[key] = cache;
}

function getCacheState(cell: Cell): Cache | null {
  const key = `${cell.i}:${cell.j}`;
  return cacheState[key] || null;
}

function spawnTreasure(i: number, j: number) {
  const origin = playerLocation;
  const treasureLocation = leaflet.latLng(
    origin.lat + i * GRID_SIZE,
    origin.lng + j * GRID_SIZE,
  );

  const cell = getCell(treasureLocation.lat, treasureLocation.lng);
  let cache = getCacheState(cell);

  if (!cache) {
    const numberOfTreasures = Math.floor(Math.random() * 5) + 1;
    const coins: Coin[] = Array.from(
      { length: numberOfTreasures },
      (_, serial) => ({ cell, serial }),
    );
    cache = { cell, coins };
    saveCacheState(cache);
  }

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
    cache!.coins.forEach((coin, index) => {
      const treasureItem = document.createElement("li");
      treasureItem.textContent = `💎 ${cell.i}:${cell.j}#${coin.serial}`;

      const collectButton = document.createElement("button");
      collectButton.textContent = "Collect";
      collectButton.onclick = () => {
        playerInventoryCount++;
        updateInventoryDisplay();
        cache!.coins.splice(index, 1);
        saveCacheState(cache!);
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
        const newCoin: Coin = { cell, serial: cache!.coins.length };
        cache!.coins.push(newCoin);
        saveCacheState(cache!);
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

function regenerateCaches() {
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Marker && layer !== playerMarker) {
      map.removeLayer(layer);
    }
  });

  const playerCell = getCell(playerLocation.lat, playerLocation.lng);

  for (let i = -SEARCH_RADIUS; i <= SEARCH_RADIUS; i++) {
    for (let j = -SEARCH_RADIUS; j <= SEARCH_RADIUS; j++) {
      const cell = { i: playerCell.i + i, j: playerCell.j + j };
      const cache = getCacheState(cell);
      if (cache) {
        const treasureLocation = leaflet.latLng(
          playerLocation.lat + i * GRID_SIZE,
          playerLocation.lng + j * GRID_SIZE,
        );
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
          cache.coins.forEach((coin, index) => {
            const treasureItem = document.createElement("li");
            treasureItem.textContent = `💎 ${cell.i}:${cell.j}#${coin.serial}`;

            const collectButton = document.createElement("button");
            collectButton.textContent = "Collect";
            collectButton.onclick = () => {
              playerInventoryCount++;
              updateInventoryDisplay();
              cache.coins.splice(index, 1);
              saveCacheState(cache);
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
              const newCoin: Coin = { cell, serial: cache.coins.length };
              cache.coins.push(newCoin);
              saveCacheState(cache);
              treasureMarker.closePopup();
              treasureMarker.openPopup();
            } else {
              alert("No coins to deposit!");
            }
          };
          popupDiv.appendChild(depositButton);

          return popupDiv;
        });
      } else if (
        luck([cell.i, cell.j].toString()) < TREASURE_SPAWN_PROBABILITY
      ) {
        spawnTreasure(cell.i - playerCell.i, cell.j - playerCell.j);
      }
    }
  }
}

function movePlayer(latOffset: number, lngOffset: number) {
  playerLocation = leaflet.latLng(
    playerLocation.lat + latOffset,
    playerLocation.lng + lngOffset,
  );
  playerMarker.setLatLng(playerLocation);
  regenerateCaches();
}

document.getElementById("move-north")!.addEventListener(
  "click",
  () => movePlayer(GRID_SIZE, 0),
);
document.getElementById("move-south")!.addEventListener(
  "click",
  () => movePlayer(-GRID_SIZE, 0),
);
document.getElementById("move-west")!.addEventListener(
  "click",
  () => movePlayer(0, -GRID_SIZE),
);
document.getElementById("move-east")!.addEventListener(
  "click",
  () => movePlayer(0, GRID_SIZE),
);

regenerateCaches();
