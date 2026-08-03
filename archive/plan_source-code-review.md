# [完了] Always Pinned ソースコード全体改善調査

> 最終更新: 2026-05-25(月) 19:25:48

## context配分

| C | 種別 | 内容 | 並列 |
|---|---|---|---|
| C1 | fix | `windowOverrides` の Read-Modify-Write レース解消（既存 plan は `manuallyUnpinned` のみ対象） | — |
| C2 | fix | 一時データ（`windowOverrides` / `manuallyUnpinned`）の `chrome.storage.session` 移行と `onStartup` 手動クリア廃止 | — |
| C3 | plan | コード品質改善（`getSettings` 共通化・`buildTabList` デッドコード・`parseInt` radix・エラーハンドリング・`storage.onChanged` 冗長発火） | [並列OK with C4] |
| C4 | plan | MV3 最適化・UX・アクセシビリティ（`onUpdated` ガード節・badge のウィンドウ反映・aria/alt/title） | [並列OK with C3] |
| C5 | plan | 開発基盤整備（ESLint + 単体テスト + JSDoc 型チェック） | [並列OK with C3, C4] |

実行順序: `C1 → C2 → (C3, C4, C5)`

> 実装メモ（2026-05-25）: C1・C2 を実装完了（`storage.js` 集約 + module 化）。あわせて方針1の `getSettings` 共通化（Q1）は module 化の必然として解消済み。C4 のうち **P2（badge のウィンドウ反映）のみ実装済み**（タブ単位 `setBadgeText` + `onActivated`/`onFocusChanged`）。

> 実装メモ（2026-05-25 19:25 追記）: **C3 残り（Q2・Q3・Q4・Q5）と C4 残り（P1・A1・A2・A3）を実装完了**。内訳:
> - Q2: `buildTabList` で `manuallyUnpinned` を実使用し、手動解除タブに `.manually-unpinned`（取り消し線）＋ツールチップ注記を付与（デッドコード解消＋UX 向上）
> - Q3: `parseInt(btn.dataset.tabId, 10)` に radix 指定
> - Q4: 各 `chrome.tabs.update(...).catch(() => {})` と `setAccessLevel().catch(() => {})` を `console.debug('[Always Pinned] ...', e)` に変更しデバッグ可能化
> - Q5: C2 の `session` 移行により `local` の `onChanged` リスナー内に `local.set` が残らず**自然解消済み**（追加ガード不要と確認）
> - P1: `onUpdated` 先頭に `if (changeInfo.pinned === undefined && !changeInfo.url) return;` ガード節を追加
> - A1: 各トグル `<input>` に `data-i18n-aria` ＋静的 `aria-label` を付与し、`applyI18n` で言語に応じて aria-label を更新
> - A2: favicon `<img>` に `alt=''` を付与
> - A3: close ボタンに `title` / `aria-label`（i18n: `closeTab`）を付与
>
> **C5 はユーザー判断で見送り**（2026-05-25）。npm エコシステム導入の副作用が大きいため別途判断とし、T1/T2/T3 は未着手のまま残す。本書のコード改善スコープ（C1〜C4）は完了。

> C1（`windowOverrides` レース修正）と C2（`session` 移行）はどちらもストレージ層を触るため、C2 着手時に C1 の修正コードを `session` API へ移植する想定（後述「方針」参照）。

---

## 概要

拡張機能 Always Pinned（v0.1.1, MV3）の全ソース（`background.js` 123 行 / `popup.js` 214 行 / `popup.html` 224 行 / `manifest.json` / `scripts/package-webstore.ps1` / `create_icons.py`）を精読し、改善余地を洗い出した。

コード規模は小さく全体品質は高い。ただしストレージの並行性に起因する**実バグ**と、MV3 のライフサイクルを活かしきれていない**設計上の改善余地**、および**コード品質・保守性**の改善点が存在する。

本書のスコープ:

- ストレージ並行性バグの修正（`windowOverrides`）
- 一時データの `storage.session` 移行による設計簡素化
- コード品質（重複・デッドコード・エラーハンドリング）
- MV3 最適化・UX・アクセシビリティ
- 開発基盤（lint / test / 型チェック）

スコープ外: 機能追加、UI デザイン刷新、ストア公開作業（`docs/local/research_publish.md` 等が別途扱う）。

