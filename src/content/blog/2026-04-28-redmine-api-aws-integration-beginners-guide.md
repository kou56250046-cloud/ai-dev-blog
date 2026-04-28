---
title: "Redmine完全入門 — チケット構造からAWS RAG連携まで初心者向け徹底解説"
date: 2026-04-28
category: blog
tags: [aws, rag, architecture, setup, tips]
summary: "Redmineを触ったことがない人向けに、チケット・コメント・添付ファイルの全データ構造とREST API設定、AWSへのデータ連携手順を初心者でも再現できるレベルで解説。"
draft: false
---

## はじめに

「Redmineのデータを使ってAIチャットボットを作りたいけど、Redmineって何？ APIってどう使うの？」

そんな疑問を持つ方のために、本記事ではRedmineの基礎知識からREST APIの設定方法、チケット・コメント・添付ファイルの全データ構造、そしてAWS（S3・Aurora・Bedrock Knowledge Base）へ連携する実装手順まで、一から丁寧に解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ Redmineのデータ構造（チケット・コメント・添付ファイル）を理解できる
- ✅ Redmine REST APIのアクセスキー発行と基本的なAPI呼び出しができる
- ✅ 取得したデータをAWSのS3・Auroraに保存し、RAGシステムへ連携できる

**学ぶ意義**: Redmineに蓄積された過去の対応記録をAIに学習させることで、同じ問題への対応時間を大幅に削減できる。

---

## 時間がない人のための要約

1. **Redmineはチケット管理ツール** — プロジェクトのタスク・バグ・要望を「チケット」として管理するWebアプリ。Githubのissueに近い概念
2. **REST APIでデータ取得** — 管理画面でAPIキーを発行し、`/issues.json` にHTTPリクエストするだけで全チケットをJSONで取得できる
3. **AWS連携は3ステップ** — ①Lambda でRedmine APIを叩く → ②S3にテキスト保存・Auroraにメタデータ保存 → ③Bedrock Knowledge Baseがベクトル化してOpenSearchに格納

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Redmine | 4.x 以上（またはクラウド版） |
| Pythonバージョン | 3.12 |
| AWSアカウント | Lambda・S3・Aurora・Bedrockへのアクセス権あり |
| Redmineへのアクセス | 管理者権限またはAPIキー発行権限があること |

---

## 第1章 — Redmineとは何か

### Redmineの概要

Redmineは**オープンソースのプロジェクト管理Webアプリケーション**です。開発チームや運用チームが日常的に使う「タスク管理」「バグ追跡」「進捗管理」を一元化するためのツールです。

Githubを使ったことがある方なら、「GitHubのIssue管理をより高機能にして、専用サーバーで動かせるようにしたもの」とイメージするとわかりやすいです。

```
【Redmineが解決する課題】
- 誰が何のタスクを担当しているか把握できない
- バグが報告されても対応状況が見えない
- 過去の対応内容をメールやチャットから探すのが大変
```

### Redmineの主要概念

Redmineは以下の構造で情報を管理します。

```
Redmine
├── プロジェクト（Project）       ← 例：「ECサイト開発」「サーバー運用」
│   ├── トラッカー（Tracker）     ← チケットの種類（バグ・機能・タスクなど）
│   ├── バージョン（Version）     ← リリース単位（v1.0・v2.0など）
│   ├── カテゴリ（Category）      ← チケットの分類（認証・UI・DBなど）
│   └── チケット（Issue）         ← 個別のタスク・バグ報告・依頼
│       ├── コメント（Journal）   ← チケットへの返信・更新履歴
│       ├── 添付ファイル          ← スクショ・ログ・設計書など
│       └── カスタムフィールド    ← 組織独自の項目（顧客名・チケットNoなど）
└── メンバー（Member）            ← プロジェクトに参加するユーザー
```

---

## 第2章 — チケット（Issue）の全データ構造

RAGシステムに取り込む上で最も重要な「チケット」のデータ構造を理解しましょう。

### チケットの基本フィールド一覧

