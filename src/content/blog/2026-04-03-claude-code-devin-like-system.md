---
title: "Claude CodeでDevinライクな自律エージェントを実装する — 手法・手順・管理の注意点"
date: 2026-04-03
category: blog
tags: [claude-code, architecture, setup, tips, config]
summary: "HeadlessモードからMulti-Agent Swarm・Hooks・Worktreeまで、Claude CodeでDevin的な自律開発システムを構築する完全な手順と注意点を解説。"
draft: false
---

## はじめに

「Devinのように、タスクを渡したら自分で計画して完遂してくれる仕組みをClaude Codeで作れないか？」

結論から言うと、**作れます**。Claude Codeには Devin のアーキテクチャと同等の機能が揃っています。Headless実行・Multi-Agent Swarm・Hooks・Worktree分離・GitHub Actions統合を組み合わせることで、「タスクを渡して待つだけ」の自律エージェントシステムを構築できます。

この記事では、そのための具体的な手法・手順・実行と管理における注意点を体系的に整理します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ Claude CodeをHeadlessモードで非対話的に自動実行できる
- ✅ Multi-Agent Swarmで複数エージェントを並列・協調させられる
- ✅ Hooksで安全ガードを設けながら自律実行できる
- ✅ 自律システムを運用するときの危険な落とし穴を避けられる

**学ぶ意義**: Devinは月額数万円の有料サービスだが、Claude Code + 適切な設計で同等の自律性を実現できる。Devinが合わないタスク・コスト削減・自社システムへの統合にも応用できる。

---

## 時間がない人のための要約

1. **Headlessモード（`-p`フラグ）がDevin化の起点** — 対話なしでClaude Codeをスクリプトやパイプラインから呼び出せる
2. **Multi-Agent Swarm + tmuxがDevinの「自律計画実行」に相当** — コーディネーターエージェントが複数ワーカーに仕事を割り振り、tmuxで通信する
3. **`--dangerously-skip-permissions` は必ずサンドボックス内でのみ使う** — 外部ネットワークにつながった本番環境での使用は絶対に禁止

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Claude Code | 最新版 |
| Git | Worktree機能使用のため必須 |
| tmux | Multi-Agent Swarm使用のため推奨 |
| Node.js | 20.x 以上 |
| Docker | サンドボックス環境の構築に推奨 |

---

## DevinとClaude Codeの機能対応表

まずDevinの主要機能がClaude Codeでどう実現できるかを整理します。

| Devinの機能 | Claude Codeでの対応手段 |
|---|---|
| 自律的なタスク計画・実行 | Headlessモード（`-p`）+ 完了条件の明示 |
| 複数タスクの並列処理 | Multi-Agent Swarm + Worktree分離 |
| ブラウザ・ターミナル操作 | Playwright MCP + Bash tool |
| Knowledge（チーム規約学習） | CLAUDE.md + `.claude/rules/` |
| Playbook（手順の自動化） | `.claude/agents/` のカスタムSubagent |
| PR自動作成 | GitHub MCP + `gh` コマンド |
| 完了通知 | Hooks（PostToolUse）+ Slack webhook |
| 非同期実行 | `--remote` フラグ + GitHub Actions |

---

## 手順

### Step 1: Headlessモード — 非対話的な自動実行の基本

Devinの「タスクを渡して待つ」を最も直接的に実現する仕組みです。

```bash
# 基本: -p フラグで非対話実行（print mode）
claude -p "src/auth/login.ts のバグを修正して"

# JSON形式で出力（スクリプトから結果を受け取る）
claude -p "テストを実行して失敗一覧を出力して" --output-format json

# ストリーミングJSON（リアルタイムで結果を受け取る）
claude -p "ビルドしてエラーを直して" --output-format stream-json

# Bare mode（CI環境での高速起動・設定自動検出をスキップ）
claude --bare -p "このファイルを要約して" --allowedTools "Read"
```

**`--allowedTools` で自動承認するツールを制限する：**

```bash
# 特定コマンドのみ自動承認（最も安全）
claude -p "テストを実行して失敗があれば直して" \
  --allowedTools "Read,Edit,Bash(npm test *),Bash(git diff *)"

# プレフィックス一致で権限を与える（* でワイルドカード）
# Bash(git *)  → git で始まるすべてのコマンドを許可
# Bash(npm *)  → npm で始まるすべてのコマンドを許可
```

**パイプラインとの統合：**

```bash
# ファイル一覧を渡してClaudeに処理させる
find src -name "*.ts" | claude -p "これらのファイルのanyを全部直して" \
  --allowedTools "Read,Edit"

# 結果を次のコマンドに渡す
claude -p "変更されたファイルを一覧して" --output-format text | xargs git add
```

