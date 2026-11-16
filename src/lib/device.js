// Moodler needs a computer's screen and keyboard; phones get a notice instead of the editor.

/**
 * Whether this looks like a phone: the browser says it is a mobile device, or it has a touch screen whose
 * shorter side is phone-sized. Tablets and narrow desktop windows are not phones.
 */
export function isPhone(nav = globalThis.navigator, win = globalThis) {
  if (!nav) return false;
  if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean') return nav.userAgentData.mobile;
  // iPads also say "Mobile", so only names that mean a phone count here.
  if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(nav.userAgent ?? '')) return true;
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const side = Math.min(win.screen?.width ?? Infinity, win.screen?.height ?? Infinity);
  return coarse && side < 600;
}
