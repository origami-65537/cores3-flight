# 空路 / SKYLINE — CoreS3 Flight

M5Stack CoreS3 を傾けて、PC の空を飛ぶ小さな 3D フライトゲーム。デバイスなしでもキーボードだけで遊べます。前進は自動。40 個のリングを順番に狙い、くぐると +100 点。地面・岩柱への衝突でフライト終了です。

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
| J、L | バレルロール 左、右（+100） |
| I | ループ（+300、35 m/s 未満では失速） |
| K | スプリットS（+250、反転して高度 −40 m） |
| G | フリック判定のデバッグ表示を切り替え |
| R | リセット（スコア・時間も初期化） |
| C | CoreS3 のセンター合わせ |
| M | Mute / unmute audio |

最初はブリーフィング中で飛行・時間は停止しています。Enter / Space またはカードのクリックで離陸します (Take off)。地面・岩柱への衝突でフライト終了。結果画面では R / Enter でリトライでき、すぐに飛行が始まります。

低高度・降下時は PULL UP、前方の岩柱には OBSTACLE を表示します。金色が次のリングです。マーカーまたは画面端の矢印を頼りに、照準をリングの中心へ合わせてください。リングを逃しても次に進めます。コース後半はリングが小さく、カーブが大きくなります。計器の RINGS は通過数、THROTTLE はスロットルの割合です。

画面下のボタンでもリセット・センター合わせができます。「全画面」でゲームを全画面表示にし、Esc キーで元の表示に戻せます。

## CoreS3 / CoreS3-Lite に書き込む

CoreS3 と CoreS3-Lite は同じファームウェアを使います（どちらも BMI270 IMU 搭載）。CoreS3-SE は IMU 非搭載のため非対応です。

### 1. PlatformIO を準備する

Fedora では先に `sudo dnf install git python3 python3-pip` を実行します。ターミナルでリポジトリを取得してから、Python の仮想環境を作ります。

```sh
git clone https://github.com/origami-65537/cores3-flight.git
cd cores3-flight
python3 -m venv "$HOME/.venvs/cores3-flight"
. "$HOME/.venvs/cores3-flight/bin/activate"
python3 -m pip install platformio==6.2.0
cd firmware
pio run
```

クローン済みならリポジトリのルートから 3 行目以降を実行します。新しい端末では再度 `. "$HOME/.venvs/cores3-flight/bin/activate"` を実行します。

### 2. USB で書き込む

