# CLAUDE.md — AI駆動開発 学習ブログ プロジェクト設定
# Single Source of Truth (SSoT) — このファイルがプロジェクトの唯一の真実の情報源

最終更新: 2026-04-04
バージョン: 1.1.0

---

## プロジェクト概要

### 目的
AI駆動開発（Claude Code / Devin / GitHub等）の学習内容を体系的に記録・閲覧するための
完全個人運用の学習ナレッジベース兼ブログアプリ。

### 運用方針
- 運用者: Kohei（個人）
- 認証: 不要（個人専用URL）
- 公開範囲: 完全個人運用（将来的な公開も考慮した設計）
- 費用: 完全無料運用（Vercel Free + GitHub Free）
- 言語: 日本語のみ

---

## 技術スタック（確定）

| レイヤー | 技術 | バージョン | 理由 |
|---|---|---|---|
| フレームワーク | Astro | 4.x | ブログ特化・SSG・MDX対応・高速 |
| スタイリング | Tailwind CSS | v3 | Astroとの相性◎・ユーティリティファースト |
| アニメーション | GSAP (GreenSock) | 3.x | 滑らかなスクロールアニメーション・無料枠 |
| コンテンツ管理 | Markdown / MDX | — | Gitで管理・VSCodeで編集・DB不要 |
| シンタックスハイライト | Shiki | Astro標準 | 設定不要・美しいハイライト |
| キーワード検索 | クライアントサイドJS | — | /search.json エンドポイント + フロント絞込み・DB不要 |
| デプロイ | Vercel | Free Tier | 自動デプロイ・CDN・無料SSL |
| バージョン管理 | GitHub | Free | Vercel連携・Claude Code連携 |
| パッケージマネージャ | pnpm | 9.x | 高速・効率的 |
| アクセス解析 | なし | — | 不要 |
| コメント機能 | なし | — | 不要 |
| **月額費用** | **完全無料** | — | 上記すべて無料枠で運用 |

### 将来的な拡張候補（Phase 3以降・すべて無料枠あり）
- AI連携: Gemini API（記事要約・自動タグ付け）※ Free Tierあり
- 認証: Cloudflare Access（無料）
- DB: Supabase Free Tier（AI連携時に追加）

---

## デザイン仕様（確定）

### デザインコンセプト
- テイスト: モダン・ミニマル・LP風
- 参考: fivot（https://fivot.co.jp）
- キーワード: 流動的・洗練・余白重視・日本語組版美・動的アニメーション

### カラーパレット
```
--color-bg:        #FAFAFA        /* ほぼ白 */
--color-bg-alt:    #F0F4FF        /* 薄青グラデーション */
--color-text-main: #0A0A0A        /* ほぼ黒 */
--color-text-muted:#6B7280        /* グレー */
--color-accent:    #4F46E5        /* インディゴ */
--color-accent-2:  #818CF8        /* 薄インディゴ */
--gradient-bg:     linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #F0F9FF 100%)
--gradient-accent: linear-gradient(135deg, #818CF8 0%, #C084FC 50%, #38BDF8 100%)
--gradient-wave:   linear-gradient(135deg, #A5B4FC 0%, #C4B5FD 40%, #93C5FD 100%)
```

### タイポグラフィ
```
日本語見出し: "Noto Sans JP" (Google Fonts) - weight: 700, 400
英語見出し:   "Inter" (Google Fonts) - weight: 700, 300
本文:         "Noto Sans JP" - weight: 400, line-height: 1.9
コード:       "JetBrains Mono" (Google Fonts)
```

### アニメーション仕様
| 要素 | 手法 | 詳細 |
|---|---|---|
| ヒーロー波形 | SVG + CSS animation | 複数の波形パスがゆっくり流れる（fivot風） |
| スクロール連動 | GSAP ScrollTrigger | フェードイン + Y軸スライドアップ |
| ホバー | CSS transition | all 0.3s cubic-bezier(0.4, 0, 0.2, 1) |
| ページ遷移 | Astro View Transitions | フェード |
| カード出現 | GSAP stagger | 0.1s間隔でカード順次表示 |