---

### Step 2: CLAUDE.md + rules/ — Devinの「Knowledge」を構築する

Devinの Knowledge機能 に相当するのは、CLAUDE.md と `.claude/rules/` の組み合わせです。

```
.claude/
├── rules/
│   ├── coding-standards.md   ← コーディング規約
│   ├── deployment.md         ← デプロイ手順
│   ├── testing.md            ← テスト方針
│   └── security.md           ← セキュリティガイドライン
└── agents/
    ├── code-reviewer.md      ← Playbook相当のカスタムSubagent
    ├── security-auditor.md
    └── deployment-engineer.md
```

`CLAUDE.md` から `@構文` で参照させます：

```markdown
# CLAUDE.md

## 自律実行時のルール
- 破壊的な変更（テーブル削除・ブランチ強制push）は必ず確認を取る
- 本番環境への直接デプロイは禁止（staging経由のみ）
- エラーが解決できない場合は作業を中断してレポートを残す

## 詳細規約
- コーディング規約: @.claude/rules/coding-standards.md
- デプロイ手順:     @.claude/rules/deployment.md
- セキュリティ:     @.claude/rules/security.md
```

---

### Step 3: カスタムSubagent — Devinの「Playbook」を構築する

繰り返し実行する手順をSubagentとして定義します。

**デプロイエンジニア Subagent（`.claude/agents/deployment-engineer.md`）:**

```markdown
---
name: deployment-engineer
description: ステージング→本番の安全なデプロイを自律実行する。
  デプロイ作業・リリース管理・ロールバックに使う。
tools: Read, Bash, Edit
---

あなたはBlue-Greenデプロイとゼロダウンタイムリリースの専門家です。

デプロイ手順:
1. テストが全てパスしていることを確認（`pnpm test`）
2. ビルドが成功することを確認（`pnpm build`）
3. stagingにデプロイ（`vercel --env staging`）
4. Playwright MCPでステージングの動作確認
5. 問題なければmainブランチにマージ
6. 本番デプロイ（GitHub ActionsのCDが自動実行）

各ステップ後に結果を記録し、失敗したら即停止してレポートを作成すること。
本番デプロイは絶対に自動実行しない（必ずユーザー確認を取る）。
```

**コードレビュー Subagent（`.claude/agents/code-reviewer.md`）:**

```markdown
---
name: code-reviewer
description: PRのコードレビューを自律実行する。
  PRが作成・更新されたときに使う。
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"  ← 編集後に自動でlint
tools: Read, Grep, Bash
---

あなたはコード品質の守護者です。

レビュー観点:
- CLAUDE.mdのコーディング規約への準拠
- セキュリティ（OWASP Top 10）
- パフォーマンス（N+1クエリ・不要なリレンダリング）
- テストカバレッジ（80%以上）

出力形式:
## Critical（即修正）
## Major（今スプリント中）
## Minor（バックログ）
## 承認可能
```

---

### Step 4: Multi-Agent Swarm — Devinの「並列自律実行」を構築する

複数のClaude Codeインスタンスがコーディネーターの指揮下で並列動作するシステムです。

**全体アーキテクチャ：**

```
tmuxセッション構成:

coordinator（コーディネーター）
  ├→ worker-1（Worktree-1: 認証機能担当）
  ├→ worker-2（Worktree-2: API実装担当）
  └→ worker-3（Worktree-3: テスト担当）

各workerは独立したWorktreeで作業
↓
完了時にcoordinatorへtmuxでnotify
↓
coordinatorが結果を統合してPR作成
```

**Swarmの起動スクリプト（`scripts/launch-swarm.sh`）:**

```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
COORDINATOR_SESSION="team-leader"
BASE_BRANCH=$(git branch --show-current)

# コーディネーターセッション作成
tmux new-session -d -s "$COORDINATOR_SESSION" -x 220 -y 50

# ワーカー定義
declare -A TASKS=(
  ["auth-agent"]="JWTを使ったユーザー認証を実装して。テストカバレッジ100%"
  ["api-agent"]="RESTful APIのCRUDエンドポイントを実装して。Zodバリデーション付き"
  ["test-agent"]="E2EテストをPlaywrightで作成して。全フローをカバー"
)

# 各ワーカー用Worktreeを作成してClaude Codeを起動
for AGENT_NAME in "${!TASKS[@]}"; do
  WORKTREE_PATH="/tmp/worktrees/${AGENT_NAME}"
  BRANCH_NAME="agent/${AGENT_NAME}"
  TASK="${TASKS[$AGENT_NAME]}"

  # Worktreeを作成（独立したコピー）
  git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"

  # Swarm設定ファイルを作成
  cat > "$WORKTREE_PATH/.claude/multi-agent-swarm.local.md" <<EOF
---
agent_name: ${AGENT_NAME}
task_number: 1
pr_number: TBD
coordinator_session: ${COORDINATOR_SESSION}
enabled: true
---
# Task: ${TASK}

## 完了条件
- 実装が完了していること
- テストが全てパスすること
- PRが作成されていること
EOF

  # tmuxで新しいウィンドウを作成してClaude Codeを起動
  tmux new-window -t "$COORDINATOR_SESSION" -n "$AGENT_NAME"
  tmux send-keys -t "$COORDINATOR_SESSION:$AGENT_NAME" \
    "cd $WORKTREE_PATH && claude -p '${TASK}' --allowedTools 'Read,Edit,Write,Bash(git *),Bash(npm *),Bash(pnpm *)'" Enter
done

echo "Swarm起動完了。tmux attach -t $COORDINATOR_SESSION で監視できます。"
```

