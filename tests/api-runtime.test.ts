import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

test('compiled API handlers load in native Node ESM and retain method guards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wailtail-runtime-'));
  try {
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    async function compile(path: string) {
      const source = await readFile(path, 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022
      }}).outputText;
      const target = join(root, path.replace(/\.ts$/, '.js'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, output);
    }
    async function directory(path: string) {
      for (const item of await readdir(path, { withFileTypes: true })) {
        const child = join(path, item.name);
        if (item.isDirectory()) await directory(child);
        else if (child.endsWith('.ts')) await compile(child);
      }
    }
    await directory('server/api');
    await directory('src/config');
    await Promise.all(['api/router.ts', 'src/types.ts'].map(compile));
    const names = (await readdir('server/api')).filter(name => name.endsWith('.ts')).map(name => name.slice(0, -3));
    const script = `
      import assert from 'node:assert/strict';
      import router from './api/router.js';
      for (const endpoint of ${JSON.stringify(names)}) {
        const res = { statusCode: 200, setHeader() {}, status(code) {this.statusCode=code;return this;}, json() {return this;} };
        await router({method:'DELETE', headers:{}, query:{__endpoint:endpoint}},res);
        assert.equal(res.statusCode,405,endpoint);
      }
      console.log('Native runtime passed for ${names.length} handlers');
    `;
    await writeFile(join(root, 'check.mjs'), script);
    const result = execFileSync(process.execPath, ['check.mjs'], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.match(result, /Native runtime passed for 32 handlers/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
