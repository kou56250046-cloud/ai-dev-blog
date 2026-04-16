---
title: "AWSで構築したRAGシステムを定量評価する — RAGAS・LLM as a Judge・Bedrockネイティブ評価の実践ガイド"
date: 2026-04-16
category: blog
tags: [aws, architecture, tips, claude-code]
summary: "AWS Bedrock RAGシステムの品質を数値で測る方法を徹底解説。RAGAS評価フレームワーク・LLM as a Judge・Bedrockネイティブ評価ジョブの3手法とベストプラクティスを実装コード付きで紹介。"
draft: false
---

## はじめに

「RAGシステムを構築したが、回答品質が本当に良いのか感覚でしか判断できない」

これはRAGシステム開発で必ず直面する課題です。検索精度が上がった気がする、回答が改善した気がする——しかし**「気がする」では継続的な改善ができません**。

この記事では、AWSで構築したRAGシステムの品質を**数値で測る3つの評価手法**を実装コード付きで解説します。定量評価を導入することで、「何がどれだけ改善したか」を客観的に追跡し、データドリブンなシステム改善サイクルを回せるようになります。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ RAG評価の主要指標（Faithfulness・Answer Relevancy・Context Precision等）の意味と計算原理を理解できる
- ✅ RAGASライブラリを使ってAWS BedrockのRAGシステムを自動評価できる
- ✅ LLM as a Judge の仕組みを理解し、カスタム評価基準を実装できる
- ✅ AWS Bedrock ネイティブの評価ジョブを設定・実行できる
- ✅ 3手法の使い分けとCI/CDへの組み込みベストプラクティスを適用できる

**学ぶ意義**: 評価なき改善は改悪のリスクをはらむ。定量評価を自動化することで、RAGの品質を継続的・客観的に保証できる。

---

## 時間がない人のための要約

1. **RAGAS** — 検索精度・回答精度・忠実性を一括スコアリング。ゴールドデータセットが必要だが精度が高い
2. **LLM as a Judge** — 評価基準をプロンプトで定義してLLMに採点させる。カスタム基準に強く、参照回答なしでも動く
3. **Bedrock Evaluation Jobs** — AWSネイティブ。インフラ管理不要でBuiltin指標をワンコマンド実行。本番運用の定期監視に最適

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Python | 3.11 以上 |
| AWS CLI | v2.x（認証設定済み） |
| AWSリージョン | us-east-1（Bedrock利用可能） |
| Bedrock モデルアクセス | Claude 3 Sonnet / Haiku 有効化済み |
| 評価対象 | 前回記事で構築したRAGシステム（または同等のシステム） |

```bash
# 必要パッケージのインストール
pip install ragas boto3 langchain-aws pandas python-dotenv
```

---

## RAG評価の全体像：なぜ定量評価が必要か

RAGシステムの品質は**2つのコンポーネント**に分解できます。

```
[ユーザーの質問]
       ↓
  ┌────────────┐      評価軸①: 検索品質
  │  検索エンジン  │  ← Context Precision / Context Recall
  └────────────┘
       ↓ 関連ドキュメント
  ┌────────────┐      評価軸②: 生成品質
  │   LLM生成   │  ← Faithfulness / Answer Relevancy
  └────────────┘
       ↓
  [回答]               評価軸③: エンドツーエンド品質
                    ← Answer Correctness
```

検索が優秀でも生成が悪ければ意味がなく、逆も然りです。**両コンポーネントを独立して評価すること**が改善ポイントの特定につながります。

---

## RAG評価の主要指標

### 指標一覧と計算原理

| 指標名 | 評価対象 | スコア範囲 | 計算原理 |
|---|---|---|---|
| **Faithfulness** | 生成品質 | 0〜1 | 回答内の各クレームが検索結果に根拠を持つ割合 |
| **Answer Relevancy** | 生成品質 | 0〜1 | 回答から逆生成した質問と元の質問のコサイン類似度 |
| **Context Precision** | 検索品質 | 0〜1 | 上位K件の検索結果のうち関連ドキュメントが上位に来ている割合（順序考慮） |
| **Context Recall** | 検索品質 | 0〜1 | 正解回答の各文が検索結果にカバーされている割合 |
| **Answer Correctness** | E2E品質 | 0〜1 | 正解回答との意味的・事実的一致度（F1スコアベース） |

