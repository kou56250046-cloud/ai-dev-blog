---
title: "社内knowledgeを活用したAWSトラブルシューティング向けチャットサービス構築ガイド"
date: 2026-04-16
category: blog
tags: [architecture, setup, tips, aws, mcp-server]
summary: "AWS Bedrock・Kendra・OpenSearchを使った社内ナレッジ連携チャットサービスの構築手順とアーキテクチャベストプラクティス3選を、各AWSサービスの役割・意義とともに徹底解説。"
draft: false
---

## はじめに

「同じトラブルを何度も調査している」「ベテランしか知らない暗黙知が属人化している」

社内のトラブルシューティング業務で、こうした課題を抱えているチームは少なくありません。社内Wikiや障害報告書、手順書が膨大に蓄積されているにもかかわらず、必要なときに素早く参照できないのが実情です。

この記事では、**社内ナレッジ（社内Wiki・障害DB・手順書）をAWSに連携し、チャット形式でトラブルシューティングを支援するサービス**の構築手順とアーキテクチャベストプラクティスを解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ AWSの主要サービス（Bedrock・Kendra・OpenSearch・Lambda等）の役割と使い分けを理解できる
- ✅ 社内ナレッジ連携チャットサービスの3種類のアーキテクチャを選択・設計できる
- ✅ RAG（検索拡張生成）の仕組みをAWSで実装できる
- ✅ セキュリティ・コスト・スケーラビリティを考慮したシステム設計ができる

**学ぶ意義**: 属人化した暗黙知をAIが24時間参照可能にすることで、インシデント対応速度と品質を均質化できる。

---

## 時間がない人のための要約

1. **RAGアーキテクチャが基本** — LLMに社内ドキュメントを検索させて回答を生成する仕組み（Retrieval-Augmented Generation）が最もコスト効率よく精度が高い
2. **AWS Bedrockが中核** — Claude・Titan等の基盤モデルをAPIで利用でき、Knowledge Base機能でRAGをマネージドに構築できる
3. **用途に応じて3パターンを選ぶ** — ①Bedrockフルマネージド型 ②Kendra精密検索型 ③OpenSearch自社管理型の3つがベストプラクティス

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| AWSアカウント | 管理者権限または必要なIAMポリシー付与済み |
| AWS CLI | v2.x 以上 |
| Node.js / Python | 20.x / 3.11 以上（Lambda関数実装用） |
| 社内ドキュメント形式 | PDF・Word・Markdown・HTML・テキストいずれか |
| Bedrock利用リージョン | us-east-1 または us-west-2（モデルアクセス申請済み） |

---

## システム全体像

社内ナレッジを使ったトラブルシューティング支援チャットは、大きく以下の流れで動作します。

```
[ユーザー（社員）]
      ↓ 質問入力
[チャットUI（React / Slack Bot等）]
      ↓ API呼び出し
[API Gateway]
      ↓
[Lambda（オーケストレーション）]
      ↓ ①社内ドキュメント検索
[検索エンジン（Kendra / OpenSearch / Bedrock KB）]
      ↓ ②関連ドキュメント取得
[Amazon Bedrock（LLM推論）]
      ↓ ③回答生成
[Lambda]
      ↓ レスポンス返却
[ユーザーへ回答]
```

この「検索して → LLMが回答する」パターンを **RAG（Retrieval-Augmented Generation）** と呼びます。

---

## 使用するAWSサービスの役割と意義

アーキテクチャに登場する主要サービスの役割を個別に理解しておきましょう。

### Amazon Bedrock

| 項目 | 内容 |
|---|---|
| 役割 | テキスト生成・質問応答を行う基盤AI（LLM）のマネージドサービス |
| 提供モデル | Claude 3（Anthropic）、Titan（Amazon）、Llama等 |
| 意義 | GPUインフラ管理不要でClaude等の高精度モデルをAPI1本で呼び出せる。Knowledge Base機能でRAGをノーコードで構築可能 |

