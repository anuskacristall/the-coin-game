/**
 * The Coin Game — Simulador Kanban & Batch Size
 * Frontend Client (WebSockets, Lobby, Facilitador & Alocação Dinâmica)
 */

// --- Estado Global do Cliente ---
let socket = null;
let currentRoomId = null;
let myPlayerId = localStorage.getItem("coin_game_player_id") || "p-" + Math.random().toString(36).substring(2, 8);
let myPlayerName = localStorage.getItem("coin_game_player_name") || "";
let currentRoomState = null;
let soundEnabled = true;
let soloOverride = false;
let localTimerInterval = null;

localStorage.setItem("coin_game_player_id", myPlayerId);

// --- Elementos do DOM ---
const lobbyScreen = document.getElementById("lobbyScreen");
const gameScreen = document.getElementById("gameScreen");
const inputPlayerName = document.getElementById("inputPlayerName");
const inputRoomCode = document.getElementById("inputRoomCode");
const btnCreateRoom = document.getElementById("btnCreateRoom");
const btnJoinRoom = document.getElementById("btnJoinRoom");

const currentRoomCode = document.getElementById("currentRoomCode");
const btnCopyLink = document.getElementById("btnCopyLink");
const connectionStatus = document.getElementById("connectionStatus");
const displayPlayerName = document.getElementById("displayPlayerName");
const displayPlayerRole = document.getElementById("displayPlayerRole");
const toastBanner = document.getElementById("toastBanner");
const btnSoundToggle = document.getElementById("btnSoundToggle");

// Métricas
const metricTimer = document.getElementById("metricTimer");
const metricFirstDelivery = document.getElementById("metricFirstDelivery");
const metricBatchSize = document.getElementById("metricBatchSize");
const metricCompletedCoins = document.getElementById("metricCompletedCoins");

// Painel do Facilitador
const facilitatorBar = document.getElementById("facilitatorBar");
const facLobbyControls = document.getElementById("facLobbyControls");
const facInGameControls = document.getElementById("facInGameControls");
const facLobbyStatusText = document.getElementById("facLobbyStatusText");
const btnMasterStartGame = document.getElementById("btnMasterStartGame");
const roundStatusText = document.getElementById("roundStatusText");
const btnStartWaterfall = document.getElementById("btnStartWaterfall");
const btnStartKanban = document.getElementById("btnStartKanban");
const btnCustomRound = document.getElementById("btnCustomRound");
const btnResetRound = document.getElementById("btnResetRound");
const btnReturnToLobby = document.getElementById("btnReturnToLobby");
const checkSoloOverride = document.getElementById("checkSoloOverride");

// Pipeline Global
const pipelineBoard = document.getElementById("pipelineBoard");

// Visão 1: Sala de Espera dos Jogadores
const waitingRoomCard = document.getElementById("waitingRoomCard");
const waitingRoomTitle = document.getElementById("waitingRoomTitle");
const waitingRoomSubtitle = document.getElementById("waitingRoomSubtitle");
const lobbyPlayersCountBadge = document.getElementById("lobbyPlayersCountBadge");
const lobbyPlayersRoster = document.getElementById("lobbyPlayersRoster");

// Visão 2: Dashboard do Facilitador em Jogo
const facilitatorDashboardCard = document.getElementById("facilitatorDashboardCard");
const facDashStats = document.getElementById("facDashStats");

// Visão 3: Área de Trabalho do Jogador (Multi-Estações)
const playerWorkspace = document.getElementById("playerWorkspace");
const myStationsSubtitle = document.getElementById("myStationsSubtitle");
const myStationsGrid = document.getElementById("myStationsGrid");

// Modais
const btnHelpModal = document.getElementById("btnHelpModal");
const modalHelp = document.getElementById("modalHelp");
const btnCloseHelp = document.getElementById("btnCloseHelp");

