const webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

module.exports = function override(config, env) {
  // Add node polyfill plugin with console excluded
  const nodePolyfillOptions = {
    excludeAliases: ['console'] // Explicitly exclude console polyfill
  };
  config.plugins = config.plugins.filter(plugin => 
    !(plugin instanceof NodePolyfillPlugin)
  );
  config.plugins.push(new NodePolyfillPlugin(nodePolyfillOptions));

  // Add fallbacks for node modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
    path: require.resolve('path-browserify'),
    stream: require.resolve('stream-browserify'),
    crypto: require.resolve('crypto-browserify'),
    buffer: require.resolve('buffer'),
    util: require.resolve('util'),
    process: require.resolve('process/browser'),
    zlib: require.resolve('browserify-zlib'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    url: require.resolve('url'),
    assert: require.resolve('assert'),
    os: require.resolve('os-browserify/browser'),
    'process/browser': require.resolve('process/browser'),
    'console': false,  // Disable console-browserify
  };

  // Add plugins
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  // Ignore warnings for these modules
  config.ignoreWarnings = [
    /Failed to parse source map/,
    /Critical dependency: the request of a dependency is an expression/,
    /Can't resolve 'faiss-node'/,
    /Can't resolve 'pickleparser'/,
    /Can't resolve 'console-browserify'/,
  ];

  // Handle node: protocol
  config.module.rules.push({
    test: /\.m?js/,
    resolve: {
      fullySpecified: false,
    },
  });

  // Disable node: protocol handling
  config.resolve.alias = {
    ...config.resolve.alias,
    'node:fs/promises': false,
    'node:path': false,
    'node:fs': false,
    'node:crypto': false,
    'node:stream': false,
    'node:util': false,
    'node:url': false,
    'node:http': false,
    'node:https': false,
    'node:zlib': false,
    'node:buffer': false,
    'node:string_decoder': false,
    'console-browserify': false,
  };

  return config;
}; 