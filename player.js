// player.js
import './ort-setup.js';   
import { KokoroTTS } from 'kokoro-js';

let audioElement = null;
let audioBlobUrl = null;

// ortEnv.wasm.wasmPaths = {
//     'ort-wasm.wasm': chrome.runtime.getURL('runtime/ort-wasm.wasm'),
//     'ort-wasm-simd.wasm': chrome.runtime.getURL('runtime/ort-wasm-simd.wasm'),
//     'ort-wasm-threaded.wasm': chrome.runtime.getURL('runtime/ort-wasm-threaded.wasm'),
//     'ort-wasm-simd-threaded.wasm': chrome.runtime.getURL('runtime/ort-wasm-simd-threaded.wasm')
// };
// ortEnv.wasm.proxy = false;      //  ← THIS disables the .jsep import
// ortEnv.wasm.numThreads = 1;     //  1 = “single-thread”
// ort.setWasmPaths(chrome.runtime.getURL('runtime/'));
// Pause if asked (background sends "pauseAll")
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "pauseAll" && audioElement) {
        audioElement.pause();
    }
});

async function generateSpeech(text, voice, dtype, device) {
    const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
    const tts = await KokoroTTS.from_pretrained(model_id, { dtype, device });
    const audio = await tts.generate(text, { voice });
    // Get raw WAV bytes
    return audio.toWav();
}

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById("status");
    // Load text and settings
    const { currentText, voice, dtype, device } = await chrome.storage.local.get(
        ["currentText", "voice", "dtype", "device"]
    );
    if (!currentText) {
        status.textContent = "No text found.";
        return;
    }
    status.textContent = "Generating audio...";
    // Generate speech audio (WAV data)
    const wavBytes = await generateSpeech(currentText, voice || "af_heart", dtype || "q8", device || "wasm");
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    audioBlobUrl = URL.createObjectURL(wavBlob);
    audioElement = new Audio(audioBlobUrl);
    status.textContent = "Ready.";
});

// Play/Pause handlers
document.getElementById("play").onclick = () => {
    if (audioElement) audioElement.play();
};
document.getElementById("pause").onclick = () => {
    if (audioElement) audioElement.pause();
};
// Save handler: triggers download of WAV
document.getElementById("save").onclick = () => {
    if (audioBlobUrl) {
        const a = document.createElement('a');
        a.href = audioBlobUrl;
        a.download = 'speech.wav';
        a.click();
    }
};
