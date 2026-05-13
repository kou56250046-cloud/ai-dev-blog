---
title: "Claude Code on AWSでBootstrapバージョンアップを全自動化する — EC2×VPN×Knowledge Base設計ガイド"
date: 2026-05-13
category: blog
tags: [claude-code, aws, architecture, setup, rag, tips]
summary: "EC2プライベートネットワーク上のソースコードを、S3保存のリリースノートをKnowledge Baseに取り込んだBedrock AgentとClaude Codeが自動解析・修正・PR作成まで行う全自動Bootstrap更新システムの設計と実装手順。"
draft: false
---

## はじめに

OSSのバージョンアップ対応は地味で時間がかかる作業です。Bootstrapを例にとると、v4→v5のようなメジャーバージョンアップでは**クラス名変更・コンポーネント廃止・JavaScript API刷新**が大量に発生し、手動での差分確認と修正は数日〜数週間かかることもあります。

本記事では、以下の構成で Bootstrap（OSSライブラリ）のバージョンアップ対応を**Claude Code on AWSでほぼ全自動化する**方法を解説します。

- **EC2（プライベートネットワーク）** にソースコードを配置し、社内VPN経由で管理
- **S3** にBootstrapの公式リリースノートを自動収集して保存
- **Bedrock Knowledge Base** でリリースノートをベクトル化・差分更新
- **Bedrock Agent + Claude Code** がリリースノートを参照しながらコードを自律修正

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ 社内VPN接続のプライベートEC2上にClaude Code on AWS環境を構築できる
- ✅ BootstrapのリリースノートをS3に自動収集し、Knowledge Baseで差分更新できる
- ✅ Bedrock AgentがKnowledge Baseを参照してEC2上のソースコードを自動修正・PR作成まで実行できる

**学ぶ意義**: OSSバージョンアップ対応をAIが代替することで、エンジニアはロジック設計・テスト・レビューに集中でき、リリース速度が大幅に向上する。

---

## 時間がない人のための要約

1. **EC2 + VPN構成** — プライベートサブネットのEC2にClaude Codeを導入。社内VPN（Client VPN or Site-to-Site VPN）経由でSSHアクセス・コード管理
2. **リリースノート自動収集** — EventBridge SchedulerでLambdaを定期起動、GitHubリリースページを取得してS3に保存 → Bedrock Knowledge Baseが差分Embeddingを自動実行
3. **全自動修正フロー** — Bedrock AgentがKBでBootstrapの変更点を検索 → Action GroupsでEC2のClaude Codeを起動 → コード修正 → Git commit → PR作成まで無人実行

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| AWS CLI | 2.x 以上（設定済み） |
| Node.js（EC2上） | 20.x 以上 |
| Claude Code（EC2上） | 最新版 |
| Bootstrapバージョン | v4.x → v5.x（例） |
| AWSリージョン | us-east-1（Bedrock利用可能） |
| 社内VPN | AWS Client VPN または Site-to-Site VPN |
| IAM権限 | Bedrock・S3・Lambda・EC2・Systems Manager |

---

## システム全体アーキテクチャ

```
【社内ネットワーク】
  開発者PC ─[SSL/TLS VPN]─→
                              ┌─────────────────────────────────────────────┐
                              │ AWS VPC (10.0.0.0/16)                       │
                              │                                             │
                              │  ┌─── プライベートサブネット ───────────┐   │
                              │  │                                      │   │
                              │  │  EC2 (t3.medium)                     │   │
                              │  │  ├── ソースコード (Git管理)           │   │
                              │  │  ├── Claude Code (Bedrockモード)      │   │
                              │  │  └── Node.js / pnpm                   │   │
                              │  │                                      │   │
                              │  └──────────────────────────────────────┘   │
                              │           ↑ SSM Session Manager             │
                              │           ↓ VPC Endpoint経由                │
                              │  ┌─── AWSサービス ──────────────────────┐   │
                              │  │                                      │   │
                              │  │  Amazon S3                           │   │
                              │  │  └─ bootstrap-releases/              │   │
                              │  │      ├─ v5.3.0-release-notes.md      │   │
                              │  │      └─ v5.3.1-release-notes.md      │   │
                              │  │            ↓ 差分Sync（自動）          │   │
                              │  │  Bedrock Knowledge Base              │   │
                              │  │  └─ OpenSearch Serverless            │   │
                              │  │       （ベクトル検索インデックス）     │   │
                              │  │            ↓ 参照                    │   │
                              │  │  Bedrock Agent                       │   │
                              │  │  ├─ Action Group: CodeFixer          │   │
                              │  │  │   └─ Lambda → EC2 SSM実行          │   │
                              │  │  └─ Action Group: GitOperator        │   │
                              │  │      └─ Lambda → EC2 git commit/PR   │   │
                              │  │                                      │   │
                              │  │  EventBridge Scheduler               │   │
                              │  │  └─ 毎週月曜0:00 → Lambda起動         │   │
                              │  │      └─ GitHubからリリースノート取得    │   │
                              │  │          → S3保存                    │   │
                              │  │                                      │   │
                              │  └──────────────────────────────────────┘   │
                              └─────────────────────────────────────────────┘
```

