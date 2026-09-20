/**
 * The Coin Game — Simulador Kanban & Batch Size
 * Frontend Client (WebSockets, UI & Web Audio API)
 */

// --- Estado Global do Cliente ---
let socket = null;
let currentRoomId = null;
let myPlayerId = localStorage.getItem("coin_game_player_id") || "p-" + Math.random().toString(36).substring(2, 8);
let myPlayerName = localStorage.getItem("coin_game_player_name") || "";
let myStationId = null;
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
const userAvatar = document.getElementById("userAvatar");
const toastBanner = document.getElementById("toastBanner");
const btnSoundToggle = document.getElementById("btnSoundToggle");

// Métricas
const metricTimer = document.getElementById("metricTimer");
const metricFirstDelivery = document.getElementById("metricFirstDelivery");
const metricBatchSize = document.getElementById("metricBatchSize");
const metricCompletedCoins = document.getElementById("metricCompletedCoins");

// Facilitador
const facilitatorBar = document.getElementById("facilitatorBar");
const roundStatusText = document.getElementById("roundStatusText");
const btnStartWaterfall = document.getElementById("btnStartWaterfall");
const btnStartKanban = document.getElementById("btnStartKanban");
const btnCustomRound = document.getElementById("btnCustomRound");
const btnResetRound = document.getElementById("btnResetRound");
const checkSoloOverride = document.getElementById("checkSoloOverride");

// Pipeline
const pipelineBoard = document.getElementById("pipelineBoard");

// Estação Ativa
const noStationCard = document.getElementById("noStationCard");
const activeStationCard = document.getElementById("activeStationCard");
const stationPickerGrid = document.getElementById("stationPickerGrid");
const myStationIcon = document.getElementById("myStationIcon");
const myStationTitle = document.getElementById("myStationTitle");
const myStationDesc = document.getElementById("myStationDesc");
const btnLeaveStation = document.getElementById("btnLeaveStation");
const myQueueCount = document.getElementById("myQueueCount");
const myActiveBatchNumber = document.getElementById("myActiveBatchNumber");
const myBatchProgressText = document.getElementById("myBatchProgressText");
const myBatchProgressBar = document.getElementById("myBatchProgressBar");
const coinsArena = document.getElementById("coinsArena");
const batchRuleBanner = document.getElementById("batchRuleBanner");
const batchRuleText = document.getElementById("batchRuleText");
const btnDispatchBatch = document.getElementById("btnDispatchBatch");
const btnDispatchText = document.getElementById("btnDispatchText");

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

// --- Síntese de Efeitos Sonoros com Web Audio API (Zero Dependências) ---
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
  playTone(720, "triangle", 0.08, 0.2);
}

function soundBatchReady() {
  if (!soundEnabled) return;
  setTimeout(() => playTone(523.25, "sine", 0.12, 0.2), 0);
  setTimeout(() => playTone(659.25, "sine", 0.18, 0.2), 100);
  setTimeout(() => playTone(783.99, "sine", 0.25, 0.25), 200);
}

function soundDispatch() {
  if (!soundEnabled) return;
  playTone(440, "sine", 0.15, 0.2);
  setTimeout(() => playTone(880, "sine", 0.2, 0.2), 80);
}

