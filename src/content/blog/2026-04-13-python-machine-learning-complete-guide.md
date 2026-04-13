---
title: "Python機械学習 完全ガイド — 用途別モデルの意味と使い分け"
date: 2026-04-13
category: blog
tags: [python, machine-learning, scikit-learn, tips, architecture]
summary: "Pythonで機械学習を始めるエンジニア向けに、分類・回帰・クラスタリングなど用途別のモデルを徹底解説。scikit-learnのコード例付きで選び方まで網羅します。"
draft: false
---

## はじめに

「機械学習をやってみたい」と思いながら、モデルの種類が多すぎて何から手をつければいいかわからない——そんな経験はありませんか？

Pythonの機械学習ライブラリ **scikit-learn** には、数十種類のアルゴリズムが揃っています。しかし重要なのは「どのモデルが存在するか」ではなく、「**自分の問題に何を使うか**」を判断できる力です。

この記事では、用途別にモデルを分類し、それぞれの仕組み・強み・弱み・選び方を実用的なコード例とともに解説します。

---

## ゴール

この記事を読むと以下ができるようになります：

- ✅ 機械学習の問題タイプ（分類・回帰・クラスタリングなど）を見極められる
- ✅ 各問題タイプに対応したモデルを選択できる
- ✅ scikit-learn を使って実際にモデルを実装・評価できる

**学ぶ意義**: 適切なモデルを選ぶことで、精度・速度・解釈性のバランスを最大化し、無駄な試行錯誤を大幅に減らせます。

---

## 時間がない人のための要約

1. **問題タイプを先に決める** — 答えがラベルなら分類、数値なら回帰、グループ分けなら教師なし学習
2. **データ量とモデルの複雑さを合わせる** — 少ないデータに複雑モデルは過学習、大量データに単純モデルは表現不足
3. **まずはシンプルなモデルから試す** — ロジスティック回帰・決定木を基準にして、精度が足りなければアンサンブルへ移行

---

## 前提条件

| 項目 | バージョン / 条件 |
|---|---|
| Python | 3.10 以上 |
| scikit-learn | 1.4 以上 (`pip install scikit-learn`) |
| pandas | 2.x 以上 (`pip install pandas`) |
| numpy | 1.26 以上 (`pip install numpy`) |
| matplotlib | 3.8 以上（グラフ可視化用） |
| 前提知識 | 基本的なPython構文・変数・リスト操作 |

---

## 手順

### 1. 機械学習の問題タイプを把握する

機械学習を始める前に、まず「**解きたい問題がどのタイプか**」を見極めることが最重要です。

```
予測ラベルがある（教師あり学習）
├── ラベルがカテゴリ  → 分類（Classification）
└── ラベルが数値     → 回帰（Regression）

予測ラベルがない（教師なし学習）
├── データをグループに分けたい → クラスタリング（Clustering）
├── 特徴量を圧縮したい        → 次元削減（Dimensionality Reduction）
└── 異常なデータを見つけたい   → 異常検知（Anomaly Detection）
```

> **ポイント**: 問題タイプを間違えると、どんなモデルを使っても正しい結果が出ません。「ゴールは何か」を言語化してから手を動かしましょう。

---

### 2. 分類（Classification）— カテゴリを予測する

**使う場面の例**
- メールがスパムか否か → 2クラス分類
- 手書き数字（0〜9）を認識する → 多クラス分類
- 病気の有無を判定する → 2クラス分類

#### 主要モデル一覧

| モデル | 特徴 | 向いている場面 |
|---|---|---|
| ロジスティック回帰 | シンプル・高速・解釈しやすい | ベースライン、線形分離できるデータ |
| 決定木 | 人間が理解しやすいルール | ルールを可視化したい場合 |
| ランダムフォレスト | 高精度・過学習しにくい | 汎用的な最初の選択肢 |
| SVM（サポートベクターマシン） | 高次元データに強い | テキスト分類、画像分類 |
| k-NN | 学習不要・直感的 | 小〜中規模データ、プロトタイプ |
| XGBoost / LightGBM | 最高精度・Kaggle御用達 | 精度最優先の構造化データ |
| ニューラルネットワーク（MLP） | 複雑なパターンを学習 | 大量データ、非線形な関係性 |