const btnHistoryModal = document.getElementById("btnHistoryModal");
const modalHistory = document.getElementById("modalHistory");
const btnCloseHistory = document.getElementById("btnCloseHistory");
const historyTableBody = document.getElementById("historyTableBody");
const emptyHistoryMsg = document.getElementById("emptyHistoryMsg");
const pedagogicBox = document.getElementById("pedagogicBox");
const pedagogicText = document.getElementById("pedagogicText");

const modalCustom = document.getElementById("modalCustom");
const btnCloseCustom = document.getElementById("btnCloseCustom");
const btnConfirmCustomRound = document.getElementById("btnConfirmCustomRound");
const customBatchSize = document.getElementById("customBatchSize");
const customTotalCoins = document.getElementById("customTotalCoins");

// --- Síntese de Áudio com Web Audio API (Zero Dependências) ---
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, type = "sine", duration = 0.1, gainVal = 0.15) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function soundCoinClick() {
  playTone(740, "triangle", 0.08, 0.2);
}

function soundBatchReady() {
  if (!soundEnabled) return;
  setTimeout(() => playTone(523.25, "sine", 0.12, 0.2), 0);
  setTimeout(() => playTone(659.25, "sine", 0.18, 0.2), 100);
  setTimeout(() => playTone(783.99, "sine", 0.25, 0.25), 200);
}

function soundDispatch() {
  if (!soundEnabled) return;
  playTone(440, "sine", 0.12, 0.2);
  setTimeout(() => playTone(880, "sine", 0.18, 0.2), 70);
}

function soundFirstDelivery() {
  if (!soundEnabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, idx) => {
    setTimeout(() => playTone(freq, "triangle", 0.28, 0.22), idx * 110);
  });
}

// --- Notificações Toast ---
let toastTimeout = null;
function showToast(message, duration = 3500) {
  if (!toastBanner || !message) return;
  toastBanner.textContent = message;
  toastBanner.classList.add("active");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastBanner.classList.remove("active");
  }, duration);
}

// --- Inicialização ---
function initApp() {
  if (myPlayerName) {
    inputPlayerName.value = myPlayerName;
    displayPlayerName.textContent = myPlayerName;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  if (roomParam) {
    inputRoomCode.value = roomParam.toUpperCase();
    if (myPlayerName) {
      joinRoom(roomParam.toUpperCase(), myPlayerName);
    }
  }

  setupEventListeners();
}

function setupEventListeners() {
  // Criar sala (Assume papel de Facilitador)
  btnCreateRoom.addEventListener("click", () => {
    const name = inputPlayerName.value.trim() || "Facilitador";
    savePlayerName(name);
    createAndJoinRoom(name);
  });

  // Entrar na sala (Jogador convidado)
  btnJoinRoom.addEventListener("click", () => {
    const name = inputPlayerName.value.trim() || "Jogador";
    const code = inputRoomCode.value.trim().toUpperCase();
    if (!code) {
      alert("Por favor, digite o código da sala.");
      return;
    }
    savePlayerName(name);
    joinRoom(code, name);
  });

  btnCopyLink.addEventListener("click", () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast("📋 Link da sala copiado para a área de transferência!");
    }).catch(() => {
      showToast(`Link da sala: ${url}`, 5000);
    });
  });

  btnSoundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    btnSoundToggle.textContent = soundEnabled ? "🔊" : "🔇";
    btnSoundToggle.title = soundEnabled ? "Silenciar Áudio" : "Ativar Áudio";
  });

  checkSoloOverride.addEventListener("change", (e) => {
    soloOverride = e.target.checked;
    if (soloOverride) {
      showToast("🛠️ Modo Solo/Teste ativado! Você pode operar todas as estações nesta tela.", 4000);
    }
    renderMainContent(currentRoomState);
  });

  // Facilitador: Botão Mestre Iniciar Partida
  btnMasterStartGame.addEventListener("click", () => {
    sendWsMessage({ action: "START_GAME" });
  });

  // Facilitador: Voltar ao Lobby
  btnReturnToLobby.addEventListener("click", () => {
    if (confirm("Deseja pausar o jogo e retornar todos para a Sala de Espera?")) {
      sendWsMessage({ action: "RETURN_TO_LOBBY" });
    }
  });

  // Facilitador: Controles de Rodada
  btnStartWaterfall.addEventListener("click", () => {
    sendWsMessage({
      action: "START_ROUND",
      round_type: "waterfall",
      batch_size: 10,
      total_coins: 20
    });
  });

  btnStartKanban.addEventListener("click", () => {
    sendWsMessage({
      action: "START_ROUND",
      round_type: "kanban",
      batch_size: 2,
      total_coins: 20
    });
  });

  btnResetRound.addEventListener("click", () => {
    if (confirm("Deseja reiniciar a rodada atual?")) {
      sendWsMessage({ action: "RESET_ROUND" });
    }
  });

  btnCustomRound.addEventListener("click", () => {
    modalCustom.classList.add("active");
  });

  btnCloseCustom.addEventListener("click", () => {
    modalCustom.classList.remove("active");
  });

  btnConfirmCustomRound.addEventListener("click", () => {
    const bSize = parseInt(customBatchSize.value) || 5;
    const tCoins = parseInt(customTotalCoins.value) || 20;
    sendWsMessage({
      action: "START_ROUND",
      round_type: "custom",
      batch_size: bSize,
      total_coins: tCoins
    });
    modalCustom.classList.remove("active");
  });

  // Modais de Ajuda e Histórico
  btnHelpModal.addEventListener("click", () => modalHelp.classList.add("active"));
  btnCloseHelp.addEventListener("click", () => modalHelp.classList.remove("active"));

  btnHistoryModal.addEventListener("click", () => {
    renderHistoryModal();
    modalHistory.classList.add("active");
  });
  btnCloseHistory.addEventListener("click", () => modalHistory.classList.remove("active"));

  window.addEventListener("click", (e) => {
    if (e.target === modalHelp) modalHelp.classList.remove("active");
    if (e.target === modalHistory) modalHistory.classList.remove("active");
    if (e.target === modalCustom) modalCustom.classList.remove("active");
  });
}

