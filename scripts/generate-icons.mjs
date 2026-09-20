/** Generates the PWA icon set from an inline SVG source. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.join(process.cwd(), 'public', 'icons');

const logo = (bg, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${bg === 'none' ? 0 : 96}" fill="${bg === 'none' ? '#00000000' : '#1743e1'}"/>
  <g transform="translate(${pad}, ${pad}) scale(${(512 - pad * 2) / 512})">
    <path d="M256 96 78 176l178 80 146-65.6V296h32V176z" fill="#ffffff"/>
    <path d="M140 224v88c0 40 52 72 116 72s116-32 116-72v-88l-116 52z" fill="#bcd7ff"/>
    <circle cx="256" cy="400" r="26" fill="#ffffff"/>
  </g>
</svg>`;

const badge = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="16" fill="#000000"/>
  <path d="M36 14 10 26l26 12 26-12z" fill="#ffffff"/>
  <path d="M20 33v13c0 7 8 12 16 12s16-5 16-12V33l-16 7z" fill="#ffffff"/>
</svg>`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const src = Buffer.from(logo('#1743e1', 0));
  const maskable = Buffer.from(logo('#1743e1', 64));

  await sharp(src).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
  await sharp(src).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  await sharp(maskable).resize(192, 192).png().toFile(path.join(OUT, 'maskable-192.png'));
  await sharp(maskable).resize(512, 512).png().toFile(path.join(OUT, 'maskable-512.png'));
  await sharp(Buffer.from(badge)).resize(72, 72).png().toFile(path.join(OUT, 'badge-72.png'));
  await sharp(src).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
  await sharp(src).resize(32, 32).png().toFile(path.join(OUT, 'favicon-32.png'));
  await writeFile(path.join(OUT, 'logo.svg'), logo('#1743e1', 0));
  console.log('Icons written to public/icons');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