#### コード例：ロジスティック回帰（分類のベースライン）

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.metrics import classification_report

# データ読み込み（乳がん診断データセット）
X, y = load_breast_cancer(return_X_y=True)

# 学習用・検証用に分割（8:2）
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# パイプライン：標準化 → ロジスティック回帰
model = make_pipeline(
    StandardScaler(),       # 特徴量の標準化（平均0・分散1）
    LogisticRegression()
)

# 学習
model.fit(X_train, y_train)

# 評価
y_pred = model.predict(X_test)
print(classification_report(y_test, y_pred, target_names=["悪性", "良性"]))
```

> **ポイント**: `make_pipeline` で前処理とモデルをセットにすることで、データ漏洩（data leakage）を防げます。必ずこのパターンを使いましょう。

#### コード例：ランダムフォレスト（汎用的な高精度モデル）

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# ランダムフォレスト（100本の決定木のアンサンブル）
rf = RandomForestClassifier(
    n_estimators=100,   # 決定木の本数
    max_depth=None,     # 木の深さ制限なし（過学習には注意）
    random_state=42
)
rf.fit(X_train, y_train)

print(f"精度: {accuracy_score(y_test, rf.predict(X_test)):.4f}")

# 特徴量の重要度を確認できる（解釈性）
import pandas as pd
feature_importance = pd.Series(
    rf.feature_importances_,
    index=load_iris().feature_names
).sort_values(ascending=False)
print(feature_importance)
```

---

### 3. 回帰（Regression）— 数値を予測する

**使う場面の例**
- 住宅の価格を予測する
- 株価の翌日終値を予測する
- 気温を予測する

#### 主要モデル一覧

| モデル | 特徴 | 向いている場面 |
|---|---|---|
| 線形回帰 | 最もシンプル・解釈しやすい | 線形関係が強いデータ |
| Ridge / Lasso | 線形回帰 + 正則化 | 特徴量が多い、過学習しやすい場合 |
| 決定木回帰 | 非線形関係に対応 | ルールベースで説明できる場合 |
| ランダムフォレスト回帰 | 高精度・汎化性能高い | 汎用的な最初の選択肢 |
| SVR | カーネルで非線形対応 | 高次元・少ないデータ |
| XGBoost 回帰 | 最高精度 | 精度最優先の構造化データ |

#### コード例：線形回帰 vs Ridge（正則化の効果）

```python
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.datasets import fetch_california_housing

# カリフォルニア住宅価格データセット
X, y = fetch_california_housing(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

models = {
    "線形回帰": LinearRegression(),
    "Ridge（L2正則化）": Ridge(alpha=1.0),
    "Lasso（L1正則化）": Lasso(alpha=0.1),
}

for name, model in models.items():
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    print(f"{name}: RMSE={rmse:.3f}, R²={r2:.3f}")
```

> **ポイント**: `Ridge` は全特徴量の係数を小さく保ちます（L2正則化）。`Lasso` は不要な特徴量の係数を**ゼロ**にする特徴選択効果があります（L1正則化）。

---

### 4. クラスタリング（Clustering）— 教師なしでグループ分け

**使う場面の例**
- 顧客を購買傾向でグループ分けしてマーケティングに活用する
- ニュース記事を話題ごとに自動分類する
- 似た特徴を持つ遺伝子をまとめる

#### 主要モデル一覧

| モデル | 特徴 | 向いている場面 |
|---|---|---|
| k-Means | 高速・スケーラブル | クラスタ数が事前にわかる場合 |
| DBSCAN | ノイズ耐性あり・形状自由 | 不規則な形状のクラスタ、外れ値除去 |
| 階層的クラスタリング | デンドログラムで可視化 | クラスタ数が不明で探索したい場合 |
| GMM（混合ガウスモデル） | 確率的・柔軟な形状 | ソフトアサインメントが必要な場合 |

#### コード例：k-Means クラスタリング

