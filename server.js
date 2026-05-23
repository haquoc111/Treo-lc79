const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const MAX_SESSIONS = 10000;
const FETCH_INTERVAL = 2000;
const AUTO_SAVE_INTERVAL = 30000;

const API_URL =
  "https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=62385f65eb49fcb34c72a7d6489ad91d";

// ===== STORE =====
let sessionsStore = [];

function getTaiXiu(total) {
  return total >= 11 ? "TÀI" : "XỈU";
}

// ===== LOAD =====
function loadData() {
  try {
    if (fs.existsSync("data.json")) {
      const raw = fs.readFileSync("data.json");
      const parsed = JSON.parse(raw);

      sessionsStore = parsed.sessionsStore || [];

      console.log(
        `✅ Load ${sessionsStore.length} phiên`
      );
    }
  } catch (e) {
    console.log("❌ Load lỗi:", e.message);
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
  } catch (e) {
    console.log("❌ Save lỗi:", e.message);
  }
}

// ===== THUẬT TOÁN =====
function predict() {
  if (sessionsStore.length < 10) {
    return {
      prediction: "ĐANG HỌC",
      confidence: 0,
    };
  }

  const recent = sessionsStore.slice(-20);

  let tai = 0;
  let xiu = 0;

  recent.forEach((i) => {
    if (i.result === "TÀI") tai++;
    else xiu++;
  });

  const prediction =
    tai > xiu ? "XỈU" : "TÀI";

  const confidence =
    (
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
    const response = await axios.get(API_URL);

    const data = response.data;

    // API tele68 trả ở đây
    const list =
      data?.data?.sessions ||
      data?.data ||
      [];

    if (!Array.isArray(list)) {
      console.log("❌ Không có mảng sessions");
      return;
    }

    let added = 0;

    for (const item of list) {
      const phien =
        item.sid ||
        item.session ||
        item.phien;

      if (!phien) continue;

      // tránh trùng
      const exists = sessionsStore.find(
        (x) => x.phien == phien
      );

      if (exists) continue;

      // xúc xắc
      const dice = item.dice || [];

      let total = 0;

      if (Array.isArray(dice)) {
        total = dice.reduce(
          (a, b) => a + Number(b),
          0
        );
      }

      const result = getTaiXiu(total);

      sessionsStore.push({
        phien,
        dice,
        total,
        result,
        raw: item,
        time: Date.now(),
      });

      added++;
    }

    // sắp xếp phiên
    sessionsStore.sort(
      (a, b) => Number(a.phien) - Number(b.phien)
    );

    // giới hạn 10000 phiên
    if (
      sessionsStore.length > MAX_SESSIONS
    ) {
      sessionsStore =
        sessionsStore.slice(
          -MAX_SESSIONS
        );
    }

    const p = predict();

    console.log(
      `📥 +${added} | Tổng ${sessionsStore.length}`
    );

    console.log(
      `🎯 ${p.prediction} (${p.confidence}%)`
    );
  } catch (e) {
    console.log(
      "❌ Fetch lỗi:",
      e.message
    );
  }
}

// ===== API =====
app.get("/", (req, res) => {
  const p = predict();

  const latest =
    sessionsStore[
      sessionsStore.length - 1
    ] || null;

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

    latest,

    history: sessionsStore
      .slice(-50)
      .reverse(),
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