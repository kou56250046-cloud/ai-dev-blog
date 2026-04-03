---
title: "MCPサーバーとは何か — 仕組み・Claude Codeへの設定・おすすめTop7"
date: 2026-04-03
category: blog
tags: [mcp-server, claude-code, setup, architecture, tips]
summary: "MCPの概要・アーキテクチャ・Claude Codeへの設定手順を解説。実務で使えるおすすめMCPサーバーTop7も紹介。"
draft: false
---

## はじめに

「Claude CodeにMCPを設定すると何が変わるのか？」

答えはシンプルです。**Claude CodeがGitHub・Supabase・Stripeなどの外部サービスを直接操作できるようになります。** 今まで「調べてコピペして実行」していた作業が、Claudeへの一言で完結するようになります。

この記事では、MCPの仕組みをゼロから理解し、Claude Codeへの設定方法と実務で役立つおすすめサーバーTop7を紹介します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ MCPの仕組みとアーキテクチャを説明できる
- ✅ Claude CodeにMCPサーバーを追加設定できる
- ✅ 実務で有用なMCPサーバー7つを選んで導入できる

**学ぶ意義**: MCPを使いこなすことで、Claude Codeが単なるコード補助ツールから「外部サービスを操作できる自律エージェント」に変わる。AI駆動開発の生産性が段違いに上がる。

---

## 時間がない人のための要約

1. **MCPはAIとツールをつなぐUSB-Cポート** — 標準化された接続規格で、どのAIアプリも同じ方法で外部サービスに接続できる
2. **設定は `claude_code_config.json` に数行書くだけ** — `command` と `args` を指定するだけで有効になる
3. **まず入れるべきはGitHub・Supabase・Playwright** — この3つだけでAI駆動開発の実務フローが大幅に改善する

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Claude Code | 最新版（`npm install -g @anthropic-ai/claude-code`） |
| Node.js | 20.x 以上 |
| npx | Node.jsに同梱（追加インストール不要） |
| Anthropicアカウント | Claude Proプラン以上推奨 |

---

## MCPとは何か — 仕組みとアーキテクチャ

### MCPの定義

**MCP（Model Context Protocol）** はAnthropicが提唱するオープンスタンダードです。AIアプリケーションが外部のデータソース・ツール・サービスと安全かつ標準化された方法でやり取りするための「共通規格」です。

公式の表現を借りると：

> *MCPはAIのためのUSB-Cポートです。標準化されたインターフェースにより、AIモデルと外部世界のギャップを埋めます。*

### アーキテクチャの全体像

MCPは3つの役割で構成されます。

```
┌─────────────────────────────────────────────┐
│             MCP アーキテクチャ               │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │  MCP Client  │◄──►│   MCP Server     │  │
│  │ (Claude Code)│    │ (GitHub・DBなど)  │  │
│  └──────────────┘    └──────────────────┘  │
│         │                    │              │
│         ▼                    ▼              │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │   Claude     │    │  外部サービス    │  │
│  │  (LLM本体)   │    │  ファイル / API  │  │
│  └──────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────┘
```

| 役割 | 担当 | 説明 |
|---|---|---|
| **Host** | Claude Code / Claude Desktop | MCPクライアントを起動・管理するアプリ |
| **Client** | Claude Code内部 | MCPサーバーと通信するコンポーネント |
| **Server** | GitHub MCP・Supabase MCPなど | 外部サービスへの操作を提供する軽量プログラム |

### MCPサーバーが提供する3つの機能

```
MCP Server が提供できるもの
├── Tools（ツール）    ... AIが呼び出せる関数（PR作成・DB操作など）
├── Resources（リソース）... AIが読めるデータ（ファイル・DB内容など）
└── Prompts（プロンプト）... 再利用可能な命令テンプレート
```

**Tools** が最も重要です。Claude Codeが「GitHubにPRを作って」と指示されたとき、GitHub MCPの `create_pull_request` ツールを呼び出して実際に実行します。

---

## 手順

### 1. Claude Codeの設定ファイルの場所を確認する

Claude CodeのMCP設定は専用のJSONファイルで管理されます。

**Windows の場合:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS の場合:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

> **ポイント**: ファイルが存在しない場合は新規作成します。Claude Codeを再起動すると自動で読み込まれます。

### 2. 設定ファイルの基本構造を理解する

すべてのMCPサーバーは `mcpServers` キーの下に追加します。

```json
{
  "mcpServers": {
    "サーバー名": {
      "command": "実行コマンド",
      "args": ["引数1", "引数2"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `command` | ✅ | サーバーを起動するコマンド（`npx`・`node`など） |
| `args` | ✅ | コマンドに渡す引数 |
| `env` | - | 環境変数（APIキーなど機密情報） |

### 3. npx形式でMCPサーバーを追加する（最も簡単）

`npx` を使うとインストール不要でMCPサーバーを起動できます。

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

> **ポイント**: `-y` フラグで確認プロンプトをスキップします。初回起動時に自動ダウンロードされます。

### 4. 複数のMCPサーバーを同時に設定する

実務では複数のサーバーをまとめて設定します。

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/yourname/projects"
      ]
    }
  }
}
```

### 5. 設定が反映されているか確認する

Claude Codeを再起動後、以下の方法で確認できます。

```bash
# Claude Codeを起動して確認
claude

# 対話モードでMCPツールを確認
> /mcp
```

