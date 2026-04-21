/**
 * WebSocket サーバー エントリポイント
 *
 * ポート: 3000 (WS_PORT 環境変数で変更可)
 * クライアントからの接続を受け付け、メッセージを room.ts に委譲する。
 */
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { C2SMessage } from '@mahjong/shared';
import { handleMessage, handleDisconnect } from './room.js';

// Railway は PORT を自動注入する。ローカルは WS_PORT → 3000 にフォールバック
const PORT = Number(process.env['PORT'] ?? process.env['WS_PORT'] ?? 3000);

// ─── HTTP サーバー (ヘルスチェック用) ─────────────────
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('mahjong-server OK');
});

// ─── WebSocket サーバー ───────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  console.log(`[ws] client connected (total: ${wss.clients.size})`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as C2SMessage;
      handleMessage(ws, msg);
    } catch {
      // 不正な JSON は無視
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
    console.log(`[ws] client disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[ws] error:', err.message);
  });
});

// ─── 起動 ────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[server] WebSocket server listening on ws://localhost:${PORT}`);
});