### 各指標の直感的な理解

**Faithfulness（忠実性）** — 「でっち上げていないか」を測る指標。スコアが低い場合、LLMが検索結果にない情報をハルシネーションしている。

**Answer Relevancy（回答関連性）** — 「質問に答えているか」を測る指標。スコアが低い場合、回答が質問と無関係な内容にそれている。

**Context Precision（コンテキスト精度）** — 「検索ゴミが少ないか」を測る指標。スコアが低い場合、無関係なドキュメントが上位に来ており、LLMの混乱を招いている。

**Context Recall（コンテキスト再現率）** — 「必要な情報を取りこぼしていないか」を測る指標。スコアが低い場合、正解に必要なドキュメントが検索から漏れている。

---

## 手法① RAGAS を使った評価

### RAGASとは

RAGASはRAGシステム評価に特化したOSSフレームワークです。上記の指標をLLMを使って自動計算し、スコアを0〜1で返します。

### 評価データセットの準備

RAGASには**ゴールドデータセット**（質問・正解・参照ドキュメント）が必要です。社内ナレッジを使ったトラブルシューティング向けに以下のような形式で用意します。

```python
# eval_dataset.py — 評価データセットの定義
from datasets import Dataset

# トラブルシューティング向け評価セット例
eval_data = {
    "question": [
        "EC2インスタンスがSSHで接続できない場合の確認手順は？",
        "RDSのスロークエリが多発しているときの対処法を教えて",
        "Lambda関数のタイムアウトエラーの原因と対策は？",
        "S3バケットへのアクセス拒否エラーの原因は何ですか？",
        "ECSタスクが起動してすぐに終了してしまう原因は？"
    ],
    "answer": [
        # RAGシステムが生成した実際の回答（評価対象）
        "EC2へのSSH接続確認手順：1. セキュリティグループのインバウンドルール（ポート22）を確認...",
        "RDSスロークエリ対処法：1. Performance Insightsで上位クエリを特定...",
        "Lambdaタイムアウト原因：コールドスタート・外部APIの応答待ち・処理ロジックの非効率...",
        "S3アクセス拒否の原因：バケットポリシー・IAMポリシー・ACL設定・ブロックパブリックアクセス...",
        "ECSタスク即時終了の原因：コンテナのエントリポイントエラー・メモリ不足・ヘルスチェック失敗..."
    ],
    "contexts": [
        # 検索エンジンが返した参照ドキュメント（リスト形式）
        ["EC2セキュリティグループ設定手順: ポート22をインバウンドルールに追加する...", "キーペア紛失時の対応手順..."],
        ["Performance Insightsの使い方: 上位SQLクエリの特定方法...", "RDSパラメータグループのmax_connections設定..."],
        ["Lambda設定のベストプラクティス: タイムアウト値の設定...", "Provisioned Concurrencyの設定方法..."],
        ["S3バケットポリシーの書き方: Principal・Action・Resourceの指定..."],
        ["ECSタスク定義: コンテナ定義のcommandとentrypointの違い...", "ECSタスクのCloudWatch Logsで原因調査..."]
    ],
    "ground_truth": [
        # 正解回答（人手でレビューした正しい回答）
        "SSHで接続できない場合はセキュリティグループ・ネットワークACL・キーペア・インスタンス状態の順に確認する",
        "スロークエリはPerformance Insightsで特定し、インデックス追加・クエリ最適化・接続プール設定で対処する",
        "タイムアウトの主因はコールドスタートと外部依存。Provisioned Concurrencyと非同期処理で解消する",
        "アクセス拒否はIAMポリシー→バケットポリシー→ACL→ブロックパブリックアクセスの順に調査する",
        "タスク即時終了はCloudWatch Logsのexitコードで原因を特定し、メモリ・CPU設定とコンテナログを確認する"
    ]
}

dataset = Dataset.from_dict(eval_data)
```

