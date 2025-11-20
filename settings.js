// settings.js
import './ort-setup.js';

const MELOTTS_MODELS = [
    {
        id: 'onnx-community/MeloTTS-English',
        label: 'MeloTTS English',
        speakers: [
            { id: 'EN-Default', label: 'Default (English)' },
            { id: 'EN-Female', label: 'Female (English)' },
            { id: 'EN-Male', label: 'Male (English)' },
        ],
    },
];

function populateModelSelect(selectedModel) {
    const select = document.getElementById('model-select');
    select.innerHTML = '';
    for (const model of MELOTTS_MODELS) {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.label;
        if (model.id === selectedModel) opt.selected = true;
        select.appendChild(opt);
    }
}

function populateVoiceSelect(modelId, selectedVoice) {
    const model = MELOTTS_MODELS.find((m) => m.id === modelId) ?? MELOTTS_MODELS[0];
    const select = document.getElementById('voice-select');
    select.innerHTML = '';
    for (const speaker of model.speakers) {
        const opt = document.createElement('option');
        opt.value = speaker.id;
        opt.textContent = speaker.label;
        if (speaker.id === selectedVoice) opt.selected = true;
        select.appendChild(opt);
    }
}

// Load saved settings and initialize UI
async function initSettings() {
    const result = await chrome.storage.local.get(["device", "dtype", "voice", "modelId"]);
    const device = result.device || "wasm";
    const dtype = result.dtype || "q8";
    const modelId = result.modelId || MELOTTS_MODELS[0].id;
    const voice = result.voice || MELOTTS_MODELS[0].speakers[0].id;

    document.getElementById("device-select").value = device;
    document.getElementById("dtype-select").value = dtype;
    populateModelSelect(modelId);
    populateVoiceSelect(modelId, voice);
}

// Save a setting when changed
function addSettingListener(id, key, onChange) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
        const obj = {};
        obj[key] = el.value;
        chrome.storage.local.set(obj);
        if (onChange) onChange(el.value);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await initSettings();
    addSettingListener("device-select", "device");
    addSettingListener("dtype-select", "dtype");
    addSettingListener("model-select", "modelId", (value) => {
        const model = MELOTTS_MODELS.find((m) => m.id === value) ?? MELOTTS_MODELS[0];
        const defaultVoice = model.speakers[0]?.id;
        populateVoiceSelect(value, defaultVoice);
        if (defaultVoice) {
            chrome.storage.local.set({ voice: defaultVoice });
        }
    });
    addSettingListener("voice-select", "voice");
});
