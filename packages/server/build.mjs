/**
 * サーバービルドスクリプト (esbuild)
 *
 * @mahjong/shared を含めてすべてバンドルし、
 * dist/index.js として単一ファイルを出力する。
 * ws は Node.js ネイティブ依存のため external にする。
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  outfile: resolve(__dirname, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['ws'],                // ws は依存関係として残す
  alias: {
    '@mahjong/shared': resolve(__dirname, '../shared/src/index.ts'),
  },
  minify: false,
  sourcemap: true,
  logLevel: 'info',
});
