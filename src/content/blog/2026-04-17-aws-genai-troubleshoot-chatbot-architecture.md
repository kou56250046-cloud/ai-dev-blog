---
title: "AWSで構築するトラブルシューティング用生成AIチャットボット — 全コンポーネント完全解説"
date: 2026-04-17
category: blog
tags: [aws, amazon-bedrock, claude-code, architecture, setup]
summary: "Cognito・ALB認証・ECS/Fargate・Bedrock・Knowledge Basesなど、AWS生成AIチャットボット構築に必要な全コンポーネントの役割・理由・手順を体系的に解説。"
draft: false
---

## はじめに

社内ナレッジを活用したトラブルシューティング用AIチャットボットを AWS 上で構築するには、**認証・認可・インフラ・AI・観測性**という 5 つの領域にわたる多数のサービスを正しく組み合わせる必要があります。

「Bedrock だけ使えばいいのでは？」と思いがちですが、実際には「誰がアクセスするか（認証）」「何を許可するか（認可）」「どう動かすか（コンピュート）」「何を回答ソースにするか（RAG）」「何が起きているか（ログ）」をすべて設計しなければなりません。

本記事では、各コンポーネントの**役割・必要な理由・設定手順**を順に解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ AWS 生成 AI チャットボットの全体アーキテクチャを理解できる
- ✅ 各サービスの役割と相互関係を説明できる
- ✅ セキュアな認証フロー（Cognito + SSO + SAML/OIDC）を設計できる
- ✅ Bedrock + Knowledge Bases で RAG システムを構築できる
- ✅ CloudWatch/CloudTrail で運用監視を設計できる

**学ぶ意義**: 生成 AI を単なる「試作品」ではなく「本番運用できるエンタープライズサービス」として構築するための全体像が把握できます。

---

## 時間がない人のための要約

1. **認証レイヤー（Cognito + SSO + SAML/OIDC）** — 誰がサービスを使えるかを管理。既存の社内 IdP と連携し、シングルサインオンを実現する
2. **コンピュート・ルーティング（ALB + ECS/Fargate + Lambda@Edge）** — アプリを動かし、認証済みリクエストだけを通す安全な入口を作る
3. **AI・データ（Bedrock + Knowledge Bases + OpenSearch Serverless）** — 社内ドキュメントを埋め込みベクトルで検索し、LLM に文脈を渡して精度の高い回答を生成する

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| AWS アカウント | 管理者権限あり（IAM 操作可能） |
| AWS CLI | v2.x 以上 |
| Terraform / CDK | 任意（本記事は AWS コンソール手順も併記） |
| 社内 IdP | Okta / Azure AD / Google Workspace など SAML 2.0 または OIDC 対応 |
| Amazon Bedrock | us-east-1 または us-west-2 でモデルアクセス申請済み |

---

## 全体アーキテクチャ図

```
[ユーザー（社員）]
       │
       │ HTTPS
       ▼
[CloudFront / Lambda@Edge]  ← CDN・エッジ認証チェック
       │
       ▼
[ALB（Application Load Balancer）]  ← 認証フィルタ・ルーティング
       │  Cognito で認証済みリクエストのみ通す
       ▼
[ECS/Fargate（チャットボット API）]  ← コンテナアプリ本体
       │
       ├─── Amazon Verified Permissions  ← 細粒度認可
       │
       ▼
[Amazon Bedrock]  ← LLM（Claude等）で回答生成
       │
       ▼
[Knowledge Bases for Bedrock]  ← RAG（社内ドキュメント検索）
       │
       ├── OpenSearch Serverless（ベクトルDB）
       └── S3（ソースドキュメント保管）

[Amazon Cognito]  ← ユーザープール・トークン発行
       │
       └── IdP（Okta/Azure AD）← SAML 2.0 / OIDC で連携

[CloudWatch / CloudTrail]  ← 全サービスの監視・監査
```

---

## 手順

### 1. IdP（Identity Provider）を理解する

**役割**: 組織内のユーザー情報（社員名・メール・所属部署）を一元管理する「身元証明書を発行する機関」です。

**なぜ必要か**: チャットボットに独自のユーザー DB を持たせると、社員の入退社のたびに二重管理が発生します。既存の HR システムと連動している社内 IdP（Okta・Azure AD など）を信頼の起点にすることで、退職者のアクセスが即時無効化され、セキュリティ運用コストを大幅に削減できます。