**エージェント完了時の通知Hookスクリプト（`.claude/hooks/notify-coordinator.sh`）:**

```bash
#!/bin/bash
set -euo pipefail

SWARM_STATE_FILE=".claude/multi-agent-swarm.local.md"

# Swarmが有効でなければスキップ
if [[ ! -f "$SWARM_STATE_FILE" ]]; then
  exit 0
fi

# フロントマターからメタデータを取得
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$SWARM_STATE_FILE")
COORDINATOR=$(echo "$FRONTMATTER" | grep '^coordinator_session:' | sed 's/coordinator_session: *//')
AGENT_NAME=$(echo "$FRONTMATTER" | grep '^agent_name:' | sed 's/agent_name: *//')
TASK_NUMBER=$(echo "$FRONTMATTER" | grep '^task_number:' | sed 's/task_number: *//')
ENABLED=$(echo "$FRONTMATTER" | grep '^enabled:' | sed 's/enabled: *//')

if [[ "$ENABLED" != "true" ]]; then
  exit 0
fi

# コーディネーターに完了通知を送信
NOTIFICATION="[完了] Agent: ${AGENT_NAME} / Task: ${TASK_NUMBER}"
if tmux has-session -t "$COORDINATOR" 2>/dev/null; then
  tmux send-keys -t "$COORDINATOR" "$NOTIFICATION" Enter
fi
```

この Hookを `settings.json` に登録します：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify-coordinator.sh"
          }
        ]
      }
    ]
  }
}
```

---

### Step 5: GitHub Actions統合 — 非同期・スケジュール実行

```yaml
# .github/workflows/autonomous-agent.yml
name: 自律エージェント実行

on:
  # PRが作成・更新されたときにコードレビューを自動実行
  pull_request:
    types: [opened, synchronize]

  # 毎朝9時にコードベース監査を実行
  schedule:
    - cron: "0 0 * * 1-5"  # 平日UTC 0:00 = JST 9:00

jobs:
  auto-review:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            code-reviewer Subagentを使ってこのPRをレビューして。
            Criticalな問題があればPRにコメントして。
            問題がなければ承認コメントを残して。

  daily-audit:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "--model opus"
          prompt: |
            以下を並列で実行して日次レポートを生成して：
            1. npm audit でセキュリティ脆弱性を確認
            2. テストカバレッジが低下したファイルを検出
            3. 先週のコミットで増加した技術的負債を集計
            結果をdocs/daily-audit-$(date +%Y%m%d).md に保存して
            GitHubにPushして
```

---

## 実行と管理における注意点

### ⚠️ 注意1: `--dangerously-skip-permissions` の危険性

```bash
# 絶対にやってはいけない使い方
claude -p "本番DBをリセットして" --dangerously-skip-permissions
# → 確認なしで実行される。取り返しがつかない

# 安全な使い方（サンドボックス内のみ）
docker run --rm --network none \
  -v $(pwd):/workspace \
  my-sandbox-image \
  claude -p "テストを実行して" --dangerously-skip-permissions
```

公式ドキュメントより：

> *「`--dangerously-skip-permissions` はインターネットアクセスのないサンドボックス環境でのみ使うことを強く推奨する。任意のコマンドを実行するとデータ損失・システム破損・データ流出につながる可能性がある」*

**安全な権限設計のレイヤー構造：**

```
Level 1（最も安全）: デフォルト（毎回確認）
Level 2: --allowedTools で特定コマンドのみ許可
Level 3: PreToolUseフックで条件付き許可
Level 4: --dangerously-skip-permissions（サンドボックス内のみ）
```

### ⚠️ 注意2: 破壊的操作には必ずガードを設ける

```bash
# PreToolUseフックで危険なコマンドをブロック
# .claude/hooks/safety-guard.sh
#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command')

