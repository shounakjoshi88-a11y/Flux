/**
 * Shared types for the inline status renderer.
 *
 * Extracted from `features/chat/StatusMessage.tsx` so each status family
 * (web search, files, wiki, skills, images, weather) can live in its own
 * module and still agree on the shape of the status they render.
 */

/** The status payload the agent stream emits. */
export interface StatusShape {
  type: string;
  subtype: string;
  message: string;
  content?: string;
  data?: any;
}

/**
 * Props every status family component receives.
 *
 * The families are pure presentational components: they render one kind of
 * status and return `null` for anything else, which lets `StatusMessage`
 * dispatch by trying each family in turn.
 */
export interface StatusBlockProps {
  status: StatusShape;
  isFirst?: boolean;
  isLast?: boolean;
  isActive?: boolean;
  onSourceClick?: (url: string | null) => void;
  rightSlot?: React.ReactNode;
  searchQuery?: string;
  expanded?: boolean;
}
