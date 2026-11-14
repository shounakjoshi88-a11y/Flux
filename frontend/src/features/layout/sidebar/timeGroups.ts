/**
 * Time grouping for the sidebar's conversation list.
 *
 * Extracted from `features/layout/Sidebar.tsx` so both the list and the search
 * modal can use the same grouping and date formatting.
 */

/** Bucket a conversation into "Today", "Yesterday", "This Week", ... */
export function getTimeGroup(date: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) return "Today";
  if (date >= yesterdayStart) return "Yesterday";

  const diffTime = todayStart.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 7) return "This Week";

  const weeks = Math.floor(diffDays / 7);
  if (weeks <= 4) return `${weeks} Week${weeks > 1 ? "s" : ""} Ago`;

  const months = Math.floor(diffDays / 30);
  if (months <= 11) return `${months} Month${months > 1 ? "s" : ""} Ago`;

  return "Older";
}

/** Group label for a conversation timestamp. */
export function formatSearchDate(dateString: string | null): string {
  if (!dateString) return "Older";
  return getTimeGroup(new Date(dateString));
}
