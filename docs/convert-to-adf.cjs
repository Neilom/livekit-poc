const fs = require('fs');

function text(t, marks = []) {
  const node = { type: 'text', text: t };
  if (marks.length > 0) node.marks = marks;
  return node;
}

function heading(level, ...content) {
  return { type: 'heading', attrs: { level }, content };
}

function paragraph(...content) {
  if (content.length === 0) return { type: 'paragraph' };
  return { type: 'paragraph', content };
}

function codeBlock(language, code) {
  return { type: 'codeBlock', attrs: { language }, content: [text(code)] };
}

function bulletList(...items) {
  return { type: 'bulletList', content: items };
}

function orderedList(...items) {
  return { type: 'orderedList', content: items };
}

function listItem(...content) {
  return { type: 'listItem', content };
}

function table(...rows) {
  return { type: 'table', attrs: { isNumberColumnEnabled: false, layout: 'default' }, content: rows };
}

function tableRow(...cells) {
  return { type: 'tableRow', content: cells };
}

function tableHeader(...content) {
  return { type: 'tableHeader', attrs: {}, content };
}

function tableCell(...content) {
  return { type: 'tableCell', attrs: {}, content };
}

function panel(panelType, ...content) {
  return { type: 'panel', attrs: { panelType }, content };
}

function strong(t) { return text(t, [{ type: 'strong' }]); }
function em(t) { return text(t, [{ type: 'em' }]); }
function code(t) { return text(t, [{ type: 'code' }]); }
function strongCode(t) { return text(t, [{ type: 'strong' }, { type: 'code' }]); }

function tocMacro() {
  return {
    type: 'extension',
    attrs: {
      extensionType: 'com.atlassian.confluence.macro.core',
      extensionKey: 'toc',
      parameters: { macroParams: { maxLevel: { value: '3' } } },
      layout: 'default'
    }
  };
}

