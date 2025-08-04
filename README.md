# Gakufu-hub

> **モバイル初段実装：React Native + Expo + Amplify Gen 2 (Code‑First)**
>
> **Web 対応：React Native for Web** で同一コードをブラウザ向けビルド
>
> **バックエンド：Amplify Gen 2** (CDK ベース) に Auth / Storage / API / Function を定義

---

## 概要

楽譜 PDF／画像をクラウドに保存し、**バージョン管理・差分可視化・共有** をワンストップで提供

* **クラウドストレージ (S3) のバージョニング** を活用 → 版ごとの履歴追跡が自動
* **差分抽出 Lambda** が譜面画像を比較し、変更箇所をハイライト
* モバイル＆Web 共通コードベース (Expo) によりマルチデバイスで利用可能