**代表的な IdP**:
| IdP | 特徴 |
|---|---|
| Okta | SaaS 型・SAML/OIDC 両対応・最も普及 |
| Microsoft Azure AD (Entra ID) | Microsoft 365 連携が強力 |
| Google Workspace | Google アカウントで SSO |
| AWS IAM Identity Center（旧 SSO） | AWS ネイティブ・無料 |

---

### 2. SSO（Single Sign-On）を設定する

**役割**: 一度ログインするだけで、複数のシステム（AWS コンソール・チャットボット・社内 Wiki など）をパスワード再入力なしに利用できる仕組みです。

**なぜ必要か**: ユーザーが各サービスごとに ID/PW を管理するのは認証疲れとパスワード使い回しにつながります。SSO はこの問題を根本的に解決し、IT 部門のヘルプデスクコストも削減します。

**AWS IAM Identity Center で SSO を設定する手順**:

```bash
# AWS CLI で IAM Identity Center の設定確認
aws sso-admin list-instances
```

1. AWS コンソール → **IAM Identity Center** → 「有効化」
2. 「設定」→「ID ソース」→「外部 IdP に変更」
3. IdP（Okta 等）から **SAML メタデータ XML** をダウンロード
4. IAM Identity Center にアップロード
5. IAM Identity Center の **ACS URL** と **エンティティ ID** を IdP 側に登録
6. 「アプリケーション割り当て」でチャットボットアプリを追加

---

### 3. SAML 2.0 / OIDC プロトコルを理解する

**役割**: IdP とサービス（SP: Service Provider）の間で「このユーザーは誰か」という情報を安全に伝達するための標準プロトコルです。

**なぜ必要か**: IdP ごとに独自の認証方式があると、サービス側が各 IdP に対応するコードを個別に書かなければなりません。標準プロトコルに従うことで、IdP を変えてもサービス側のコードを変更する必要がなくなります。

| プロトコル | 特徴 | 用途 |
|---|---|---|
| SAML 2.0 | XML ベース・エンタープライズ向け | 企業の SSO（Okta、Azure AD） |
| OIDC (OpenID Connect) | JSON/JWT ベース・モバイル/Web 向け | Google ログイン・新世代 SSO |

**SAML 2.0 フロー**:

```
1. ユーザーがチャットボット URL にアクセス
2. SP（ALB）が IdP へリダイレクト
3. ユーザーが IdP でログイン
4. IdP が SAML アサーション（XML）を発行
5. SP が検証し、セッション確立
```

**OIDC フロー**:

```
1. ユーザーがチャットボット URL にアクセス
2. Cognito が認可エンドポイントへリダイレクト
3. ユーザーが IdP でログイン
4. 認可コードが返却される
5. Cognito がコードをアクセストークン・ID トークン（JWT）と交換
```

> **ポイント**: 新規構築なら OIDC（Cognito + ALB）の組み合わせが実装がシンプルで推奨です。

---

### 4. Amazon Cognito を設定する

**役割**: AWS マネージドの認証・認可サービスです。ユーザープール（誰が使えるか）とアイデンティティプール（何のリソースを使えるか）の 2 種類を提供します。

**なぜ必要か**: ALB の組み込み認証機能と連携することで、アプリケーションコードに一行も認証ロジックを書かずに認証を実装できます。JWT トークンの検証・セッション管理・トークンリフレッシュを Cognito が肩代わりします。

**設定手順**:

```bash
# ユーザープール作成
aws cognito-idp create-user-pool \
  --pool-name chatbot-user-pool \
  --policies '{"PasswordPolicy":{"MinimumLength":12}}' \
  --mfa-configuration "OPTIONAL"
```

```bash
# アプリクライアント作成（ALB 連携用）
aws cognito-idp create-user-pool-client \
  --user-pool-id <USER_POOL_ID> \
  --client-name chatbot-alb-client \
  --generate-secret \
  --allowed-o-auth-flows "code" \
  --allowed-o-auth-scopes "openid" "email" "profile" \
  --callback-urls "https://your-chatbot.example.com/oauth2/idpresponse" \
  --supported-identity-providers "COGNITO" "YourOktaIdP"
```

**外部 IdP との連携設定**:

1. Cognito → 「ID プロバイダー」→「SAML」または「OpenID Connect」を追加
2. IdP のメタデータ URL または XML を入力
3. 属性マッピング（`email` → `email`、`name` → `name`）を設定