| フィールド名 | 英語名 | 型 | 説明 |
|---|---|---|---|
| チケットID | id | integer | 自動採番される一意のID（例：#1234） |
| タイトル | subject | string | チケットのタイトル（必須） |
| 説明 | description | string | チケットの詳細内容（Markdownで書ける） |
| プロジェクト | project | object | 所属プロジェクト（id・name） |
| トラッカー | tracker | object | チケットの種類（バグ・機能・タスクなど） |
| ステータス | status | object | 現在の状態（新規・進行中・解決・クローズなど） |
| 優先度 | priority | object | 重要度（低・通常・高・急・即刻） |
| 担当者 | assigned_to | object | 対応担当者（id・name） |
| 作成者 | author | object | チケットを作成したユーザー |
| カテゴリ | category | object | チケットの分類（設定によって異なる） |
| バージョン | fixed_version | object | 対応予定のバージョン |
| 開始日 | start_date | date | タスクの開始予定日 |
| 期日 | due_date | date | 完了予定日 |
| 進捗率 | done_ratio | integer | 0〜100（%） |
| 予定工数 | estimated_hours | float | 見積もり時間（時間単位） |
| 実績工数 | spent_hours | float | 実際にかかった時間 |
| 作成日時 | created_on | datetime | チケット作成日時（UTC） |
| 更新日時 | updated_on | datetime | 最終更新日時（UTC） |
| 完了日時 | closed_on | datetime | クローズ日時（UTC） |
| 非公開 | is_private | boolean | 非公開チケットかどうか |

### チケットのJSON応答例

実際にAPIから返ってくるJSONの形状を確認します。

```json
{
  "issue": {
    "id": 1234,
    "project": { "id": 5, "name": "ECサイト開発" },
    "tracker": { "id": 1, "name": "バグ" },
    "status": { "id": 3, "name": "解決" },
    "priority": { "id": 2, "name": "通常" },
    "author": { "id": 10, "name": "田中 太郎" },
    "assigned_to": { "id": 15, "name": "山田 花子" },
    "category": { "id": 3, "name": "認証・ログイン" },
    "fixed_version": { "id": 2, "name": "v1.2.0" },
    "subject": "ログインページで500エラーが発生する",
    "description": "## 現象\n本番環境でログイン操作時に500エラーが発生する。\n\n## 再現手順\n1. トップページにアクセス\n2. メールアドレスとパスワードを入力\n3. ログインボタンをクリック\n\n## 期待する動作\nダッシュボードに遷移する\n\n## 実際の動作\nHTTP 500 Internal Server Errorが返る",
    "start_date": "2025-03-10",
    "due_date": "2025-03-12",
    "done_ratio": 100,
    "estimated_hours": 2.0,
    "spent_hours": 3.5,
    "created_on": "2025-03-10T09:00:00Z",
    "updated_on": "2025-03-11T14:30:00Z",
    "closed_on": "2025-03-11T14:30:00Z",
    "is_private": false,
    "custom_fields": [
      { "id": 1, "name": "顧客名", "value": "株式会社サンプル" },
      { "id": 2, "name": "障害レベル", "value": "重大" }
    ]
  }
}
```

---

## 第3章 — コメント（Journal）の構造

チケットの「コメント」はRedmineでは **Journal（ジャーナル）** と呼びます。コメントには2種類の情報が含まれます。

### Journalの2種類の記録

| 種類 | 説明 | 例 |
|---|---|---|
| notes（コメント本文） | ユーザーが入力したコメントテキスト | 「nginxのタイムアウト設定を変更しました」 |
| details（変更履歴） | フィールドの変更記録（自動記録） | ステータスを「進行中」→「解決」に変更 |

### JournalのJSON構造

```json
{
  "journals": [
    {
      "id": 501,
      "user": { "id": 10, "name": "田中 太郎" },
      "notes": "調査したところ、nginxのupstream_read_timeoutが原因でした。60sから120sに変更します。",
      "private_notes": false,
      "created_on": "2025-03-10T11:00:00Z",
      "details": []
    },
    {
      "id": 502,
      "user": { "id": 15, "name": "山田 花子" },
      "notes": "設定変更後、エラーが解消されたことを確認しました。チケットをクローズします。",
      "private_notes": false,
      "created_on": "2025-03-11T14:30:00Z",
      "details": [
        {
          "property": "attr",
          "name": "status_id",
          "old_value": "2",
          "new_value": "3"
        },
        {
          "property": "attr",
          "name": "done_ratio",
          "old_value": "50",
          "new_value": "100"
        }
      ]
    }
  ]
}
```