---

## ディレクトリ構成（確定）

```
/
├── CLAUDE.md                        # このファイル（SSoT）← 仕様変更はここから
├── README.md                        # プロジェクト説明
├── astro.config.mjs                 # Astro設定
├── tailwind.config.mjs              # Tailwind設定
├── tsconfig.json
├── package.json
│
├── src/
│   ├── content/                     # 全コンテンツ（Markdownファイル）
│   │   ├── config.ts                # コンテンツスキーマ定義（Zod）← スキーマはここ
│   │   ├── blog/                    # ブログ記事
│   │   │   └── YYYY-MM-DD-slug.md
│   │   ├── cheatsheet/              # コマンドチートシート
│   │   │   └── tool-name.md
│   │   ├── snippets/                # コードスニペット
│   │   │   └── snippet-name.md
│   │   ├── design/                  # 設計・アーキテクチャメモ
│   │   │   └── topic-name.md
│   │   └── roadmap/                 # 学習ロードマップ
│   │       └── roadmap.md
│   │
│   ├── pages/                       # ルーティング（ファイルベース）
│   │   ├── index.astro              # トップページ（LP風）
│   │   ├── blog/
│   │   │   ├── index.astro          # 記事一覧
│   │   │   └── [slug].astro         # 記事詳細
│   │   ├── cheatsheet/
│   │   │   └── index.astro
│   │   ├── snippets/
│   │   │   └── index.astro
│   │   ├── design/
│   │   │   └── index.astro
│   │   ├── roadmap.astro
│   │   ├── tags/
│   │   │   └── [tag].astro
│   │   ├── search.astro         # キーワード検索ページ
│   │   └── search.json.ts       # 全記事の検索用JSONエンドポイント
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.astro
│   │   │   └── Footer.astro
│   │   ├── ui/
│   │   │   ├── ArticleCard.astro
│   │   │   ├── TagBadge.astro
│   │   │   ├── CodeBlock.astro
│   │   │   └── SearchBar.astro
│   │   ├── home/
│   │   │   ├── HeroSection.astro    # 波形アニメーション
│   │   │   ├── MissionSection.astro
│   │   │   ├── RecentPosts.astro
│   │   │   └── CategorySection.astro
│   │   └── animations/
│   │       ├── WaveCanvas.astro     # Canvas波形アニメーション
│   │       └── ScrollReveal.astro   # GSAP スクロール連動
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro         # 基本レイアウト（Head・Header・Footer）
│   │   ├── BlogLayout.astro         # 記事レイアウト（prose スタイル）
│   │   └── PageLayout.astro         # 一般ページレイアウト
│   │
│   ├── styles/
│   │   ├── global.css               # グローバルスタイル・CSS変数
│   │   └── prose.css                # Markdownコンテンツスタイル
│   │
│   └── utils/
│       ├── content.ts               # コンテンツ取得ユーティリティ
│       └── date.ts                  # 日付フォーマット（日本語対応）
│
├── public/
│   ├── favicon.svg
│   └── og-image.png
│
└── .claude/
    └── rules/                       # Claude Code用モジュールルール
        ├── frontend.md              # フロントエンド規約
        ├── content.md               # コンテンツ管理規約
        └── deployment.md            # デプロイ手順
```

---

## キーワード検索機能仕様

### アーキテクチャ
| 要素 | ファイル | 役割 |
|---|---|---|
| 検索インデックス | `src/pages/search.json.ts` | 全記事（blog/commands/prompts）をビルド時にJSON生成 |
| 検索ページ | `src/pages/search.astro` | クライアントサイドJS でリアルタイムフィルタリング |
| Headerリンク | `src/components/layout/Header.astro` | デスクトップ：検索ボタン、モバイル：メニュー内 |

### 検索インデックスのフィールド
```json
{
  "title":    "記事タイトル",
  "summary":  "要約（一覧カード表示用）",
  "tags":     ["tag1", "tag2"],
  "category": "blog | commands | prompts",
  "date":     "YYYY-MM-DD",
  "slug":     "記事のslug",
  "url":      "/blog/slug など"
}
```

