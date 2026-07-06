// Empty stub. Transformers.js conditionally imports `onnxruntime-node` for the
// Node runtime; in the browser/extension build we never use it, so we alias it
// to this no-op module to keep the bundler happy.
export default {};
