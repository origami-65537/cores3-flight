#include <M5Unified.h>
#include <ArduinoJson.h>
#include <cmath>

M5Canvas radar(&M5.Display);
float roll = 0, pitch = 0, yaw = 0, heading = 0;
float targets[16][2];
int targetCount = 0, score = 0, speed = 0, altitude = 0;
uint32_t lastImu = 0, lastDraw = 0, lastRadar = 0;
bool received = false, initialized = false, overflow = false;
String line;

void readRadar() {
  int budget = 2048;
  while (Serial.available() && budget-- > 0) {
    char c = Serial.read();
    if (c == '\n') {
      JsonDocument doc;
      if (!overflow && !deserializeJson(doc, line) && doc["t"] == "radar" && doc["h"].is<float>() && doc["o"].is<JsonArray>()) {
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
      line = ""; overflow = false;
    } else if (line.length() < 2048 && !overflow) line += c;
    else { line = ""; overflow = true; }
  }
}

void drawRadar(uint32_t now) {
  radar.fillSprite(0x0828);
  radar.setTextColor(0xDFB6); radar.setTextSize(1);
  radar.setCursor(12, 9); radar.print("SKYLINE / CORES3 RADAR");
  const int cx = 112, cy = 115, radius = 79;
  radar.drawCircle(cx, cy, radius, 0x4BEE); radar.drawCircle(cx, cy, radius/2, 0x224B);
  radar.drawLine(cx-radius, cy, cx+radius, cy, 0x224B); radar.drawLine(cx,cy-radius,cx,cy+radius,0x224B);
  if (received && now-lastRadar < 2000) {
    float angle = heading * DEG_TO_RAD;
    for (int i=0;i<targetCount;i++) {
      float dx = targets[i][0], dz = targets[i][1];
      float right = dx*cosf(angle)-dz*sinf(angle);
      float forward = -dx*sinf(angle)-dz*cosf(angle);
      float x = right/600*radius, y = -forward/600*radius;
      if (x*x+y*y < (radius-4)*(radius-4)) radar.fillCircle(cx+int(x),cy+int(y),3,0xFECA);
    }
    radar.setCursor(212,49); radar.printf("SCORE\n\n%d",score);
    radar.setCursor(212,100); radar.printf("SPEED\n\n%d m/s",speed);
    radar.setCursor(212,151); radar.printf("ALT\n\n%d m",altitude);
    radar.setCursor(75,199); radar.print("RANGE 600m");
  } else {
    radar.setCursor(170,80); radar.print("Waiting for\ngame...");
    radar.setCursor(170,125); radar.printf("Roll %5.1f\nPitch %4.1f",roll,pitch);
  }
  radar.fillTriangle(cx,cy-9,cx-6,cy+6,cx+6,cy+6,0xEFFF);
  radar.fillRect(0,216,158,24,0x236D); radar.fillRect(162,216,158,24,0x236D);
  radar.setCursor(51,224); radar.print("BOOST"); radar.setCursor(214,224); radar.print("CENTER");
  radar.pushSprite(0,0);
}

void setup() {
  auto cfg = M5.config(); M5.begin(cfg);
  Serial.begin(115200);
  M5.Display.setRotation(1); radar.setColorDepth(16); radar.createSprite(320,240);
  line.reserve(2048); lastImu = millis();
}

void loop() {
  M5.update(); readRadar(); uint32_t now = millis();
  if (now-lastImu >= 20) {
    float dt = min((now-lastImu)/1000.0f,0.1f); lastImu = now;
    if (M5.Imu.update()) {
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
    Serial.printf("{\"t\":\"imu\",\"r\":%.2f,\"p\":%.2f,\"y\":%.2f,\"b\":%d}\n",roll,pitch,yaw,buttons);
  }
  if (now-lastDraw >= 66) {lastDraw=now;drawRadar(now);}
  delay(1);
}