---

## 手順

### 1. VPC・プライベートネットワーク・VPN設定

まずEC2をプライベートサブネットに配置し、社内からVPN経由でアクセスできる環境を作ります。

```bash
# VPCの作成
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=bootstrap-automation-vpc}]'

# プライベートサブネット作成
aws ec2 create-subnet \
  --vpc-id vpc-XXXXXXXX \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=private-subnet-1a}]'

# NAT Gateway用パブリックサブネット作成（外部通信のため）
aws ec2 create-subnet \
  --vpc-id vpc-XXXXXXXX \
  --cidr-block 10.0.0.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-subnet-1a}]'
```

AWS Client VPNの設定（ACM証明書が必要）：

```bash
# クライアントVPNエンドポイント作成
aws ec2 create-client-vpn-endpoint \
  --client-cidr-block 172.16.0.0/22 \
  --server-certificate-arn arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/SERVER_CERT_ID \
  --authentication-options Type=certificate-authentication,MutualAuthentication={ClientRootCertificateChainArn=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CLIENT_CERT_ID} \
  --connection-log-options Enabled=false \
  --vpc-id vpc-XXXXXXXX \
  --description "Bootstrap Automation VPN"

# VPNをプライベートサブネットに関連付け
aws ec2 associate-client-vpn-target-network \
  --client-vpn-endpoint-id cvpn-endpoint-XXXXXXXX \
  --subnet-id subnet-XXXXXXXX
```

> **ポイント**: EC2はインターネットに直接さらさず、SSMエンドポイント・Bedrockエンドポイント経由でのみAWSサービスと通信します。パブリックIPは不要です。

---

### 2. VPCエンドポイントの設定（プライベート通信の確保）

EC2からBedrockやS3にインターネット経由なしでアクセスするためのVPCエンドポイントを設定します。

```bash
# S3 Gatewayエンドポイント
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-XXXXXXXX \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-XXXXXXXX

# Bedrock Interface エンドポイント
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-XXXXXXXX \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-1.bedrock-runtime \
  --subnet-ids subnet-XXXXXXXX \
  --security-group-ids sg-XXXXXXXX \
  --private-dns-enabled

# SSM エンドポイント（SSH不要のセキュアな接続）
for SERVICE in ssm ssmmessages ec2messages; do
  aws ec2 create-vpc-endpoint \
    --vpc-id vpc-XXXXXXXX \
    --vpc-endpoint-type Interface \
    --service-name com.amazonaws.us-east-1.$SERVICE \
    --subnet-ids subnet-XXXXXXXX \
    --security-group-ids sg-XXXXXXXX \
    --private-dns-enabled
done
```

---

### 3. EC2のセットアップ（Claude Code + Git環境）

```bash
# EC2起動（SSMロール付き・パブリックIP不要）
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t3.medium \
  --subnet-id subnet-XXXXXXXX \
  --iam-instance-profile Name=EC2-SSM-Bedrock-Profile \
  --no-associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=bootstrap-automation-ec2}]' \
  --user-data '#!/bin/bash
# Claude Code環境セットアップ
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git
npm install -g @anthropic-ai/claude-code

# Git設定
git config --global user.name "Claude Code Bot"
git config --global user.email "claude-code-bot@example.com"

# プロジェクトのクローン
mkdir -p /workspace
cd /workspace
# git clone YOUR_REPO_URL project
'
```

