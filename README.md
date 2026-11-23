# Pureform

A complete, client-side music mastering workstation. React, TypeScript, Vite, Tailwind CSS v4, and the Web Audio API. No accounts, API keys, backend, AI, analytics, or audio uploads.

## Run

```sh
npm install
npm run dev
```

Build with `npm run build` and serve the entire `dist/` directory. Keep `dist/codecs/`, `dist/fonts/`, and the favicon with the HTML. A localhost or HTTPS origin is recommended for Web Workers. The single-threaded decoder does not need cross-origin isolation headers.

## Audio Workflow

- Import WAV, FLAC, M4A (AAC or ALAC), and MP3 by browsing or dropping a file.
- The browser decoder is tried first. A self-hosted FFmpeg WASM compatibility decoder is loaded only when needed. This is an application asset download, never an audio upload.
- Input is converted to a 48 kHz stereo session, analyzed, and automatically mastered.
- Five profiles and five accessible, draggable knobs adjust the chain. Changes automatically re-render. Superseded renders are canceled at processing checkpoints.
- Original/master comparison, optional loudness matching, stereo VU meters, seeking, transport controls, and monitor volume are functional.
- Export is a real 24-bit, 48 kHz, stereo PCM WAV with seeded TPDF dither.
- The included demo is synthesized locally and is not a copyrighted recording.

## Deterministic Signal Chain

1. BS.1770 K-weighted integrated loudness with absolute and relative gating; sample-peak, RMS, clipping, and low-frequency energy analysis.
2. Subsonic high-pass, adaptive low shelf, low-mid correction, and profile-dependent air EQ.
3. Soft-knee dynamics compression, parallel hyperbolic-tangent saturation, and bass-centered mid/side width shaping.
4. Loudness-targeted gain, a stereo-linked 5 ms lookahead limiter, and a 4x, 64-tap Kaiser-windowed sinc true-peak check.
5. Conservative peak correction and 24-bit TPDF-dithered WAV encoding.

The audio code lives in `src/audio/engine.ts`; playback is in `src/audio/useAudioPlayer.ts`. The application entry point is `src/App.tsx`, with reusable hardware controls in `src/components/Hardware.tsx`.

## Honest Limits

Files are limited to 200 MB and 15 minutes to bound browser memory use. No mastering algorithm can repair an already clipped recording or guarantee a perfect mix. Dynamic material can finish below the selected loudness target to preserve peak headroom. Audition the result before release. Processing is deterministic on the same browser and device, but native Web Audio filters can differ slightly between browser implementations.

Sessions exist in memory only. Refreshing or closing the page discards the session. The app does not save audio to persistent storage.

## Verification

```sh
npx playwright install --with-deps chromium
# With the development server running:
npx playwright test tests --workers=1
npx tsc --noEmit
npm run build
```

The tests cover desktop/mobile layout, each input codec, forced WASM fallback, playback, comparison, controls, invalid input, deterministic export, and WAV bit depth/sample rate/channels. If native `ffmpeg` is installed, export tests also check the output true-peak ceiling using an independent EBU R128 meter.

## Third-Party Notices

DM Sans and IBM Plex Mono are distributed under the SIL Open Font License. The FFmpeg JavaScript wrapper is MIT-licensed. The bundled FFmpeg WASM core is GPL-2.0-or-later; its corresponding source and build instructions are at https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core. The codec is an independently loaded worker, not an AI model. License texts and attribution are provided in `public/licenses/`.