### Bedrock Claude を LLM として RAGAS に組み込む

```python
# ragas_bedrock_eval.py
import boto3
import json
import pandas as pd
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)
from ragas.llms import BaseRagasLLM
from ragas.embeddings import BaseRagasEmbeddings
from langchain_aws import ChatBedrock, BedrockEmbeddings

# ── Bedrock LLM ラッパー（RAGAS用） ──────────────────
def get_bedrock_llm():
    """Claude 3 Sonnet を RAGAS の LLM として使用"""
    return ChatBedrock(
        model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        region_name="us-east-1",
        model_kwargs={"max_tokens": 2048, "temperature": 0}
    )

def get_bedrock_embeddings():
    """Titan Embed V2 を RAGAS の Embeddings として使用"""
    return BedrockEmbeddings(
        model_id="amazon.titan-embed-text-v2:0",
        region_name="us-east-1"
    )

# ── 評価実行 ─────────────────────────────────────────
def run_ragas_evaluation(dataset: Dataset) -> pd.DataFrame:
    llm = get_bedrock_llm()
    embeddings = get_bedrock_embeddings()

    # 各メトリクスに Bedrock を設定
    metrics = [
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
        answer_correctness,
    ]
    for metric in metrics:
        metric.llm = llm
        if hasattr(metric, "embeddings"):
            metric.embeddings = embeddings

    result = evaluate(
        dataset=dataset,
        metrics=metrics,
    )

    scores_df = pd.DataFrame(result.scores)
    scores_df["question"] = dataset["question"]

    print("\n=== RAGAS 評価結果 ===")
    print(scores_df.to_string(index=False))
    print(f"\n--- 平均スコア ---")
    print(scores_df.drop("question", axis=1).mean().to_string())

    return scores_df

# ── メイン実行 ────────────────────────────────────────
if __name__ == "__main__":
    from eval_dataset import dataset
    results = run_ragas_evaluation(dataset)

    # S3に結果を保存（継続的監視用）
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket="rag-eval-results",
        Key=f"ragas/results-{pd.Timestamp.now().strftime('%Y%m%d-%H%M%S')}.json",
        Body=results.to_json(orient="records", force_ascii=False)
    )
```

### 評価結果の読み方

```
=== RAGAS 評価結果 ===
faithfulness  answer_relevancy  context_precision  context_recall  answer_correctness
       0.92              0.88               0.71            0.85                0.79
       0.78              0.91               0.88            0.92                0.83
       ...

--- 平均スコア ---
faithfulness          0.87  ← 高い。ハルシネーション少ない ✅
answer_relevancy      0.89  ← 高い。質問への回答精度良好 ✅
context_precision     0.74  ← 中程度。無関係な検索結果が混入 ⚠️
context_recall        0.88  ← 高い。必要情報の取りこぼし少ない ✅
answer_correctness    0.81  ← 良好。正解との一致度高い ✅
```

**Context Precision が低い場合の改善アクション**:
- 検索数 `numberOfResults` を削減（5→3）
- ベクトル検索の閾値（スコアフィルター）を上げる
- ハイブリッド検索のキーワード/ベクトルの重み調整

---

## 手法② LLM as a Judge

### LLM as a Judge とは

LLMに評価者（審判）を担わせる手法です。ゴールドデータセット（正解回答）なしでも、**評価基準をプロンプトで定義するだけ**でスコアリングできます。

社内ナレッジのトラブルシューティング特有の評価基準（「手順が具体的か」「リスクへの言及があるか」等）を柔軟に定義できる点が最大の強みです。

### 評価基準プロンプトの設計