## 既存 plan との関係（重複回避）

`docs/local/plan_unpin-flow-fixes.md` が「Unpin All フロー」の 3 バグを既に計画化している。本書はそれと**重複しない全体観点**を扱う。重複領域は以下のとおり整理する。

| 項目 | 既存 plan_unpin-flow-fixes.md | 本書 plan_source-code-review.md |
|---|---|---|
| `manuallyUnpinned` の RMW レース | **C3 で対象**（popup の Unpin All 経路中心） | 扱わない（既存に委譲） |
| popup「このウィンドウ」トグルの尊重ロジック不整合 | **C2 で対象** | 扱わない（既存に委譲） |
| `onUpdated` の Unpin All 再ピン抑止 | **C1 で対象** | 扱わない（既存に委譲） |
| `windowOverrides` の RMW レース | 対象外 | **本書 C1**（新規） |
| `storage.session` 移行（包括） | C1/C3 で「検討」レベルの言及のみ | **本書 C2**（包括設計として新規） |
| `getSettings` 重複・デッドコード・lint 等 | 対象外 | **本書 C3〜C5**（新規） |

> 既存 plan の C3 が `manuallyUnpinned` のレースを直す一方、`windowOverrides` の同種レースは未着手のまま残る。本書 C1 はそのギャップを埋める。両者は同じ「ストレージ集約ヘルパ」方針（後述）に収束させると重複作業を避けられる。

## 現状と問題（重大度別一覧）

| # | 重大度 | 箇所 | 内容 | 対応 C |
|---|---|---|---|---|
| B1 | 🔴 高 | `popup.js:162-164,192-193` / `background.js:84-89` | `windowOverrides` の Read-Modify-Write レース（lost update） | C1 |
| D1 | 🟠 中 | `background.js:97-101` 他 | 一時データを `storage.local` + `onStartup` 手動クリアで管理（`storage.session` が最適） | C2 |
| Q1 | 🟡 低 | `background.js:1-9` / `popup.js:60-68` | `getSettings` の完全重複定義（デフォルト値乖離リスク） | C3 |
| Q2 | 🟡 低 | `popup.js:70,141` | `buildTabList` の引数 `manuallyUnpinned` が未使用（デッドコード） | C3 |
| Q3 | 🟡 低 | `popup.js:156` | `parseInt(btn.dataset.tabId)` の radix 未指定 | C3 |
| Q4 | 🟡 低 | 全域 | `.catch(() => {})` によるエラー全握り潰し（デバッグ困難） | C3 |
| Q5 | 🟡 低 | `background.js:103-120` | `storage.onChanged` リスナー内の `set` による冗長な自己再発火 | C3 |
| P1 | 🔵 低 | `background.js:52` | `tabs.onUpdated` のガード節が分散（フィルタ非対応 API のため先頭で早期 return すべき） | C4 |
| P2 | 🔵 中 | `background.js:38-42` | badge がグローバル `enabled` のみ反映し、ウィンドウ override を無視 | C4 |
| A1 | 🟣 低 | `popup.html:175-178` 他 | トグル `<input>` に `aria-label` / ラベル関連付けなし | C4 |
| A2 | 🟣 低 | `popup.js:83-88` | favicon `<img>` に `alt` なし | C4 |
| A3 | 🟣 低 | `popup.js:101-105` | close ボタンに `title` / `aria-label` なし | C4 |
| T1 | ⚪ — | リポジトリ全体 | 単体テストなし | C5 |
| T2 | ⚪ — | リポジトリ全体 | ESLint / Prettier なし | C5 |
| T3 | ⚪ — | リポジトリ全体 | 型チェック（JSDoc + `tsc --checkJs`）なし | C5 |

## 方針

3 点を共通の設計判断とする。

1. **ストレージアクセスの集約**: `getSettings` / 各種 `set` を 1 ファイル（例 `storage.js`）に集約し、`background.js` と `popup.js` の両方から ES module として import する。`manifest.json` の `background.type` を `"module"` にし、`popup.html` の `<script type="module">` 化で対応可能。これにより Q1（重複）と B1/`manuallyUnpinned` レース（既存 plan）を**同じ修正点**で解消できる。
2. **永続設定と一時状態の分離**: `enabled` / `skipNewTab` / `respectManualUnpin` は永続（`storage.local`）。`windowOverrides` / `manuallyUnpinned` は「ブラウザ再起動でリセットしたい一時状態」なので `storage.session` へ移す（C2）。
3. **後方互換**: 既存ユーザーの `storage.local` に残る `windowOverrides` / `manuallyUnpinned` は、移行時に一度だけ読み捨てる（マイグレーション不要だが旧キーの掃除を 1 回行うと綺麗）。永続 3 設定のスキーマは変更しない。