```python
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.datasets import make_blobs
import matplotlib.pyplot as plt

# 仮想の顧客データを生成（年齢・購入金額）
X, _ = make_blobs(n_samples=300, centers=4, random_state=42)

# 標準化してからクラスタリング（k-Meansはスケールに敏感）
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

kmeans = KMeans(n_clusters=4, random_state=42, n_init="auto")
labels = kmeans.fit_predict(X_scaled)

# 結果の可視化
plt.scatter(X[:, 0], X[:, 1], c=labels, cmap="viridis", alpha=0.7)
plt.scatter(
    kmeans.cluster_centers_[:, 0],
    kmeans.cluster_centers_[:, 1],
    c="red", marker="X", s=200, label="中心点"
)
plt.title("k-Means クラスタリング結果")
plt.legend()
plt.show()
```

> **ポイント**: k-Means は「クラスタ数 k を事前に指定する必要がある」制約があります。k が不明な場合は **エルボー法**（inertia の変化点）や **シルエットスコア** で最適な k を探しましょう。

---

### 5. 次元削減（Dimensionality Reduction）— データを圧縮・可視化する

**使う場面の例**
- 数百次元の特徴量を2〜3次元に圧縮してグラフ表示する
- ノイズの多い特徴量を整理してモデルの精度を上げる
- 特徴量エンジニアリングの一環

#### 主要モデル一覧

| モデル | 特徴 | 向いている場面 |
|---|---|---|
| PCA（主成分分析） | 線形・高速・情報量保持 | 前処理・可視化・ノイズ除去 |
| t-SNE | 非線形・局所構造保持 | 高次元データの2D/3D可視化 |
| UMAP | t-SNEより高速・大規模対応 | 大規模データの可視化 |

#### コード例：PCA で可視化

```python
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.datasets import load_digits
import matplotlib.pyplot as plt

# 手書き数字データ（64次元 → 2次元に圧縮）
X, y = load_digits(return_X_y=True)

X_scaled = StandardScaler().fit_transform(X)

# 2次元に圧縮
pca = PCA(n_components=2)
X_pca = pca.fit_transform(X_scaled)

# 寄与率（元の情報の何%が保持されているか）
print(f"寄与率: {pca.explained_variance_ratio_.sum():.1%}")

plt.figure(figsize=(10, 7))
scatter = plt.scatter(X_pca[:, 0], X_pca[:, 1], c=y, cmap="tab10", alpha=0.6, s=10)
plt.colorbar(scatter, label="数字ラベル")
plt.title("PCA による手書き数字データの2次元可視化")
plt.show()
```

---

### 6. 異常検知（Anomaly Detection）— 外れ値を検出する

**使う場面の例**
- ECサイトの不正取引を検知する
- 工場設備の異常振動をリアルタイム検出する
- サーバーログの不審なアクセスを発見する

#### コード例：Isolation Forest

```python
from sklearn.ensemble import IsolationForest
import numpy as np

# 正常データ + 外れ値を含むデータ生成
rng = np.random.RandomState(42)
X_normal = 0.3 * rng.randn(100, 2)
X_outliers = rng.uniform(low=-4, high=4, size=(20, 2))
X = np.vstack([X_normal, X_outliers])

# Isolation Forest（異常スコアが低いほど外れ値）
clf = IsolationForest(contamination=0.1, random_state=42)
predictions = clf.fit_predict(X)

# 1 = 正常, -1 = 異常
normal = X[predictions == 1]
anomaly = X[predictions == -1]
print(f"正常: {len(normal)}件, 異常: {len(anomaly)}件")
```

---

### 7. モデル評価と選び方の実践フロー

モデルを評価する指標はタスクによって異なります。

#### 分類の評価指標

| 指標 | 意味 | 使う場面 |
|---|---|---|
| Accuracy（正解率） | 全体の正解割合 | クラス均等なデータ |
| Precision（適合率） | 陽性予測のうち本当の陽性の割合 | 誤検知を減らしたい（スパム検知など） |
| Recall（再現率） | 本当の陽性のうち検出できた割合 | 見逃しを減らしたい（がん検診など） |
| F1スコア | Precision と Recall の調和平均 | クラス不均衡なデータ |
| AUC-ROC | 閾値に依存しない総合評価 | 確率スコアで評価したい場合 |

