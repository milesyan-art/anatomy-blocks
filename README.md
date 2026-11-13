# Block Anatomy

Learn artistic anatomy **one body part at a time**. Each part is shown as simple
3D muscle blocks (not medical detail) with the bones faintly visible underneath,
and sliders to bend and twist it so you can watch the blocks change.

Parts so far:

| Section | Lessons                         | You can move                       |
| ------- | ------------------------------- | ---------------------------------- |
| Arm     | Forearm, Upper arm, Whole arm   | bend the elbow, twist the forearm  |
| Leg     | Thigh, Lower leg, Whole leg     | bend the knee, point the foot      |
| Torso   | Front, Back                     | bend, lean sideways, twist         |

## Run it

```bash
npm install
npm run dev
```

Other scripts: `npm run build` (type-check + production build into `dist/`),
`npm run preview` (serve the build), `npm run lint`.

## Deploy on Vercel

It is a plain static Vite site, so there is nothing to configure: push the
folder to GitHub, import the repo in Vercel, and accept the detected defaults
(build command `npm run build`, output `dist`).

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
    arm.ts  leg.ts  torso.ts   one file per rig: bones, muscles, text, lessons
    index.ts                   the list the part picker reads
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
2. List bones (`kind: 'bone'`) and muscles (`kind: 'muscle'`) as sweeps.
3. Add the text for each muscle group in `groups`, and one or more `lessons`
   (which groups to show + where the camera starts).
4. Register the rig and lessons in `src/parts/index.ts`.

In dev mode `window.__dbg` lets you set a pose or camera from the browser
console, e.g. `__dbg.pose({ elbow: 90 })` or `__dbg.view({ az: 180 })`.

## Units and directions

1 unit is roughly 10 cm. `+Y` is up and `+Z` is the front of the body. Limbs are
modelled as the **left** limb, so `+X` is the outside (thumb side / little-toe side).
