---
title: "RedmineチケットをAWS RAGで検索・回答生成する全構成ガイド"
date: 2026-04-28
category: blog
tags: [aws, rag, architecture, tips, setup]
summary: "RedmineのAPIでチケットを取得し、S3・Auroraに保存後、Bedrock Knowledge Base＋OpenSearch Serverlessでベクトル検索・LLM回答生成するRAG構成を完全解説。"
draft: false
---

## はじめに

社内のプロジェクト管理ツールとして広く使われているRedmine。過去チケットの検索や「あの問題どう対応したっけ？」という調査に、意外と時間を取られていませんか？

RAG（Retrieval-Augmented Generation）をAWSで構築することで、RedmineのチケットをAIに「知識」として持たせ、自然言語で質問するだけで関連チケットを踏まえた回答を得られます。本記事では、Redmine API連携からLLM回答生成まで、アーキテクチャの全レイヤーを実装レベルで解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ Redmine REST APIでチケット情報を定期取得してAWSに連携できる
- ✅ S3（テキスト）・Aurora（メタデータ）への2段保存設計を理解できる
- ✅ Bedrock Knowledge Base＋OpenSearch ServerlessでTop-k検索→LLM回答生成を実装できる

**学ぶ意義**: ナレッジが蓄積されたRedmineをそのまま「AIの記憶」にできるため、新規メンバーのオンボーディングや障害対応の知識検索が劇的に速くなる。

---

## 時間がない人のための要約

1. **Redmine API → S3/Aurora** — チケットをテキスト化してS3に保存、メタデータはAuroraで管理する2段構成が基本
2. **Bedrock Knowledge Base** — S3のテキストを自動でチャンク分割・Embedding化してOpenSearch Serverlessに格納する、マネージドなベクトルDB連携
3. **Top-k → LLM** — 質問に近いチャンクをk件取得し、コンテキストとしてClaudeに渡すことで、チケット情報に基づいた回答を生成する

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Redmineバージョン | 4.x 以上（REST API有効化済み） |
| AWSリージョン | ap-northeast-1（東京）推奨 |
| Pythonバージョン | 3.12 |
| Bedrock有効モデル | Amazon Titan Embeddings V2、Claude 3.5 Sonnet |
| AWSアカウント | IAMロール設定権限あり |
| Redmine APIキー | ユーザー設定 → APIアクセスキー で発行済み |

---

## 全体アーキテクチャ

```
Redmine
  │
  │ REST API (チケット・コメント取得)
  ↓
AWS Lambda (fetch-redmine)
  ├──→ S3 (テキストファイル / Knowledge Baseのデータソース)
  └──→ Aurora PostgreSQL (メタデータ: ID・ステータス・担当者など)
         │
         │ (S3変更イベント / 手動同期)
         ↓
Amazon Bedrock Knowledge Base
  │ ①チャンク分割 (Fixed-size: 512 token, overlap 50 token)
  │ ②Embedding (Amazon Titan Embeddings V2)
  ↓
OpenSearch Serverless (ベクトルインデックス)
  │
  │ Top-k ベクトル検索 (k=5)
  ↓
Amazon Bedrock (Claude 3.5 Sonnet)
  │ コンテキスト付きプロンプトで回答生成
  ↓
回答 (チケット根拠付き)
```

---

## 手順

### 1. Redmine API でチケット情報を取得する

Redmine の REST API は `/issues.json` エンドポイントで全チケットを取得できます。ページネーションに対応し、全件を漏らさず取得することがポイントです。

```python
# lambda/fetch_redmine.py
import requests
import os

REDMINE_URL = os.environ["REDMINE_URL"]
API_KEY = os.environ["REDMINE_API_KEY"]

def fetch_all_tickets(project_id: str) -> list[dict]:
    """指定プロジェクトの全チケットをページネーション込みで取得"""
    headers = {"X-Redmine-API-Key": API_KEY}
    tickets = []
    offset = 0
    limit = 100  # Redmineの最大値

    while True:
        resp = requests.get(
            f"{REDMINE_URL}/issues.json",
            headers=headers,
            params={
                "project_id": project_id,
                "limit": limit,
                "offset": offset,
                "status_id": "*",  # 全ステータス取得
                "include": "journals,attachments"  # コメント・添付も含む
            },
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        issues = data.get("issues", [])
        tickets.extend(issues)

        if len(issues) < limit:
            break
        offset += limit

    return tickets
```