---

### 5. ALB（Application Load Balancer）の認証機能を設定する

**役割**: インターネットからのリクエストを受け取り、Cognito 認証を強制した上で ECS/Fargate のコンテナに転送するゲートキーパーです。

**なぜ必要か**: ALB がリクエストレベルで認証を強制することで、**未認証のリクエストがアプリケーションコードに到達することを構造的に防ぎます**。アプリ側で認証チェックを忘れるという人的ミスのリスクがゼロになります。

```bash
# ALB に認証アクションを追加（CLI）
aws elbv2 create-rule \
  --listener-arn <LISTENER_ARN> \
  --conditions '[{"Field":"path-pattern","Values":["/*"]}]' \
  --priority 1 \
  --actions '[
    {
      "Type": "authenticate-cognito",
      "Order": 1,
      "AuthenticateCognitoConfig": {
        "UserPoolArn": "<USER_POOL_ARN>",
        "UserPoolClientId": "<CLIENT_ID>",
        "UserPoolDomain": "your-chatbot-domain",
        "SessionTimeout": 3600,
        "OnUnauthenticatedRequest": "authenticate"
      }
    },
    {
      "Type": "forward",
      "Order": 2,
      "TargetGroupArn": "<TARGET_GROUP_ARN>"
    }
  ]'
```

> **ポイント**: ALB は認証後、ユーザー情報を `x-amzn-oidc-data`（JWT）ヘッダーとしてバックエンドに転送します。アプリはこのヘッダーを読むだけでユーザー情報を取得できます。

---

### 6. Lambda@Edge / CloudFront Functions を設定する

**役割**: CloudFront のエッジロケーション（世界 400+拠点）でリクエストを処理する軽量な関数です。

**なぜ必要か**:
- **Lambda@Edge**: 重い処理（JWT 検証・A/B テスト・リクエスト変換）をエッジで実行。ALB に到達する前段で追加のセキュリティチェックが可能
- **CloudFront Functions**: 超軽量（Sub-ms レスポンス）。URL リライト・単純なヘッダー操作に適している

**用途別の使い分け**:

| 用途 | 推奨 |
|---|---|
| URL リライト・リダイレクト | CloudFront Functions |
| JWT 検証・認証チェック | Lambda@Edge |
| カスタムヘッダー付与 | CloudFront Functions |
| 地理的アクセス制限 | Lambda@Edge |

**Lambda@Edge でエッジ JWT 検証を行う例**:

```javascript
// JWT のペイロードを確認（署名検証は Cognito JWKS で行う）
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  const token = headers['authorization']?.[0]?.value?.replace('Bearer ', '');

  if (!token) {
    return {
      status: '401',
      statusDescription: 'Unauthorized',
      body: JSON.stringify({ error: 'No token provided' }),
    };
  }

  // Cognito JWKS で検証（実装は aws-jwt-verify ライブラリ推奨）
  return request; // 検証OK → リクエストをそのまま通す
};
```

---

### 7. ECS/Fargate でチャットボット API をデプロイする

**役割**: Docker コンテナとして実装されたチャットボット API をサーバーレスで実行する環境です。

**なぜ必要か**: EC2 インスタンスの管理（OS パッチ・スケーリング設定・SSH 鍵管理）は運用負荷が高いです。Fargate ではサーバー管理が不要で、**コンテナのコードとリソース（CPU/メモリ）だけ定義すれば自動的にスケール**します。

**チャットボット API の Dockerfile 例**:

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**ECS タスク定義の要点**:

```json
{
  "family": "chatbot-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::...:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::...:role/chatbot-task-role",
  "containerDefinitions": [
    {
      "name": "chatbot-api",
      "image": "<ECR_URI>:latest",
      "portMappings": [{ "containerPort": 8080 }],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/chatbot",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

> **ポイント**: `taskRoleArn` に Bedrock・S3 へのアクセス権限を持つ IAM ロールを付与します。

---

### 8. JWT（JSON Web Token）を理解する

**役割**: 認証済みユーザーの情報（誰か・権限・有効期限）を**改ざん不可能な形式で格納したトークン**です。

**なぜ必要か**: 従来のセッション管理はサーバー側にセッション情報を保存する必要がありました。JWT はトークン自体に情報が入っているため、**マイクロサービス間でも認証状態を共有でき、スケールに強いアーキテクチャ**になります。

**JWT の構造**:

```
ヘッダー.ペイロード.署名
eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.署名
```

| 部分 | 内容 | 例 |
|---|---|---|
| ヘッダー | アルゴリズム情報 | `{"alg": "RS256"}` |
| ペイロード | ユーザー情報・有効期限 | `{"sub": "user123", "email": "...", "exp": 1234567890}` |
| 署名 | 改ざん検知用の電子署名 | Cognito の秘密鍵で署名 |

**アプリでの JWT 検証（Python 例）**:

```python
import jwt
import requests

