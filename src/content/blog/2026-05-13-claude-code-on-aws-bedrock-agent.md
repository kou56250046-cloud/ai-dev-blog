---
title: "Claude Code on AWS 完全セットアップガイド — Bedrock Agent連携とRAG応用まで"
date: 2026-05-13
category: blog
tags: [claude-code, aws, mcp-server, architecture, setup, rag]
summary: "Amazon Bedrock経由でClaude Codeを動かす設定手順から、Bedrock Agentsとしての活用、AWS Knowledge Base RAGへの応用まで体系的に解説。"
draft: false
---

## はじめに

Claude Codeはローカル環境で動かすだけでなく、**Amazon Bedrockを経由してAWSインフラと直接統合**することができます。

「AWS上にRAGを作ったはいいが、AIエージェントとして自律的に動かしたい」「Bedrock Agentsの設定が複雑でよくわからない」——そうした課題に対して、Claude Code on AWSは強力な解決策になります。

本記事ではClaude CodeをAWS上で動かすための設定手順から、Bedrock Agentsとしての応用、さらに既存RAGへの組み込みまで、実装レベルで解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ Amazon BedrockでClaude 3系モデルへのアクセスを有効化し、Claude Codeから利用できる
- ✅ Bedrock Agentsを構成してClaude Codeをエージェントとして動かせる
- ✅ 既存のBedrock Knowledge Base（RAG）にAgentとして接続し、自律的な検索・回答生成ができる

**学ぶ意義**: AWSインフラ上のデータソース（S3、DynamoDB、RDSなど）をClaude Codeが直接参照・操作できるようになり、インフラ管理・障害対応・知識検索を自動化できる。

---

## 時間がない人のための要約

1. **Bedrockモデルアクセス有効化** — AWSコンソールでClaude 3.5/3.7 Sonnetを有効化し、IAMロールに`bedrock:InvokeModel`権限を付与する
2. **Bedrock Agentsの構成** — Action GroupsでLambda関数を紐付け、Knowledge BaseをRAGソースとして接続する
3. **Claude Code側の設定** — `~/.claude/settings.json`に`ANTHROPIC_API_KEY`のかわりにBedrock設定を記述し、MCP経由でAWSリソースを操作させる

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Node.js | 20.x 以上 |
| AWS CLI | 2.x 以上（`aws configure`設定済み） |
| Claude Code | 最新版（`npm install -g @anthropic-ai/claude-code`） |
| AWSアカウント | Bedrockが利用可能なリージョン（us-east-1推奨） |
| IAMユーザー/ロール | Bedrock・Lambda・S3への適切な権限 |

---

## 手順

### 1. Amazon Bedrockでモデルアクセスを有効化する

BedrockはデフォルトではClaude等のモデルへのアクセスが無効になっています。

AWSコンソール → **Amazon Bedrock** → **モデルアクセス** → 「モデルアクセスを管理」をクリックし、以下を有効化します：

- `Anthropic / Claude 3.5 Sonnet`
- `Anthropic / Claude 3.7 Sonnet`（利用可能な場合）
- `Anthropic / Claude 3 Haiku`（軽量用途）

```bash
# CLIでモデルアクセス状況を確認
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query "modelSummaries[?contains(modelId,'anthropic')].{ID:modelId,Status:modelLifecycle.status}" \
  --output table
```

> **ポイント**: リージョンは`us-east-1`（バージニア北部）か`us-west-2`（オレゴン）を推奨。Claude 3.7以降は一部リージョンのみ提供。

---

### 2. IAMロール・ポリシーを設定する

Claude CodeがBedrockを呼び出すためのIAMポリシーを作成します。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:RetrieveAndGenerate",
        "bedrock:Retrieve"
      ],
      "Resource": "arn:aws:bedrock:us-east-1:*:knowledge-base/*"
    }
  ]
}
```

```bash
# ポリシー作成
aws iam create-policy \
  --policy-name ClaudeCodeBedrockPolicy \
  --policy-document file://bedrock-policy.json

# IAMユーザーにアタッチ
aws iam attach-user-policy \
  --user-name your-username \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/ClaudeCodeBedrockPolicy
```

---

### 3. Claude CodeをBedrockモードで設定する

Claude CodeはAnthropicのAPIだけでなく、Amazon Bedrockをバックエンドとして使用できます。

```bash
# 環境変数でBedrockを指定
export ANTHROPIC_API_KEY=""  # 空にする
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1

