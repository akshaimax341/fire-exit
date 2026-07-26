/**
 * ESP32 Arduino sketch — FireExit telemetry every 5 seconds.
 * POST JSON to FastAPI /api/telemetry (or publish MQTT fireexit/device/{id}).
 *
 * Libraries: WiFi, HTTPClient (ESP32 Arduino core), ArduinoJson
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* API_BASE  = "http://192.168.1.10:8000";  // backend LAN IP
const char* DEVICE_ID = "DEV001";
const char* ROOM_NAME = "Office 101";
const int   FLOOR     = 1;

// Example pins — map to your sensors
const int PIN_TEMP = 34; // analog
const int PIN_GAS  = 35;
const int PIN_FLAME = 32; // digital

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FLAME, INPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\nWiFi OK");
}

float readTemperatureC() {
  // Replace with DHT22 / DS18B20 / SHT31 as needed
  int raw = analogRead(PIN_TEMP);
  return 20.0 + (raw / 4095.0) * 60.0;
}

float readGas() {
  return (float)analogRead(PIN_GAS);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  float temp = readTemperatureC();
  float gas = readGas();
  bool flame = digitalRead(PIN_FLAME) == HIGH;
  float humidity = 40.0; // DHT optional

  const char* status = "SAFE";
  if (flame || temp > 70 || gas > 2000) status = "CRITICAL";
  else if (temp > 45 || gas > 1200) status = "WARNING";

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["room"] = ROOM_NAME;
  doc["type"] = "ROOM";
  doc["floor"] = FLOOR;
  doc["temperature"] = temp;
  doc["humidity"] = humidity;
  doc["gasLevel"] = gas;
  doc["status"] = status;
  doc["battery"] = 92.0;
  doc["signal"] = WiFi.RSSI();
  doc["flame"] = flame;
  doc["timestamp"] = (long)millis();  // device uptime ms for retrieve logs

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(API_BASE) + "/api/telemetry");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  Serial.printf("POST /api/telemetry -> %d\n", code);
  Serial.println(body);
  http.end();

  delay(5000);
}
