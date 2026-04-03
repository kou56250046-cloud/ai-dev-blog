---
title: "Devin完全ガイド — 概要・Claude Codeとの違い・Knowledge/Playbook活用・モダナイゼーション実践"
date: 2026-04-03
category: blog
tags: [devin, claude-code, architecture, tips, setup]
summary: "Devinの概要からClaude Codeとの使い分け、Knowledge・Playbook機能の活用、Node.js/React/Figma連携、レガシーシステムのモダナイゼーション可視化まで体系的に解説。"
draft: false
---

## はじめに

「DevinとClaude Code、どう違うの？どちらを使えばいいの？」

2つとも「AIがコードを書いてくれるツール」ですが、**設計思想がまったく異なります**。Claude Codeは「開発者と並走するペアプログラマー」、Devinは「タスクを丸投げできる自律型エンジニア」です。

この記事では、Devinの仕組みをゼロから整理し、Knowledge・Playbook機能の実践的な使い方から、Node.js/React/Figmaとの組み合わせ、レガシーシステムのモダナイゼーション可視化まで一気に解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ DevinとClaude Codeの違いを整理して使い分けられる
- ✅ Knowledge・Playbookを使いDevinを自分のチームに最適化できる
- ✅ Node.js/React/Figmaと組み合わせた開発フローを組み立てられる
- ✅ レガシーシステムのモダナイゼーション作業をDevinで可視化・自動化できる

**学ぶ意義**: DevinとClaude Codeを適材適所で使い分けることで、AI駆動開発の生産性を最大化できる。特にレガシーシステムの近代化という「誰もやりたがらない仕事」をDevinが担える点が革命的。

---

## 時間がない人のための要約

1. **DevinはClaude Codeより「自律度が高い」** — タスクを渡したら完成まで自分でやってくれる。Claude Codeは逐次確認しながら進む
2. **KnowledgeとPlaybookがDevinの真価** — チームの規約・手順を学習させることで、繰り返し作業を完全自動化できる
3. **レガシー移行の可視化がDevinの得意分野** — 依存関係の分析・マイグレーション計画・段階的リファクタリングを丸ごと任せられる

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Devinアカウント | app.devin.ai（有料プラン） |
| Devin for Terminal | `npm install -g @devin-ai/devin-cli` |
| Node.js | 20.x 以上 |
| GitHubアカウント | Devin連携用 |
| Claude Codeアカウント | 比較・併用のために推奨 |

---

## Devinとは何か — 概要

### Devinの定義

**Devin** はCognition社が開発した「世界初の自律型AIソフトウェアエンジニア」です。2024年に登場し、独自のサンドボックス環境（ブラウザ・ターミナル・エディタ）を持ち、タスクを渡すと自力で計画・実装・テスト・PRまで完結できます。

```
Devin の動作フロー

タスク入力
  └→ 計画立案（自律的にステップを設計）
       └→ 環境構築（必要なパッケージをインストール）
            └→ 実装（コードを書く）
                 └→ テスト（動作確認・デバッグ）
                      └→ PR作成（GitHubへ自動push）
                           └→ 完了通知（Slack・メール）
```

### Devinのエージェント種別

Devinには用途別に3つのエージェントがあります。

| エージェント | 用途 | 特徴 |
|---|---|---|
| **Devin**（標準） | 実装・リファクタリング | 汎用の自律型エンジニア |
| **Advanced Devin** | 複雑なアーキテクチャ変更 | より長期・複雑なタスク向け |
| **Dana** | データ分析・Slack連携 | Slackから呼び出せるデータアナリスト |
| **Ada（Ask Devin）** | コードベース質問応答 | 既存コードの質問・説明 |

---

## Claude CodeとDevinの違い

### 設計思想の根本的な違い

```
Claude Code：ペアプログラミング型
  人間 ◄──対話──► Claude Code
  ・逐次確認しながら進む
  ・人間が最終判断する
  ・ターミナル上でリアルタイム作業

Devin：自律型エージェント型
  人間 ──指示──► Devin ──完了通知──► 人間
  ・タスクを丸投げして待つ
  ・Devinが自律的に判断・実行
  ・ブラウザ上のダッシュボードで進捗確認
```

### 機能比較表

