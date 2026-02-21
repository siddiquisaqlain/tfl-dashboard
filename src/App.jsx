import { useEffect, useState } from "react";
import axios from "axios";

function formatMinutes(seconds) {
  const mins = Math.round(seconds / 60);
  return mins <= 0 ? "Due" : `${mins} min`;
}
function minutesFromSeconds(seconds) {
  return Math.round(seconds / 60);
}

function etaStyle(seconds, mode) {
  const mins = minutesFromSeconds(seconds);

  // base by mode (train vs bus)
  const base = mode === "bus" ? styles.timePillBus : styles.timePillTrain;

  // pulse only when Due or <=2 min
  const pulse = mins <= 2 ? styles.timePulse : null;

  if (mins <= 0) {
    return { ...base, ...(mode === "bus" ? styles.timeDueBus : styles.timeDueTrain), ...(pulse || {}) };
  }
  if (mins <= 2) {
    return { ...base, ...(mode === "bus" ? styles.timeSoonBus : styles.timeSoonTrain), ...(pulse || {}) };
  }
  return base;
}
/*function timeStyle(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins <= 0) return { ...styles.timePill, ...styles.timeDue };
  if (mins <= 2) return { ...styles.timePill, ...styles.timeSoon };
  return styles.timePill;
}*/
function weatherLabel(code) {
  // Very simple mapping (you can expand later)
  if (code === 0) return "Clear";
  if ([1,2,3].includes(code)) return "Partly cloudy";
  if ([45,48].includes(code)) return "Fog";
  if ([51,53,55,56,57].includes(code)) return "Drizzle";
  if ([61,63,65,66,67].includes(code)) return "Rain";
  if ([71,73,75,77].includes(code)) return "Snow";
  if ([80,81,82].includes(code)) return "Showers";
  if ([95,96,99].includes(code)) return "Thunder";
  return "Weather";
}

