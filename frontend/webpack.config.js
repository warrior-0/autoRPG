const path = require('path');

module.exports = {
  mode: 'production',
  entry: './frontend/src/main.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'frontend/dist'),
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      }
    ]
  },
  optimization: {
    usedExports: true
  }
};