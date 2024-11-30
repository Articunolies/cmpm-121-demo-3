// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "./style.css";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// =========== Cell Classes =============

// Interface for the Memento pattern
interface Memento<T> {
  toMemento(): T;
  fromMemento(memento: T): void;
}

// Cell class representing each unique grid cell with Flyweight pattern
class Cell {
  constructor(
    public i: number,
    public j: number,
  ) {}

  toString(): string {
    return `${this.i}:${this.j}`;
  }
}

// CellFactory to manage Flyweight instances of Cells
class CellFactory {
  private static cellCache: Map<string, Cell> = new Map();

  static getCell(i: number, j: number): Cell {
    const key = `${i}:${j}`;
    if (!CellFactory.cellCache.has(key)) {
      CellFactory.cellCache.set(key, new Cell(i, j));
    }
    return CellFactory.cellCache.get(key)!;
  }
}

// Cache class that implements Memento to save and restore state
class Cache implements Memento<string> {
  public coins: string[];

  constructor(
    public cell: Cell,
    initialCoins: string[],
  ) {
    this.coins = initialCoins;
  }

  toMemento(): string {
    return JSON.stringify(this.coins);
  }

  fromMemento(memento: string): void {
    this.coins = JSON.parse(memento);
  }

  removeCoin(index: number): string | null {
    return this.coins.splice(index, 1)[0] || null;
  }

  addCoin(coin: string): void {
    this.coins.push(coin);
  }
}

class Player {
  public cell: Cell;
  public inventory: string[];
  public movementHistory: leaflet.LatLng[];

  constructor(initialCell: Cell) {
    this.cell = initialCell;
    this.inventory = [];
    this.movementHistory = [
      leaflet.latLng(
        initialCell.i * TILE_DEGREES,
        initialCell.j * TILE_DEGREES,
      ),
    ];
  }

  move(direction: "north" | "south" | "east" | "west") {
    let { i, j } = this.cell;
    switch (direction) {
      case "north":
        i += 1;
        break;
      case "south":
        i -= 1;
        break;
      case "east":
        j += 1;
        break;
      case "west":
        j -= 1;
        break;
    }
    this.cell = CellFactory.getCell(i, j);
    const newLat = i * TILE_DEGREES;
    const newLng = j * TILE_DEGREES;
    this.movementHistory.push(leaflet.latLng(newLat, newLng));
  }

  addCoin(coin: string) {
    this.inventory.push(coin);
  }

  removeCoin(coin: string) {
    this.inventory = this.inventory.filter((c) => c !== coin);
  }

  saveState() {
    localStorage.setItem(
      "playerCell",
      JSON.stringify([this.cell.i, this.cell.j]),
    );
    localStorage.setItem("playerInventory", JSON.stringify(this.inventory));
    localStorage.setItem(
      "movementHistory",
      JSON.stringify(
        this.movementHistory.map((latLng) => [latLng.lat, latLng.lng]),
      ),
    );
  }

  loadState() {
    const savedPlayerCell = localStorage.getItem("playerCell");
    const savedInventory = localStorage.getItem("playerInventory");
    const savedMovementHistory = localStorage.getItem("movementHistory");

    if (savedPlayerCell) {
      const [i, j] = JSON.parse(savedPlayerCell);
      this.cell = CellFactory.getCell(i, j);
    }

    if (savedInventory) {
      this.inventory = JSON.parse(savedInventory);
    }

    if (savedMovementHistory) {
      this.movementHistory = JSON.parse(savedMovementHistory).map(
        (coords: [number, number]) => leaflet.latLng(coords[0], coords[1]),
      );
    }
  }
}

// =========== Constants and Initialization =============

const APP_NAME = "Treasure Seeker 🏴‍☠️";
const TILE_DEGREES = 1e-4;
const VISIBLE_RADIUS = 5;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Set up main HTML structure
const app = document.querySelector<HTMLDivElement>("#app")!;
document.title = APP_NAME;
app.innerHTML = `
  <header class="app-header">
    <h1>${APP_NAME}</h1>
  </header>
  
  <div class="app-body">
    <aside class="sidebar" id="sidebar">
      <h2>Inventory</h2>
      <ul id="inventoryList">
      </ul>
      <p id="selectedCoinDisplay">Selected coin: None</p>
    </aside>

    <div id="controls" class="controls">
      <button id="moveUp">⬆️</button>
      <button id="moveLeft">⬅️</button>
      <button id="moveRight">➡️</button>
      <button id="moveDown">⬇️</button>
      <button id="geoToggle">🌐</button>
      <button id="reset">🚮 Reset</button>
      <button id="centerPlayer">📍 Center Player</button>
    </div>
    <main class="main-content">
      <div id="map" class="map-container"></div>
    </main>
  </div>
`;

// Initialize Leaflet map
const NULL_ISLAND = leaflet.latLng(0, 0);
const OAKES_COORDINATES = { lat: 36.98949379578401, lng: -122.06277128548504 };
const map = leaflet.map("map", {
  center: NULL_ISLAND,
  zoom: 3,
  zoomControl: true,
  scrollWheelZoom: true,
});
map.setView([OAKES_COORDINATES.lat, OAKES_COORDINATES.lng], 17);
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// =========== Player and Cache State Management =============