function TrainSection({ title, trains }) {
  return (
    <div style={{ marginBottom: "50px" }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {trains.map((t, i) => (
        <div key={i} style={styles.row}>
          <div style={styles.destination}>
            {t.destinationName}
          </div>
          <div style={etaStyle(t.timeToStation, "train")}>
            {formatMinutes(t.timeToStation)}
          </div>
        </div>
      ))}
    </div>
  );
}

function BusSection({ title, buses }) {
  return (
    <div>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {buses.map((b, i) => (
        <div key={i} style={styles.row}>
          <div style={styles.busRoute}>{b.lineId}</div>
          <div style={styles.destination}>{b.destinationName}</div>
          <div style={etaStyle(b.timeToStation, "bus")}>
            {formatMinutes(b.timeToStation)}
          </div>
        </div>
      ))}
    </div>
  );
}
const pulseCss = `
@keyframes softPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(0,0,0,0); }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); box-shadow: 0 0 0 rgba(0,0,0,0); }
}
`;
function App() {
  <style>{pulseCss}</style>
  const [data, setData] = useState(null);
  const [clock, setClock] = useState(new Date());

  const fetchData = async () => {
  // Put these in Cloudflare env vars later (recommended)
  const TFL_APP_ID = import.meta.env.VITE_TFL_APP_ID;
  const TFL_APP_KEY = import.meta.env.VITE_TFL_APP_KEY;

  const TRAIN_STOP_ID = "910GACTONML";     // Acton Main Line
  const BUS_STOP_IN = "490006737N";        // Faraday Road (dir 1)
  const BUS_STOP_OUT = "490015046S";       // Faraday Road (dir 2)

  // TfL: line status + arrivals
  const [statusRes, trainRes, busInRes, busOutRes, weatherRes] = await Promise.all([
    axios.get("https://api.tfl.gov.uk/Line/elizabeth/Status", {
      params: { app_id: TFL_APP_ID, app_key: TFL_APP_KEY },
    }),
    axios.get(`https://api.tfl.gov.uk/StopPoint/${TRAIN_STOP_ID}/Arrivals`, {
      params: { app_id: TFL_APP_ID, app_key: TFL_APP_KEY },
    }),
    axios.get(`https://api.tfl.gov.uk/StopPoint/${BUS_STOP_IN}/Arrivals`, {
      params: { app_id: TFL_APP_ID, app_key: TFL_APP_KEY },
    }),
    axios.get(`https://api.tfl.gov.uk/StopPoint/${BUS_STOP_OUT}/Arrivals`, {
      params: { app_id: TFL_APP_ID, app_key: TFL_APP_KEY },
    }),
    axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: 51.5074,
        longitude: -0.1278,
        current: "temperature_2m,apparent_temperature,wind_speed_10m,weather_code",
        hourly: "precipitation_probability",
        forecast_days: 1,
        timezone: "Europe/London",
      },
    }),
  ]);

  const status =
    statusRes.data?.[0]?.lineStatuses?.[0]?.statusSeverityDescription ?? "Status unavailable";

  const trainsAll = (trainRes.data || [])
    .filter((t) => t.lineId === "elizabeth")
    .sort((a, b) => a.timeToStation - b.timeToStation);

  const trains = {
    inbound: trainsAll.filter((t) => t.direction === "inbound").slice(0, 2),
    outbound: trainsAll.filter((t) => t.direction === "outbound").slice(0, 2),
  };

  const filterBus = (arr) =>
    (arr || [])
      .filter((b) => b.lineId === "266" || b.lineId === "440")
      .sort((a, b) => a.timeToStation - b.timeToStation)
      .slice(0, 2);

  const buses = {
    inbound: filterBus(busInRes.data),
    outbound: filterBus(busOutRes.data),
  };

  // Weather parsing (same idea as before)
  const current = weatherRes.data?.current;
  const hourly = weatherRes.data?.hourly;

  let precipProb = null;
  if (current?.time && hourly?.time?.length && hourly?.precipitation_probability?.length) {
    const idx = hourly.time.indexOf(current.time);
    precipProb = idx >= 0 ? hourly.precipitation_probability[idx] : hourly.precipitation_probability[0];
  }

  const weather = {
    temp: current?.temperature_2m ?? null,
    feelsLike: current?.apparent_temperature ?? null,
    wind: current?.wind_speed_10m ?? null,
    code: current?.weather_code ?? null,
    precipProb,
  };

  setData({ status, trains, buses, weather });
};

  useEffect(() => {
    fetchData();
    const refresh = setInterval(fetchData, 30000);
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(timer);
    };
  }, []);

  if (!data) return <div>Loading...</div>;

  const statusColour =
    data.status === "Good Service" ? "#00d26a" : "#ff3b3b";

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
  <div>
    <div style={styles.clock}>{clock.toLocaleTimeString()}</div>
    <div style={{ ...styles.status, color: statusColour }}>
      Elizabeth Line — {data.status}
    </div>
  </div>

  <div style={styles.weatherBox}>
    <div style={styles.weatherTemp}>
      {Math.round(data.weather.temp)}°C
    </div>
    <div style={styles.weatherMeta}>
      {weatherLabel(data.weather.code)} · Feels {Math.round(data.weather.feelsLike)}°C
    </div>
    <div style={styles.weatherMeta}>
      Wind {Math.round(data.weather.wind)} km/h
      {data.weather.precipProb != null ? ` · Rain ${data.weather.precipProb}%` : ""}
    </div>
  </div>
  </div>

      <div style={styles.grid}>
        <div>
          <TrainSection
            title="To Central London"
            trains={data.trains.inbound}
          />
          <BusSection
            title="Faraday Rd (Inbound)"
            buses={data.buses.inbound}
          />
        </div>

        <div>
          <TrainSection
            title="To Heathrow / Reading"
            trains={data.trains.outbound}
          />
          <BusSection
            title="Faraday Rd (Outbound)"
            buses={data.buses.outbound}
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  headerRow: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "50px",
},

