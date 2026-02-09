const API_BASE = "https://api.scryfall.com";
const PACK_SIZE = 15;
const PICKS = 3;
const STORAGE_KEY = "p1p1:v1";

const todayEl = document.getElementById("today");
const pickCountEl = document.getElementById("pick-count");
const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");
const picksListEl = document.getElementById("picks-list");
const newPackBtn = document.getElementById("new-pack");
const shareBtn = document.getElementById("share");
const sharePackBtn = document.getElementById("share-pack");
const cardTemplate = document.getElementById("card-template");
const manualInputEl = document.getElementById("manual-input");
const loadManualBtn = document.getElementById("load-manual");
const manualStatusEl = document.getElementById("manual-status");
const reasoningInputEl = document.getElementById("reasoning-input");
const themeToggleBtn = document.getElementById("theme-toggle");
const setDropdownBtn = document.getElementById("set-dropdown");
const setPanelEl = document.getElementById("set-panel");
const setSearchEl = document.getElementById("set-search");
const setListEl = document.getElementById("set-list");
const clearFilterBtn = document.getElementById("clear-filter");
const activeSetsEl = document.getElementById("active-sets");
const filterStatusEl = document.getElementById("filter-status");

const state = {
  day: getToday(),
  cards: [],
  picks: [],
  source: "random",
  reasoning: "",
  setFilter: [],
  setCatalog: [],
};

init();

function init() {
  todayEl.textContent = formatDate(state.day);

  const shared = readSharedPack();
  if (shared) {
    loadManualPackFromNames(shared.cards, "shared");
  } else {
    const stored = loadState();
    if (stored && stored.day === state.day && stored.cards?.length) {
      state.cards = stored.cards;
      state.picks = stored.picks || [];
      state.source = stored.source || "random";
      state.reasoning = stored.reasoning || "";
      reasoningInputEl.value = state.reasoning;
      state.setFilter = stored.setFilter || [];
      updateFilterUI();
      render();
      setStatus("Loaded today’s pack.");
    } else {
      const storedFilter = stored?.setFilter || loadFilter();
      if (storedFilter?.length) {
        state.setFilter = storedFilter;
        updateFilterUI();
      }
      openPack();
    }
  }

  newPackBtn.addEventListener("click", () => openPack(true));
  shareBtn.addEventListener("click", sharePicks);
  sharePackBtn.addEventListener("click", sharePackLink);
  loadManualBtn.addEventListener("click", handleManualLoad);
  reasoningInputEl.addEventListener("input", handleReasoningInput);
  setDropdownBtn.addEventListener("click", toggleSetPanel);
  clearFilterBtn.addEventListener("click", clearFilter);
  setSearchEl.addEventListener("input", () =>
    renderSetList(setSearchEl.value.trim())
  );
  document.addEventListener("click", handleOutsideClick);
  themeToggleBtn.addEventListener("click", toggleTheme);

  initTheme();
  loadSetCatalog();
}

async function openPack(force = false) {
  if (!force && state.cards.length) {
    return;
  }

  setStatus("Opening pack...");
  setManualStatus("Ready for a shared pack.");
  newPackBtn.disabled = true;
  shareBtn.disabled = true;
  sharePackBtn.disabled = true;
  state.cards = [];
  state.picks = [];
  state.source = "random";
  state.reasoning = "";
  reasoningInputEl.value = "";
  render();

  try {
    const cards = [];
    const nameCounts = new Map();
    for (let i = 0; i < PACK_SIZE; i += 1) {
      setStatus(`Opening pack ${i + 1} / ${PACK_SIZE}...`);
      const card = await fetchUniqueCard(nameCounts);
      cards.push(card);
      await sleep(140);
    }

    state.cards = cards;
    state.picks = [];
    state.source = "random";
    state.reasoning = "";
    reasoningInputEl.value = "";
    saveState();
    render();
    setStatus("Pack ready. Make your picks.");
  } catch (error) {
    console.error(error);
    setStatus("Could not load the pack. Try again.");
  } finally {
    newPackBtn.disabled = false;
  }
}