SSMでEC2に接続：

```bash
# SSH不要・VPN経由でSSMセッションを開始
aws ssm start-session \
  --target i-XXXXXXXXXXXXXXXXX \
  --region us-east-1
```

EC2上でClaude Codeをbedrockモードで設定：

```bash
# EC2内での設定
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1

# 動作確認
claude --version
claude -p "Hello, Bedrockモードで動作していますか？" --no-interactive
```

---

### 4. S3バケット作成とリリースノート自動収集Lambda

BootstrapのGitHubリリースページを定期的にチェックしてS3に保存するLambdaを作成します。

```bash
# S3バケット作成
aws s3 mb s3://bootstrap-release-notes-ACCOUNT_ID \
  --region us-east-1

# バケットポリシー設定（Bedrock KB用）
cat > bucket-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "bedrock.amazonaws.com"
    },
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::bootstrap-release-notes-ACCOUNT_ID",
      "arn:aws:s3:::bootstrap-release-notes-ACCOUNT_ID/*"
    ]
  }]
}
EOF
aws s3api put-bucket-policy \
  --bucket bootstrap-release-notes-ACCOUNT_ID \
  --policy file://bucket-policy.json
```

リリースノート収集Lambda（Python）：

```python
# lambda_release_collector.py
import json
import boto3
import urllib.request
from datetime import datetime

s3 = boto3.client('s3')
BUCKET = 'bootstrap-release-notes-ACCOUNT_ID'
GITHUB_API = 'https://api.github.com/repos/twbs/bootstrap/releases'

def lambda_handler(event, context):
    # GitHubから最新リリース一覧を取得
    req = urllib.request.Request(
        GITHUB_API,
        headers={
            'User-Agent': 'BootstrapWatcher/1.0',
            'Accept': 'application/vnd.github.v3+json'
        }
    )
    with urllib.request.urlopen(req) as res:
        releases = json.loads(res.read().decode())

    saved = []
    for release in releases[:10]:  # 最新10件をチェック
        tag = release['tag_name']
        key = f'releases/{tag}-release-notes.md'

        # 既存チェック（差分のみ保存）
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
            continue  # 既に保存済みならスキップ
        except s3.exceptions.ClientError:
            pass  # 新規なので保存

        # Markdown形式でリリースノートを整形して保存
        content = f"""# Bootstrap {tag} リリースノート

公開日: {release['published_at'][:10]}
URL: {release['html_url']}

## 変更内容

{release.get('body', '変更内容なし')}

---
tags: bootstrap, {tag}, release-notes
"""
        s3.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=content.encode('utf-8'),
            ContentType='text/markdown',
            Metadata={
                'version': tag,
                'published_at': release['published_at']
            }
        )
        saved.append(tag)
        print(f"保存完了: {tag}")

    return {'saved_versions': saved, 'count': len(saved)}
```

```bash
# Lambda関数をデプロイ
zip release_collector.zip lambda_release_collector.py
aws lambda create-function \
  --function-name bootstrap-release-collector \
  --runtime python3.12 \
  --handler lambda_release_collector.lambda_handler \
  --role arn:aws:iam::ACCOUNT_ID:role/LambdaS3Role \
  --zip-file fileb://release_collector.zip \
  --timeout 60

# EventBridge Schedulerで毎週月曜AM0:00に自動実行
aws scheduler create-schedule \
  --name bootstrap-release-check-weekly \
  --schedule-expression "cron(0 0 ? * MON *)" \
  --target '{
    "Arn": "arn:aws:lambda:us-east-1:ACCOUNT_ID:function:bootstrap-release-collector",
    "RoleArn": "arn:aws:iam::ACCOUNT_ID:role/SchedulerRole"
  }' \
  --flexible-time-window '{"Mode": "OFF"}'
```

---

### 5. Bedrock Knowledge Baseの作成と差分更新設定

S3のリリースノートをベクトル化して検索可能にします。

