---
title: "設計書をMarkdownで書く意義とClaude Codeで作成するおすすめ手順・注意点"
date: 2026-04-03
category: blog
tags: [claude-code, architecture, setup, config, tips]
summary: "要件定義・アーキテクチャ・DB・API・サイトマップをMarkdownで管理する意義と記載内容、Claude Codeを使った作成手順と注意点を体系的に解説。"
draft: false
---

## はじめに

「設計書はWordやNotionで書くもの」と思っていませんか？

AI駆動開発では、設計書を**Markdownファイルとしてリポジトリに置く**ことが最重要の習慣になります。なぜなら Claude Code は**ファイルを読んで動く**からです。設計意図がリポジトリ内のMarkdownに書かれていれば、Claudeはそれを参照して「なぜこの設計なのか」を理解した上でコードを書きます。

この記事では、各設計書（CLAUDE.md・要件定義・アーキテクチャ・DB・API・サイトマップ）の意義・記載内容・Claude Codeでの作成手順と注意点を体系的に整理します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ 各Markdownファイルが「なぜ必要か」を説明できる
- ✅ 設計書に何を書くべきかの判断基準を持てる
- ✅ Claude Codeを使って設計書を効率よく作成できる
- ✅ よくある失敗パターンを避けられる

**学ぶ意義**: 設計書をMarkdownで管理することで、Claudeへの指示精度が飛躍的に上がる。曖昧な指示で試行錯誤するより、設計書への1時間の投資が開発全体の品質と速度を決める。

---

## 時間がない人のための要約

1. **Markdownで設計書を書く最大の理由は「Claudeが読めるから」** — WordやNotionはClaudeに読み込めない。Gitで管理できるMarkdownが最強
2. **CLAUDE.mdは500行以内に収める** — 長すぎると指示が無視される。詳細は別ファイルに分けて `@ファイル名` で参照させる
3. **作成順序が重要** — CLAUDE.md → 要件定義 → アーキテクチャ → DB → API → サイトマップ の順で作ると迷わない

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Claude Code | 最新版 |
| Git | リポジトリ初期化済み |
| エディタ | VSCode（Markdown Preview推奨） |
| pnpm / npm | パッケージ管理用 |

---

## なぜMarkdownで設計書を書くのか

### Claude Codeはファイルを読んで動く

Claude Codeが最初に行うことは「プロジェクトのファイルを読む」ことです。公式ドキュメントでは以下のように推奨されています：

> *「すべてのチームメンバーが共有のプロジェクトコンテキストを持てるよう、CLAUDE.mdをソースコントロールにコミットすることを推奨する」*

NotionやConfluenceに書いた設計書は**Claudeに渡せません**。リポジトリ内のMarkdownなら、Claude Codeが自動で読み込みます。

### Markdownで管理する4つのメリット

```
1. Claudeが参照できる
   → 設計意図をAIが理解した上でコードを書く

2. Gitで変更履歴を追える
   → 「なぜこの設計にしたか」が後から分かる

3. コードと同じ場所で管理できる
   → コード変更と設計書変更を同一PRに含められる

4. チームで共有できる
   → GitHubを見れば全員が最新の設計書にアクセスできる
```

### @構文でモジュール化する

CLAUDE.mdが肥大化してきたら、`@ファイル名` で別ファイルを参照できます。

```markdown
<!-- CLAUDE.md -->
# このプロジェクトの設計概要

プロジェクト全体の設計は以下のドキュメントを参照：

- アーキテクチャ設計: @docs/architecture.md
- データベース設計: @docs/database.md
- API設計: @docs/api.md
- サイトマップ: @docs/sitemap.md
```

> **公式の推奨**: CLAUDE.mdは**500行以内**に収める。長すぎると後半の指示がClaudeに無視されるリスクがある。

---

## 各設計書の意義と記載内容

### 1. CLAUDE.md — プロジェクトのSSoT（唯一の真実）

**存在意義**: Claude Codeが最初に読み込む「AIへの仕様書」。ここに書かれたことがClaudeの行動規範になる。

**記載すべき内容:**

```markdown
# CLAUDE.md テンプレート

## プロジェクト概要
- 何を作るか（1〜2行）
- 誰が使うか
- 運用方針（個人 / チーム / 公開）

## 技術スタック（確定版のみ）
| レイヤー | 技術 | バージョン | 選定理由 |
|---|---|---|---|
| フレームワーク | Next.js | 14.x | App Router対応 |
...

## コーディング規約
- 言語: TypeScript（anyは禁止）
- スタイル: Tailwind CSS
- import順: 外部 → 内部 → 型

## 禁止事項
- DBを追加しない（Phase 1）
- 外部APIの有料プラン使用禁止

## よく使うコマンド
\`\`\`bash
pnpm dev     # 開発サーバー
pnpm build   # 本番ビルド
pnpm test    # テスト実行
\`\`\`

## フェーズ管理
- [x] Phase 1: 基盤構築
- [ ] Phase 2: 機能拡充
```