```python
# llm_judge.py
import boto3
import json
from dataclasses import dataclass
from typing import Literal

@dataclass
class EvaluationResult:
    score: int          # 1〜5
    reasoning: str      # 採点理由
    dimension: str      # 評価軸名

JUDGE_PROMPTS = {
    # ① 技術的正確性
    "technical_accuracy": """
あなたはAWSインフラのシニアエンジニアです。
以下のトラブルシューティング回答の「技術的正確性」を評価してください。

【評価基準】
5点: 技術的に完全に正確。AWSの仕様・ベストプラクティスに完全準拠
4点: 技術的にほぼ正確。軽微な不正確さや曖昧さがある
3点: 概ね正確だが、重要な技術的誤りまたは重大な欠落がある
2点: 技術的に誤りが多く、現場で使用すると問題が起きる可能性がある
1点: 技術的に重大な誤りがあり、インシデントを悪化させる恐れがある

【質問】
{question}

【回答】
{answer}

【参照した社内ドキュメント】
{context}

以下のJSON形式で評価結果を返してください：
{{"score": <1-5の整数>, "reasoning": "<採点の根拠を日本語で2-3文>"}}
""",

    # ② 手順の再現性
    "reproducibility": """
あなたはAWSインフラのシニアエンジニアです。
以下のトラブルシューティング回答の「手順の再現性」を評価してください。

【評価基準】
5点: 手順が番号付きで明確。コマンドが具体的。誰でも再現できる
4点: 手順はほぼ明確だが、一部に曖昧さがある
3点: 方針は正しいが、具体的な手順の記述が不足している
2点: 方向性は示されているが、手順が抽象的すぎて実行困難
1点: 手順がなく、再現・実行できない

【質問】
{question}

【回答】
{answer}

以下のJSON形式で評価結果を返してください：
{{"score": <1-5の整数>, "reasoning": "<採点の根拠を日本語で2-3文>"}}
""",

    # ③ リスク配慮
    "risk_awareness": """
あなたはAWSセキュリティのシニアエンジニアです。
以下のトラブルシューティング回答の「リスク・副作用への配慮」を評価してください。

【評価基準】
5点: 実施前の確認事項・副作用・ロールバック手順まで言及している
4点: 主要なリスクへの言及がある
3点: リスクへの言及が一部あるが不十分
2点: リスクへの言及がほぼなく、本番環境での実施が危険
1点: リスク無視の回答で、本番適用すると重大障害につながる

【質問】
{question}

【回答】
{answer}

以下のJSON形式で評価結果を返してください：
{{"score": <1-5の整数>, "reasoning": "<採点の根拠を日本語で2-3文>"}}
"""
}
```

### LLM Judge の実装

```python
# llm_judge.py（続き）
class BedrockLLMJudge:
    def __init__(self, judge_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"):
        self.bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")
        self.judge_model_id = judge_model_id

    def evaluate(
        self,
        question: str,
        answer: str,
        context: str,
        dimension: Literal["technical_accuracy", "reproducibility", "risk_awareness"]
    ) -> EvaluationResult:
        prompt_template = JUDGE_PROMPTS[dimension]
        prompt = prompt_template.format(
            question=question,
            answer=answer,
            context=context
        )

        response = self.bedrock.invoke_model(
            modelId=self.judge_model_id,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 512,
                "temperature": 0,   # 評価の一貫性のため温度0推奨
                "messages": [{"role": "user", "content": prompt}]
            })
        )

        result_text = json.loads(response["body"].read())["content"][0]["text"]

        # JSONパース（LLMが返すJSON文字列を解析）
        parsed = json.loads(result_text.strip())
        return EvaluationResult(
            score=parsed["score"],
            reasoning=parsed["reasoning"],
            dimension=dimension
        )

    def evaluate_all_dimensions(
        self,
        question: str,
        answer: str,
        context: str
    ) -> dict:
        """全評価軸でスコアリングして集計"""
        results = {}
        for dimension in ["technical_accuracy", "reproducibility", "risk_awareness"]:
            result = self.evaluate(question, answer, context, dimension)
            results[dimension] = {
                "score": result.score,
                "reasoning": result.reasoning,
                "normalized": result.score / 5.0  # 0〜1に正規化
            }

        # 総合スコア（重み付き平均）
        weights = {
            "technical_accuracy": 0.5,   # 技術的正確性を最重視
            "reproducibility": 0.3,      # 再現性
            "risk_awareness": 0.2        # リスク配慮
        }
        overall = sum(
            results[d]["normalized"] * w for d, w in weights.items()
        )
        results["overall_score"] = round(overall, 3)

        return results


# ── 評価実行例 ─────────────────────────────────────────
if __name__ == "__main__":
    judge = BedrockLLMJudge()

    test_case = {
        "question": "EC2インスタンスにSSHで接続できません。どう対処すればいいですか？",
        "answer": """EC2へのSSH接続障害の対処手順：

### 1. セキュリティグループの確認
AWSコンソール → EC2 → セキュリティグループ → インバウンドルールで
ポート22（SSH）が許可されているか確認してください。

```bash
aws ec2 describe-security-groups \
  --group-ids sg-xxxxxxxx \
  --query 'SecurityGroups[].IpPermissions'
