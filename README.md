# 空路 / SKYLINE — CoreS3 Flight

M5Stack CoreS3 を傾けて、PC の空を飛ぶ小さな 3D フライトゲーム。デバイスなしでもキーボードだけで遊べます。前進は自動。舞台は小さな島で、遠くから見える 5 つの名所（灯台の岬とアーチ岩、吊り橋、海の鳥居、火山、ツインタワー）それぞれに、くぐり抜けられる場所があります。くぐるたびに +100 点、光のかけらが舞って島の時間帯が変わります。海・地面・建物への衝突でフライト終了です。

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
| J、L | 押している間、左・右にロール（1 回転で +100） |
| I | 押している間、機首を上げ続ける（1 周でループ +300、35 m/s 未満では失速） |
| K | 押している間、機首を下げ続ける（背面まで回して離すとスプリットS +250） |
| G | スタントのデバッグ表示を切り替え |
| R | リセット（スコア・時間も初期化） |
| C | CoreS3 のセンター合わせ |
| M | Mute / unmute audio |

最初はブリーフィング中で飛行・時間は停止しています。Enter / Space またはカードのクリックで離陸します (Take off)。海・地面・建物への衝突でフライト終了。結果画面では R / Enter でリトライでき、すぐに飛行が始まります。

決まったコースや順番はなく、島のどこへ飛んでも構いません。くぐれる場所を示す文字や目印は画面に出ません。アーチ岩の中、吊り橋の下、鳥居の中、火口の切れ目、ツインタワーの間（連絡橋の下）を、どちら向きにでも抜けられます。同じ場所は 260 m 以上離れるともう一度くぐれます。このまま進むと地面や海にぶつかるときは PULL UP、建物や岩にぶつかるときは OBSTACLE を表示します。島から約 2 km 離れると海霧に包まれ、そのまま進むと島の反対側から戻ってきます。飛行中の画面に出るのはスコア・速度・高度だけです。ヘッダーと画面下の操作一覧は飛行中は隠れ、マウスを動かす・画面にタッチする・Tab を押すと数秒だけ表示されます。

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

本体のレーダーは機首が上、半径 1500 m です（ゲームが `range` を送らない場合は 600 m）。黄色の点は 5 つの名所のくぐり抜け場所の方向と距離を示します。プレイ中の本体画面はレーダーと BOOST / CENTER ボタンだけです（スコア・速度・高度は PC 画面で確認します）。左上の `NO GAME DATA` はゲームから未受信、`GAME DATA LOST` は受信が 2 秒途切れた状態、`IMU: NO DATA` は姿勢センサーの値が取れていない状態です。Wi-Fi の状態は、ゲームのデータを受信していない間だけ右上に表示します。USB を抜くとキーボードに戻ります。ブラウザに IMU メッセージが 0.5 秒届かないと傾き操作を無効化します。キーボードは接続中も利用できます。

Fedora GNOME では RPM 版の Google Chrome または Chromium（`sudo dnf install chromium`）を使ってください。Flatpak 版で USB ポートが表示されない場合は、サンドボックスを変更する前に RPM 版で試してください。書き込み後に USB ポートが再接続されることがあるので、ブラウザでは起動後のポートを選びます。

## Wi-Fi で接続（Firefox でも可）

USB の Web Serial は Chrome / Edge 専用ですが、Wi-Fi なら Firefox でも遊べます。CoreS3 が本体内にゲームを保存して配信し、同じページから WebSocket（`ws://<本体>/ws`）で姿勢を送ります。HTTPS の GitHub Pages からは混在コンテンツ制限で `ws://` に接続できないため、Wi-Fi では本体のページ（HTTP）を開きます。

1. 自宅の 2.4 GHz Wi-Fi に参加させる場合は `firmware/include/wifi_config.example.h` を `firmware/include/wifi_config.h` にコピーし、SSID とパスワードを書きます（このファイルは git 管理外）。作らなければ本体が自分のアクセスポイントを起動します。
2. ゲームとファームウェアを書き込みます（ゲームを更新したときも `uploadfs` を再実行）。
   ```sh
   cd web && npm ci && npm run build:device
   cd ../firmware && pio run -t upload && pio run -t uploadfs
   ```
