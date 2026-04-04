---
title: "ログイン設計と認証設計 — Supabase・Google OAuth・Firebase の仕組みと目的別使い分け"
date: 2026-04-04
category: blog
tags: [supabase, firebase, google-oauth, authentication, setup, architecture]
summary: "JWT・セッション・OAuth 2.0の基本から、Supabase・Google OAuth・Firebaseの違い、実装パターン、そして目的に応じた選択基準まで、認証設計を完全解説。"
draft: false
---

## はじめに

「アプリにログイン機能を追加したいけど、Supabase・Firebase・Google OAuth のどれを使えばいい？」

認証（ログイン・ユーザー管理）はあらゆるアプリの基本機能です。しかし選択肢が多く、それぞれの特性・トレードオフを理解せずに選ぶと、後からの移行コストが膨大になります。

この記事では、JWT・セッション・OAuth 2.0の基本から始まり、**3つの主要サービス（Supabase・Firebase・Google OAuth）の仕組み・実装パターン・使い分けの基準**を体系的に整理します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ JWT・セッション・OAuth 2.0の基本概念を理解できる
- ✅ Supabase・Firebase・Google OAuth それぞれの特性が説明できる
- ✅ プロジェクト要件に応じた認証サービスを選択できる
- ✅ 各サービスの基本実装パターンをコード例として再現できる

**学ぶ意義**: 認証設計は「後から変更しにくい」重要な判断です。この記事で3つのサービスの違いを理解すれば、プロジェクト後期での選択ミスを防げます。

---

## 時間がない人のための要約

1. **JWT・セッション・OAuth 2.0は3つの認証パターン** — ステートレス（JWT）・ステートフル（セッション）・委譲型（OAuth）で、それぞれトレードオフがある
2. **Supabase = PostgreSQL + 完全管理の認証機能** — オープンソース・コスト安・柔軟性高・セルフホスト可能
3. **Firebase = Google製・包括的・すぐに使える** — 料金体系がやや複雑・ベンダーロックイン傾向
4. **Google OAuth = ソーシャルログイン・委任型** — 単体では不足・Supabase/Firebase と併用が一般的

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Node.js | 20.x 以上 |
| Supabase アカウント | 無料枠あり（https://supabase.com） |
| Firebase プロジェクト | 無料枠あり（https://firebase.google.com） |
| Google OAuth アプリケーション | Gcloud Console から作成済み |
| フレームワーク | Next.js 14.x / Hono 推奨 |

---

## 認証の基礎概念

### 1. JWT（JSON Web Token） — ステートレス認証

JWTはサーバーがクライアントに署名付きトークンを発行し、以降のリクエストで `Authorization: Bearer <token>` として送信する方式です。

**構造**:
```
Header.Payload.Signature

Header:    { "alg": "HS256", "typ": "JWT" }
Payload:   { "sub": "user-id", "email": "user@example.com", "exp": 1234567890 }
Signature: HMACSHA256(base64(Header) + "." + base64(Payload), secret)
```

**メリット**: スケーラブル（DBクエリ不要）・ステートレス・マイクロサービス向け
**デメリット**: 発行後は失効まで続く・トークン自体が大きい・失効管理が複雑

### 2. Session Cookie — ステートフル認証

サーバーがセッション情報をDBに保存し、クライアントにセッションID（クッキー）を返す方式です。HttpOnly・Secure フラグで保護します。

**フロー**:
```
1. ログイン → サーバーが DB にセッション保存
2. クッキーをクライアントに返す（HttpOnly・Secure）
3. 以降のリクエストで自動的にクッキーが送信
4. サーバーが DB のセッション情報を確認
```

**メリット**: セッション管理側で失効・権限変更が即反映・よりセキュア・トークン自体が小さい
**デメリット**: DB参照が必須・サーバー負担増・マルチデバイス対応が複雑

### 3. OAuth 2.0 — 委任型認証

Google・GitHub などの外部サービスにログインを委任します。

**フロー**:
```
1. アプリが「Sign in with Google」ボタンを表示
2. ユーザーがクリック → Google 認可画面へリダイレクト
3. ユーザーが許可 → Google がアプリへリダイレクト（認可コード）
4. アプリがバックエンドで Google にコード送信
5. Google が アクセストークン・ユーザー情報を返す
6. アプリがユーザーをログイン状態に
```