Bedrockは「AIモデルをAWS上で安全に使うための出入口」です。独自のサーバーにモデルを載せる必要がなく、**データがAWS外に出ない**点も社内ナレッジ連携において重要なセキュリティ要件を満たします。

### Amazon Bedrock Knowledge Base

| 項目 | 内容 |
|---|---|
| 役割 | S3のドキュメントを自動でチャンク分割・ベクトル化し、RAG検索基盤を構築する |
| 対応形式 | PDF・Word・HTML・Markdown・テキスト |
| 意義 | ドキュメントのVector化・Sync・検索をすべてマネージドで提供。コード不要でRAGを実装できる |

### Amazon S3

| 項目 | 内容 |
|---|---|
| 役割 | 社内ドキュメント（障害報告書・手順書・Wiki）の保存場所 |
| 意義 | バージョニング・暗号化・IAMアクセス制御が標準装備。Bedrock Knowledge BaseやKendraのデータソースとして直接連携できる |

### Amazon Kendra

| 項目 | 内容 |
|---|---|
| 役割 | エンタープライズ向け高精度セマンティック検索エンジン |
| 意義 | 社内ドキュメントの意味を理解した検索ができる。IT・医療・法務など業界特化の理解モデルを内蔵。FAQ形式のQ&Aも扱える |

Kendraは「グーグルの社内版」です。単純なキーワードマッチではなく、「このエラーの原因は何か」という文章で検索しても関連ドキュメントを正確に返します。

### Amazon OpenSearch Service

| 項目 | 内容 |
|---|---|
| 役割 | フルテキスト検索 ＋ ベクトル検索（kNN）を提供するマネージド検索エンジン |
| 意義 | Vector検索とキーワード検索のハイブリッドが可能。カスタマイズ性が高く、既存Elasticsearchからの移行も容易 |

### AWS Lambda

| 項目 | 内容 |
|---|---|
| 役割 | 検索 → LLM呼び出し → レスポンス生成のオーケストレーション処理 |
| 意義 | サーバーレスで管理不要。リクエスト数に応じた自動スケール。コールドスタートの問題はProvisioned Concurrencyで解消可能 |

### Amazon API Gateway

| 項目 | 内容 |
|---|---|
| 役割 | チャットUIからのHTTPリクエストを受け付けてLambdaに転送するエンドポイント |
| 意義 | 認証（Cognito/IAM）・レート制限・SSE（Server-Sent Events）によるストリーミング応答をマネージドで実装できる |

### Amazon Cognito

| 項目 | 内容 |
|---|---|
| 役割 | 社員認証（ログイン・セッション管理）の管理 |
| 意義 | SAML連携でActive Directory（社内IdP）と接続可能。社員のみに利用を限定できる |

### Amazon DynamoDB

| 項目 | 内容 |
|---|---|
| 役割 | チャット履歴・会話コンテキストの保存 |
| 意義 | サーバーレス・自動スケール・TTL設定で古い会話の自動削除が可能。Lambda連携がシンプル |

---

## アーキテクチャベストプラクティス3選

### パターン① Bedrock Knowledge Base フルマネージド型

**特徴**: 最もシンプルに構築でき、管理コストが最小。PoC〜中規模本番に最適。

```
S3（社内ドキュメント）
    ↓ 自動同期・Vector化
Bedrock Knowledge Base（OpenSearch Serverless）
    ↓ RAG検索 + Claude 3による回答生成
Lambda（Retrieve and Generate API）
    ↓
API Gateway → チャットUI
```

**構築手順**:

```bash
# 1. S3バケットにドキュメントをアップロード
aws s3 cp ./docs/ s3://company-knowledge-docs/ --recursive

# 2. Bedrock Knowledge Base を作成（AWS Console または CDK）
# - データソース: 作成したS3バケットを指定
# - エンベディングモデル: amazon.titan-embed-text-v2
# - ベクトルDB: OpenSearch Serverless（自動作成）

# 3. Knowledge Base ID を確認
aws bedrock-agent list-knowledge-bases \
  --query 'knowledgeBaseSummaries[].knowledgeBaseId'
```