3. 本体画面の右上に接続状態が出ます。SSID・AP パスワード・ページを開く案内は本体画面には表示しません。
   - `WiFi 192.168.x.x`: PC を同じネットワークにつなぎ、Firefox で **http://cores3-flight.local/**（開けなければ表示された IP）を開きます。
   - `AP`（`wifi_config.h` なし、または 15 秒で参加できなかった場合）: PC の Wi-Fi を `CoreS3-Flight`（パスワード `skyline2026`）に接続し、**http://192.168.4.1/** を開きます。
4. ページを開くと自動で Wi-Fi 接続し、ヘッダーに「Wi-Fi接続済み ✓」が表示され、本体画面の `NO GAME DATA` が消えます。切れても 3 秒ごとに再接続します。あとは USB と同じくセンター合わせ・BOOST・レーダーが使えます。

`npm run dev` のローカル版（http://localhost:5173）からも「Wi-Fiで接続」で本体のアドレス（既定 `cores3-flight.local`）を入力すれば接続できます。USB と Wi-Fi は同時に有効で、USB 給電のまま Wi-Fi で遊んでも構いません。Fedora で `.local` が引けない場合は IP を使うか `sudo dnf install nss-mdns` を確認してください。ファイアウォールは PC 側からの接続なので通常変更不要です。

WebSocket では 1 テキストフレームに 1 個の JSON（改行なし）を、シリアルプロトコル v1 と同じ内容でやりとりします。

## スタント（傾けている間だけ回る）

スタントは自動再生ではなく、プレイヤーが回します。CoreS3 を通常の操縦範囲（約 30° で最大）より大きく、**50° 以上**傾けている間だけ機体がその向きに回り続け、手を戻す（38° 未満）と止まります。通常のバンク約 45°・ピッチ約 28° の制限は、この入力の間だけ外れます。もう一方の軸の操縦はスタント中も効きます。

| 操作 | キー（押している間） | 動き | 成立 | 点 |
| --- | --- | --- | --- | --- |
| 左右に大きく傾け続ける | J / L | 約 300°/秒でロール | 1 回転ごとにバレルロール | 100 |
| 手前に大きく引き続ける | I | 約 150°/秒で機首が上がり続ける | 1 周でループ。35 m/s 未満では機首が上がらず失速 | 300 |
| 奥へ大きく押し続ける | K | 約 150°/秒で機首が下がり続ける | 背面（135° 以上）まで回して手を戻すと反転。水平に戻った時点でスプリットS | 250 |

手を戻したときは近い側へ戻ります。ロールは半回転より前なら元の姿勢へ戻り、半回転を過ぎていれば残りを回り切ります。ピッチは垂直（90°）を越えたところで戻すと機体が逆向きになり（背面から自動で水平に戻る）、270° を過ぎていればループを回り切ります。引いて半周で戻すと点数なしの反転上昇になります。スプリットSの高度損失は速度によって変わり、54 m/s で約 40 m です。低高度では墜落します。急上昇中は速度が落ち、急降下中は上がります。

しきい値と回転速度は `web/src/stunts.ts` の `STUNT` にまとめてあります。G キーで画面左下に **STUNT DEBUG** を表示でき、本体の傾き、長押しの判定（`input`）、機体の角度、スタントごとの回数を確認できます。

### ファームウェアの更新

この変更（傾けている間だけ回るスタント）は既存の `r` / `p` だけを使うので、書き込み直しは不要です。本体のブースト / PULL UP 音や画面の変更を使うには、最新のファームウェアを書き込みます。

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

書き込み前にゲームのタブとシリアルモニターを閉じてください。ポートが複数ある場合は `--upload-port /dev/ttyACM0` のように指定します。Wi-Fi で本体が配信するゲームを遊んでいる場合、ゲーム側の変更は `uploadfs` をやり直すまで本体に反映されません。

## シリアルプロトコル v1

