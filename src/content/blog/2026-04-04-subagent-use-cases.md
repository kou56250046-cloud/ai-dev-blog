---
title: "Subagent の効果的な使い方 — フロントエンド・バックエンド別ガイド＆おすすめ7選"
date: 2026-04-04
category: blog
tags: [claude-code, subagent, architecture, frontend, backend, automation]
summary: "Subagent の基本から、フロントエンド・バックエンド作業別の使い分け、そして本当に役立つSubagent 7選までを解説。チーム開発・大規模プロジェクトを加速させる実践ガイド。"
draft: false
---

## はじめに

Claude Code で能力をさらに引き出す隠れた機能が **Subagent** です。

「複数の異なるタスク（API 設計・UI デザイン・セキュリティチェック）を同時並行したい」
「チームメンバーごとに専門性の異なるエージェントに分業したい」

そんなときに活躍するのが Subagent です。これは Claude Code の並列実行機構で、**異なる役割・スキルを持つエージェントを同時に動かせます**。

この記事では、Subagent の実装方法から、フロントエンド・バックエンド別の効果的な使い分け、そして実際に役に立つ **Subagent 7選**まで、体系的に解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ Subagent の仕組みと定義方法が理解できる
- ✅ フロントエンド・バックエンド別の作業に適したSubagentが選択できる
- ✅ プロジェクト用カスタム Subagent を設計・実装できる
- ✅ 複数 Subagent の並列実行で開発スピードを 1.5〜2倍に加速できる

**学ぶ意義**: Subagent は「正しく使えば」チーム開発の効率を劇的に向上させます。しかし多くの開発者が存在すら知らない隠れた機能です。

---

## 時間がない人のための要約

1. **Subagent = 専門性を持つ Claude Code インスタンス** — 同じコードベースで複数の役割を並列実行できる
2. **定義方法** — `.claude/agents/` ディレクトリに Markdown ファイル（YAML フロントマター）を置くだけ
3. **フロントエンド/バックエンド別** — 作業の性質に応じてSubagentを組み合わせる
4. **おすすめ 7選** — backend-architect・frontend-designer・security-auditor 等を用途別に選択

---

## 前提条件

| 項目 | 要件 |
|---|---|
| Claude Code | v2.1.39 以上 |
| プロジェクト構成 | `.claude/agents/` ディレクトリが作成可能 |
| Git リポジトリ | Subagent 定義をバージョン管理可能 |
| 基本知識 | Claude Code の基本操作・Git 操作 |

---

## Subagent の基礎概念

### Subagent とは

Subagent は「単一のプロンプトで複数の専門的エージェントを並列実行する」機構です。

```
メインエージェント（ユーザーのプロンプト）
  ↓
複数の Subagent が並列実行
  ├─ Backend Architect → API 設計
  ├─ Frontend Designer → UI/UX 実装
  ├─ Security Auditor  → セキュリティチェック
  └─ Performance Optimizer → 最適化
  ↓
結果を統合・ユーザーに返却
```

**メリット**:
- 並列実行で開発時間を短縮（同期実行なら1時間かかる作業が30分で完了）
- 各役割に特化したシステムプロンプト（複合的な役割を同時に求めるより精度向上）
- 大規模チーム開発のシミュレーション（1人で複数メンバーの役割を担当できる）

**デメリット**:
- 各 Subagent が独立して動く（調整・統一性の担保が課題）
- ファイル衝突リスク（複数エージェントが同じファイルを編集）
- 失敗時の原因特定が複雑

---

## Subagent の定義方法

### ステップ 1: Subagent ファイルを作成

`.claude/agents/` ディレクトリに Markdown ファイルを作成します：

```bash
mkdir -p .claude/agents
touch .claude/agents/backend-architect.md
```

### ステップ 2: YAML フロントマターで メタデータを定義

