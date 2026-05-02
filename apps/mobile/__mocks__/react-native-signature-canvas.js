// Phase E CRIT-103/104 (E01 Option A) — jest mock for the WebView-backed
// signature canvas. The real library wraps signature_pad inside a
// react-native-webview; both are unavailable in the jsdom test env.
// This mock renders a placeholder element + exposes the imperative
// ref methods the parent uses.
const React = require('react');

const SignatureScreen = React.forwardRef(function SignatureScreen(props, ref) {
  React.useImperativeHandle(
    ref,
    () => ({
      readSignature: () => {
        // Synthesise an onOK call so behavioural tests can exercise
        // the upload path. The base64 is the smallest valid PNG.
        if (typeof props.onOK === 'function') {
          props.onOK(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
          );
        }
      },
      clearSignature: () => {},
      getData: () => '',
    }),
    [props.onOK],
  );
  return React.createElement('rn-signature', { 'data-testid': 'signature-canvas' });
});

module.exports = SignatureScreen;
module.exports.default = SignatureScreen;
