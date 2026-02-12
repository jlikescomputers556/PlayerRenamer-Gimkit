/**
 * @name PlayerRenamer
 * @description Replaces player display names with custom names when you host. Configure names in settings.
 * @author you
 * @version 3.0.0
 * @hasSettings true
 */

// ─── Default name pool ───────────────────────────────────────────────────────
const DEFAULT_NAMES = [
  "NPC_1",
  "sigma",
  "67 king 67",
  "Hugh",
  "Rizzler",
  "sigmatwizzler",
  "ohio skibidi rizz",
  "67",
];

// ─── Name assignment ─────────────────────────────────────────────────────────
const assignedNames = new Map();
let nameIndex = 0;

function loadNames() {
  return api.storage.getValue("names", DEFAULT_NAMES);
}

function getCustomName(sessionId) {
  if (assignedNames.has(sessionId)) return assignedNames.get(sessionId);
  const names = loadNames();
  if (!names.length) return null;
  const name = names[nameIndex % names.length];
  nameIndex++;
  assignedNames.set(sessionId, name);
  return name;
}

// ─── Core patch ──────────────────────────────────────────────────────────────
const patches = [];

function patchCharacter(char) {
  if (!char || char.__prPatched) return;

  const sessionId = char.id;
  if (!sessionId) return;

  const nametag = char.nametag;
  if (!nametag || typeof nametag.setName !== "function") return;

  char.__prPatched = true;

  const customName = getCustomName(sessionId);
  if (!customName) return;

  // Set the name immediately
  nametag.setName(customName);
  // Also directly update the tag text if it already exists
  if (nametag.tag) nametag.tag.setText(customName);

  // Intercept future setName calls so it never gets overwritten
  const removePatch = api.patcher.instead(nametag, "setName", (thisVal, args) => {
    const customName = getCustomName(sessionId);
    if (customName) {
      thisVal.name = customName;
      if (thisVal.tag) {
        thisVal.tag.setText(customName);
        thisVal.makeVisibleChanges();
      } else if (!thisVal.creatingTag) {
        thisVal.createTag();
      }
    }
  });

  patches.push(removePatch);
}

function patchAllCurrentPlayers() {
  try {
    const characters = GL.stores.phaser.scene.characterManager.characters;
    for (const char of characters.values()) {
      patchCharacter(char);
    }
  } catch (e) {
    console.warn("[PlayerRenamer] patchAllCurrentPlayers error:", e);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
api.net.onLoad(() => {
  if (!api.net.isHost) return;

  // Initial patch pass
  patchAllCurrentPlayers();

  // Watch for players joining mid-game
  try {
    const state = api.net.room?.state;
    if (state?.players) {
      state.players.onAdd((_player, _sessionId) => {
        setTimeout(patchAllCurrentPlayers, 300);
        setTimeout(patchAllCurrentPlayers, 800);
        setTimeout(patchAllCurrentPlayers, 1500);
      });
    }
  } catch (e) {
    console.warn("[PlayerRenamer] state listener error:", e);
  }

  // Safety net re-patch
  const interval = setInterval(patchAllCurrentPlayers, 3000);

  api.onStop(() => {
    clearInterval(interval);
    for (const remove of patches) {
      try { remove(); } catch {}
    }
    patches.length = 0;
    assignedNames.clear();
    nameIndex = 0;
  });
});

// ─── Settings menu ────────────────────────────────────────────────────────────
api.openSettingsMenu(() => {
  const current = loadNames();

  const container = document.createElement("div");
  container.innerHTML = `
    <div style="font-family: sans-serif; padding: 8px; min-width: 280px;">
      <p style="font-size: 13px; color: #555; margin-top: 0;">
        One name per line. Players are assigned names in order as they join,
        cycling if there are more players than names.
      </p>
      <textarea id="pr-input" style="
        width: 100%; height: 180px; font-size: 14px;
        padding: 6px; box-sizing: border-box;
        border: 1px solid #ccc; border-radius: 4px; resize: vertical;
      ">${current.join("\n")}</textarea>
      <div style="margin-top: 10px; display: flex; gap: 8px;">
        <button id="pr-save" style="
          background: #4CAF50; color: white; border: none;
          padding: 8px 18px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">Save</button>
        <button id="pr-reset" style="
          background: #888; color: white; border: none;
          padding: 8px 18px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">Reset to defaults</button>
      </div>
      <p id="pr-status" style="font-size: 12px; color: green; margin-top: 8px; min-height: 16px;"></p>
    </div>
  `;

  container.querySelector("#pr-save").addEventListener("click", () => {
    const lines = container.querySelector("#pr-input").value
      .split("\n").map(l => l.trim()).filter(l => l.length > 0);
    api.storage.setValue("names", lines);
    assignedNames.clear();
    nameIndex = 0;
    container.querySelector("#pr-status").textContent =
      `✓ Saved ${lines.length} names! Assignments reset.`;
  });

  container.querySelector("#pr-reset").addEventListener("click", () => {
    container.querySelector("#pr-input").value = DEFAULT_NAMES.join("\n");
    api.storage.setValue("names", [...DEFAULT_NAMES]);
    assignedNames.clear();
    nameIndex = 0;
    container.querySelector("#pr-status").textContent = "✓ Reset to defaults!";
  });

  api.UI.showModal(container, { title: "PlayerRenamer Settings" });
});