```

### 2. ネットワークACLの確認
サブネットのネットワークACLでポート22のインバウンド/アウトバウンドを確認。

### 3. インスタンス状態の確認
```bash
aws ec2 describe-instance-status --instance-ids i-xxxxxxxx
```
⚠️ 本番環境での作業前に必ずスナップショットを取得してください。""",
        "context": "セキュリティグループ設定手順：ポート22を0.0.0.0/0に開放する..."
    }

    results = judge.evaluate_all_dimensions(**test_case)
    print(json.dumps(results, ensure_ascii=False, indent=2))
```

### 出力例

```json
{
  "technical_accuracy": {
    "score": 5,
    "reasoning": "セキュリティグループ・ネットワークACL・インスタンス状態の確認順序が正確。CLIコマンドも具体的で正確。",
    "normalized": 1.0
  },
  "reproducibility": {
    "score": 5,
    "reasoning": "番号付き手順で具体的なCLIコマンドが示されており、誰でも再現できる構成になっている。",
    "normalized": 1.0
  },
  "risk_awareness": {
    "score": 4,
    "reasoning": "スナップショット取得の注意書きがある。ただし、セキュリティグループを0.0.0.0/0に開放するリスクへの言及が参照ドキュメントにあるが回答に反映されていない。",
    "normalized": 0.8
  },
  "overall_score": 0.96
}
```

---

## 手法③ AWS Bedrock ネイティブ評価ジョブ

### Bedrock Evaluation Jobs とは

AWS Bedrockが提供する**マネージド評価サービス**です。インフラ管理不要で、Bedrockの組み込み指標（Builtin Metrics）をコンソールまたはCLIから実行できます。

**Builtin指標一覧（RAG向け）**:

| 指標名 | 意味 |
|---|---|
| `Builtin.Faithfulness` | 回答が検索結果に基づいているか |
| `Builtin.Correctness` | 参照回答と事実的に一致しているか |
| `Builtin.Completeness` | 質問への回答が完全か |
| `Builtin.Helpfulness` | 回答が実用的で役立つか |
| `Builtin.ContextCoverage` | 検索結果が質問をカバーしているか |
| `Builtin.CitationPrecision` | 引用が正確か |

### 評価データセットの準備（JSONL形式）

```bash
# eval_input.jsonl を作成（1行1件）
cat > eval_input.jsonl << 'EOF'
{"prompt": "EC2インスタンスにSSHで接続できない場合の確認手順は？", "referenceResponse": "セキュリティグループ・ネットワークACL・キーペア・インスタンス状態の順に確認する"}
{"prompt": "RDSのスロークエリが多発しているときの対処法を教えて", "referenceResponse": "Performance Insightsで上位クエリを特定し、インデックス追加・クエリ最適化で対処する"}
{"prompt": "Lambda関数のタイムアウトエラーの原因と対策は？", "referenceResponse": "コールドスタートと外部依存が主因。Provisioned Concurrencyと非同期処理で解消する"}
EOF

# S3にアップロード
aws s3 cp eval_input.jsonl s3://rag-eval-datasets/input/eval_input.jsonl
```

### Bedrock Evaluation Job の実行