1. 充電専用ではない USB-C データケーブルで、本体の USB-C 端子と PC をつなぎます。`firmware/` で `pio device list` を抜き差しの前後で実行し、増えたポート（Fedora なら例: `/dev/ttyACM0`）を確認します。
2. Fedora GNOME でポートが見えるのに開けない場合は、`ls -l /dev/ttyACM0` で実際のポートのグループを確認します。`dialout` なら `sudo usermod -aG dialout "$USER"` を実行し、GNOME からログアウトして再ログインします。それでも権限エラーが出る場合は [PlatformIO の udev ルール](https://docs.platformio.org/en/latest/core/installation/udev-rules.html) を導入し、ルールを再読み込みして USB を挿し直してください。
3. `pio run -t upload` を実行します。複数のポートがある場合は `pio run -t upload --upload-port /dev/ttyACM0` の例のように、手順 1 で確認したポートを指定します。
4. ポートが出ない、または書き込み時に接続できない場合は、USB をつないだまま**底面のリセットボタン**を内部の緑 LED が点灯するまで長押しし、離します。LED が消えるとダウンロードモードです（[CoreS3-Lite 公式手順](https://docs.m5stack.com/en/core/CoreS3-Lite)）。ポート番号が変わることがあるので、`pio device list` で確認してからアップロードをやり直します。書き込み成功後にゲーム画面が出なければ、リセットボタンを短く押します。

### 3. ブラウザで遊ぶ

1. シリアルモニターを閉じてから、PC の **Chrome / Edge** でゲームを開きます。Web Serial は HTTPS（Pages）または localhost が必要です。Firefox / Safari はキーボードモードで遊べます。
2. HUD の「USBで接続」を押し、USB シリアルポートを選択します（115200 baud）。
3. レーダーが正立する横向きで本体を自然に持ち、接続すると、最初の姿勢データから自動でセンターを合わせます。持ち直したら「センター合わせ」または C を押し、「センター設定」が表示されるまで約 0.2 秒キープしてください。本体の上辺を上げると機首が上がり、右辺を下げると右にバンクします。最大操作角は約 30°、小さな動きを無視するデッドゾーンと平滑化付きです。
4. 本体画面の **下部左（BOOST）** を押すとブースト、**下部右（CENTER）** を押すとセンター合わせ。基準姿勢・持ち方で向きが変わるため、飛行前に軽く傾けて操作方向を確認してください。

本体のレーダーは機首が上、半径 600 m です。黄色の点はリングの方向と距離を示します。リングの高さは PC 画面で確認してください。本体の `GAME LIVE` はゲームからデータを受信中、`NO GAME DATA` は未受信、`GAME DATA LOST` は受信が 2 秒途切れた状態です。`Raw R/P` はセンター補正前のロール・ピッチ角です。USB を抜くとキーボードに戻ります。ブラウザに IMU メッセージが 0.5 秒届かないと傾き操作を無効化します。キーボードは接続中も利用できます。

Fedora GNOME では RPM 版の Google Chrome または Chromium（`sudo dnf install chromium`）を使ってください。Flatpak 版で USB ポートが表示されない場合は、サンドボックスを変更する前に RPM 版で試してください。書き込み後に USB ポートが再接続されることがあるので、ブラウザでは起動後のポートを選びます。

## Wi-Fi で接続（Firefox でも可）

USB の Web Serial は Chrome / Edge 専用ですが、Wi-Fi なら Firefox でも遊べます。CoreS3 が本体内にゲームを保存して配信し、同じページから WebSocket（`ws://<本体>/ws`）で姿勢を送ります。HTTPS の GitHub Pages からは混在コンテンツ制限で `ws://` に接続できないため、Wi-Fi では本体のページ（HTTP）を開きます。

1. 自宅の 2.4 GHz Wi-Fi に参加させる場合は `firmware/include/wifi_config.example.h` を `firmware/include/wifi_config.h` にコピーし、SSID とパスワードを書きます（このファイルは git 管理外）。作らなければ本体が自分のアクセスポイントを起動します。
2. ゲームとファームウェアを書き込みます（ゲームを更新したときも `uploadfs` を再実行）。
   ```sh
   cd web && npm ci && npm run build:device
   cd ../firmware && pio run -t upload && pio run -t uploadfs
   ```
3. 本体画面の右上に接続先が出ます。
   - `WiFi 192.168.x.x`: PC を同じネットワークにつなぎ、Firefox で **http://cores3-flight.local/**（開けなければ表示された IP）を開きます。
   - `AP CoreS3-Flight`（`wifi_config.h` なし、または 15 秒で参加できなかった場合）: PC の Wi-Fi を `CoreS3-Flight`（パスワード `skyline2026`）に接続し、**http://192.168.4.1/** を開きます。
4. ページを開くと自動で Wi-Fi 接続し、HUD に「Wi-Fi接続済み ✓」、本体画面の右上に `*` が付きます。切れても 3 秒ごとに再接続します。あとは USB と同じくセンター合わせ・BOOST・レーダーが使えます。

`npm run dev` のローカル版（http://localhost:5173）からも「Wi-Fiで接続」で本体のアドレス（既定 `cores3-flight.local`）を入力すれば接続できます。USB と Wi-Fi は同時に有効で、USB 給電のまま Wi-Fi で遊んでも構いません。Fedora で `.local` が引けない場合は IP を使うか `sudo dnf install nss-mdns` を確認してください。ファイアウォールは PC 側からの接続なので通常変更不要です。

WebSocket では 1 テキストフレームに 1 個の JSON（改行なし）を、シリアルプロトコル v1 と同じ内容でやりとりします。

## スタント（フリック操作）

飛行中に CoreS3 をすばやく振ると、通常の飛行モデルの上に決まった動きのスタントが再生されます。スタント中は操縦を受け付けず、終わると通常の操縦に戻ります。点数はスタントを最後まで決めたときに入ります。

| 操作 | キー | スタント | 点 | 内容 |
| --- | --- | --- | --- | --- |
| 左右にすばやくひねって戻す | J / L | バレルロール | 100 | 0.7 秒で 1 回転、高度 −3 m |
| 手前にすばやく引く | I | ループ | 300 | 2 秒の宙返り。35 m/s 未満では失速して約 35 m 落下（0 点） |
| 奥へすばやく押す | K | スプリットS | 250 | 1.6 秒で反転して逆方向へ。高度 −40 m（低高度では墜落） |

フリックは角速度 250°/s 以上で、ひねりは 40°、引く・押すは 45° 以上振ったときに成立します。ひねりは 0.3 秒以内に戻したときだけ成立するので、傾けたままの旋回はスタントになりません。次のフリックは本体をニュートラル付近（20° 以内）に戻してから受け付けます。しきい値は `web/src/stunts.ts` の `STUNT.flick` にまとめてあります。

CoreS3 を接続すると画面左下に **FLICK DEBUG** が表示されます（G で切り替え）。現在の傾きと角速度（ピーク保持）、判定状態（READY / TRACKING / WAIT）、最後に成立したフリックの角速度と振り幅、種類ごとの回数、不成立の理由（`reject`）を確認できます。`ファームウェア更新が必要` と表示される場合は、角速度を送らない古いファームウェアです。下記の手順で書き込み直してください（操縦は古いファームウェアでも動きます）。

### ファームウェアの更新（この版では必須）

フリック判定（角速度 `gx` / `gy` / `gz`）と本体のブースト / PULL UP 音は新しいファームウェアが必要です。1 回の書き込みで両方入ります。

USB で遊ぶ場合:
```sh
git pull
cd firmware
pio run -t upload
```

Wi-Fi で遊ぶ場合（本体が配信するゲーム画面も更新します。`firmware/include/wifi_config.h` はそのまま使えます）:
```sh
git pull
cd web && npm ci && npm run build:device
cd ../firmware && pio run -t upload && pio run -t uploadfs
```

書き込み前にゲームのタブとシリアルモニターを閉じてください。ポートが複数ある場合は `--upload-port /dev/ttyACM0` のように指定します。書き込み後、USB は https://origami-65537.github.io/cores3-flight/ で「USBで接続」、Wi-Fi は http://cores3-flight.local/ を開き、FLICK DEBUG が `READY` になることを確認します。

## シリアルプロトコル v1

USB CDC、115200 baud、UTF-8 / ASCII、**1 行に 1 個の JSON + LF**（受信は CRLF も可）。起動ログ、不正 JSON、不明な種類は無視します。

CoreS3 → PC、約 50 Hz:
```json
{"t":"imu","r":5.2,"p":-3.1,"y":12.0,"b":1,"gx":-4.2,"gy":310.5,"gz":0.8}
```
`r` は本体の X 軸まわりの角度（上辺が上がると正、ゲームではピッチ）、`p` は本体の Y 軸まわりの角度（右辺が下がると正、ゲームではバンク）。どちらも度単位の加速度・ジャイロの相補フィルター出力です。`y` はヨー（度、ジャイロ積分・ドリフトあり、操縦には不使用）。`b` はビットマスク: bit0=ブースト、bit1=センター合わせ。PC は bit1 の立ち上がりを検出すると短時間の姿勢データを平均してセンターを決めます。

`gx` / `gy` / `gz` は本体の X / Y / Z 軸まわりの角速度（度/秒、フィルターなしのジャイロ値）で、`gx` は `r`、`gy` は `p` と同じ向きです。ゲームはフリックの速さの判定に使い、向きは `r` / `p` の変化から決めます。3 つとも無いフレーム（旧ファームウェア）も受け付けますが、フリックは無効になります。

PC → CoreS3、約 10 Hz:
```json
{"t":"radar","h":25.0,"o":[[40,-200],[-30,-380]],"score":100,"speed":45,"alt":70}
```
`h` は機首角（度）。0° は世界の -Z、正は左旋回、前方ベクトルは `[-sin(h), -cos(h)]`。`o` はプレイヤーから見た世界座標差 `[dx,dz]`（m）の配列。距離 1200 m 内、近い順、最大 16 個、空なら `[]`。デバイス側で機首方向へ回転して表示します。`score` は点数、`speed` は m/s、`alt` は地上からの m。受信行は最大 2048 文字（PC の入力は 4096 文字まで）。

PC → CoreS3 event cues (USB and WebSocket): `{"t":"sfx","s":"boost"}` on boost start, or `{"t":"sfx","s":"pullup"}` when PULL UP begins (2-second warning cooldown). Firmware accepts only these names, rate-limits cues to 300 ms, and queues a modest-volume 90 ms speaker tone without blocking the IMU loop.

## 開発・確認

Game-feel tuning lives in `web/src/feel.ts` (`FEEL`): camera, response, audio, rewards, near misses, and scenery. Audio starts on takeoff; **M** toggles mute.

```sh
cd web
npm test
npm run typecheck
npm run build
npm run build:device
cd ../firmware
pio run
pio run -t buildfs
```

`web/` は Vite + TypeScript + three.js、`firmware/` は PlatformIO + Arduino + M5Unified + ArduinoJson。CI は両方をビルドします。main への push で GitHub Pages に自動デプロイ（管理者権限・リポジトリの Pages 利用許可が必要）。Vite の base は `./`。本体無しでもブラウザ版は動きますが、実機の IMU 軸・タッチ・USB は実機での最終調整を推奨します。

English: a 40-ring arcade flight course with keyboard or CoreS3 motion controls. Aim at the gold ring, use the bearing arrow if you lose sight of it, and keep flying after a miss. Avoid terrain and press R to retry. Chrome/Edge required only for USB Web Serial; over Wi-Fi, open http://cores3-flight.local/ (served by the CoreS3) in any browser, including Firefox.

The UI fonts in `web/public/fonts/` are SIL OFL subsets of Space Grotesk (Latin) and Noto Sans JP (Japanese game text). Update the Japanese subset when adding new UI characters: `pyftsubset 'NotoSansJP[wght].ttf' --text-file=chars.txt --flavor=woff2 --output-file=web/public/fonts/NotoSansJP-UI.woff2` (fonttools and brotli), with every Japanese character used in `web/src` and `web/index.html` in `chars.txt`.

### Playtest without hardware

On the game page, run the contents of [the mock serial device](web/fixtures/cores3-serial.js) in DevTools before clicking Connect. It streams the firmware's 50 Hz newline JSON with a non-level grip, a short boot delay, and small deterministic noise and drift. After centering, add to `coreS3Sim.rightEdgeDown` to bank right or subtract to bank left; add to `coreS3Sim.topEdgeUp` to pitch up or subtract to pitch down (degrees). Set `coreS3Sim.buttons` to 1 for boost, 2 for center, or 0 to release. Set `coreS3Sim.paused` to test stale input and inspect `coreS3Sim.radar` for the game's telemetry. Call `coreS3Sim.flick('twistLeft')`, `'twistRight'`, `'pull'` or `'push'` to play a 55-degree flick with matching `gx` / `gy`, and set `coreS3Sim.legacyFirmware = true` to drop the angular velocity fields like firmware from before the stunt update. Reload to restore normal Web Serial.
