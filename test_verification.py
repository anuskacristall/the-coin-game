import json
from fastapi.testclient import TestClient
from main import app, room_manager

def test_rest_api():
    client = TestClient(app)
    # Test index
    res = client.get("/")
    assert res.status_code == 200
    assert "The Coin Game" in res.text
    print("[PASS] GET / returned 200 with HTML")

    # Test health
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    print("[PASS] GET /api/health returned ok")

    # Test create room
    res = client.post("/api/rooms", json={"playerName": "Facilitador Teste"})
    assert res.status_code == 200
    room_id = res.json()["room_id"]
    assert len(room_id) >= 4
    print(f"[PASS] POST /api/rooms created room: {room_id}")

    # Test check room
    res = client.get(f"/api/rooms/{room_id}")
    assert res.status_code == 200
    assert res.json()["room_phase"] == "lobby"
    print(f"[PASS] GET /api/rooms/{room_id} verified (phase: lobby)")

def test_dynamic_allocation():
    # Teste de 3 convidados + 1 Facilitador (Modo Híbrido = 4 participantes)
    room = room_manager.get_or_create_room("ROOM3P", creator_id="fac-1")
    room.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    room.players["guest-1"] = {"id": "guest-1", "name": "Alice", "is_facilitator": False, "stations": [], "online": True}
    room.players["guest-2"] = {"id": "guest-2", "name": "Bob", "is_facilitator": False, "stations": [], "online": True}
    room.players["guest-3"] = {"id": "guest-3", "name": "Carol", "is_facilitator": False, "stations": [], "online": True}

    assert room.room_phase == "lobby"
    # Com Facilitador jogando junto: 4 pessoas -> fac [1, 2], g1 [3], g2 [4], g3 [5]
    allocation = room.allocate_stations_dynamically(include_facilitator=True)
    assert allocation["fac-1"] == [1, 2]
    assert allocation["guest-1"] == [3]
    assert allocation["guest-2"] == [4]
    assert allocation["guest-3"] == [5]
    print("[PASS] Dynamic allocation with Facilitator participating (4 people total): Fac=[1, 2], G1=[3], G2=[4], G3=[5]")

    # Com Facilitador apenas observando: 3 pessoas -> g1 [1, 2], g2 [3], g3 [4, 5]
    alloc_guests_only = room.allocate_stations_dynamically(include_facilitator=False)
    assert alloc_guests_only["guest-1"] == [1, 2]
    assert alloc_guests_only["guest-2"] == [3]
    assert alloc_guests_only["guest-3"] == [4, 5]
    print("[PASS] Dynamic allocation with Facilitator observing only: G1=[1, 2], G2=[3], G3=[4, 5]")

    # Teste de 5 convidados (1:1 direto para os convidados)
    room5 = room_manager.get_or_create_room("ROOM5P", creator_id="fac-1")
    room5.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    for i in range(1, 6):
        pid = f"g-{i}"
        room5.players[pid] = {"id": pid, "name": f"Player {i}", "is_facilitator": False, "stations": [], "online": True}
    
    alloc5 = room5.allocate_stations_dynamically()
    for i in range(1, 6):
        assert alloc5[f"g-{i}"] == [i]
    print("[PASS] Dynamic allocation for 5 guests: 1:1 [1], [2], [3], [4], [5]")

    # Teste de Facilitador sozinho em teste solo
    room1 = room_manager.get_or_create_room("ROOM1P", creator_id="fac-1")
    room1.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    alloc1 = room1.allocate_stations_dynamically()
    assert alloc1["fac-1"] == [1, 2, 3, 4, 5]
    print("[PASS] Dynamic allocation for Facilitator solo: [1, 2, 3, 4, 5]")

def test_facilitator_playing_gameplay():
    room = room_manager.get_or_create_room("FACPLAY", creator_id="fac-1")
    room.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    room.players["dev-1"] = {"id": "dev-1", "name": "Dev Alice", "is_facilitator": False, "stations": [], "online": True}

    # Atribuição personalizada com Facilitador jogando: Fac opera Estação 1, Dev opera 2, 3, 4, 5
    room.players["fac-1"]["stations"] = [1]
    room.station_assignments[1] = "fac-1"
    room.players["dev-1"]["stations"] = [2, 3, 4, 5]
    for s in [2, 3, 4, 5]:
        room.station_assignments[s] = "dev-1"

    room.room_phase = "in_game"
    room.start_round(round_type="kanban", batch_size=2, total_coins=4)
    assert room.round_status == "running"

    batch1 = room.batches[0]
    assert batch1.current_station == 1

    # Facilitador processa moedas na Estação 1
    assert room.process_coin("fac-1", batch1.batch_id, 0)
    assert room.process_coin("fac-1", batch1.batch_id, 1)

    # Facilitador despacha o lote da Estação 1 para a Estação 2
    res = room.dispatch_batch("fac-1", batch1.batch_id)
    assert res["success"]
    assert res["new_station"] == 2
    print("[PASS] Facilitator successfully processed coins and dispatched Batch 1 from Station 1 to Station 2!")

    # Dev Alice processa na Estação 2
    assert room.process_coin("dev-1", batch1.batch_id, 0)
    assert room.process_coin("dev-1", batch1.batch_id, 1)
    res2 = room.dispatch_batch("dev-1", batch1.batch_id)
    assert res2["success"]
    assert res2["new_station"] == 3
    print("[PASS] Dev Alice received batch from Facilitator and dispatched to Station 3!")

    print("\nALL EXPANDED VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_rest_api()
    test_dynamic_allocation()
    test_facilitator_playing_gameplay()
