import json
from fastapi.testclient import TestClient
from main import app

def test_websocket_lobby_and_start():
    client = TestClient(app)
    room_code = "WSLOBBY"

    # Conectar Facilitador
    with client.websocket_connect(f"/ws/{room_code}") as ws_fac:
        ws_fac.send_text(json.dumps({
            "action": "JOIN_ROOM",
            "playerName": "Facilitador Boss",
            "playerId": "p-fac"
        }))
        msg_fac = json.loads(ws_fac.receive_text())
        assert msg_fac["state"]["room_phase"] == "lobby"
        assert msg_fac["state"]["players"][0]["is_facilitator"] is True
        print("[PASS] Facilitator connected to lobby")

        # Conectar Jogador Convidado 1
        with client.websocket_connect(f"/ws/{room_code}") as ws_guest:
            ws_guest.send_text(json.dumps({
                "action": "JOIN_ROOM",
                "playerName": "Dev 1",
                "playerId": "p-guest1"
            }))
            # ws_guest recebe seu ROOM_STATE inicial
            msg_guest = json.loads(ws_guest.receive_text())
            assert msg_guest["state"]["room_phase"] == "lobby"

            # ws_fac também recebe o broadcast avisando que Dev 1 entrou
            fac_notif = json.loads(ws_fac.receive_text())
            assert "Dev 1" in fac_notif.get("notification", "")
            print("[PASS] Guest 1 connected to lobby (and Facilitator notified)")

            # Facilitador clica em "Iniciar Partida" (START_GAME)
            ws_fac.send_text(json.dumps({
                "action": "START_GAME",
                "playerId": "p-fac"
            }))

            msg_start = json.loads(ws_fac.receive_text())
            assert msg_start["type"] == "GAME_STARTED"
            assert msg_start["state"]["room_phase"] == "in_game"
            
            # Como só tem 1 convidado, ele recebe as 5 estações
            guest_player = next(p for p in msg_start["state"]["players"] if p["id"] == "p-guest1")
            assert guest_player["stations"] == [1, 2, 3, 4, 5]
            print("[PASS] Facilitator START_GAME dynamically allocated 5 stations to Guest 1")

    print("\nALL WEBSOCKET LOBBY TESTS PASSED!")

if __name__ == "__main__":
    test_websocket_lobby_and_start()