document.getElementById("centerPlayer")!.onclick = () => {
  map.setView([player.cell.i * TILE_DEGREES, player.cell.j * TILE_DEGREES], 17);
};
const player = new Player(
  convertLatLngToGrid(OAKES_COORDINATES.lat, OAKES_COORDINATES.lng),
);
const cacheStorage: Map<string, string> = new Map();
const originalCacheStorage: Map<string, string> = new Map();
let cacheMarkers: leaflet.Marker[] = [];

const playerMarker = leaflet.marker([
  OAKES_COORDINATES.lat,
  OAKES_COORDINATES.lng,
], {
  icon: leaflet.divIcon({
    className: "player-icon",
    html: "📍",
    iconSize: [150, 150],
    iconAnchor: [0, 15],
  }),
}).addTo(map);

playerMarker.bindTooltip("You are here!");

// =========== Movement History Tracking ===========
const movementPolyline = leaflet
  .polyline(player.movementHistory, { color: "blue" })
  .addTo(map);

function convertLatLngToGrid(lat: number, lng: number): Cell {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return CellFactory.getCell(i, j);
}

function generateCoinID(cell: Cell, serial: number): string {
  return `${cell.toString()}#${serial}`;
}

// =========== Loading & Saving ===========
// Load game state from localStorage
function loadGameState() {
  player.loadState();
  map.setView([player.cell.i * TILE_DEGREES, player.cell.j * TILE_DEGREES]);
  movementPolyline.setLatLngs(player.movementHistory);
  UI.updateInventoryDisplay(player);

  const savedCacheStorage = localStorage.getItem("cacheStorage");
  if (savedCacheStorage) {
    const cacheData = JSON.parse(savedCacheStorage);
    for (const key in cacheData) {
      if (Object.prototype.hasOwnProperty.call(cacheData, key)) {
        cacheStorage.set(key, cacheData[key] as string);
      }
    }
  }
}

// Save game state to localStorage
function saveGameState() {
  player.saveState();
  const cacheStorageObject: { [key: string]: string } = {};
  cacheStorage.forEach((value, key) => {
    cacheStorageObject[key] = value;
  });

  localStorage.setItem(
    "cacheStorage",
    JSON.stringify(cacheStorageObject),
  );
}

// =========== Spawn Cache Behaviors ===========

// Spawn a cache and restore its state if previously visited
function spawnCache(cell: Cell) {
  const cellKey = cell.toString();
  let cache: Cache;

  if (cacheStorage.has(cellKey)) {
    const savedState = cacheStorage.get(cellKey)!;
    cache = new Cache(cell, []);
    cache.fromMemento(savedState);
  } else {
    const numberOfCoins = Math.floor(Math.random() * 5) + 1;
    const initialCoins = Array.from(
      { length: numberOfCoins },
      (_, serial) => generateCoinID(cell, serial),
    );
    cache = new Cache(cell, initialCoins);

    const cacheState = cache.toMemento();
    cacheStorage.set(cellKey, cacheState);
    originalCacheStorage.set(cellKey, cacheState);
  }

  const cacheLat = cell.i * TILE_DEGREES;
  const cacheLng = cell.j * TILE_DEGREES;
  const cacheLocation = leaflet.latLng(cacheLat, cacheLng);

  const cacheMarker = leaflet.marker(cacheLocation, {
    icon: leaflet.divIcon({
      className: "cache-icon",
      html: "🏴‍☠️",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  });
  cacheMarker.addTo(map);
  cacheMarkers.push(cacheMarker);

  cacheMarker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `<div>Cache at ${cell.toString()}</div>`;

    const coinList = document.createElement("ul");
    cache.coins.forEach((coin, coinIndex) => {
      const coinItem = document.createElement("li");
      coinItem.textContent = `💎 ${coin}`;

      const collectButton = document.createElement("button");
      collectButton.textContent = "Collect";
      collectButton.onclick = () => {
        const collectedCoin = cache.removeCoin(coinIndex);
        if (collectedCoin) {
          player.addCoin(collectedCoin);
          UI.updateInventoryDisplay(player);
          cacheStorage.set(cellKey, cache.toMemento()); // Save cache state
          saveGameState(); // Save game state
          cacheMarker.closePopup();
          cacheMarker.openPopup();
        }
      };

      coinItem.appendChild(collectButton);
      coinList.appendChild(coinItem);
    });
    popupDiv.appendChild(coinList);

    const depositButton = document.createElement("button");
    depositButton.textContent = "Deposit Selected Coin";
    depositButton.onclick = () => {
      if (selectedCoin) {
        cache.addCoin(selectedCoin);
        player.removeCoin(selectedCoin);
        selectedCoin = null;
        UI.updateInventoryDisplay(player);
        cacheStorage.set(cellKey, cache.toMemento()); // Save cache state
        saveGameState(); // Save game state
        cacheMarker.closePopup();
        cacheMarker.openPopup();
      } else {
        alert("No coin selected for deposit!");
      }
    };
    popupDiv.appendChild(depositButton);

    return popupDiv;
  });
}