# Cognito JWKS から公開鍵を取得して検証
COGNITO_JWKS_URL = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"

def verify_token(token: str) -> dict:
    jwks_client = jwt.PyJWKClient(COGNITO_JWKS_URL)
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=CLIENT_ID
    )
    return payload
```

---

### 9. Amazon Verified Permissions で細粒度認可を実装する

**役割**: Cedar ポリシー言語を使い、「誰が・何に対して・何をできるか」を**コードから分離して管理**する認可サービスです。

**なぜ必要か**: 認証（ログインできるか）と認可（何ができるか）は別物です。「一般社員はトラブルシューティング履歴を閲覧できるが、他部署の履歴は見られない」「管理者だけが新しいナレッジを追加できる」といった細かい権限制御を、コードを変えずにポリシーで管理できます。

**Cedar ポリシーの例**:

```cedar
// 一般社員は自分のチャット履歴のみ閲覧可能
permit (
  principal in Group::"employees",
  action == Action::"ViewChatHistory",
  resource
)
when {
  resource.owner == principal.id
};

// 管理者はすべてのナレッジを編集可能
permit (
  principal in Group::"admins",
  action in [Action::"EditKnowledge", Action::"DeleteKnowledge"],
  resource in KnowledgeBase::"internal"
);
```

**API での認可チェック（Python 例）**:

```python
import boto3

avp_client = boto3.client('verifiedpermissions')

def check_permission(principal_id: str, action: str, resource_id: str) -> bool:
    response = avp_client.is_authorized(
        policyStoreId=POLICY_STORE_ID,
        principal={"entityType": "User", "entityId": principal_id},
        action={"actionType": "Action", "actionId": action},
        resource={"entityType": "ChatHistory", "entityId": resource_id}
    )
    return response['decision'] == 'ALLOW'
```

---

### 10. Amazon Bedrock でLLM推論を実装する

**役割**: Anthropic Claude・Meta Llama・Amazon Titan など複数の基盤モデル（LLM）を、API 一つで呼び出せるマネージドサービスです。

**なぜ必要か**: 自前で LLM をホスティングすると GPU インスタンスの運用・モデルの更新・スケーリング管理が必要です。Bedrock はこれらをすべて AWS が管理し、**使った分だけ課金（トークン単位）**のため、コスト予測が容易です。

**モデル呼び出し手順**:

```bash
# Bedrock でモデルアクセスを有効化（コンソール操作）
# AWS コンソール → Amazon Bedrock → モデルアクセス → Claude を申請
```

```python
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

def invoke_claude(prompt: str, context: str) -> str:
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
        "system": "あなたはAWSトラブルシューティングの専門家AIです。社内ナレッジベースの情報を参考に、具体的で実用的な解決策を提案してください。",
        "messages": [
            {
                "role": "user",
                "content": f"以下の情報を参考に質問に答えてください。\n\n参考情報:\n{context}\n\n質問: {prompt}"
            }
        ]
    }

    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
        body=json.dumps(body)
    )

    return json.loads(response['body'].read())['content'][0]['text']
```

---

### 11. S3 にナレッジソースを格納する

**役割**: トラブルシューティングの元データ（社内マニュアル・過去の障害対応記録・手順書など）を保管するオブジェクトストレージです。

**なぜ必要か**: Knowledge Bases は S3 をデータソースとしてクロールし、ベクトル化します。S3 は耐久性 99.999999999%（イレブンナイン）で、バージョニング・アクセス制御・暗号化を標準サポートするため、RAG のデータ保管に最適です。

**推奨するフォルダ構成**:

```
s3://your-company-knowledge-base/
├── troubleshooting/
│   ├── aws/
│   │   ├── ec2-common-issues.md
│   │   ├── rds-troubleshooting.md
│   │   └── lambda-debugging.md
│   └── network/
│       └── vpc-connectivity.md
├── runbooks/
│   └── incident-response.md
└── past-incidents/
    └── 2026-03-outage-report.md
