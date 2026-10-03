
import { useState } from "react";
import "./style.css";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// OpenWeatherMap weather icon asset
function getIconUrl(icon) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

function getWeatherDescription(code) {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather unavailable";
}

function getWeatherIcon(code, isDay = true) {
  if (code === 0) return isDay ? "01d" : "01n";
  if (code === 1) return isDay ? "02d" : "02n";
  if (code === 2) return isDay ? "03d" : "03n";
  if (code === 3) return "04d";
  if ([45, 48].includes(code)) return "50d";
  if ([51, 53, 55, 56, 57, 80, 81, 82].includes(code)) return "09d";
  if ([61, 63, 65, 66, 67].includes(code)) return "10d";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "13d";
  if ([95, 96, 99].includes(code)) return "11d";
  return "03d";
}

// Group forecast data by day
function groupForecasts(list) {
  const groups = {};

  list.forEach((item) => {
    const date = new Date(item.dt * 1000)
      .toISOString()
      .split("T")[0];

    if (!groups[date]) {
      groups[date] = [];
    }

    groups[date].push(item);
  });

  return Object.entries(groups)
    .slice(0, 5)
    .map(([date, items]) => {
      // Select the middle forecast of the day
      const middleItem = items[Math.floor(items.length / 2)];

      return {
        date,
        item: middleItem,
      };
    });
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.reason || "Weather service is unavailable.");
  }

  return data;
}

async function fetchWeatherData(city) {
  const locations = await fetchJson(
    `${GEOCODING_URL}?name=${encodeURIComponent(city)}&count=10&language=en&format=json`
  );
  const candidates = locations.results ?? [];
  const location =
    candidates.find(
      (candidate) => candidate.name.toLowerCase() === city.toLowerCase()
    ) ?? candidates[0];

  if (!location) {
    throw new Error(`No location found for "${city}".`);
  }

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,weather_code,is_day",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean",
    forecast_days: "5",
    timezone: "auto",
    wind_speed_unit: "ms",
  });
  const data = await fetchJson(`${WEATHER_URL}?${params}`);
  const current = data.current;
  const currentDescription = getWeatherDescription(current.weather_code);

  return {
    weather: {
      name: location.name,
      sys: { country: location.country_code },
      main: {
        temp: current.temperature_2m,
        feels_like: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        pressure: current.surface_pressure,
      },
      wind: { speed: current.wind_speed_10m },
      coord: { lat: location.latitude, lon: location.longitude },
      weather: [{
        description: currentDescription,
        icon: getWeatherIcon(current.weather_code, current.is_day),
      }],
    },
    forecast: {
      city: { name: location.name },
      list: data.daily.time.map((date, index) => {
        const code = data.daily.weather_code[index];

        return {
          dt: Date.parse(`${date}T12:00:00Z`) / 1000,
          main: {
            temp:
              (data.daily.temperature_2m_max[index] +
                data.daily.temperature_2m_min[index]) / 2,
            humidity: data.daily.relative_humidity_2m_mean[index],
          },
          weather: [{
            description: getWeatherDescription(code),
            icon: getWeatherIcon(code),
          }],
        };
      }),
    },
  };
}