> **RAGへの活用ポイント**: `notes` フィールドが実際のコメント本文です。`details` は変更履歴（フィールド変更ログ）なので、RAGの文脈としては `notes` が空でないJournalを優先的に取り込むと精度が上がります。

---

## 第4章 — 添付ファイル（Attachment）の構造

### 添付ファイルのフィールド一覧

| フィールド名 | 説明 |
|---|---|
| id | 添付ファイルID |
| filename | ファイル名（例：error_log.txt） |
| filesize | ファイルサイズ（バイト） |
| content_type | MIMEタイプ（例：text/plain、image/png） |
| description | ファイルの説明文 |
| content_url | ダウンロードURL |
| author | アップロードしたユーザー |
| created_on | アップロード日時 |

### 添付ファイルの種類とRAGでの扱い方

| MIMEタイプ | 代表的なファイル | RAGでの取り扱い |
|---|---|---|
| `text/plain` | .txt、.log | そのままテキスト抽出してS3に保存可能 |
| `text/csv` | .csv | テーブルとして解析後テキスト化 |
| `application/pdf` | .pdf | Bedrock Knowledge BaseがPDF対応 |
| `application/msword` | .doc | テキスト変換が必要（docx推奨） |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | .docx | python-docxで変換 |
| `image/png` / `image/jpeg` | スクリーンショット | Bedrock Claude 3のマルチモーダルで解析可（別途対応） |
| `application/zip` | .zip | 展開して中身を個別処理 |

### 添付ファイルのJSON構造

```json
{
  "attachments": [
    {
      "id": 789,
      "filename": "error_log.txt",
      "filesize": 45231,
      "content_type": "text/plain",
      "description": "障害発生時のnginxエラーログ",
      "content_url": "https://redmine.example.com/attachments/download/789/error_log.txt",
      "author": { "id": 10, "name": "田中 太郎" },
      "created_on": "2025-03-10T09:15:00Z"
    }
  ]
}
```

---

## 第5章 — Redmine REST APIの設定方法

### ステップ1: REST APIを有効化する（管理者のみ）

Redmineの管理者アカウントで設定します。

```
1. Redmineにログイン
2. 画面右上の「管理」→「設定」をクリック
3. 「API」タブをクリック
4. 「RESTによるWebサービスを有効にする」にチェックを入れる
5. 「保存」ボタンをクリック
```

> **注意**: この設定は管理者権限がないとできません。社内のRedmineであれば管理者に依頼してください。

### ステップ2: APIアクセスキーを発行する

各ユーザーが自分のAPIキーを発行します。

```
1. Redmineにログイン
2. 画面右上のユーザー名をクリック
3. 「個人設定」をクリック
4. ページ右側に「APIアクセスキー」が表示される
5. 「表示」をクリックするとキーが表示される
6. 「リセット」で新しいキーを発行することも可能
```

発行されたキーは以下のような形式です：

```
b244397884889a29137643be79c83f1d470c1e2fac
```

> **セキュリティ注意**: このキーはパスワードと同等の機密情報です。コードに直接書かず、AWS Secrets ManagerやSystems Manager Parameter Storeで管理してください。

### ステップ3: APIキーを使って接続確認する

```bash
# curlでチケット一覧を取得（APIキー認証）
curl -H "X-Redmine-API-Key: あなたのAPIキー" \
     "https://redmine.example.com/issues.json?limit=5"

# または、URLパラメータでも指定可能（非推奨・ログに残る）
curl "https://redmine.example.com/issues.json?key=あなたのAPIキー&limit=5"
```

レスポンス例：

```json
{
  "issues": [...],
  "total_count": 1523,
  "offset": 0,
  "limit": 5
}
```

`total_count` に全チケット数が入っています。ページネーションで全件取得します。

---

## 第6章 — Pythonでデータを取得する実装

### python-redmineライブラリを使う方法（推奨）

context7でも確認したように、`python-redmine`（`redminelib`）を使うと簡潔に書けます。

```bash
pip install python-redmine
```

