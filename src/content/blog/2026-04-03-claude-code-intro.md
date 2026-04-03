---
title: "Claude Codeを使い始めた — 最初の感想と基本的な使い方"
date: 2026-04-03
category: blog
tags: [claude-code, setup, tips]
summary: "AnthropicのCLI「Claude Code」を導入してみた。インストールから最初のタスク実行まで、実際に試して気づいたことをまとめた。"
draft: false
---

## はじめに

**Claude Code** はAnthropicが開発したターミナルで動くAIコーディングアシスタントです。
VSCodeの中からも使えるし、単体のCLIとしても動作します。

## インストール

```bash
npm install -g @anthropic-ai/claude-code
```

インストール後、`claude` コマンドが使えるようになります。

```bash
claude --version
```

## 最初のタスク

プロジェクトのルートで `claude` と打つだけで対話モードが起動します。

```
$ claude
> このコードのバグを直して
```

### 実際にやってみて驚いたこと

1. **ファイルを自動で読む** — 「このバグを直して」と言うだけで、関連ファイルを勝手に読み込んでくれる
2. **複数ファイルを跨いで編集** — コンポーネントとその型定義ファイルを同時に修正してくれた
3. **説明が丁寧** — なぜその修正をしたか、理由まで教えてくれる

## まとめ

思ったより賢くて驚いた。これからこのブログでClaude Codeを使った学習の記録を残していきます。
