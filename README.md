# Block Anatomy

**English** · [简体中文](README.zh-CN.md)

**Live site: [anatomy-blocks.vercel.app](https://anatomy-blocks.vercel.app)**

Learn artistic anatomy **one body part at a time**. Each part is shown as simple
3D muscle blocks sitting on a white mannequin, with sliders to bend and twist it
so you can watch the blocks change. It is made for people learning to draw, not
for medical study: only the muscles that shape the surface are included.

## What you can study

| Section | Lessons                             | You can move                             |
| ------- | ----------------------------------- | ---------------------------------------- |
| Arm     | Forearm, Upper arm, Whole arm, Hand | elbow + forearm twist; fingers and thumb |
| Leg     | Thigh, Lower leg, Whole leg, Foot   | knee + ankle; ankle and toes             |
| Torso   | Front, Back                         | bend, lean sideways, twist               |

## Features

- **Bend and twist** - sliders and one-click poses; muscles stretch, bunch up
  and wrap as the joints move.
- **Male / Female** - the female figure has narrower ribs and shoulders, a
  pinched waist, wider hips, slimmer blocks and a breast form on the chest.
- **Muscle notes** - click a block to highlight it and read where it runs, how
  to draw it, and what to watch while moving.
- **Show what you need** - switch muscles, base forms, guide lines, labels and
  neighbouring muscles on or off. Turn *Muscles* off to study the mannequin
  blocks alone; turn *Bones* off to see only the muscles.
- **Light (optional)** - one switch. Off keeps the reference look: faceted
  blocks with the bones showing through. On turns the model smooth and solid so
  light rolls across the forms; drag the sun around a little ball to move it,
  pick a preset (Rim lights from behind), or set the shadow depth. The panel
  folds away when the light is off.
- **Four view buttons** per part, plus free rotation and zoom.
- **English and 简体中文** - follows the browser language on first visit and
  remembers a manual choice.
- Works on phones and desktops.

## Run it

```bash
npm install
npm run dev
```

Other scripts: `npm run build` (type-check + production build into `dist/`),
`npm run preview` (serve the build), `npm run lint`.

## Deploy

It is a plain static Vite site. The live site is deployed by Vercel from the
`main` branch with the detected defaults (build `npm run build`, output `dist`).

## How it works

Built with React + Vite + three.js (through `@react-three/fiber`). There are no
3D model files - every shape is generated from a short list of numbers.

```
src/
  engine/
    types.ts      the data format (stations, sweeps, rigs, lessons)
    sweep.ts      turns a path of stations into a block-shaped mesh
    frames.ts     small matrix helpers + the P() shorthand
    materials.ts  flat "drawing" shading, outlines, guide lines, ghost bones
  parts/
    arm.ts  hand.ts  leg.ts  foot.ts  torso.ts
                  one file per rig: base blocks, muscles, text, lessons
    body.ts       helpers that turn a rig into its female version
    index.ts      the list the part picker reads
  i18n/
    index.ts      language list, browser detection, fallback to English
    zh.ts         all Simplified Chinese text, keyed by lesson / muscle id
  components/
    Viewer.tsx    the 3D stage: camera, model, labels
  App.tsx         part picker, sliders, muscle list
```

### A muscle is a path of stations

```ts
P('hum', 0.02, -1.6, 0.34, 0.3, 0.24, { n: [0, 0, 1] })
// frame  x     y     z    half-width  thickness   outward direction
```

Each station is glued to a **frame** (a bone). When a slider moves, the frames
move, the stations ride along, and the block is re-swept through them - so a
muscle that starts on the upper arm and ends on the radius really does wrap
around the forearm when you twist it.

- `fa@0.3` means "the forearm frame with 30% of the twist applied" - that is how
  the twist is spread gradually from elbow to wrist.
- `alt` gives a station a second position/size that a drive (e.g. how bent the
  elbow is) blends towards - used for the biceps bunching up.
- `bulge` makes a block thicken automatically when its path gets shorter.
- `curl` wraps a wide, flat block around the form underneath (deltoid, lats...).

### Adding a part

1. Copy one of the files in `src/parts/` and describe the frames in `frames()`.
2. List base blocks (`kind: 'bone'`) and muscles (`kind: 'muscle'`) as sweeps.
3. Add the text for each muscle group in `groups`, and one or more `lessons`
   (which groups to show + where the camera starts).
4. Register the rig and lessons in `src/parts/index.ts`.
5. Add the Chinese text for the new ids in `src/i18n/zh.ts` (anything missing
   falls back to English).

### Adding a language

Copy `src/i18n/zh.ts`, translate it, and register it in `src/i18n/index.ts`
(`LANGS`, `UI`, `CONTENT`, and one line in `detectLang()`).

In dev mode `window.__dbg` lets you set a pose or camera from the browser
console, e.g. `__dbg.pose({ elbow: 90 })` or `__dbg.view({ az: 180 })`.

## Units and directions

1 unit is roughly 10 cm. `+Y` is up and `+Z` is the front of the body. Limbs are
modelled as the **left** limb, so `+X` is the outside (thumb side / little-toe side).
