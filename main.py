import asyncio
import json
import os
import random
import string
import time
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="The Coin Game (Simulador Kanban)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Definições das 5 Estações Oficiais do Jogo
STATION_DEFINITIONS = [
    {"id": 1, "name": "Levantamento e Análise", "icon": "📋", "color": "#0ea5e9"},
    {"id": 2, "name": "Modelagem Relacional", "icon": "🗄️", "color": "#8b5cf6"},
    {"id": 3, "name": "Desenvolvimento da Migração", "icon": "💻", "color": "#f59e0b"},
    {"id": 4, "name": "Aplicação e Testes", "icon": "🧪", "color": "#ec4899"},
    {"id": 5, "name": "Homologação e Produção", "icon": "🚀", "color": "#10b981"},
]

def generate_room_code(length: int = 6) -> str:
    """Gera um código de sala amigável e legível"""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(chars) for _ in range(length))

class BatchCoin:
    def __init__(self, coin_id: int):
        self.coin_id = coin_id
        self.processed = False

    def to_dict(self):
        return {
            "id": self.coin_id,
            "processed": self.processed
        }

class Batch:
    def __init__(self, batch_id: str, batch_number: int, size: int, start_station: int = 1):
        self.batch_id = batch_id
        self.batch_number = batch_number
        self.size = size
        self.current_station = start_station  # 1..5 ou 6 = Concluído
        self.coins: List[BatchCoin] = [BatchCoin(i) for i in range(size)]
        self.created_at = time.time()
        self.station_enter_time = time.time()

    def is_fully_processed(self) -> bool:
        return all(c.processed for c in self.coins)

    def process_coin(self, coin_idx: int) -> bool:
        if 0 <= coin_idx < len(self.coins):
            if not self.coins[coin_idx].processed:
                self.coins[coin_idx].processed = True
                return True
        return False

    def advance_station(self) -> int:
        """Avança para a próxima estação e reseta o status das moedas para a nova estação"""
        self.current_station += 1
        for coin in self.coins:
            coin.processed = False
        self.station_enter_time = time.time()
        return self.current_station

    def to_dict(self):
        processed_count = sum(1 for c in self.coins if c.processed)
        return {
            "batch_id": self.batch_id,
            "batch_number": self.batch_number,
            "size": self.size,
            "current_station": self.current_station,
            "coins": [c.to_dict() for c in self.coins],
            "processed_count": processed_count,
            "is_ready_to_send": self.is_fully_processed(),
            "progress_percent": round((processed_count / self.size) * 100, 1) if self.size > 0 else 100,
        }