**書くべきでないもの（コンテキストを無駄に消費する）:**
- コードパターンや実装の詳細（コードを読めばわかる）
- gitの変更履歴（`git log`で確認できる）
- デバッグの解決策（コミットメッセージに書く）

---

### 2. 要件定義書 — 「何を作るか」の全体像

**存在意義**: 実装前に「作るもの・作らないもの」を明確にする。Claudeが機能追加を提案してきたとき「それはスコープ外」と判断できる根拠になる。

**ファイル配置**: `docs/requirements.md`

**記載すべき内容:**

```markdown
# 要件定義書

## プロジェクト目的
（なぜこのシステムを作るのか・解決したい課題）

## ユーザー定義
| ユーザー種別 | 説明 | 主な操作 |
|---|---|---|
| 管理者 | システム全体を管理する | ユーザー管理・コンテンツ管理 |
| 一般ユーザー | サービスを利用する | 記事閲覧・コメント投稿 |

## 機能要件（実装するもの）
### Phase 1（必須）
- [ ] ユーザー認証（メール・パスワード）
- [ ] 記事の作成・編集・削除
- [ ] タグによる絞り込み

### Phase 2（拡張）
- [ ] 検索機能
- [ ] ダークモード

## 非機能要件
| 項目 | 要件 |
|---|---|
| パフォーマンス | LCP 2.5秒以内 |
| セキュリティ | OWASP Top 10対応 |
| 対応ブラウザ | Chrome / Safari 最新2バージョン |

## スコープ外（作らないもの）
- モバイルアプリ（Webのみ）
- 多言語対応（日本語のみ）
```

---

### 3. アーキテクチャ設計書 — 「どう作るか」の骨格

**存在意義**: システム全体の構成・データの流れ・各コンポーネントの責務を定義する。Claudeが新しいファイルを作るとき「どのディレクトリに置くべきか」の根拠になる。

**ファイル配置**: `docs/architecture.md`

**記載すべき内容:**

```markdown
# アーキテクチャ設計書

## システム構成図

\`\`\`
ブラウザ
  └→ Vercel（CDN・SSG）
       └→ Next.js App Router
            ├→ Server Components（データ取得）
            ├→ Client Components（インタラクション）
            └→ Supabase（DB・Auth・Storage）
\`\`\`

## ディレクトリ構成と責務

\`\`\`
src/
├── app/          # ルーティング（Next.js App Router）
│   ├── (auth)/   # 認証が必要なページ群
│   └── api/      # APIルート
├── components/
│   ├── ui/       # 汎用UIコンポーネント（ボタン等）
│   └── features/ # 機能別コンポーネント
├── lib/          # 外部サービスのクライアント初期化
├── actions/      # Server Actions（フォーム処理）
└── types/        # 型定義
\`\`\`

## データフロー
（ページ表示時・フォーム送信時それぞれの流れ）

## 採用技術の選定理由
（なぜNext.jsを選んだか・なぜSupabaseを選んだか）

## 将来的な拡張方針
（Phase 3以降に追加する可能性のある技術）
```

---

### 4. データベース設計書 — テーブル・カラム・関係の定義

**存在意義**: Claudeが「このデータをどのテーブルに保存するか」「どのカラムを参照するか」を正確に判断できるようになる。特にSupabase MCP使用時、自然言語でのDB操作の精度が大幅に上がる。

**ファイル配置**: `docs/database.md`

**記載すべき内容:**

```markdown
# データベース設計書

## ER図（簡易）

\`\`\`
users ──< posts >── tags
  |                  |
  └──< comments      └──< post_tags
\`\`\`

## テーブル定義

### users テーブル
| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default: gen_random_uuid() | ユーザーID |
| email | text | UNIQUE, NOT NULL | メールアドレス |
| display_name | text | NOT NULL | 表示名 |
| created_at | timestamptz | default: now() | 作成日時 |

### posts テーブル
| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 記事ID |
| user_id | uuid | FK → users.id | 投稿者 |
| title | text | NOT NULL | タイトル |
| body | text | NOT NULL | 本文（Markdown） |
| published | boolean | default: false | 公開フラグ |

## RLSポリシー
\`\`\`sql
-- posts: 自分の投稿のみ更新・削除可能
CREATE POLICY "users can update own posts"
ON posts FOR UPDATE
USING (auth.uid() = user_id);
\`\`\`

## インデックス設計
（検索頻度の高いカラムにインデックスを定義）
```

---

### 5. API設計書 — エンドポイント・リクエスト・レスポンスの定義