```python
from redminelib import Redmine

# 接続初期化
redmine = Redmine(
    'https://redmine.example.com',
    key='b244397884889a29137643be79c83f1d470c1e2fac'
)

# チケット1件を全情報込みで取得
issue = redmine.issue.get(
    1234,
    include=['journals', 'attachments', 'children', 'relations', 'watchers']
)

print(f"チケット#{issue.id}: {issue.subject}")
print(f"ステータス: {issue.status.name}")
print(f"担当者: {issue.assigned_to.name if hasattr(issue, 'assigned_to') else '未割り当て'}")
print(f"進捗: {issue.done_ratio}%")

# コメント（Journal）を表示
for journal in issue.journals:
    if journal.notes:
        print(f"  [{journal.created_on}] {journal.user.name}: {journal.notes}")

# 添付ファイルを表示
for attachment in issue.attachments:
    print(f"  添付: {attachment.filename} ({attachment.filesize} bytes)")
```

### 生のrequestsで実装する方法（Lambda向け）

Lambdaレイヤーを最小限にしたい場合は標準ライブラリ + requestsのみで実装できます。

```python
# lambda/fetch_redmine.py
import json
import os
import boto3
import requests
import psycopg2

REDMINE_URL = os.environ["REDMINE_URL"]
API_KEY = os.environ["REDMINE_API_KEY"]
BUCKET_NAME = os.environ["S3_BUCKET_NAME"]

s3 = boto3.client("s3")

HEADERS = {
    "X-Redmine-API-Key": API_KEY,
    "Content-Type": "application/json"
}


# ① 全チケットをページネーションで取得
def fetch_all_issues(project_id: str) -> list[dict]:
    all_issues = []
    offset = 0
    limit = 100

    while True:
        resp = requests.get(
            f"{REDMINE_URL}/issues.json",
            headers=HEADERS,
            params={
                "project_id": project_id,
                "status_id": "*",          # 全ステータス（クローズ含む）
                "include": "journals,attachments",  # コメント・添付を含める
                "limit": limit,
                "offset": offset,
                "sort": "updated_on:desc"  # 最終更新が新しい順
            },
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        issues = data.get("issues", [])
        all_issues.extend(issues)

        total = data.get("total_count", 0)
        offset += limit
        if offset >= total:
            break

    return all_issues


# ② 添付ファイルのテキストをダウンロード（text/plain のみ）
def fetch_text_attachment(content_url: str) -> str | None:
    resp = requests.get(content_url, headers=HEADERS, timeout=30)
    if resp.status_code == 200:
        return resp.text[:10000]  # 長すぎるログは先頭10,000文字のみ
    return None


# ③ チケット1件をテキスト化（Knowledge Base用）
def format_issue_as_text(issue: dict) -> str:
    # コメント本文のみ抽出（変更ログは除外）
    comments = []
    for j in issue.get("journals", []):
        if j.get("notes", "").strip():
            comments.append(
                f"[{j['created_on'][:10]} {j['user']['name']}]\n{j['notes'].strip()}"
            )

    # テキスト添付ファイルの内容を取得
    attachment_texts = []
    for a in issue.get("attachments", []):
        if a.get("content_type", "").startswith("text/"):
            text = fetch_text_attachment(a["content_url"])
            if text:
                attachment_texts.append(
                    f"【添付ファイル: {a['filename']}】\n{text}"
                )

    # RAGが理解しやすい構造化テキストに整形
    return f"""=== Redmineチケット #{issue['id']} ===
タイトル: {issue['subject']}
プロジェクト: {issue['project']['name']}
トラッカー: {issue['tracker']['name']}
ステータス: {issue['status']['name']}
優先度: {issue['priority']['name']}
担当者: {issue.get('assigned_to', {}).get('name', '未割り当て')}
カテゴリ: {issue.get('category', {}).get('name', 'なし')}
進捗率: {issue.get('done_ratio', 0)}%
作成日: {issue['created_on'][:10]}
更新日: {issue['updated_on'][:10]}

【説明】
{issue.get('description', '説明なし').strip()}

【コメント履歴（{len(comments)}件）】
{chr(10).join(comments) if comments else 'コメントなし'}

【添付ファイル（{len(issue.get('attachments', []))}件）】
{chr(10).join(a['filename'] for a in issue.get('attachments', []))}

{chr(10).join(attachment_texts)}
""".strip()


# ④ S3に保存
def save_to_s3(issue: dict, text: str, project_id: str) -> str:
    key = f"redmine/{project_id}/issue_{issue['id']}.txt"
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=text.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
        Metadata={
            "ticket-id": str(issue["id"]),
            "project": project_id,
            "status": issue["status"]["name"],
            "updated-on": issue["updated_on"][:10]
        }
    )
    return key


# ⑤ Lambdaハンドラ
def lambda_handler(event, context):
    project_id = event.get("project_id", "my-project")
    issues = fetch_all_issues(project_id)

    saved = 0
    for issue in issues:
        text = format_issue_as_text(issue)
        save_to_s3(issue, text, project_id)
        saved += 1

    return {
        "statusCode": 200,
        "body": json.dumps({"saved": saved, "project": project_id}, ensure_ascii=False)
    }
```

