# 🪙 The Coin Game — Simulador Kanban & Batch Size

Um jogo multiplayer em tempo real construído com **FastAPI + WebSockets** e **HTML/CSS/JavaScript (Vanilla)** para demonstrar na prática o impacto do tamanho de lotes (*Batch Size*) no fluxo de entrega, no tempo de resposta (*Lead Time* da 1ª entrega) e nos gargalos de trabalho em progresso (*WIP*).

---

## 🎯 Objetivo Pedagógico
O jogo simula um pipeline de software com 5 estações:
1. **Estação 1:** Levantamento e Análise
2. **Estação 2:** Modelagem Relacional
3. **Estação 3:** Desenvolvimento da Migração
4. **Estação 4:** Aplicação e Testes
5. **Estação 5:** Homologação e Produção (Entrega ao Cliente)

### As Rodadas:
- **Rodada 1 (Cascata / Lote 10):** Cada jogador precisa processar 10 moedas antes de despachar o lote para a próxima estação.
  - *Resultado:* As estações 2 a 5 ficam ociosas esperando, as filas acumulam e a 1ª entrega ao cliente demora muito tempo.
- **Rodada 2 (Kanban / Lote 2):** A cada 2 moedas processadas, o jogador já despacha o lote.
  - *Resultado:* Todas as estações trabalham em paralelo (fluxo contínuo), a 1ª entrega é feita em tempo recorde e o WIP fica balanceado.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Python 3.9+ instalado no seu computador.

### Passo a Passo

1. **Abra o terminal na pasta do projeto:**
   ```bash
   cd the-coin-game
   ```

2. **Instale as dependências:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Inicie o servidor:**
   ```bash
   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Acesse no seu navegador:**
   - No seu computador: [http://localhost:8000](http://localhost:8000)
   - Na sua rede local (Wi-Fi): outros computadores ou celulares podem acessar usando o seu IP local (ex: `http://192.168.1.15:8000`).

---

## 🕹️ Dicas de Teste e Demonstração

- **Testar Sozinho (Modo Solo):** Ative a chave **"Modo Solo / Teste"** no topo da tela para poder processar e despachar lotes de qualquer estação sem precisar abrir 5 abas.
- **Testar com 5 Jogadores:** Abra 5 abas (ou envie o link para seus colegas) e faça cada um assumir uma estação de 1 a 5. O criador da sala controla o início das rodadas no Painel do Facilitador.
- **Quadro Comparativo:** Ao finalizar a Rodada 1 e a Rodada 2, clique no botão **"📊 Comparativo"** no cabeçalho para ver o Lead Time lado a lado e os insights didáticos sobre Lean & Kanban.

---

## ☁️ Como Fazer Deploy na Nuvem (Ex: Render)

O projeto foi arquitetado especificamente para rodar com zero atrito em serviços como **Render**, **Railway** ou **Fly.io**:
- O frontend usa URLs relativas e se conecta automaticamente via `ws://` ou `wss://` dependendo do protocolo de hospedagem.
- O FastAPI serve tanto a API/WebSockets quanto os arquivos estáticos na mesma porta.

### Deploy no Render (Plano Gratuito)
1. Crie um repositório no GitHub com os arquivos do projeto (`main.py`, `requirements.txt`, pasta `static/`).
2. Acesse [render.com](https://render.com) e clique em **New +** ➔ **Web Service**.
3. Conecte seu repositório do GitHub.
4. Preencha as configurações:
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Clique em **Create Web Service**.
6. Pronto! O Render fornecerá uma URL HTTPS (ex: `https://the-coin-game.onrender.com`), e o jogo multiplayer funcionará em qualquer lugar do mundo!