class RoomState:
    def __init__(self, room_id: str, creator_id: str):
        self.room_id = room_id
        self.creator_id = creator_id
        self.created_at = time.time()
        
        # Conexões WebSocket ativas: player_id -> WebSocket
        self.connections: Dict[str, WebSocket] = {}
        
        # Jogadores: player_id -> dict
        self.players: Dict[str, dict] = {}
        
        # Estações: station_id -> player_id | None
        self.station_assignments: Dict[int, Optional[str]] = {s["id"]: None for s in STATION_DEFINITIONS}
        
        # Estado da Rodada
        self.round_status = "idle"  # "idle" | "running" | "completed"
        self.round_type = "waterfall"  # "waterfall" | "kanban" | "custom"
        self.round_number = 0
        self.batch_size = 10
        self.total_coins = 20
        self.start_time: Optional[float] = None
        self.first_delivery_time: Optional[float] = None
        self.total_delivery_time: Optional[float] = None
        
        # Lotes
        self.batches: List[Batch] = []
        
        # Histórico de rodadas comparativo
        self.history: List[dict] = []

    def add_player(self, player_id: str, player_name: str, ws: WebSocket) -> bool:
        self.connections[player_id] = ws
        is_creator = (player_id == self.creator_id) or (len(self.players) == 0)
        if is_creator:
            self.creator_id = player_id

        self.players[player_id] = {
            "id": player_id,
            "name": player_name,
            "is_facilitator": is_creator,
            "station": None,
            "online": True
        }
        # Se algum assignment já estava com esse player, mantém
        for st_id, pid in self.station_assignments.items():
            if pid == player_id:
                self.players[player_id]["station"] = st_id
                break
        return True

    def remove_player_connection(self, player_id: str):
        if player_id in self.connections:
            del self.connections[player_id]
        if player_id in self.players:
            self.players[player_id]["online"] = False

    def claim_station(self, player_id: str, station_id: Optional[int]) -> bool:
        if player_id not in self.players:
            return False
        
        # Se station_id for None, liberar a estação atual
        if station_id is None:
            old_st = self.players[player_id]["station"]
            if old_st and self.station_assignments.get(old_st) == player_id:
                self.station_assignments[old_st] = None
            self.players[player_id]["station"] = None
            return True

        # Se já estiver ocupada por outro jogador online
        current_occupant = self.station_assignments.get(station_id)
        if current_occupant and current_occupant != player_id:
            # Verifica se o outro jogador ainda está online
            if current_occupant in self.players and self.players[current_occupant].get("online", False):
                return False  # Estação ocupada

        # Remove da estação anterior se tinha
        old_st = self.players[player_id]["station"]
        if old_st and self.station_assignments.get(old_st) == player_id:
            self.station_assignments[old_st] = None

        # Atribui nova estação
        self.station_assignments[station_id] = player_id
        self.players[player_id]["station"] = station_id
        return True

    def start_round(self, round_type: str, batch_size: int = 10, total_coins: int = 20) -> bool:
        if round_type == "waterfall":
            self.batch_size = 10
            self.total_coins = max(10, total_coins)
        elif round_type == "kanban":
            self.batch_size = 2
            self.total_coins = max(2, total_coins)
        else:
            self.batch_size = max(1, batch_size)
            self.total_coins = max(self.batch_size, total_coins)

        self.round_type = round_type
        self.round_number += 1
        self.round_status = "running"
        self.start_time = time.time()
        self.first_delivery_time = None
        self.total_delivery_time = None

        # Gerar lotes
        self.batches = []
        num_full_batches = self.total_coins // self.batch_size
        remainder = self.total_coins % self.batch_size

        batch_counter = 1
        for _ in range(num_full_batches):
            b_id = f"b-{self.round_number}-{batch_counter}"
            self.batches.append(Batch(b_id, batch_counter, self.batch_size, start_station=1))
            batch_counter += 1

        if remainder > 0:
            b_id = f"b-{self.round_number}-{batch_counter}"
            self.batches.append(Batch(b_id, batch_counter, remainder, start_station=1))

        return True

    def reset_round(self):
        self.round_status = "idle"
        self.batches = []
        self.start_time = None
        self.first_delivery_time = None
        self.total_delivery_time = None

    def get_station_batches(self, station_id: int) -> List[Batch]:
        """Retorna todos os lotes atualmente em uma estação (em ordem de chegada/número)"""
        return [b for b in self.batches if b.current_station == station_id]

    def process_coin(self, player_id: str, batch_id: str, coin_idx: int, is_solo_override: bool = False) -> bool:
        if self.round_status != "running":
            return False

        player = self.players.get(player_id)
        if not player:
            return False

        # Localiza o lote
        target_batch = next((b for b in self.batches if b.batch_id == batch_id), None)
        if not target_batch:
            return False

        station_id = target_batch.current_station
        if station_id > 5:
            return False

        # Validação de permissão: jogador deve ser o dono da estação ou facilitador em modo teste
        player_station = player.get("station")
        is_facilitator = player.get("is_facilitator", False)
        if not is_solo_override and player_station != station_id and not is_facilitator:
            return False

        # Verifica se este lote é o lote ativo (o primeiro lote da fila desta estação)
        station_batches = self.get_station_batches(station_id)
        if not station_batches or station_batches[0].batch_id != batch_id:
            return False  # Só pode processar o primeiro lote da fila

        return target_batch.process_coin(coin_idx)

    def dispatch_batch(self, player_id: str, batch_id: str, is_solo_override: bool = False) -> dict:
        if self.round_status != "running":
            return {"success": False, "error": "Rodada não está em andamento"}

        player = self.players.get(player_id)
        if not player:
            return {"success": False, "error": "Jogador não encontrado"}

        target_batch = next((b for b in self.batches if b.batch_id == batch_id), None)
        if not target_batch:
            return {"success": False, "error": "Lote não encontrado"}

        station_id = target_batch.current_station
        if station_id > 5:
            return {"success": False, "error": "Lote já concluído"}

        # Validação de permissão
        player_station = player.get("station")
        is_facilitator = player.get("is_facilitator", False)
        if not is_solo_override and player_station != station_id and not is_facilitator:
            return {"success": False, "error": "Você não está alocado nesta estação"}

        # REGRA CRÍTICA DO LOTE FECHADO: 100% das moedas devem ter sido processadas
        if not target_batch.is_fully_processed():
            return {
                "success": False,
                "error": "Regra do Lote Fechado: Todas as moedas do lote precisam ser processadas antes do envio!"
            }

        # Avança o lote
        new_station = target_batch.advance_station()
        now = time.time()
        elapsed = now - (self.start_time or now)

        first_delivery_event = False
        round_completed_event = False

        # Se saiu da estação 5, foi para a estação 6 (Concluído)
        if new_station == 6:
            if self.first_delivery_time is None:
                self.first_delivery_time = round(elapsed, 2)
                first_delivery_event = True

            # Verifica se todos os lotes foram entregues
            all_done = all(b.current_station == 6 for b in self.batches)
            if all_done:
                self.total_delivery_time = round(elapsed, 2)
                self.round_status = "completed"
                round_completed_event = True
                
                # Salva no histórico comparativo
                self.history.append({
                    "round_number": self.round_number,
                    "round_type": self.round_type,
                    "batch_size": self.batch_size,
                    "total_coins": self.total_coins,
                    "first_delivery_time": self.first_delivery_time,
                    "total_delivery_time": self.total_delivery_time,
                    "completed_at": time.strftime("%H:%M:%S")
                })

        return {
            "success": True,
            "new_station": new_station,
            "first_delivery_event": first_delivery_event,
            "round_completed_event": round_completed_event,
            "first_delivery_time": self.first_delivery_time,
            "total_delivery_time": self.total_delivery_time
        }

    def get_wip_by_station(self) -> Dict[str, int]:
        """Calcula o WIP (número de moedas paradas/em processo) por estação"""
        wip = {str(i): 0 for i in range(1, 6)}
        wip["done"] = 0
        for b in self.batches:
            if 1 <= b.current_station <= 5:
                wip[str(b.current_station)] += b.size
            elif b.current_station >= 6:
                wip["done"] += b.size
        return wip

    def to_dict(self) -> dict:
        # Prepara a lista de estações enriquecida com ocupante
        stations_info = []
        for st in STATION_DEFINITIONS:
            occupant_id = self.station_assignments.get(st["id"])
            occupant = self.players.get(occupant_id) if occupant_id else None
            batches_at_station = [b.to_dict() for b in self.get_station_batches(st["id"])]
            stations_info.append({
                "id": st["id"],
                "name": st["name"],
                "icon": st["icon"],
                "color": st["color"],
                "assigned_player_id": occupant_id,
                "assigned_player_name": occupant["name"] if occupant else None,
                "is_online": occupant.get("online", False) if occupant else False,
                "batches": batches_at_station,
                "wip_coins": sum(b["size"] for b in batches_at_station),
            })

        completed_batches = [b.to_dict() for b in self.batches if b.current_station >= 6]

        elapsed_now = 0.0
        if self.start_time and self.round_status == "running":
            elapsed_now = round(time.time() - self.start_time, 2)
        elif self.total_delivery_time:
            elapsed_now = self.total_delivery_time

        return {
            "room_id": self.room_id,
            "creator_id": self.creator_id,
            "players": list(self.players.values()),
            "stations": stations_info,
            "round": {
                "round_number": self.round_number,
                "round_type": self.round_type,
                "batch_size": self.batch_size,
                "total_coins": self.total_coins,
                "status": self.round_status,
                "start_time": self.start_time,
                "elapsed_time": elapsed_now,
                "first_delivery_time": self.first_delivery_time,
                "total_delivery_time": self.total_delivery_time,
                "total_batches": len(self.batches),
                "completed_batches_count": len(completed_batches),
                "completed_coins_count": sum(b["size"] for b in completed_batches),
            },
            "completed_batches": completed_batches,
            "wip": self.get_wip_by_station(),
            "history": self.history,
        }

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, RoomState] = {}

    def get_or_create_room(self, room_id: Optional[str] = None, creator_id: str = "") -> RoomState:
        if not room_id:
            room_id = generate_room_code()
        room_id = room_id.upper().strip()
        if room_id not in self.rooms:
            self.rooms[room_id] = RoomState(room_id, creator_id)
        return self.rooms[room_id]

    def get_room(self, room_id: str) -> Optional[RoomState]:
        return self.rooms.get(room_id.upper().strip())