---

## 第7章 — AuroraにメタデータをUPSERTする

S3はRAG用テキスト、AuroraはSQL検索・管理用メタデータとして使い分けます。

```sql
-- テーブル定義
CREATE TABLE IF NOT EXISTS redmine_issues (
    issue_id       INTEGER      PRIMARY KEY,
    project_id     VARCHAR(100) NOT NULL,
    project_name   VARCHAR(200),
    tracker        VARCHAR(50),
    status         VARCHAR(50),
    priority       VARCHAR(50),
    subject        TEXT         NOT NULL,
    assigned_to    VARCHAR(100),
    category       VARCHAR(100),
    done_ratio     SMALLINT     DEFAULT 0,
    estimated_hours DECIMAL(6,2),
    attachment_count SMALLINT   DEFAULT 0,
    comment_count  SMALLINT     DEFAULT 0,
    s3_key         TEXT,
    created_on     TIMESTAMPTZ,
    updated_on     TIMESTAMPTZ,
    synced_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- 検索用インデックス
CREATE INDEX idx_issues_project  ON redmine_issues(project_id);
CREATE INDEX idx_issues_status   ON redmine_issues(status);
CREATE INDEX idx_issues_tracker  ON redmine_issues(tracker);
CREATE INDEX idx_issues_updated  ON redmine_issues(updated_on DESC);
```

```python
# Aurora へのUPSERT（Python）
def upsert_to_aurora(conn, issue: dict, s3_key: str):
    comments = [j for j in issue.get("journals", []) if j.get("notes", "").strip()]
    attachments = issue.get("attachments", [])

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO redmine_issues (
                issue_id, project_id, project_name, tracker, status, priority,
                subject, assigned_to, category, done_ratio, estimated_hours,
                attachment_count, comment_count, s3_key, created_on, updated_on
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (issue_id) DO UPDATE SET
                status           = EXCLUDED.status,
                assigned_to      = EXCLUDED.assigned_to,
                done_ratio       = EXCLUDED.done_ratio,
                comment_count    = EXCLUDED.comment_count,
                attachment_count = EXCLUDED.attachment_count,
                s3_key           = EXCLUDED.s3_key,
                updated_on       = EXCLUDED.updated_on,
                synced_at        = NOW()
        """, (
            issue["id"],
            issue["project"]["name"],
            issue["project"]["name"],
            issue["tracker"]["name"],
            issue["status"]["name"],
            issue["priority"]["name"],
            issue["subject"],
            issue.get("assigned_to", {}).get("name"),
            issue.get("category", {}).get("name"),
            issue.get("done_ratio", 0),
            issue.get("estimated_hours"),
            len(attachments),
            len(comments),
            s3_key,
            issue["created_on"],
            issue["updated_on"]
        ))
    conn.commit()
```

---

## 第8章 — Bedrock Knowledge BaseへのIngestion（自動取り込み）

S3に保存したテキストをBedrock Knowledge Baseに取り込みます。