#### 回帰の評価指標

| 指標 | 意味 | 特徴 |
|---|---|---|
| MSE / RMSE | 誤差の二乗平均（平方根） | 外れ値に敏感 |
| MAE | 誤差の絶対値平均 | 外れ値に頑健 |
| R²（決定係数） | モデルがデータをどれだけ説明できるか（1が最良） | 相対的な性能比較 |

#### モデル選択フローチャート

```
データ量が < 1,000 件
├── 分類 → ロジスティック回帰 / SVM
└── 回帰 → Ridge / SVR

データ量が 1,000〜100,000 件
├── 分類 → ランダムフォレスト / XGBoost
└── 回帰 → ランダムフォレスト回帰 / XGBoost

データ量が > 100,000 件（大規模）
├── テキスト・画像 → ニューラルネットワーク（深層学習）
└── 構造化データ  → LightGBM / XGBoost
```

#### コード例：交差検証でモデルを公平に比較する

```python
from sklearn.model_selection import cross_val_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.datasets import load_breast_cancer

X, y = load_breast_cancer(return_X_y=True)

models = {
    "ロジスティック回帰": make_pipeline(StandardScaler(), LogisticRegression()),
    "ランダムフォレスト": RandomForestClassifier(n_estimators=100, random_state=42),
    "勾配ブースティング": GradientBoostingClassifier(n_estimators=100, random_state=42),
}

for name, model in models.items():
    scores = cross_val_score(model, X, y, cv=5, scoring="f1")
    print(f"{name}: F1 = {scores.mean():.4f} ± {scores.std():.4f}")
```

> **ポイント**: `cross_val_score` は5分割交差検証でモデルを評価します。1回のホールドアウトより信頼性が高く、実務でのモデル選択に必須のテクニックです。

---

## 用語解説

| 用語 | 意味 |
|---|---|
| 教師あり学習 | 正解ラベルがついた学習データを使ってモデルを訓練する手法 |
| 教師なし学習 | 正解ラベルなしに、データの構造やパターンを自動的に発見する手法 |
| 過学習（Overfitting） | 学習データに最適化しすぎて、未知データへの精度が低下する状態 |
| 正則化（Regularization） | 過学習を防ぐために、モデルの複雑さにペナルティを加える手法 |
| 交差検証（Cross Validation） | データを複数分割して学習・評価を繰り返し、モデルの汎化性能を測る手法 |
| アンサンブル学習 | 複数のモデルを組み合わせて予測精度を向上させる手法（ランダムフォレスト等） |
| パイプライン（Pipeline） | 前処理からモデル評価までの一連の処理をひとつの流れとして管理する仕組み |
| 特徴量（Feature） | モデルへの入力データ（説明変数）。「年齢」「購入金額」などの各列が特徴量 |
| ハイパーパラメータ | モデルの学習前に人間が設定するパラメータ（木の深さ・学習率など） |
| scikit-learn | Pythonの代表的な機械学習ライブラリ。分類・回帰・クラスタリングなどを統一APIで提供 |

---

## まとめ

Pythonの機械学習において重要なのは「とにかく高度なモデルを使う」ことではなく、**問題タイプに合ったモデルをシンプルに選択すること**です。

| タスク | まず試すモデル | 精度が足りなければ |
|---|---|---|
| 分類 | ロジスティック回帰 | ランダムフォレスト → XGBoost |
| 回帰 | 線形回帰 / Ridge | ランダムフォレスト回帰 → XGBoost |
| クラスタリング | k-Means | DBSCAN → GMM |
| 次元削減 | PCA | t-SNE / UMAP |
| 異常検知 | Isolation Forest | One-Class SVM |

次のステップとして、Kaggleの入門コンペ（Titanic・House Prices）で実データを使ったモデル選択を体験してみることをおすすめします。実際のデータは「汚く」「偏って」いますが、その試行錯誤こそが機械学習エンジニアの本当の学習です。