```bash
# Knowledge Base作成
aws bedrock-agent create-knowledge-base \
  --name "BootstrapReleaseNotesKB" \
  --description "Bootstrapの全バージョンリリースノートを格納したナレッジベース" \
  --role-arn "arn:aws:iam::ACCOUNT_ID:role/BedrockKBRole" \
  --knowledge-base-configuration '{
    "type": "VECTOR",
    "vectorKnowledgeBaseConfiguration": {
      "embeddingModelArn": "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"
    }
  }' \
  --storage-configuration '{
    "type": "OPENSEARCH_SERVERLESS",
    "opensearchServerlessConfiguration": {
      "collectionArn": "arn:aws:aoss:us-east-1:ACCOUNT_ID:collection/COLLECTION_ID",
      "vectorIndexName": "bootstrap-release-notes-index",
      "fieldMapping": {
        "vectorField": "embedding",
        "textField": "AMAZON_BEDROCK_TEXT_CHUNK",
        "metadataField": "AMAZON_BEDROCK_METADATA"
      }
    }
  }' \
  --region us-east-1

# S3データソースを登録
aws bedrock-agent create-data-source \
  --knowledge-base-id KB_ID \
  --name "bootstrap-s3-source" \
  --data-source-configuration '{
    "type": "S3",
    "s3Configuration": {
      "bucketArn": "arn:aws:s3:::bootstrap-release-notes-ACCOUNT_ID",
      "inclusionPrefixes": ["releases/"]
    }
  }' \
  --vector-ingestion-configuration '{
    "chunkingConfiguration": {
      "chunkingStrategy": "SEMANTIC",
      "semanticChunkingConfiguration": {
        "maxTokens": 300,
        "bufferSize": 1,
        "breakpointPercentileThreshold": 95
      }
    }
  }'
```

S3に新しいリリースノートが追加されたら自動で差分Embeddingを実行するLambda：

```python
# lambda_kb_sync.py — S3 PutObjectをトリガーに差分Ingest実行
import boto3

bedrock_agent = boto3.client('bedrock-agent', region_name='us-east-1')

def lambda_handler(event, context):
    kb_id = 'YOUR_KB_ID'
    ds_id = 'YOUR_DATASOURCE_ID'

    response = bedrock_agent.start_ingestion_job(
        knowledgeBaseId=kb_id,
        dataSourceId=ds_id,
        description=f"S3トリガー差分更新: {event['Records'][0]['s3']['object']['key']}"
    )
    
    job_id = response['ingestionJob']['ingestionJobId']
    print(f"差分Ingestion開始: {job_id}")
    return {'jobId': job_id}
```

```bash
# S3イベント通知を設定（新規ファイルアップロード時に自動Ingest）
aws s3api put-bucket-notification-configuration \
  --bucket bootstrap-release-notes-ACCOUNT_ID \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:us-east-1:ACCOUNT_ID:function:bootstrap-kb-sync",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {"FilterRules": [{"Name": "prefix", "Value": "releases/"}]}
      }
    }]
  }'
```

---

### 6. Bedrock AgentのAction Groups設定（コード修正エンジン）

エージェントがEC2上のClaude Codeを操作するAction Groupsを定義します。