**存在意義**: フロントエンドとバックエンドの「契約書」。Claudeがフロント実装とAPI実装を同時に担当するとき、仕様の不整合を防ぐ。

**ファイル配置**: `docs/api.md`

**記載すべき内容:**

```markdown
# API設計書

## 基本仕様
- Base URL: `/api/v1`
- 認証方式: Bearer Token（Supabase JWT）
- レスポンス形式: JSON
- エラー形式: `{ "error": "メッセージ", "code": "ERROR_CODE" }`

## エンドポイント一覧

### 記事API

#### GET /api/v1/posts
記事一覧を取得する

**クエリパラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| limit | number | - | 取得件数（デフォルト: 20） |
| tag | string | - | タグでフィルタ |

**レスポンス（200）:**
\`\`\`json
{
  "posts": [
    {
      "id": "uuid",
      "title": "記事タイトル",
      "summary": "要約",
      "published_at": "2026-04-03T00:00:00Z",
      "tags": ["astro", "setup"]
    }
  ],
  "total": 42
}
\`\`\`

#### POST /api/v1/posts
新規記事を作成する（要認証）

**リクエストボディ:**
\`\`\`json
{
  "title": "string（必須）",
  "body": "string（必須）",
  "tags": ["string"]
}
\`\`\`

## エラーコード一覧
| コード | HTTPステータス | 説明 |
|---|---|---|
| UNAUTHORIZED | 401 | 認証トークンが無効 |
| NOT_FOUND | 404 | リソースが存在しない |
| VALIDATION_ERROR | 422 | 入力値が不正 |
```

---

### 6. サイトマップ — URL構造とページの役割

**存在意義**: どのURLがどんなページかをClaudeが把握できる。「ブログ一覧ページを作って」と指示したとき、正しいファイルパスとURL構造でページを生成できる。

**ファイル配置**: `docs/sitemap.md`

**記載すべき内容:**

```markdown
# サイトマップ

## URL構造

\`\`\`
/                          トップページ（LP風・HeroSection）
├── /blog                  記事一覧（カードグリッド）
│   └── /blog/[slug]       記事詳細（Markdownレンダリング）
├── /cheatsheet            チートシート一覧
├── /snippets              スニペット一覧
├── /roadmap               学習ロードマップ
└── /tags/[tag]            タグ別記事一覧
\`\`\`

## 各ページの仕様

| URL | ファイル | 認証 | SSG/SSR | 説明 |
|---|---|---|---|---|
| / | pages/index.astro | 不要 | SSG | LP風トップ |
| /blog | pages/blog/index.astro | 不要 | SSG | 記事一覧 |
| /blog/[slug] | pages/blog/[slug].astro | 不要 | SSG | 記事詳細 |

## ナビゲーション構造
\`\`\`
Header
  ├── ロゴ（/ へリンク）
  ├── ブログ（/blog）
  ├── チートシート（/cheatsheet）
  └── ロードマップ（/roadmap）
\`\`\`

## OGP・メタタグ方針
（各ページのtitle・description・OG imageの生成ルール）
```

---

## 手順：Claude Codeで設計書を作成するおすすめ手順

### 1. CLAUDE.mdを最初に作る

すべての設計書の中でCLAUDE.mdが最優先です。他の設計書を作る前に、最低限の骨格だけでもCLAUDE.mdを作ってください。

```bash
# Claude Codeへの指示
claude -- "このプロジェクトのCLAUDE.mdを作成して。
技術スタック: Next.js 14 + TypeScript + Supabase + Vercel
目的: 個人ブログアプリ
コーディング規約: TypeScript strict・Tailwind CSS・anyは禁止
まずは骨格だけ作って、詳細は後で追加する"
```

### 2. 要件定義書を作る（Claudeと対話しながら）

```bash
claude -- "docs/requirements.md を作成して。
以下の情報をもとに要件定義書のMarkdownを生成して：

目的: AI駆動開発の学習ログを管理するブログ
ユーザー: 個人（自分のみ）
必須機能: 記事投稿・タグ管理・記事一覧・全文検索
不要機能: コメント・認証・多言語対応
技術制約: 完全無料・DBなし（Markdownで管理）

スコープ外の機能も明示すること"
```

### 3. アーキテクチャ設計書を作る

```bash
claude -- "docs/architecture.md を作成して。
CLAUDE.mdの技術スタックを参照して、
システム構成図（テキスト図）・ディレクトリ構成・データフロー・
採用技術の選定理由を含めること。
将来的な拡張方針（Phase 3以降）も記載すること"
```

### 4. DB・API・サイトマップを要件定義書から生成する

