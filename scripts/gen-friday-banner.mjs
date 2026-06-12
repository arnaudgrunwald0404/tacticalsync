#!/usr/bin/env node
/**
 * Generates the default Friday banner image using Gemini.
 * Usage: GOOGLE_AI_API_KEY=your_key node scripts/gen-friday-banner.mjs
 * Output: public/friday-banner-default.jpg
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('Error: GOOGLE_AI_API_KEY environment variable is required.');
  process.exit(1);
}

const prompt = [
  'Cinematic ultra-wide landscape photograph, 16:9 aspect ratio, for a web app banner.',
  'Scene: a warm open-plan office on a Friday afternoon.',
  'LEFT HALF of the frame: mostly empty dark-teal blurred background — office space, pendant lights, bokeh.',
  'RIGHT HALF: a happy professional woman fully visible from shoulders to mid-torso, sitting at a MacBook laptop, relaxed smile, sharply in focus. Her full head and face must be clearly visible, well within the frame, not cropped.',
  'One or two blurred colleagues walk past in the far background, creating motion blur depth.',
  'Color grade: warm amber and golden tones on the right, deep teal-blue shadows on the left, cinematic contrast.',
  'Shallow depth of field. Anamorphic lens character. No text, no UI elements, no logos.',
  'The composition MUST be horizontal landscape orientation — wider than it is tall.',
].join(' ');

console.log('Calling Gemini image generation...');
console.log('Prompt:', prompt.slice(0, 120) + '...\n');

const res = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
      },
    }),
  },
);

if (!res.ok) {
  const body = await res.text();
  console.error('Gemini API error:', res.status, body.slice(0, 500));
  process.exit(1);
}

const data = await res.json();
const prediction = data?.predictions?.[0];
if (!prediction?.bytesBase64Encoded) {
  console.error('No image returned. Response:', JSON.stringify(data, null, 2).slice(0, 800));
  process.exit(1);
}

const mimeType = prediction.mimeType ?? 'image/png';
const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
const base64 = prediction.bytesBase64Encoded;
const imageBytes = Buffer.from(base64, 'base64');

const outputPath = join(__dirname, '..', 'public', `friday-banner-default.${ext}`);
writeFileSync(outputPath, imageBytes);

console.log(`Image saved to: public/friday-banner-default.${ext}`);
console.log(`Size: ${(imageBytes.length / 1024).toFixed(1)} KB`);
console.log('\nNext: run the app and check ?banner_day=friday to preview the banner.');
