# Always Pinned — プロジェクトガイド

タブを自動でピン留めし続ける Chrome 拡張（Manifest V3）。依存パッケージなしのバニラ JS。

- ユーザー向けドキュメント: `README.md` / `README.ja.md`
- AI エージェント向け入口: `./AGENTS.md`（本ファイルと矛盾しないこと）
- 変更履歴: `CHANGELOG.md`

## 構成

```
manifest.json        MV3 マニフェスト（permissions: tabs / storage / contextMenus）
background.js        service worker（ピン留め制御・イベント処理）
storage.js           chrome.storage 集約ヘルパ（session RMW の直列化）
utils.js             共有純粋ヘルパ（新規タブ判定・ピン適格判定）
popup.html / popup.js  ポップアップ UI
scripts/             validate / package / secrets-scan / SNS 投稿補助
.githooks/           pre-commit（secrets-scan layer 2）
.github/workflows/   secrets-scan.yml（layer 3・CI バックストップ）
docs/store/          ストア掲載文・プライバシーポリシー（md のみ追跡）
docs/local/          ローカル作業用（gitignore・コミットしない）
dist/                成果物出力先（gitignore・コミットしない）
```

## Non-negotiables

1. 実データ（認証情報・個人情報・非公開 ID）は絶対にコミットしない。公開対象ファイルを書くときは、個人名・会社名・サーバー名等の固有名詞を一般化する
2. `dist/` 配下の成果物を直接編集してコミットしない。成果物は `scripts/package-webstore.ps1` でのみ生成し、ハッシュは同スクリプトが出力する SHA256SUMS を正とする
3. リリース時は必ず git tag を打ち、tag・zip・SHA256SUMS・CHANGELOG・manifest version を一致させる
4. 公開文面（README・ストア掲載文・プライバシーポリシー）は実装と矛盾させない。特に通信・データ収集に関する主張は、コードの実際の挙動（favicon 取得を含む）に合わせる
5. manifest の権限は最小維持。`host_permissions` は追加しない

## secrets-scan（このリポジトリの配線）

scanner 本体: `scripts/secrets-scan.mjs`（kb 由来 watchlist + 構造 regex）。完全 Coverage には環境変数 `KB_ROOT` / `FAMILY_ROOT` が必要（未設定時は構造 regex のみで動作）。

| 層 | 経路 | コマンド |
|---|---|---|
| layer 2 | pre-commit | `node scripts/secrets-scan.mjs --staged --block`（`.githooks/pre-commit`） |
| layer 2 導入 | hooks 登録 | `pwsh scripts/install-hooks.ps1` または `bash scripts/install-hooks.sh` |
| layer 3 | CI push/PR | `.github/workflows/secrets-scan.yml` → `--all-tracked --block` |
| 手動 sweep | 全 tracked | `node scripts/secrets-scan.mjs --all-tracked --dry-run` |

行単位の免除が必要な場合は `secrets-scan: allow` ディレクティブを使う（乱用禁止・review で確認）。

## 検証コマンド

```
pwsh scripts/validate-extension.ps1    # manifest・icon・syntax・popup 制約チェック
node --check background.js             # 個別 syntax check（validator 内でも実施される）
pwsh scripts/package-webstore.ps1      # zip + SHA256SUMS 生成（リリース時のみ）
```

## 作業上の注意

- `chrome.storage.session` は Chrome 102+ 必須（`minimum_chrome_version` で担保済み）。それ未満の API への引き上げはしない
- popup ↔ service worker を跨ぐ session 書込の競合は `storage.js` のロックでは防げない（context 単位）。新規実装は SW 単一オーナー集約を第一候補にする
- popup の DOM への挿入は `textContent` / `createElement` のみ。favicon は必ず `getSafeFaviconUrl()` を通す
