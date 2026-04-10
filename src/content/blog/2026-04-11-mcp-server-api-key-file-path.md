---
title: "Claude Code MCP サーバー設定 — APIキーをファイルパスで安全に管理する方法"
date: 2026-04-11
category: blog
tags: [claude-code, mcp-server, config, setup, tips]
summary: "settings.local.json にAPIキーを直書きせず、ファイルパス参照・環境変数展開を使って安全にMCPサーバーを設定する方法を解説。"
draft: false
---

## はじめに

Claude Code でMCPサーバーを設定するとき、多くの人が最初にハマるのが **APIキーの管理** です。

`settings.local.json` や `.mcp.json` にAPIキーをそのまま書いてしまうと、うっかり Git にコミットして漏洩するリスクがあります。「ファイルに書くな」とわかっていても、では **どこに書けばいいのか** が意外と整理されていません。

この記事では、APIキーを直書きせず **別ファイルのパスで参照する方法** を3パターン紹介します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ MCPサーバーのAPIキーをシークレットファイルで安全に管理できる
- ✅ 環境変数展開（`${VAR}`）を使ったMCP設定が書ける
- ✅ `.gitignore` を考慮したセキュアな設定ファイル構成を理解できる

**学ぶ意義**: キーを直書きしないことで、設定ファイルをチーム共有・Git管理しても安全な状態を保てる。

---

## 時間がない人のための要約

1. **環境変数展開** — `.mcp.json` に `${MY_API_KEY}` と書き、シェル設定でファイルから読み込む（最も推奨）
2. **ラッパースクリプト経由** — APIキーをファイルから読んでMCPサーバーを起動するシェルスクリプトを挟む
3. **シークレットファイル直読み（args埋め込み）** — `command` に `sh -c` を使いファイルの中身をその場で展開する

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Claude Code | 最新版（`claude --version` で確認） |
| OS | macOS / Linux（Windows は WSL 推奨） |
| シェル | bash / zsh |
| Node.js | 20.x 以上（stdio型MCPサーバーを使う場合） |

---

## 設定ファイルの構成を理解する

まず、Claude Code におけるMCP設定ファイルの種類と優先順位を整理します。

| ファイル | スコープ | Gitコミット |
|---|---|---|
| `.mcp.json`（プロジェクトルート） | プロジェクト全体 | する（APIキーは書かない） |
| `~/.claude/settings.json` | ユーザー全体 | しない |
| `~/.claude/settings.local.json` | ユーザー全体・ローカル限定 | しない |

> **ポイント**: `.mcp.json` はチームで共有する想定のファイルです。APIキーは絶対に書かないでください。

---

## 手順

### パターン1：環境変数展開（推奨）

Claude Code は `.mcp.json` と `settings.local.json` の中で **`${変数名}` 形式の環境変数展開** をサポートしています。

**Step 1. シークレットファイルを作る**

```bash
# キーを保存するディレクトリを作成（権限を絞る）
mkdir -p ~/.secrets
chmod 700 ~/.secrets

# APIキーをファイルに書き込む
echo "sk-xxxxxxxxxxxxxxxxxx" > ~/.secrets/my_api_key
chmod 600 ~/.secrets/my_api_key
```

**Step 2. シェル設定でファイルから環境変数を読み込む**

`~/.zshrc`（または `~/.bashrc`）に以下を追加します：

```bash
# シークレットファイルからAPIキーを環境変数に読み込む
export MY_API_KEY=$(cat ~/.secrets/my_api_key 2>/dev/null)
```

設定を反映させます：

```bash
source ~/.zshrc
```

**Step 3. `.mcp.json` に環境変数参照で記述する**

```json
{
  "mcpServers": {
    "my-service": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@my-org/mcp-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

HTTP型サーバーの場合は以下のように書けます：

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${MY_API_KEY}"
      }
    }
  }
}
```

> **ポイント**: `${VAR:-デフォルト値}` の形式でデフォルト値を設定できます。`API_BASE_URL` が未設定の場合、自動的に `https://api.example.com` が使われます。

---

### パターン2：ラッパースクリプト経由

APIキーを必要とするMCPサーバーを直接起動せず、**シェルスクリプトを仲介** する方法です。

**Step 1. ラッパースクリプトを作成する**

```bash
# スクリプトを配置（~/.local/bin は PATH に通しておく）
mkdir -p ~/.local/bin

cat > ~/.local/bin/start-my-mcp.sh << 'EOF'
#!/bin/bash
# シークレットファイルからAPIキーを読み込んでMCPサーバーを起動
API_KEY=$(cat ~/.secrets/my_api_key)
exec npx -y @my-org/mcp-server --api-key "$API_KEY"
EOF

chmod +x ~/.local/bin/start-my-mcp.sh
```