```

```bash
# ドキュメントをアップロード
aws s3 sync ./knowledge-docs/ s3://your-company-knowledge-base/ \
  --sse aws:kms \
  --exclude ".DS_Store"
```

> **ポイント**: S3 バケットポリシーで Bedrock Knowledge Bases サービスからのアクセスのみを許可し、**パブリックアクセスブロックを必ず有効化**してください。

---

### 12. OpenSearch Serverless と Embedding Model でベクトル検索を構築する

**役割**:
- **Embedding Model**: テキスト（文章）を数値ベクトル（意味の座標）に変換するモデル。「EC2 が起動しない」と「インスタンスが立ち上がらない」が意味的に近いことを数値で表現できます
- **OpenSearch Serverless**: ベクトルデータを高速検索するための分散データベース。Knowledge Bases のバックエンドとして機能します

**なぜ必要か**: キーワード検索はタイポや言い回しの違いに弱いです。ベクトル検索（セマンティック検索）は**意味の近さ**で検索するため、「サービス停止」「ダウンタイム」「接続できない」を同じ問題として検索できます。

**設定手順**:

```bash
# OpenSearch Serverless コレクション作成
aws opensearchserverless create-collection \
  --name chatbot-knowledge-vectors \
  --type VECTORSEARCH \
  --description "Chatbot RAG vector store"
```

```bash
# アクセスポリシー作成（Knowledge Bases からのアクセス許可）
aws opensearchserverless create-access-policy \
  --name chatbot-access-policy \
  --type data \
  --policy '[
    {
      "Rules": [
        {
          "ResourceType": "index",
          "Resource": ["index/chatbot-knowledge-vectors/*"],
          "Permission": [
            "aoss:CreateIndex",
            "aoss:WriteDocument",
            "aoss:ReadDocument",
            "aoss:DescribeIndex"
          ]
        }
      ],
      "Principal": ["arn:aws:iam::<ACCOUNT_ID>:role/AmazonBedrockExecutionRoleForKnowledgeBase"]
    }
  ]'
```

**使用する Embedding Model（Bedrock 経由）**:

| モデル | 特徴 | 推奨用途 |
|---|---|---|
| Amazon Titan Embeddings V2 | 日本語対応・低コスト | 日本語ドキュメント（本ユースケース推奨） |
| Cohere Embed Multilingual | 多言語対応 | 多言語ドキュメント混在時 |

---

### 13. Knowledge Bases for Bedrock を設定する

**役割**: S3 のドキュメントを自動でクロール・Embedding・OpenSearch へ格納し、Bedrock の LLM 呼び出し時に自動でベクトル検索（RAG）を実行するマネージドサービスです。

**なぜ必要か**: RAG（検索拡張生成）を自前実装すると、ドキュメントのチャンキング・Embedding 呼び出し・ベクトル DB への書き込み・検索・コンテキスト整形を自分で実装する必要があります。Knowledge Bases はこれを**ノーコード**で提供します。

**設定手順（コンソール）**:

1. Amazon Bedrock → **Knowledge Bases** → 「Knowledge Base を作成」
2. データソース: S3 バケット URI を指定
3. Embedding Model: `amazon.titan-embed-text-v2:0` を選択
4. ベクトルストア: 先ほど作成した OpenSearch Serverless コレクションを選択
5. 「同期」を実行 → ドキュメントがベクトル化されて保存される

**RAG 付き Bedrock 呼び出し（Python 例）**:

```python
bedrock_agent = boto3.client('bedrock-agent-runtime', region_name='us-east-1')

def retrieve_and_generate(query: str) -> str:
    response = bedrock_agent.retrieve_and_generate(
        input={"text": query},
        retrieveAndGenerateConfiguration={
            "type": "KNOWLEDGE_BASE",
            "knowledgeBaseConfiguration": {
                "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                "modelArn": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
                "retrievalConfiguration": {
                    "vectorSearchConfiguration": {"numberOfResults": 5}
                }
            }
        }
    )
    return response['output']['text']