// Regenerate caches within radius around player's position
function regenerateCaches() {
  cacheMarkers.forEach((marker) => map.removeLayer(marker));
  cacheMarkers = [];
  for (
    let i = player.cell.i - VISIBLE_RADIUS;
    i <= player.cell.i + VISIBLE_RADIUS;
    i++
  ) {
    for (
      let j = player.cell.j - VISIBLE_RADIUS;
      j <= player.cell.j + VISIBLE_RADIUS;
      j++
    ) {
      if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(CellFactory.getCell(i, j));
      }
    }
  }
}

// =========== Controls =============

// function movePlayer(direction: "north" | "south" | "east" | "west") {
//   player.move(direction);
//   const newLat = player.cell.i * TILE_DEGREES;
//   const newLng = player.cell.j * TILE_DEGREES;

//   map.setView([newLat, newLng]);
//   playerMarker.setLatLng([newLat, newLng]); // Move player marker

//   movementPolyline.setLatLngs(player.movementHistory);

//   saveGameState();
//   regenerateCaches();
// }

function getLocation(player: Player) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      player.cell = convertLatLngToGrid(latitude, longitude);
      map.setView([latitude, longitude]);
      playerMarker.setLatLng([latitude, longitude]); // Move player marker

      player.movementHistory.push(leaflet.latLng(latitude, longitude));
      movementPolyline.setLatLngs(player.movementHistory);

      saveGameState();
      regenerateCaches();
    },
    (error) => {
      console.error("Geolocation error:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 5000,
    },
  );
}

function reset(player: Player) {
  const confirmation = prompt(
    "Are you sure you want to erase your game state? Type 'yes' to confirm.",
  );
  if (confirmation !== "yes") {
    return;
  }

  player.inventory = [];
  selectedCoin = null;
  UI.updateInventoryDisplay(player);
  cacheStorage.clear();
  originalCacheStorage.forEach((initialState, cellKey) => {
    cacheStorage.set(cellKey, initialState);
  });
  player.cell = convertLatLngToGrid(
    OAKES_COORDINATES.lat,
    OAKES_COORDINATES.lng,
  );
  map.setView([OAKES_COORDINATES.lat, OAKES_COORDINATES.lng], 17);
  playerMarker.setLatLng([OAKES_COORDINATES.lat, OAKES_COORDINATES.lng]); // Reset player marker
  player.movementHistory = [
    leaflet.latLng(OAKES_COORDINATES.lat, OAKES_COORDINATES.lng),
  ];
  movementPolyline.setLatLngs(player.movementHistory);

  saveGameState();
  regenerateCaches();
}

const UI = {
  updateInventoryDisplay(player: Player) {
    const inventoryList = document.getElementById("inventoryList")!;
    const selectedCoinDisplay = document.getElementById("selectedCoinDisplay")!;
    inventoryList.innerHTML = "";

    player.inventory.forEach((coin) => {
      const listItem = document.createElement("li");
      listItem.textContent = `💎 ${coin}`;
      listItem.style.cursor = "pointer";

      listItem.onclick = () => {
        selectedCoin = coin;
        selectedCoinDisplay.textContent = `Selected coin: 💎 ${coin}`;
        const [cellCoords] = coin.split("#");
        const [i, j] = cellCoords.split(":").map(Number);
        const coinLat = i * TILE_DEGREES;
        const coinLng = j * TILE_DEGREES;
        map.setView([coinLat, coinLng], 17);
      };

      inventoryList.appendChild(listItem);
    });
  },

  centerPlayer(player: Player) {
    map.setView(
      [player.cell.i * TILE_DEGREES, player.cell.j * TILE_DEGREES],
      17,
    );
  },

  setupEventListeners(player: Player) {
    document.getElementById("moveUp")!.onclick = () => {
      player.move("north");
      this.centerPlayer(player);
      player.saveState();
      regenerateCaches();
    };
    document.getElementById("moveDown")!.onclick = () => {
      player.move("south");
      this.centerPlayer(player);
      player.saveState();
      regenerateCaches();
    };
    document.getElementById("moveLeft")!.onclick = () => {
      player.move("west");
      this.centerPlayer(player);
      player.saveState();
      regenerateCaches();
    };
    document.getElementById("moveRight")!.onclick = () => {
      player.move("east");
      this.centerPlayer(player);
      player.saveState();
      regenerateCaches();
    };
    document.getElementById("geoToggle")!.onclick = () => getLocation(player);
    document.getElementById("reset")!.onclick = () => reset(player);
    document.getElementById("centerPlayer")!.onclick = () =>
      this.centerPlayer(player);
  },
};

let selectedCoin: string | null = null;

// Load initial game state
loadGameState();
playerMarker.setLatLng([
  player.cell.i * TILE_DEGREES,
  player.cell.j * TILE_DEGREES,
]); // Set initial player marker position
regenerateCaches();
UI.setupEventListeners(player);