function savePlayerName(name) {
  myPlayerName = name;
  localStorage.setItem("coin_game_player_name", name);
  displayPlayerName.textContent = name;
}

// --- Criação e Conexão de Sala ---
async function createAndJoinRoom(playerName) {
  try {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName })
    });
    const data = await res.json();
    if (data.room_id) {
      joinRoom(data.room_id, playerName);
    }
  } catch (err) {
    console.error("Erro ao criar sala:", err);
    const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    joinRoom(fallbackCode, playerName);
  }
}

function joinRoom(roomId, playerName) {
  currentRoomId = roomId.toUpperCase();
  currentRoomCode.textContent = currentRoomId;

  const newUrl = `${window.location.pathname}?room=${currentRoomId}`;
  window.history.replaceState({ path: newUrl }, "", newUrl);

  connectWebSocket(currentRoomId, playerName);
}

function connectWebSocket(roomId, playerName) {
  if (socket) {
    try { socket.close(); } catch(e) {}
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}`;

  connectionStatus.textContent = "Conectando...";
  connectionStatus.className = "connection-status offline";

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    connectionStatus.textContent = "Conectado";
    connectionStatus.className = "connection-status online";

    sendWsMessage({
      action: "JOIN_ROOM",
      playerName: playerName,
      playerId: myPlayerId
    });

    lobbyScreen.classList.remove("active");
    gameScreen.classList.add("active");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (err) {
      console.error("Erro ao processar mensagem do servidor:", err);
    }
  };

  socket.onclose = () => {
    connectionStatus.textContent = "Desconectado";
    connectionStatus.className = "connection-status offline";
    setTimeout(() => {
      if (gameScreen.classList.contains("active")) {
        connectWebSocket(roomId, playerName);
      }
    }, 3000);
  };

  socket.onerror = (err) => {
    console.error("Erro de conexão WebSocket:", err);
  };
}

function sendWsMessage(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket não está conectado.");
    return;
  }
  payload.playerId = myPlayerId;
  socket.send(JSON.stringify(payload));
}

// --- Tratamento das Mensagens do Servidor ---
function handleServerMessage(msg) {
  if (msg.notification) {
    showToast(msg.notification, 4000);
  }

  if (msg.type === "GAME_STARTED") {
    soundFirstDelivery();
  } else if (msg.first_delivery_event) {
    soundFirstDelivery();
  } else if (msg.round_completed_event) {
    soundFirstDelivery();
  }

  if (msg.type === "ERROR_MSG") {
    alert(msg.message || "Erro na operação.");
    return;
  }

  if (msg.state) {
    currentRoomState = msg.state;
    renderGameState(currentRoomState);
  } else if (msg.type === "COIN_PROCESSED") {
    soundCoinClick();
    if (currentRoomState) {
      const targetBatch = currentRoomState.stations
        .flatMap(s => s.batches)
        .find(b => b.batch_id === msg.batch_id);
      if (targetBatch && targetBatch.coins[msg.coin_idx]) {
        targetBatch.coins[msg.coin_idx].processed = true;
        targetBatch.processed_count = targetBatch.coins.filter(c => c.processed).length;
        targetBatch.is_ready_to_send = targetBatch.processed_count === targetBatch.size;
        targetBatch.progress_percent = Math.round((targetBatch.processed_count / targetBatch.size) * 100);
        renderMainContent(currentRoomState);
      }
    }
  }
}

// --- Renderização do Estado Geral ---
function renderGameState(state) {
  if (!state) return;

  const myPlayer = state.players.find(p => p.id === myPlayerId);
  const isFacilitator = myPlayer ? myPlayer.is_facilitator : false;

  // Atualiza crachá de perfil
  if (displayPlayerRole) {
    displayPlayerRole.textContent = isFacilitator ? "👑 Facilitador" : "🕹️ Jogador";
    displayPlayerRole.style.color = isFacilitator ? "#c4b5fd" : "#34d399";
  }

  // Top Metrics
  renderTopMetrics(state.round);

  // Painel do Facilitador
  renderFacilitatorControls(state, isFacilitator);

  // Pipeline Kanban
  renderPipelineBoard(state);

  // Área de Conteúdo Principal (Lobby vs Dashboard vs Estações)
  renderMainContent(state);
}

function renderTopMetrics(round) {
  if (!round) return;

  metricBatchSize.textContent = round.batch_size ? `${round.batch_size} moedas` : "--";

  if (round.first_delivery_time !== null && round.first_delivery_time !== undefined) {
    metricFirstDelivery.textContent = `${round.first_delivery_time.toFixed(1)}s ⭐`;
  } else {
    metricFirstDelivery.textContent = round.status === "running" ? "Em fluxo..." : "--";
  }

  metricCompletedCoins.textContent = `${round.completed_coins_count} / ${round.total_coins || 0}`;

  if (round.status === "running" && round.start_time) {
    if (!localTimerInterval) {
      localTimerInterval = setInterval(() => {
        const elapsed = (Date.now() / 1000) - round.start_time;
        metricTimer.textContent = formatTimer(Math.max(0, elapsed));
      }, 100);
    }
  } else {
    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
    if (round.total_delivery_time) {
      metricTimer.textContent = formatTimer(round.total_delivery_time);
    } else if (round.status === "idle") {
      metricTimer.textContent = "00:00.0";
    }
  }
}

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `${mm}:${ss}.${ms}`;
}

// --- Painel do Facilitador ---
function renderFacilitatorControls(state, isFacilitator) {
  if (!isFacilitator) {
    facilitatorBar.style.display = "none";
    return;
  }

  facilitatorBar.style.display = "block";
  const isLobby = state.room_phase === "lobby";

  if (isLobby) {
    facLobbyControls.style.display = "flex";
    facInGameControls.style.display = "none";

    const guests = state.guests_count || 0;
    facLobbyStatusText.textContent = `Aguardando jogadores entrarem... (${guests} convidados prontos)`;
    btnMasterStartGame.innerHTML = `<span>🚀 Iniciar Partida (Alocar ${guests > 0 ? guests : "Solo"} Jogador${guests === 1 ? "" : "es"})</span>`;
  } else {
    facLobbyControls.style.display = "none";
    facInGameControls.style.display = "flex";

    const round = state.round;
    const isRunning = round.status === "running";
    const isCompleted = round.status === "completed";

    if (isRunning) {
      roundStatusText.textContent = `Rodada ${round.round_number} (${round.round_type.toUpperCase()} - Lote ${round.batch_size})`;
      roundStatusText.className = "round-status-tag running";
    } else if (isCompleted) {
      roundStatusText.textContent = `Rodada ${round.round_number} Finalizada (${round.total_delivery_time}s)`;
      roundStatusText.className = "round-status-tag";
    } else {
      roundStatusText.textContent = "Aguardando Início da Rodada";
      roundStatusText.className = "round-status-tag";
    }

    btnStartWaterfall.disabled = isRunning;
    btnStartKanban.disabled = isRunning;
    btnCustomRound.disabled = isRunning;
  }
}

// --- Pipeline Kanban Global ---
function renderPipelineBoard(state) {
  if (!pipelineBoard) return;
  pipelineBoard.innerHTML = "";

  const myPlayer = state.players.find(p => p.id === myPlayerId);
  const myStations = myPlayer ? (myPlayer.stations || []) : [];

  state.stations.forEach((st) => {
    const isMySt = myStations.includes(st.id);
    const isBottleneck = st.wip_coins >= 10;

    const col = document.createElement("div");
    col.className = `pipeline-col ${isMySt ? "is-my-station" : ""}`;
    col.style.borderTop = `4px solid ${st.color}`;

    col.innerHTML = `
      <div class="pipeline-col-header">
        <div class="col-station-title">
          <span class="col-station-icon">${st.icon}</span>
          <span>E${st.id}: ${st.name.split(" ")[0]}</span>
        </div>
        <span class="col-wip-badge ${isBottleneck ? "bottleneck" : ""}" title="Work In Progress (WIP)">
          WIP: ${st.wip_coins}
        </span>
      </div>

      <div class="col-player-assigned">
        <span class="dot ${st.is_online ? "" : "offline"}"></span>
        <span>${st.assigned_player_name || (state.room_phase === "lobby" ? "Aguardando início" : "Vaga aberta")}</span>
      </div>

      <div class="col-batches-container">
        ${renderStationBatchChips(st.batches)}
      </div>
    `;

    pipelineBoard.appendChild(col);
  });

  // Coluna Concluído
  const doneCoins = state.round.completed_coins_count || 0;
  const doneCol = document.createElement("div");
  doneCol.className = "pipeline-col";
  doneCol.style.borderTop = "4px solid #10b981";

  doneCol.innerHTML = `
    <div class="pipeline-col-header">
      <div class="col-station-title">
        <span class="col-station-icon">🏆</span>
        <span>Concluído</span>
      </div>
      <span class="col-wip-badge" style="color: #10b981;">
        ${doneCoins} moedas
      </span>
    </div>

    <div class="col-player-assigned">
      <span class="dot"></span>
      <span>Entregue ao Cliente</span>
    </div>

    <div class="col-batches-container">
      ${state.completed_batches.map(b => `
        <div class="batch-chip batch-chip-done">
          <span>📦 Lote #${b.batch_number}</span>
          <strong>${b.size} ✓</strong>
        </div>
      `).join("")}
    </div>
  `;

  pipelineBoard.appendChild(doneCol);
}

function renderStationBatchChips(batches) {
  if (!batches || batches.length === 0) {
    return `<div style="font-size: 11px; color: var(--text-dim); text-align: center; margin-top: 10px;">(Vazio)</div>`;
  }
  return batches.map((b, index) => {
    const isActive = index === 0;
    return `
      <div class="batch-chip ${isActive ? "active-processing" : ""}">
        <span>${isActive ? "▶ Lote" : "⏳ Lote"} #${b.batch_number}</span>
        <strong>${b.processed_count}/${b.size}</strong>
      </div>
    `;
  }).join("");
}

// --- Renderização da Área Principal (Lobby vs Em Jogo) ---
function renderMainContent(state) {
  const isLobby = state.room_phase === "lobby";
  const myPlayer = state.players.find(p => p.id === myPlayerId);
  const isFacilitator = myPlayer ? myPlayer.is_facilitator : false;

  // CASO 1: SALA DE ESPERA (LOBBY)
  if (isLobby) {
    waitingRoomCard.style.display = isFacilitator ? "none" : "flex";
    facilitatorDashboardCard.style.display = isFacilitator ? "flex" : "none";
    playerWorkspace.style.display = "none";

    renderWaitingRoomRoster(state);
    return;
  }

  // CASO 2: EM JOGO (PARTIDA INICIADA)
  waitingRoomCard.style.display = "none";

  if (isFacilitator && !soloOverride) {
    // Facilitador sem modo solo: vê dashboard de comando
    facilitatorDashboardCard.style.display = "flex";
    playerWorkspace.style.display = "none";
  } else {
    // Jogador comum (ou facilitador em modo solo/teste): vê suas estações
    facilitatorDashboardCard.style.display = "none";
    playerWorkspace.style.display = "flex";
    renderMyStationsWorkspace(state, myPlayer, isFacilitator);
  }
}

// Renderiza a lista de avatares na Sala de Espera
function renderWaitingRoomRoster(state) {
  if (!lobbyPlayersRoster) return;
  lobbyPlayersRoster.innerHTML = "";

  const connectedPlayers = state.players.filter(p => p.online);
  lobbyPlayersCountBadge.textContent = `${connectedPlayers.length} conectados`;

  connectedPlayers.forEach(p => {
    const chip = document.createElement("div");
    chip.className = `player-roster-chip ${p.is_facilitator ? "is-facilitator" : ""} ${p.id === myPlayerId ? "is-me" : ""}`;
    chip.innerHTML = `
      <span>${p.is_facilitator ? "👑" : "👤"}</span>
      <span>${p.name} ${p.id === myPlayerId ? "(Você)" : ""}</span>
      ${p.is_facilitator ? '<span style="font-size: 10px; opacity: 0.8;">[Host]</span>' : ""}
    `;
    lobbyPlayersRoster.appendChild(chip);
  });
}

// Renderiza a Área de Trabalho Multi-Estação do Jogador
function renderMyStationsWorkspace(state, myPlayer, isFacilitator) {
  if (!myStationsGrid) return;
  myStationsGrid.innerHTML = "";

  // Determina quais estações este jogador opera
  let stationsToRender = [];
  if (soloOverride) {
    // Em modo solo: renderiza todas as 5 estações para teste completo
    stationsToRender = state.stations;
    myStationsSubtitle.textContent = "[Modo Solo Ativo] Você tem controle sobre todas as 5 etapas da simulação.";
  } else {
    const assignedIds = myPlayer ? (myPlayer.stations || []) : [];
    stationsToRender = state.stations.filter(s => assignedIds.includes(s.id));
    if (stationsToRender.length === 1) {
      myStationsSubtitle.textContent = `Você é o responsável pela Estação ${stationsToRender[0].id}: ${stationsToRender[0].name}`;
    } else {
      myStationsSubtitle.textContent = `Você é o responsável por ${stationsToRender.length} etapas consecutivas do projeto.`;
    }
  }

  if (stationsToRender.length === 0) {
    myStationsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">
        <h4>Nenhuma estação atribuída a você no momento.</h4>
        <p>Você pode acompanhar o fluxo no Pipeline geral acima como observador.</p>
      </div>
    `;
    return;
  }

  // Gera o painel de trabalho de cada estação atribuída
  stationsToRender.forEach(st => {
    const panel = createStationPanelElement(st, state);
    myStationsGrid.appendChild(panel);
  });
}

