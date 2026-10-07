declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

declare module "react-native/Libraries/Core/Devtools/getDevServer" {
  export default function getDevServer(): {
    url: string;
    fullBundleUrl: string | null;
    bundleLoadedFromServer: boolean;
  };
}