> **ポイント**: `include=journals` を付けることでコメント（会話履歴）も取得でき、RAGの回答精度が向上します。

---

### 2. チケットをテキスト化してS3に保存する

Bedrock Knowledge Base が読み込めるのはS3上のテキスト／PDFファイルです。チケット情報を検索しやすいテキスト形式に整形して保存します。

```python
# lambda/fetch_redmine.py (続き)
import boto3
import json
from datetime import datetime

s3 = boto3.client("s3")
BUCKET_NAME = os.environ["S3_BUCKET_NAME"]

def format_ticket_as_text(ticket: dict) -> str:
    """チケット1件を検索しやすいテキストに整形"""
    journals_text = ""
    for j in ticket.get("journals", []):
        if j.get("notes"):
            journals_text += f"\n[コメント by {j['user']['name']} on {j['created_on']}]\n{j['notes']}\n"

    return f"""チケットID: #{ticket['id']}
タイトル: {ticket['subject']}
プロジェクト: {ticket['project']['name']}
ステータス: {ticket['status']['name']}
優先度: {ticket['priority']['name']}
担当者: {ticket.get('assigned_to', {}).get('name', '未割り当て')}
カテゴリ: {ticket.get('category', {}).get('name', 'なし')}
作成日: {ticket['created_on']}
更新日: {ticket['updated_on']}

【説明】
{ticket.get('description', '説明なし')}

【コメント履歴】
{journals_text if journals_text else 'コメントなし'}
"""

def save_ticket_to_s3(ticket: dict, project_id: str) -> str:
    content = format_ticket_as_text(ticket)
    key = f"redmine/{project_id}/ticket_{ticket['id']}.txt"

    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=content.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
        Metadata={
            "ticket-id": str(ticket["id"]),
            "project-id": project_id,
            "status": ticket["status"]["name"]
        }
    )
    return key
```

---

### 3. メタデータをAurora PostgreSQLに保存する

S3にはRAG用のテキスト、Auroraには構造化メタデータを保存します。Aurora側は「チケット検索・フィルタリング」やログ管理に使います。

```sql
-- DDL: チケットメタデータテーブル
CREATE TABLE IF NOT EXISTS redmine_tickets (
    ticket_id      INTEGER PRIMARY KEY,
    project_id     VARCHAR(100)  NOT NULL,
    subject        TEXT          NOT NULL,
    status         VARCHAR(50),
    priority       VARCHAR(50),
    assigned_to    VARCHAR(100),
    category       VARCHAR(100),
    s3_key         TEXT          NOT NULL,
    created_on     TIMESTAMPTZ,
    updated_on     TIMESTAMPTZ,
    synced_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- インデックス（ステータス・プロジェクトでの絞り込み用）
CREATE INDEX idx_tickets_project ON redmine_tickets(project_id);
CREATE INDEX idx_tickets_status  ON redmine_tickets(status);
```

```python
# Aurora への保存（psycopg2）
import psycopg2

def upsert_ticket_metadata(conn, ticket: dict, s3_key: str):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO redmine_tickets
                (ticket_id, project_id, subject, status, priority,
                 assigned_to, category, s3_key, created_on, updated_on)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ticket_id) DO UPDATE SET
                subject    = EXCLUDED.subject,
                status     = EXCLUDED.status,
                s3_key     = EXCLUDED.s3_key,
                updated_on = EXCLUDED.updated_on,
                synced_at  = NOW()
        """, (
            ticket["id"],
            ticket["project"]["name"],
            ticket["subject"],
            ticket["status"]["name"],
            ticket["priority"]["name"],
            ticket.get("assigned_to", {}).get("name"),
            ticket.get("category", {}).get("name"),
            s3_key,
            ticket["created_on"],
            ticket["updated_on"]
        ))
    conn.commit()
```

