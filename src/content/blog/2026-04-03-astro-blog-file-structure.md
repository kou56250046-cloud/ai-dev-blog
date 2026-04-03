---
title: "Astroブログのファイル構成と各ファイルの存在意義を完全解説"
date: 2026-04-03
category: blog
tags: [astro, architecture, setup, config]
summary: "このブログアプリを構成するファイル・ディレクトリの役割を体系的に整理。なぜその構成なのかを含めて解説する。"
draft: false
---

## はじめに

「ファイルがたくさんあって、どれが何をしているのかわからない」

Webアプリ開発でよくある悩みです。このブログアプリ（ai-dev-blog）はAstroというフレームワークで構築されていますが、ゼロから見ると`.astro`ファイルや`content`ディレクトリなど見慣れないものが並んでいます。

この記事では、プロジェクトのファイル構成を**役割・存在意義**の観点からひとつずつ整理します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ このブログアプリのファイル構成を俯瞰して理解できる
- ✅ 各ファイル・ディレクトリが「なぜ存在するのか」を説明できる
- ✅ Astroプロジェクト全体の情報の流れを把握できる

**学ぶ意義**: ファイル構成を理解することで、記事追加・デザイン変更・機能追加を迷わず行える。構造がわかると、AIへの指示精度も上がる。

---

## 時間がない人のための要約

1. **`src/content/`が記事の置き場** — MarkdownファイルをここにおくだけでWebページになる
2. **`src/pages/`がURL構造を決める** — ファイル名＝URLパスというシンプルなルール
3. **設定ファイル群（`astro.config.mjs`等）はほぼ触らなくていい** — 初期設定済みで完結している

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Node.js | 20.x 以上 |
| pnpm | 9.x 以上 |
| Astro | 4.15.0 |
| エディタ | VSCode（Astro拡張推奨） |

---

## 手順

### 1. プロジェクト全体のディレクトリ構成を把握する

まずトップレベルのファイル・フォルダを確認します。

```bash
# プロジェクトルートで実行
ls -la
```

実際の構成はこうなっています：

```
Brog-app/
├── .astro/           ← Astroが自動生成するキャッシュ（触らない）
├── .claude/          ← Claude Code用の設定・ルール
├── dist/             ← ビルド成果物（触らない・gitignore済み）
├── node_modules/     ← インストール済みパッケージ（触らない）
├── public/           ← 静的ファイル置き場（画像・faviconなど）
├── src/              ← ★ここが開発の主戦場
├── astro.config.mjs  ← Astroの設定ファイル
├── CLAUDE.md         ← このプロジェクトのSSoT（仕様書）
├── package.json      ← 依存パッケージとコマンド定義
├── pnpm-lock.yaml    ← パッケージバージョンの固定ファイル
├── tailwind.config.mjs ← Tailwind CSSの設定
└── tsconfig.json     ← TypeScriptの設定
```

### 2. `src/` 以下の構成を理解する

開発に関わるコードはすべて `src/` 以下に集約されています。

```
src/
├── content/      ← ★記事・コンテンツのMarkdownファイル
├── pages/        ← ★URLルーティング（ファイル名＝URL）
├── components/   ← UIの部品（Header・Cardなど）
├── layouts/      ← ページ全体の枠組み
├── styles/       ← グローバルCSS
└── utils/        ← 共通関数（日付フォーマットなど）
```

> **ポイント**: `content/` と `pages/` の2つを理解すれば、このアプリの動き方の80%がわかります。

### 3. `src/content/` — コンテンツ管理の中枢

記事はすべてMarkdownファイルとして `src/content/` 以下に置きます。

```
src/content/
├── config.ts       ← ★スキーマ定義（フロントマターの型チェック）
├── blog/           ← ブログ記事
│   └── 2026-04-03-claude-code-intro.md
├── cheatsheet/     ← コマンドリファレンス
├── snippets/       ← 再利用コードスニペット
├── design/         ← 設計メモ
└── roadmap/        ← 学習ロードマップ
```

**`config.ts` が特に重要**です。ここでフロントマターの型を定義しており、必須フィールドの漏れをビルド時に自動検出してくれます。

```typescript
// src/content/config.ts の概要
const baseSchema = z.object({
  title:    z.string(),           // 必須
  date:     z.coerce.date(),      // 必須
  category: z.enum(['blog', ...]),// 必須・列挙値のみ
  tags:     z.array(z.string()),  // 必須
  summary:  z.string().max(200),  // 必須・200文字以内
  draft:    z.boolean().default(false), // 省略可
});
```

> **ポイント**: 記事の追加は「Markdownファイルを正しいフォルダに置くだけ」。DBへの登録やCMS操作は一切不要。