async function fetchRandomCard() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const query = buildRandomQuery();
    const url = query ? `${API_BASE}/cards/random?q=${query}` : `${API_BASE}/cards/random`;
    const response = await fetch(url);
    if (!response.ok) {
      await sleep(200);
      continue;
    }
    const data = await response.json();
    const card = normalizeCard(data);
    if (card.image) {
      return card;
    }
  }
  throw new Error("Unable to fetch a card with an image.");
}

async function fetchUniqueCard(nameCounts) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const card = await fetchRandomCard();
    const key = card.name;
    const count = nameCounts.get(key) || 0;
    if (count < 2) {
      nameCounts.set(key, count + 1);
      return card;
    }
  }
  throw new Error("Could not build pack without excessive duplicates.");
}

function buildRandomQuery() {
  if (!state.setFilter.length) {
    return "";
  }
  const clauses = state.setFilter.map((code) => `set:${code.toLowerCase()}`);
  return encodeURIComponent(clauses.join(" OR "));
}

async function fetchCardByName(name) {
  const url = `${API_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Card not found: ${name}`);
  }
  const data = await response.json();
  const card = normalizeCard(data);
  if (!card.image) {
    throw new Error(`No image for: ${name}`);
  }
  return card;
}

function normalizeCard(data) {
  const image =
    data.image_uris?.normal ||
    data.card_faces?.[0]?.image_uris?.normal ||
    null;

  return {
    id: data.id,
    name: data.name,
    image,
    set: data.set_name,
    rarity: data.rarity,
    mana: data.mana_cost || "",
    uri: data.scryfall_uri,
  };
}

function render() {
  renderCards();
  renderPicks();
}

function renderCards() {
  cardsEl.innerHTML = "";
  state.cards.forEach((card) => {
    const node = cardTemplate.content.cloneNode(true);
    const article = node.querySelector(".card");
    const btn = node.querySelector(".card-btn");
    const img = node.querySelector(".card-img");
    const name = node.querySelector(".card-name");
    const meta = node.querySelector(".card-meta");

    article.dataset.cardId = card.id;
    btn.dataset.cardId = card.id;
    btn.setAttribute("aria-label", `Select ${card.name}`);
    img.src = card.image || "";
    img.alt = card.name;
    name.textContent = card.name;
    meta.textContent = `${card.set} · ${card.rarity}${card.mana ? ` · ${card.mana}` : ""}`;

    btn.addEventListener("click", () => togglePick(card.id));
    cardsEl.appendChild(node);
  });

  updateCardBadges();
}

function renderPicks() {
  pickCountEl.textContent = `${state.picks.length} / ${PICKS}`;
  shareBtn.disabled = state.picks.length === 0;
  sharePackBtn.disabled = state.cards.length !== PACK_SIZE;

  const slots = Array.from(picksListEl.children);
  slots.forEach((slot, index) => {
    const cardId = state.picks[index];
    slot.classList.toggle("empty", !cardId);
    slot.innerHTML = "";

    if (!cardId) {
      slot.textContent = `Pick ${index + 1}`;
      return;
    }

    const card = state.cards.find((item) => item.id === cardId);
    if (!card) {
      slot.textContent = `Pick ${index + 1}`;
      return;
    }

    const img = document.createElement("img");
    img.src = card.image;
    img.alt = card.name;

    const text = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = card.name;
    title.style.fontWeight = "600";
    const meta = document.createElement("div");
    meta.textContent = `${card.set} · ${card.rarity}`;
    meta.className = "muted";

    text.appendChild(title);
    text.appendChild(meta);

    slot.appendChild(img);
    slot.appendChild(text);
  });

  updateCardBadges();
  saveState();
}

function togglePick(cardId) {
  const existingIndex = state.picks.indexOf(cardId);
  if (existingIndex >= 0) {
    state.picks.splice(existingIndex, 1);
    renderPicks();
    return;
  }

  if (state.picks.length >= PICKS) {
    setStatus("You already picked three. Tap one to unpick.");
    return;
  }

  state.picks.push(cardId);
  renderPicks();
  setStatus("Pick locked in.");
}