```python
import boto3

bedrock_agent = boto3.client("bedrock-agent", region_name="ap-northeast-1")

KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]
DATA_SOURCE_ID = os.environ["DATA_SOURCE_ID"]

def start_ingestion():
    """S3の最新データをKnowledge Baseに取り込む"""
    response = bedrock_agent.start_ingestion_job(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        dataSourceId=DATA_SOURCE_ID,
        description=f"Redmine sync {__import__('datetime').date.today()}"
    )
    job_id = response["ingestionJob"]["ingestionJobId"]
    print(f"Ingestion Job開始: {job_id}")
    return job_id


def check_ingestion_status(job_id: str) -> str:
    """Ingestion Jobの完了を確認する"""
    response = bedrock_agent.get_ingestion_job(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        dataSourceId=DATA_SOURCE_ID,
        ingestionJobId=job_id
    )
    status = response["ingestionJob"]["status"]
    stats = response["ingestionJob"].get("statistics", {})

    print(f"ステータス: {status}")
    print(f"  スキャン済み: {stats.get('numberOfDocumentsScanned', 0)}")
    print(f"  追加済み: {stats.get('numberOfNewDocumentsIndexed', 0)}")
    print(f"  更新済み: {stats.get('numberOfModifiedDocumentsIndexed', 0)}")
    print(f"  削除済み: {stats.get('numberOfDocumentsDeleted', 0)}")
    return status
```

---

## 第9章 — 全体フローの自動化（EventBridge + Lambda）

毎日深夜にRedmineデータを同期する自動化フローです。

```
毎日 AM 3:00 (JST)
  │
  ↓ EventBridge Scheduler
Lambda: fetch-redmine
  ├─ Redmine API → 全チケット取得
  ├─ S3に .txt 保存
  └─ Aurora に UPSERT
       │
       ↓ Lambda完了後に連鎖起動
Lambda: start-ingestion
  └─ Bedrock Knowledge Base に Ingestion Job 投入
       │
       ↓ ベクトル化完了（約5〜15分）
OpenSearch Serverless
  └─ 最新のチケット情報が検索可能に
```

```python
# EventBridge Schedulerの設定（CDK Python）
import aws_cdk.aws_scheduler as scheduler
import aws_cdk.aws_scheduler_targets as targets

scheduler.CfnSchedule(
    self, "RedmineDailySync",
    schedule_expression="cron(0 18 * * ? *)",  # UTC 18:00 = JST 3:00
    schedule_expression_timezone="Asia/Tokyo",
    flexible_time_window={"mode": "OFF"},
    target=targets.LambdaInvoke(
        function=fetch_lambda,
        input=scheduler.ScheduleTargetInput.from_object({
            "project_id": "my-project"
        })
    )
)
```

---

## 用語解説

| 用語 | 意味 |
|---|---|
| Redmine | オープンソースのプロジェクト管理Webアプリ。タスク・バグ・要望をチケットで管理する |
| チケット（Issue） | Redmineで管理する個別のタスク・バグ・依頼のこと。GitHubのIssueに相当 |
| トラッカー（Tracker） | チケットの種類。「バグ」「機能」「タスク」「サポート」など組織ごとに設定 |
| ジャーナル（Journal） | チケットへのコメント＋変更履歴の記録。`notes`がコメント本文 |
| 添付ファイル（Attachment） | チケットに添付されたファイル。ログ・スクショ・設計書など |
| REST API | Webサービスのデータを外部から取得・操作するための標準的な仕組み |
| APIキー | APIを利用するための認証情報（パスワードのようなもの） |
| MIMEタイプ | ファイルの種類を表す識別子。`text/plain`（テキスト）、`image/png`（画像）など |
| UPSERT | INSERT + UPDATE の合成語。存在しなければ挿入、あれば更新する操作 |
| Ingestion Job | Bedrock Knowledge Baseに「S3のデータを読み込んでベクトル化して」と指示するジョブ |
| ページネーション | 大量データを分割して取得する仕組み。offsetとlimitで範囲を指定する |

---

## まとめ

Redmineを初めて触る方向けに、データ構造からAWS連携まで一通り解説しました。

- **チケットには20以上のフィールド**があり、コメント（Journal）・添付ファイル（Attachment）・カスタムフィールドを含めることでRAGの回答精度が上がる
- **REST APIはAPIキー認証**で手軽に使え、`include=journals,attachments` パラメータで関連データを一括取得できる
- **添付ファイルはMIMEタイプで分類**し、テキスト系はそのままS3保存、PDFはBedrock Knowledge Baseが直接対応、画像は別途マルチモーダル処理が必要

次のステップとして、Auroraのメタデータ（ステータス・担当者・トラッカー）でフィルタリングしてからベクトル検索する **メタデータフィルタリング** を追加すると、「担当者Aがクローズしたバグチケット」のような絞り込み検索が可能になります。
