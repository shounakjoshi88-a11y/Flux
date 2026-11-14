/**
 * Weather tool.
 *
 * Only fires when the user's own message is about weather, and only once per
 * turn. Both guards exist because the model calls tools speculatively.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { fetchWeatherFromAPI } from '../../services/weather';
import { sanitizeLocation } from '../../http/util/sanitize';
import { shouldBlockFurtherTools } from './context';
import type { ToolContext } from './context';

export function createWeatherTools(ctx: ToolContext) {
    const { writer, state, userQuery } = ctx;

    return {
        get_weather: (tool as any)({
            description:
                'Fetch real-time weather data for a specific city. ONLY call when the user explicitly asks about weather, temperature, or forecast for a location. NEVER call this when the user is asking about code, architecture, routing, classifiers, prototypes, or any technical/system topic - even if the word "weather" appears in their message as part of an example or quote. If in doubt, do NOT call this tool.',
            inputSchema: z.object({
                city: z.string().describe('The city name to get weather for'),
            }),
            execute: async ({ city }: any) => {
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call get_weather or any other tool.';
                }
                const safeCity = typeof city === 'string' ? city.trim() : '';
                if (!safeCity) {
                    console.warn('[TOOL] get_weather called with no city');
                    return 'No city was provided for weather lookup.';
                }
                // Hallucination guard: only call weather if the user actually asked about weather.
                if (typeof userQuery === 'string') {
                    const hasWeatherIntent =
                        /\b(weather|temperature|forecast|humidity|rain|sunny|cloudy|wind|rainfall|climate|degrees)\b/i.test(userQuery);
                    const hasSystemWords =
                        /\b(architecture|prototype|router|codebase|classify|tier|regex|embedding|classifier|pipeline|workflow|orchestrat|diagram|query.*router|route.*model)\b/i.test(userQuery);
                    if (!hasWeatherIntent || hasSystemWords) {
                        console.warn(
                            `[TOOL] get_weather skipped - ${!hasWeatherIntent ? 'no weather intent' : 'query has system/architecture context'} (called with city: ${safeCity})`,
                        );
                        return `__SEARCH_SKIPPED__ Answer naturally without searching. The user's request has nothing to do with weather.`;
                    }
                }
                if (state.weatherDone) {
                    return `Weather already fetched for this conversation turn. Answer the user using that data.`;
                }
                writer.status('weather', `Fetching weather for ${safeCity}`, undefined, state.thoughtProcess);
                const result = await fetchWeatherFromAPI(sanitizeLocation(safeCity));
                if (!result) {
                    writer.status('weather_error', `Weather unavailable for ${safeCity}.`, undefined, state.thoughtProcess);
                    return `Could not fetch weather for ${safeCity}.`;
                }
                const tempC = Math.round(result.temperature);
                const feelsC = Math.round(result.feelsLike);
                const tempF = Math.round((result.temperature * 9) / 5 + 32);
                const feelsFRound = Math.round((result.feelsLike * 9) / 5 + 32);
                writer.status(
                    'weather_success',
                    `${result.resolvedCity}: ${tempC}°C (${tempF}°F), feels like ${feelsC}°C (${feelsFRound}°F) - ${result.description}`,
                    {
                        source: result.source,
                        city: result.resolvedCity,
                        temperature: tempC,
                        feelsLike: feelsC,
                        humidity: result.humidity,
                        windSpeed: result.windSpeed,
                        description: result.description,
                        tempF,
                        feelsF: feelsFRound,
                    },
                    state.thoughtProcess,
                );
                state.weatherDone = true;
                return `${result.resolvedCity} is ${tempC}°C (feels like ${feelsC}°C) with ${result.description}. Humidity ${result.humidity}%, wind ${result.windSpeed} km/h.`;
            },
        }),
    };
}
