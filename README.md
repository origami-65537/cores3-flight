# 空路 / SKYLINE — CoreS3 Flight

M5Stack CoreS3 を傾けて、PC の空を飛ぶ小さな 3D フライトゲーム。デバイスなしでもキーボードだけで全機能を遊べます。前進は自動。光るリングをくぐると +100 点、地面・岩柱への衝突でフライト終了です。追従カメラで自由に探索できます。

## ブラウザで遊ぶ

公開先（このブランチを main にマージ後、Pages の初回デプロイ完了時に有効）:
**https://origami-65537.github.io/cores3-flight/**

ローカル実行には Node.js 20 LTS が必要です。

```sh
cd web
npm ci
npm run dev
# 表示された http://localhost:5173 を開く
```

| キー | 操作 |
| --- | --- |
| W / ↑、S / ↓ | 上昇、下降 |
| A / ←、D / → | 左右バンク（傾けると旋回） |
| Q、E | スロットルを下げる、上げる |
| Shift / Space | 押している間ブースト |
| R | リセット（スコア・時間も初期化） |
| C | CoreS3 のセンター合わせ |

画面下のボタンでもリセット・センター合わせができます。最初のリングはほぼ正面。高度を保ち、少しずつ旋回して挑戦してください。

## CoreS3 の準備と接続

```sh
python3 -m pip install platformio==6.2.0
cd firmware
pio run
pio run -t upload
```

USB データケーブルで CoreS3 を接続します。書き込みポートが見つからない場合は本体のリセットボタンを長押ししてダウンロードモードへ移行し再実行してください。必要なら `pio run -t upload --upload-port /dev/ttyACM0` のように指定します。Linux ではシリアルポートへのアクセス権（dialout グループ等）も確認してください。

1. シリアルモニターを閉じてから、PC の **Chrome / Edge** でゲームを開きます。Web Serial は HTTPS（Pages）または localhost が必要です。Firefox / Safari はキーボードモードで遊べます。
2. HUD の「CoreS3を接続」を押し、USB シリアルポートを選択します（115200 baud）。
3. 本体を自然な姿勢で持って「センター合わせ」。前後の傾きで上昇・下降、左右の傾きでバンクします。最大操作角は約 30°、小さな動きを無視するデッドゾーンと平滑化付きです。
4. 本体画面の **下部左（BOOST）** を押すとブースト、**下部右（CENTER）** を押すとセンター合わせ。基準姿勢・持ち方で向きが変わるため、飛行前に軽く傾けて操作方向を確認してください。

画面は機首を上にしたレーダー（半径 600 m）。黄色の点がリングです。高さはレーダーではなく PC の画面で確認します。スコア・速度・高度も表示。2 秒間データが届かないと `Waiting for game...` と姿勢を表示します。USB を抜くとキーボードに戻ります。IMU データが 0.5 秒途切れると傾き操作を無効化します。キーボードは接続中も利用できます。

### Fedora (GNOME) での注意

- CoreS3 / CoreS3-Lite のどちらでも同じファームウェアで動きます（どちらも BMI270 IMU 搭載。CoreS3-SE は IMU 非搭載のため非対応）。
- ブラウザは RPM 版の Google Chrome または Chromium（`sudo dnf install chromium`）を使ってください。Flatpak 版はサンドボックスのためシリアルポートにアクセスできないことがあります。
- シリアルポート権限: `sudo usermod -aG dialout $USER` を実行し、一度ログアウト→ログインします。`ls -l /dev/ttyACM*` でグループが `dialout` であることを確認できます。
- PlatformIO の書き込みで権限エラーが出る場合は [udev ルール](https://docs.platformio.org/en/latest/core/installation/udev-rules.html) を追加してください。
- ModemManager がポートを掴んで接続が不安定な場合は `sudo systemctl stop ModemManager` を試してください。

## シリアルプロトコル v1

USB CDC、115200 baud、UTF-8 / ASCII、**1 行に 1 個の JSON + LF**（受信は CRLF も可）。起動ログ、不正 JSON、不明な種類は無視します。

CoreS3 → PC、約 50 Hz:
```json
{"t":"imu","r":5.2,"p":-3.1,"y":12.0,"b":1}
```
`r` ロール・`p` ピッチ（度、加速度とジャイロの相補フィルター）、`y` ヨー（度、ジャイロ積分・ドリフトあり、現バージョンの操縦には不使用）。`b` はビットマスク: bit0=ブースト、bit1=センター合わせ。センター合わせは PC 側で立ち上がり時に現在の姿勢を記録します。

PC → CoreS3、約 10 Hz:
```json
{"t":"radar","h":25.0,"o":[[40,-200],[-30,-380]],"score":100,"speed":45,"alt":70}
```
`h` は機首角（度）。0° は世界の -Z、正は左旋回、前方ベクトルは `[-sin(h), -cos(h)]`。`o` はプレイヤーから見た世界座標差 `[dx,dz]`（m）の配列。距離 1200 m 内、近い順、最大 16 個、空なら `[]`。デバイス側で機首方向へ回転して表示します。`score` は点数、`speed` は m/s、`alt` は地上からの m。受信行は最大 2048 文字（PC の入力は 4096 文字まで）。

## 開発・確認

```sh
cd web
npm test
npm run typecheck
npm run build
cd ../firmware
pio run
```

`web/` は Vite + TypeScript + three.js、`firmware/` は PlatformIO + Arduino + M5Unified + ArduinoJson。CI は両方をビルドします。main への push で GitHub Pages に自動デプロイ（管理者権限・リポジトリの Pages 利用許可が必要）。Vite の base は `./`。本体無しでもブラウザ版は動きますが、実機の IMU 軸・タッチ・USB は実機での最終調整を推奨します。

English: an arcade flight playground with keyboard or CoreS3 motion controls. Fly through rings, avoid terrain, and press R to restart. Chrome/Edge required only for USB Web Serial.
