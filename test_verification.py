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
    # Teste de 3 jogadores
    room = room_manager.get_or_create_room("ROOM3P", creator_id="fac-1")
    room.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    room.players["guest-1"] = {"id": "guest-1", "name": "Alice", "is_facilitator": False, "stations": [], "online": True}
    room.players["guest-2"] = {"id": "guest-2", "name": "Bob", "is_facilitator": False, "stations": [], "online": True}
    room.players["guest-3"] = {"id": "guest-3", "name": "Carol", "is_facilitator": False, "stations": [], "online": True}

    assert room.room_phase == "lobby"
    allocation = room.allocate_stations_dynamically()
    assert allocation["guest-1"] == [1, 2]
    assert allocation["guest-2"] == [3]
    assert allocation["guest-3"] == [4, 5]
    print("[PASS] Dynamic allocation for 3 players: [1, 2], [3], [4, 5]")

    # Teste de 5 jogadores
    room5 = room_manager.get_or_create_room("ROOM5P", creator_id="fac-1")
    room5.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    for i in range(1, 6):
        pid = f"g-{i}"
        room5.players[pid] = {"id": pid, "name": f"Player {i}", "is_facilitator": False, "stations": [], "online": True}
    
    alloc5 = room5.allocate_stations_dynamically()
    for i in range(1, 6):
        assert alloc5[f"g-{i}"] == [i]
    print("[PASS] Dynamic allocation for 5 players: 1:1 [1], [2], [3], [4], [5]")

    # Teste de 1 jogador
    room1 = room_manager.get_or_create_room("ROOM1P", creator_id="fac-1")
    room1.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    room1.players["solo-1"] = {"id": "solo-1", "name": "Solo", "is_facilitator": False, "stations": [], "online": True}
    alloc1 = room1.allocate_stations_dynamically()
    assert alloc1["solo-1"] == [1, 2, 3, 4, 5]
    print("[PASS] Dynamic allocation for 1 player: [1, 2, 3, 4, 5]")

def test_gameplay_flow():
    room = room_manager.get_or_create_room("PLAYFLOW", creator_id="fac-1")
    room.players["fac-1"] = {"id": "fac-1", "name": "Facilitador", "is_facilitator": True, "stations": [], "online": True}
    room.players["p1"] = {"id": "p1", "name": "Alice", "is_facilitator": False, "stations": [], "online": True}
    room.players["p2"] = {"id": "p2", "name": "Bob", "is_facilitator": False, "stations": [], "online": True}

    # Facilitador dá início a partir do lobby
    room.start_game_from_lobby()
    assert room.room_phase == "in_game"
    assert room.round_status == "running"
    assert room.players["p1"]["stations"] == [1, 2, 3]
    assert room.players["p2"]["stations"] == [4, 5]
    print("[PASS] start_game_from_lobby transitioned phase to in_game and allocated [1, 2, 3] and [4, 5]")

    batch1 = room.batches[0]
    assert batch1.current_station == 1

    # p2 não pode processar na estação 1
    assert not room.process_coin("p2", batch1.batch_id, 0)
    # p1 pode processar na estação 1
    assert room.process_coin("p1", batch1.batch_id, 0)
    print("[PASS] Station permission enforcement confirmed")

    # Regra do lote fechado bloqueia envio com apenas 1 moeda processada
    res = room.dispatch_batch("p1", batch1.batch_id)
    assert not res["success"]
    assert "Regra do Lote Fechado" in res["error"]

    # Processa as 9 restantes
    for i in range(1, 10):
        assert room.process_coin("p1", batch1.batch_id, i)
    
    # Despacha para a Estação 2
    res = room.dispatch_batch("p1", batch1.batch_id)
    assert res["success"]
    assert res["new_station"] == 2
    print("[PASS] Batch 1 advanced from Station 1 to Station 2")

    # Como a Estação 2 TAMBÉM é da p1, p1 pode processar as moedas na Estação 2
    for i in range(10):
        assert room.process_coin("p1", batch1.batch_id, i)
    res = room.dispatch_batch("p1", batch1.batch_id)
    assert res["success"]
    assert res["new_station"] == 3
    print("[PASS] Player 1 successfully operated consecutive Station 2 and sent to Station 3")

    # Retorno para o lobby
    room.return_to_lobby()
    assert room.room_phase == "lobby"
    assert room.round_status == "idle"
    print("[PASS] Return to lobby confirmed")

    print("\nALL EXPANDED VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_rest_api()
    test_dynamic_allocation()
    test_gameplay_flow()