**Step 2. `.mcp.json` でスクリプトを指定する**

```json
{
  "mcpServers": {
    "my-service": {
      "type": "stdio",
      "command": "/Users/yourname/.local/bin/start-my-mcp.sh"
    }
  }
}
```

> **ポイント**: `command` には絶対パスを使うと確実です。`~` はシェル展開されないため、`/Users/yourname/` のようにフルパスで指定してください。

---

### パターン3：`sh -c` でファイルを直接展開する（簡易版）

スクリプトファイルを作りたくない場合、`sh -c` コマンドを使って **その場でファイルを読み込む** 方法もあります。

```json
{
  "mcpServers": {
    "my-service": {
      "type": "stdio",
      "command": "sh",
      "args": [
        "-c",
        "API_KEY=$(cat ~/.secrets/my_api_key) npx -y @my-org/mcp-server"
      ]
    }
  }
}
```

> **注意**: この方法は簡易的で便利ですが、`args` にファイルパスが含まれるためチームの環境によっては動かないことがあります。個人利用向けです。

---

## よく使われるMCPサーバーの設定例

### GitHub MCP サーバー（環境変数展開版）

```bash
# シークレットファイルに GitHub Token を保存
echo "ghp_xxxxxxxxxxxxxxxxxxxx" > ~/.secrets/github_token
chmod 600 ~/.secrets/github_token

# ~/.zshrc に追加
export GITHUB_TOKEN=$(cat ~/.secrets/github_token 2>/dev/null)
```

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Stripe MCP サーバー（環境変数展開版）

```bash
echo "sk_test_xxxxxxxxxxxxxxxxxxxx" > ~/.secrets/stripe_secret_key
chmod 600 ~/.secrets/stripe_secret_key

# ~/.zshrc に追加
export STRIPE_SECRET_KEY=$(cat ~/.secrets/stripe_secret_key 2>/dev/null)
```

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp"],
      "env": {
        "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"
      }
    }
  }
}
```

---

## `.gitignore` の確認

`.mcp.json` をリポジトリで管理する場合、シークレット関連ファイルが除外されているか確認しましょう。

```bash
# プロジェクトの .gitignore に以下が含まれているか確認
cat .gitignore | grep -E "secret|env|local"
```

推奨する `.gitignore` の記述：

```gitignore
# シークレット・環境変数
.env
.env.local
.env.*.local
*.local.json

# ローカル設定（APIキーが含まれる可能性あり）
.claude/settings.local.json
```

> **ポイント**: `settings.local.json` は個人のローカル設定用ファイルです。チームで共有するプロジェクトでは必ず `.gitignore` に追加してください。

---

## 設定の動作確認

設定が正しく機能しているか確認します：

```bash
# 環境変数が正しく読み込まれているか確認
echo $MY_API_KEY

# MCPサーバーの一覧を確認
claude mcp list

# 特定のMCPサーバーの詳細を確認
claude mcp get my-service
```

Claude Code を起動して、MCPツールが使えるようになっていれば設定完了です。

---

## 用語解説

| 用語 | 意味 |
|---|---|
| MCP（Model Context Protocol） | AIモデルが外部ツール・APIを呼び出すための標準プロトコル |
| stdio型 | 標準入出力を使って通信するMCPサーバーの形式（ローカル実行） |
| HTTP型 | HTTPリクエストで通信するMCPサーバーの形式（リモートAPI） |
| 環境変数展開 | `${VAR_NAME}` の形式で変数の値に置き換える仕組み |
| `.mcp.json` | プロジェクトルートに置くMCPサーバー設定ファイル |
| `settings.local.json` | ユーザーローカル限定の Claude Code 設定ファイル |

---

## まとめ

APIキーを安全に管理するには、**環境変数展開（パターン1）が最もシンプルで推奨**です。

1. `~/.secrets/` にキーを保存（権限 600）
2. `~/.zshrc` でファイルから環境変数に読み込む
3. `.mcp.json` では `${ENV_VAR}` で参照する

この構成にすることで、`.mcp.json` はAPIキーを含まない状態で Git 管理できます。チームで設定を共有したいときも、メンバーそれぞれが自分の `~/.secrets/` に自分のキーを置くだけで動くため、運用がシンプルになります。

次のステップとして、[MCP サーバーの活用事例](/blog/2026-04-03-mcp-server-guide) も参考にしてみてください。