```bash
# eval_job.json — 評価ジョブ設定ファイル
cat > eval_job.json << 'EOF'
{
    "jobName": "rag-troubleshoot-eval-20260416",
    "roleArn": "arn:aws:iam::ACCOUNT_ID:role/BedrockEvalRole",
    "applicationType": "RagEvaluation",
    "evaluationConfig": {
        "automated": {
            "datasetMetricConfigs": [
                {
                    "taskType": "General",
                    "dataset": {
                        "name": "troubleshoot_eval_dataset",
                        "datasetLocation": {
                            "s3Uri": "s3://rag-eval-datasets/input/eval_input.jsonl"
                        }
                    },
                    "metricNames": [
                        "Builtin.Faithfulness",
                        "Builtin.Correctness",
                        "Builtin.Completeness",
                        "Builtin.Helpfulness",
                        "Builtin.ContextCoverage",
                        "Builtin.CitationPrecision"
                    ]
                }
            ],
            "evaluatorModelConfig": {
                "bedrockEvaluatorModels": [
                    {
                        "modelIdentifier": "anthropic.claude-3-haiku-20240307-v1:0"
                    }
                ]
            }
        }
    },
    "inferenceConfig": {
        "ragConfigs": [
            {
                "knowledgeBaseConfig": {
                    "retrieveAndGenerateConfig": {
                        "type": "KNOWLEDGE_BASE",
                        "knowledgeBaseConfiguration": {
                            "knowledgeBaseId": "YOUR_KB_ID",
                            "modelArn": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
                        }
                    }
                }
            }
        ]
    },
    "outputDataConfig": {
        "s3Uri": "s3://rag-eval-datasets/output/"
    }
}
EOF

# 評価ジョブ実行
aws bedrock create-evaluation-job --cli-input-json file://eval_job.json

# ジョブ状態確認
aws bedrock get-evaluation-job \
  --job-identifier "arn:aws:bedrock:us-east-1:ACCOUNT_ID:evaluation-job/JOB_ID" \
  --query "status"
```

### カスタム指標の追加（LLM as a Judge をネイティブに実装）

Bedrock Evaluation Jobs はカスタム指標も定義できます。独自の評価プロンプトをJSONで設定できます。

```json
{
    "customMetricConfig": {
        "customMetrics": [
            {
                "customMetricDefinition": {
                    "name": "CustomMetric-RiskAwareness",
                    "instructions": "あなたはAWSセキュリティ専門家です。以下の{{prompt}}に対する{{response}}を評価してください。実施時のリスクや副作用への言及がある場合は高評価とします。",
                    "ratingScale": [
                        {"definition": "リスクへの言及なし", "value": {"floatValue": 0}},
                        {"definition": "部分的なリスク言及", "value": {"floatValue": 0.5}},
                        {"definition": "十分なリスク・注意事項の記述あり", "value": {"floatValue": 1}}
                    ]
                }
            }
        ],
        "evaluatorModelConfig": {
            "bedrockEvaluatorModels": [
                {"modelIdentifier": "anthropic.claude-3-haiku-20240307-v1:0"}
            ]
        }
    }
}
```

---

## 3手法のベストプラクティス比較

### 手法の使い分けガイド

| 評価フェーズ | 推奨手法 | 理由 |
|---|---|---|
| **開発中のイテレーション** | RAGAS | 自動化・再現性が高く、変更前後の比較が容易 |
| **業務品質の保証** | LLM as a Judge | 社内固有の評価基準（リスク配慮・手順の具体性等）を反映できる |
| **本番の定期監視** | Bedrock Evaluation Jobs | インフラ不要・スケジュール実行・AWSコンソールで可視化 |

### CI/CD パイプラインへの組み込み

```yaml
# .github/workflows/rag-evaluation.yml
name: RAG品質評価（自動）

on:
  push:
    branches: [main]
    paths:
      - 'src/rag/**'        # RAGシステムのコード変更時
      - 'knowledge-base/**' # 社内ドキュメント更新時

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Python セットアップ
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: 依存関係インストール
        run: pip install ragas boto3 langchain-aws pandas

      - name: RAGAS 評価実行
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: python scripts/run_ragas_eval.py

      - name: 品質ゲートチェック
        run: |
          python scripts/quality_gate.py \
            --faithfulness-threshold 0.80 \
            --context-precision-threshold 0.70 \
            --fail-on-regression
```

