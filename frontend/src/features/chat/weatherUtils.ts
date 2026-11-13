export function weatherGradient(desc: string): string {
  const l = desc.toLowerCase();
  if (l.includes("clear") || l.includes("sunny")) return "from-amber-500/20 via-orange-500/10 to-transparent";
  if (l.includes("cloud") || l.includes("overcast")) return "from-slate-500/20 via-zinc-500/10 to-transparent";
  if (l.includes("rain") || l.includes("drizzle") || l.includes("shower")) return "from-blue-500/20 via-indigo-500/10 to-transparent";
  if (l.includes("thunder") || l.includes("storm")) return "from-violet-600/20 via-purple-600/10 to-transparent";
  if (l.includes("snow") || l.includes("blizzard") || l.includes("ice")) return "from-cyan-400/20 via-blue-400/10 to-transparent";
  if (l.includes("fog") || l.includes("mist") || l.includes("haze")) return "from-stone-500/20 via-neutral-500/10 to-transparent";
  return "from-[var(--accent)]/15 via-transparent to-transparent";
}

export function weatherGradientAnimate(desc: string): string {
  const l = desc.toLowerCase();
  if (l.includes("clear") || l.includes("sunny")) return "animate-sunny-gradient";
  if (l.includes("cloud") || l.includes("overcast")) return "animate-cloud-gradient";
  if (l.includes("rain") || l.includes("drizzle") || l.includes("shower")) return "animate-rain-gradient";
  if (l.includes("thunder") || l.includes("storm")) return "animate-storm-gradient";
  if (l.includes("snow") || l.includes("blizzard") || l.includes("ice")) return "animate-snow-gradient";
  if (l.includes("fog") || l.includes("mist") || l.includes("haze")) return "animate-fog-gradient";
  return "";
}

export function weatherEmoji(desc: string): string {
  const l = desc.toLowerCase();
  if (l.includes("clear")) return "☀️";
  if (l.includes("few clouds") || l.includes("scattered clouds")) return "🌤";
  if (l.includes("cloud") || l.includes("overcast")) return "☁️";
  if (l.includes("rain") || l.includes("drizzle") || l.includes("shower")) return "🌧";
  if (l.includes("thunder")) return "⛈";
  if (l.includes("snow") || l.includes("blizzard")) return "🌨";
  if (l.includes("fog") || l.includes("mist") || l.includes("haze")) return "🌫";
  return "🌤";
}

export function conditionLabel(desc: string): string {
  const l = desc.toLowerCase();
  if (l.includes("clear")) return "Clear Sky";
  if (l.includes("few clouds")) return "Few Clouds";
  if (l.includes("scattered clouds")) return "Scattered Clouds";
  if (l.includes("broken clouds") || l.includes("overcast")) return "Overcast";
  if (l.includes("light rain")) return "Light Rain";
  if (l.includes("moderate rain")) return "Rain";
  if (l.includes("heavy rain")) return "Heavy Rain";
  if (l.includes("drizzle")) return "Drizzle";
  if (l.includes("thunder")) return "Thunderstorm";
  if (l.includes("snow")) return "Snow";
  if (l.includes("blizzard")) return "Blizzard";
  if (l.includes("fog")) return "Fog";
  if (l.includes("mist")) return "Mist";
  if (l.includes("haze")) return "Haze";
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}