```python
# lambda_code_fixer.py — メインの自動修正エンジン
import boto3
import json

ssm = boto3.client('ssm', region_name='us-east-1')
EC2_INSTANCE_ID = 'i-XXXXXXXXXXXXXXXXX'

def run_on_ec2(command: str) -> dict:
    """EC2上でコマンドを実行（SSM Run Command）"""
    response = ssm.send_command(
        InstanceIds=[EC2_INSTANCE_ID],
        DocumentName='AWS-RunShellScript',
        Parameters={'commands': [command]},
        TimeoutSeconds=600
    )
    command_id = response['Command']['CommandId']
    
    import time
    for _ in range(60):
        result = ssm.get_command_invocation(
            CommandId=command_id,
            InstanceId=EC2_INSTANCE_ID
        )
        if result['Status'] in ('Success', 'Failed', 'TimedOut'):
            return result
        time.sleep(5)
    return {'Status': 'Timeout', 'StandardOutputContent': '', 'StandardErrorContent': 'タイムアウト'}

def lambda_handler(event, context):
    function_name = event.get('function')
    parameters = {p['name']: p['value'] for p in event.get('parameters', [])}

    if function_name == 'analyzeAndFixBootstrap':
        target_version = parameters.get('targetVersion', 'v5')
        project_path = parameters.get('projectPath', '/workspace/project')

        # Step1: 現在のBootstrapバージョン確認
        version_check = run_on_ec2(
            f"cd {project_path} && cat package.json | grep bootstrap"
        )
        
        # Step2: Claude CodeにKB参照しながら修正を指示
        claude_prompt = f"""
以下のタスクを実行してください：

1. {project_path}/package.json のbootstrapをバージョン{target_version}に更新
2. Knowledge Baseで「bootstrap {target_version} 破壊的変更 クラス名 移行」を検索
3. 検索結果に基づいてsrc/以下のHTMLファイルとJSファイルを修正:
   - 廃止されたクラス名を新クラス名に置換
   - 削除されたコンポーネントを代替実装に置換
   - JavaScript APIの変更に対応
4. 変更内容のサマリーをCHANGELOG-bootstrap-{target_version}.mdに記録
5. git add -A && git commit -m "chore: Bootstrap {target_version}へバージョンアップ (自動修正)"

実行してよいですか？（yと入力してください）
"""
        fix_result = run_on_ec2(
            f'cd {project_path} && echo "y" | CLAUDE_CODE_USE_BEDROCK=1 AWS_REGION=us-east-1 '
            f'claude -p "{claude_prompt}" --allowedTools "Bash,Read,Edit,Write,Grep,Glob"'
        )

        return {
            'actionGroup': event['actionGroup'],
            'function': function_name,
            'functionResponse': {
                'responseBody': {
                    'TEXT': {
                        'body': json.dumps({
                            'status': fix_result['Status'],
                            'output': fix_result['StandardOutputContent'][:2000],
                            'version_before': version_check['StandardOutputContent'].strip()
                        }, ensure_ascii=False)
                    }
                }
            }
        }

    elif function_name == 'createPullRequest':
        project_path = parameters.get('projectPath', '/workspace/project')
        branch_name = parameters.get('branchName', 'feat/bootstrap-versionup')
        
        pr_result = run_on_ec2(
            f'cd {project_path} && git checkout -b {branch_name} && git push origin {branch_name} && '
            f'gh pr create --title "chore: Bootstrap バージョンアップ（自動）" '
            f'--body "$(cat CHANGELOG-bootstrap-*.md)" --base main'
        )
        
        return {
            'actionGroup': event['actionGroup'],
            'function': function_name,
            'functionResponse': {
                'responseBody': {
                    'TEXT': {'body': pr_result['StandardOutputContent']}
                }
            }
        }
```

