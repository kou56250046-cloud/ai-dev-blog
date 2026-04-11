---
title: "MCPサーバーのグローバル設定と自動接続の仕組み — Claude Code 起動時に繋がる理由"
date: 2026-04-11
category: blog
tags: [claude-code, mcp-server, config, setup, tips]
summary: "Claude Code を起動するだけでMCPサーバーが自動接続される仕組みを解説。user/projectスコープの使い分けと設定コマンドの実践手順をまとめた。"
draft: false
---

## はじめに

Claude Code でMCPサーバーを設定するとき、「なぜ毎回 `claude mcp add` しなくてもサーバーが繋がっているの？」と疑問に思ったことはないでしょうか。

答えは **グローバル設定（userスコープ）** にあります。MCPサーバーをどのスコープに登録するかによって、「このプロジェクトだけ使える」か「どこでも自動接続される」かが決まります。

この記事では、設定ファイルの種類・スコープの概念・自動接続の仕組みを整理したうえで、実際のセットアップ手順を紹介します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ MCPサーバーのスコープ（user / project）を使い分けられる
- ✅ `claude mcp add --scope user` でグローバルに登録できる
- ✅ Claude Code 起動時に自動接続される仕組みを説明できる

**学ぶ意義**: グローバル設定を正しく使うことで、プロジェクトをまたいでGitHub・Stripe・Supabase等のMCPツールをすぐに使える状態になる。

---

## 時間がない人のための要約

1. **userスコープで登録** — `claude mcp add --scope user` で登録すると `~/.claude/settings.json` に保存され、どのプロジェクトでも自動接続される
2. **起動時に自動読み込み** — Claude Code は起動時に `~/.claude/settings.json`（user）と `.mcp.json`（project）を順に読み込み、すべてのMCPサーバーを自動起動する
3. **スコープの優先順位** — project > local > user の順で設定が上書きされる（projectが最も強い）

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Claude Code | 最新版（`claude --version` で確認） |
| OS | macOS / Linux / Windows（WSL推奨） |
| Node.js | 20.x 以上（stdio型MCPサーバーを使う場合） |

---

## 設定ファイルとスコープの全体像

Claude Code のMCP設定は **3種類のファイル** で管理されています。それぞれのスコープと役割を整理します。

| ファイルパス | スコープ | 用途 | Git管理 |
|---|---|---|---|
| `~/.claude/settings.json` | **user（グローバル）** | 全プロジェクト共通のMCP設定 | しない |
| `~/.claude/settings.local.json` | user local | ユーザーローカル限定の設定 | しない |
| `プロジェクトルート/.mcp.json` | **project** | そのプロジェクト専用のMCP設定 | する（APIキーは書かない） |
| `プロジェクトルート/.claude/settings.json` | project local | プロジェクトローカル設定 | する |

### 優先順位（上が強い）

```
project > local > user
```

同じ名前のMCPサーバーが複数のファイルに定義されている場合、**project スコープの設定が優先**されます。

---

## 自動接続の仕組み

Claude Code を起動（`claude` コマンド実行）すると、内部で以下の処理が走ります：

```
1. ~/.claude/settings.json を読み込む（userスコープ）
   ↓
2. カレントディレクトリの .mcp.json を読み込む（projectスコープ）
   ↓
3. 両方の mcpServers をマージする
   ↓
4. 登録されたMCPサーバーをすべて自動起動（stdio型はサブプロセスとして）
   ↓
5. 接続完了 → ツールが使える状態になる
```

**userスコープに登録したサーバーは「どのディレクトリで `claude` を起動しても常に接続される」** ため、GitHub・Stripe・Supabase のように横断的に使うツールはここに登録するのが正解です。

---

## 手順

### 1. グローバルMCPサーバーを登録する（userスコープ）

`claude mcp add` コマンドに `--scope user` を付けると `~/.claude/settings.json` に書き込まれます。

#### stdio型サーバーの例（GitHub MCP）

```bash
claude mcp add github-mcp \
  --scope user \
  -- npx -y @modelcontextprotocol/server-github
```

環境変数を渡す場合は `-e` オプションを使います：

```bash
claude mcp add github-mcp \
  --scope user \
  -e GITHUB_TOKEN="${GITHUB_TOKEN}" \
  -- npx -y @modelcontextprotocol/server-github
```

#### HTTP型サーバーの例

```bash
claude mcp add my-api \
  --scope user \
  --transport http \
  -- https://api.example.com/mcp
```

#### JSON設定をそのまま渡す（`add-json`）

既にJSON形式の設定がある場合は `mcp add-json` が便利です：

```bash
claude mcp add-json github-mcp \
  '{"type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{"GITHUB_TOKEN":"ghp_xxxx"}}' \
  --scope user
```

> **ポイント**: `--scope user` を省略するとデフォルトでプロジェクトスコープ（`.mcp.json`）に書き込まれます。グローバル登録には必ず `--scope user` を付けてください。

---

### 2. Claude Desktop の設定を引き継ぐ（移行が楽）

Claude Desktop をすでに使っている場合、設定済みのMCPサーバーをそのまま Claude Code にインポートできます：