Lambda から Retrieve and Generate API を呼び出す実装例：

```python
import boto3
import json

bedrock_agent = boto3.client("bedrock-agent-runtime", region_name="us-east-1")

def handler(event, context):
    user_message = event["body"]["message"]
    knowledge_base_id = "YOUR_KB_ID"
    
    response = bedrock_agent.retrieve_and_generate(
        input={"text": user_message},
        retrieveAndGenerateConfiguration={
            "type": "KNOWLEDGE_BASE",
            "knowledgeBaseConfiguration": {
                "knowledgeBaseId": knowledge_base_id,
                "modelArn": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
                "retrievalConfiguration": {
                    "vectorSearchConfiguration": {"numberOfResults": 5}
                },
                "generationConfiguration": {
                    "promptTemplate": {
                        "textPromptTemplate": """あなたは社内トラブルシューティング専門のアシスタントです。
以下の社内ドキュメントを参照して、質問に日本語で回答してください。

$search_results$

質問: $query$"""
                    }
                }
            }
        }
    )
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "answer": response["output"]["text"],
            "citations": response.get("citations", [])
        }, ensure_ascii=False)
    }
```

**向いているケース**:
- 素早くPoC・MVP を作りたい
- インフラ管理リソースが限られている
- ドキュメント形式が標準的（PDF・Word・Markdown）

**制約**:
- 検索ロジックのカスタマイズに限界がある
- OpenSearch Serverlessのコストが高め（月$100〜）

---

### パターン② Amazon Kendra 精密検索型

**特徴**: エンタープライズグレードの高精度検索。FAQデータベースとの統合が強力。IT障害対応に特化した用語理解モデルを持つ。

```
S3 / SharePoint / Confluence（社内ドキュメント）
    ↓ Kendraコネクタで自動同期
Amazon Kendra（エンタープライズ検索）
    ↓ セマンティック検索結果（スニペット付き）
Lambda（検索結果をプロンプトに組み込む）
    ↓ Retrieve and Generate
Amazon Bedrock（Claude 3で回答生成）
    ↓
API Gateway → チャットUI / Slack Bot
```

**構築手順**:

```bash
# 1. Kendra インデックスを作成
aws kendra create-index \
  --name "company-troubleshoot-index" \
  --edition "ENTERPRISE_EDITION" \
  --role-arn "arn:aws:iam::ACCOUNT_ID:role/KendraRole"

# 2. S3をデータソースとして追加
aws kendra create-data-source \
  --index-id "YOUR_INDEX_ID" \
  --name "company-docs-s3" \
  --type "S3" \
  --configuration '{"S3Configuration":{"BucketName":"company-knowledge-docs"}}'

# 3. 同期ジョブ実行（初回インデックス作成）
aws kendra start-data-source-sync-job \
  --index-id "YOUR_INDEX_ID" \
  --id "YOUR_DATA_SOURCE_ID"
```

Kendra + Bedrock を組み合わせた Lambda 実装：

```python
import boto3
import json

kendra = boto3.client("kendra", region_name="us-east-1")
bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

def handler(event, context):
    user_query = event["body"]["message"]
    index_id = "YOUR_KENDRA_INDEX_ID"
    
    # Step1: Kendraで関連ドキュメントを検索
    kendra_response = kendra.query(
        IndexId=index_id,
        QueryText=user_query,
        QueryResultTypeFilter="DOCUMENT",
        PageSize=5
    )
    
    # Step2: 検索結果をコンテキストとしてまとめる
    contexts = []
    for result in kendra_response.get("ResultItems", []):
        excerpt = result.get("DocumentExcerpt", {}).get("Text", "")
        doc_title = result.get("DocumentTitle", {}).get("Text", "")
        contexts.append(f"【{doc_title}】\n{excerpt}")
    
    context_text = "\n\n---\n\n".join(contexts)
    
    # Step3: BedrockのClaude 3で回答生成
    prompt = f"""あなたは社内インフラのトラブルシューティング専門アシスタントです。
以下の社内ドキュメントを参照して、問題の原因と解決手順を日本語で回答してください。
根拠がない場合は「社内ドキュメントに情報がありません」と伝えてください。

【参照ドキュメント】
{context_text}

【質問】
{user_query}"""

    response = bedrock.invoke_model(
        modelId="anthropic.claude-3-sonnet-20240229-v1:0",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2000,
            "messages": [{"role": "user", "content": prompt}]
        })
    )
    
    result = json.loads(response["body"].read())
    answer = result["content"][0]["text"]
    
    return {
        "statusCode": 200,
        "body": json.dumps({"answer": answer}, ensure_ascii=False)
    }
```