OpenAPI定義（Action Groupのスキーマ）：

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Bootstrap Code Fixer API",
    "version": "1.0.0"
  },
  "paths": {
    "/analyzeAndFixBootstrap": {
      "post": {
        "operationId": "analyzeAndFixBootstrap",
        "summary": "リリースノートを参照してBootstrapのバージョンアップ修正を実行",
        "description": "Knowledge Baseからリリースノートを取得し、EC2上のソースコードを自動修正する",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "targetVersion": {
                    "type": "string",
                    "description": "アップグレード先のBootstrapバージョン（例: v5.3.0）"
                  },
                  "projectPath": {
                    "type": "string",
                    "description": "EC2上のプロジェクトパス（例: /workspace/myapp）"
                  }
                },
                "required": ["targetVersion", "projectPath"]
              }
            }
          }
        }
      }
    },
    "/createPullRequest": {
      "post": {
        "operationId": "createPullRequest",
        "summary": "修正完了後にGit PRを作成する",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "projectPath": {"type": "string"},
                  "branchName": {"type": "string"}
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

### 7. Bedrock Agentの作成と設定

```bash
# エージェント作成
aws bedrock-agent create-agent \
  --agent-name "BootstrapVersionUpAgent" \
  --agent-resource-role-arn "arn:aws:iam::ACCOUNT_ID:role/BedrockAgentRole" \
  --foundation-model "anthropic.claude-3-5-sonnet-20241022-v2:0" \
  --instruction "あなたはBootstrapのOSSバージョンアップを専門とするAIエージェントです。
Knowledge Baseに格納されたBootstrapの公式リリースノートを参照し、
EC2上のソースコードに必要な変更を自律的に特定・修正します。

実行フロー:
1. まずKnowledge Baseで対象バージョンの変更内容を検索する
2. analyzeAndFixBootstrap関数でコード修正を実行する
3. 変更内容をユーザーに報告する
4. ユーザーの承認後、createPullRequest関数でPRを作成する

修正方針:
- 破壊的変更（クラス名変更・コンポーネント廃止・JS API変更）を優先的に対応
- 変更箇所は必ず変更前→変更後をCHANGELOGに記録
- テストが壊れないよう保守的な修正を心がける" \
  --region us-east-1

# Knowledge Baseを関連付け
aws bedrock-agent associate-agent-knowledge-base \
  --agent-id "AGENT_ID" \
  --agent-version "DRAFT" \
  --knowledge-base-id "KB_ID" \
  --description "Bootstrapリリースノート（全バージョン）" \
  --knowledge-base-state ENABLED

# Action Groupを登録
aws bedrock-agent create-agent-action-group \
  --agent-id "AGENT_ID" \
  --agent-version "DRAFT" \
  --action-group-name "CodeFixerActions" \
  --action-group-executor '{
    "lambda": "arn:aws:lambda:us-east-1:ACCOUNT_ID:function:bootstrap-code-fixer"
  }' \
  --api-schema '{
    "s3": {
      "s3BucketName": "bootstrap-release-notes-ACCOUNT_ID",
      "s3ObjectKey": "schema/code-fixer-api.json"
    }
  }' \
  --action-group-state ENABLED

# エージェントをデプロイ（DRAFT → PREPARED）
aws bedrock-agent prepare-agent --agent-id "AGENT_ID"
aws bedrock-agent create-agent-alias \
  --agent-id "AGENT_ID" \
  --agent-alias-name "production" \
  --routing-configuration '[{"agentVersion": "1"}]'
```

---

### 8. 全自動化フロー：Step FunctionsでE2Eオーケストレーション

新バージョン検出から修正・PR作成まで全自動で実行するStep Functionsを定義します。

```json
{
  "Comment": "Bootstrap自動バージョンアップ全自動フロー",
  "StartAt": "CollectReleaseNotes",
  "States": {
    "CollectReleaseNotes": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "bootstrap-release-collector",
        "Payload": {}
      },
      "Next": "CheckNewVersionExists",
      "ResultPath": "$.collectorResult"
    },
    "CheckNewVersionExists": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.collectorResult.Payload.count",
        "NumericGreaterThan": 0,
        "Next": "SyncKnowledgeBase"
      }],
      "Default": "NoNewVersion"
    },
    "SyncKnowledgeBase": {
      "Type": "Task",
      "Resource": "arn:aws:states:::bedrock:startIngestionJob.sync",
      "Parameters": {
        "KnowledgeBaseId": "KB_ID",
        "DataSourceId": "DS_ID"
      },
      "Next": "InvokeBedrockAgent"
    },
    "InvokeBedrockAgent": {
      "Type": "Task",
      "Resource": "arn:aws:states:::bedrock-agent-runtime:invokeAgent.waitForTaskToken",
      "Parameters": {
        "AgentId": "AGENT_ID",
        "AgentAliasId": "ALIAS_ID",
        "InputText.$": "States.Format('Bootstrapの最新バージョン{}へのアップグレードを実行してください。プロジェクトパス: /workspace/project', $.collectorResult.Payload.saved_versions[0])",
        "SessionId.$": "$$.Execution.Name"
      },
      "Next": "NotifySlack",
      "TimeoutSeconds": 3600
    },
    "NotifySlack": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "slack-notifier",
        "Payload": {
          "message": "Bootstrap自動バージョンアップが完了しました。PRを確認してください。",
          "channel": "#dev-releases"
        }
      },
      "End": true
    },
    "NoNewVersion": {
      "Type": "Succeed"
    }
  }
}
```

---

### 9. 動作確認と手動トリガー

設定完了後、まず手動でエンドツーエンドのテストを実行します。

```bash
# Step Functionsを手動実行（テスト）
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:us-east-1:ACCOUNT_ID:stateMachine:BootstrapVersionUpFlow" \
  --input '{"manual_trigger": true}' \
  --region us-east-1

# Bedrock Agentを直接テスト
aws bedrock-agent-runtime invoke-agent \
  --agent-id "AGENT_ID" \
  --agent-alias-id "ALIAS_ID" \
  --session-id "test-session-001" \
  --input-text "Bootstrap v5.3.0のリリースノートを確認して、破壊的変更をリストアップしてください" \
  --region us-east-1
```

---

## 実行フロー全体のまとめ

```
① 毎週月曜 EventBridge起動
       ↓
② Lambda: GitHub APIからBootstrap最新リリースノート取得
       ↓（新バージョンあり）
③ S3に保存（releases/v5.x.x-release-notes.md）
       ↓（S3イベント通知）
④ Lambda: Bedrock Knowledge Base差分Ingest実行
       ↓（Embedding完了）
⑤ Step Functions: Bedrock Agentを起動
       ↓
⑥ Bedrock Agent: KBで変更内容を検索
       "Bootstrap v5.3.0 破壊的変更" → 該当チャンク取得
       ↓
⑦ Action Group(Lambda): EC2のClaude Codeを起動
       ↓
⑧ Claude Code on EC2: ソースコードを解析・修正
       - src/**/*.html のクラス名置換
       - src/**/*.js のAPI変更対応
       - package.json のバージョン更新
       ↓
⑨ Action Group(Lambda): git commit + PRを作成
       ↓
⑩ Slack通知: "PR #42 が作成されました。レビューをお願いします"
       ↓
⑪ エンジニア: PRをレビューして承認・マージ
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| AWS Client VPN | AWSが提供するマネージドVPNサービス。社内PCからAWS VPCにSSL/TLS接続するために使用 |
| VPCエンドポイント | インターネットを経由せずにAWSサービスにプライベートアクセスするための仮想ゲートウェイ |
| SSM Session Manager | SSH不要でEC2インスタンスにブラウザ・CLIから接続できるAWS Systems Managerの機能 |
| Bedrock Knowledge Base | S3のドキュメントを自動でベクトル化し、Agentが参照できるRAGストアを提供するBedrockの機能 |
| セマンティックチャンキング | ドキュメントを意味的に自然な区切りで分割する手法。リリースノートのような構造文書に有効 |
| Action Groups | Bedrock Agentが実行できる操作（Lambda関数）をOpenAPIスキーマで定義した単位 |
| Step Functions | AWSのサーバーレスワークフローサービス。Lambda・Bedrock等の処理を順序付けてオーケストレーションする |
| 差分Ingest | Knowledge Baseに新しいドキュメントが追加された時だけEmbeddingを実行する更新方式 |
| SSM Run Command | SSMを経由してEC2上でシェルコマンドをリモート実行する機能。CI/CDへの組み込みに活用 |

---

## まとめ

本記事で構築したシステムにより、Bootstrapのバージョンアップ対応は以下のように変わります：

| 項目 | 手動対応 | 本システム |
|---|---|---|
| リリースノート確認 | 30分〜1時間 | 自動収集・KB格納（0分） |
| 破壊的変更の特定 | 1〜2時間 | Agentが自動検索（数分） |
| コード修正 | 1〜3日 | Claude Codeが自動実行（30〜60分） |
| PR作成 | 30分 | 自動生成（0分） |
| **合計** | **2〜4日** | **エンジニア作業: レビューのみ** |

次のステップとして、Bedrock Guardrailsでコードの安全性チェックを追加したり、テスト自動実行（`pnpm test`の結果をAgentが判断してリトライ）の組み込みでさらに品質を高めることができます。

関連記事：[Claude Code on AWS 完全セットアップガイド](/blog/2026-05-13-claude-code-on-aws-bedrock-agent)・[AWSで構築したRAGシステムの定量評価ガイド](/blog/2026-04-16-aws-rag-evaluation-best-practices)