| 比較項目 | Claude Code | Devin |
|---|---|---|
| **操作スタイル** | 対話型（逐次） | 自律型（丸投げ） |
| **コンテキスト** | ターミナル・ローカル環境 | クラウドサンドボックス |
| **長時間タスク** | 苦手（セッション制限） | 得意（数時間〜） |
| **チーム規約の学習** | CLAUDE.md で対応 | Knowledge機能で対応 |
| **繰り返し手順の自動化** | なし | Playbook機能で対応 |
| **PR自動作成** | MCPで可能 | ネイティブ対応 |
| **Slack連携** | なし | Dana経由で対応 |
| **料金** | Anthropic API従量課金 | 月額サブスク（セッション数制限） |
| **向いているタスク** | 短期・精密・対話的な作業 | 長期・反復・非同期な作業 |

### どちらを使うか — 判断基準

```
Claude Codeを選ぶ場面：
  ✅ 「このバグを直して」「ここをリファクタして」など短時間タスク
  ✅ 実装の過程を自分で確認・学習したい
  ✅ 細かい指示を出しながら進めたい

Devinを選ぶ場面：
  ✅ 「このライブラリをv18からv19に移行して」など長期タスク
  ✅ 同じパターンの作業を複数リポジトリに適用したい
  ✅ 非同期で進めて完成したら教えてほしい
```

---

## 手順

### 1. Devin for Terminalをインストールする

ローカル環境からDevinを呼び出せるCLIツールです。

```bash
npm install -g @devin-ai/devin-cli
```

インストール後、プロジェクトディレクトリで起動します。

```bash
# 対話型REPLを起動
devin

# プロンプトを指定して起動
devin -- "このコードのバグを調査して修正案を出して"

# 単発実行（結果を標準出力）
devin -p -- "テストを全部通るようにして"
```

### 2. Claude CodeとDevinの設定を共有する

Devin for Terminalは **Claude Codeの設定を自動インポート** できます。CLAUDE.mdに書いたルールをDevinも参照できるようになります。

```json
// .devin/config.json
{
  "read_config_from": {
    "claude": true,   // CLAUDE.mdを読み込む
    "cursor": false,
    "windsurf": false
  }
}
```

> **ポイント**: この設定により、プロジェクトのCLAUDE.mdに書いたコーディング規約・禁止事項をDevinも遵守します。

### 3. Knowledge機能 — Devinにチームの知識を教え込む

**Knowledge**はDevinが参照する「プロジェクト固有の知識ベース」です。一度登録すれば、以降のすべてのセッションで自動参照されます。

登録できる内容の例：

```markdown
# Knowledge: デプロイ手順

## 本番デプロイの前に必ずやること
1. `pnpm test` を実行してすべてのテストが通ることを確認
2. `pnpm build` でビルドエラーがないことを確認
3. PRのdescriptionにVercelのプレビューURLを貼る
4. main branchへのマージはSquash mergeを使う

## 使ってはいけないパッケージ
- moment.js（→ date-fnsを使う）
- lodash（→ 必要な関数のみimport）
```

Knowledgeの登録方法：

```bash
# Devinのダッシュボードから
# app.devin.ai/knowledge → 「Add Knowledge」

# またはCLIから
devin -- "以下をKnowledgeに追加して: [内容]"
```

### 4. Playbook機能 — 繰り返し手順を自動化する

**Playbook**は「タスクの手順書」をDevinに覚えさせる機能です。一度Playbookを作れば、「このPlaybookを実行して」の一言で同じ手順を何度でも再現できます。

**実例: React 18→19 移行Playbook**

```txt
Build React 18→19 upgrade playbook

We're upgrading our React app from v18 to v19.
Here's the official upgrade guide:
https://react.dev/blog/2024/04/25/react-19-upgrade-guide

Build a migration playbook specific to our codebase:
- Install react@18.3 first and fix every deprecation warning
  before touching v19
- Find all uses of forwardRef and plan the ref-as-prop migration
- Identify components using the legacy Context API
  (contextTypes, getChildContext) that need conversion to createContext
- Flag any string ref usage or legacy lifecycle methods
- List TypeScript files that need updated ref types
- Order the steps so we can ship incrementally
- Include a validation step after each phase
```

このプロンプトでPlaybookを作成すると、次回から：

```bash
devin -- "React 18→19移行Playbookを実行して"
```

の一言で同じ手順が再現されます。

### 5. Node.js / React / Figmaとの組み合わせ

**Node.js との組み合わせ：**

```bash
# APIエンドポイントの一括追加
devin -- "src/api/ 以下にあるすべてのルートにJWT認証ミドルウェアを追加して。
テストも書いて。"

# パッケージのセキュリティ更新
devin -- "npm audit で出ている脆弱性をすべて修正して。
破壊的変更があるものは影響範囲をレポートして。"
```

**React との組み合わせ：**