**向いているケース**:
- SharePoint・Confluence・Salesforceなど多様なデータソースがある
- FAQデータベースを持っており、Q&A形式での回答精度を重視したい
- 検索クエリの意味理解精度を最優先したい

**制約**:
- Enterprise Editionは月額コストが高い（$810/月〜）
- カスタムドメイン用語の学習に時間がかかる

---

### パターン③ OpenSearch ハイブリッド検索型

**特徴**: ベクトル検索 ＋ キーワード検索のハイブリッドで高精度。コスト・カスタマイズ性のバランスが最も良く、大規模運用に向く。

```
S3（社内ドキュメント）
    ↓ Lambda（チャンク分割・エンベディング生成）
OpenSearch Service（ベクトルDB + 全文検索）
    ↓ ハイブリッド検索（Semantic + Keyword）
Lambda（検索結果 + 会話履歴でプロンプト構築）
    ↓
Amazon Bedrock（Claude 3 Sonnet）
    ↓
API Gateway（WebSocket or SSE）
    ↓
チャットUI（React）+ DynamoDB（会話履歴）
```

**インデックス作成（ドキュメント取り込みパイプライン）**:

```python
import boto3
import json
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

# OpenSearchクライアント設定（IAM認証）
credentials = boto3.Session().get_credentials()
awsauth = AWS4Auth(
    credentials.access_key,
    credentials.secret_key,
    "us-east-1",
    "es",
    session_token=credentials.token
)

os_client = OpenSearch(
    hosts=[{"host": "YOUR_OPENSEARCH_ENDPOINT", "port": 443}],
    http_auth=awsauth,
    use_ssl=True,
    connection_class=RequestsHttpConnection
)

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

def embed_text(text: str) -> list[float]:
    """Bedrock Titanでテキストをベクトル化"""
    response = bedrock.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({"inputText": text})
    )
    return json.loads(response["body"].read())["embedding"]

def index_document(doc_id: str, title: str, content: str, metadata: dict):
    """ドキュメントをOpenSearchにインデックス"""
    vector = embed_text(content)
    
    os_client.index(
        index="company-knowledge",
        id=doc_id,
        body={
            "title": title,
            "content": content,
            "content_vector": vector,  # kNN検索用ベクトル
            "metadata": metadata       # カテゴリ・作成日等のフィルタ用
        }
    )
```

**ハイブリッド検索クエリ**:

```python
def hybrid_search(query: str, top_k: int = 5) -> list[dict]:
    """ベクトル検索とキーワード検索を組み合わせたハイブリッド検索"""
    query_vector = embed_text(query)
    
    search_body = {
        "size": top_k,
        "query": {
            "bool": {
                "should": [
                    # キーワード検索（BM25）
                    {
                        "multi_match": {
                            "query": query,
                            "fields": ["title^2", "content"],
                            "boost": 0.3
                        }
                    },
                    # ベクトル類似度検索（kNN）
                    {
                        "knn": {
                            "content_vector": {
                                "vector": query_vector,
                                "k": top_k,
                                "boost": 0.7
                            }
                        }
                    }
                ]
            }
        }
    }
    
    response = os_client.search(index="company-knowledge", body=search_body)
    return [hit["_source"] for hit in response["hits"]["hits"]]
```

