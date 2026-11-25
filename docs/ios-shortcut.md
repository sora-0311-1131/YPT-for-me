# iOS ショートカット構築ガイド（YPT for me）

NFC タグ（PC パームレスト貼付 `NTAG215` シール / 未使用 ICOCA）に iPhone をかざすだけで、**勉強用「集中モード」の ON/OFF** と **学習ログ打刻（オフラインキュー自動同期付き）** を行うための手順書です。

---

## 1. 事前準備（iPhone 側）

1. **勉強用「集中モード」を作成**
   - `設定` → `集中モード` → `+` → `カスタム` で **「勉強」** を作成。
   - 通知を許可するアプリ・連絡先を最小限に絞り、専用ホーム画面を設定する。
2. **iCloud Drive フォルダ確認**
   - オフラインキュー保存先として `iCloud Drive/Shortcuts/ypt-for-me/` を使用する（初回実行時に自動作成可能）。
3. **接続情報の控え**
   - `BASE_URL`: Vercel の本番 URL（例: `https://ypt-for-me.vercel.app`）
   - `API_SECRET`: `.env.local` / Vercel 環境変数に設定したシークレット

---

## 2. 共通ショートカット「YPT Toggle」の構築

どの NFC タグからも同じショートカットを呼び出し、**ショートカットの入力** として `tag_id`（例: `pc_palmrest`, `icoca_main`）を受け取ります。

### ステップ A: 変数と未送信キューの同期
1. **テキスト**: `BASE_URL` と `API_SECRET` を変数に設定。
2. **ファイルを取得**（エラー時は無視）: `Shortcuts/ypt-for-me/pending_events.json`
3. **もし** `pending_events.json` に値があり空配列 `[]` でない場合:
   - **URL の内容を取得**: `POST {BASE_URL}/api/study/sync`
     - ヘッダ: `Authorization: Bearer {API_SECRET}`, `Content-Type: application/json`
     - 本文: `{"events": <pending_events>}`
   - 通信成功時: レスポンスの `processed_event_ids` に含まれるイベントを除去して `pending_events.json` を上書き保存（すべて処理済みなら `[]`）。

### ステップ B: 現在状態の照会（オンライン分岐）
1. **URL の内容を取得**: `GET {BASE_URL}/api/study/status`
   - ヘッダ: `Authorization: Bearer {API_SECRET}`
2. **通信成功時**:
   - `is_active` が **`false`（チェックイン：勉強開始）** の場合:
     1. レスポンスの `categories` を `Shortcuts/ypt-for-me/categories_cache.json` にキャッシュ保存。
     2. **リストから選択** で `🔄 前回の続き（{last_category.name}）` を先頭にしたカテゴリ一覧を表示（**1タップで即確定・メモ入力なし**）。
     3. **現在の位置情報を取得**（精度: **10メートル** または **最高**）。
     4. UUID を生成して `client_event_id` に設定（iOS ショートカットの `テキスト` / `UUID` またはランダム文字列）。
     5. **URL の内容を取得**: `POST {BASE_URL}/api/study/start`
        ```json
        {
          "client_event_id": "<uuid>",
          "category_id": "<選択したカテゴリID>",
          "tag_id": "<ショートカットの入力>",
          "latitude": 35.0262,
          "longitude": 135.7808
        }
        ```
     6. **集中モードを設定**: 「勉強」を **オン**（オフにするまで）。
   - `is_active` が **`true`（チェックアウト：勉強終了）** の場合:
     1. メニューを出さず即座に **URL の内容を取得**: `POST {BASE_URL}/api/study/stop`
        ```json
        {
          "client_event_id": "<uuid>"
        }
        ```
     2. **集中モードを設定**: 「勉強」を **オフ**。
     3. **通知を表示**: `お疲れ様！{duration_min}分集中しました（今日合計 {today_total_min}分）`。

### ステップ C: オフライン / 通信エラー時のフォールバック
`GET /api/study/status` や `POST /api/study/start|stop` が通信失敗した場合：
1. ローカルの現在の集中モード（`現在の集中モードを取得`）を確認し、**「勉強」がオフなら `start`、オンなら `stop`** と判定。
2. `start` の場合は `categories_cache.json` からカテゴリを選択し、高精度 GPS を取得。
3. `{ "client_event_id": "<uuid>", "type": "start|stop", "category_id": "...", "tag_id": "...", "latitude": ..., "longitude": ..., "occurred_at": "<現在ISO8601時刻>" }` を `pending_events.json` の配列末尾へ追記保存。
4. 勉強用 **「集中モード」** をローカルで ON / OFF 切り替え。
5. **通知を表示**: `オフライン保存しました（次回タッチ時に自動同期されます）`。

---

## 3. NFC オートメーション登録

1. `ショートカット` アプリ → `オートメーション` → `+` → **`NFC`** を選択。
2. `スキャン` を押し、PC パームレストに貼った NFC シール（または ICOCA）を iPhone 上部にかざして名前を付ける（例: `PCパームレスト`）。
3. **「即座に実行」を ON**、「実行時に通知」を **OFF** にする。
4. アクションに以下 2 つを配置:
   - **テキスト**: `pc_palmrest`（ICOCA なら `icoca_main`）
   - **ショートカットを実行**: `YPT Toggle`（入力に上記テキストを渡す）

---

## 4. 運用のコツ・注意点

- **画面点灯ルール**: iOS の仕様上、画面が真っ暗なスリープ状態では NFC リーダーが停止します。チェックアウト時はサイドボタンを1回押してロック画面を光らせるだけで（**ロック解除不要**）、そのままタッチ一発で終了します。
- **金属筐体への貼付**: アルミ筐体（MacBook や Surface 金属部）に直接貼る場合は **耐金属（アンチメタル）仕様の NTAG215 シール** を使用してください。Surface タイプカバーの布・樹脂部分であれば通常シールでも反応します。
