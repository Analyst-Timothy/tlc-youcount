import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const root = new URL("../assets/", import.meta.url).pathname;
const officialLogo = `${root}youcount-card/logo-white.png`;
const appleOutput = `${root}apple-pass/`;
const googleOutput = `${root}google-wallet/`;
await Promise.all([mkdir(appleOutput, { recursive: true }), mkdir(googleOutput, { recursive: true })]);

const colours = ["#E84B4B", "#3B82F6", "#F0A500", "#16A34A", "#7C3AED"];
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

function premiumArtwork(width, height, { google = false } = {}) {
  const scale = width / 1032;
  const rail = colours.map((colour, index) => {
    const segment = height / colours.length;
    return `<rect x="0" y="${index * segment}" width="${Math.max(12, Math.round(16 * scale))}" height="${segment + 1}" fill="${colour}"/>`;
  }).join("");
  const ribbons = colours.map((colour, index) => {
    const offset = index * Math.round((google ? 22 : 8) * scale);
    return `<path d="M${Math.round(500 * scale)} ${Math.round((google ? 530 : 92) * (height / (google ? 812 : 144))) + offset} C${Math.round(680 * scale)} ${Math.round((google ? 360 : 48) * (height / (google ? 812 : 144))) + offset}, ${Math.round(825 * scale)} ${Math.round((google ? 630 : 112) * (height / (google ? 812 : 144))) + offset}, ${Math.round(1080 * scale)} ${Math.round((google ? 420 : 64) * (height / (google ? 812 : 144))) + offset}" fill="none" stroke="${colour}" stroke-opacity="${google ? ".75" : ".62"}" stroke-width="${Math.max(2, Math.round((google ? 7 : 3) * scale))}"/>`;
  }).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#123E6B"/><stop offset=".58" stop-color="#092D52"/><stop offset="1" stop-color="#061D36"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#3975AA" stop-opacity=".32"/><stop offset="1" stop-color="#0A2E52" stop-opacity="0"/></radialGradient>
      <pattern id="lines" width="${Math.max(26, Math.round(48 * scale))}" height="${Math.max(26, Math.round(48 * scale))}" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><path d="M0 0V48" stroke="#E7F2FB" stroke-opacity=".045" stroke-width="1"/></pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <ellipse cx="82%" cy="12%" rx="48%" ry="92%" fill="url(#glow)"/>
    <rect width="100%" height="100%" fill="url(#lines)"/>
    ${rail}${ribbons}
    <path d="M${Math.round(570 * scale)} 0 C${Math.round(760 * scale)} ${Math.round(height * .3)}, ${Math.round(800 * scale)} ${Math.round(height * .72)}, ${Math.round(1080 * scale)} ${Math.round(height * .82)}" fill="none" stroke="#F5F1ED" stroke-opacity=".09" stroke-width="${Math.max(1, Math.round(2 * scale))}"/>
  </svg>`);
}

function posterArtwork(width, height) {
  const sx = width / 358,
    sy = height / 448;
  const ribbons = colours.map((colour, index) => {
    const offset = index * 7;
    return `<path d="M-10 ${(184 + offset) * sy} C${78 * sx} ${(180 + offset) * sy}, ${134 * sx} ${(166 + offset) * sy}, ${190 * sx} ${(134 + offset) * sy} C${247 * sx} ${(101 + offset) * sy}, ${295 * sx} ${(101 + offset) * sy}, ${370 * sx} ${(106 + offset) * sy}" fill="none" stroke="${colour}" stroke-width="${3.2 * sx}"/>`;
  }).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${ribbons}</svg>`);
}

const iconSvg = Buffer.from(`<svg width="87" height="87" xmlns="http://www.w3.org/2000/svg"><rect width="87" height="87" rx="15" fill="#082E54"/><path d="M27 19h13v35h23v13H27z" fill="#fff"/>${colours.map((colour, index) => `<rect x="${index * 17.4}" y="79" width="17.5" height="8" fill="${colour}"/>`).join("")}</svg>`);
for (const [name, width, height] of [["icon.png",29,29],["icon@2x.png",58,58],["icon@3x.png",87,87]]) {
  await sharp(iconSvg).resize(width, height).png().toFile(`${appleOutput}${name}`);
}
for (const [name, width, height, contentWidth, contentHeight] of [["logo.png",160,50,126,40],["logo@2x.png",320,100,252,80],["logo@3x.png",480,150,378,120]]) {
  const logo = await sharp(officialLogo).resize(contentWidth, contentHeight, { fit: "contain", background: transparent }).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: transparent } })
    .composite([{ input: logo, left: 0, top: Math.round((height - contentHeight) / 2) }])
    .png().toFile(`${appleOutput}${name}`);
}
for (const [name, width, height] of [["primaryLogo@2x.png",252,60],["primaryLogo@3x.png",378,90]]) {
  await sharp(officialLogo).resize(width, height, { fit: "contain", background: transparent }).png().toFile(`${appleOutput}${name}`);
}
for (const [name, width, height] of [["artwork@2x.png",716,896],["artwork@3x.png",1074,1344]]) {
  await sharp(posterArtwork(width, height)).png().toFile(`${appleOutput}${name}`);
}
for (const [name, width, height] of [["strip.png",375,144],["strip@2x.png",750,288],["strip@3x.png",1125,432]]) {
  await sharp(premiumArtwork(width, height)).png().toFile(`${appleOutput}${name}`);
}

const googleLogoMark = await sharp(officialLogo).resize(500, 268, { fit: "contain", background: transparent }).png().toBuffer();
await Promise.all([
  sharp(premiumArtwork(1032, 812, { google: true })).png().toFile(`${googleOutput}hero-1032x812.png`),
  sharp({ create: { width: 660, height: 660, channels: 4, background: "#082E54" } }).composite([{ input: googleLogoMark, left: 80, top: 196 }]).png().toFile(`${googleOutput}logo-660.png`),
]);
