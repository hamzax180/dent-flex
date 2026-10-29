// Generates ILLUSTRATIVE interior images for empty photo slots (until real clinic photos exist).
// Usage: node scripts/generate-images.mjs [name ...]   — reads OPENAI_API_KEY from .env.
// No people, faces, text or logos: these must never be mistaken for real staff or branding.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const KEY = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
if (!KEY) throw new Error("OPENAI_API_KEY missing");

const STYLE =
  "Photorealistic editorial interior photograph, soft natural daylight, calm and premium boutique dental clinic in Istanbul. " +
  "Palette: deep forest green, warm cream, muted sage green, light oak wood, subtle brushed brass accents. " +
  "Clean, uncluttered, architectural, shallow depth of field, 35mm lens, high-end hospitality feel. " +
  "Absolutely no people, no faces, no hands, no text, no letters, no signage, no logos, no brand names, no screens with content.";

const IMAGES = {
  reception: { size: "1536x1024", prompt: "A serene reception and waiting lounge: curved cream reception desk, sage-green upholstered lounge chairs, oak floor, large window with sheer curtains, potted olive tree, brass pendant lights." },
  "treatment-room": { size: "1536x1024", prompt: "A modern dental treatment room: sage-green upholstered dental chair, overhead operating light, forest-green cabinetry with white quartz worktop, large window with soft daylight, plants, spotless and calm." },
  detail: { size: "1536x1024", prompt: "A close, wide composition of interior details: forest-green vertical wooden slat wall, a brass wall light, the edge of a cream curved bench and a ceramic vase with olive branches, warm afternoon light." },
  entrance: { size: "1024x1536", prompt: "The street entrance of a boutique clinic in a restored Istanbul stone building: tall glass door with slim brass frame, deep green awning without any text, potted plants either side, morning light, cobbled pavement." },
  consultation: { size: "1536x1024", prompt: "A quiet consultation room: oak table with two cream chairs, a closed laptop and a glass of water, large dental anatomy model on a shelf, forest-green wall, soft window light." },
};

// Newest first; falls back if a model isn't enabled for this key/project.
const MODELS = (process.env.IMAGE_MODELS || "gpt-image-2,gpt-image-1.5,gpt-image-1").split(",");

async function generate(model, prompt, size) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, quality: "medium", n: 1, output_format: "webp", output_compression: 82 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${model}: ${res.status} ${json.error?.message ?? ""}`);
  const d = json.data[0];
  const b64 = d.b64_json ?? Buffer.from(await (await fetch(d.url)).arrayBuffer()).toString("base64");
  return { b64, ext: "webp", model };
}

mkdirSync("public/images/illustrative", { recursive: true });
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(IMAGES);
for (const name of wanted) {
  const spec = IMAGES[name];
  if (!spec) {
    console.log(`skip unknown ${name}`);
    continue;
  }
  if (["webp", "png"].some((e) => existsSync(`public/images/illustrative/${name}.${e}`))) {
    console.log(`exists ${name}`);
    continue;
  }
  const prompt = `${STYLE} ${spec.prompt}`;
  let out;
  for (const model of MODELS) {
    try {
      out = await generate(model, prompt, spec.size);
      break;
    } catch (e) {
      console.log(`  ${e.message.slice(0, 160)}`);
    }
  }
  if (!out) {
    console.log(`FAILED ${name}`);
    continue;
  }
  const file = `public/images/illustrative/${name}.${out.ext}`;
  writeFileSync(file, Buffer.from(out.b64, "base64"));
  console.log(`saved ${file} via ${out.model} (${Math.round(Buffer.from(out.b64, "base64").length / 1024)} KB)`);
}
