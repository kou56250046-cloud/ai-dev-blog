---
title: "Claude Code Subagent完全ガイド — 仕組み・活用パターン・カスタム作成まで"
date: 2026-04-03
category: blog
tags: [claude-code, architecture, tips, setup]
summary: "Subagentとは何か・Agent Teamとの違い・Worktree並列実行・カスタムSubagent作成まで、Claude Code Subagentを実務で使いこなすための完全ガイド。"
draft: false
---

## はじめに

「Claude Codeに複数のタスクを同時に任せたい」「専門分野ごとに動きを変えたい」

そのニーズに応えるのが **Subagent（サブエージェント）** です。

通常のClaude Codeは1つの作業を順番にこなします。Subagentを使うと、**コードレビュー・テスト実行・ドキュメント更新を並列で走らせる**ことができます。さらに、特定の専門領域に特化したカスタムSubagentを作れば、「このタスクはセキュリティの専門家として判断してほしい」という要求にも対応できます。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ SubagentとAgent Teamの違いを説明できる
- ✅ Subagentを使って複数タスクを並列実行できる
- ✅ Worktree分離による安全な並列開発ができる
- ✅ 専門分野に特化したカスタムSubagentを自作できる

**学ぶ意義**: Subagentを使いこなすことで、Claude Codeが「1人のアシスタント」から「チームとして動く複数の専門家」に変わる。大規模なリファクタリングやレビューを、安全に・高速に・並列で実行できる。

---

## 時間がない人のための要約

1. **SubagentはAIの「分業システム」** — メインのClaudeが子タスクを別エージェントに委託し、結果だけ受け取る。メインの会話コンテキストを汚さずに複雑な作業を処理できる
2. **Agent TeamとSubagentは用途が違う** — 独立した単発タスクはSubagent、エージェント同士が連携・議論する複雑なプロジェクトはAgent Team
3. **カスタムSubagentは`.claude/agents/`にMarkdownを置くだけ** — `name`・`description`・`tools`を定義すれば即使える

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Claude Code | 最新版 |
| Git | Worktree機能を使う場合は必須 |
| プロジェクト | `.claude/` ディレクトリが存在すること |

---

## Subagentとは何か

### 基本的な仕組み

Subagentは**メインのClaude Codeセッションから子タスクを委託される独立したエージェント**です。

```
通常の Claude Code（Subagentなし）:
  メインClaude → タスクA → タスクB → タスクC（順番に実行）

Subagentあり:
  メインClaude（オーケストレーター）
    ├→ Subagent-1: タスクA（並列）
    ├→ Subagent-2: タスクB（並列）
    └→ Subagent-3: タスクC（並列）
  ↓
  全Subagentの結果を集約して返す
```

公式ドキュメントでは以下のように説明されています：

> *「Subagentは、現在のセッション内で動作し、結果をメインのコンテキストに返す。複雑なタスクをオフロードしながら、ワークスペースをクリーンに保つのに有用」*

### Subagent vs Agent Team — 使い分けの基準

この2つは「並列で動く」という点は同じですが、設計思想が異なります。

| 比較項目 | Subagent | Agent Team |
|---|---|---|
| **動作場所** | 現在のセッション内 | 独立したClaudeセッション |
| **エージェント間の通信** | なし（独立して動く） | あり（チームメンバーが互いに通信） |
| **向いているケース** | 独立した単発タスク | 連携・議論が必要な複雑なプロジェクト |
| **コンテキスト** | メインに結果のみ返す | 全員がタスクリストを共有 |
| **典型的な使い方** | ファイル調査・検証・レビュー | 並行機能開発・競合仮説の研究 |

```
Subagentが向いている場面:
  ✅ 「このファイルを調査して結果だけ教えて」
  ✅ 「PR #42 のセキュリティチェックをしておいて」
  ✅ 「3つのディレクトリを同時にリファクタして」

Agent Teamが向いている場面:
  ✅ 「3人のエージェントがそれぞれ別の実装案を出して議論して」
  ✅ 「フロント・バック・DB担当が協調して新機能を開発して」
  ✅ 「コンテキスト上限に達したSubagentを次のステップに移行したい」
```

---

## 手順

