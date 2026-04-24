"use strict";

/**
 * ACW Assistant — Content Script
 *
 * Monitors the active page for call-end signals from browser-based dialers
 * (Aircall, JustCall, Twilio Flex, Five9 Web, etc.) and sends CALL_ENDED
 * messages to the background service worker.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const CALL_END_PATTERNS = [
  /call\s+ended/i,
  /call\s+disconnected/i,
  /disconnected/i,
  /hung\s+up/i,
  /call\s+completed/i,
  /conversation\s+ended/i,
  /wrapup/i,
  /wrap[\s-]?up/i,
  /after\s+call\s+work/i,
  /acw/i,
];

const TRANSCRIPT_SELECTORS = [
  '[data-testid="transcript"]',
  '[class*="transcript"]',
  '[class*="Transcript"]',
  '[id*="transcript"]',
  '[class*="call-notes"]',
  '[class*="callNotes"]',
  '[class*="conversation-notes"]',
  '[class*="summary"]',
  '[aria-label*="transcript"]',
  "[aria-label*=\"notes\"]",
  "textarea",
];

const DURATION_SELECTORS = [
  '[class*="duration"]',
  '[class*="timer"]',
  '[class*="call-time"]',
  '[class*="callTime"]',
  '[data-testid*="duration"]',
  '[data-testid*="timer"]',
];

const CHECK_INTERVAL_MS = 1500;
const DEBOUNCE_DELAY_MS = 2000;

// ─── State ────────────────────────────────────────────────────────────────────

let callActive = false;
let lastCallEndedAt = 0;
let callStartedAt = null;
let observedDuration = 0;
let durationCheckInterval = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts visible text from transcript/notes elements on the page.
 */
function extractTranscript() {
  for (const selector of TRANSCRIPT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.value ?? el.innerText ?? el.textContent ?? "";
      const trimmed = text.trim();
      if (trimmed.length > 10) {
        return trimmed;
      }
    }
  }

  // Fallback: scan all text nodes for content that looks like a call transcript
  return "";
}

/**
 * Reads the call duration from known duration display elements.
 * Returns duration in seconds, or uses elapsed time since call start.
 */
function readDuration() {
  for (const selector of DURATION_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      const text = (el.innerText ?? el.textContent ?? "").trim();
      const parsed = parseDurationText(text);
      if (parsed > 0) return parsed;
    }
  }

  if (callStartedAt) {
    return Math.floor((Date.now() - callStartedAt) / 1000);
  }

  return observedDuration;
}

/**
 * Parses a time string like "1:23" or "01:23:45" into total seconds.
 */
function parseDurationText(text) {
  const match = text.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  const [, a, b, c] = match;
  if (c !== undefined) {
    return parseInt(a, 10) * 3600 + parseInt(b, 10) * 60 + parseInt(c, 10);
  }
  return parseInt(a, 10) * 60 + parseInt(b, 10);
}

/**
 * Checks whether the page's visible text contains call-end indicators.
 */
function pageIndicatesCallEnd() {
  const bodyText = document.body?.innerText ?? "";
  return CALL_END_PATTERNS.some((pattern) => pattern.test(bodyText));
}

/**
 * Checks whether the page's visible text suggests an active call.
 */
function pageIndicatesActiveCall() {
  const bodyText = document.body?.innerText ?? "";
  const activePatterns = [
    /call\s+in\s+progress/i,
    /on\s+a\s+call/i,
    /connected/i,
    /\d{1,2}:\d{2}/,  // timer pattern
  ];
  return activePatterns.some((p) => p.test(bodyText));
}

/**
 * Fires the CALL_ENDED event with transcript and duration data.
 * Includes a cooldown to prevent duplicate fires within 5 seconds.
 */
function fireCallEnded() {
  const now = Date.now();
  if (now - lastCallEndedAt < 5000) return;

  lastCallEndedAt = now;
  callActive = false;
  callStartedAt = null;

  const transcript = extractTranscript();
  const duration = readDuration();

  chrome.runtime.sendMessage({
    type: "CALL_ENDED",
    transcript,
    duration,
    pageUrl: window.location.href,
    pageTitle: document.title,
    timestamp: new Date().toISOString(),
  }).catch(() => {
    // Background might not be ready; silently ignore
  });
}

// ─── Duration Tracker ─────────────────────────────────────────────────────────

/**
 * Tracks the duration display on the page to detect when it stops.
 * A timer that stops incrementing signals call end.
 */
let lastDurationValue = -1;
let frozenDurationCount = 0;

function trackDurationChanges() {
  const currentDuration = readDuration();

  if (currentDuration === 0 || !callActive) {
    frozenDurationCount = 0;
    lastDurationValue = currentDuration;
    return;
  }

  if (currentDuration === lastDurationValue) {
    frozenDurationCount++;
    // If duration counter hasn't changed for ~6 seconds (4 checks × 1.5s), call likely ended
    if (frozenDurationCount >= 4 && pageIndicatesCallEnd()) {
      observedDuration = currentDuration;
      fireCallEnded();
    }
  } else {
    frozenDurationCount = 0;
    observedDuration = currentDuration;
  }

  lastDurationValue = currentDuration;
}

// ─── DOM Observer ─────────────────────────────────────────────────────────────

let debounceTimer = null;

/**
 * Handles DOM mutations — looks for call-end signals in changed nodes.
 */
function handleMutations(mutations) {
  const hasRelevantChange = mutations.some((mutation) => {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.some((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const text = node.innerText ?? node.textContent ?? "";
      return CALL_END_PATTERNS.some((p) => p.test(text));
    });
  });

  if (!hasRelevantChange) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (pageIndicatesCallEnd() && callActive) {
      fireCallEnded();
    } else if (!callActive && pageIndicatesActiveCall()) {
      callActive = true;
      callStartedAt = Date.now();
    }
  }, DEBOUNCE_DELAY_MS);
}

const observer = new MutationObserver(handleMutations);

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

// ─── Polling Fallback ─────────────────────────────────────────────────────────

/**
 * Polling loop to catch cases where DOM mutations don't fire reliably.
 */
durationCheckInterval = setInterval(() => {
  if (!callActive && pageIndicatesActiveCall()) {
    callActive = true;
    callStartedAt = Date.now();
    frozenDurationCount = 0;
    lastDurationValue = -1;
  }

  if (callActive) {
    trackDurationChanges();
  }
}, CHECK_INTERVAL_MS);

// ─── Message Listener ─────────────────────────────────────────────────────────

/**
 * Responds to manual trigger from popup or background for testing.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CALL_STATUS") {
    sendResponse({
      callActive,
      duration: readDuration(),
      hasTranscript: extractTranscript().length > 0,
    });
  }

  if (message.type === "TRIGGER_CALL_ENDED") {
    fireCallEnded();
    sendResponse({ triggered: true });
  }

  return true;
});
