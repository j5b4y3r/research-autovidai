import fs from 'fs';
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

async function run() {
  console.log("Generating audio...");
  const tts = new MsEdgeTTS();
  await tts.setMetadata("en-US-ChristopherNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream("This is a transcription test.");
  
  const chunks = [];
  audioStream.on('data', (c) => chunks.push(c));
  await new Promise(r => audioStream.on('end', r));
  
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync('test_audio.mp3', buffer);
  
  console.log("Audio generated. Uploading to server API...");
  
  const formData = new FormData();
  formData.append("audio", new Blob([buffer], { type: "audio/mp3" }), "test_audio.mp3");

  try {
      const response = await fetch('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: formData
      });
      const text = await response.text();
      console.log("Response status:", response.status);
      console.log("Response text:", text.substring(0, 500));
  } catch (e) {
      console.error(e);
  }
}

run();
