import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

async function test() {
    const tts = new MsEdgeTTS();
    await tts.setMetadata("en-US-AriaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true
    });
    const { audioStream, metadataStream } = tts.toStream("Hi, world!");
    
    const metaBytes = [];
    metadataStream.on('data', (c) => metaBytes.push(c));
    await new Promise((resolve) => audioStream.on('end', resolve));

    let metaRaw = Buffer.concat(metaBytes).toString('utf-8');
    // It's stacked JSONs: {"Metadata":...}{"Metadata":...}
    metaRaw = metaRaw.replace(/}{/g, '},{');
    const metaObj = JSON.parse('[' + metaRaw + ']');
    
    const words = [];
    let compressed = "";
    metaObj.forEach((block) => {
        if(block.Metadata) {
            block.Metadata.forEach(m => {
                if (m.Type === "WordBoundary") {
                    const startMs = Math.floor(m.Data.Offset / 10000);
                    const endMs = startMs + Math.floor(m.Data.Duration / 10000);
                    const word = m.Data.text.Text;
                    words.push({ word, startMs, endMs });
                    compressed += `[${startMs}:${word}:${endMs}] `;
                }
            });
        }
    });

    console.log(compressed.trim());
}

test();
