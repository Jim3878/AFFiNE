import type { Configuration as RspackDevServerConfiguration } from '@rspack/dev-server';

const devProxyTarget =
  process.env.AFFINE_DEV_PROXY_TARGET || 'http://localhost:3010';

export const RSPACK_SUPPORTED_PACKAGES = [
  '@affine/admin',
  '@affine/web',
  '@affine/mobile',
  '@affine/ios',
  '@affine/android',
  '@affine/electron-renderer',
  '@affine/server',
  '@affine/reader',
] as const;

const rspackSupportedPackageSet = new Set<string>(RSPACK_SUPPORTED_PACKAGES);

export function isRspackSupportedPackageName(name: string) {
  return rspackSupportedPackageSet.has(name);
}

export function assertRspackSupportedPackageName(name: string) {
  if (isRspackSupportedPackageName(name)) {
    return;
  }

  throw new Error(
    `Rspack bundling currently supports: ${Array.from(RSPACK_SUPPORTED_PACKAGES).join(', ')}. Unsupported package: ${name}.`
  );
}

export const DEFAULT_DEV_SERVER_CONFIG: RspackDevServerConfiguration = {
  host: '0.0.0.0',
  allowedHosts: 'all',
  hot: false,
  liveReload: true,
  compress: !process.env.CI,
  setupExitSignals: true,
  client: {
    overlay: process.env.DISABLE_DEV_OVERLAY === 'true' ? false : undefined,
    logging: process.env.CI ? 'none' : 'error',
    // see: https://webpack.js.org/configuration/dev-server/#websocketurl
    // must be an explicit ws/wss URL because custom protocols (e.g. assets://)
    // cannot be used to construct WebSocket endpoints in Electron
    webSocketURL: 'ws://0.0.0.0:8080/ws',
  },
  historyApiFallback: {
    rewrites: [
      {
        from: /.*/,
        to: () => {
          return process.env.SELF_HOSTED === 'true'
            ? '/selfhost.html'
            : '/index.html';
        },
      },
    ],
  },
  // NineDay: AFFINE_DEV_PROXY_TARGET points the dev server at another backend (for example our
  // self-hosted server) instead of a local one on :3010.
  proxy: [
    {
      context: '/api',
      target: devProxyTarget,
      changeOrigin: true,
    },
    {
      context: '/socket.io',
      target: devProxyTarget,
      ws: true,
      changeOrigin: true,
    },
    {
      context: '/graphql',
      target: devProxyTarget,
      changeOrigin: true,
    },
  ],
};
