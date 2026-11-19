#include <M5Unified.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <cmath>
#include <mutex>
#if __has_include("wifi_config.h")
#include "wifi_config.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#endif

constexpr const char *HOSTNAME = "cores3-flight";
constexpr const char *AP_SSID = "CoreS3-Flight";
constexpr const char *AP_PASSWORD = "skyline2026";
AsyncWebServer server(80);
AsyncWebSocket socket("/ws");
std::mutex socketMutex;
String socketLine;
bool socketPending = false, accessPoint = false, mdnsStarted = false, joined = false;
uint32_t wifiStarted = 0, lastCleanup = 0;

M5Canvas radar(&M5.Display);
float roll = 0, pitch = 0, yaw = 0, heading = 0;
float targets[16][2];
int targetCount = 0, score = 0, speed = 0, altitude = 0;
uint32_t lastImu = 0, lastDraw = 0, lastRadar = 0;
uint32_t lastImuSample = 0;
bool received = false, initialized = false, overflow = false;
String line;

void handleRadar(const String &message) {
  JsonDocument doc;
  if (!deserializeJson(doc, message) && doc["t"] == "radar" && doc["h"].is<float>() && doc["o"].is<JsonArray>()) {
    heading = doc["h"].as<float>();
    targetCount = 0;
    for (JsonArray point : doc["o"].as<JsonArray>()) {
      if (targetCount >= 16) break;
      if (point.size() == 2 && point[0].is<float>() && point[1].is<float>()) {
        float x = point[0], z = point[1];
        if (std::isfinite(x) && std::isfinite(z)) { targets[targetCount][0] = x; targets[targetCount++][1] = z; }
      }
    }
    score = doc["score"] | 0; speed = doc["speed"] | 0; altitude = doc["alt"] | 0;
    received = std::isfinite(heading); lastRadar = millis();
  }
}

void readRadar() {
  int budget = 2048;
  while (Serial.available() && budget-- > 0) {
    char c = Serial.read();
    if (c == '\n') {
      if (!overflow) handleRadar(line);
      line = ""; overflow = false;
    } else if (line.length() < 2048 && !overflow) line += c;
    else { line = ""; overflow = true; }
  }
  String message;
  {
    std::lock_guard<std::mutex> lock(socketMutex);
    if (!socketPending) return;
    message = socketLine; socketPending = false;
  }
  handleRadar(message);
}

void onSocket(AsyncWebSocket *, AsyncWebSocketClient *, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type != WS_EVT_DATA) return;
  auto *info = static_cast<AwsFrameInfo *>(arg);
  if (!info->final || info->index != 0 || info->len != len || info->opcode != WS_TEXT || len > 2048) return;
  std::lock_guard<std::mutex> lock(socketMutex);
  socketLine = String(reinterpret_cast<const char *>(data), len);
  socketPending = true;
}

void startAccessPoint() {
  WiFi.disconnect(true); WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  accessPoint = true;
}

void updateWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) joined = true;
  if (!accessPoint && !joined && now - wifiStarted > 15000) startAccessPoint();
  if (!mdnsStarted && (accessPoint || WiFi.status() == WL_CONNECTED) && MDNS.begin(HOSTNAME)) {
    MDNS.addService("http", "tcp", 80); mdnsStarted = true;
  }
  if (now - lastCleanup > 1000) { lastCleanup = now; socket.cleanupClients(2); }
}

void startNetwork() {
  WiFi.setHostname(HOSTNAME);
  WiFi.mode(WIFI_STA); WiFi.setSleep(false);
  if (strlen(WIFI_SSID)) { WiFi.begin(WIFI_SSID, WIFI_PASSWORD); wifiStarted = millis(); }
  else startAccessPoint();
  bool files = LittleFS.begin(true);
  socket.onEvent(onSocket);
  server.addHandler(&socket);
  if (files) server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("no-cache");
  server.onNotFound([](AsyncWebServerRequest *request) {
    request->send(404, "text/plain", "Game files not found. Run: cd web && npm run build:device && cd ../firmware && pio run -t uploadfs");
  });
  server.begin();
}

