export default {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      },
      modules: 'auto'  // Let Babel handle modules automatically based on environment
    }]
  ],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }]
  ],
  env: {
    test: {
      presets: [
        ['@babel/preset-env', {
          targets: { node: 'current' },
          modules: 'commonjs'  // Use CommonJS for tests
        }]
      ]
    }
  }
};