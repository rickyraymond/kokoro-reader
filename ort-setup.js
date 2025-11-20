import { env as ortEnv } from 'onnxruntime-web';
import { env as hfEnv } from '@huggingface/transformers';

const wasmPath = chrome.runtime.getURL('runtime/');

ortEnv.wasm.wasmPaths = wasmPath;
ortEnv.wasm.proxy = false;
ortEnv.wasm.numThreads = 1;

hfEnv.backends.onnx.wasm.wasmPaths = wasmPath;
hfEnv.backends.onnx.wasm.proxy = false;
hfEnv.backends.onnx.wasm.numThreads = 1;