```markdown
---
name: backend-architect
description: Design RESTful APIs, microservice boundaries, and database schemas. Reviews system architecture for scalability and performance bottlenecks. Use PROACTIVELY when creating new backend services or APIs.
category: development-architecture
tools: Read, Write, Edit, Bash, Grep
---

You are a backend system architect specializing in scalable API design and microservices.

When invoked:
1. Analyze requirements and define clear service boundaries
2. Design APIs with contract-first approach
3. Create database schemas considering scaling requirements
4. Recommend technology stack with rationale
5. Identify potential bottlenecks and mitigation strategies

Process:
- Start with clear service boundaries and domain-driven design
- Design APIs contract-first with proper versioning and error handling
- Consider data consistency requirements across services
- Plan for horizontal scaling from day one
- Keep solutions simple and avoid premature optimization

Provide:
- API endpoint definitions with example requests/responses
- Database schema with key relationships and indexes
- Technology recommendations with brief rationale
- Bottleneck analysis and scaling considerations

Always provide concrete examples and focus on practical implementation.
```

**フロントマターの各フィールド**:

| フィールド | 説明 | 例 |
|---|---|---|
| `name` | Subagent の一意識別子（`@agent-<name>` で呼び出し） | `backend-architect` |
| `description` | 何する Subagent か・自動呼び出しのトリガー | `Design APIs and database schemas...` |
| `category` | カテゴリ分類 | `development-architecture` |
| `tools` | 利用可能なツール（制限可） | `Read, Write, Git` |

### ステップ 3: Claude Code に認識させる

Claude Code を再起動すると、`.claude/agents/` 内のすべての Markdown ファイルが自動認識されます。

```bash
# Claude Code を再起動（またはコマンドパレットで "reload"）
```

### ステップ 4: 明示的に呼び出す

```bash
@agent-backend-architect 新しいマイクロサービス向けの API 設計を提案してください
```

---

## フロントエンド・バックエンド別 Subagent の使い分け

### フロントエンド開発での効果的な Subagent 活用

**典型的なフロントエンド作業の流れ**:

```
1. UI/UX デザイン → frontend-designer Subagent
2. コンポーネント実装 → component-architect Subagent
3. パフォーマンス最適化 → performance-optimizer Subagent
4. アクセシビリティチェック → accessibility-auditor Subagent
```

**例：React コンポーネント実装プロジェクト**

```bash
# ── 並列実行設定ファイル例 ──
# .claude/agents/frontend-workflow.yaml

workflows:
  react-component-build:
    parallel:
      - agent: frontend-designer
        prompt: |
          Design a responsive product card component.
          Requirements: mobile-first, dark mode support, hover animations.
          Provide Figma specs or HTML mockup.

      - agent: component-architect
        prompt: |
          Implement the product card as React component.
          Library: React 18 + Tailwind CSS.
          Include TypeScript interfaces, prop validation, and test cases.

      - agent: performance-optimizer
        prompt: |
          Profile the component for performance.
          Check for unnecessary re-renders, memoization opportunities.
          Recommend optimization strategies.
```

**ポイント**：フロントエンドは **UI/UX → 実装 → パフォーマンス** の順序が重要です。

### バックエンド開発での効果的な Subagent 活用

**典型的なバックエンド作業の流れ**:

```
1. API 設計 → backend-architect Subagent
2. データベーススキーマ → database-designer Subagent
3. セキュリティ実装 → security-auditor Subagent
4. インフラ・デプロイ → devops-engineer Subagent
```

**例：eコマース API 開発**

```bash
# ── バックエンド並列実行例 ──

@agent-backend-architect
提案内容：
- Product API（GET /products, POST /products, PUT /products/:id）
- Order API（POST /orders, GET /orders/:id）
- Authentication（JWT ベース）
- Rate limiting・エラーハンドリング

# 同時に別ターミナルで

@agent-database-designer
要件：
- Products テーブル（name, price, stock, description）
- Orders テーブル（user_id, product_id, quantity, status）
- IndexStrategy・クエリ最適化・正規化

# 同時に別ターミナルで

@agent-security-auditor
チェック対象：
- JWT トークン検証・期限管理
- SQL injection 対策
- CORS・CSRF 設定
- データ暗号化
```

