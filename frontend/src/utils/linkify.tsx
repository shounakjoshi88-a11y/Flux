/**
 * Turn plain text into React nodes with URLs rendered as clickable links.
 * Used for tool-step status lines ("Fetching content from …") and mono
 * output boxes so the sites Flux is reading are always one click away.
 *
 * Links render in a brighter clay than --accent so they stand out from the
 * muted body text, with underline on hover.
 */
import React from 'react';

const URL_RE = /(https?:\/\/[^\s<>"'`)\]}]+)/g;
// Punctuation that clings to the end of a URL in prose ("...jigjoy.com...").
const TRAILING_RE = /[.,;:!?…)\]}'*]+$/;
const LEADING_RE = /^[('"\[{]+/;

/** Display form of a URL: no protocol, no trailing slash —
 *  "github.com/jigjoy-ai/mozaik-network" instead of the full https://… */
export function cleanUrl(url: string): string {
  if (!url) return '';
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

const DEFAULT_LINK_CLS =
  'text-[#eba188] hover:text-[#f4b8a3] underline-offset-2 hover:underline cursor-pointer transition-colors break-all';

export function linkifyText(
  text: string,
  linkClassName: string = DEFAULT_LINK_CLS,
): React.ReactNode {
  if (!text) return text;
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    const isUrl = i % 2 === 1;
    if (!isUrl) return <React.Fragment key={i}>{part}</React.Fragment>;

    let url = part;
    let tail = '';
    const trail = url.match(TRAILING_RE);
    if (trail) {
      tail = trail[0];
      url = url.slice(0, url.length - tail.length);
    }
    const lead = url.match(LEADING_RE);
    let head = '';
    if (lead) {
      head = lead[0];
      url = url.slice(head.length);
    }

    return (
      <React.Fragment key={i}>
        {head}
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClassName}
        >
          {cleanUrl(url)}
        </a>
        {tail}
      </React.Fragment>
    );
  });
}
