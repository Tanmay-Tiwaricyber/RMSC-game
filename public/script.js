/* =============================
      SOCKET SETUP
=============================*/

const socket = io();

/* =============================
      STATE
=============================*/

let roomCode = "";
let myName = "";
let isHost = false;
let myRole = "";
let revealed = false;
let currentPlayers = [];

/* =============================
      DOM
=============================*/

const home = document.getElementById("home");
const lobby = document.getElementById("lobby");
const game = document.getElementById("game");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const roomCodeEl = document.getElementById("roomCode");
const playersList = document.getElementById("playersList");

const lobbyControls = document.getElementById("lobbyControls");
const waitMessage = document.getElementById("waitMessage");

const card = document.getElementById("card");
const cardFront = document.getElementById("cardFront");
const cardBack = document.getElementById("cardBack");

const roleNameEl = document.getElementById("roleName");
const rolePointsEl = document.getElementById("rolePoints");
const roleIconContainer = document.getElementById("roleIconContainer");

const publicText = document.getElementById("publicText");

const guessArea = document.getElementById("guessArea");
const guessButtons = document.getElementById("guessButtons");

const scoreboardArea = document.getElementById("scoreboardArea");
const scoreBoard = document.getElementById("scoreBoard");

const nextBtn = document.getElementById("nextBtn");

const lobbySide = document.getElementById("lobbySide");
const gameSide = document.getElementById("gameSide");
const roundHistory = document.getElementById("roundHistory");

const chatPanel = document.getElementById("chatPanel");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatToggle = document.getElementById("chatToggle");

/* =============================
      BUTTON ACTIONS
=============================*/

function simCreateRoom() {
  myName = nameInput.value.trim();
  if (!myName) return alert("Enter your name");

  socket.emit("createRoom", myName);
}

function simJoinRoom() {
  myName = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();

  if (!myName || !code)
    return alert("Enter name and room code");

  socket.emit("joinRoom", {
    name: myName,
    roomCode: code
  });
}

function simStartGame() {
  socket.emit("startGame", roomCode);
}

function simNextRound() {
  socket.emit("nextRound", roomCode);
}

/* =============================
      TEMP STORAGE
=============================*/

function loadTempState() {
  const savedName = sessionStorage.getItem("rmcs_name");
  if (savedName) nameInput.value = savedName;
}

nameInput.addEventListener("input", () => {
  sessionStorage.setItem("rmcs_name", nameInput.value.trim());
});

loadTempState();

/* =============================
      CHAT
=============================*/

function sendChat() {
  const message = chatInput.value.trim();
  if (!message || !roomCode) return;

  socket.emit("chatMessage", {
    roomCode,
    name: myName || "Player",
    message
  });

  chatInput.value = "";
}

chatSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendChat();
});

function setChatCollapsed(collapsed) {
  chatPanel.classList.toggle("collapsed", collapsed);
  chatToggle.setAttribute("aria-expanded", String(!collapsed));
}

chatToggle.addEventListener("click", () => {
  const collapsed = chatPanel.classList.contains("collapsed");
  setChatCollapsed(!collapsed);
});

/* =============================
      SERVER EVENTS
=============================*/

socket.on("roomJoined", data => {
  roomCode = data.roomCode;
  isHost = data.host;

  home.classList.add("hidden");
  lobby.classList.remove("hidden");

  roomCodeEl.textContent = roomCode;

  if (isHost) lobbyControls.classList.remove("hidden");
  else lobbyControls.classList.add("hidden");

  chatPanel.classList.remove("hidden");
  lobbySide.appendChild(chatPanel);
});

socket.on("roomError", msg => {
  alert(msg);
});

socket.on("playerList", players => {
  currentPlayers = players;
  playersList.innerHTML = "";

  players.forEach(p => {
    const li = document.createElement("li");
    li.className = "player-card";

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.textContent = p.name[0].toUpperCase();

    li.appendChild(avatar);
    li.appendChild(document.createTextNode(p.name));

    playersList.appendChild(li);
  });
});

socket.on("waitingStatus", count => {
  waitMessage.textContent = `${count}/4 players joined`;

  if (count === 4 && isHost) {
    lobbyControls.classList.remove("hidden");
    waitMessage.classList.add("hidden");
  } else {
    lobbyControls.classList.add("hidden");
    waitMessage.classList.remove("hidden");
  }
});

socket.on("chatHistory", messages => {
  chatMessages.innerHTML = "";
  messages.forEach(msg => appendChatMessage(msg));
  scrollChatToBottom();
});

