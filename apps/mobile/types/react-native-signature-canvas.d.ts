// Phase L typecheck fix — react-native-signature-canvas ships its
// own types but the package may not be installed locally during
// typecheck (added in the E01 resolution wave; tests use a jest
// mock). This ambient declaration exposes the surface SignaturePad
// uses so `tsc --noEmit` doesn't fail.

declare module 'react-native-signature-canvas' {
  import type { ComponentType, RefAttributes } from 'react';

  export interface SignatureViewRef {
    readSignature: () => void;
    clearSignature: () => void;
    getData: () => string;
  }

  export interface SignatureViewProps {
    onOK?: (signature: string) => void;
    onEmpty?: () => void;
    onBegin?: () => void;
    webStyle?: string;
    descriptionText?: string;
    autoClear?: boolean;
    imageType?: string;
  }

  const SignatureScreen: ComponentType<SignatureViewProps & RefAttributes<SignatureViewRef>>;
  export default SignatureScreen;
}
