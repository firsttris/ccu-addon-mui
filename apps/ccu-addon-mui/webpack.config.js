module.exports = (config, context) => {
  config.module.rules.push({
    test: /\.tcl$/,
    type: 'asset/source',
  });

  return config;
};