### 1. 基本的なSubagentの起動

Claude Codeの会話内で、Taskツールを通じてSubagentを呼び出せます。

```bash
# 明示的にSubagentに調査を委託する指示例
claude -- "以下を並列で実行して：
1. src/auth/ ディレクトリのセキュリティ問題を調査
2. src/api/ ディレクトリのパフォーマンス問題を調査
3. テストカバレッジが50%以下のファイルを一覧化
それぞれの結果をまとめてレポートして"
```

### 2. Worktreeを使った並列・安全な実行

SubagentはGitのWorktree機能を使って**互いに干渉しない独立した環境**で動けます。

```
通常の並列実行（干渉リスクあり）:
  Subagent-1 が src/utils/date.ts を編集中
  Subagent-2 も src/utils/date.ts を編集 → コンフリクト！

Worktree分離（安全）:
  Subagent-1 → worktree-1/（独立したコピー）で作業
  Subagent-2 → worktree-2/（独立したコピー）で作業
  → 互いに干渉しない
  → 変更がなければ自動でクリーンアップ
```

公式ドキュメントより：

> *「Worktreeで設定されたSubagentは、それぞれ専用のWorktreeが割り当てられる。変更がなければ完了時に自動でクリーンアップされる」*

カスタムSubagentのフロントマターでWorktree分離を有効にする例：

```markdown
---
name: safe-refactorer
description: 安全にリファクタリングを実行するエージェント
isolation: worktree   ← これでWorktree分離が有効になる
tools: Read, Edit, Bash
---
```

### 3. 複数Subagentの並列実行パターン

**PR レビューの並列実行（実践例）：**

```bash
claude -- "PR #55 を以下の観点で並列レビューして：

Subagent-1（コード品質）:
  - 可読性・命名規則・重複コード
  - CLAUDE.mdのコーディング規約への準拠確認

Subagent-2（セキュリティ）:
  - OWASP Top 10の観点でチェック
  - SQLインジェクション・XSS・認証漏れ

Subagent-3（テスト）:
  - テストが存在するか
  - カバレッジが80%以上か
  - エッジケースが網羅されているか

それぞれの結果をPriority（Critical/Major/Minor）付きでまとめて"
```

**大規模リファクタリングの並列実行：**

```bash
claude -- "以下を同時並列で実行して（各Subagentは独立して動かして）：

Subagent-1: src/components/ 以下のTSX→TypeScript移行
Subagent-2: src/utils/ 以下のrequire→ESModule移行
Subagent-3: src/api/ 以下のコールバック→async/await移行

各Subagentは変更後にテストを実行して通ることを確認すること。
完了したら変更ファイル数と結果を報告して"
```

---

## カスタムSubagentの作り方

### ファイルの配置場所

```
プロジェクト全体で使うSubagent（リポジトリに含める）:
  .claude/agents/subagent-name.md

自分だけが使うSubagent（グローバル設定）:
  ~/.claude/agents/subagent-name.md
```

### Subagent定義ファイルの構造

```markdown
---
name: subagent-name          # ハイフン区切り小文字（必須）
description: このエージェントをいつ使うか・何をするかの説明（必須）
category: development-architecture  # カテゴリ（任意）
tools: Read, Write, Edit, Bash      # 使用可能なツール（省略時は全ツール）
---

あなたは[専門分野]の専門家です。

呼び出されたとき:
1. 要件と制約を分析する
2. ベストプラクティスに従って実行する
3. 結果と判断根拠を明確に報告する

...（以降にペルソナと行動規範を記述）
```

### 実践例1: バックエンドアーキテクト Subagent

```markdown
---
name: backend-architect
description: RESTful API設計・マイクロサービス境界・DBスキーマを設計する。
  新規バックエンドサービス・APIを作るときに積極的に使う。
category: development-architecture
tools: Read, Write, Edit
---

あなたはスケーラブルなAPI設計とマイクロサービスに特化した
バックエンドシステムアーキテクトです。

呼び出されたとき：
1. 要件を分析してサービス境界を明確に定義する
2. コントラクトファーストでAPIを設計する
3. スケーリング要件を考慮したDBスキーマを作成する
4. 根拠つきで技術スタックを推奨する
5. ボトルネックと緩和策を特定する

必ず提供するもの：
- APIエンドポイント定義（リクエスト・レスポンス例つき）
- サービスアーキテクチャ図（ASCII）
- 主要なリレーションとインデックスを含むDBスキーマ
- キャッシュ戦略とパフォーマンス最適化方針
- 基本的なセキュリティパターン（認証・レートリミット）

理論より実践的な実装を優先すること。
```