weatherBox: {
  textAlign: "right",
  minWidth: "340px",
},

weatherTemp: {
  fontSize: "52px",
  fontWeight: "bold",
  lineHeight: 1.0,
},

weatherMeta: {
  fontSize: "22px",
  color: "#cfcfcf",
  marginTop: "8px",
},
  container: {
    backgroundColor: "#000",
    color: "#fff",
    height: "100vh",
    padding: "60px",
    fontFamily: "Arial, sans-serif",
  },

  header: {
    marginBottom: "50px",
  },

  clock: {
    fontSize: "56px",
    fontWeight: "bold",
  },

  status: {
    fontSize: "32px",
    marginTop: "10px",
  },

  grid: {
    display: "flex",
    justifyContent: "space-between",
    gap: "80px",  // 👈 MORE DISTANCE BETWEEN COLUMNS
  },

  sectionTitle: {
    fontSize: "30px",
    marginBottom: "25px",
    borderBottom: "2px solid #333",
    paddingBottom: "12px",
  },

  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "18px",
    fontSize: "32px",
  },

  destination: {
    flex: 1,
    marginRight: "20px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",  // 👈 PREVENTS TEXT COLLISION
  },

  timePulse: {
  animation: "softPulse 1.6s ease-in-out infinite",
  transformOrigin: "right center",
},

// TRAIN: purple-tinted pill
timePillTrain: {
  minWidth: "120px",
  textAlign: "right",
  fontWeight: "900",
  padding: "6px 14px",
  borderRadius: "10px",
  letterSpacing: "0.5px",
  backgroundColor: "rgba(142, 68, 173, 0.18)", // purple tint
  border: "1px solid rgba(142, 68, 173, 0.45)",
  color: "#ffffff",
},

timeSoonTrain: {
  backgroundColor: "rgba(142, 68, 173, 0.45)",
  border: "1px solid rgba(142, 68, 173, 0.9)",
  boxShadow: "0 0 16px rgba(142, 68, 173, 0.35)",
},

timeDueTrain: {
  backgroundColor: "rgba(142, 68, 173, 0.9)",
  border: "1px solid rgba(142, 68, 173, 1)",
  color: "#000000",
  boxShadow: "0 0 20px rgba(142, 68, 173, 0.55)",
},

// BUS: red-tinted pill
timePillBus: {
  minWidth: "120px",
  textAlign: "right",
  fontWeight: "900",
  padding: "6px 14px",
  borderRadius: "10px",
  letterSpacing: "0.5px",
  backgroundColor: "rgba(212, 0, 0, 0.16)", // red tint
  border: "1px solid rgba(212, 0, 0, 0.45)",
  color: "#ffffff",
},

timeSoonBus: {
  backgroundColor: "rgba(212, 0, 0, 0.45)",
  border: "1px solid rgba(212, 0, 0, 0.9)",
  boxShadow: "0 0 16px rgba(212, 0, 0, 0.35)",
},

timeDueBus: {
  backgroundColor: "rgba(212, 0, 0, 0.95)",
  border: "1px solid rgba(212, 0, 0, 1)",
  color: "#000000",
  boxShadow: "0 0 20px rgba(212, 0, 0, 0.55)",
},

// 1–2 min: bright + glow
timeSoon: {
  backgroundColor: "#ffffff",
  color: "#000000",
  border: "1px solid #ffffff",
  boxShadow: "0 0 18px rgba(255,255,255,0.25)",
},

// Due / 0 min: even stronger
timeDue: {
  backgroundColor: "#00d26a",
  color: "#000000",
  border: "1px solid #00d26a",
  boxShadow: "0 0 22px rgba(0,210,106,0.35)",
},

  busRoute: {
    backgroundColor: "#d40000",
    padding: "6px 12px",
    borderRadius: "6px",
    marginRight: "15px",
    fontWeight: "bold",
  },
};

export default App;