```python
# scripts/quality_gate.py — 品質基準を下回ったらCI失敗
import json, sys, argparse

def check_quality_gate(results_path: str, thresholds: dict) -> bool:
    with open(results_path) as f:
        results = json.load(f)

    failed = []
    for metric, threshold in thresholds.items():
        score = results.get(metric, 0)
        if score < threshold:
            failed.append(f"{metric}: {score:.3f} < {threshold} ❌")
        else:
            print(f"{metric}: {score:.3f} >= {threshold} ✅")

    if failed:
        print("\n品質基準を満たしていない指標があります:")
        for f in failed:
            print(f" - {f}")
        return False
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--faithfulness-threshold", type=float, default=0.80)
    parser.add_argument("--context-precision-threshold", type=float, default=0.70)
    parser.add_argument("--fail-on-regression", action="store_true")
    args = parser.parse_args()

    passed = check_quality_gate(
        "eval_results/latest.json",
        {
            "faithfulness": args.faithfulness_threshold,
            "context_precision": args.context_precision_threshold,
        }
    )
    sys.exit(0 if passed else 1)
```

### CloudWatch でスコアを継続的に可視化

```python
# metrics_publisher.py — 評価スコアをCloudWatchカスタムメトリクスに送信
import boto3

cloudwatch = boto3.client("cloudwatch", region_name="us-east-1")

def publish_rag_metrics(scores: dict, namespace: str = "RAG/Quality"):
    metric_data = [
        {
            "MetricName": metric_name.replace("_", "-").title(),
            "Value": score,
            "Unit": "None",
            "Dimensions": [
                {"Name": "Environment", "Value": "Production"},
                {"Name": "KnowledgeBase", "Value": "company-troubleshoot"}
            ]
        }
        for metric_name, score in scores.items()
        if isinstance(score, float)
    ]

    cloudwatch.put_metric_data(
        Namespace=namespace,
        MetricData=metric_data
    )
    print(f"CloudWatch に {len(metric_data)} 件のメトリクスを送信しました")
```

---

## 評価スコア改善のロードマップ

| スコア低下の指標 | 原因の仮説 | 改善アクション |
|---|---|---|
| Faithfulness 低下 | LLMが検索外情報を使っている | プロンプトに「検索結果のみ使用」を強調 |
| Context Precision 低下 | 不要なドキュメントが検索上位に来ている | Top-K削減・スコアフィルター強化 |
| Context Recall 低下 | 必要ドキュメントが検索から漏れている | チャンクサイズ見直し・ハイブリッド検索導入 |
| Answer Relevancy 低下 | 回答が質問とずれている | システムプロンプトの改善・クエリ書き換え追加 |
| LLM Judge スコア低下 | 社内ドキュメントの内容が古くなっている | ドキュメント更新・Knowledge Base再同期 |

---

## まとめ

本記事では、AWS Bedrock RAGシステムの定量評価を3つの手法で解説しました。

- **RAGAS**: 検索・生成それぞれの精度を0〜1のスコアで自動計算。開発イテレーションの高速化に貢献
- **LLM as a Judge**: 社内固有の評価基準（技術的正確性・手順の再現性・リスク配慮）をプロンプトで定義してBedrockが採点。参照回答なしでも動作
- **Bedrock Evaluation Jobs**: AWSネイティブのマネージド評価。スケジュール実行でCloudWatchと連携した本番監視に最適

**最終的なベストプラクティス**は「3手法の組み合わせ」です。開発中はRAGASで高速イテレーション、リリース前はLLM as a Judgeで業務品質を確認、本番ではBedrock Evaluation Jobsで継続監視する三層構造が、最も信頼性の高いRAG品質保証体制を作ります。

**関連記事**: 前回の「社内knowledgeを活用したAWSトラブルシューティング向けチャットサービス構築ガイド」も合わせて読むと、構築から評価までの全体像が把握できます。
