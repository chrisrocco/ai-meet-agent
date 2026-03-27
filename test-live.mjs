import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

console.log('Connecting to Gemini Live API...');

try {
  const session = await ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-latest',
    config: {
      responseModalities: [Modality.AUDIO],
    },
    callbacks: {
      onopen: () => console.log('onopen fired'),
      onmessage: (msg) => {
        console.log('onmessage:', JSON.stringify(msg).slice(0, 300));
      },
      onerror: (err) => console.log('onerror:', err.message),
      onclose: (ev) => console.log('onclose fired:', JSON.stringify(ev).slice(0, 200)),
    },
  });

  console.log('Session connected, waiting 10s...');

  // Send a text message to trigger a response
  session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Hello, say something brief.' }] }] });

  await new Promise(r => setTimeout(r, 10000));
  console.log('Done waiting, closing.');
  session.close();
} catch (err) {
  console.error('Connect failed:', err.message);
}

process.exit(0);
