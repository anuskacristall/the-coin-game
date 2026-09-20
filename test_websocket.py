import json
from fastapi.testclient import TestClient
from main import app

def test_websocket_custom_allocation():
    client = TestClient(app)
    room_code = "WSALLOC"

    with client.websocket_connect(f"/ws/{room_code}") as ws_fac:
        ws_fac.send_text(json.dumps({
            "action": "JOIN_ROOM",
            "playerName": "Facilitador Boss",
            "playerId": "p-fac"
        }))
        msg_fac = json.loads(ws_fac.receive_text())
        assert msg_fac["state"]["room_phase"] == "lobby"

        with client.websocket_connect(f"/ws/{room_code}") as ws_guest1:
            ws_guest1.send_text(json.dumps({
                "action": "JOIN_ROOM",
                "playerName": "Alice",
                "playerId": "p-alice"
            }))
            json.loads(ws_guest1.receive_text()) # initial state
            json.loads(ws_fac.receive_text())    # fac notification

            with client.websocket_connect(f"/ws/{room_code}") as ws_guest2:
                ws_guest2.send_text(json.dumps({
                    "action": "JOIN_ROOM",
                    "playerName": "Bob",
                    "playerId": "p-bob"
                }))
                json.loads(ws_guest2.receive_text()) # initial state
                json.loads(ws_fac.receive_text())    # fac notification
                json.loads(ws_guest1.receive_text()) # guest1 notification

                # Facilitator uses custom checkbox allocation:
                # Alice -> E1, E2; Bob -> E3, E4, E5
                ws_fac.send_text(json.dumps({
                    "action": "SET_CUSTOM_ALLOCATION",
                    "allocations": {
                        "p-alice": [1, 2],
                        "p-bob": [3, 4, 5]
                    },
                    "start_game": True,
                    "playerId": "p-fac"
                }))

                msg_start = json.loads(ws_fac.receive_text())
                assert msg_start["type"] == "GAME_STARTED"
                assert msg_start["state"]["room_phase"] == "in_game"

                alice = next(p for p in msg_start["state"]["players"] if p["id"] == "p-alice")
                bob = next(p for p in msg_start["state"]["players"] if p["id"] == "p-bob")
                assert alice["stations"] == [1, 2]
                assert bob["stations"] == [3, 4, 5]
                print("[PASS] Custom checkbox allocation verified: Alice=[1, 2], Bob=[3, 4, 5]")

    print("\nALL CUSTOM ALLOCATION TESTS PASSED!")

if __name__ == "__main__":
    test_websocket_custom_allocation()
