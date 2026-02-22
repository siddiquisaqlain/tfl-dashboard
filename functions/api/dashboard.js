export async function onRequestGet(context) {
  const { env } = context;

  const TFL_APP_ID = env.TFL_APP_ID;
  const TFL_APP_KEY = env.TFL_APP_KEY;

  if (!TFL_APP_ID || !TFL_APP_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing TFL_APP_ID/TFL_APP_KEY env vars" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const TRAIN_STOP_ID = "910GACTONML"; // Acton Main Line
  const BUS_STOP_IN = "490006737N";    // your inbound stop id
  const BUS_STOP_OUT = "490015046S";   // your outbound stop id

  const tflParams = `app_id=${encodeURIComponent(TFL_APP_ID)}&app_key=${encodeURIComponent(TFL_APP_KEY)}`;

  const fetchJson = async (url) => {
    const r = await fetch(url, { cf: { cacheTtl: 10 } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  };

  try {
    const [statusData, trainArrivals, busInArrivals, busOutArrivals, weatherData] =
      await Promise.all([
        fetchJson(`https://api.tfl.gov.uk/Line/elizabeth/Status?${tflParams}`),
        fetchJson(`https://api.tfl.gov.uk/StopPoint/${TRAIN_STOP_ID}/Arrivals?${tflParams}`),
        fetchJson(`https://api.tfl.gov.uk/StopPoint/${BUS_STOP_IN}/Arrivals?${tflParams}`),
        fetchJson(`https://api.tfl.gov.uk/StopPoint/${BUS_STOP_OUT}/Arrivals?${tflParams}`),
        fetchJson(
          `https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=Europe%2FLondon`
        ),
      ]);

    const status =
      statusData?.[0]?.lineStatuses?.[0]?.statusSeverityDescription ?? "Unknown";

    const trainsAll = (trainArrivals || [])
      .filter((t) => t.lineId === "elizabeth")
      .sort((a, b) => a.timeToStation - b.timeToStation);

    const trains = {
      inbound: trainsAll.filter((t) => t.direction === "inbound").slice(0, 2),
      outbound: trainsAll.filter((t) => t.direction === "outbound").slice(0, 2),
    };

    const allowedBus = new Set(["266", "440","N266"]); // add N266 later
    const filterBus = (arr) =>
      (arr || [])
        .filter((b) => allowedBus.has(b.lineId))
        .sort((a, b) => a.timeToStation - b.timeToStation)
        .slice(0, 2);

    const buses = {
      inbound: filterBus(busInArrivals),
      outbound: filterBus(busOutArrivals),
    };

    const current = weatherData?.current || {};
    const hourly = weatherData?.hourly || {};
    let precipProb = null;
    if (current.time && Array.isArray(hourly.time)) {
      const idx = hourly.time.indexOf(current.time);
      precipProb =
        idx >= 0 ? hourly.precipitation_probability?.[idx] : hourly.precipitation_probability?.[0];
    }

    const weather = {
      temp: current.temperature_2m ?? null,
      feelsLike: current.apparent_temperature ?? null,
      wind: current.wind_speed_10m ?? null,
      code: current.weather_code ?? null,
      precipProb: precipProb ?? null,
    };

    return new Response(JSON.stringify({ status, trains, buses, weather }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}