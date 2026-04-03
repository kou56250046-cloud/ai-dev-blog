---
title: "Claude Code コマンドチートシート"
date: 2026-04-03
category: cheatsheet
tags: [claude-code, cli, tips]
summary: "Claude Codeでよく使うコマンド・ショートカット・スラッシュコマンドをまとめたリファレンス。"
draft: false
---

## 起動

```bash
claude          # 対話モードで起動
claude "質問"   # ワンショットで質問
claude -p       # プリントモード（結果をstdoutへ）
```

## スラッシュコマンド（対話中）

| コマンド | 説明 |
|---------|------|
| `/help` | ヘルプ表示 |
| `/clear` | 会話リセット |
| `/commit` | Git コミット作成 |
| `/review-pr` | PRレビュー |
| `/diff` | 変更差分の確認 |

## キーボードショートカット

| ショートカット | 動作 |
|---------|------|
| `Ctrl+C` | 現在の処理を中断 |
| `Ctrl+D` | Claude Code を終了 |
| `↑` / `↓` | 履歴ナビゲーション |

## CLAUDE.md の使い方

プロジェクトルートに `CLAUDE.md` を置くと、Claudeが自動で読み込みます。

```markdown
# プロジェクトルール
- TypeScriptを使う
- コメントは日本語
- テストは必ず書く
```

## 権限モード

```bash
claude --allowedTools "Read,Write,Bash"   # 特定ツールのみ許可
claude --dangerouslySkipPermissions       # 全て自動承認（注意）
```
