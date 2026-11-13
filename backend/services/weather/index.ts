import { env } from '../../config/env';

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'FluxApp/1.0' } });
        if (!r.ok) return null;
        const d = await r.json() as any[];
        if (!d.length) return null;
        const result = d[0]!;
        return { lat: parseFloat(result.lat), lon: parseFloat(result.lon), displayName: result.display_name?.split(',')[0] ?? city };
    } catch { return null; }
}

export function wmoDescription(code: number): string {
    if (code === 0) return 'clear sky';
    if (code <= 3) return 'partly cloudy';
    if (code <= 9) return 'foggy';
    if (code <= 19) return 'drizzle';
    if (code <= 29) return 'rain';
    if (code <= 39) return 'snow';
    if (code <= 49) return 'fog';
    if (code <= 59) return 'drizzle';
    if (code <= 69) return 'rain';
    if (code <= 79) return 'snow';
    if (code <= 84) return 'rain showers';
    if (code <= 94) return 'thunderstorm';
    return 'heavy thunderstorm';
}

export interface WeatherResult {
    temperature: number; feelsLike: number; humidity: number;
    windSpeed: number; description: string; resolvedCity: string;
    source: "OpenWeatherMap" | "Open-Meteo";
}

export const OW_KEY = env.OPENWEATHER_API_KEY;

export async function fetchWeatherFromOpenWeatherMap(city: string): Promise<WeatherResult | null> {
    if (!OW_KEY) return null;
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OW_KEY}&units=metric`;
        const r = await fetch(url);
        if (!r.ok) { console.warn(`[WEATHER] OpenWeatherMap error ${r.status} for: ${city}`); return null; }
        const d = await r.json() as any;
        if (!d?.main?.temp) return null;
        return {
            temperature: Math.round(d.main.temp * 10) / 10,
            feelsLike: Math.round(d.main.feels_like * 10) / 10,
            humidity: d.main.humidity ?? 0,
            windSpeed: Math.round((d.wind?.speed ?? 0) * 3.6 * 10) / 10,
            description: d.weather?.[0]?.description ?? 'unknown',
            resolvedCity: d.name + (d.sys?.country ? `, ${d.sys.country}` : ''),
            source: "OpenWeatherMap",
        };
    } catch (e) { console.error('[WEATHER] OpenWeatherMap fetch error:', e); return null; }
}

export async function fetchWeatherFromOpenMeteo(city: string): Promise<WeatherResult | null> {
    try {
        const geo = await geocodeCity(city);
        if (!geo) { console.warn(`[WEATHER] Geocode failed for: ${city}`); return null; }
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
            `&current=temperature_2m,apparent_temperature,relativehumidity_2m,windspeed_10m,weathercode&timezone=auto`;
        const r = await fetch(url);
        if (!r.ok) { console.warn(`[WEATHER] Open-Meteo error ${r.status}`); return null; }
        const d = await r.json() as any;
        const c = d.current;
        if (c?.temperature_2m === undefined) return null;
        return {
            temperature: Math.round(c.temperature_2m * 10) / 10,
            feelsLike: Math.round(c.apparent_temperature * 10) / 10,
            humidity: c.relativehumidity_2m ?? 0,
            windSpeed: Math.round(c.windspeed_10m * 10) / 10,
            description: wmoDescription(c.weathercode ?? 0),
            resolvedCity: geo.displayName,
            source: "Open-Meteo",
        };
    } catch (e) { console.error('[WEATHER] Open-Meteo fetch error:', e); return null; }
}

export async function fetchWeatherFromAPI(city: string): Promise<WeatherResult | null> {
    const owm = await fetchWeatherFromOpenWeatherMap(city);
    if (owm) return owm;
    console.info('[WEATHER] Falling back to Open-Meteo for:', city);
    return fetchWeatherFromOpenMeteo(city);
}

export function extractCityFromQuery(query: string): string | null {
    const q = query.slice(0, 200);
    const T = "temp[a-z]{1,5}tur[ae]?";
    const W = `(?:weather|${T}|forecast|rain|sunny|cloudy|wind(?:y)?)`;
    const WF = `(?:weather|${T}|forecast)`;
    const patterns = [
        new RegExp(`${W}\\s+(?:in|for|at|of)\\s+((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))`, 'i'),
        new RegExp(`current\\s+(?:weather|${T})\\s+(?:in|for|at)?\\s*((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))`, 'i'),
        new RegExp(`(?:in|at|for)\\s+((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))\\s+${WF}`, 'i'),
        new RegExp(`${WF}\\s+((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))`, 'i'),
        new RegExp(`((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))\\s+${WF}`, 'i'),
    ];
    const stopWords = /^(the|current|today|now|outside|here|local|right|what|is|how)$/i;
    for (const p of patterns) {
        const m = q.match(p);
        if (m?.[1]) {
            const city = m[1].trim();
            const firstWord = city.split(' ')[0] || "";
            if (firstWord && !stopWords.test(firstWord)) return city;
        }
    }
    return null;
}