**メリット**: パスワード管理をGoogle に委奪・セキュリティ責任が分散・ユーザーのパスワード疲れ軽減
**デメリット**: Google のサービス障害の影響を受ける・ユーザーデータがGoogle 経由・初回登録フロー複雑

---

## 手順

### 【パターン1】Supabase 認証の実装

Supabase は PostgreSQL + 認証機能のフルパッケージです。JWT をデフォルトで採用しています。

**Step 1: Supabase プロジェクト作成**

```bash
# supabase.com でアカウント作成・プロジェクト作成
# https://supabase.com/dashboard から：
# 1. 「New project」クリック
# 2. プロジェクト名を入力
# 3. パスワード設定（デフォルト postgres ユーザーのパスワード）
# 4. リージョン選択（日本: Tokyo）
# 5. Create new project
```

プロジェクト作成後、ダッシュボードから **API Keys** を確認：
- `public` キー（クライアント用・公開OK）
- `secret` キー（サーバー用・秘密）

**Step 2: クライアントから Supabase 初期化**

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)
```

```bash
# .env.local
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key  # サーバーサイド限定
```

**Step 3: メールアドレス & パスワードでサインアップ**

```typescript
// ユーザーサインアップ
async function handleSignUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    console.error('サインアップエラー:', error)
    return
  }

  console.log('確認メールを送信しました:', data)
}
```

> **ポイント**: Supabase はメール確認機能がデフォルトで有効です。本番環境では必ず確認メール内のリンク（`emailRedirectTo`）をクリックしてもらいます。

**Step 4: ログイン & アクセストークン取得**

```typescript
// ユーザーログイン
async function handleLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('ログインエラー:', error)
    return
  }

  // JWT アクセストークン取得
  const accessToken = data.session?.access_token
  console.log('ログイン成功、トークン:', accessToken)

  // ローカルストレージに保存（または自動的に管理される）
  // 以降のリクエストで自動的に Authorization ヘッダに附加される
}
```

**Step 5: ログイン状態の確認・永続化**

```typescript
// ログイン状態の検知
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('ログイン:', session?.user.email)
  } else if (event === 'SIGNED_OUT') {
    console.log('ログアウト')
  }
})

// 現在のユーザー取得
const {
  data: { user },
} = await supabase.auth.getUser()

if (user) {
  console.log('ログイン中:', user.email)
}
```

**Step 6: ログアウト**

```typescript
async function handleLogout() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('ログアウトエラー:', error)
    return
  }

  console.log('ログアウト完了')
  // UI を更新
}
```

**トークンリフレッシュ**: Supabase は期限切れ JWTを自動リフレッシュします（リフレッシュトークン使用）

---

### 【パターン2】Firebase Authentication の実装

Firebase は Google 製・BaaS サービスで、ユーザー管理・セッション・ソーシャルログインを包括的に提供します。

**Step 1: Firebase プロジェクト作成**

```bash
# firebase.google.com でプロジェクト作成
# 1. 「コンソールに移動」
# 2. 「プロジェクトを作成」
# 3. プロジェクト名を入力
# 4. Google アナリティクスを有効化（任意）
# 5. 「作成」
```

**Step 2: クライアント SDK を初期化**

```typescript
// src/lib/firebase.ts
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.PUBLIC_FIREBASE_APP_ID!,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
```

```bash
# .env.local
PUBLIC_FIREBASE_API_KEY=your_api_key
PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=your-project
PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Step 3: メールアドレス＆パスワードでサインアップ**

```typescript
import { createUserWithEmailAndPassword } from 'firebase/auth'

async function handleSignUp(email: string, password: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    )

    const user = userCredential.user
    console.log('サインアップ成功:', user.email)

    // メール確認送信
    await sendEmailVerification(user)
    console.log('確認メールを送信しました')
  } catch (error: any) {
    console.error('サインアップエラー:', error.code, error.message)
  }
}
```

**Step 4: ログイン**

```typescript
import { signInWithEmailAndPassword } from 'firebase/auth'

async function handleLogin(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    )

    const user = userCredential.user
    console.log('ログイン成功:', user.email)

    // アクセストークン取得
    const idToken = await user.getIdToken()
    console.log('トークン:', idToken)
  } catch (error: any) {
    console.error('ログインエラー:', error.code, error.message)
  }
}
```

**Step 5: ログイン状態の永続化**