# Claude Codeを起動（Bedrockモード）
claude
```

または`~/.claude/settings.json`に永続設定：

```json
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "us-east-1"
  }
}
```

> **ポイント**: AWS認証情報は`aws configure`で設定済みのプロファイル、またはEC2/ECSのインスタンスロールが自動的に使用されます。

---

### 4. Bedrock Agentsを作成する

Bedrock AgentsはLambda関数（Action Groups）とKnowledge Baseを組み合わせ、自律的にタスクを遂行するAIエージェントです。

```bash
# Bedrock Agentsの実行ロールを作成
aws iam create-role \
  --role-name BedrockAgentRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "bedrock.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# エージェント作成
aws bedrock-agent create-agent \
  --agent-name "ClaudeCodeAgent" \
  --agent-resource-role-arn "arn:aws:iam::ACCOUNT_ID:role/BedrockAgentRole" \
  --foundation-model "anthropic.claude-3-5-sonnet-20241022-v2:0" \
  --instruction "あなたはAWSインフラの管理と問題解決を支援するAIエージェントです。提供されたツールとナレッジベースを活用して、正確で実用的な回答を提供してください。" \
  --region us-east-1
```

---

### 5. Action Groups（Lambda連携）を設定する

Action GroupsはエージェントがAWSリソースを操作するためのLambda関数を定義します。

```python
# Lambda関数例: DynamoDBからデータを取得するAction
import json
import boto3

def lambda_handler(event, context):
    action = event.get('actionGroup')
    function = event.get('function')
    parameters = event.get('parameters', [])
    
    if function == 'queryDatabase':
        query = next(p['value'] for p in parameters if p['name'] == 'query')
        
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table('KnowledgeItems')
        response = table.scan(
            FilterExpression='contains(content, :q)',
            ExpressionAttributeValues={':q': query}
        )
        
        return {
            'actionGroup': action,
            'function': function,
            'functionResponse': {
                'responseBody': {
                    'TEXT': {
                        'body': json.dumps(response['Items'], ensure_ascii=False)
                    }
                }
            }
        }
```

```bash
# Action GroupをエージェントにアタッチするOpenAPI定義
cat > action-group-schema.json << 'EOF'
{
  "openapi": "3.0.0",
  "info": {"title": "DB Query API", "version": "1.0.0"},
  "paths": {
    "/queryDatabase": {
      "post": {
        "operationId": "queryDatabase",
        "description": "データベースからキーワードで情報を検索する",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "properties": {
                  "query": {"type": "string", "description": "検索キーワード"}
                }
              }
            }
          }
        }
      }
    }
  }
}
EOF
```

---

### 6. Knowledge Base（RAG）をエージェントに接続する

既存のBedrock Knowledge Baseをエージェントのデータソースとして接続します。

```bash
# Knowledge Baseの一覧確認
aws bedrock-agent list-knowledge-bases --region us-east-1

# エージェントにKnowledge Baseを関連付け
aws bedrock-agent associate-agent-knowledge-base \
  --agent-id "YOUR_AGENT_ID" \
  --agent-version "DRAFT" \
  --knowledge-base-id "YOUR_KB_ID" \
  --description "社内ナレッジベース（トラブルシューティング・設計書）" \
  --knowledge-base-state ENABLED \
  --region us-east-1
```

Knowledge Baseの作成（S3 + OpenSearch Serverless構成）：

```bash
# S3バケット作成（ドキュメント格納用）
aws s3 mb s3://my-knowledge-base-docs --region us-east-1

# ドキュメントをアップロード
aws s3 cp ./docs/ s3://my-knowledge-base-docs/docs/ --recursive

# Knowledge Base作成（コンソールまたはCLI）
aws bedrock-agent create-knowledge-base \
  --name "InternalKnowledgeBase" \
  --role-arn "arn:aws:iam::ACCOUNT_ID:role/BedrockKBRole" \
  --knowledge-base-configuration '{
    "type": "VECTOR",
    "vectorKnowledgeBaseConfiguration": {
      "embeddingModelArn": "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1"
    }
  }' \
  --storage-configuration '{
    "type": "OPENSEARCH_SERVERLESS",
    "opensearchServerlessConfiguration": {
      "collectionArn": "arn:aws:aoss:us-east-1:ACCOUNT_ID:collection/COLLECTION_ID",
      "vectorIndexName": "bedrock-knowledge-base-index",
      "fieldMapping": {
        "vectorField": "embedding",
        "textField": "AMAZON_BEDROCK_TEXT_CHUNK",
        "metadataField": "AMAZON_BEDROCK_METADATA"
      }
    }
  }' \
  --region us-east-1
