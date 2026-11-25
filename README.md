# YPT for me

NFCタグ（PC貼付シール / ICOCA）× iOSショートカット × Next.js + Supabase で構築する、自分専用の学習・作業トラッカー。

物理トリガーに iPhone をかざすだけで、**iOS の勉強用「集中モード」ON/OFF** と **Supabase への学習セッション打刻（高精度位置情報・気象・大学時限の自動付与付き）** を同時に実行し、公開ダッシュボード（`/`）でのリアルタイム計測・分析と、管理画面（`/admin`）での柔軟なカスタマイズ・補正を行う。

## 技術スタック

- **Frontend / API**: Next.js (App Router / TypeScript) + Tailwind CSS
- **Database / Realtime**: Supabase（専用新規プロジェクト / PostgreSQL / Realtime）
- **External API**: Open-Meteo（緯度・経度から天気・気温・気圧をサーバー側で無料補完）
- **Hosting**: Vercel
- **Client Trigger**: NFC (`NTAG215` / ICOCA) + iOS ショートカット（オフラインキュー同期対応）

## ドキュメント

- [docs/spec.md](docs/spec.md) — 技術仕様書完全版（アーキテクチャ、DB設計、API仕様、オフライン同期、iOSショートカット設計、`/`・`/admin` 画面設計、ディレクトリ構成）

> プロジェクトの目的・背景・生活習慣改革全体での位置づけ・LT登壇構想については、Notion 個人ワークスペースの `🏷️ 01｜YPT for me` ページで管理。

## 開発ロードマップ

- **Phase 1（MVPコア）**
  - 専用 Supabase プロジェクト作成＆マイグレーション（`app_settings`, `categories`, `spots`, `study_sessions`）
  - Next.js API Routes 実装（`status`, `start`, `stop`, `sync` ＋ スポット入れ子判定・気象・大学時限補完）＆ Vercel デプロイ
  - iOS ショートカット構築（オフラインキュー含む）＆ ICOCA / NFC シールでの実戦投入
- **Phase 2（公開ダッシュボード `/` ＆ 管理画面 `/admin`）**
  - `/`（ダーク基調・ライト切替可）：リアルタイムタイマー（LT拡大ボタン付き）、Daily Goal プログレスバー、Streak（30分基準・設定可）、科目別グラフ、履歴一覧
  - `/admin`（パスコード保護）：手動 Start/Stop、要確認セッション補正、履歴 CRUD、カテゴリ管理、スポット管理（未登録座標からの逆引き登録＆過去ログ一括再判定）、アプリ設定（日付境界・時限・目標時間等）
- **Phase 3（Analytics タブ充実＆A4 LT仕上げ）**
  - GitHub草カレンダー、曜日×時間帯ヒートマップ、大学時限別グラフ、スポット別比較、天気・気圧帯別比較

## 想定環境変数

| 変数名 | 用途 |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key（クライアント Realtime 購読用） |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key（API Route からの DB 操作用・サーバー限定） |
| `API_SECRET` | iOS ショートカット / `/admin` 書き込み操作の認証用シークレット |

## 開発・テスト手順

### 1. セットアップ
```bash
cp .env.example .env.local
# .env.local に Supabase キーと API_SECRET を設定
npm install
```

### 2. ローカル起動・画面確認
```bash
npm run dev
# ブラウザで http://localhost:3000 を確認（/admin は Phase 2 で追加予定）
```

### 3. コマンドでの検証
```bash
npm test       # Vitest 単体テスト実行
npm run lint   # ESLint チェック
npm run build  # TypeScript 型チェック＋本番ビルド確認
```

### 4. iPhone 実機（NFC・ショートカット）でのテスト
GitHub リポジトリを Vercel に連携すると、PR ごとに HTTPS の Preview URL が自動発行されます。iOS ショートカットの送信先 URL に Preview URL（または本番 URL）を指定することで、そのまま実機テストが可能です。
