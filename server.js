const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const MAX_SESSIONS = 10000;
const FETCH_INTERVAL = 2000;
const AUTO_SAVE_INTERVAL = 30000;

// ===== API =====
const API_URL =
  "https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=d303d4ad1816299ff47d24cdaf262a68";

const TOKEN =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2RlIjowLCJtZXNzYWdlIjoiU3VjY2VzcyIsIm5pY2tOYW1lIjoianNqZGpkamp4IiwiYWNjZXNzVG9rZW4iOiJkMzAzZDRhZDE4MTYyOTlmZjQ3ZDI0Y2RhZjI2MmE2OCIsImlzTG9naW4iOnRydWUsIm1vbmV5Ijo1OSwiaWQiOiI3NzI3MzA1IiwidXNlcm5hbWUiOiJodXBsYW5oa29rayIsImlhdCI6MTc3OTUyOTI4NSwiZXhwIjoxNzc5NTU4MDg1fQ.nqKCFZ7uea37wp-xR1MLSvq-gm_klNQD-HpNVGRGpig";

// ===== STORE =====
let sessionsStore = [];

// ===== LOAD =====
function loadData() {
  try {
    if (fs.existsSync("data.json")) {
      const raw = fs.readFileSync("data.json");
      const parsed = JSON.parse(raw);

      sessionsStore = parsed.sessionsStore || [];

      console.log(
        `✅ Loaded ${sessionsStore.length} phiên`
      );
    }
  } catch (err) {
    console.log("❌ Load lỗi:", err.message);
  }
}

// ===== SAVE =====
function saveData() {
  try {
    fs.writeFileSync(
      "data.json",
      JSON.stringify(
        {
          sessionsStore,
        },
        null,
        2
      )
    );

    console.log("💾 Saved");
  } catch (err) {
    console.log("❌ Save lỗi:", err.message);
  }
}

// ===== DỰ ĐOÁN =====
function predict() {
  if (sessionsStore.length < 20) {
    return {
      prediction: "ĐANG HỌC",
      confidence: 0,
    };
  }

  const recent = sessionsStore.slice(-20);

  let tai = 0;
  let xiu = 0;

  recent.forEach((i) => {
    if (i.result === "TAI") tai++;
    else xiu++;
  });

  const prediction =
    tai > xiu ? "XIU" : "TAI";

  const confidence = (
    (Math.abs(tai - xiu) / 20) *
    100
  ).toFixed(2);

  return {
    prediction,
    confidence,
    tai,
    xiu,
  };
}

// ===== FETCH =====
async function fetchSessions() {
  try {
    const response = await axios.get(API_URL, {
      headers: {
        "Content-Type":
          "application/json",
        Authorization: TOKEN,
      },
    });

    const list = response.data?.list || [];

    if (!Array.isArray(list)) {
      console.log("❌ API lỗi");
      return;
    }

    let added = 0;

    for (const item of list) {
      const exists = sessionsStore.find(
        (x) => x.id === item.id
      );

      if (exists) continue;

      sessionsStore.push({
        id: item.id,
        phien: item.id,
        result: item.resultTruyenThong,
        dices: item.dices,
        point: item.point,
        _id: item._id,
      });

      added++;
    }

    // sort theo phiên mới nhất
    sessionsStore.sort(
      (a, b) => b.id - a.id
    );

    // giữ tối đa 10000 phiên
    if (
      sessionsStore.length > MAX_SESSIONS
    ) {
      sessionsStore =
        sessionsStore.slice(
          0,
          MAX_SESSIONS
        );
    }

    console.log(
      `📥 +${added} phiên | Tổng ${sessionsStore.length}`
    );
  } catch (err) {
    console.log(
      "❌ Fetch lỗi:",
      err.message
    );
  }
}

// ===== API =====
app.get("/", (req, res) => {
  const p = predict();

  res.json({
    status: "running",

    totalSessions:
      sessionsStore.length,

    prediction:
      p.prediction,

    confidence:
      p.confidence,

    tai: p.tai || 0,
    xiu: p.xiu || 0,

    latest:
      sessionsStore[0] || null,

    // HIỆN TOÀN BỘ LỊCH SỬ
    history: sessionsStore,
  });
});

// ===== START =====
app.listen(PORT, async () => {
  console.log(
    `🚀 Server chạy cổng ${PORT}`
  );

  loadData();

  await fetchSessions();

  setInterval(
    fetchSessions,
    FETCH_INTERVAL
  );

  setInterval(
    saveData,
    AUTO_SAVE_INTERVAL
  );
});