function soundFirstDelivery() {
  if (!soundEnabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, idx) => {
    setTimeout(() => playTone(freq, "triangle", 0.3, 0.25), idx * 120);
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

// --- Inicialização e Parâmetros de URL ---
function initApp() {
  if (myPlayerName) {
    inputPlayerName.value = myPlayerName;
    displayPlayerName.textContent = myPlayerName;
  }

  // Verifica se há room na URL (?room=XYZ)
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
  btnCreateRoom.addEventListener("click", () => {
    const name = inputPlayerName.value.trim() || "Facilitador";
    savePlayerName(name);
    createAndJoinRoom(name);
  });

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
      showToast("🛠️ Modo Solo/Teste ativado! Você pode operar qualquer estação.", 4000);
    }
    renderStationWorkspace();
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
    if (confirm("Deseja realmente reiniciar a rodada atual?")) {
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

  // Trocar de Estação
  btnLeaveStation.addEventListener("click", () => {
    sendWsMessage({
      action: "CLAIM_STATION",
      station_id: null
    });
    myStationId = null;
  });

  // Botão Despachar Lote
  btnDispatchBatch.addEventListener("click", () => {
    const activeBatch = getMyActiveBatch();
    if (!activeBatch) return;

    if (!activeBatch.is_ready_to_send) {
      alert("Atenção: A Regra do Lote Fechado exige que todas as moedas do lote sejam processadas antes do envio!");
      return;
    }

    soundDispatch();
    sendWsMessage({
      action: "DISPATCH_BATCH",
      batch_id: activeBatch.batch_id,
      solo_override: soloOverride
    });
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
    // Fallback: gera localmente e conecta
    const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    joinRoom(fallbackCode, playerName);
  }
}

function joinRoom(roomId, playerName) {
  currentRoomId = roomId.toUpperCase();
  currentRoomCode.textContent = currentRoomId;

  // Atualiza query param na barra de endereço sem recarregar
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

    // Troca para tela do jogo
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
    // Tenta reconectar em 3 segundos
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
    console.warn("WebSocket não está pronto para enviar mensagem.");
    return;
  }
  payload.playerId = myPlayerId;
  socket.send(JSON.stringify(payload));
}

// --- Manipulação das Mensagens Recebidas do Servidor ---
function handleServerMessage(msg) {
  if (msg.notification) {
    showToast(msg.notification, 4000);
  }

  if (msg.first_delivery_event) {
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
    // Atualização pontual ou re-render
    soundCoinClick();
    if (currentRoomState) {
      // Localmente marca a moeda
      const targetBatch = currentRoomState.stations
        .flatMap(s => s.batches)
        .find(b => b.batch_id === msg.batch_id);
      if (targetBatch && targetBatch.coins[msg.coin_idx]) {
        targetBatch.coins[msg.coin_idx].processed = true;
        targetBatch.processed_count = targetBatch.coins.filter(c => c.processed).length;
        targetBatch.is_ready_to_send = targetBatch.processed_count === targetBatch.size;
        targetBatch.progress_percent = Math.round((targetBatch.processed_count / targetBatch.size) * 100);
        renderStationWorkspace();
      }
    }
  }
}

// --- Renderização do Estado Geral do Jogo ---
function renderGameState(state) {
  if (!state) return;

  // Atualiza minha estação
  const myPlayerObj = state.players.find(p => p.id === myPlayerId);
  if (myPlayerObj) {
    myStationId = myPlayerObj.station;
  }

  // Métricas do Topo
  renderTopMetrics(state.round);

  // Status da Rodada no Painel do Facilitador
  renderFacilitatorBar(state);

  // Pipeline Kanban Geral
  renderPipelineBoard(state);

  // Área de Trabalho do Jogador
  renderStationWorkspace();
}

function renderTopMetrics(round) {
  if (!round) return;

  // Tamanho do lote
  metricBatchSize.textContent = round.batch_size ? `${round.batch_size} moedas` : "--";

  // 1ª Entrega
  if (round.first_delivery_time !== null && round.first_delivery_time !== undefined) {
    metricFirstDelivery.textContent = `${round.first_delivery_time.toFixed(1)}s ⭐`;
  } else {
    metricFirstDelivery.textContent = round.status === "running" ? "Em trânsito..." : "--";
  }

  // Concluídas
  metricCompletedCoins.textContent = `${round.completed_coins_count} / ${round.total_coins || 0}`;

  // Controle do Cronômetro Local
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

function renderFacilitatorBar(state) {
  const round = state.round;
  const isRunning = round.status === "running";
  const isCompleted = round.status === "completed";

  if (isRunning) {
    roundStatusText.textContent = `Em Andamento: Rodada ${round.round_number} (${round.round_type.toUpperCase()} - Lote ${round.batch_size})`;
    roundStatusText.className = "round-status-tag running";
  } else if (isCompleted) {
    roundStatusText.textContent = `Rodada ${round.round_number} Concluída! (${round.total_delivery_time}s)`;
    roundStatusText.className = "round-status-tag";
  } else {
    roundStatusText.textContent = "Aguardando Início da Rodada";
    roundStatusText.className = "round-status-tag";
  }

  btnStartWaterfall.disabled = isRunning;
  btnStartKanban.disabled = isRunning;
  btnCustomRound.disabled = isRunning;
}

// --- Renderização do Pipeline Kanban ---
function renderPipelineBoard(state) {
  if (!pipelineBoard) return;
  pipelineBoard.innerHTML = "";

  // Colunas 1 a 5 (Estações)
  state.stations.forEach((st) => {
    const isMySt = myStationId === st.id;
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
        <span>${st.assigned_player_name || "Vaga aberta"}</span>
      </div>

      <div class="col-batches-container">
        ${renderStationBatchChips(st.batches)}
      </div>
    `;

    pipelineBoard.appendChild(col);
  });

  // Coluna 6: Concluído (Done)
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

// --- Renderização da Área de Trabalho do Jogador ---
function getMyActiveBatch() {
  if (!currentRoomState) return null;
  const effectiveStation = soloOverride ? (myStationId || 1) : myStationId;
  if (!effectiveStation) return null;

  const st = currentRoomState.stations.find(s => s.id === effectiveStation);
  if (!st || !st.batches || st.batches.length === 0) return null;
  return st.batches[0]; // Primeiro lote da fila desta estação
}

function renderStationWorkspace() {
  if (!currentRoomState) return;

  // Se não estiver em nenhuma estação e solo mode estiver desligado
  if (!myStationId && !soloOverride) {
    noStationCard.style.display = "block";
    activeStationCard.style.display = "none";
    renderStationPicker();
    return;
  }

  // Jogador está em uma estação (ou operando em modo solo)
  noStationCard.style.display = "none";
  activeStationCard.style.display = "block";

  const effectiveStationId = myStationId || (soloOverride ? 1 : 1);
  const stationObj = currentRoomState.stations.find(s => s.id === effectiveStationId);

  if (!stationObj) return;

  myStationIcon.textContent = stationObj.icon;
  myStationTitle.textContent = `Estação ${stationObj.id}: ${stationObj.name}`;
  myStationDesc.textContent = soloOverride 
    ? `[Modo Solo Ativo] Você pode clicar e enviar tarefas para qualquer estação.`
    : `Você é o responsável por esta etapa. Processe as moedas e envie os lotes para o próximo colega.`;

  const batches = stationObj.batches || [];
  const activeBatch = batches.length > 0 ? batches[0] : null;

  myQueueCount.textContent = Math.max(0, batches.length - 1);
  myActiveBatchNumber.textContent = activeBatch ? `Lote #${activeBatch.batch_number} (${activeBatch.size} moedas)` : "Nenhum";

  if (activeBatch) {
    myBatchProgressText.textContent = `${activeBatch.processed_count} / ${activeBatch.size} (${activeBatch.progress_percent}%)`;
    myBatchProgressBar.style.width = `${activeBatch.progress_percent}%`;
    renderCoinsArena(activeBatch);
    renderDispatchButton(activeBatch, stationObj.id);
  } else {
    myBatchProgressText.textContent = "0 / 0 (0%)";
    myBatchProgressBar.style.width = "0%";
    coinsArena.innerHTML = `
      <div class="arena-empty-state">
        <div class="empty-icon">⏳</div>
        <h4>Nenhum lote nesta estação no momento</h4>
        <p>Aguardando lote enviado pela estação anterior...</p>
      </div>
    `;
    btnDispatchBatch.disabled = true;
    btnDispatchText.textContent = "Aguardando Lote...";
    batchRuleBanner.className = "batch-rule-banner";
    batchRuleText.textContent = "Regra do Lote Fechado: Aguardando novo lote para processamento.";
  }
}

function renderStationPicker() {
  if (!stationPickerGrid || !currentRoomState) return;
  stationPickerGrid.innerHTML = "";

  currentRoomState.stations.forEach(st => {
    const isOccupied = !!st.assigned_player_id && st.is_online;
    const isMe = st.assigned_player_id === myPlayerId;

    const btn = document.createElement("div");
    btn.className = `station-pick-btn ${isOccupied && !isMe ? "occupied" : ""}`;
    btn.style.borderTop = `4px solid ${st.color}`;

    let statusText = `<span class="pick-status free">✨ Disponível</span>`;
    if (isMe) {
      statusText = `<span class="pick-status" style="color: var(--accent-blue);">Sua Estação Atual</span>`;
    } else if (isOccupied) {
      statusText = `<span class="pick-status occupied-name">👤 ${st.assigned_player_name}</span>`;
    }

    btn.innerHTML = `
      <span class="pick-icon">${st.icon}</span>
      <span class="pick-name">Estação ${st.id}</span>
      <span style="font-size: 11px; color: var(--text-muted);">${st.name}</span>
      ${statusText}
    `;

    if (!isOccupied || isMe || soloOverride) {
      btn.addEventListener("click", () => {
        sendWsMessage({
          action: "CLAIM_STATION",
          station_id: st.id
        });
        myStationId = st.id;
      });
    }

    stationPickerGrid.appendChild(btn);
  });
}

// --- Renderização da Arena de Moedas 3D ---
function renderCoinsArena(batch) {
  if (!coinsArena) return;
  coinsArena.innerHTML = "";

  batch.coins.forEach((coin, idx) => {
    const coinEl = document.createElement("div");
    coinEl.className = `coin-wrapper ${coin.processed ? "processed" : ""}`;
    coinEl.title = coin.processed ? "Moeda Processada (✓)" : "Clique para processar esta moeda";

    coinEl.innerHTML = `
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
    `;

    if (!coin.processed) {
      coinEl.addEventListener("click", () => {
        soundCoinClick();
        // Feedback visual instantâneo
        coinEl.classList.add("processed");
        sendWsMessage({
          action: "PROCESS_COIN",
          batch_id: batch.batch_id,
          coin_idx: idx,
          solo_override: soloOverride
        });
      });
    }

    coinsArena.appendChild(coinEl);
  });
}

// --- Botão de Envio e Regra do Lote Fechado (CRÍTICO) ---
function renderDispatchButton(batch, stationId) {
  const isReady = batch.is_ready_to_send;
  const isStation5 = stationId === 5;

  if (isReady) {
    btnDispatchBatch.disabled = false;
    batchRuleBanner.className = "batch-rule-banner unlocked";
    batchRuleText.innerHTML = `<strong>100% Processado!</strong> Lote pronto para envio para a próxima etapa.`;

    if (isStation5) {
      btnDispatchText.textContent = "🏆 Entregar Lote para CONCLUÍDO (Cliente) ✓";
    } else {
      btnDispatchText.textContent = `🚀 Enviar Lote #${batch.batch_number} para Estação ${stationId + 1} ➔`;
    }
  } else {
    btnDispatchBatch.disabled = true;
    batchRuleBanner.className = "batch-rule-banner";
    const remaining = batch.size - batch.processed_count;
    batchRuleText.innerHTML = `<strong>Regra do Lote Fechado:</strong> Faltam <strong>${remaining}</strong> moeda(s) para liberar o botão de envio.`;
    btnDispatchText.textContent = `🔒 Enviar Lote (${batch.processed_count}/${batch.size} moedas processadas)`;
  }
}

// --- Modal de Histórico e Comparativo ---
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

  // Se houver pelo menos duas rodadas (ex: Cascata e Kanban), mostra análise comparativa
  const waterfall = history.find(h => h.round_type === "waterfall");
  const kanban = history.find(h => h.round_type === "kanban");

  if (waterfall && kanban) {
    pedagogicBox.style.display = "block";
    const speedup = ((waterfall.first_delivery_time - kanban.first_delivery_time) / waterfall.first_delivery_time * 100).toFixed(1);
    pedagogicText.innerHTML = `
      Na rodada <strong>Kanban (Lote 2)</strong>, a primeira entrega de valor chegou ao cliente 
      <strong>${speedup}% mais rápido</strong> do que na rodada <strong>Cascata (Lote 10)</strong> (${kanban.first_delivery_time}s vs ${waterfall.first_delivery_time}s)!<br><br>
      <strong>Por que isso acontece?</strong><br>
      • <strong>Menos Ociosidade (Starvation):</strong> As estações subsequentes não precisam esperar um lote gigante ser finalizado para começarem a trabalhar.<br>
      • <strong>Menos Trabalho em Progresso (WIP):</strong> O fluxo contínuo reduz o acúmulo de estoques intermediários e gargalos.<br>
      • <strong>Feedback Rápido:</strong> Se houver um defeito ou ajuste, o cliente e a equipe descobrem imediatamente no primeiro lote, em vez de após 20 moedas prontas!
    `;
  } else {
    pedagogicBox.style.display = "none";
  }
}

// Inicia quando o DOM carregar
window.addEventListener("DOMContentLoaded", initApp);