### 実践例2: セキュリティ監査 Subagent

```markdown
---
name: security-auditor
description: コードのセキュリティ脆弱性を監査する。
  PRレビュー・本番デプロイ前・定期監査に使う。
category: quality-security
tools: Read, Grep, Bash
---

あなたはOWASP Top 10・ペネトレーションテスト・セキュアコーディングの
専門家であるセキュリティ監査官です。

監査時に確認する項目：

**OWASP Top 10:**
- [ ] SQLインジェクション（ユーザー入力のエスケープ）
- [ ] XSS（出力のサニタイズ）
- [ ] 認証の不備（トークン・セッション管理）
- [ ] センシティブデータの露出（ログへの出力・レスポンスへの含有）
- [ ] アクセス制御の不備（RLS・認可チェック）

**コード固有の確認:**
- APIキー・シークレットのハードコードがないか
- 環境変数が適切に管理されているか
- 依存パッケージに既知の脆弱性がないか（`npm audit`）

レポート形式：
- Critical（即時修正必須）
- High（今週中に修正）
- Medium（次のスプリントで修正）
- Low（バックログに追加）

各項目に「問題のコード」「修正案」「理由」を記載すること。
```

### 実践例3: このブログ専用の記事レビュー Subagent

```markdown
---
name: blog-reviewer
description: ブログ記事のMarkdownファイルをレビューする。
  記事を書いた後・GitHubにpushする前に使う。
category: specialized-domains
tools: Read
---

あなたはAI駆動開発の技術ブログの編集者です。

レビュー時の確認項目：

**フロントマター（必須）:**
- [ ] title・date・category・tags・summary・draft が揃っているか
- [ ] summary が100文字以内か
- [ ] tags が小文字ケバブケースか（例: claude-code, next-js）

**構成（CLAUDE.mdのテンプレート準拠）:**
- [ ] はじめに → ゴール → 要約 → 前提条件 → 手順 → 用語解説 → まとめ の順か
- [ ] 各手順にコードブロック（```bash または ```typescript）があるか
- [ ] 用語解説がテーブル形式か

**品質:**
- [ ] 再現性があるか（コマンドをコピペすれば動くか）
- [ ] 非エンジニアが理解できる説明になっているか
- [ ] まとめに「次のステップ」が含まれているか

問題点をリストアップして、修正案を提示すること。
```

### Subagentの呼び出し方

```bash
# 明示的に指定する（エージェント名を@で指定）
"@agent-security-auditor でPR #42 をチェックして"

# 自然言語で委託する（Claude が適切なSubagentを自動選択）
"このコードのセキュリティ問題を専門家の観点でチェックして"
```

---

## 実務での活用パターン

### パターン1: CI/CDへの統合

GitHub Actionsでデプロイ前に自動的にSubagentを走らせる：

```yaml
# .github/workflows/pre-deploy-check.yml
name: デプロイ前セキュリティチェック
on:
  pull_request:
    branches: [main]

jobs:
  security-check:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            security-auditor Subagentを使って、
            このPRの変更ファイルをセキュリティ観点でレビューして。
            Criticalな問題があればPRにコメントして。
```

### パターン2: 複数ファイルの一括調査

```bash
claude -- "以下を並列で調査して結果をまとめて：

Subagent-1: src/ 以下でanyを使っているTypeScriptファイルを全て列挙
Subagent-2: テストファイルが存在しないコンポーネントを列挙
Subagent-3: 循環依存しているモジュールを検出
Subagent-4: package.jsonの脆弱なパッケージを npm audit で確認

各調査結果を優先度付きで1つのレポートにまとめて"
```

### パターン3: 専門家チームによるアーキテクチャレビュー

