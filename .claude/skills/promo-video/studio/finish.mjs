// node finish.mjs  Muxes out/silent.mp4 with out/score.wav at -14 LUFS into out/tzdeck-promo.mp4,
// then writes the review images: contact sheet, phone-size sheet and poster frame.
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const run = (...args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

run('-i', 'out/silent.mp4', '-i', 'out/score.wav',
  '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '48000',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out/tzdeck-promo.mp4');
run('-i', 'out/tzdeck-promo.mp4', '-vf', 'fps=2,scale=216:-1,tile=8x5:padding=4:color=0x222222', '-frames:v', '1', 'out/contact-final.png');
run('-i', 'out/tzdeck-promo.mp4', '-vf', 'fps=1,scale=360:-1,tile=10x2:padding=4:color=0x222222', '-frames:v', '1', 'out/phone.png');
run('-ss', '8.2', '-i', 'out/tzdeck-promo.mp4', '-frames:v', '1', 'out/poster.png');
console.log('out/tzdeck-promo.mp4, out/contact-final.png, out/phone.png, out/poster.png');