---

### 4. Bedrock Knowledge Base を作成する

AWSコンソール（またはCDK）でKnowledge Baseを作成します。

**コンソール操作手順:**

1. Amazon Bedrock → **Knowledge bases** → 「Create knowledge base」
2. **Data source**: Amazon S3 → バケット名とプレフィックス（`redmine/`）を指定
3. **Chunking strategy**: Fixed-size chunking
   - Max tokens: **512**
   - Overlap percentage: **10%**（約50トークン）
4. **Embedding model**: `Amazon Titan Embeddings V2`
5. **Vector store**: OpenSearch Serverless（新規作成を選択）

```python
# CDKで定義する場合（Python）
knowledge_base = bedrock.CfnKnowledgeBase(
    self, "RedmineKB",
    name="redmine-rag-kb",
    role_arn=kb_role.role_arn,
    knowledge_base_configuration={
        "type": "VECTOR",
        "vectorKnowledgeBaseConfiguration": {
            "embeddingModelArn": (
                "arn:aws:bedrock:ap-northeast-1::foundation-model"
                "/amazon.titan-embed-text-v2:0"
            )
        }
    },
    storage_configuration={
        "type": "OPENSEARCH_SERVERLESS",
        "opensearchServerlessConfiguration": {
            "collectionArn": collection.attr_arn,
            "vectorIndexName": "redmine-index",
            "fieldMapping": {
                "vectorField": "bedrock-knowledge-base-default-vector",
                "textField": "AMAZON_BEDROCK_TEXT_CHUNK",
                "metadataField": "AMAZON_BEDROCK_METADATA"
            }
        }
    }
)
```

> **ポイント**: チャンクサイズ512トークンはRedmineのチケット説明（数百〜数千字）に対して適切なサイズです。1チケット=1ファイルで保存しているため、チャンクをまたいでも文脈が保たれます。

---

### 5. OpenSearch Serverless のインデックス構造を確認する

Knowledge Base 作成時に自動生成されるインデックスの構造です。

```json
{
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 512
    }
  },
  "mappings": {
    "properties": {
      "bedrock-knowledge-base-default-vector": {
        "type": "knn_vector",
        "dimension": 1024,
        "method": {
          "name": "hnsw",
          "engine": "faiss",
          "parameters": {
            "ef_construction": 512,
            "m": 16
          }
        }
      },
      "AMAZON_BEDROCK_TEXT_CHUNK": { "type": "text" },
      "AMAZON_BEDROCK_METADATA": { "type": "text", "index": false }
    }
  }
}
```

検索アルゴリズムはHNSW（Hierarchical Navigable Small World）を採用しており、大規模ベクトルに対して高速な近似最近傍探索を行います。

---

### 6. Top-k 検索 → LLM 回答生成を実装する

質問を受け取り、Knowledge BaseでTop-k件取得、Claudeに回答させます。

```python
# app/rag_handler.py
import boto3
import json
import os

bedrock_agent = boto3.client("bedrock-agent-runtime", region_name="ap-northeast-1")
bedrock_runtime = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]
MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0"

def retrieve_top_k(query: str, top_k: int = 5) -> list[dict]:
    """OpenSearch Serverless からTop-k件の関連チャンクを取得"""
    response = bedrock_agent.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={
            "vectorSearchConfiguration": {
                "numberOfResults": top_k,
                "overrideSearchType": "HYBRID"  # セマンティック + キーワードのハイブリッド検索
            }
        }
    )

    results = []
    for r in response["retrievalResults"]:
        results.append({
            "text": r["content"]["text"],
            "score": r["score"],
            "source": r.get("location", {}).get("s3Location", {}).get("uri", "")
        })
    return results

def generate_answer(query: str, contexts: list[dict]) -> str:
    """取得したコンテキストをもとにLLMで回答生成"""
    context_text = "\n\n---\n\n".join(
        f"【参考チケット (スコア: {c['score']:.3f})】\n{c['text']}"
        for c in contexts
    )

    prompt = f"""あなたはRedmineのチケット情報に基づいて質問に答えるアシスタントです。
以下の参考情報（Redmineチケット）をもとに、質問に正確かつ簡潔に回答してください。
参考情報に答えが見つからない場合は「チケット情報から確認できませんでした」と回答してください。

<context>
{context_text}
</context>

質問: {query}

回答:"""

    response = bedrock_runtime.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1500,
            "temperature": 0.1,
            "messages": [{"role": "user", "content": prompt}]
        })
    )

    result = json.loads(response["body"].read())
    return result["content"][0]["text"]

def rag_query(query: str, top_k: int = 5) -> dict:
    """RAGの全フロー: 検索 → コンテキスト構築 → 回答生成"""
    contexts = retrieve_top_k(query, top_k=top_k)
    answer = generate_answer(query, contexts)

    return {
        "query": query,
        "answer": answer,
        "sources": [c["source"] for c in contexts],
        "top_k_used": len(contexts)
    }
```