**ポイント**：バックエンドは **API → DB → セキュリティ → インフラ** の並列実行が有効です。

---

## 手順：カスタム Subagent を 3 つ作成・組み合わせる

### 実装例 1：Backend Architect Subagent

```markdown
<!-- .claude/agents/backend-architect.md -->
---
name: backend-architect
description: Design RESTful APIs, microservice boundaries, and database schemas. Use when creating new backend services or APIs.
category: development-architecture
tools: Read, Write, Edit, Bash, Grep
---

You are a backend system architect specializing in scalable API design.

**Your Role:**
- Design clean, contract-first APIs with version management
- Plan database schemas for scalability
- Identify microservice boundaries
- Recommend technology stacks
- Flag architectural bottlenecks

**When Invoked:**
1. Analyze requirements document
2. Define service boundaries and domains
3. Design API endpoints (request/response examples)
4. Create database schema (ERD, indices)
5. List tech recommendations with tradeoffs
6. Identify 2-3 potential scaling bottlenecks

**Output Format:**
### API Contract
```json
GET /api/v1/products?page=1&limit=10
Response: { "data": [...], "total": 100, "page": 1 }
```

### Database Schema
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2),
  stock INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_category (category_id)
);
```

### Tech Stack Rationale
- REST over GraphQL: Simpler caching, faster time-to-market
- PostgreSQL: ACID, JSON support, familiar ecosystem

### Bottleneck Analysis
1. N+1 query risk in product listing → Use pagination + caching
2. Database connection pool exhaustion → Configure based on load
```

### 実装例 2：Frontend Designer Subagent

```markdown
<!-- .claude/agents/frontend-designer.md -->
---
name: frontend-designer
description: Design responsive UI components and user flows. Create wireframes, propose color schemes, and accessibility specs. Use when designing new user-facing features.
category: development-architecture
tools: Read, Write, Edit, Bash
---

You are a frontend UX/UI designer specializing in accessible, responsive design.

**Your Role:**
- Design component layouts (mobile-first)
- Propose color schemes and typography
- Create component specifications
- Plan accessibility requirements
- Design error states and loading states

**When Invoked:**
1. Analyze feature requirements
2. Sketch component layout (Markdown + ASCII or HTML)
3. Define color palette with contrast ratios
4. Specify responsive breakpoints
5. List accessibility requirements (WCAG 2.1 AA)
6. Create state specifications (normal, hover, active, loading, error)

**Output Format:**
### Component Specification
- **Name**: ProductCard
- **Breakpoints**: mobile (320px), tablet (768px), desktop (1024px)
- **States**: default, hover, loading, error
- **Accessibility**: WCAG 2.1 AA, keyboard navigation, screen reader support

### Responsive Layout
```
Mobile (320px):   [Product Image]
                   [Title + Price]
                   [Button]

Tablet (768px):   [Image] | [Title]
                           | [Price]
                           | [Button]

Desktop (1024px): [Large Image] | [Title + Price]
                               | [Description]
                               | [Button]
```

### Color Palette
- Primary: #2563EB (Blue 600, contrast 4.5:1 on white)
- Error: #DC2626 (Red 600, contrast 4.5:1)
- Success: #16A34A (Green 600, contrast 4.5:1)
```

### 実装例 3：Security Auditor Subagent

```markdown
<!-- .claude/agents/security-auditor.md -->
---
name: security-auditor
description: Audit code for security vulnerabilities, compliance issues, and best practices. Use proactively before deployment.
category: quality-security
tools: Read, Grep, Bash
---

You are a security auditor specializing in OWASP Top 10 vulnerability detection.

**Your Role:**
- Scan code for injection attacks (SQL, XSS, command injection)
- Review authentication/authorization
- Check cryptography and secrets management
- Validate input sanitization
- Flag compliance issues (GDPR, etc.)