> 採用しない案: メッセージパッシング（`chrome.runtime.sendMessage`）で popup → background にピン処理を一元化する案。拡張サイズが極小で、storage 直叩きの方が単純なため見送り（既存 plan も同じ判断）。ただし将来ロジックが増えるなら再検討。

---

## C1: `windowOverrides` の Read-Modify-Write レース解消

### 作業内容

`windowOverrides` オブジェクトを「読み込み → 1 キー変更 → 全体 `set`」するパターンが 3 箇所あり、並行実行で lost update が起きる。

- `popup.js:162-164` — 「このウィンドウ」トグル変更時
- `popup.js:192-193` — リセットボタン（override 削除）
- `background.js:84-89` — `windows.onRemoved` で閉じたウィンドウの override を削除

具体シナリオ: ウィンドウ A を閉じた瞬間（`windows.onRemoved` が A の override 削除を `set`）に、ユーザーが別ウィンドウ B の popup でトグルを変更（B の override 追加を `set`）すると、両者が同じ古い `windowOverrides` を読んで上書きし、片方の変更が消える。`chrome.storage` には compare-and-swap / ロックが無いため、これは公式に認知された既知の制約（[chromium-extensions: Concurrent update of chrome.storage.local](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU)）。

修正方針:

- ストレージ集約ヘルパ（方針 1）に `setWindowOverride(windowId, value)` / `removeWindowOverride(windowId)` / `deleteOverrideOnWindowClose(windowId)` のような「最小差分 set」関数を置き、各呼び出し元はそれを使う。
- ヘルパ内で「直近の get → 当該キーのみ変更 → set」を**直列化**する（モジュールスコープの Promise チェーンで mutex 化、または `navigator.locks` API を使用）。
- `windowId` は数値だがオブジェクトキーとして文字列化される点に留意（現状の `in` / ブラケットアクセスは動作しているが、ヘルパ内で `String(windowId)` に正規化すると一貫性が増す）。

### 変更予定ファイル

- `popup.js` — トグル / リセットの直接 `set` をヘルパ呼び出しへ
- `background.js` — `windows.onRemoved` の直接 `set` をヘルパ呼び出しへ
- （新規）`storage.js` — 集約ヘルパ（方針 1 と共通）

### 完了条件

- 「ウィンドウを閉じる」と「別ウィンドウでトグル操作」を素早く連続実行しても、両方の変更が `windowOverrides` に正しく反映される
- 既存 plan_unpin-flow-fixes.md の `manuallyUnpinned` 直列化と同一のロック機構を共有している

---

## C2: 一時データの `chrome.storage.session` 移行

### 作業内容

`windowOverrides` と `manuallyUnpinned` は「ブラウザ再起動でリセットしたい一時状態」であり、現状は `storage.local`（ディスク永続）に保存し、`background.js:97-101` の `onStartup` で手動クリアしている。