```bash
# コンポーネントの型安全化
devin -- "src/components/ 以下のすべてのコンポーネントに
TypeScriptの型定義を追加して。any型は禁止。"

# テストカバレッジの向上
devin -- "カバレッジが50%以下のコンポーネントにVitest/RTLのテストを追加して。
目標カバレッジは80%。"
```

**Figmaとの組み合わせ：**

```bash
# FigmaデザインをReactコンポーネントに変換
devin -- "以下のFigmaリンクのデザインをReactコンポーネントとして実装して。
Tailwind CSSを使って。レスポンシブ対応も含める。
[Figmaのリンク]"
```

> **ポイント**: DevinはFigmaのリンクを渡すとデザインを直接参照できます。DesignからImplementationへの変換を自動化できます。

---

## レガシーシステムとモダナイゼーションの可視化

### Devinがレガシー移行で強い理由

レガシーシステムのモダナイゼーションは：
1. 影響範囲の把握が難しい
2. 手順が長くて途中で止まりやすい
3. テストが少なくて変更が怖い

この3つすべてにDevinが対応できます。

### Step 1: コードベースの依存関係を可視化する

```bash
devin -- "このリポジトリ全体を分析して以下をレポートして：
1. 使用している外部パッケージとバージョン一覧（古いもの順）
2. 非推奨APIの使用箇所（ファイル名・行番号付き）
3. 循環依存しているモジュールの一覧
4. テストカバレッジが0%のファイル一覧
レポートはMarkdown形式で docs/tech-debt.md に出力して"
```

### Step 2: 移行の優先順位をPlaybookで定義する

```bash
devin -- "以下の技術的負債を解消するPlaybookを作成して：

優先度1（セキュリティリスク）:
- node-uuid → crypto.randomUUID()に移行
- moment.js → date-fnsに移行

優先度2（パフォーマンス）:
- require() → ESModule importに移行
- コールバック → async/awaitに移行

優先度3（型安全性）:
- JavaScript → TypeScriptに移行（段階的）

各優先度ごとに独立したPlaybookを作成して。
それぞれ影響範囲テスト→変更→動作確認の順で進める手順にすること。"
```

### Step 3: 段階的移行の実行と可視化

```bash
devin -- "tech-debt.md を参照して、
優先度1のmoment.js → date-fns移行を実施して。

条件：
- 一度に変更するファイルは5つまで
- 各バッチ後に既存テストが通ることを確認
- 変更内容をコミットメッセージに明記
- 最後に変更済みファイル一覧をdocs/migration-log.md に追記"
```

### 可視化の成果物イメージ

Devinが自動生成するドキュメントの例：

```markdown
# 移行ログ 2026-04-03

## 完了: moment.js → date-fns 移行

### 変更ファイル（7件）
- src/utils/date.ts（完了）
- src/components/ArticleCard.astro（完了）
- src/pages/blog/index.astro（完了）
...

### テスト結果
- 変更前: 142件パス / 3件スキップ
- 変更後: 142件パス / 3件スキップ ✅

### 次のバッチ
- src/layouts/BlogLayout.astro
- src/utils/content.ts
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| Devin | Cognition社が開発した自律型AIソフトウェアエンジニア |
| Knowledge | Devinに教え込むプロジェクト固有の知識・ルール |
| Playbook | Devinが繰り返し実行できる手順書。一度作れば何度でも再現可能 |
| サンドボックス | Devinが作業する隔離された仮想環境（ブラウザ・ターミナル込み） |
| Dana | DevinのSlack連携データアナリストエージェント |
| Ada（Ask Devin） | コードベースへの質問応答専用エージェント |
| モダナイゼーション | 古いシステム・コードを現代の技術・設計に移行すること |
| 技術的負債 | 短期的な対応策が積み重なった結果、後から修正コストが高くなった状態 |
| 循環依存 | モジュールAがBに依存し、BもAに依存している状態。バグの温床になりやすい |

---

## まとめ

DevinとClaude Codeは「競合」ではなく「補完関係」にあります。

| 場面 | 推奨ツール |
|---|---|
| 今すぐ細かく修正したい | Claude Code |
| 長期タスクを非同期で任せたい | Devin |
| チームの規約を学習させたい | Devin（Knowledge） |
| 同じ手順を繰り返したい | Devin（Playbook） |
| FigmaからReact実装 | Devin |
| レガシー移行の可視化 | Devin |

**次のステップ**: まず `app.devin.ai` でReact移行のPlaybookを1つ作ってみてください。一度Playbookを体験すると、繰り返し作業がいかに自動化できるかが実感できます。