```bash
claude -- "新しいチャット機能の設計案（docs/chat-design.md）を
以下の専門家の観点で並列レビューして：

Subagent-1（backend-architect）:
  APIとDBスキーマの設計を評価

Subagent-2（security-auditor）:
  リアルタイム通信のセキュリティリスクを評価

Subagent-3（performance-engineer）:
  スケーラビリティとレイテンシの懸念点を評価

3者の意見を統合して最終的な設計推奨をまとめて"
```

---

## よくある失敗と対処法

### ❌ 失敗1: Subagentに曖昧なタスクを渡す

```bash
# 悪い例
"Subagentでコードをチェックして"
# → 何をチェックするか不明。Subagentが独断で判断する

# 良い例
"security-auditor Subagentで src/api/ 以下の
OWASP Top 10の観点でセキュリティチェックして。
Critical・Highの問題だけ報告して"
```

### ❌ 失敗2: 依存関係のあるタスクを並列にする

```bash
# 悪い例（AはBの完了が前提）
"以下を並列実行:
 Subagent-1: DBスキーマを設計
 Subagent-2: DBスキーマに基づいてAPIを実装"
# → Subagent-2はSubagent-1の完了を待てない

# 良い例（直列に変える）
"Step 1: DBスキーマを設計して（Subagent-1）
 Step 1完了後、Step 2: APIを実装して（Subagent-2）"
```

### ❌ 失敗3: Subagentが必要のない場面で使う

```bash
# 不要な使い方（シンプルなタスク）
"Subagentを使ってファイル名をリネームして"
# → 1ファイルのリネームにSubagentは過剰

# 適切な使い方
"Subagentを使って（必要なときだけ）:
 100ファイル以上のリネーム・並列調査・専門家レビュー"
```

---

## カテゴリ別おすすめSubagent一覧

公式コレクション（community製）から実務で役立つものを紹介します。

### 開発・アーキテクチャ

| Subagent名 | 用途 |
|---|---|
| `backend-architect` | API設計・DBスキーマ・マイクロサービス境界の設計 |
| `code-reviewer` | PRレビュー・技術的負債の特定・コード品質改善 |
| `debugger` | 複雑なバグ調査・ボトルネック分析 |

### セキュリティ・品質

| Subagent名 | 用途 |
|---|---|
| `security-auditor` | 脆弱性評価・セキュリティレビュー |
| `penetration-tester` | ペネトレーションテスト・攻撃シミュレーション |
| `qa-expert` | テスト戦略・品質プロセス構築 |
| `test-automator` | テスト自動化フレームワークの構築 |

### インフラ・デプロイ

| Subagent名 | 用途 |
|---|---|
| `deployment-engineer` | Blue-Greenデプロイ・カナリアリリース自動化 |
| `performance-engineer` | 負荷テスト・パフォーマンスプロファイリング |

---

## 用語解説

| 用語 | 意味 |
|---|---|
| Subagent | Claude Codeのメインセッションから委託される、独立したAIエージェント |
| Agent Team | 複数のClaude Codeセッションが互いに通信しながら協調するチーム |
| オーケストレーター | 複数のSubagentに仕事を割り振り、結果を統合するメインエージェント |
| Worktree | Gitの機能。同じリポジトリを複数の独立した作業ディレクトリで扱える仕組み |
| コンテキスト | Claudeが会話中に保持している情報の総量。Subagentに委託することで節約できる |
| フロントマター | Markdownファイルの先頭の `---` で囲まれたメタデータ |
| OWASP Top 10 | Webアプリケーションの重大なセキュリティリスクTop10のリスト |

---

## まとめ

Subagentは「Claude Codeを1人から複数人のチームに変える」機能です。

**今すぐ使い始めるための3ステップ：**

1. **単純な並列指示から試す** — 「以下を並列で調査して」と書くだけでSubagentが起動する
2. **カスタムSubagentを1つ作る** — `.claude/agents/` に `security-auditor.md` を作成して試す
3. **PRレビューに組み込む** — セキュリティ・品質・テストを並列レビューするフローを定番化する

Subagentを使いこなすことで、大規模なコードベースの調査・レビュー・リファクタリングが、安全に・高速に・並列で実行できるようになります。