function updateCardBadges() {
  const cards = cardsEl.querySelectorAll(".card");
  cards.forEach((cardEl) => {
    const cardId = cardEl.dataset.cardId;
    const badge = cardEl.querySelector(".pick-badge");
    const index = state.picks.indexOf(cardId);
    if (index >= 0) {
      cardEl.classList.add("selected");
      badge.textContent = String(index + 1);
    } else {
      cardEl.classList.remove("selected");
      badge.textContent = "";
    }
  });
}

function sharePicks() {
  const lines = [`P1P1 ${state.day}`];
  state.picks.forEach((id, index) => {
    const card = state.cards.find((item) => item.id === id);
    if (card) {
      lines.push(`${index + 1}. ${card.name}`);
    }
  });

  const payload = lines.join("\n");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(payload)
      .then(() => setStatus("Copied picks to clipboard."))
      .catch(() => setStatus("Could not copy picks."));
  } else {
    setStatus("Clipboard unavailable.");
  }
}

function sharePackLink() {
  if (state.cards.length !== PACK_SIZE) {
    setStatus("Pack not ready to share.");
    return;
  }
  const payload = {
    v: 1,
    cards: state.cards.map((card) => card.name),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const base = getBaseUrl();
  const link = `${base}?pack=${encoded}`;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(link)
      .then(() => setStatus("Pack link copied to clipboard."))
      .catch(() => setStatus("Could not copy pack link."));
  } else {
    setStatus("Clipboard unavailable.");
  }
}

async function handleManualLoad() {
  const raw = manualInputEl.value || "";
  const names = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (names.length !== PACK_SIZE) {
    setManualStatus(`Please enter exactly ${PACK_SIZE} card names.`);
    return;
  }

  setManualStatus("Resolving card names...");
  await loadManualPackFromNames(names, "manual");
}