利用可能なMCPサーバーとツール一覧が表示されれば設定完了です。

---

## おすすめMCPサーバー Top7

### 1位: GitHub MCP — PR・Issue・コードを直接操作

**パッケージ**: `@modelcontextprotocol/server-github`

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
}
```

**できること:**
- PRの作成・マージ・レビュー
- Issueの作成・更新・クローズ
- ファイルのコミット・プッシュ
- リポジトリ検索・コード検索

**AI駆動開発との親和性が最高**。「この機能をPRにまとめてGitHubにpushして」が一言で完結します。

---

### 2位: Supabase MCP — DBスキーマ変更をAIが直接実行

**パッケージ**: `@supabase/mcp-server-supabase`

```json
"supabase": {
  "command": "npx",
  "args": ["-y", "@supabase/mcp-server-supabase", "--access-token", "sbp_xxx"]
}
```

**できること:**
- SQLの実行・テーブル作成
- マイグレーション適用
- Edge Functionsのデプロイ
- ログの確認

「usersテーブルにprofileカラムを追加して」でマイグレーションまで自動実行。

---

### 3位: Playwright MCP — ブラウザを自動操作

**パッケージ**: `@playwright/mcp`

```json
"playwright": {
  "command": "npx",
  "args": ["-y", "@playwright/mcp"]
}
```

**できること:**
- ブラウザのスクリーンショット取得
- フォーム入力・ボタンクリック
- ページ遷移・要素の確認
- E2Eテストの自動実行

「デプロイ後のページをスクリーンショットで確認して」が自動化できます。

---

### 4位: Filesystem MCP — ローカルファイルを安全に操作

**パッケージ**: `@modelcontextprotocol/server-filesystem`

```json
"filesystem": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/path/to/allowed/directory"
  ]
}
```

**できること:**
- ファイルの読み書き・移動・削除
- ディレクトリ一覧の取得
- ファイル検索

アクセス許可するディレクトリを明示するため**セキュアに操作できます**。

---

### 5位: Memory MCP — セッションをまたいだ記憶の保持

**パッケージ**: `@modelcontextprotocol/server-memory`

```json
"memory": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-memory"]
}
```

**できること:**
- プロジェクトのコンテキストを記憶
- 過去の決定事項・仕様の保存
- ナレッジグラフの構築

会話をまたいでClaudeが「前回決めたこと」を覚えていられるようになります。

---

### 6位: Stripe MCP — 決済・サブスクリプションをAIが操作

**パッケージ**: `@stripe/mcp`

```json
"stripe": {
  "command": "npx",
  "args": ["-y", "@stripe/mcp", "--tools=all"],
  "env": { "STRIPE_SECRET_KEY": "sk_test_xxx" }
}
```

**できること:**
- 商品・価格の作成
- 顧客・サブスクリプション管理
- 請求書の発行
- 支払いリンクの生成

SaaS開発時に「テスト用の月額プランを作って」が一言で完結します。

---

### 7位: Context7 MCP — 最新ライブラリドキュメントを自動取得

**パッケージ**: `@upstash/context7-mcp`

```json
"context7": {
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"]
}
```

**できること:**
- 任意ライブラリの最新ドキュメント取得
- APIリファレンスの検索
- コードスニペットの取得

「use context7」とプロンプトに追加するだけで、Claudeが古い知識ではなく**最新の公式ドキュメントを参照**して回答します。

---

## まとめ比較表

| 順位 | サーバー | 主な用途 | 難易度 |
|---|---|---|---|
| 1 | GitHub MCP | PR・Issue・コード管理 | ★☆☆ |
| 2 | Supabase MCP | DB操作・マイグレーション | ★☆☆ |
| 3 | Playwright MCP | ブラウザ自動操作・E2E | ★★☆ |
| 4 | Filesystem MCP | ローカルファイル操作 | ★☆☆ |
| 5 | Memory MCP | セッション間記憶保持 | ★☆☆ |
| 6 | Stripe MCP | 決済・サブスク管理 | ★★☆ |
| 7 | Context7 MCP | 最新ドキュメント取得 | ★☆☆ |

---

## 用語解説

| 用語 | 意味 |
|---|---|
| MCP | Model Context Protocol。AIと外部サービスをつなぐ共通規格 |
| MCPサーバー | 外部サービス（GitHub・DBなど）への操作機能を提供する軽量プログラム |
| MCPクライアント | Claude CodeのようにMCPサーバーと通信するAIアプリ側のコンポーネント |
| npx | Node.jsのパッケージを一時的にダウンロードして実行するコマンド |
| Tools | MCPサーバーが提供する「AIが呼び出せる操作」の単位 |
| Personal Access Token | GitHubなどのサービスへのアクセス権限を持つ認証キー |
| E2Eテスト | End-to-End テスト。実際のブラウザを使った結合テスト |
| マイグレーション | データベースのスキーマ（構造）変更を管理する仕組み |

---

## まとめ

MCPを使うことでClaude Codeは「コードを書くだけのツール」から「外部サービスを操作できる自律エージェント」に進化します。

まず試すなら **GitHub MCP + Memory MCP** の2つだけで十分です。この2つを入れるだけで、PR作成・コミット・Issue管理がClaudeへの一言で完結するようになります。

次のステップとして、Supabase MCPを追加してDB操作もClaude Code上で完結させるフローを構築してみてください。