### 検索対象フィールド
- `title`（タイトル）
- `summary`（要約）
- `tags`（タグ配列）

### フィルタリングルール
- クライアントサイドで `fetch('/search.json')` してメモリ上でフィルタリング
- カテゴリボタンで絞り込み可（all / blog / commands / prompts）
- URL クエリパラメータ `?q=keyword` で直リンク可能（共有・ブックマーク対応）
- マッチした文字列はハイライト表示（`<mark>` タグ）

### 新カテゴリ追加時の対応
`src/utils/content.ts` の `categoryMeta` に追記すれば検索ページのフィルターボタンに自動反映される。

---

## コンテンツ管理仕様

### フロントマター定義（src/content/config.ts で型定義）

```yaml
---
title: "記事タイトル"                    # 必須: string
date: 2026-04-03                        # 必須: YYYY-MM-DD
category: blog                          # 必須: blog | cheatsheet | snippet | design | roadmap
tags: [claude-code, mcp, vscode]        # 必須: string[]
summary: "一行要約（一覧カードに表示）"  # 必須: string（100文字以内推奨）
draft: false                            # 必須: boolean（true=非公開）
updatedAt: 2026-04-03                   # 任意: 最終更新日
---
```

### カテゴリ定義
| カテゴリ | slug | 説明 | アイコン |
|---|---|---|---|
| ブログ記事 | blog | 学習ログ・気づき・ツール比較 | 📝 |
| チートシート | cheatsheet | コマンド・設定リファレンス | ⚡ |
| スニペット | snippets | 再利用可能なコード片 | 🧩 |
| 設計メモ | design | アーキテクチャ・要件定義 | 🏗️ |
| ロードマップ | roadmap | 学習進捗管理 | 🗺️ |

### タグ命名規則
- **形式**: 小文字ケバブケース（例: `claude-code`, `next-js`）
- **ツール名**: `claude-code`, `devin`, `github`, `cursor`, `vscode`
- **技術名**: `next-js`, `astro`, `supabase`, `vercel`, `mcp-server`
- **種別**: `setup`, `config`, `architecture`, `tips`, `troubleshoot`

### 記事の追加・編集・削除

```bash
# ── 記事追加 ──
# 1. src/content/blog/YYYY-MM-DD-slug.md を作成
# 2. フロントマターを記述
# 3. git add . && git commit -m "add: 記事タイトル"
# 4. git push → Vercelが自動デプロイ（約30-60秒）

# ── 記事編集 ──
# 1. 該当 .md ファイルを編集
# 2. updatedAt を更新
# 3. git commit & push

# ── 記事削除（論理削除推奨） ──
# draft: true に変更してpush（物理削除より安全）
# 完全削除が必要な場合のみファイルを削除してpush
```

---

## 開発環境セットアップ

### 前提条件
- Node.js 20.x 以上（LTS）
- pnpm 9.x 以上（`npm install -g pnpm` で導入）
- Git
- VSCode + 拡張機能: Astro, Tailwind CSS IntelliSense, Prettier

### 初回セットアップ手順
```bash
# 1. リポジトリクローン
git clone https://github.com/[username]/ai-dev-blog.git
cd ai-dev-blog

# 2. 依存関係インストール
pnpm install

# 3. 開発サーバー起動
pnpm dev
# → http://localhost:4321 でアクセス可能

# 4. ビルド確認
pnpm build && pnpm preview
```

### よく使うコマンド
```bash
pnpm dev           # 開発サーバー起動（ホットリロード）
pnpm build         # 本番ビルド（dist/ に静的ファイル生成）
pnpm preview       # ビルド結果をローカルでプレビュー
pnpm astro check   # TypeScript型チェック
pnpm astro sync    # Content Collections型を同期
```

---

## デプロイ仕様

### Vercel プロジェクト設定
```
Framework Preset: Astro
Build Command:    pnpm build
Output Directory: dist
Install Command:  pnpm install
Node.js Version:  20.x
```