room_manager = RoomManager()

# --- Rotas HTTP REST ---

class CreateRoomRequest(BaseModel):
    playerName: str = "Facilitador"

@app.post("/api/rooms")
async def create_room(req: CreateRoomRequest):
    room_code = generate_room_code()
    room = room_manager.get_or_create_room(room_code)
    return {"room_id": room.room_id}

@app.get("/api/rooms/{room_id}")
async def check_room(room_id: str):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return {"room_id": room.room_id, "players_count": len(room.players)}

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "rooms_active": len(room_manager.rooms)}


# --- WebSocket Handler ---

async def broadcast_room(room: RoomState, event_type: str = "ROOM_STATE", extra_data: dict = None):
    state_payload = {
        "type": event_type,
        "state": room.to_dict(),
    }
    if extra_data:
        state_payload.update(extra_data)

    payload_json = json.dumps(state_payload)
    disconnected = []
    for pid, ws in list(room.connections.items()):
        try:
            await ws.send_text(payload_json)
        except Exception:
            disconnected.append(pid)

    for pid in disconnected:
        room.remove_player_connection(pid)

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    room = room_manager.get_or_create_room(room_id)
    current_player_id: Optional[str] = None

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            action = data.get("action") or data.get("type")
            player_id = data.get("player_id") or data.get("playerId")
            
            if not current_player_id and player_id:
                current_player_id = player_id

            if action == "JOIN_ROOM":
                player_name = data.get("player_name") or data.get("playerName", "Jogador")
                current_player_id = player_id or f"p-{random.randint(1000, 9999)}"
                room.add_player(current_player_id, player_name, websocket)
                await broadcast_room(room, "ROOM_STATE", {
                    "notification": f"{player_name} entrou na sala!"
                })

            elif action == "CLAIM_STATION":
                station_id = data.get("station_id")
                if station_id is not None:
                    station_id = int(station_id)
                success = room.claim_station(current_player_id, station_id)
                st_name = STATION_DEFINITIONS[station_id - 1]["name"] if station_id else "Observador"
                p_name = room.players.get(current_player_id, {}).get("name", "Jogador")
                await broadcast_room(room, "ROOM_STATE", {
                    "notification": f"{p_name} assumiu a estação: {st_name}" if success else "Estação ocupada!"
                })

            elif action == "START_ROUND":
                round_type = data.get("round_type", "waterfall")
                batch_size = int(data.get("batch_size", 10))
                total_coins = int(data.get("total_coins", 20))
                room.start_round(round_type, batch_size, total_coins)
                label = "Rodada 1 (Cascata - Lote 10)" if round_type == "waterfall" else (
                    "Rodada 2 (Kanban - Lote 2)" if round_type == "kanban" else f"Rodada Custom (Lote {batch_size})"
                )
                await broadcast_room(room, "ROUND_STARTED", {
                    "notification": f"🚀 {label} iniciada! Bom trabalho!"
                })

            elif action == "RESET_ROUND":
                room.reset_round()
                await broadcast_room(room, "ROOM_STATE", {
                    "notification": "Rodada reiniciada pelo facilitador."
                })

            elif action == "PROCESS_COIN":
                batch_id = data.get("batch_id")
                coin_idx = int(data.get("coin_idx", 0))
                is_solo = bool(data.get("solo_override", False))
                success = room.process_coin(current_player_id, batch_id, coin_idx, is_solo)
                if success:
                    await broadcast_room(room, "COIN_PROCESSED", {
                        "batch_id": batch_id,
                        "coin_idx": coin_idx,
                    })

            elif action == "DISPATCH_BATCH":
                batch_id = data.get("batch_id")
                is_solo = bool(data.get("solo_override", False))
                res = room.dispatch_batch(current_player_id, batch_id, is_solo)
                if res["success"]:
                    notif = None
                    if res["first_delivery_event"]:
                        notif = f"⭐ 1ª ENTREGA CONCLUÍDA em {res['first_delivery_time']} segundos!"
                    elif res["round_completed_event"]:
                        notif = f"🏆 TODAS AS TAREFAS CONCLUÍDAS! Tempo Total: {res['total_delivery_time']} segundos!"

                    await broadcast_room(room, "BATCH_DISPATCHED", {
                        "batch_id": batch_id,
                        "new_station": res["new_station"],
                        "notification": notif,
                        "first_delivery_event": res["first_delivery_event"],
                        "round_completed_event": res["round_completed_event"]
                    })
                else:
                    await websocket.send_text(json.dumps({
                        "type": "ERROR_MSG",
                        "message": res.get("error", "Erro ao despachar lote.")
                    }))

    except WebSocketDisconnect:
        if current_player_id:
            room.remove_player_connection(current_player_id)
            await broadcast_room(room, "ROOM_STATE", {
                "notification": "Um jogador se desconectou."
            })
    except Exception as e:
        if current_player_id:
            room.remove_player_connection(current_player_id)


# Servir Frontend Estático
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Interface em carregamento..."}