**向いているケース**:
- ドキュメント数が多く検索精度のチューニングが必要
- 既存のElasticsearch/OpenSearch環境を活用したい
- コストをコントロールしながら大規模化したい

**制約**:
- 取り込みパイプライン（エンベディング生成）の実装・管理が必要
- クラスター設計・スケール計画が必要

---

## 3パターン比較表

| 評価軸 | ① Bedrock KB | ② Kendra | ③ OpenSearch |
|---|---|---|---|
| 構築難易度 | ★☆☆（低） | ★★☆（中） | ★★★（高） |
| 月額コスト目安 | $100〜$300 | $810〜 | $150〜$500 |
| 検索精度 | 高 | 最高 | 高（チューニング次第） |
| カスタマイズ性 | 低 | 中 | 高 |
| 多様なデータソース | △（S3のみ） | ◎（20種以上） | △（要実装） |
| スケーラビリティ | 自動 | 自動 | 手動設計が必要 |
| **推奨シーン** | PoC・中小規模 | 大企業・高精度 | 大規模・自社管理 |

---

## セキュリティ設計の鉄則

社内ナレッジを扱うシステムでは、以下のセキュリティ設計が必須です。

### 1. 最小権限IAMポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:RetrieveAndGenerate"
      ],
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::company-knowledge-docs/*"
    }
  ]
}
```

### 2. 通信・保存の暗号化

- S3バケット: SSE-KMS（AWS KMS マネージドキー）
- API Gateway: HTTPS強制（TLS 1.2以上）
- DynamoDB: 保存時暗号化（KMS）

### 3. Cognito + Active Directory 連携

```bash
# SAML IdP（社内AD）との連携設定
aws cognito-idp create-identity-provider \
  --user-pool-id "YOUR_POOL_ID" \
  --provider-name "CorporateAD" \
  --provider-type "SAML" \
  --provider-details '{"MetadataURL":"https://ad.your-company.com/saml/metadata"}'
```

---

## 運用・監視設計

### CloudWatch Logs でチャット品質を監視

```python
import boto3
import json

logs = boto3.client("logs")

def log_chat_event(user_id: str, query: str, answer: str, latency_ms: int):
    """回答品質・レイテンシをCloudWatch Logsに記録"""
    logs.put_log_events(
        logGroupName="/chat-service/conversations",
        logStreamName=f"user-{user_id}",
        logEvents=[{
            "timestamp": int(boto3.Session().client("sts").get_caller_identity()["Account"]),
            "message": json.dumps({
                "user_id": user_id,
                "query": query,
                "answer_length": len(answer),
                "latency_ms": latency_ms
            }, ensure_ascii=False)
        }]
    )
```

### コスト最適化のポイント

| 施策 | 効果 |
|---|---|
| Bedrock Inference Profiles使用 | コスト最大50%削減 |
| Lambda Provisioned Concurrencyで暖機 | コールドスタート0ms |
| DynamoDB TTL（30日）設定 | 古い会話履歴を自動削除 |
| S3 Intelligent-Tiering | アクセス頻度に応じた自動コスト最適化 |

---

## まとめ

本記事では、社内ナレッジを活用したAWSトラブルシューティング支援チャットサービスの構築について解説しました。

- **RAGアーキテクチャ**（検索 + LLM生成）が社内ナレッジ連携の基本設計
- **Bedrock Knowledge Base**：素早くPoC・中規模本番を構築したいチームに最適
- **Amazon Kendra**：SharePoint等の多様なデータソースと高精度検索が必要な大企業向け
- **OpenSearch ハイブリッド型**：コストと精度のバランスを取りながら大規模運用したいチーム向け

次のステップとして、SlackのBot APIと本システムを連携することで、エンジニアが普段使うSlack上から直接トラブルシューティングの支援を受けられる環境を構築できます。

**関連記事**: MCPサーバーの設定・グローバル接続の仕組みも合わせて読むと、AI連携の全体像がより深く理解できます。