```

---

### 7. Claude Code MCPでBedrockエージェントを操作する

Claude CodeのMCPサーバーとしてAWS SDK連携を設定することで、自然言語でAWSリソースを操作できます。

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "aws-bedrock": {
      "command": "npx",
      "args": ["-y", "@aws-sdk/bedrock-agent-mcp"],
      "env": {
        "AWS_REGION": "us-east-1",
        "AWS_PROFILE": "default"
      }
    }
  }
}
```

Claude Code上でエージェントを呼び出す例：

```bash
# Claude Code起動後、自然言語でBedrockエージェントに指示
# 例: "Knowledge Baseから先月のAWSコスト最適化に関するドキュメントを検索して要約して"
```

---

## Claude Code on AWSでできること

### インフラ管理の自動化

| ユースケース | 内容 |
|---|---|
| コスト分析 | Cost Explorerのデータを取得し、コスト削減提案を自動生成 |
| ログ解析 | CloudWatch Logsを検索・分析してエラーパターンを特定 |
| リソース棚卸し | EC2・RDS・S3のリソース一覧とタグ付け状況を確認・修正 |
| セキュリティ監査 | Security Hubの検出結果を取得し、対応手順を自動作成 |

### RAGへのAgentとしての応用

既存のBedrock Knowledge Baseに対してエージェントとして接続することで：

- **マルチステップ検索**: 一度の質問で複数のKBをまたいで検索・統合回答
- **検索→実行の連鎖**: RAGで手順書を検索 → Action GroupsでLambdaを実行 → 結果を確認
- **動的な知識更新**: S3にドキュメントを追加 → 自動でEmbedding → 即座に検索対象に反映

```
ユーザーの質問
    ↓
Bedrock Agent（Claude 3.5 Sonnet）
    ↓           ↓
Knowledge Base  Action Groups
（RAG検索）     （Lambda実行）
    ↓           ↓
関連ドキュメント  AWS操作結果
    ↓           ↓
    └─────┬──────┘
          ↓
     統合回答の生成
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| Amazon Bedrock | AWSが提供するマネージドAIサービス。Claude・Titan・Llama等のモデルをAPI経由で使用できる |
| Bedrock Agents | 自律的にタスクを遂行するAIエージェントを作成・管理するBedrocksの機能 |
| Action Groups | エージェントが実行できる操作（Lambda関数）を定義する設定。OpenAPIスキーマで記述 |
| Knowledge Base | RAG用のベクトルデータベース。S3のドキュメントを自動でEmbeddingして検索可能にする |
| Bedrock Guardrails | エージェントの出力内容をフィルタリングし、安全性・コンプライアンスを担保する機能 |
| MCP（Model Context Protocol） | Claude CodeとAWSリソースを繋ぐ通信プロトコル。ツール呼び出しを標準化する |
| DRAFT / PREPARED | Bedrock Agentsのバージョン状態。`DRAFT`は開発中、`PREPARED`はデプロイ可能な状態 |
| OpenSearch Serverless | サーバーレスの全文検索・ベクトル検索エンジン。Knowledge Baseのストレージとして使用 |

---

## まとめ

Claude Code on AWSの構成を整理すると：

1. **Bedrockモデルアクセス有効化** → IAM権限設定 → Claude Codeのクレデンシャル設定
2. **Bedrock Agentsで「実行エンジン」を作成** → Action Groups（Lambda）でAWS操作、Knowledge Base（RAG）で知識検索を統合
3. **Claude Code MCPで自然言語からBedrockを操作** → ローカル開発環境とAWSクラウドをシームレスに繋ぐ

次のステップとして、Bedrock GuardrailsでPII（個人情報）フィルタリングを設定したり、複数Knowledge Baseをまたぐマルチエージェント構成（Bedrock Multi-Agent Collaboration）に発展させると、より実用的なシステムになります。

関連記事：[AWSで構築したRAGシステムの定量評価ガイド](/blog/2026-04-16-aws-rag-evaluation-best-practices)・[社内ナレッジを活用したAWSトラブルシューティング向けチャットサービス構築ガイド](/blog/2026-04-16-aws-internal-knowledge-chat-service)