```

> **ポイント**: `retrieve_and_generate` は検索と生成を 1 回の API 呼び出しで完結します。引用元（どのドキュメントの何ページか）も自動付与されます。

---

### 14. CloudWatch / CloudTrail で監視・監査を設定する

**役割**:
- **CloudWatch**: アプリケーションのメトリクス（CPU・エラー率・レイテンシ）とログを収集・可視化・アラート通知するサービス
- **CloudTrail**: AWS API 呼び出しの全履歴を記録する監査ログサービス（「誰が・いつ・どのリソースに・何をしたか」）

**なぜ必要か**: 生成 AI サービスはコストが青天井になるリスクがあります。CloudWatch でトークン使用量を監視しアラートを設定することで、異常な使用を即時検知できます。CloudTrail は不正アクセスの事後調査に不可欠で、**コンプライアンス要件（SOC2・ISO27001）の証跡**にもなります。

**CloudWatch ダッシュボードの設定項目**:

```bash
# ECS のメトリクス監視設定例
aws cloudwatch put-metric-alarm \
  --alarm-name "chatbot-high-error-rate" \
  --alarm-description "チャットボット API エラー率が 5% 超過" \
  --metric-name "HTTPCode_Target_5XX_Count" \
  --namespace "AWS/ApplicationELB" \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions "arn:aws:sns:...:chatbot-alerts"
```

**CloudTrail で Bedrock の呼び出し履歴を記録**:

```bash
# CloudTrail の証跡作成（全リージョン対象）
aws cloudtrail create-trail \
  --name chatbot-audit-trail \
  --s3-bucket-name your-cloudtrail-logs \
  --is-multi-region-trail \
  --enable-log-file-validation

# Bedrock の API 呼び出しも自動記録される
aws cloudtrail start-logging --name chatbot-audit-trail
```

**監視すべき主要メトリクス**:

| メトリクス | ソース | アラート基準（例） |
|---|---|---|
| Bedrock InvocationLatency | CloudWatch（Bedrock） | P99 > 10秒 |
| ECS CPU Utilization | CloudWatch（ECS） | > 80% |
| ALB 5xx エラー率 | CloudWatch（ALB） | > 5% |
| Cognito 認証失敗数 | CloudWatch（Cognito） | 5分で > 20回 |
| Knowledge Base 同期エラー | CloudWatch（Bedrock） | エラー発生時即通知 |

---

## 用語解説

| 用語 | 意味 |
|---|---|
| IdP（ID プロバイダー） | ユーザーの身元を証明する機関（Okta、Azure AD など） |
| SP（サービスプロバイダー） | IdP を信頼してサービスを提供する側（今回のチャットボット） |
| SSO | 一度のログインで複数のサービスを利用できる仕組み |
| SAML 2.0 | 企業向け認証情報の受け渡し標準（XML ベース） |
| OIDC | Web/モバイル向け認証標準（JSON/JWT ベース） |
| JWT | 改ざん不可能な形式でユーザー情報を格納するトークン |
| RAG | LLM の回答精度を上げるために、外部知識を検索して文脈に追加する手法 |
| Embedding | テキストを意味を持つ数値ベクトルに変換すること |
| ベクトル検索 | 意味の近さ（コサイン類似度）で文書を検索する手法 |
| Cedar ポリシー | Amazon Verified Permissions が使う権限定義言語 |
| オートスケーリング | アクセス増加に応じてサーバー台数を自動増減する機能 |
| 証跡（Trail） | CloudTrail が記録する API 呼び出しの監査ログ |

---

## まとめ

本記事では、AWS 生成 AI チャットボット構築に必要な 14 のコンポーネントを体系的に解説しました。各サービスの役割を整理すると：

| レイヤー | サービス | 役割の一言要約 |
|---|---|---|
| 認証 | Cognito + SSO + SAML/OIDC + IdP | 「誰が使えるか」を管理 |
| 認可 | JWT + Verified Permissions | 「何をできるか」を管理 |
| ゲートウェイ | ALB + Lambda@Edge | 安全な入口・エッジ処理 |
| コンピュート | ECS/Fargate | アプリの実行環境 |
| AI推論 | Bedrock | LLM で回答を生成 |
| ナレッジ | S3 + Knowledge Bases + OpenSearch + Embedding | 社内情報を意味検索 |
| 観測性 | CloudWatch + CloudTrail | 監視・監査・コスト管理 |

次のステップとして、[Amazon Bedrock Agents を使ったマルチステップ推論](/blog/2026-04-17-aws-genai-troubleshoot-chatbot-architecture)や、[RAGAS を使った RAG 評価指標の実装](/blog/2026-04-17-aws-rag-evaluation-ragas)も合わせて参照してください。