function createStationPanelElement(st, state) {
  const panel = document.createElement("div");
  panel.className = "station-panel";
  panel.style.borderTop = `4px solid ${st.color}`;

  const batches = st.batches || [];
  const activeBatch = batches.length > 0 ? batches[0] : null;
  const waitingBatchesCount = Math.max(0, batches.length - 1);

  panel.innerHTML = `
    <div class="station-panel-header">
      <div class="st-title-group">
        <span class="st-icon-bubble">${st.icon}</span>
        <div class="st-panel-titles">
          <h3>Estação ${st.id}: ${st.name}</h3>
          <span>${st.assigned_player_name ? `Operador: ${st.assigned_player_name}` : "Vaga aberta"}</span>
        </div>
      </div>
    </div>

    <div class="station-panel-body">
      <div class="panel-queue-stats">
        <div class="queue-stat-item">
          <span class="stat-label">Na Fila:</span>
          <strong>${waitingBatchesCount} lote(s)</strong>
        </div>
        <div class="queue-stat-item">
          <span class="stat-label">Lote em Processo:</span>
          <strong>${activeBatch ? `#${activeBatch.batch_number} (${activeBatch.size} moedas)` : "Nenhum"}</strong>
        </div>
        <div class="queue-stat-item">
          <span class="stat-label">Progresso:</span>
          <strong>${activeBatch ? `${activeBatch.processed_count}/${activeBatch.size}` : "0/0"}</strong>
        </div>
      </div>

      <div class="panel-progress-bar-container">
        <div class="panel-progress-bar-fill" style="width: ${activeBatch ? activeBatch.progress_percent : 0}%;"></div>
      </div>

      <!-- Moedas Interativas -->
      <div class="panel-coins-arena" id="arena-st-${st.id}">
        ${renderPanelCoinsHTML(activeBatch, st.id)}
      </div>

      <!-- Botão de Despacho com Regra do Lote Fechado -->
      <div class="panel-dispatch-area">
        ${renderPanelDispatchHTML(activeBatch, st.id)}
      </div>
    </div>
  `;

  // Adiciona listeners para as moedas não processadas deste lote
  if (activeBatch) {
    activeBatch.coins.forEach((coin, idx) => {
      if (!coin.processed) {
        const coinEl = panel.querySelector(`.coin-wrapper[data-coin-idx="${idx}"]`);
        if (coinEl) {
          coinEl.addEventListener("click", () => {
            soundCoinClick();
            coinEl.classList.add("processed");
            sendWsMessage({
              action: "PROCESS_COIN",
              batch_id: activeBatch.batch_id,
              coin_idx: idx,
              solo_override: soloOverride
            });
          });
        }
      }
    });

    // Listener do botão de envio
    const btnDispatch = panel.querySelector(".btn-panel-dispatch");
    if (btnDispatch && activeBatch.is_ready_to_send) {
      btnDispatch.addEventListener("click", () => {
        soundDispatch();
        sendWsMessage({
          action: "DISPATCH_BATCH",
          batch_id: activeBatch.batch_id,
          solo_override: soloOverride
        });
      });
    }
  }

  return panel;
}

function renderPanelCoinsHTML(activeBatch, stationId) {
  if (!activeBatch || !activeBatch.coins || activeBatch.coins.length === 0) {
    return `
      <div class="arena-empty-msg">
        <span style="font-size: 28px;">⏳</span>
        <span>Aguardando lote enviado pela estação anterior...</span>
      </div>
    `;
  }

  return activeBatch.coins.map((coin, idx) => `
    <div class="coin-wrapper ${coin.processed ? "processed" : ""}" data-coin-idx="${idx}" title="${coin.processed ? "Processada (✓)" : "Clique para processar esta moeda"}">
      <div class="coin-inner">
        <div class="coin-face coin-front">
          <span class="coin-icon">🪙</span>
          <span class="coin-text">PENDENTE</span>
        </div>
        <div class="coin-face coin-back">
          <span class="coin-icon">✓</span>
          <span class="coin-text">PRONTA</span>
        </div>
      </div>
    </div>
  `).join("");
}

function renderPanelDispatchHTML(activeBatch, stationId) {
  if (!activeBatch) {
    return `
      <div class="panel-rule-badge">
        <span>🔒 Aguardando chegada de lote</span>
      </div>
      <button class="btn-panel-dispatch" disabled>
        <span>Aguardando Lote...</span>
      </button>
    `;
  }

  const isReady = activeBatch.is_ready_to_send;
  const isStation5 = stationId === 5;
  const remaining = activeBatch.size - activeBatch.processed_count;

  if (isReady) {
    return `
      <div class="panel-rule-badge unlocked">
        <span>✓ 100% Processado! Pronto para avanço.</span>
      </div>
      <button class="btn-panel-dispatch">
        <span>${isStation5 ? "🏆 Entregar para CONCLUÍDO (Cliente) ✓" : `🚀 Enviar Lote #${activeBatch.batch_number} para Estação ${stationId + 1} ➔`}</span>
      </button>
    `;
  } else {
    return `
      <div class="panel-rule-badge">
        <span>🔒 Regra do Lote Fechado: Faltam ${remaining} moeda(s)</span>
      </div>
      <button class="btn-panel-dispatch" disabled>
        <span>🔒 Enviar Lote (${activeBatch.processed_count}/${activeBatch.size})</span>
      </button>
    `;
  }
}

// --- Modal de Histórico Comparativo ---
function renderHistoryModal() {
  if (!currentRoomState) return;
  const history = currentRoomState.history || [];

  if (history.length === 0) {
    historyTableBody.innerHTML = "";
    emptyHistoryMsg.style.display = "block";
    pedagogicBox.style.display = "none";
    return;
  }

  emptyHistoryMsg.style.display = "none";
  historyTableBody.innerHTML = history.map(item => {
    const typeLabel = item.round_type === "waterfall" ? "🌊 Cascata" : (item.round_type === "kanban" ? "⚡ Kanban" : "Custom");
    return `
      <tr>
        <td><strong>#${item.round_number}</strong></td>
        <td>${typeLabel}</td>
        <td><strong>${item.batch_size}</strong></td>
        <td>${item.total_coins}</td>
        <td style="color: #fbbf24; font-weight: 700;">${item.first_delivery_time}s</td>
        <td style="font-weight: 700;">${item.total_delivery_time}s</td>
        <td>${item.completed_at || "--"}</td>
      </tr>
    `;
  }).join("");

  const waterfall = history.find(h => h.round_type === "waterfall");
  const kanban = history.find(h => h.round_type === "kanban");

  if (waterfall && kanban) {
    pedagogicBox.style.display = "block";
    const speedup = ((waterfall.first_delivery_time - kanban.first_delivery_time) / waterfall.first_delivery_time * 100).toFixed(1);
    pedagogicText.innerHTML = `
      Na rodada <strong>Kanban (Lote 2)</strong>, a primeira entrega de valor chegou ao cliente 
      <strong>${speedup}% mais rápido</strong> do que na rodada <strong>Cascata (Lote 10)</strong> (${kanban.first_delivery_time}s vs ${waterfall.first_delivery_time}s)!<br><br>
      <strong>Por que isso acontece?</strong><br>
      • <strong>Menos Ociosidade (Starvation):</strong> As etapas seguintes não precisam esperar um lote de 10 moedas para começar a trabalhar.<br>
      • <strong>Menor Trabalho em Progresso (WIP):</strong> O fluxo contínuo balanceia as etapas e evita a formação de estoques parados.<br>
      • <strong>Feedback Rápido:</strong> O cliente recebe as primeiras entregas rapidamente, validando o trabalho antes de investir o tempo de todas as moedas.
    `;
  } else {
    pedagogicBox.style.display = "none";
  }
}

// Inicializa quando o DOM estiver pronto
window.addEventListener("DOMContentLoaded", initApp);