USB CDC、115200 baud、UTF-8 / ASCII、**1 行に 1 個の JSON + LF**（受信は CRLF も可）。起動ログ、不正 JSON、不明な種類は無視します。

CoreS3 → PC、約 50 Hz:
```json
{"t":"imu","r":5.2,"p":-3.1,"y":12.0,"b":1,"gx":-4.2,"gy":310.5,"gz":0.8}
```
`r` は本体の X 軸まわりの角度（上辺が上がると正、ゲームではピッチ）、`p` は本体の Y 軸まわりの角度（右辺が下がると正、ゲームではバンク）。どちらも度単位の加速度・ジャイロの相補フィルター出力です。`y` はヨー（度、ジャイロ積分・ドリフトあり、操縦には不使用）。`b` はビットマスク: bit0=ブースト、bit1=センター合わせ。PC は bit1 の立ち上がりを検出すると短時間の姿勢データを平均してセンターを決めます。

`gx` / `gy` / `gz` は本体の X / Y / Z 軸まわりの角速度（度/秒、フィルターなしのジャイロ値）で、`gx` は `r`、`gy` は `p` と同じ向きです。現在のゲームは使っていません。3 つとも無いフレーム（旧ファームウェア）も受け付けます。

PC → CoreS3、約 10 Hz:
```json
{"t":"radar","h":25.0,"range":1500,"o":[[40,-200],[-30,-380]],"score":100,"speed":45,"alt":70}
```
`h` は機首角（度）。0° は世界の -Z、正は左旋回、前方ベクトルは `[-sin(h), -cos(h)]`。`range` はレーダーの半径（m）で、無ければ 600。`o` はプレイヤーから見た世界座標差 `[dx,dz]`（m）の配列で、5 つの名所のくぐり抜け場所を送ります（最大 16 個）。デバイス側で機首方向へ回転して表示します。`score`（点数）・`speed`（m/s）・`alt`（地上からの m）は旧ファームウェア向けに送り続けますが、現在のファームウェアは表示しません。受信行は最大 2048 文字（PC の入力は 4096 文字まで）。

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

English: free flight over a small island with keyboard or CoreS3 motion controls. Five landmarks (lighthouse cape with a sea arch, suspension bridge, torii in the sea, volcano, twin towers) each have a way under or through; flying through scores +100, scatters light and moves the time of day on, with no text or markers on screen. Hitting the sea, the land or a structure ends the flight; press R to retry. Chrome/Edge required only for USB Web Serial; over Wi-Fi, open http://cores3-flight.local/ (served by the CoreS3) in any browser, including Firefox.

The UI fonts in `web/public/fonts/` are SIL OFL subsets of Space Grotesk (Latin) and Noto Sans JP (Japanese game text). Update the Japanese subset when adding new UI characters: `pyftsubset 'NotoSansJP[wght].ttf' --text-file=chars.txt --flavor=woff2 --output-file=web/public/fonts/NotoSansJP-UI.woff2` (fonttools and brotli), with every Japanese character used in `web/src` and `web/index.html` in `chars.txt`.

### Playtest without hardware

On the game page, run the contents of [the mock serial device](web/fixtures/cores3-serial.js) in DevTools before clicking Connect. It streams the firmware's 50 Hz newline JSON with a non-level grip, a short boot delay, and small deterministic noise and drift. After centering, add to `coreS3Sim.rightEdgeDown` to bank right or subtract to bank left; add to `coreS3Sim.topEdgeUp` to pitch up or subtract to pitch down (degrees). Set `coreS3Sim.buttons` to 1 for boost, 2 for center, or 0 to release. Set `coreS3Sim.paused` to test stale input and inspect `coreS3Sim.radar` for the game's telemetry. Call `coreS3Sim.hold('rollLeft')`, `'rollRight'`, `'pull'` or `'push'` (optionally with a duration in ms, default 1300) to tilt 60 degrees past the centred pose for that long, and set `coreS3Sim.legacyFirmware = true` to drop the angular velocity fields like older firmware. Reload to restore normal Web Serial.
