# 麻雀オンライン対戦 — 次回作業メモ

## 現在の状態

**Phase 1〜5 (オフライン)** ✅ 完了  
**Online Phase 1〜3 (monorepo/WS サーバー/ロビー UI)** ✅ 完了  
**Online Phase 4 (デプロイ設定)** ✅ 完了  

ビルドは `npm run build` で問題なく通る状態。

---

## プロジェクト構造（現状）

```
mahjong-browser/
├── package.json            ← workspaces + ルートスクリプト
├── .gitignore
├── public/                 ← 牌画像アセット
└── packages/
    ├── shared/             ← @mahjong/shared（型・ゲームロジック）
    ├── client/             ← Vite + TypeScript フロントエンド
    │   ├── .env.development    VITE_WS_URL=ws://localhost:3000
    │   └── .env.production     VITE_WS_URL=wss://★要変更★
    └── server/             ← Node.js WebSocket サーバー (port 3000)
        └── build.mjs       ← esbuild でバンドル
```

---

## 主要コマンド

| コマンド | 内容 |
|----------|------|
| `npm run dev` | Vite 開発サーバー起動 (http://localhost:5173) |
| `npm run server` | WS サーバー起動 (ws://localhost:3000) |
| `npm run build` | server + client 両方をプロダクションビルド |
| `npm run start:server` | ビルド済みサーバーを起動 (`node dist/index.js`) |

---

## 次回のステップ — デプロイ

### 1. デプロイ先を決める

| サービス | サーバー (Node.js) | クライアント (静的) | 備考 |
|----------|-------------------|---------------------|------|
| **Railway** | ✅ | ❌ | WS サーバーに最適、無料枠あり |
| **Render** | ✅ | ✅ | 無料枠スリープあり |
| **Fly.io** | ✅ | ❌ | 低レイテンシ、設定やや複雑 |
| **Cloudflare Pages** | ❌ | ✅ | 静的のみ、爆速CDN |
| **Vercel** | ❌ | ✅ | 静的のみ |

**推奨構成**: サーバー → Railway, クライアント → Cloudflare Pages

---

### 2. サーバーをデプロイ（例: Railway）

```bash
# Railway CLI でデプロイ
npm install -g @railway/cli
railway login
cd /home/kaiikawa1270/mahjong-browser/packages/server
railway init
railway up
```

Railway の環境変数で `PORT` を設定 → `src/index.ts` で `process.env.PORT` を読む必要あり。

現在の `src/index.ts` のポート部分を確認・修正:
```typescript
// ★ これを確認する
const PORT = Number(process.env.PORT) || 3000;
```

---

### 3. クライアントをデプロイ（例: Cloudflare Pages）

1. `packages/client/.env.production` の `VITE_WS_URL` をサーバーの URL に変更
   ```
   VITE_WS_URL=wss://your-app.up.railway.app
   ```
2. `npm run build` でビルド
3. `packages/client/dist/` を Cloudflare Pages にアップロード（または Git 連携）

---

### 4. 動作確認チェックリスト

- [ ] サーバーが起動し WS 接続を受け付けている
- [ ] クライアントから WS 接続できる（ブラウザの DevTools → Network → WS）
- [ ] ロビーでルームに参加できる
- [ ] 4人揃って対局が始まる
- [ ] 牌の捨て・ツモ・リーチが正常に動作する

---

## 作業再開時のコマンド

```bash
cd /home/kaiikawa1270/mahjong-browser

# 開発確認（ターミナル2つ）
npm run server   # ターミナル1
npm run dev      # ターミナル2 → http://localhost:5173

# ビルド確認
npm run build
```
