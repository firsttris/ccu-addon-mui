module.exports = (config, context) => {
    config.module.rules.push({
      test: /\.tcl$/,
      use: 'raw-loader',
    });
  
    return config;
  };