### 自動デプロイフロー
```
ローカルで記事追加・編集・コード修正
  → git commit -m "メッセージ"
  → git push origin main
  → Vercel が GitHub を自動検知
  → pnpm build 実行（約30-60秒）
  → https://[project].vercel.app に自動デプロイ完了
```

### ブランチ戦略
| ブランチ | 用途 | デプロイ先 |
|---|---|---|
| `main` | 本番 | https://[project].vercel.app |
| `dev` | 開発・プレビュー | Vercel Preview URL |
| `feature/xxx` | 機能開発 | Vercel Preview URL |

---

## Claude Code 作業ガイドライン

### コーディング規約
- **言語**: TypeScript（.ts / .astro / .tsx）
- **スタイル**: Tailwind CSSユーティリティクラス優先（カスタムCSSは global.css に集約）
- **コンポーネント**: 1ファイル1責務・Props型は必ずinterface定義
- **コメント**: 日本語で記述可
- **import順序**: Astro組み込み → 外部ライブラリ → 内部モジュール → 型

### 作業時の鉄則
1. **仕様変更は CLAUDE.md から**: コード変更の前に必ずこのファイルを更新
2. **スキーマ変更は config.ts と CLAUDE.md を同期**: フロントマター変更時は両方更新
3. **新コンポーネント追加時**: ディレクトリ構成セクションも更新
4. **アニメーション追加時**: `prefers-reduced-motion` メディアクエリで無効化オプションを提供

### 禁止事項（Phase 1）
- データベース追加（MDファイルで完結させる）
- 外部APIの有料プラン使用
- `node_modules/` への直接変更
- サーバーサイドレンダリング（SSRではなくSSGを維持）

---

## フェーズ管理

### Phase 1 — 基盤構築（現在）
- [x] 要件定義・CLAUDE.md作成（SSoT）
- [ ] Astroプロジェクト初期化（`pnpm create astro@latest`）
- [ ] Tailwind CSS・GSAP・フォント設定
- [ ] グローバルスタイル・CSS変数定義
- [ ] BaseLayout / BlogLayout コンポーネント
- [ ] HeroSection（波形SVGアニメーション）
- [ ] コンテンツスキーマ定義（src/content/config.ts）
- [ ] 記事一覧ページ（カードグリッド）
- [ ] 記事詳細ページ（Markdownレンダリング）
- [ ] カテゴリ・タグページ
- [ ] Vercel デプロイ設定・初回デプロイ

### Phase 2 — 機能拡充
- [ ] チートシートページ（ツール別タブ切替）
- [ ] スニペット集ページ（コピーボタン付き）
- [ ] ロードマップページ（チェックリスト・進捗バー）
- [x] キーワード検索機能（クライアントサイド全文検索）
- [ ] ダークモード対応
- [ ] OGP / メタタグ最適化
- [ ] RSS フィード（Astro標準）

### Phase 3 — AI連携（将来）
- [ ] Gemini API 記事要約（Free Tier使用）
- [ ] 自動タグ付け提案
- [ ] 関連記事推薦
- [ ] Supabase連携（必要に応じて）

---

## 参考資料

| カテゴリ | URL |
|---|---|
| デザイン参考 | https://fivot.co.jp |
| Astro公式 | https://docs.astro.build |
| Content Collections | https://docs.astro.build/en/guides/content-collections/ |
| Astro + Tailwind | https://docs.astro.build/en/guides/integrations-guide/tailwind/ |
| Pagefind | https://pagefind.app |
| GSAP ScrollTrigger | https://gsap.com/docs/v3/Plugins/ScrollTrigger/ |
| Astro View Transitions | https://docs.astro.build/en/guides/view-transitions/ |
| Vercel + Astro | https://vercel.com/docs/frameworks/astro |

---

*このファイルはSSoT（Single Source of Truth）です。*
*仕様に関するすべての変更・決定はこのファイルに記録してから実装を開始すること。*
*Claude Codeはこのファイルを最初に読み、ここに書かれた仕様に従って作業を行うこと。*