void drawRadar(uint32_t now) {
  radar.fillSprite(0x0828);
  radar.setTextColor(0xDFB6); radar.setTextSize(1);
  radar.setCursor(12, 9); radar.print("SKYLINE / CORES3 RADAR");
  radar.setCursor(170, 9);
  if (accessPoint) radar.printf("AP %s", AP_SSID);
  else if (WiFi.status() == WL_CONNECTED) radar.printf("WiFi %s", WiFi.localIP().toString().c_str());
  else radar.print("WiFi connecting...");
  if (socket.count()) radar.print(" *");
  if (accessPoint) { radar.setCursor(170, 21); radar.printf("PW %s", AP_PASSWORD); radar.setCursor(170, 33); radar.print("http://192.168.4.1/"); }
  const bool live = received && now-lastRadar < 2000;
  radar.setTextColor(live ? 0x6F9A : 0xFECA);
  radar.setCursor(12, 24);
  radar.print(live ? "GAME LIVE" : received ? "GAME DATA LOST" : "NO GAME DATA");
  radar.setTextColor(0xDFB6);
  const int cx = 84, cy = 111, radius = 69;
  radar.drawCircle(cx, cy, radius, 0x4BEE); radar.drawCircle(cx, cy, radius/2, 0x224B);
  radar.drawLine(cx-radius, cy, cx+radius, cy, 0x224B); radar.drawLine(cx,cy-radius,cx,cy+radius,0x224B);
  if (live) {
    float angle = heading * DEG_TO_RAD;
    for (int i=0;i<targetCount;i++) {
      float dx = targets[i][0], dz = targets[i][1];
      float right = dx*cosf(angle)-dz*sinf(angle);
      float forward = -dx*sinf(angle)-dz*cosf(angle);
      float x = right/600*radius, y = -forward/600*radius;
      if (x*x+y*y < (radius-4)*(radius-4)) radar.fillCircle(cx+int(x),cy+int(y),3,0xFECA);
    }
    radar.setCursor(170, 47); radar.print("SCORE");
    radar.setCursor(170, 82); radar.print("SPEED");
    radar.setCursor(170, 117); radar.print("ALTITUDE");
    radar.setTextSize(2);
    radar.setCursor(170, 58); radar.printf("%d", score);
    radar.setCursor(170, 93); radar.printf("%d m/s", speed);
    radar.setCursor(170, 128); radar.printf("%d m", altitude);
    radar.setTextSize(1);
  } else {
    radar.setCursor(170, 61); radar.print("Open the game");
    radar.setCursor(170, 75); radar.print("and connect CoreS3.");
  }
  radar.fillTriangle(cx,cy-9,cx-6,cy+6,cx+6,cy+6,0xEFFF);
  radar.setCursor(54, 188); radar.print("RANGE 600m");
  radar.setCursor(170, 163);
  if (!initialized) radar.print("IMU: no samples");
  else if (now-lastImuSample > 500) radar.print("IMU: no recent data");
  else radar.printf("Raw R:%+4.0f P:%+4.0f deg", roll, pitch);
  radar.setCursor(170, 183); radar.print("Hold neutral; tap CENTER");
  radar.fillRect(0, 200, 160, 40, 0x236D); radar.fillRect(160, 200, 160, 40, 0x334E);
  radar.setTextColor(0xEFFF); radar.setTextSize(2);
  radar.setCursor(50, 212); radar.print("BOOST"); radar.setCursor(204, 212); radar.print("CENTER");
  radar.pushSprite(0,0);
}

void setup() {
  auto cfg = M5.config(); M5.begin(cfg);
  Serial.begin(115200);
  M5.Display.setRotation(0); radar.setColorDepth(16); radar.createSprite(320,240);
  line.reserve(2048); lastImu = millis();
  startNetwork();
}

void loop() {
  M5.update(); readRadar(); uint32_t now = millis(); updateWifi(now);
  if (now-lastImu >= 20) {
    float dt = min((now-lastImu)/1000.0f,0.1f); lastImu = now;
    if (M5.Imu.update()) {
      lastImuSample = now;
      auto data = M5.Imu.getImuData();
      float ar = atan2f(data.accel.y,data.accel.z)*RAD_TO_DEG;
      float ap = atan2f(-data.accel.x,sqrtf(data.accel.y*data.accel.y+data.accel.z*data.accel.z))*RAD_TO_DEG;
      if (!initialized) {roll=ar;pitch=ap;initialized=true;}
      roll = .98f*(roll+data.gyro.x*dt)+.02f*ar;
      pitch = .98f*(pitch+data.gyro.y*dt)+.02f*ap;
      yaw += data.gyro.z*dt;
    }
    int buttons = 0;
    for (int i=0; i<M5.Touch.getCount();i++) {
      auto touch = M5.Touch.getDetail(i);
      if (touch.isPressed() && touch.y >= 200) buttons |= touch.x < 160 ? 1 : 2;
    }
    char imu[96];
    snprintf(imu,sizeof imu,"{\"t\":\"imu\",\"r\":%.2f,\"p\":%.2f,\"y\":%.2f,\"b\":%d}",roll,pitch,yaw,buttons);
    Serial.printf("%s\n",imu);
    if (socket.count() && socket.availableForWriteAll()) socket.textAll(imu);
  }
  if (now-lastDraw >= 66) {lastDraw=now;drawRadar(now);}
  delay(1);
}
