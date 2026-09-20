import json
from fastapi.testclient import TestClient
from main import app

def test_websocket_flow():
    client = TestClient(app)
    room_code = "WSROOM"

    with client.websocket_connect(f"/ws/{room_code}") as ws:
        # 1. Join room
        ws.send_text(json.dumps({
            "action": "JOIN_ROOM",
            "playerName": "Alice Facilitadora",
            "playerId": "p-alice"
        }))
        
        msg1 = json.loads(ws.receive_text())
        assert msg1["type"] == "ROOM_STATE"
        assert msg1["state"]["room_id"] == "WSROOM"
        assert len(msg1["state"]["players"]) == 1
        print("[PASS] WebSocket JOIN_ROOM confirmed")

        # 2. Claim Station 1
        ws.send_text(json.dumps({
            "action": "CLAIM_STATION",
            "station_id": 1,
            "playerId": "p-alice"
        }))
        msg2 = json.loads(ws.receive_text())
        assert msg2["type"] == "ROOM_STATE"
        station1 = next(s for s in msg2["state"]["stations"] if s["id"] == 1)
        assert station1["assigned_player_id"] == "p-alice"
        print("[PASS] WebSocket CLAIM_STATION confirmed")

        # 3. Start Kanban round (batch_size 2, total_coins 4)
        ws.send_text(json.dumps({
            "action": "START_ROUND",
            "round_type": "kanban",
            "batch_size": 2,
            "total_coins": 4,
            "playerId": "p-alice"
        }))
        msg3 = json.loads(ws.receive_text())
        assert msg3["type"] == "ROUND_STARTED"
        assert msg3["state"]["round"]["status"] == "running"
        assert msg3["state"]["round"]["batch_size"] == 2
        print("[PASS] WebSocket START_ROUND confirmed (Kanban)")

        # 4. Process coin 0
        batch1_id = msg3["state"]["stations"][0]["batches"][0]["batch_id"]
        ws.send_text(json.dumps({
            "action": "PROCESS_COIN",
            "batch_id": batch1_id,
            "coin_idx": 0,
            "playerId": "p-alice"
        }))
        msg4 = json.loads(ws.receive_text())
        assert msg4["type"] == "COIN_PROCESSED"
        print("[PASS] WebSocket PROCESS_COIN confirmed")

    print("\nALL WEBSOCKET TESTS PASSED!")

if __name__ == "__main__":
    test_websocket_flow()