```bash
# DBを使うプロジェクトの場合
claude -- "docs/requirements.md を読んで、
docs/database.md を作成して。
テーブル定義・ER図・RLSポリシー・インデックスを含めること"

# サイトマップ
claude -- "docs/requirements.md と CLAUDE.mdを読んで、
docs/sitemap.md を作成して。
URL構造・各ページの仕様テーブル・ナビゲーション構造を含めること"
```

### 5. CLAUDE.mdに参照を追加する

設計書が揃ったら、CLAUDE.mdから @構文で参照します。

```bash
claude -- "CLAUDE.mdに以下を追記して：
詳細設計書へのリンクを @構文で追加する。
docs/requirements.md・docs/architecture.md・
docs/database.md・docs/sitemap.md を参照させること"
```

---

## 注意点：よくある失敗パターン

### ❌ 失敗1: CLAUDE.mdが長すぎる

```markdown
<!-- 悪い例: 1000行を超えたCLAUDE.md -->
# コーディング規約
（300行の詳細ルール）
# デプロイ手順
（200行のステップバイステップ）
...
```

公式ドキュメントでは「CLAUDE.mdが長すぎると後半の指示が無視されるリスクがある」と明記されています。

```markdown
<!-- 良い例: CLAUDE.mdは500行以内・詳細は別ファイルに -->
# コーディング規約（概要のみ）
- TypeScript strict mode
- 詳細: @docs/coding-standards.md

# デプロイ手順
- 詳細: @docs/deployment.md
```

### ❌ 失敗2: 設計書を作らずに実装から始める

```bash
# 悪い例
claude -- "ブログアプリを作って"
# → Claudeが独断で技術スタックと設計を決めてしまう
```

```bash
# 良い例
# 1. まずCLAUDE.mdに技術スタックを書く
# 2. 要件定義書で「作るもの・作らないもの」を決める
# 3. 実装を開始する
claude -- "CLAUDE.mdと要件定義書を読んで、トップページを実装して"
```

### ❌ 失敗3: 設計書を更新しないで実装を変える

設計書は「現時点の真実」でなければなりません。

```bash
# 悪い例: 実装だけ変えて設計書は古いまま放置
claude -- "PostテーブルにviewsカラムをSQLで追加して"
# → docs/database.md は古いまま → 次回Claudeが混乱する

# 良い例: 実装と設計書を同時に更新
claude -- "PostテーブルにviewsカラムをSQLで追加して。
docs/database.md のPostテーブル定義も同時に更新すること"
```

### ❌ 失敗4: コードに書けばわかることを設計書に書く

CLAUDE.mdに「変数名はcamelCaseを使う」と書く必要はありません。コードを見ればわかります。設計書には「なぜそうするのか」という**意図・判断・制約**を書きます。

```markdown
<!-- 不要な記載 -->
- 変数名はcamelCaseを使う

<!-- 必要な記載 -->
- moment.jsは使用禁止（date-fnsを使うこと）
  理由: バンドルサイズが10倍大きいため
```

---

## 設計書作成の推奨順序まとめ

```
Step 1: CLAUDE.md（骨格のみ・500行以内）
  ↓
Step 2: docs/requirements.md（何を作るか・スコープ外も明記）
  ↓
Step 3: docs/architecture.md（どう作るか・ディレクトリ構成）
  ↓
Step 4: docs/sitemap.md（URL構造・ページ一覧）
  ↓
Step 5: docs/database.md（DBを使う場合のみ）
  ↓
Step 6: docs/api.md（APIを作る場合のみ）
  ↓
Step 7: CLAUDE.mdに @構文で各設計書を参照させる
  ↓
Step 8: 実装開始
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| SSoT | Single Source of Truth。情報を1か所で管理し矛盾をなくす考え方 |
| CLAUDE.md | Claude Codeが自動で読み込むプロジェクト設定ファイル |
| @構文 | CLAUDE.md内で別ファイルを参照する記法（`@docs/api.md`） |
| フロントマター | Markdownの先頭にある `---` で囲まれたメタデータ |
| RLS | Row Level Security。行単位でDBアクセス権限を制御する仕組み |
| ER図 | Entity-Relationship図。テーブル間の関係を図示したもの |
| スコープ外 | プロジェクトで「作らない」と明示的に決めた機能・範囲 |
| App Router | Next.js 13以降の新しいルーティング方式（`app/`ディレクトリ） |

---

## まとめ

設計書をMarkdownで書くことは「Claudeへの投資」です。最初の1〜2時間を設計書作成に使うことで、実装フェーズでの手戻りと曖昧な指示による試行錯誤が激減します。

**今すぐできること:**

1. プロジェクトルートにCLAUDE.mdが存在するか確認する
2. 技術スタック・禁止事項・よく使うコマンドが書かれているか確認する
3. 500行を超えていたら `@構文` で外部ファイルに分離する

設計書の品質が、AI駆動開発の品質を決めます。