```bash
# インタラクティブにインポートするサーバーを選択できる
claude mcp add-from-claude-desktop

# グローバル（user）スコープにインポートする場合
claude mcp add-from-claude-desktop --scope user
```

> **対応環境**: macOS と Windows（WSL含む）で動作します。Claude Desktop の設定ファイルを自動で読み取り、サーバー名が重複する場合は `server_1` のように連番が付きます。

---

### 3. 登録済みのサーバーを確認する

```bash
# 全スコープの登録済みMCPサーバーを一覧表示
claude mcp list

# 特定サーバーの詳細を確認
claude mcp get github-mcp

# 設定ファイルの中身を直接確認
cat ~/.claude/settings.json
```

`claude mcp list` の出力例：

```
NAME         SCOPE    TYPE   STATUS
github-mcp   user     stdio  connected
stripe-mcp   user     stdio  connected
supabase     project  stdio  connected
```

---

### 4. `~/.claude/settings.json` の構造

グローバル登録後のファイルはこのような構造になります：

```json
{
  "mcpServers": {
    "github-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "stripe-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@stripe/mcp"],
      "env": {
        "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"
      }
    },
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

> **ポイント**: `${ENV_VAR}` 形式の環境変数展開がサポートされています。APIキーを直書きせず、シェル設定（`~/.zshrc` 等）から読み込む運用が推奨です（詳細は [APIキーをファイルパスで安全に管理する方法](/blog/2026-04-11-mcp-server-api-key-file-path) を参照）。

---

### 5. プロジェクト専用サーバーを追加する（projectスコープ）

チームで共有するプロジェクト固有のMCPサーバーは `.mcp.json` で管理します：

```bash
# projectスコープ（デフォルト）で登録
claude mcp add local-db-tools \
  -- npx -y @myteam/local-db-mcp-server
```

これはプロジェクトルートの `.mcp.json` に書き込まれます：

```json
{
  "mcpServers": {
    "local-db-tools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@myteam/local-db-mcp-server"]
    }
  }
}
```

`.mcp.json` は Git にコミットしてチームで共有できます。**APIキーは絶対に書かず、`${ENV_VAR}` で参照**してください。

---

### 6. サーバーを削除する

```bash
# 特定サーバーを削除（スコープを指定）
claude mcp remove github-mcp --scope user

# プロジェクトスコープから削除
claude mcp remove local-db-tools
```

---

## スコープ使い分けチートシート

| ユースケース | 使うスコープ | コマンド例 |
|---|---|---|
| GitHub・Stripe・Supabase等を全プロジェクトで使う | **user** | `claude mcp add xxx --scope user` |
| チームで共有するプロジェクト固有ツール | **project** | `claude mcp add xxx`（デフォルト） |
| 個人のローカル開発環境だけで使うツール | **local** | `~/.claude/settings.local.json` に直接記述 |
| Claude Desktopから移行 | **user** | `claude mcp add-from-claude-desktop --scope user` |

---

## よくあるトラブル

### 起動しても MCP が繋がらない

```bash
# 環境変数が正しく展開されているか確認
echo $GITHUB_TOKEN

# MCPサーバーのステータスを確認
claude mcp list

# 特定サーバーのエラー詳細を確認
claude mcp get github-mcp
```

### `--scope user` を忘れてプロジェクトに登録してしまった

```bash
# いったん削除
claude mcp remove github-mcp

# userスコープで再登録
claude mcp add github-mcp --scope user -- npx -y @modelcontextprotocol/server-github
```

### Windows（非WSL）での注意

Windows ネイティブ環境では、`command` に `npx` を使う場合 `npx.cmd` と書く必要がある場合があります。WSL を使うと macOS/Linux と同じコマンドが使えるため、**WSL 環境での運用を推奨**します。

---

## 用語解説

| 用語 | 意味 |
|---|---|
| MCP（Model Context Protocol） | AIモデルが外部ツール・APIを呼び出すための標準プロトコル |
| stdio型 | 標準入出力でローカルプロセスと通信するMCPサーバーの形式 |
| HTTP型 | HTTPリクエストでリモートAPIと通信するMCPサーバーの形式 |
| userスコープ | `~/.claude/settings.json` に保存される全プロジェクト共通の設定 |
| projectスコープ | `.mcp.json` に保存されるプロジェクト固有の設定 |
| 環境変数展開 | `${VAR_NAME}` 形式で変数の値に置き換える仕組み |
| `claude mcp add-from-claude-desktop` | Claude Desktop の設定を Claude Code にインポートするコマンド |

---

## まとめ

Claude Code 起動時にMCPサーバーが自動接続される仕組みは、**`~/.claude/settings.json`（userスコープ）と `.mcp.json`（projectスコープ）を起動時にマージして一括起動する** という設計によるものです。

- **横断的に使うツール**（GitHub・Stripe・Supabase等）→ `--scope user` でグローバル登録
- **プロジェクト固有のツール** → デフォルトの project スコープで `.mcp.json` に登録しチームで共有

この使い分けを理解するだけで、プロジェクトを開くたびに必要なツールがすぐ使える状態になります。

APIキーの安全な管理については [MCPサーバー設定 — APIキーをファイルパスで安全に管理する方法](/blog/2026-04-11-mcp-server-api-key-file-path) も合わせてご確認ください。
