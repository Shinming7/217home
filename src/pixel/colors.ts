import { PAL } from "../game/palette";

export type RGB = [number, number, number];

const EXTRA = ["#733e39", "#8f563b", "#d9a066", "#4b692f", "#45283c", "#df7126"];

export const EDG32: string[] = Array.from(new Set([...Object.values(PAL), ...EXTRA]));

const RGB_CACHE = new Map<string, RGB>();

export function hexToRgb(hex: string): RGB {
  const cached = RGB_CACHE.get(hex);
  if (cached) return cached;
  const value = hex.replace("#", "");
  const rgb: RGB = [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
  RGB_CACHE.set(hex, rgb);
  return rgb;
}

export function rgbToHex(rgb: RGB): string {
  return `#${rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = 1 + amount;
  return rgbToHex([r * factor, g * factor, b * factor]);
}

export function mix(a: string, b: string, t: number): string {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  return rgbToHex([
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t,
  ]);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function nearestColor(rgb: RGB, palette: string[] = EDG32): string {
  let best = palette[0];
  let bestDistance = Infinity;
  for (const candidate of palette) {
    const [r, g, b] = hexToRgb(candidate);
    const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function bucketScore(bucket: RGB[]): number {
  if (bucket.length < 2) return 0;
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const [r, g, b] of bucket) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  return (maxR - minR + maxG - minG + maxB - minB) * Math.sqrt(bucket.length);
}

function widestChannel(bucket: RGB[]): 0 | 1 | 2 {
  const ranges = [0, 1, 2].map((channel) => {
    let min = 255;
    let max = 0;
    for (const pixel of bucket) {
      if (pixel[channel] < min) min = pixel[channel];
      if (pixel[channel] > max) max = pixel[channel];
    }
    return max - min;
  });
  if (ranges[0] >= ranges[1] && ranges[0] >= ranges[2]) return 0;
  return ranges[1] >= ranges[2] ? 1 : 2;
}

function bucketAverage(bucket: RGB[]): string {
  let r = 0, g = 0, b = 0;
  for (const pixel of bucket) {
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  return rgbToHex([r / bucket.length, g / bucket.length, b / bucket.length]);
}

export function medianCut(pixels: RGB[], count: number): string[] {
  if (!pixels.length) return ["#8b9bb4"];
  const buckets: RGB[][] = [pixels];
  while (buckets.length < count) {
    let bestIndex = -1;
    let bestScore = 0;
    buckets.forEach((bucket, index) => {
      const score = bucketScore(bucket);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    const bucket = buckets[bestIndex];
    const channel = widestChannel(bucket);
    const sorted = [...bucket].sort((a, b) => a[channel] - b[channel]);
    const middle = Math.max(1, Math.floor(sorted.length / 2));
    buckets.splice(bestIndex, 1, sorted.slice(0, middle), sorted.slice(middle));
  }
  return Array.from(new Set(buckets.filter((bucket) => bucket.length).map(bucketAverage)));
}

export function dominantColor(pixels: string[]): string {
  const counts = new Map<string, number>();
  for (const pixel of pixels) {
    counts.set(pixel, (counts.get(pixel) ?? 0) + 1);
  }
  let best = pixels[0] ?? "#8b9bb4";
  let bestCount = 0;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

export function mostSaturated(colors: string[], exclude: string[] = []): string {
  const skip = new Set(exclude.map((color) => color.toLowerCase()));
  let best: string | null = null;
  let bestScore = -1;
  for (const color of colors) {
    if (skip.has(color.toLowerCase())) continue;
    const score = saturation(color) * Math.min(1, Math.abs(luminance(color) - 128) / 128 + 0.35);
    if (score > bestScore) {
      best = color;
      bestScore = score;
    }
  }
  return best ?? "#2ce8f5";
}