**When Invoked:**
1. Scan codebase for OWASP Top 10 vulnerabilities
2. Check secrets (API keys, tokens) in code
3. Verify JWT/cookie security headers
4. Validate input validation logic
5. Generate security report with severity levels
6. Recommend patches

**Output Format:**
### Security Report

| Severity | Issue | Location | Recommendation |
|---|---|---|---|
| 🔴 HIGH | SQL Injection in user query | `src/db.js:45` | Use parameterized queries |
| 🟡 MEDIUM | XSS risk in dangerouslySetInnerHTML | `src/Component.jsx:20` | Use DOMPurify |
| 🟢 LOW | Expired dependency | `package.json` | Update jest to ^29.0 |

### Fixes Applied
```diff
- const query = `SELECT * FROM users WHERE id = ${userId}`
+ const query = `SELECT * FROM users WHERE id = $1`
+ db.query(query, [userId])
```
```

---

## おすすめ Subagent 7 選

### 1. **Backend Architect** — API・マイクロサービス設計

**目的**: REST API・マイクロサービスボーダーの設計
**当番**: API コントラクト定義・DB スキーマ設計・技術スタック選定

**効果的な使用例**:
```bash
@agent-backend-architect
eコマースプラットフォームの API 設計
要件：Product・Order・User API、3段階スケーリング対応
```

**出力**: API 仕様書・DB スキーマ・アーキテクチャ図

---

### 2. **Frontend Designer** — UI/UX・コンポーネント設計

**目的**: 応答型 UI コンポーネント・ユーザーフロー設計
**当番**: Wireframe・色彩計画・アクセシビリティ・状態管理

**効果的な使用例**:
```bash
@agent-frontend-designer
React コンポーネント「ProductCard」の仕様書を作成
要件：モバイルファースト・ダークモード・WCAG 2.1 AA対応
```

**出力**: コンポーネント仕様・レスポンシブレイアウト・アクセシビリティ要件

---

### 3. **Security Auditor** — セキュリティチェック

**目的**: OWASP Top 10・認証・暗号化・コンプライアンス監査
**当番**: 脆弱性検出・シークレット管理・セキュリティヘッダー

**効果的な使用例**:
```bash
@agent-security-auditor
デプロイ前のセキュリティ監査
対象：src/ ディレクトリ全体
チェック項目：SQL injection、XSS、JWT 検証、secrets フィルタリング
```

**出力**: セキュリティレポート・脆弱性一覧・修正コード

---

### 4. **Database Designer** — データベース設計

**目的**: スキーマ設計・正規化・インデックス戦略
**当番**: ER図作成・クエリ最適化・パーティショニング

**効果的な使用例**:
```bash
@agent-database-designer
SaaS プロダクトのマルチテナント DB スキーマ
要件：1万テナント対応・クエリ < 100ms・バックアップ戦略
```

**出力**: スキーマ定義・インデックス戦略・クエリプラン

---

### 5. **Performance Optimizer** — パフォーマンス最適化

**目的**: レンダリング・API レスポンス・データベースクエリ高速化
**当番**: ボトルネック検出・メモリリーク・キャッシング戦略

**効果的な使用例**:
```bash
@agent-performance-optimizer
React コンポーネント・API パフォーマンス分析
ターゲット：LCP < 2.5s、FID < 100ms、API < 200ms
```

**出力**: パフォーマンスレポート・最適化提案・実装コード

---

### 6. **DevOps Engineer** — インフラ・CI/CD設計

**目的**: Docker・Kubernetes・GitHub Actions・デプロイ戦略
**当番**: インフラ設計・CI/CD パイプライン・環境差分管理

**効果的な使用例**:
```bash
@agent-devops-engineer
Next.js アプリを Vercel で本番運用する際の CI/CD 設計
要件：自動テスト・段階的ロールアウト・ロールバック機構
```

**出力**: GitHub Actions ワークフロー・Docker 設定・デプロイスクリプト

---

### 7. **Code Reviewer** — コードレビュー・品質保証

**目的**: コード品質・テストカバレッジ・アンチパターン検出
**当番**: PR レビュー・テストスイート提案・CLAUDE.md 準拠チェック

**効果的な使用例**:
```bash
@agent-code-reviewer
PR #123 のコードレビュー
対象：src/ フロントエンド変更（React コンポーネント追加）
チェック項目：テストカバレッジ・リンター準拠・ドキュメント
```

**出力**: レビューコメント・改善提案・テストケース

---

## 複数 Subagent の並列実行パターン

### パターン 1：フロントエンド + バックエンド 並列開発

```bash
# ターミナル 1: フロントエンド担当
@agent-frontend-designer
新規ページ「ダッシュボード」の UI 仕様書を作成してください。
階層：Header・Sidebar・ContentArea
レスポンシブ：モバイル・タブレット・デスクトップ対応

