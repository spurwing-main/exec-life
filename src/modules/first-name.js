/**
 * First-name tokens: turn `{{first}}` into the person's first name.
 *
 * WHY THIS EXISTS. The Team Members template mixes CMS-bound content with
 * static copy that has to read naturally around it — "Written by Alex",
 * "Read Alex's latest insights". Webflow can bind a whole text element to a
 * field, but it cannot bind a name into the MIDDLE of a sentence, and the CMS
 * stores the full name ("Alexander Ogden") where the copy wants the short one.
 * So the copy carries a token and this module fills it in.
 *
 * Authored in the Designer as ordinary text:
 *
 *   Written by {{first}}
 *   Read {{first}}'s latest insights and blogs on protecting your business.
 *
 * WHERE THE NAME COMES FROM. Whatever `[data-first-name]` points at, else the
 * page's bound name element. That element is already on the page and already
 * CMS-bound, so there is no second source of truth to keep in sync: rename a
 * team member in the CMS and every token follows.
 *
 * THE TRADE-OFF, STATED PLAINLY. The token ships in the served HTML, so a
 * crawler that does not run JavaScript reads "Written by {{first}}". On a page
 * whose whole job is authority that is a real cost. It is accepted here
 * because the alternative — splitting every sentence into bound spans — is
 * more Designer surface than the copy is worth. If that cost ever bites,
 * the fix is to bind the full name and shorten it here instead, and this
 * module already has the machinery: see `firstNameFrom`.
 *
 * TEXT NODES ONLY. The replacement walks text nodes and never touches
 * innerHTML. A name is CMS data typed by a person; routing it through
 * innerHTML would make "Alex & Sam" a parsing bug and anything sharper an
 * injection. Writing `node.nodeValue` cannot create markup at all.
 */

import { qs, qsa } from "../utils/dom.js";

/** The default places a bound full name already appears on these templates. */
const NAME_SELECTORS = ["[data-first-name]", ".team-page_name", ".insight-author_name"];

// Two regexes for one pattern, deliberately. A /g regex carries `lastIndex`
// between calls, so `TOKEN.test(a)` then `TOKEN.test(b)` starts the second
// search partway through and returns a wrong answer. `HAS_TOKEN` (no /g) is
// for asking; `TOKEN` (/g) is for replacing every occurrence.
const TOKEN = /\{\{\s*first\s*\}\}/g;
const HAS_TOKEN = /\{\{\s*first\s*\}\}/;

/** The token plus a possessive that would be left dangling without a name. */
const TOKEN_POSSESSIVE = /\{\{\s*first\s*\}\}(['’]s)?/g;

/**
 * The first word of a full name.
 *
 * Deliberately naive: split on whitespace, take the first part. It is right
 * for "Alexander Ogden" and for "Oliver Adamkiewicz", and it is wrong for a
 * title ("Dr Rachel Jones" gives "Dr"). That is a content problem with an
 * obvious content fix — do not grow a title list here until a real name in
 * the CMS needs one.
 */
export function firstNameFrom(fullName) {
  if (typeof fullName !== "string") return "";
  const first = fullName.trim().split(/\s+/)[0];
  return first || "";
}

/**
 * The full name for this page, read from the first selector that resolves.
 *
 * Always searched from the document, never from the caller's root. `root`
 * scopes WHERE tokens get replaced — a section, a freshly loaded CMS list —
 * but the name element lives in the page header, outside any such section.
 * Scoping this lookup too would mean re-initing one section could find no
 * name and quietly strip the tokens it was asked to fill.
 */
function pageName() {
  for (const selector of NAME_SELECTORS) {
    const element = qs(document, selector);
    if (!element) continue;
    const name = (element.getAttribute("data-first-name") || element.textContent || "").trim();
    if (name) return name;
  }
  return "";
}

/**
 * Every text node under `root` that contains the token.
 *
 * Collected before any writing starts. A TreeWalker is a live view, and
 * replacing as we walk risks revisiting our own output — which matters the
 * moment a name could itself contain the token.
 */
function tokenNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return HAS_TOKEN.test(node.nodeValue || "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const found = [];
  let node = walker.nextNode();
  while (node) {
    found.push(node);
    node = walker.nextNode();
  }
  return found;
}

export function initFirstName(root = document) {
  const nodes = tokenNodes(root);

  // Attributes are gathered BEFORE the early return, not after it. A token can
  // live in an aria-label on a link whose visible text has none — "Follow
  // {{first}} on LinkedIn" reading "Follow" — and returning on empty text
  // nodes alone left exactly that case unfilled, announced to screen readers
  // with the raw token in it.
  const labelled = qsa(root, "[aria-label*='{{first}}'], [title*='{{first}}']");
  if (!nodes.length && !labelled.length) return;

  const first = firstNameFrom(pageName());

  // No name found, but tokens are on the page. Leaving "{{first}}" visible is
  // worse than any fallback, so drop the token and tidy the space it leaves:
  // "Read {{first}}'s latest insights" degrades to "Read latest insights",
  // which is clumsy but readable. A missing name means missing CMS data, and
  // that is the thing to go and fix.
  if (!first) console.warn("[el] first-name: tokens on the page but no name element to read");

  nodes.forEach((node) => {
    const text = node.nodeValue || "";
    // With a name, swap the token and leave any possessive alone: "{{first}}'s"
    // becomes "Alex's". Without one, take the possessive with it, or the copy
    // reads "Read 's latest insights".
    node.nodeValue = first
      ? text.replace(TOKEN, first)
      : text.replace(TOKEN_POSSESSIVE, "").replace(/\s{2,}/g, " ");
  });

  // Only the two attributes that carry human-facing text; do not sweep the lot.
  labelled.forEach((element) => {
    ["aria-label", "title"].forEach((name) => {
      const value = element.getAttribute(name);
      if (value && HAS_TOKEN.test(value)) {
        element.setAttribute(name, value.replace(TOKEN_POSSESSIVE, first ? `${first}$1` : ""));
      }
    });
  });
}

export default initFirstName;
