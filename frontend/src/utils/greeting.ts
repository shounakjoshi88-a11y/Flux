export function getGreeting(user: { user_metadata?: { first_name?: string }; email?: string } | null): string {
  const hr = new Date().getHours();
  const firstName = user?.user_metadata?.first_name || user?.email?.split("@")[0] || "";
  const name = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : "";

  const greetings = {
    dawn: ["Up with the sun", "Early bird", "Cracking the dawn", "First light"],
    morning: ["Bright morning", "Morning light", "Fresh start", "Clear headed"],
    afternoon: ["Afternoon glow", "Midday stretch", "Golden hour approaches", "Second wind"],
    evening: ["Evening calm", "Dusk settling in", "Twilight thinking", "Wind down"],
    night: ["Late night", "Under the stars", "Quiet hours", "Night owl"],
  };

  let pool: string[] = greetings.afternoon;
  if (hr >= 5 && hr < 8) pool = greetings.dawn;
  else if (hr >= 8 && hr < 12) pool = greetings.morning;
  else if (hr >= 12 && hr < 17) pool = greetings.afternoon;
  else if (hr >= 17 && hr < 21) pool = greetings.evening;
  else pool = greetings.night;

  const daySeed = new Date().toDateString();
  const idx = daySeed.length + daySeed.charCodeAt(daySeed.length - 1);
  const phrase = pool[idx % pool.length]!;

  return name ? `${phrase}, ${name}` : phrase;
}