socket.on("chatMessage", msg => {
  appendChatMessage(msg);
  scrollChatToBottom();
});

socket.on("roundHistory", history => {
  renderRoundHistory(history);
});

/* =============================
      GAME START
=============================*/

socket.on("yourRole", role => {
  myRole = role;
  revealed = false;

  lobby.classList.add("hidden");
  game.classList.remove("hidden");

  resetCard();
  guessArea.classList.add("hidden");
  scoreboardArea.classList.add("hidden");
  nextBtn.classList.add("hidden");

  gameSide.appendChild(chatPanel);
});

socket.on("publicReveal", data => {
  publicText.textContent =
    `Round ${data.round} - Raja: ${data.raja} | Mantri: ${data.mantri}`;
});

/* =============================
      CARD REVEAL
=============================*/

function resetCard() {
  card.classList.remove("revealed");
  cardFront.classList.remove("hidden");
  cardBack.classList.add("hidden");
}

function revealRole() {
  if (revealed) return;

  revealed = true;

  card.classList.add("revealed");
  cardFront.classList.add("hidden");
  cardBack.classList.remove("hidden");

  showRole(myRole);

  if (myRole === "MANTRI") {
    setTimeout(() => {
      buildGuessButtons(currentPlayers);
      guessArea.classList.remove("hidden");
    }, 800);
  }
}

/* =============================
      ROLE UI
=============================*/

function showRole(role) {
  roleNameEl.textContent = role;

  const points = {
    RAJA: 1000,
    MANTRI: 500,
    SIPAHI: 250,
    CHOR: 0
  };

  rolePointsEl.textContent = `Points: +${points[role]}`;

  const icon = document
    .getElementById(`icon-${role.toLowerCase()}`)
    .cloneNode(true);

  icon.classList.add("icon-svg");

  roleIconContainer.innerHTML = "";
  roleIconContainer.appendChild(icon);

  card.className = `card revealed role-${role.toLowerCase()}`;
}

/* =============================
      GUESS PHASE
=============================*/

socket.on("roundResult", data => {
  guessArea.classList.add("hidden");
  scoreboardArea.classList.remove("hidden");

  renderScoreboard(data.players, data.roundScores);
  renderRoundHistory(data.roundHistory || []);
});

function renderScoreboard(players, roundScores = {}) {
  scoreBoard.innerHTML = "";

  const max = Math.max(1, ...players.map(p => p.score));

  players.forEach(p => {
    const delta = roundScores[p.id] || 0;
    const li = document.createElement("li");
    li.className = "score-item";

    li.innerHTML = `
      <span class="score-name">${p.name}</span>
      <span class="score-delta">+${delta}</span>
      <div class="score-bar-container">
        <div class="score-bar"></div>
      </div>
      <strong>${p.score}</strong>
    `;

    scoreBoard.appendChild(li);

    setTimeout(() => {
      li.querySelector(".score-bar").style.width =
        (p.score / max) * 100 + "%";
    }, 150);
  });

  nextBtn.classList.remove("hidden");
}

/* =============================
      MANTRI GUESS UI
=============================*/

function buildGuessButtons(players) {
  guessButtons.innerHTML = "";

  players.forEach(p => {
    if (p.id === socket.id) return;

    const btn = document.createElement("button");
    btn.className = "guess-btn";
    btn.textContent = p.name;

    btn.onclick = () =>
      socket.emit("mantriGuess", {
        roomCode,
        targetId: p.id
      });

    guessButtons.appendChild(btn);
  });
}

/* =============================
      ROUND HISTORY
=============================*/

function renderRoundHistory(history) {
  roundHistory.innerHTML = "";

  const recent = [...history].slice(-10).reverse();
  recent.forEach(round => {
    const li = document.createElement("li");
    li.className = "round-item";

    const scoreLine = round.scores
      .map(item => `${item.name}: +${item.delta}`)
      .join(" | ");

    li.innerHTML = `
      <strong>Round ${round.round}</strong>
      <div class="round-scores">${scoreLine}</div>
    `;

    roundHistory.appendChild(li);
  });
}

/* =============================
      CHAT HELPERS
=============================*/

function appendChatMessage(msg) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-message";

  const time = new Date(msg.time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  wrapper.innerHTML = `
    <div class="chat-meta">
      <span>${msg.name}</span>
      <span>${time}</span>
    </div>
    <div>${escapeHtml(msg.message)}</div>
  `;

  chatMessages.appendChild(wrapper);
}

function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}
