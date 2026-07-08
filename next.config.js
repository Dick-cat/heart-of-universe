/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-force-graph-3d uses Three.js which requires browser APIs
  transpilePackages: ['react-force-graph-3d', 'three'],
  webpack: (config) => {
    // Required for some Three.js modules
    config.resolve.alias = {
      ...config.resolve.alias,
      'three/addons': 'three/examples/jsm',
    };
    return config;
  },
};

module.exports = nextConfig;