const adf = {
  type: 'doc',
  version: 1,
  content: [
    tocMacro(),

    // === Visão Geral ===
    heading(2, text('Visão Geral')),
    paragraph(
      text('Serviço Node.js/TypeScript que conecta chamadas de voz entre um '),
      strong('browser'),
      text(' e o '),
      strong('WhatsApp'),
      text(' (via Meta Cloud API) usando '),
      strong('LiveKit'),
      text(' como SFU (Selective Forwarding Unit) central.')
    ),
    paragraph(
      text('O '),
      em('bridge'),
      text(' funciona como um participante server-side no room LiveKit. Ele recebe o áudio do browser via LiveKit, converte PCM para Opus/RTP e envia para a Meta via WebRTC (werift). No caminho inverso, recebe RTP/Opus da Meta, decodifica para PCM e publica no room LiveKit.')
    ),
    codeBlock('text',
      'Browser (mic) → LiveKit Room → @livekit/rtc-node → Opus encode → werift RTP → Meta/WhatsApp\n' +
      'Meta/WhatsApp → werift RTP → Opus decode → @livekit/rtc-node → LiveKit Room → Browser (speaker)'
    ),

    // === Arquitetura ===
    heading(2, text('Arquitetura')),
    codeBlock('text',
      'Browser (Agent A)  <--WebRTC-->  LiveKit Server  <--rtc-node-->  Bridge  <--werift/WebRTC-->  Meta/WhatsApp (Agent B)'
    ),

    heading(3, text('Componentes')),
    table(
      tableRow(
        tableHeader(paragraph(text('Componente'))),
        tableHeader(paragraph(text('Tecnologia'))),
        tableHeader(paragraph(text('Descrição')))
      ),
      tableRow(
        tableCell(paragraph(strong('Browser (Test UI)'))),
        tableCell(paragraph(text('livekit-client@2, Vanilla JS'))),
        tableCell(paragraph(text('Página de teste em public/. Conecta ao LiveKit como "browser-agent", publica microfone e reproduz áudio remoto.')))
      ),
      tableRow(
        tableCell(paragraph(strong('LiveKit Server'))),
        tableCell(paragraph(text('WebRTC SFU, Docker'))),
        tableCell(paragraph(text('Gerencia salas WebRTC. Hospeda rooms, roteia mídia entre browser e bridge participants. Roda em Docker (modo dev) ou LiveKit Cloud.')))
      ),
      tableRow(
        tableCell(paragraph(strong('Express Server'))),
        tableCell(paragraph(text('Express, TypeScript'))),
        tableCell(paragraph(text('Orquestra o ciclo de vida da chamada. Gerencia sessões em memória (Map), cria rooms, gera tokens JWT e coordena bridge + Meta API.')))
      ),
      tableRow(
        tableCell(paragraph(strong('Call Bridge'))),
        tableCell(paragraph(text('@livekit/rtc-node, werift, @discordjs/opus'))),
        tableCell(paragraph(text('Módulo interno ao Express Server (mesmo processo). Participa do room como "bridge-agent", converte PCM ↔ Opus a 48kHz/mono/20ms frames.')))
      ),
      tableRow(
        tableCell(paragraph(strong('Meta Graph API'))),
        tableCell(paragraph(text('HTTPS, SDP, Graph API v22.0'))),
        tableCell(paragraph(text('API REST do WhatsApp Business para chamadas de voz. Recebe SDP offer para iniciar chamada e suporta terminate.')))
      ),
      tableRow(
        tableCell(paragraph(strong('LiveKit Egress'))),
        tableCell(paragraph(text('EgressClient, Room Composite, OGG'))),
        tableCell(paragraph(text('Gravação do room em formato OGG (audio only) e upload para S3. Requer S3 configurado.')))
      ),
      tableRow(
        tableCell(paragraph(strong('S3 Bucket'))),
        tableCell(paragraph(text('AWS S3'))),
        tableCell(paragraph(text('Armazena gravações em recordings/{callId}/{room}-{time}.ogg.')))
      )
    ),

    // === Stack Tecnológica ===
    heading(2, text('Stack Tecnológica')),
    table(
      tableRow(
        tableHeader(paragraph(text('Área'))),
        tableHeader(paragraph(text('Tecnologia'))),
        tableHeader(paragraph(text('Versão')))
      ),
      tableRow(tableCell(paragraph(text('Runtime'))), tableCell(paragraph(text('Node.js + TypeScript'))), tableCell(paragraph(text('≥ 18 / 5.7')))),
      tableRow(tableCell(paragraph(text('HTTP API'))), tableCell(paragraph(text('Express'))), tableCell(paragraph(text('4.21')))),
      tableRow(tableCell(paragraph(text('SFU'))), tableCell(paragraph(text('LiveKit Server'))), tableCell(paragraph(text('Docker latest')))),
      tableRow(tableCell(paragraph(text('LiveKit SDK (server)'))), tableCell(paragraph(text('livekit-server-sdk (rooms, JWT, egress)'))), tableCell(paragraph(text('2.9')))),
      tableRow(tableCell(paragraph(text('LiveKit SDK (media)'))), tableCell(paragraph(text('@livekit/rtc-node (PCM frames)'))), tableCell(paragraph(text('0.13')))),
      tableRow(tableCell(paragraph(text('WebRTC (Meta)'))), tableCell(paragraph(text('werift (TypeScript puro, sem deps nativas)'))), tableCell(paragraph(text('0.22')))),
      tableRow(tableCell(paragraph(text('Codec'))), tableCell(paragraph(text('@discordjs/opus (encode/decode Opus ↔ PCM)'))), tableCell(paragraph(text('0.10')))),
      tableRow(tableCell(paragraph(text('Browser client'))), tableCell(paragraph(text('livekit-client (CDN jsDelivr)'))), tableCell(paragraph(text('2.x')))),
      tableRow(tableCell(paragraph(text('IDs'))), tableCell(paragraph(text('uuid'))), tableCell(paragraph(text('11.x')))),
      tableRow(tableCell(paragraph(text('Config'))), tableCell(paragraph(text('dotenv'))), tableCell(paragraph(text('16.x'))))
    ),

    // === Estrutura de Arquivos ===
    heading(2, text('Estrutura de Arquivos')),
    codeBlock('text',
      'voice-livekit/\n' +
      '├── docker-compose.yml          # LiveKit Server local (modo dev)\n' +
      '├── .env.example                # Variáveis de ambiente\n' +
      '├── package.json\n' +
      '├── tsconfig.json\n' +
      '├── src/\n' +
      '│   ├── server.ts               # Express app: CORS, rotas REST, gerencia sessões\n' +
      '│   ├── config.ts               # Variáveis de ambiente tipadas\n' +
      '│   ├── livekit-manager.ts      # Criação de rooms e tokens JWT\n' +
      '│   ├── call-bridge.ts          # Bridge: rtc-node ↔ werift + Opus encode/decode\n' +
      '│   ├── meta-api.ts             # Meta Cloud API (initiate/terminate call)\n' +
      '│   ├── egress-manager.ts       # Gravação via LiveKit Egress + S3\n' +
      '│   └── types.ts                # Tipos compartilhados (CallSession, DTOs)\n' +
      '└── public/\n' +
      '    ├── index.html              # Página de teste standalone\n' +
      '    └── app.js                  # Lógica da página de teste (livekit-client)'
    ),

    heading(3, text('Descrição dos Arquivos')),
    table(
      tableRow(
        tableHeader(paragraph(text('Arquivo'))),
        tableHeader(paragraph(text('Responsabilidade')))
      ),
      tableRow(
        tableCell(paragraph(code('src/server.ts'))),
        tableCell(paragraph(text('Express app principal. Configura CORS, JSON parsing, serve arquivos estáticos de '), code('public/'), text('. Gerencia sessões em '), code('Map<callId, CallSession>'), text('. Expõe rotas REST para o ciclo de vida da chamada e endpoint '), code('GET /config'), text(' para o frontend.')))
      ),
      tableRow(
        tableCell(paragraph(code('src/call-bridge.ts'))),
        tableCell(paragraph(text('Core do bridge bidirecional. Conecta ao LiveKit como "bridge-agent" via '), code('@livekit/rtc-node'), text('. Cria '), code('RTCPeerConnection'), text(' do '), code('werift'), text(' com codec Opus. Gera SDP offer com ICE gathering. Subscreve ao áudio do browser-agent, codifica PCM→Opus e envia RTP ao Meta. Recebe RTP do Meta, decodifica Opus→PCM e publica no LiveKit via '), code('AudioSource.captureFrame()'), text('.')))
      ),
      tableRow(
        tableCell(paragraph(code('src/livekit-manager.ts'))),
        tableCell(paragraph(code('RoomServiceClient'), text(' para criar/deletar rooms. Gera tokens JWT com '), code('AccessToken'), text(' e grants (roomJoin, canPublish, canSubscribe) com TTL de 1h.')))
      ),
      tableRow(
        tableCell(paragraph(code('src/meta-api.ts'))),
        tableCell(paragraph(text('Fetch para Meta Graph API v22.0: '), code('POST /{phoneNumberId}/calls'), text(' com action "connect" (SDP offer) e action "terminate". Usa Bearer token para autenticação.')))
      ),
      tableRow(
        tableCell(paragraph(code('src/egress-manager.ts'))),
        tableCell(paragraph(code('EgressClient'), text(' do '), code('livekit-server-sdk'), text('. Inicia gravação room composite (audio only, formato OGG) com upload S3. Valida configuração S3 antes de iniciar — se não configurado, apenas loga warning.')))
      ),
      tableRow(
        tableCell(paragraph(code('src/config.ts'))),
        tableCell(paragraph(text('Carrega '), code('dotenv'), text(', valida variáveis obrigatórias ('), code('LIVEKIT_*'), text(', '), code('META_*'), text('), exporta objeto '), code('config'), text(' tipado com valores padrão para opcionais.')))
      ),
      tableRow(
        tableCell(paragraph(code('src/types.ts'))),
        tableCell(paragraph(text('Define '), code('CallStatus'), text(' (union type), '), code('CallSession'), text(', '), code('CallBridgeHandle'), text(' (applyAnswer, terminate, getStatus) e DTOs de resposta da API.')))
      ),
      tableRow(
        tableCell(paragraph(code('public/app.js'))),
        tableCell(paragraph(text('Client JavaScript (vanilla, sem bundler). Conecta ao LiveKit via '), code('livekit-client'), text(' CDN. Publica microfone local, subscreve áudio remoto, gerencia fluxo SDP manual.')))
      ),
      tableRow(
        tableCell(paragraph(code('public/index.html'))),
        tableCell(paragraph(text('Página de teste dark-mode. Status dots para LiveKit/Meta/Call/Mic. Campos para número WhatsApp, SDP offer (readonly), SDP answer (input). Botões Start/Mute/Terminate/Apply.')))
      )
    ),

    // === API REST ===
    heading(2, text('API REST')),

    heading(3, text('POST /call/start')),
    paragraph(text('Inicia uma chamada para um número WhatsApp.')),
    codeBlock('json',
      'POST /call/start\nContent-Type: application/json\n\n{ "to": "5511999999999" }'
    ),
    codeBlock('json',
      '{\n  "callId": "uuid",\n  "roomName": "call-uuid",\n  "token": "jwt-token-para-browser",\n  "sdpOffer": "v=0\\r\\n...",\n  "metaCallId": "wacid.xxx"\n}'
    ),
    paragraph(strong('Fluxo interno:')),
    orderedList(
      listItem(paragraph(text('Cria room LiveKit ('), code('call-{uuid}'), text(') com '), code('emptyTimeout: 300s'), text('.'))),
      listItem(paragraph(text('Gera token JWT para "browser-agent" com grants de publish/subscribe.'))),
      listItem(
        paragraph(text('Chama '), code('createBridge(roomName)'), text(':')),
        bulletList(
          listItem(paragraph(text('Gera token JWT para "bridge-agent"'))),
          listItem(paragraph(text('Conecta ao LiveKit como bridge-agent via '), code('@livekit/rtc-node'))),
          listItem(paragraph(text('Publica '), code('LocalAudioTrack'), text(' ("bridge-audio") com '), code('AudioSource'), text(' (48kHz, 1ch)'))),
          listItem(paragraph(text('Cria '), code('RTCPeerConnection'), text(' (werift) com codec Opus (PT 111)'))),
          listItem(paragraph(text('Configura transceiver sendrecv com handlers bidirecionais'))),
          listItem(paragraph(text('Gera SDP offer e aguarda ICE gathering (timeout 10s)')))
        )
      ),
      listItem(paragraph(text('Envia SDP offer ao Meta via '), code('POST /{phoneNumberId}/calls'), text(' com action "connect".'))),
      listItem(paragraph(text('Armazena sessão em memória e retorna callId + token + sdpOffer + metaCallId.')))
    ),

    heading(3, text('POST /call/:callId/answer')),
    paragraph(text('Aplica o SDP answer recebido da Meta.')),
    codeBlock('json', 'POST /call/:callId/answer\nContent-Type: application/json\n\n{ "sdpAnswer": "v=0\\r\\n..." }'),
    codeBlock('json', '{ "status": "connected" }'),
    paragraph(strong('Fluxo interno:')),
    orderedList(
      listItem(paragraph(text('Normaliza SDP answer (literal '), code('\\r\\n'), text(' → CRLF real)'))),
      listItem(paragraph(text('Chama '), code('pc.setRemoteDescription(answer)'), text(' no werift'))),
      listItem(paragraph(text('Altera status da sessão para '), code('active'))),
      listItem(paragraph(text('Inicia gravação via Egress (se S3 configurado) — '), code('startRoomCompositeEgress'), text(' com '), code('audioOnly: true'), text(', formato OGG')))
    ),

    heading(3, text('POST /call/:callId/terminate')),
    paragraph(text('Encerra a chamada completamente.')),
    codeBlock('json', '{ "status": "terminated" }'),
    paragraph(strong('Fluxo interno:')),
    orderedList(
      listItem(paragraph(text('Para gravação via Egress ('), code('stopEgress'), text(')'))),
      listItem(paragraph(text('Termina chamada no Meta ('), code('POST /{phoneNumberId}/calls'), text(' com action "terminate")'))),
      listItem(paragraph(text('Fecha bridge: '), code('pc.close()'), text(', '), code('localTrack.close()'), text(', '), code('audioSource.close()'), text(', '), code('room.disconnect()'))),
      listItem(paragraph(text('Deleta room do LiveKit ('), code('deleteRoom'), text(')'))),
      listItem(paragraph(text('Remove sessão do Map')))
    ),

    heading(3, text('GET /call/:callId/status')),
    paragraph(text('Retorna o status atual da chamada.')),
    codeBlock('json', '{\n  "callId": "uuid",\n  "status": "active",\n  "roomName": "call-uuid",\n  "createdAt": "2025-01-01T00:00:00.000Z"\n}'),
    paragraph(strong('Status possíveis: '), code('creating'), text(' | '), code('waiting_answer'), text(' | '), code('connecting'), text(' | '), code('active'), text(' | '), code('terminated'), text(' | '), code('error')),

    heading(3, text('GET /config')),
    paragraph(text('Retorna configuração pública para o frontend.')),
    codeBlock('json', '{ "livekitUrl": "ws://127.0.0.1:7880" }'),

    // === Fluxo de Áudio ===
    heading(2, text('Fluxo de Áudio (Bidirecional)')),

    heading(3, text('Browser → WhatsApp')),
    orderedList(
      listItem(paragraph(strong('Browser → LiveKit: '), text('Microfone capturado via '), code('livekit-client'), text(', publicado como track WebRTC para o SFU.'))),
      listItem(paragraph(strong('LiveKit → Bridge: '), code('@livekit/rtc-node'), text(' se inscreve no track do browser-agent e recebe '), code('AudioFrames'), text(' PCM (48kHz, mono, frames de 20ms).'))),
      listItem(paragraph(strong('Bridge → Meta: '), text('PCM é codificado em Opus via '), code('@discordjs/opus'), text(' e empacotado como RTP ('), code('RtpPacket'), text(') pelo werift. Payload type 111, SSRC do transceiver sender.'))),
      listItem(paragraph(strong('Meta → WhatsApp: '), text('Meta roteia o áudio para o usuário final via infraestrutura própria do WhatsApp.')))
    ),

    heading(3, text('WhatsApp → Browser')),
    orderedList(
      listItem(paragraph(strong('WhatsApp → Meta → Bridge: '), text('RTP Opus packets recebidos pelo werift via '), code('onReceiveRtp'), text('.'))),
      listItem(paragraph(strong('Bridge decode: '), text('Opus é decodificado para PCM via '), code('@discordjs/opus'), text('. Resulta em '), code('Int16Array'), text(' (48kHz, mono).'))),
      listItem(paragraph(strong('Bridge → LiveKit: '), text('PCM é publicado via '), code('AudioSource.captureFrame(AudioFrame)'), text(' como "bridge-audio" track.'))),
      listItem(paragraph(strong('LiveKit → Browser: '), text('O SFU entrega o track remoto ao browser via WebRTC. O '), code('livekit-client'), text(' atribui um elemento '), code('<audio>'), text('.')))
    ),

    // === Diagrama de Sequência ===
    heading(2, text('Diagrama de Sequência')),
    codeBlock('text',
      'Browser              Node.js Server           LiveKit              Meta / WhatsApp\n' +
      '  │                      │                      │                      │\n' +
      '  │ ── FASE 1: POST /call/start ──────────────────────────────────────│\n' +
      '  │                      │                      │                      │\n' +
      '  │  POST /call/start    │                      │                      │\n' +
      '  │─────────────────────>│                      │                      │\n' +
      '  │                      │  createRoom()        │                      │\n' +
      '  │                      │─────────────────────>│                      │\n' +
      '  │                      │  generateToken()     │                      │\n' +
      '  │                      │─────────────────────>│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │──┐ createBridge()    │                      │\n' +
      '  │                      │  │ init werift+opus  │                      │\n' +
      '  │                      │<─┘                   │                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  room.connect()      │                      │\n' +
      '  │                      │  + publishTrack      │                      │\n' +
      '  │                      │─────────────────────>│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │──┐ createOffer()     │                      │\n' +
      '  │                      │  │ + ICE gathering   │                      │\n' +
      '  │                      │<─┘                   │                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  initiateCall(to, sdpOffer)                 │\n' +
      '  │                      │────────────────────────────────────────────>│\n' +
      '  │                      │                      │                      │\n' +
      '  │  {callId, token,     │                      │                      │\n' +
      '  │   sdpOffer, metaId}  │                      │                      │\n' +
      '  │<─────────────────────│                      │                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │  Room.connect(url, token) + publish mic     │                      │\n' +
      '  │────────────────────────────────────────────>│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │ ── FASE 2: POST /call/:id/answer ─────────────────────────────────│\n' +
      '  │                      │                      │                      │\n' +
      '  │  POST /call/:id/answer {sdpAnswer}          │                      │\n' +
      '  │─────────────────────>│                      │                      │\n' +
      '  │                      │──┐ applyAnswer()     │                      │\n' +
      '  │                      │  │ setRemoteDesc()   │                      │\n' +
      '  │                      │<─┘                   │                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  startRecording()    │                      │\n' +
      '  │                      │─────────────────────>│  → Egress OGG → S3  │\n' +
      '  │                      │                      │                      │\n' +
      '  │  {status: connected} │                      │                      │\n' +
      '  │<─────────────────────│                      │                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │ ── FASE 3: Chamada Ativa (áudio bidirecional) ────────────────────│\n' +
      '  │                      │                      │                      │\n' +
      '  │  audio track (mic)   │                      │                      │\n' +
      '  │────────────────────────────────────────────>│                      │\n' +
      '  │                      │  trackSubscribed     │                      │\n' +
      '  │                      │  → PCM AudioStream   │                      │\n' +
      '  │                      │<─────────────────────│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  Opus encode → RTP (werift)                 │\n' +
      '  │                      │────────────────────────────────────────────>│\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  RTP Opus packets (werift)                  │\n' +
      '  │                      │<────────────────────────────────────────────│\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  Opus decode →       │                      │\n' +
      '  │                      │  captureFrame(PCM)   │                      │\n' +
      '  │                      │─────────────────────>│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │  remote audio track  │                      │                      │\n' +
      '  │<────────────────────────────────────────────│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │ ── FASE 4: POST /call/:id/terminate ──────────────────────────────│\n' +
      '  │                      │                      │                      │\n' +
      '  │  POST /call/:id/terminate                   │                      │\n' +
      '  │─────────────────────>│                      │                      │\n' +
      '  │                      │  stopRecording()     │                      │\n' +
      '  │                      │─────────────────────>│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  terminateCall(metaCallId)                  │\n' +
      '  │                      │────────────────────────────────────────────>│\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │──┐ pc.close()        │                      │\n' +
      '  │                      │  │ room.disconnect() │                      │\n' +
      '  │                      │<─┘                   │                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │                      │  deleteRoom()        │                      │\n' +
      '  │                      │─────────────────────>│                      │\n' +
      '  │                      │                      │                      │\n' +
      '  │ {status: terminated} │                      │                      │\n' +
      '  │<─────────────────────│                      │                      │'
    ),

    // === Configuração ===
    heading(2, text('Configuração')),
    heading(3, text('Variáveis de Ambiente')),
    table(
      tableRow(
        tableHeader(paragraph(text('Variável'))),
        tableHeader(paragraph(text('Descrição'))),
        tableHeader(paragraph(text('Obrigatório'))),
        tableHeader(paragraph(text('Default')))
      ),
      tableRow(tableCell(paragraph(code('PORT'))), tableCell(paragraph(text('Porta do servidor HTTP'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(text('3000')))),
      tableRow(tableCell(paragraph(code('LIVEKIT_URL'))), tableCell(paragraph(text('URL WebSocket do LiveKit Server'))), tableCell(paragraph(text('Sim'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('LIVEKIT_API_KEY'))), tableCell(paragraph(text('API Key do LiveKit'))), tableCell(paragraph(text('Sim'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('LIVEKIT_API_SECRET'))), tableCell(paragraph(text('API Secret do LiveKit'))), tableCell(paragraph(text('Sim'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('LIVEKIT_PUBLIC_URL'))), tableCell(paragraph(text('URL pública do LiveKit para o browser'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(code('LIVEKIT_URL')))),
      tableRow(tableCell(paragraph(code('META_ACCESS_TOKEN'))), tableCell(paragraph(text('Token de acesso da Meta Graph API'))), tableCell(paragraph(text('Sim'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('META_PHONE_NUMBER_ID'))), tableCell(paragraph(text('ID do número de telefone business'))), tableCell(paragraph(text('Sim'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('META_API_URL'))), tableCell(paragraph(text('Base URL da Graph API'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(code('https://graph.facebook.com/v22.0')))),
      tableRow(tableCell(paragraph(code('S3_ACCESS_KEY'))), tableCell(paragraph(text('AWS Access Key para gravação'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('S3_SECRET'))), tableCell(paragraph(text('AWS Secret Key para gravação'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(text('—')))),
      tableRow(tableCell(paragraph(code('S3_REGION'))), tableCell(paragraph(text('Região do bucket S3'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(code('us-east-1')))),
      tableRow(tableCell(paragraph(code('S3_BUCKET'))), tableCell(paragraph(text('Nome do bucket S3'))), tableCell(paragraph(text('Não'))), tableCell(paragraph(text('—'))))
    ),

    heading(3, text('Exemplo de .env')),
    codeBlock('bash',
      '# HTTP server\n' +
      'PORT=3000\n\n' +
      '# LiveKit (match docker-compose dev keys)\n' +
      'LIVEKIT_URL=ws://127.0.0.1:7880\n' +
      'LIVEKIT_API_KEY=devkey\n' +
      'LIVEKIT_API_SECRET=secret\n' +
      'LIVEKIT_PUBLIC_URL=ws://127.0.0.1:7880\n\n' +
      '# Meta Cloud API (WhatsApp Calling)\n' +
      'META_ACCESS_TOKEN=your_meta_access_token_here\n' +
      'META_PHONE_NUMBER_ID=your_phone_number_id_here\n' +
      'META_API_URL=https://graph.facebook.com/v22.0\n\n' +
      '# S3 Recording (opcional - LiveKit Egress)\n' +
      'S3_ACCESS_KEY=\n' +
      'S3_SECRET=\n' +
      'S3_REGION=us-east-1\n' +
      'S3_BUCKET=my-call-recordings'
    ),

    // === Setup e Execução ===
    heading(2, text('Setup e Execução')),
    heading(3, text('Pré-requisitos')),
    bulletList(
      listItem(paragraph(text('Node.js ≥ 18'))),
      listItem(paragraph(text('Docker (para LiveKit Server local) ou conta LiveKit Cloud'))),
      listItem(paragraph(text('Conta Meta Business com WhatsApp Calling API habilitada'))),
      listItem(paragraph(text('(Opcional) Bucket S3 para gravação de chamadas')))
    ),

    heading(3, text('Instalação')),
    codeBlock('bash', '# Instalar dependências\nnpm install\n\n# Copiar e configurar variáveis de ambiente\ncp .env.example .env\n# Editar .env com suas credenciais'),

    heading(3, text('LiveKit Server local (Docker)')),
    codeBlock('bash', 'docker compose up -d'),
    paragraph(text('Sobe o LiveKit Server em modo dev nas portas:')),
    bulletList(
      listItem(paragraph(strong('7880'), text(' — WebSocket'))),
      listItem(paragraph(strong('7881'), text(' — TCP'))),
      listItem(paragraph(strong('7882/udp'), text(' — UDP')))
    ),
    paragraph(text('Credenciais dev: '), code('API Key: devkey'), text(' / '), code('Secret: secret')),

    heading(3, text('docker-compose.yml')),
    codeBlock('yaml',
      'services:\n' +
      '  livekit:\n' +
      '    image: livekit/livekit-server:latest\n' +
      '    command: --dev\n' +
      '    ports:\n' +
      '      - "7880:7880"\n' +
      '      - "7881:7881"\n' +
      '      - "7882:7882/udp"\n' +
      '    environment:\n' +
      '      LIVEKIT_KEYS: "devkey: secret"'
    ),

    heading(3, text('Executar')),
    codeBlock('bash', '# Desenvolvimento (hot-reload)\nnpm run dev\n\n# Produção\nnpm run build\nnpm start'),
    paragraph(text('O servidor inicia em '), code('http://localhost:3000'), text(' com a página de teste acessível na raiz.')),

    // === Página de Teste ===
    heading(2, text('Página de Teste')),
    paragraph(text('Acessível em '), code('http://localhost:3000/'), text('. Usa '), code('livekit-client@2'), text(' via CDN para conectar o browser ao room LiveKit.')),
    panel('info',
      paragraph(strong('Fluxo Manual de Teste (SDP Exchange)')),
      paragraph(text('O serviço '), strong('não implementa webhook da Meta'), text(' — o SDP answer é aplicado manualmente na página de teste.'))
    ),
    orderedList(
      listItem(paragraph(text('Digitar o número WhatsApp destino (com código do país, ex: '), code('5511999999999'), text(')'))),
      listItem(paragraph(text('Clicar "Start Call" — gera SDP offer e envia à Meta automaticamente'))),
      listItem(paragraph(text('Aguardar o webhook da Meta com o SDP answer (via ferramentas externas como Graph API Explorer)'))),
      listItem(paragraph(text('Colar o SDP answer no campo e clicar "Apply SDP Answer"'))),
      listItem(paragraph(text('A chamada fica ativa — áudio bidirecional browser ↔ WhatsApp'))),
      listItem(paragraph(text('Clicar "Terminate" para encerrar')))
    ),

    // === Gravação ===
    heading(2, text('Gravação (Opcional)')),
    paragraph(text('Se as variáveis S3 estiverem configuradas ('), code('S3_ACCESS_KEY'), text(', '), code('S3_SECRET'), text(', '), code('S3_BUCKET'), text('), a gravação via LiveKit Egress:')),
    bulletList(
      listItem(paragraph(strong('Inicia automaticamente'), text(' quando o SDP answer é aplicado ('), code('POST /call/:id/answer'), text(')'))),
      listItem(paragraph(strong('Para automaticamente'), text(' quando a chamada é terminada ('), code('POST /call/:id/terminate'), text(')'))),
      listItem(paragraph(text('Formato: '), strong('OGG'), text(' (audio only)'))),
      listItem(paragraph(text('Path S3: '), code('s3://<bucket>/recordings/<callId>/<roomName>-<timestamp>.ogg')))
    ),
    paragraph(text('Se S3 não estiver configurado, o serviço funciona normalmente sem gravação — apenas loga um warning.')),

    // === Detalhes Técnicos ===
    heading(2, text('Detalhes Técnicos do Bridge')),
    heading(3, text('Parâmetros de Áudio')),
    table(
      tableRow(
        tableHeader(paragraph(text('Parâmetro'))),
        tableHeader(paragraph(text('Valor')))
      ),
      tableRow(tableCell(paragraph(text('Sample Rate'))), tableCell(paragraph(text('48.000 Hz')))),
      tableRow(tableCell(paragraph(text('Canais'))), tableCell(paragraph(text('1 (mono)')))),
      tableRow(tableCell(paragraph(text('Frame Size'))), tableCell(paragraph(text('20ms (960 samples)')))),
      tableRow(tableCell(paragraph(text('Codec'))), tableCell(paragraph(text('Opus (payload type 111)')))),
      tableRow(tableCell(paragraph(text('Formato PCM'))), tableCell(paragraph(text('Int16 (signed 16-bit)'))))
    ),

    heading(3, text('RTP')),
    bulletList(
      listItem(paragraph(text('Sequence number: inicializado aleatoriamente, incrementado a cada pacote'))),
      listItem(paragraph(text('Timestamp: inicializado aleatoriamente, incrementado por '), code('samplesPerChannel'), text(' (960 por frame de 20ms)'))),
      listItem(paragraph(text('SSRC: obtido do '), code('transceiver.sender.ssrc'), text(' do werift')))
    ),

    heading(3, text('ICE Gathering')),
    bulletList(
      listItem(paragraph(text('Timeout: 10 segundos'))),
      listItem(paragraph(text('Se timeout, prossegue com candidatos parciais'))),
      listItem(paragraph(text('O SDP offer final inclui os ICE candidates coletados')))
    ),

    heading(3, text('Normalização de SDP')),
    paragraph(text('O SDP answer recebido da Meta pode conter escapes literais ('), code('\\r\\n'), text(' como dois caracteres). A função '), code('normalizeSdp()'), text(' converte para CRLF real e garante terminador '), code('\\r\\n'), text(' no final.')),

    // === Limitações ===
    heading(2, text('Limitações e Notas')),
    panel('warning',
      paragraph(strong('POC — Não adequado para produção sem modificações')),
      bulletList(
        listItem(paragraph(text('Sessões armazenadas '), strong('em memória'), text(' — reiniciar o processo perde chamadas ativas'))),
        listItem(paragraph(code('@livekit/rtc-node'), text(' está em '), strong('Developer Preview'))),
        listItem(paragraph(strong('Sem webhook da Meta'), text(' implementado — SDP answer aplicado manualmente'))),
        listItem(paragraph(text('Sem autenticação nas rotas REST'))),
        listItem(paragraph(text('Sem rate limiting ou circuit breaker'))),
        listItem(paragraph(text('O '), code('werift'), text(' é puro TypeScript (sem deps nativas) — funciona em qualquer OS mas pode ter limitações de performance em produção com alto volume')))
      )
    ),

    // === Repositório ===
    heading(2, text('Repositório')),
    paragraph(text('Código fonte: '), code('voice-livekit'), text(' (repositório privado)')),
    paragraph(text('Scripts npm disponíveis:')),
    table(
      tableRow(
        tableHeader(paragraph(text('Comando'))),
        tableHeader(paragraph(text('Descrição')))
      ),
      tableRow(tableCell(paragraph(code('npm run dev'))), tableCell(paragraph(text('Inicia com hot-reload via tsx watch')))),
      tableRow(tableCell(paragraph(code('npm run build'))), tableCell(paragraph(text('Compila TypeScript para dist/')))),
      tableRow(tableCell(paragraph(code('npm start'))), tableCell(paragraph(text('Executa dist/server.js (produção)'))))
    )
  ]
};

const json = JSON.stringify(adf);
fs.writeFileSync(__dirname + '/adf-output.json', json);
console.log('ADF JSON written to docs/adf-output.json');
console.log('Length:', json.length, 'chars');
