import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

const sizes = [16, 48, 128]
const svgIcon = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#e53935"/>
  <text x="64" y="90" font-size="72" text-anchor="middle" fill="white">🎤</text>
</svg>`)

for (const size of sizes) {
  await sharp(svgIcon)
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon${size}.png`)
  console.log(`Created icon${size}.png`)
}