```typescript
import { onAuthStateChanged } from 'firebase/auth'

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('ログイン中:', user.email)
    // UI を更新
  } else {
    console.log('ログアウト状態')
    // ログイン画面に遷移
  }
})
```

> **ポイント**: Firebase はデフォルトでブラウザのローカルストレージにセッション情報を保存します。ページ更新後も ログイン状態が続きます。

**Step 6: ログアウト**

```typescript
import { signOut } from 'firebase/auth'

async function handleLogout() {
  try {
    await signOut(auth)
    console.log('ログアウト完了')
  } catch (error) {
    console.error('ログアウトエラー:', error)
  }
}
```

**セッションクッキー（サーバー側の永続化）**:

Firebase Admin SDK を使ってセッションクッキーを生成可能：

```javascript
// サーバー側（Node.js）
import * as admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

// クライアント側でこれまでのトークンを取得
// サーバーに POST で送信
app.post('/login', async (req, res) => {
  const idToken = req.body.idToken

  // セッションクッキーを生成（5日間有効）
  const sessionCookie = await admin.auth().createSessionCookie(idToken, {
    expiresIn: 5 * 24 * 60 * 60 * 1000, // 5日
  })

  // セッションクッキーをレスポンスヘッダに設定
  res.cookie('session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
  })

  res.json({ status: 'success' })
})
```

---

### 【パターン3】Google OAuth の実装

「Sign in with Google」ボタンを使ったソーシャルログインです。

**Step 1: Google Cloud Console で OAuth アプリケーション作成**

```bash
# https://console.cloud.google.com で：
# 1. プロジェクト作成
# 2. 「認証情報」 → 「認証情報を作成」
# 3. 「OAuth 2.0 クライアント ID」を選択
# 4. 「ウェブアプリケーション」を選択
# 5. 「承認済みの JavaScript 生成元」に
#    http://localhost:3000 (開発)
#    https://example.com (本番)
#    を追加
# 6. 「承認済みのリダイレクト URI」に
#    http://localhost:3000/auth/callback (開発)
#    https://example.com/auth/callback (本番)
#    を追加
# 7. 作成 → Client ID と Client Secret を取得
```

**Step 2: Supabase で Google OAuth を有効化（Supabase + Google OAuth パターン）**

```bash
# Supabase ダッシュボード → Authentication → Providers
# 「Google」を選択
# Client ID・Client Secret を入力
# 有効化
```

**Step 3: フロントエンドで Google ログインボタンを実装**

```typescript
// src/components/GoogleLoginButton.tsx
import { supabase } from '@/lib/supabase'

export function GoogleLoginButton() {
  async function handleGoogleLogin() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('Google ログインエラー:', error)
    }
    // 自動的に Google の認可画面へリダイレクト
  }

  return (
    <button onClick={handleGoogleLogin}>
      Sign in with Google
    </button>
  )
}
```

**Step 4: コールバック処理**

```typescript
// src/pages/auth/callback.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase が URL から認可コードを抽出して自動処理
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        console.log('ログイン成功:', session.user.email)
        navigate('/dashboard')
      }
    })
  }, [navigate])

  return <div>ログイン処理中...</div>
}
```

---

## Supabase・Firebase・Google OAuth の比較表

| 項目 | Supabase | Firebase | Google OAuth |
|---|---|---|---|
| **単体での利用** | ✅ 完全単体で利用可 | ✅ 完全単体で利用可 | ❌ 単体では不足（別サービスと併用） |
| **メール＆パスワード** | ✅ あり | ✅ あり | ❌ なし |
| **ソーシャルログイン** | ✅ Google・GitHub・Discord等 | ✅ Google・Facebook・Twitter等 | ✅ Google のみ |
| **セッション管理** | JWT（自動リフレッシュ） | ローカルストレージ＋Admin SDK でクッキー化可 | OAuth トークン |
| **ユーザー管理** | ✅ SQL テーブルで柔軟 | ✅ Firebase Console | △ 外部サービス依存 |
| **コスト** | 月 $5〜（無料枠あり） | 月 $5〜（従量課金） | 無料 |
| **セルフホスト** | ✅ 可能（Docker） | ❌ 不可（BaaS のみ） | ❌ 不可 |
| **学習曲線** | 中（PostgreSQL知識が役に立つ） | 低（直感的） | 低（OAuth 2.0を理解すれば） |
| **ベンダーロック** | 低（オープンソース） | 高（Google 依存） | 中（Google 依存） |

