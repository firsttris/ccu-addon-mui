const WebpackPwaManifest = require('webpack-pwa-manifest');
const path = require('path');
const webpack = require('webpack');

const logo = path.resolve('apps/ccu-addon-mui/src/assets/logo.png');

module.exports = (config, context) => {
  config.module.rules.push({
    test: /\.tcl$/,
    type: 'asset/source',
  });
  if (process.env.NODE_ENV === 'production') {
    config.plugins.push(
      new WebpackPwaManifest({
        name: 'HomeMatic CCU Addon MUI',
        short_name: 'CCU Addon MUI',
        description: 'HomeMatic CCU Addon MUI',
        background_color: '#ffffff',
        icons: [
          {
            src: logo,
            sizes: [96, 128, 192, 256, 384, 512],
            destination: path.join('icons', 'ios'),
            ios: true,
          },
          {
            src: path.resolve(
              'apps/ccu-addon-mui/src/assets/hmip-advanced-routing-kv.jpg'
            ),
            size: '1024x1024',
            destination: path.join('icons', 'ios'),
            ios: 'startup',
          },
          {
            src: logo,
            sizes: [36, 48, 72, 96, 144, 192, 512],
            destination: path.join('icons', 'android'),
          },
        ],
      })
    );
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.BASE_URL': '/addons/mui/',
      })
    );
  }
  return config;
};