# 絶対に自律実行させないコマンド
BLOCKED_PATTERNS=(
  "git push.*--force"
  "git reset.*--hard"
  "rm -rf"
  "DROP TABLE"
  "DELETE FROM.*WHERE.*1=1"
  "vercel.*--prod"  # 本番デプロイは手動のみ
)

for PATTERN in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qE "$PATTERN"; then
    echo '{"decision":"block","reason":"危険なコマンドは手動確認が必要です"}'
    exit 0
  fi
done

echo '{}'  # ブロックしない場合は空のJSONを返す
```

```json
// settings.json にフックを登録
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/safety-guard.sh"
          }
        ]
      }
    ]
  }
}
```

### ⚠️ 注意3: 依存関係のあるタスクを並列にしない

```bash
# 悪い例（DBスキーマが確定する前にAPIを実装）
# Swarmで並列実行 →  APIエージェントが古いスキーマで実装 → コンフリクト

# 良い例（依存関係を明示したタスクファイル）
cat > .claude/tasks/task-4.2.md <<EOF
---
agent_name: api-implementation
dependencies: ["task-3.5-db-schema", "task-4.1-data-model"]
enabled: true
---
# DB設計が完了してからAPIを実装する
EOF
```

### ⚠️ 注意4: コンテキストウィンドウの管理

長時間の自律実行ではコンテキストが枯渇します：

```bash
# 長期タスクはフェーズに分割して都度コンパクト化
claude -p "Phase 1: 認証APIを実装して完了したら教えて"
# → 完了確認後
claude -p "/compact && Phase 2: 商品APIを実装して"
# → コンテキストを整理してから次のフェーズへ
```

### ⚠️ 注意5: 結果の検証を自動化する

```bash
# タスク完了後に自動検証するPostToolUseフック
# .claude/hooks/verify-completion.sh
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')

# PRが作成された後の自動検証
if [[ "$TOOL" == "Bash" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command')
  if echo "$CMD" | grep -q "gh pr create"; then
    # テストが通っているか確認
    pnpm test --silent
    if [ $? -ne 0 ]; then
      echo '{"decision":"block","reason":"テストが失敗しているためPR作成を中止します"}'
      exit 0
    fi
  fi
fi

echo '{}'
```

---

## 全体アーキテクチャまとめ

```
タスク投入
  ↓
CLAUDE.md（Knowledge）+ .claude/agents/（Playbook）参照
  ↓
Headless実行（-p フラグ）
  ↓
┌──────────────────────────────┐
│     Multi-Agent Swarm         │
│  coordinator（コーディネーター）│
│    ├→ worker-1（Worktree-1）  │
│    ├→ worker-2（Worktree-2）  │
│    └→ worker-3（Worktree-3）  │
└──────────────────────────────┘
  ↓
PreToolUse Hook（危険操作ブロック）
  ↓
実装・テスト・PR作成
  ↓
PostToolUse Hook（完了通知・検証）
  ↓
GitHub Actions（非同期監視）
  ↓
完了レポート → Slack通知
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| Headlessモード | ユーザーの対話なしでClaude Codeを自動実行するモード（`-p`フラグ） |
| `--allowedTools` | 自動承認するツールを明示的に指定するフラグ。セキュリティの要 |
| `--dangerously-skip-permissions` | 全ての確認プロンプトをスキップするフラグ。サンドボックス内専用 |
| Multi-Agent Swarm | 複数のClaude Codeインスタンスがtmuxで通信しながら協調するシステム |
| Worktree | Gitの機能。同じリポジトリを複数の独立したディレクトリで操作できる |
| tmux | ターミナルマルチプレクサ。複数のセッションを管理・相互通信できる |
| PreToolUse Hook | ツール実行前に割り込むスクリプト。危険なコマンドのブロックに使う |
| PostToolUse Hook | ツール実行後に割り込むスクリプト。通知・検証・ログに使う |
| Bare mode（`--bare`） | CI環境向けの高速起動モード。設定の自動検出をスキップ |
| サンドボックス | インターネット・ファイルシステムへのアクセスを制限した安全な実行環境 |

---

## まとめ

Claude CodeでDevinライクなシステムを構築するための核心は3点です：

1. **CLAUDE.md × Subagentで「記憶」を作る** — Devinの Knowledge/Playbook に相当する永続的な規約・手順書
2. **Headless × Multi-Agent Swarmで「自律性」を作る** — 対話なしで計画・実行・通知を完結させる
3. **Hooks × `--allowedTools` で「安全性」を担保する** — 自律化するほどガードが重要になる

完全に自律的なシステムは「どこまで任せるか」の設計が最も重要です。まずは **GitHub Actionsでのコードレビュー自動化** から始めて、段階的に自律度を高めていくことをお勧めします。