---

## 目的別ガイド — どれを選ぶ？

### ケース 1: スタートアップ・個人プロダクト
**→ Supabase 推奨**

理由:
- 無料枠が充実（500MB DB・50GB bandwidth）
- PostgreSQL なので習得が長期的に有利
- セルフホスト可能で将来の自由度が高い

```typescript
// セットアップは最小限
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)
```

### ケース 2: 企業アプリ・予算がある
**→ Firebase 推奨**

理由:
- Google のインフラ・信頼性
- ユーザー管理・ logs・分析が統合
- サポート・ドキュメントが充実

### ケース 3: 既に Google OAuth がある・OAuth 統合メイン
**→ Supabase + Google OAuth 推奨**

理由:
- Supabase の柔軟性 + OAuth の便利さ
- ユーザーの多くが Google アカウント持ち
- パスワード管理負荷が減る

```typescript
// Supabase で Google を有効化するだけ
const { data } = await supabase.auth.signInWithOAuth({
  provider: 'google'
})
```

### ケース 4: 複数の認証方法を同時に用意したい
**→ Supabase + Google OAuth + GitHub OAuth**

Supabase はすべての主要 OAuth プロバイダをサポート：

```typescript
// Google
await supabase.auth.signInWithOAuth({ provider: 'google' })

// GitHub
await supabase.auth.signInWithOAuth({ provider: 'github' })

// Discord
await supabase.auth.signInWithOAuth({ provider: 'discord' })

// Keycloak（自社 SSO）
await supabase.auth.signInWithOAuth({ provider: 'keycloak' })
```

---

## セキュリティチェックポイント

### JWT の場合
- [ ] トークンに `exp`（失効時間）が設定されているか
- [ ] クライアント側で `Authorization: Bearer <token>` ヘッダで送信しているか
- [ ] サーバー側でトークンを検証しているか
- [ ] リフレッシュトークンは HTTP Only クッキーに保存しているか

### セッションクッキーの場合
- [ ] `HttpOnly` フラグが有効か（XSS 対策）
- [ ] `Secure` フラグが有効か（HTTPS のみ送信）
- [ ] `SameSite` が `Lax` 以上に設定されているか（CSRF 対策）
- [ ] セッション TTL は適切か（1～7日推奨）

### OAuth の場合
- [ ] Client Secret をサーバー側だけで使用しているか（クライアント側に含めない）
- [ ] リダイレクト URI ホワイトリストが正確か
- [ ] ユーザーがプロバイダ側で権限を失効させた場合の処理があるか

---

## 用語解説

| 用語 | 意味 |
|---|---|
| JWT | JSON Web Token。署名付きトークンで、トークン自体にユーザー情報を含む |
| アクセストークン | 短命（数時間）で API リクエストの認可に使うトークン |
| リフレッシュトークン | 長命で、新しいアクセストークンを取得するのに使うトークン |
| OAuth 2.0 | ユーザー認証を第三者サービスに委任するプロトコル |
| セッションクッキー | サーバー側でセッション情報を保持・クライアント側にセッションIDのみ送信する方式 |
| HttpOnly | JavaScript からアクセス禁止・XSS 攻撃対策 |
| PKCE | Proof Key for Code Exchange。モバイル・SPA 向けの OAuth セキュリティ強化 |
| メール確認 | メールのリンククリックでユーザー本人確認・スパムサインアップ防止 |
| BaaS | Backend as a Service。Firebase など、バックエンド機能をクラウドで提供 |
| ベンダーロック | 特定サービス（Firebase など）に依存・移行が難しくなる状態 |

---

## まとめ

**3つのサービスの選択フロー：**

```
パスワード管理の負荷を減らしたい？
  → YES → Google OAuth（Supabase/Firebase と併用）
  → NO  → メール＆パスワード

コスト重視・カスタマイズ重視？
  → YES → Supabase
  → NO  → Firebase（Google インフラの信頼性重視）
```

認証は「最初の選択が決定的」です。Supabase なら後から Firebase へ移行も現実的ですが、その逆は非常に難しい。**スタートアップ・個人プロダクトなら Supabase、企業アプリなら Firebase** を推奨します。

次のステップ: 選んだサービスで実装を始め、ユーザー登録フロー・メール検証フロー・パスワード忘却・多要素認証へと段階的に拡張してください。
