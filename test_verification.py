import asyncio
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
    print(f"[PASS] GET /api/rooms/{room_id} verified")

def test_gameplay_logic():
    room = room_manager.get_or_create_room("TESTROOM", creator_id="player-1")
    
    # Add player 1 (Station 1) and player 2 (Station 2)
    room.players["player-1"] = {
        "id": "player-1", "name": "Alice", "is_facilitator": True, "station": 1, "online": True
    }
    room.station_assignments[1] = "player-1"

    room.players["player-2"] = {
        "id": "player-2", "name": "Bob", "is_facilitator": False, "station": 2, "online": True
    }
    room.station_assignments[2] = "player-2"

    # Start Waterfall round (batch size 10, total 20)
    room.start_round(round_type="waterfall", batch_size=10, total_coins=20)
    assert room.round_status == "running"
    assert len(room.batches) == 2
    assert room.batches[0].size == 10
    print("[PASS] Waterfall round started with 2 batches of 10")

    # Verify closed batch rule: cannot dispatch before all 10 coins are processed
    res = room.dispatch_batch("player-1", room.batches[0].batch_id)
    assert not res["success"]
    assert "Regra do Lote Fechado" in res["error"]
    print("[PASS] Closed batch rule blocked dispatch at 0% processed")

    # Process 5 coins -> still cannot dispatch
    for i in range(5):
        assert room.process_coin("player-1", room.batches[0].batch_id, i)
    res = room.dispatch_batch("player-1", room.batches[0].batch_id)
    assert not res["success"]
    print("[PASS] Closed batch rule blocked dispatch at 50% processed")

    # Process remaining 5 coins -> now 100% processed
    for i in range(5, 10):
        assert room.process_coin("player-1", room.batches[0].batch_id, i)
    assert room.batches[0].is_fully_processed()

    # Now dispatch succeeds and advances to Station 2
    res = room.dispatch_batch("player-1", room.batches[0].batch_id)
    assert res["success"]
    assert res["new_station"] == 2
    print("[PASS] Batch 1 successfully dispatched from Station 1 to Station 2")

    # Check that coins at Station 2 are reset to uncompleted
    batch1 = room.batches[0]
    assert batch1.current_station == 2
    assert all(not c.processed for c in batch1.coins)
    print("[PASS] Batch 1 coins properly reset for Station 2 processing")

    # Check Station 1 now has Batch 2 as active
    st1_batches = room.get_station_batches(1)
    assert len(st1_batches) == 1
    assert st1_batches[0].batch_id == room.batches[1].batch_id
    print("[PASS] Batch 2 became active at Station 1")

    # Fast forward batch 1 through stations 2, 3, 4, 5
    for st_num in [2, 3, 4, 5]:
        pid = f"p-{st_num}"
        room.players[pid] = {"id": pid, "name": f"P{st_num}", "is_facilitator": False, "station": st_num, "online": True}
        room.station_assignments[st_num] = pid
        for i in range(10):
            room.process_coin(pid, batch1.batch_id, i)
        d_res = room.dispatch_batch(pid, batch1.batch_id)
        assert d_res["success"]

    # When leaving station 5 -> Station 6 (Done), first delivery time recorded!
    assert batch1.current_station == 6
    assert room.first_delivery_time is not None
    print(f"[PASS] 1st Delivery Lead Time recorded: {room.first_delivery_time}s")

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_rest_api()
    test_gameplay_logic()