### 4. `src/pages/` — URL構造を決める場所

Astroはファイルベースルーティングを採用しています。**ファイルのパスがそのままURLになります。**

```
src/pages/
├── index.astro          → https://example.com/
├── blog/
│   ├── index.astro      → https://example.com/blog/
│   └── [slug].astro     → https://example.com/blog/claude-code-intro
├── cheatsheet/
│   └── index.astro      → https://example.com/cheatsheet/
└── tags/
    └── [tag].astro      → https://example.com/tags/astro
```

`[slug].astro` や `[tag].astro` の**角括弧**は「動的ルート」を意味します。`content/` 以下のファイル数だけページが自動生成されます。

### 5. 設定ファイル群の役割

各設定ファイルが何をしているかを整理します。

```bash
# 設定ファイルの内容確認
cat astro.config.mjs
cat tailwind.config.mjs
```

**`astro.config.mjs`** — Astroの統合プラグインを設定するファイルです。

```javascript
export default defineConfig({
  integrations: [
    tailwind({ applyBaseStyles: false }), // Tailwind CSS を有効化
    mdx(),                                // MDXファイルのサポート
  ],
  markdown: {
    shikiConfig: { theme: 'github-dark' } // コードブロックのテーマ
  },
});
```

**`tailwind.config.mjs`** — デザインの設定ファイルです。カラーパレット・フォント・タイポグラフィをここで一元管理しています。

```javascript
theme: {
  extend: {
    colors: {
      accent: '#4F46E5',  // インディゴ（メインカラー）
    },
    fontFamily: {
      sans: ['"Noto Sans JP"', 'sans-serif'], // 日本語フォント
      mono: ['"JetBrains Mono"', 'monospace'], // コードフォント
    },
  },
},
```

**`package.json`** — プロジェクトのコマンドとパッケージを定義します。

```json
{
  "scripts": {
    "dev":     "astro dev",     // 開発サーバー起動
    "build":   "astro build",  // 本番ビルド
    "preview": "astro preview" // ビルド結果の確認
  }
}
```

### 6. `.claude/` — AI駆動開発のための設定

Claude Code専用のディレクトリです。

```
.claude/
├── settings.local.json   ← Claude Codeのローカル設定
└── rules/
    └── blog-prompt-template.md  ← 記事生成の一貫性を保つテンプレート
```

`rules/blog-prompt-template.md` を参照することで、Claude Codeが毎回一貫したフォーマットでブログ記事を生成できます。

### 7. `CLAUDE.md` — プロジェクトのSSoT（唯一の真実）

このプロジェクトで最も重要な設定ファイルです。

- **技術スタック**の確定情報
- **デザイン仕様**（カラーパレット・フォント）
- **コーディング規約**
- **フェーズ管理**（実装の優先順位）

Claude Codeはこのファイルを最初に読み込み、ここに書かれた仕様に従って作業します。コードより先にここを更新するのがこのプロジェクトのルールです。

---

## 用語解説

| 用語 | 意味 |
|---|---|
| Astro | Webサイト・ブログ構築に特化したフレームワーク。HTMLを最小限に最適化して高速なサイトを作れる |
| SSG（静的サイト生成） | 事前にHTMLファイルを全部作っておく方式。表示が速く、サーバーが不要 |
| Content Collections | Astroのコンテンツ管理機能。Markdownファイルを型安全に扱える仕組み |
| フロントマター | Markdownファイルの先頭にある `---` で囲まれたメタデータ（タイトル・日付など） |
| ファイルベースルーティング | ファイルのパスがURLになる仕組み。設定不要でURLが決まる |
| Tailwind CSS | CSSクラスを組み合わせてデザインするスタイリングツール |
| MDX | MarkdownにJSXコンポーネントを埋め込める拡張形式 |
| SSoT | Single Source of Truth（唯一の真実）。情報を一か所で管理し矛盾をなくす考え方 |
| pnpm | Node.jsのパッケージ管理ツール。npmより高速・効率的 |
| Shiki | コードブロックのシンタックスハイライトライブラリ。Astroに標準搭載 |

---

## まとめ

このブログアプリのファイル構成は「記事追加をMarkdownファイルを置くだけで完結させる」という設計思想に貫かれています。

- **`src/content/`** に記事を置く → 自動でページ生成
- **`src/pages/`** がURLを決める → 設定不要
- **設定ファイル群** は初期設定済みで、基本的に触る必要なし

次のステップとして、実際にコンポーネント（`src/components/`）の中身を読んでUIの実装パターンを学ぶと、カスタマイズの幅がさらに広がります。