async function loadManualPackFromNames(names, source) {
  newPackBtn.disabled = true;
  loadManualBtn.disabled = true;
  shareBtn.disabled = true;
  sharePackBtn.disabled = true;
  setStatus("Loading shared pack...");
  state.cards = [];
  state.picks = [];
  state.reasoning = "";
  reasoningInputEl.value = "";
  render();

  try {
    const cards = [];
    for (let i = 0; i < names.length; i += 1) {
      setStatus(`Resolving ${i + 1} / ${names.length}...`);
      const card = await fetchCardByName(names[i]);
      cards.push(card);
      await sleep(120);
    }

    state.cards = cards;
    state.picks = [];
    state.source = source;
    state.reasoning = "";
    reasoningInputEl.value = "";
    saveState();
    render();
    setStatus("Manual pack ready. Make your picks.");
    setManualStatus("Manual pack loaded.");
  } catch (error) {
    console.error(error);
    setStatus("Could not load manual pack. Check card names.");
    setManualStatus(error.message || "Could not load manual pack.");
  } finally {
    newPackBtn.disabled = false;
    loadManualBtn.disabled = false;
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setManualStatus(message) {
  manualStatusEl.textContent = message;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function saveState() {
  const payload = {
    day: state.day,
    cards: state.cards,
    picks: state.picks,
    source: state.source,
    reasoning: state.reasoning,
    setFilter: state.setFilter,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function handleReasoningInput(event) {
  state.reasoning = event.target.value;
  saveState();
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseUrl() {
  if (location.origin === "null") {
    return location.href.split("?")[0];
  }
  return location.origin + location.pathname;
}

function base64UrlEncode(value) {
  const base64 = btoa(value);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  return atob(base64);
}

function readSharedPack() {
  const params = new URLSearchParams(location.search);
  const code = params.get("pack");
  if (!code) {
    return null;
  }

  try {
    const decoded = base64UrlDecode(code);
    const payload = JSON.parse(decoded);
    if (payload?.v === 1 && Array.isArray(payload.cards)) {
      return { cards: payload.cards };
    }
  } catch (error) {
    console.error(error);
  }

  return null;
}

function initTheme() {
  const stored = localStorage.getItem("p1p1:theme");
  if (stored === "dark") {
    document.body.classList.add("dark");
    themeToggleBtn.textContent = "Light Mode";
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  themeToggleBtn.textContent = isDark ? "Light Mode" : "Dark Mode";
  localStorage.setItem("p1p1:theme", isDark ? "dark" : "light");
}

function updateFilterUI() {
  if (state.setFilter.length) {
    filterStatusEl.textContent = `Currently: ${state.setFilter.join(", ")}.`;
  } else {
    filterStatusEl.textContent = "Currently: All sets.";
  }
  renderActiveChips();
}

function saveFilter(filter) {
  localStorage.setItem("p1p1:setFilter", JSON.stringify(filter));
}

function loadFilter() {
  try {
    const raw = localStorage.getItem("p1p1:setFilter");
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function toggleSetPanel(event) {
  event.stopPropagation();
  const willOpen = setPanelEl.hasAttribute("hidden");
  if (willOpen) {
    setPanelEl.removeAttribute("hidden");
    setSearchEl.focus();
  } else {
    setPanelEl.setAttribute("hidden", "");
  }
}

function handleOutsideClick(event) {
  if (setPanelEl.hasAttribute("hidden")) {
    return;
  }
  const target = event.target;
  if (setPanelEl.contains(target) || setDropdownBtn.contains(target)) {
    return;
  }
  setPanelEl.setAttribute("hidden", "");
}

function clearFilter() {
  state.setFilter = [];
  saveFilter([]);
  updateFilterUI();
  renderSetList(setSearchEl.value.trim());
  setStatus("Set filter cleared.");
}

function renderActiveChips() {
  activeSetsEl.innerHTML = "";
  state.setFilter.forEach((code) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = code;
    activeSetsEl.appendChild(chip);
  });
}

async function loadSetCatalog() {
  try {
    const response = await fetch(`${API_BASE}/sets`);
    if (!response.ok) {
      throw new Error("Failed to load set list.");
    }
    const data = await response.json();
    const sets = data?.data || [];
    state.setCatalog = sets
      .filter(
        (set) =>
          set.code &&
          set.name &&
          !set.name.trim().toLowerCase().endsWith("tokens")
      )
      .sort((a, b) => {
        const aDate = a.released_at || "";
        const bDate = b.released_at || "";
        if (aDate === bDate) {
          return a.name.localeCompare(b.name);
        }
        return bDate.localeCompare(aDate);
      });
    renderSetList("");
  } catch (error) {
    console.error(error);
    filterStatusEl.textContent = "Set list unavailable. Try again later.";
  }
}

function renderSetList(filterText) {
  const term = filterText.toLowerCase();
  setListEl.innerHTML = "";

  const filtered = state.setCatalog.filter((set) => {
    if (!term) return true;
    return (
      set.name.toLowerCase().includes(term) ||
      set.code.toLowerCase().includes(term)
    );
  });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No sets match that search.";
    setListEl.appendChild(empty);
    return;
  }

  filtered.forEach((set) => {
    const row = document.createElement("label");
    row.className = "set-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.setFilter.includes(set.code.toUpperCase());
    checkbox.addEventListener("change", () => {
      toggleSetSelection(set.code.toUpperCase(), checkbox.checked);
    });

    const icon = document.createElement("img");
    icon.className = "set-icon";
    icon.src = set.icon_svg_uri || "";
    icon.alt = `${set.name} symbol`;
    icon.loading = "lazy";

    const name = document.createElement("div");
    name.className = "set-name";
    name.textContent = set.name;

    const meta = document.createElement("div");
    meta.className = "set-meta";
    const date = set.released_at ? set.released_at.slice(0, 4) : "—";
    meta.textContent = `${date} · ${set.set_type}`;

    const code = document.createElement("div");
    code.className = "set-code";
    code.textContent = set.code.toUpperCase();

    row.appendChild(checkbox);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(code);
    row.appendChild(meta);

    setListEl.appendChild(row);
  });
}

function toggleSetSelection(code, enabled) {
  if (enabled) {
    if (!state.setFilter.includes(code)) {
      state.setFilter.push(code);
    }
  } else {
    state.setFilter = state.setFilter.filter((item) => item !== code);
  }

  saveFilter(state.setFilter);
  updateFilterUI();
  setStatus("Set filter updated. Open a new pack to use it.");
}
