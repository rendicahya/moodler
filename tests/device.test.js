import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPhone } from '../src/lib/device.js';

const win = (coarse, w, h) => ({ matchMedia: () => ({ matches: coarse }), screen: { width: w, height: h } });

test('phones are told apart from tablets and computers', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const androidPhone = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
  const androidTablet = 'Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
  assert.equal(isPhone({ userAgent: iphone }, win(true, 390, 844)), true);
  assert.equal(isPhone({ userAgent: androidPhone }, win(true, 412, 915)), true);
  assert.equal(isPhone({ userAgent: androidTablet }, win(true, 800, 1280)), false);
  assert.equal(isPhone({ userAgent: windows }, win(false, 1920, 1080)), false);
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  assert.equal(isPhone({ userAgent: ipad }, win(true, 834, 1194)), false);
  // A narrow window on a computer is not a phone; a small touch screen is, whatever the browser says it is.
  assert.equal(isPhone({ userAgent: windows }, win(false, 1366, 768)), false);
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (Macintosh)' }, win(true, 390, 844)), true);
  // Client hints win when the browser gives them.
  assert.equal(isPhone({ userAgent: windows, userAgentData: { mobile: true } }, win(false, 1920, 1080)), true);
  assert.equal(isPhone({ userAgent: androidPhone, userAgentData: { mobile: false } }, win(true, 412, 915)), false);
});