function App() {
  const [cityInput, setCityInput] = useState("");

  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // Used for fallback
  const [lastSuccessfulCity, setLastSuccessfulCity] = useState("");

  const [usingFallback, setUsingFallback] = useState(false);

  // Search weather
  async function searchWeather(event) {
    event.preventDefault();

    const city = cityInput.trim();

    // Empty input validation
    if (!city) {
      setError("Please enter a city name.");
      return;
    }

    setLoading(true);
    setError("");
    setUsingFallback(false);

    try {
      const result = await fetchWeatherData(city);

      // Update UI dynamically
      setWeather(result.weather);
      setForecast(result.forecast);

      // Save last successful city
      setLastSuccessfulCity(result.weather.name);

      setError("");
    } catch (err) {
      console.error("Weather error:", err);

      /*
        FALLBACK HANDLING

        If we already have weather data,
        keep showing it instead of clearing the screen.
      */

      if (weather && lastSuccessfulCity) {
        setUsingFallback(true);

        setError(
          `Could not update "${city}". Showing the last successful result for "${lastSuccessfulCity}".`
        );
      } else {
        setWeather(null);
        setForecast(null);

        setError(
          err.message || "Unable to fetch weather data."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // Put example city in search box
  function useExampleCity() {
    setCityInput("Delhi");
  }

  // Prepare forecast
  const forecastDays =
    forecast?.list ? groupForecasts(forecast.list) : [];

  return (
    <div className="app">

      {/* ================= HEADER ================= */}

      <header className="hero">

        <div>
          <p className="eyebrow">
            API-DRIVEN ENGINEERING PROJECT
          </p>

          <h1>
            Weather Forecast
          </h1>

          <p className="subtitle">
            Live conditions and a five-day forecast, powered by Open-Meteo.
          </p>
        </div>

      </header>


      <main className="container">

        {/* ================= SEARCH ================= */}

        <section className="search-card">

          <form
            onSubmit={searchWeather}
            className="search-form"
          >

            <label htmlFor="city">
              Search City
            </label>

            <div className="search-row">

              <input
                id="city"
                type="text"
                value={cityInput}
                onChange={(event) =>
                  setCityInput(event.target.value)
                }
                placeholder="Enter city name..."
                autoComplete="off"
              />

              <button
                type="submit"
                disabled={loading}
              >
                {loading ? "Loading..." : "Search"}
              </button>

            </div>

            <button
              type="button"
              className="example-button"
              onClick={useExampleCity}
            >
              Try Delhi
            </button>

          </form>

        </section>


        {/* ================= ERROR ================= */}

        {error && (

          <div
            className={`message ${
              usingFallback ? "warning" : "error"
            }`}
          >
            {error}
          </div>

        )}


        {/* ================= CURRENT WEATHER ================= */}

        {weather && (

          <>

            <section className="weather-card">

              <div>

                <p className="location">

                  {weather.name}

                  {weather.sys?.country &&
                    `, ${weather.sys.country}`}

                </p>

                <h2>
                  {Math.round(weather.main.temp)}°C
                </h2>

                <p className="description">

                  {weather.weather?.[0]?.description}

                </p>

                <p className="feels">

                  Feels like{" "}

                  {Math.round(
                    weather.main.feels_like
                  )}

                  °C

                </p>

              </div>


              {/* Weather icon */}

              {weather.weather?.[0]?.icon && (

                <img
                  className="weather-icon"
                  src={getIconUrl(
                    weather.weather[0].icon
                  )}
                  alt={
                    weather.weather[0].description
                  }
                />

              )}

            </section>


            {/* ================= DETAILS ================= */}

            <section className="details-grid">

              <div className="detail">

                <span>
                  Humidity
                </span>

                <strong>
                  {weather.main.humidity}%
                </strong>

              </div>


              <div className="detail">

                <span>
                  Wind Speed
                </span>

                <strong>
                  {weather.wind.speed} m/s
                </strong>

              </div>


              <div className="detail">

                <span>
                  Pressure
                </span>

                <strong>
                  {weather.main.pressure} hPa
                </strong>

              </div>


              <div className="detail">

                <span>
                  Visibility
                </span>

                <strong>

                  {weather.visibility
                    ? `${(
                        weather.visibility / 1000
                      ).toFixed(1)} km`
                    : "N/A"}

                </strong>

              </div>


              <div className="detail">

                <span>
                  Latitude
                </span>

                <strong>
                  {weather.coord?.lat ?? "N/A"}
                </strong>

              </div>


              <div className="detail">

                <span>
                  Longitude
                </span>

                <strong>
                  {weather.coord?.lon ?? "N/A"}
                </strong>

              </div>

            </section>

          </>

        )}


        {/* ================= FORECAST ================= */}

        {forecastDays.length > 0 && (

          <section className="forecast-section">

            <div className="section-heading">

              <div>

                <p className="eyebrow">
                  FORECAST
                </p>

                <h2>
                  5-Day Forecast
                </h2>

              </div>

              <span className="source">

                {forecast.city?.name}

              </span>

            </div>


            <div className="forecast-grid">

              {forecastDays.map(
                ({ date, item }) => (

                  <article
                    className="forecast-card"
                    key={date}
                  >

                    <h3>

                      {new Date(
                        `${date}T12:00:00`
                      ).toLocaleDateString(
                        undefined,
                        {
                          weekday: "short",
                        }
                      )}

                    </h3>


                    <p className="forecast-date">
                      {date}
                    </p>


                    {item.weather?.[0]?.icon && (

                      <img
                        src={getIconUrl(
                          item.weather[0].icon
                        )}
                        alt={
                          item.weather[0]
                            .description
                        }
                      />

                    )}


                    <strong>

                      {Math.round(
                        item.main.temp
                      )}

                      °C

                    </strong>


                    <p>

                      {item.weather?.[0]
                        ?.description}

                    </p>


                    <small>

                      Humidity:{" "}
                      {item.main.humidity}%

                    </small>

                  </article>

                )
              )}

            </div>

          </section>

        )}


        {/* ================= EMPTY STATE ================= */}

        {!weather &&
          !loading &&
          !error && (

            <section className="empty-state">

              <div className="empty-icon">
                ☁️
              </div>

              <h2>
                Search for a City
              </h2>

              <p>
                Enter a city name above to see
                current weather and a 5-day forecast.
              </p>

            </section>

          )}

      </main>


      {/* ================= FOOTER ================= */}

      <footer>

        <p>
          Weather and location data provided by Open-Meteo.
        </p>

      </footer>

    </div>
  );
}

export default App;
