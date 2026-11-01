const path = require('path');

module.exports = {
  entry: {
    popup: './src/popup/popup.tsx',
    agent: './src/agent/index.ts',
    content: './src/content/content.ts',
    'service-worker': './src/background/service-worker.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts|\.tsx$/,
        use: {
          loader: 'ts-loader',
          options: {
            compilerOptions: {
              jsx: 'react-jsx',
              jsxImportSource: 'preact',
            },
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.s[ac]ss$/i,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
};
