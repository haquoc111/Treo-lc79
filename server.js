const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CẤU HÌNH =====
const MIN_SESSIONS = 4000;
const MAX_SESSIONS = 10000;
const FETCH_PER_REQUEST = 100;
const FETCH_INTERVAL = 2000;
const AUTO_SAVE_INTERVAL = 30000;

const API_URL =
  "https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=62385f65eb49fcb34c72a7d6489ad91d";

let predictionHistory = { hu: [], md5: [] };
const MAX_HISTORY = 100;

let lastProcessedPhien = {
  hu: null,
  md5: null,
};

// ===== KHO DỮ LIỆU =====
let sessionsStore = {
  hu: [],
  md5: [],
};

let learningData = {
  hu: {
    predictions: [],
    patternStats: {},
    totalPredictions: 0,
    correctPredictions: 0,
    patternWeights: {},
    lastUpdate: null,
    streakAnalysis: {
      wins: 0,
      losses: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
    },
    adaptiveThresholds: {},
    recentAccuracy: [],
  },

  md5: {
    predictions: [],
    patternStats: {},
    totalPredictions: 0,
    correctPredictions: 0,
    patternWeights: {},
    lastUpdate: null,
    streakAnalysis: {
      wins: 0,
      losses: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
    },
    adaptiveThresholds: {},
    recentAccuracy: [],
  },
};

// ===== LOAD FILE =====
function loadData() {
  try {
    if (fs.existsSync("data.json")) {
      const raw = fs.readFileSync("data.json");
      const parsed = JSON.parse(raw);

      sessionsStore = parsed.sessionsStore || sessionsStore;
      learningData = parsed.learningData || learningData;

      console.log("✅ Đã load dữ liệu cũ");
    }
  } catch (err) {
    console.log("❌ Lỗi load data:", err.message);
  }
}

// ===== SAVE FILE =====
function saveData() {
  try {
    fs.writeFileSync(
      "data.json",
      JSON.stringify(
        {
          sessionsStore,
          learningData,
        },
        null,
        2
      )
    );

    console.log("💾 Đã lưu dữ liệu");
  } catch (err) {
    console.log("❌ Lỗi save:", err.message);
  }
}

// ===== PHÂN TÍCH KẾT QUẢ =====
function getResult(total) {
  return total >= 11 ? "TÀI" : "XỈU";
}

// ===== THUẬT TOÁN =====
function analyzePrediction(type) {
  const data = sessionsStore[type];

  if (data.length < 20) {
    return {
      prediction: "ĐANG HỌC",
      confidence: 0,
    };
  }

  const recent = data.slice(-20);

  let tai = 0;
  let xiu = 0;

  recent.forEach((item) => {
    if (item.result === "TÀI") tai++;
    else xiu++;
  });

  const prediction = tai > xiu ? "XỈU" : "TÀI";

  const confidence =
    Math.abs(tai - xiu) / recent.length * 100;

  return {
    prediction,
    confidence: confidence.toFixed(2),
    tai,
    xiu,
  };
}

// ===== FETCH DATA =====
async function fetchSessions() {
  try {
    const response = await axios.get(API_URL);

    const list =
      response.data?.data ||
      response.data?.sessions ||
      [];

    if (!Array.isArray(list)) {
      console.log("❌ API không trả về mảng");
      return;
    }

    let added = 0;

    for (const item of list) {
      const phien =
        item.phien ||
        item.session ||
        item.sid ||
        item.id;

      if (!phien) continue;

      if (
        sessionsStore.md5.find(
          (x) => x.phien == phien
        )
      ) {
        continue;
      }

      const dice =
        item.dice ||
        item.xucxac ||
        item.result_dices ||
        [];

      let total = 0;

      if (Array.isArray(dice)) {
        total = dice.reduce(
          (a, b) => a + Number(b),
          0
        );
      } else {
        total =
          Number(item.total) ||
          Number(item.tong) ||
          0;
      }

      const result = getResult(total);

      const sessionData = {
        phien,
        dice,
        total,
        result,
        time: Date.now(),
      };

      sessionsStore.md5.push(sessionData);

      added++;
    }

    // Giới hạn 10000 phiên
    if (
      sessionsStore.md5.length > MAX_SESSIONS
    ) {
      sessionsStore.md5 =
        sessionsStore.md5.slice(
          -MAX_SESSIONS
        );
    }

    learningData.md5.lastUpdate =
      new Date().toISOString();

    const analysis =
      analyzePrediction("md5");

    console.log(
      `📥 +${added} phiên | Tổng: ${sessionsStore.md5.length}`
    );

    console.log(
      `🎯 Dự đoán: ${analysis.prediction} | Độ tin cậy: ${analysis.confidence}%`
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
  const analysis =
    analyzePrediction("md5");

  res.json({
    status: "running",
    totalSessions:
      sessionsStore.md5.length,
    minSessions: MIN_SESSIONS,
    maxSessions: MAX_SESSIONS,
    prediction:
      analysis.prediction,
    confidence:
      analysis.confidence,
    tai: analysis.tai,
    xiu: analysis.xiu,
    lastUpdate:
      learningData.md5.lastUpdate,
    latest:
      sessionsStore.md5[
        sessionsStore.md5.length - 1
      ] || null,
  });
});

// ===== START =====
app.listen(PORT, async () => {
  console.log(
    `🚀 Server chạy tại cổng ${PORT}`
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