**使用例:**

```python
result = rag_query("ログイン画面で500エラーが出たとき、過去にどう対応しましたか？")
print(result["answer"])
# → "チケット#1234（2025-03-10）によると、nginxのタイムアウト設定が原因でした。
#    upstream_read_timeout を 60s から 120s に変更することで解決しています。"
```

---

### 7. 定期同期をEventBridge＋Lambdaで自動化する

```python
# EventBridge ルール（毎日 AM 3:00 JST に実行）
events.Rule(
    self, "RedmineSyncSchedule",
    schedule=events.Schedule.cron(hour="18", minute="0"),  # UTC 18:00 = JST 3:00
    targets=[targets.LambdaFunction(fetch_lambda)]
)
```

S3保存後にIngestion Jobを起動して Knowledge Base を最新化します。

```python
bedrock_agent_client = boto3.client("bedrock-agent", region_name="ap-northeast-1")

bedrock_agent_client.start_ingestion_job(
    knowledgeBaseId=KNOWLEDGE_BASE_ID,
    dataSourceId=DATA_SOURCE_ID
)
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| RAG | Retrieval-Augmented Generation。AIが回答する前に関連文書を検索してから答える仕組み。AIの「カンニングペーパー持ち込み試験」 |
| Embedding（ベクトル化） | テキストの意味を数値の配列（ベクトル）に変換すること。意味が近い文章は数値も近くなる |
| OpenSearch Serverless | AWSが提供するサーバーレス全文検索・ベクトル検索エンジン。サーバー管理不要 |
| Knowledge Base | Bedrockの機能。S3のファイルを自動でチャンク分割・ベクトル化してOpenSearchに格納してくれるマネージドサービス |
| Top-k | ベクトル検索で「最も近い上位k件」を返す設定。k=5なら最も関連性の高い5チャンクを取得 |
| チャンク分割 | 長い文書をAIが扱いやすい小さな塊に分割すること。分割単位（512トークン）が精度に影響する |
| HNSW | ベクトル検索アルゴリズム。大量のベクトルから高速に近似最近傍を探す手法 |
| Hybrid Search | セマンティック検索（意味の近さ）とキーワード検索を組み合わせた検索方式 |
| Ingestion Job | Knowledge Baseに「S3のデータを取り込んでベクトル化してください」と指示するジョブ |

---

## まとめ

RedmineのチケットをAWS RAGで活用する構成を、APIデータ取得からLLM回答生成まで一貫して解説しました。

- **S3（テキスト）＋ Aurora（メタデータ）** の2段保存で、RAG用途と構造化クエリの両方に対応
- **Bedrock Knowledge Base** がチャンク分割・Embedding・OpenSearch連携をマネージドで担い、実装コストを大幅削減
- **Top-k=5 ＋ Hybrid Search** の組み合わせで、キーワードマッチと意味検索の両面から精度を確保

次のステップとして、Auroraのメタデータ（ステータス・担当者・日付）でフィルタリングしてからベクトル検索する **メタデータフィルタリング** を追加すると、「今月クローズしたバグチケット」のような条件付き検索が可能になります。