`chrome.storage.session` は **in-memory で、拡張のリロード・更新・ブラウザ再起動時に自動クリアされる一方、Service Worker の再起動を跨いでは保持される**（[chrome.storage 公式](https://developer.chrome.com/docs/extensions/reference/api/storage) / [SW ライフサイクル](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)）。この特性は両データの要件と完全に一致する。

移行内容:

- `windowOverrides` / `manuallyUnpinned` の読み書きを `chrome.storage.session` に変更
- popup からも読むため `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` を `onInstalled` / `onStartup` で設定（既定では SW からのみアクセス可）
- `background.js:97-101` の `onStartup` 手動クリア（`windowOverrides: {}, manuallyUnpinned: []` の `set`）は**不要になり削除**できる（session が自動で空になる）
- 旧 `storage.local` の同名キーは移行後に一度だけ `remove` して掃除（任意）

永続 3 設定（`enabled` / `skipNewTab` / `respectManualUnpin`）は `storage.local` のまま。

### 変更予定ファイル

- `storage.js`（集約ヘルパ）— area を `local` / `session` で振り分け
- `background.js` — `onStartup` の手動クリア削除、`setAccessLevel` 追加
- `popup.js` — session 読み書きへ追従

### 完了条件

- ブラウザ再起動後に `windowOverrides` / `manuallyUnpinned` が空になる（従来挙動を維持）
- SW がアイドルで停止 → 再起動しても両データが保持される（session の特性で保証）
- popup から session のデータを読めている（access level 設定済み）
- `onStartup` の手動クリアコードが削除されている

---

## C3: コード品質改善

### 作業内容

- **Q1 `getSettings` 重複**: `background.js:1-9` と `popup.js:60-68` の同一定義を `storage.js` に一本化（方針 1）。デフォルト値の二重管理を解消。
- **Q2 `buildTabList` デッドコード**: `popup.js:70` の第 2 引数 `manuallyUnpinned` は関数内未使用。`popup.js:141` の呼び出しでも渡しているだけ。**(a)** 引数を削除する、または **(b)** 本来の意図（手動解除タブを視覚的に区別）を実装する、のいずれか。`popup.html:129` に `.tab-title.unpinned` スタイルが既にあるので、(b) として `manuallyUnpinned.includes(tab.id)` のタブに区別表示を付けると UX 向上＋デッドコード解消を両立できる（第一候補）。
- **Q3 `parseInt` radix**: `popup.js:156` を `parseInt(btn.dataset.tabId, 10)` か `Number(btn.dataset.tabId)` に。
- **Q4 エラー握り潰し**: `chrome.tabs.update(...).catch(() => {})` が多数（`background.js:29,49,61,71` / `popup.js:167,204,211` 等）。タブが閉じる直前など正当に失敗するケースがあるため全 throw は不適切だが、`catch(e => console.debug('pin failed', e))` 程度に変えてデバッグ可能にする。意図的無視ならその旨コメント。
- **Q5 `storage.onChanged` 冗長発火**: `background.js:103-120` のリスナー内で `chrome.storage.local.set` を呼ぶため `onChanged` が再帰的に再発火する（例: `enabled→true` で `manuallyUnpinned:[]` を set → 再発火。他分岐に当たらず無害だが無駄）。C2 で `manuallyUnpinned` が session に移れば、`local` の `onChanged` は発火しなくなり自然に解消する部分が多い。残る冗長分はガード（変更前後の値比較）で抑制。

### 変更予定ファイル

- `storage.js`（新規・Q1）
- `popup.js`（Q2, Q3）
- `background.js`（Q4, Q5）
- `popup.html`（Q2 の (b) 採用時に区別表示の微調整が必要なら）

### 完了条件

- `getSettings` の定義が 1 箇所のみ
- `buildTabList` に未使用引数が無い（または手動解除タブが視覚的に区別される）
- `parseInt` に radix 指定あり
- ピン操作失敗時に開発者がログを追える
- `storage.onChanged` の不要な自己再発火が無い

---

## C4: MV3 最適化・UX・アクセシビリティ

### 作業内容

- **P1 `onUpdated` ガード節**: `chrome.tabs.onUpdated`（`background.js:52`）は `tabs` API の制約上イベントフィルタを付けられず、全タブの全更新（favicon / title / status 変化含む）で発火する。現状は分岐内で `getSettings` を呼ぶため無駄なストレージ呼び出しは抑えられているが、リスナー先頭に `if (changeInfo.pinned === undefined && !changeInfo.url) return;` のガード節を置くと意図が明確かつ更に軽量になる。 <!-- secrets-scan: allow -->
- **P2 badge のウィンドウ反映**: `updateBadge`（`background.js:38-42`）はグローバル `enabled` のみで `OFF` を出す。ウィンドウ override で OFF にしても badge が変わらず実状態とズレる。MV3 の `action` badge は**タブ単位**設定（`setBadgeText({ text, tabId })`）が可能なので、`tabs.onActivated` / `windows.onFocusChanged` でアクティブタブの所属ウィンドウの実効状態を計算して badge を更新する。ウィンドウ単位 API は無いためタブ単位で近似する。実装コストとのトレードオフで優先度は中。
- **A1 トグルの a11y**: `popup.html` の各 `<input type="checkbox">` は隣接 `<span>` ラベルと視覚的に対応するだけで関連付けが弱い。`aria-label` 付与、または `<label for>` / `id` の明示的関連付け。
- **A2 favicon alt**: `popup.js:83-88` の `<img>` に `alt=""`（装飾画像扱い）を付与。
- **A3 close ボタン**: `popup.js:101-105` の `×` ボタンに `title` / `aria-label`（例「タブを閉じる / Close tab」、i18n 対応）を付与。

### 変更予定ファイル

- `background.js`（P1, P2）
- `popup.html`（A1）
- `popup.js`（A2, A3, i18n 文言追加）

### 完了条件

- `onUpdated` 先頭にガード節があり、ピン/URL 変化以外で早期 return する
- ウィンドウ override で OFF にしたウィンドウのタブで badge が `OFF` を示す（P2 採用時）
- スクリーンリーダーでトグル・favicon・close ボタンの役割が読み上げられる

---

## C5: 開発基盤整備

### 作業内容

- **T1 単体テスト**: 純粋ロジック（`isNewTabUrl`、override 解決ロジック、`manuallyUnpinned` のマージ、`storage.js` の直列化）は `chrome` API をモックすれば Vitest / Jest で単体テスト可能。最小構成で `isNewTabUrl` と override 解決から着手。
- **T2 ESLint + Prettier**: `eslint` + `eslint-plugin-no-unsanitized`（`innerHTML` 監視）+ Chrome 拡張向け globals 設定。`package-webstore.ps1` の梱包前に lint を走らせる CI も検討。
- **T3 型チェック**: `tsconfig.json` で `checkJs: true` + 各ファイル先頭に `// @ts-check`、`@types/chrome` 導入で、ビルドを増やさずに型安全性を得る。

### 変更予定ファイル

- `package.json`（新規）/ `tsconfig.json`（新規）/ `.eslintrc`（新規）
- `tests/`（新規）

### 完了条件

- `npm test` で純粋ロジックのテストが緑
- `npm run lint` がパス
- `tsc --noEmit` で型エラー 0

---

## 確認済み・問題なしと判断した項目

調査の網羅性のため、検討したが**対応不要**と判断した点も記録する。

- **XSS**: `popup.js:71,73` の `innerHTML` 代入は静的文字列 + 自前定義の `t.noTabs` のみで、外部入力を含まない。タブのタイトル/URL は `textContent`（`:96-97`）経由で安全に表示。favicon は `img.src` であり実行されない。現状 XSS リスクなし。ただし T2 の lint で将来の混入を防ぐ価値はある。
- **権限の妥当性**: `manifest.json` の `tabs` 権限は popup のタブ一覧表示（`url` / `title` / `favIconUrl` 読み取り）と `isNewTabUrl` 判定に必要で、`activeTab` では代替不可。`storage` も必須。過剰権限なし。
- **`tab.id` の再利用**: Chrome のタブ ID はセッション内で一意。`onRemoved`（`background.js:76-82`）で `manuallyUnpinned` から掃除しており、ID 再利用による誤判定リスクは最小。
- **`onStartup` の override クリア**: ウィンドウ ID がブラウザ再起動で変わるため、`windowOverrides` を再起動時にクリアするのは正しい設計（README にも明記）。C2 はこの「正しい挙動」を session で自動化するもので、挙動自体は維持する。
- **`scripts/package-webstore.ps1`**: 梱包対象ファイルの存在チェック・SHA256 出力があり堅牢。C5 の lint を梱包前段に挟む以外は変更不要。
- **`create_icons.py`**: 1 回実行用の生成スクリプト。標準ライブラリのみで完結しており問題なし。

## 関連情報

- 既存計画: `docs/local/plan_unpin-flow-fixes.md`（`manuallyUnpinned` レース / popup トグル尊重 / Unpin All 再ピンを担当）
- ストレージ並行性の公式見解: [chromium-extensions: Concurrent update of chrome.storage.local](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU)
- `storage.session` / SW ライフサイクル: [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) / [The extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- 着手時はまず C1（`windowOverrides` レース）と C2（session 移行）をセットで実装し、`storage.js` 集約ヘルパを既存 plan_unpin-flow-fixes.md の `manuallyUnpinned` 直列化と共有させると重複作業を避けられる