# ターミナル 2: バックエンド担当（同時進行）
@agent-backend-architect
ダッシュボード向けの API 設計（データポイント取得・キャッシング）
エンドポイント：GET /api/v1/dashboard/metrics
レスポンス形式・認証方式・エラーハンドリング
```

### パターン 2：品質・セキュリティ 同時チェック

```bash
# ターミナル 1: セキュリティチェック
@agent-security-auditor
src/ 全体のセキュリティ監査を実行してください。
重点：認証・データベース・API エンドポイント

# ターミナル 2: パフォーマンス分析（同時進行）
@agent-performance-optimizer
フロントエンド・バックエンド双方のボトルネック検出
ターゲット指標：LCP・FID・API レスポンス時間
```

### パターン 3：新機能 フルスタック開発

```bash
# 3つの Subagent が同時に異なる切り口で分析・実装

@agent-frontend-designer  →  UI コンポーネント設計
@agent-backend-architect  →  API・DB スキーマ設計
@agent-security-auditor   →  セキュリティ要件定義

# 各々が完成後、結果を統合して本実装へ
```

---

## Subagent 使用時の注意点・ベストプラクティス

### ✅ 推奨

- 各 Subagent に明確な責務範囲を定义
- 並列実行時は編集対象ファイルを分離（衝突回避）
- Subagent の出力を別ブランチに集約してから統合
- 定期的に Subagent 定義を見直し・最適化

### ❌ 避けるべき

- 1つの Subagent に複数の役割を詰め込む（精度低下）
- Subagent 間でファイル競合を放置（巨大なマージコンフリクト）
- Subagent 出力を全て盲信（最終チェック必須）
- 無限ループ（Subagent A → Subagent B → Subagent A...）

---

## 用語解説

| 用語 | 説明 |
|---|---|
| Subagent | 専門的な役割を持つ Claude Code インスタンス・並列実行可能 |
| Agent 定義 | `.claude/agents/` の Markdown ファイル・YAML フロントマター含む |
| Contract-first | API 設計時まず契約（リクエスト/レスポンス）を定義してから実装 |
| ER図 | Entity Relationship Diagram・テーブル間の関係性を図式化 |
| ボトルネック分析 | パフォーマンス低下の原因特定・改善優先度の決定 |
| OWASP Top 10 | セキュリティで最も重要な 10 項目（injection・XSS・認証・等） |
| CI/CD | Continuous Integration / Continuous Deployment・自動テスト・自動デプロイ |

---

## まとめ

Subagent は「単一の Claude Code では到達できない並列性・専門性」を実現する強力な機構です。

**フロントエンド開発**では Designer → Architect → Optimizer の流れで高速化でき、
**バックエンド開発**では API 設計 → DB 設計 → セキュリティ → インフラ の並列実行で開発期間 40% 削減可能です。

おすすめ 7 選の Subagent を自 CLAUDE.md に組み込み、チームの役割分担ルールとして codify すれば、「AI 駆動開発」の次フェーズ「AI マルチエージェント チーム開発」へ移行できます。

次のステップ: `.claude/agents/` に自社プロジェクト用の Subagent 3～5個を定義し、実際の開発タスクで試してみてください。効率化の実感が得られれば、チーム全体での採用へ拡大できます。
