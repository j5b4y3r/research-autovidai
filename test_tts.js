import Bytez from "bytez.js";
import { tts } from "edge-tts";

async function test() {
  console.log("Generating TTS...");
  const audioBuffer = await tts("Hello world, this is a test.", { voice: "en-US-ChristopherNeural" });
  console.log("TTS generated, size:", audioBuffer.length);
  
  const dataUrl = `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`;
  
  console.log("Calling Bytez...");
  const sdk = new Bytez("ed13eef05df3a2e47f77e20873887cba");
  const model = sdk.model("openai/whisper-small");
  
  const { error, output } = await model.run(dataUrl, { return_timestamps: true });
  console.log("Error:", error);
  console.log("Output:", JSON.stringify(output, null, 2));
}

test();
