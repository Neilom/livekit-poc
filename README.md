# Voice Bridge Service

Serviço Node.js/TypeScript que conecta chamadas de voz entre um browser e o WhatsApp (via Meta Cloud API) usando **LiveKit** como SFU central.

## Arquitetura

```
Browser (Agent A)  <--WebRTC-->  LiveKit Server  <--rtc-node-->  Bridge  <--werift/WebRTC-->  Meta/WhatsApp (Agent B)
```

O bridge funciona como um participante server-side no room LiveKit. Ele recebe o áudio do browser via LiveKit, converte PCM para Opus/RTP e envia para a Meta via WebRTC (werift). No caminho inverso, recebe RTP/Opus da Meta, decodifica para PCM e publica no room LiveKit.

```
Browser (mic) → LiveKit Room → @livekit/rtc-node → Opus encode → werift RTP → Meta/WhatsApp
Meta/WhatsApp → werift RTP → Opus decode → @livekit/rtc-node → LiveKit Room → Browser (speaker)
```

## Stack

| Componente | Tecnologia |
|---|---|
| SFU | LiveKit Server (Docker local ou LiveKit Cloud) |
| Bridge LiveKit | `@livekit/rtc-node` — participant server-side |
| Bridge Meta | `werift` — WebRTC puro em TypeScript (sem deps nativas) |
| Codec | `@discordjs/opus` — encode/decode Opus ↔ PCM |
| API | Express + TypeScript |
| Tokens | `livekit-server-sdk` — JWT para rooms LiveKit |
| Recording | LiveKit Egress → S3 (opcional) |

## Estrutura

```
voice-livekit/
├── docker-compose.yml          # LiveKit Server local (modo dev)
├── .env.example                # Variáveis de ambiente
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts               # Express + rotas REST
│   ├── config.ts               # Variáveis de ambiente
│   ├── livekit-manager.ts      # Criação de rooms e tokens JWT
│   ├── call-bridge.ts          # Bridge: rtc-node ↔ werift + Opus
│   ├── meta-api.ts             # Meta Cloud API (initiate/terminate call)
│   ├── egress-manager.ts       # Gravação via LiveKit Egress + S3
│   └── types.ts                # Tipos compartilhados
└── public/
    ├── index.html              # Página de teste standalone
    └── app.js                  # Lógica da página de teste
```

## Pré-requisitos

- Node.js >= 18
- Docker (para LiveKit Server local) ou conta LiveKit Cloud
- Conta Meta Business com WhatsApp Calling API habilitada
- (Opcional) Bucket S3 para gravação

## Setup

```bash
# Instalar dependências
npm install

# Copiar e configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais
```

### Variáveis de ambiente

| Variável | Descrição | Obrigatório |
|---|---|---|
| `PORT` | Porta do servidor HTTP | Não (default: 3000) |
| `LIVEKIT_URL` | URL WebSocket do LiveKit Server | Sim |
| `LIVEKIT_API_KEY` | API Key do LiveKit | Sim |
| `LIVEKIT_API_SECRET` | API Secret do LiveKit | Sim |
| `LIVEKIT_PUBLIC_URL` | URL pública do LiveKit para o browser | Não (default: `LIVEKIT_URL`) |
| `META_ACCESS_TOKEN` | Token de acesso da Meta Graph API | Sim |
| `META_PHONE_NUMBER_ID` | ID do número de telefone business | Sim |
| `META_API_URL` | Base URL da Graph API | Não (default: `https://graph.facebook.com/v22.0`) |
| `S3_ACCESS_KEY` | AWS Access Key para gravação | Não |
| `S3_SECRET` | AWS Secret Key para gravação | Não |
| `S3_REGION` | Região do bucket S3 | Não (default: `us-east-1`) |
| `S3_BUCKET` | Nome do bucket S3 | Não |

### LiveKit Server local (desenvolvimento)

```bash
docker compose up -d
```

Sobe o LiveKit Server em modo dev nas portas 7880 (WS), 7881 (TCP), 7882 (UDP) com `API Key: devkey` / `Secret: secret`.

## Executar

```bash
# Desenvolvimento (hot-reload)
npm run dev

# Produção
npm run build
npm start
```

O servidor inicia em `http://localhost:3000` com a página de teste acessível na raiz.

## API REST

### `POST /call/start`

Inicia uma chamada para um número WhatsApp.

**Request:**
```json
{ "to": "5511999999999" }
```

**Response:**
```json
{
  "callId": "uuid",
  "roomName": "call-uuid",
  "token": "jwt-token-para-browser",
  "sdpOffer": "v=0\r\n...",
  "metaCallId": "wacid.xxx"
}
```

**Fluxo interno:**
1. Cria room LiveKit
2. Bridge participant entra no room (`@livekit/rtc-node`)
3. Cria PeerConnection (`werift`) e gera SDP offer
4. Aguarda ICE gathering completar
5. Envia SDP offer para Meta via `POST <PHONE_NUMBER_ID>/calls`
6. Retorna token do browser + metaCallId

### `POST /call/:callId/answer`

Aplica o SDP answer recebido da Meta (via webhook).

**Request:**
```json
{ "sdpAnswer": "v=0\r\n..." }
```

**Response:**
```json
{ "status": "connected" }
```

O SDP answer é normalizado automaticamente (literal `\r\n` → CRLF real).

### `POST /call/:callId/terminate`

Encerra a chamada. Termina na Meta, para a gravação, fecha o bridge e deleta o room.

**Response:**
```json
{ "status": "terminated" }
```

### `GET /call/:callId/status`

Retorna o status atual da chamada.

**Response:**
```json
{
  "callId": "uuid",
  "status": "active",
  "roomName": "call-uuid",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

## Página de teste

Acessível em `http://localhost:3000/`. Usa `livekit-client` via CDN para conectar o browser ao room LiveKit.

**Fluxo manual:**
1. Digitar o número WhatsApp destino
2. Clicar "Start Call" — gera SDP offer e envia à Meta automaticamente
3. Aguardar o webhook da Meta com o SDP answer
4. Colar o SDP answer no campo e clicar "Apply SDP Answer"
5. A chamada fica ativa — áudio bidirecional browser ↔ WhatsApp
6. Clicar "Terminate" para encerrar

## Gravação (opcional)

Se as variáveis S3 estiverem configuradas, a gravação via LiveKit Egress inicia automaticamente quando o SDP answer é aplicado e para quando a chamada é terminada. O arquivo `.ogg` é salvo em `s3://<bucket>/recordings/<callId>/`.

## Notas

- O `@livekit/rtc-node` está em **Developer Preview** — adequado para POC/teste
- O `werift` é **puro TypeScript** — sem dependências nativas, funciona em qualquer OS
- A conversão de áudio usa frames de 20ms a 48kHz mono para compatibilidade com Opus
- O serviço não implementa o webhook da Meta — o SDP answer é aplicado manualmente na página de teste
