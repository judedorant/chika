const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRoot = path.dirname(expoRequire.resolve('@expo/cli/package.json'));
const schemas = require(path.join(cliRoot, 'build/src/start/server/DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = require(path.join(cliRoot, 'build/src/start/server/createMCPDevToolsExtensionSchema.js'));

test('patched Zod preserves Expo CLI plugin schemas and readonly command environments', () => {
  const parsed = schemas.PluginSchema.parse({
    packageName: 'rchat-test-plugin', packageRoot: '/tmp/plugin',
    cliExtensions: { description: 'Compatibility test', entryPoint: './index.js', commands: [
      { name: 'inspect', title: 'Inspect', environments: ['cli', 'mcp'], parameters: [
        { name: 'count', type: 'number' }, { name: 'active', type: 'confirm' },
      ] },
    ] },
  });
  assert(Object.isFrozen(parsed.cliExtensions.commands[0].environments));
  assert.equal(schemas.PluginSchema.safeParse({ ...parsed, packageName: '' }).success, false);
  assert.equal(schemas.PluginSchema.safeParse({ ...parsed, cliExtensions: { ...parsed.cliExtensions, commands: [] } }).success, false);
  const command = createMCPDevToolsExtensionSchema(parsed);
  assert.deepEqual(command.parse({ command: 'inspect', count: 3, active: true }), { command: 'inspect', count: 3, active: true });
  assert.equal(command.safeParse({ command: 'other' }).success, false);
  assert.equal(command.safeParse({ command: 'inspect', count: '3' }).success, false);
  assert.equal(command.safeParse({ command: 'inspect', unexpected: true }).success, false);
});

test('patched Zod preserves Expo CLI output validation and issue reporting', () => {
  const lines = [{ type: 'text', text: 'Ready', level: 'info' }, { type: 'image', url: 'https://example.test/image.png' }];
  assert.deepEqual(schemas.DevToolsPluginOutputSchema.parse(lines), lines);
  const invalid = schemas.DevToolsPluginOutputSchema.safeParse([{ type: 'audio', url: 'not-a-url' }]);
  assert.equal(invalid.success, false);
  assert(invalid.error.issues.length > 0);
});

test('patched query-string keeps Router query serialization and Unicode parsing', () => {
  const query = require('query-string');
  assert.equal(query.stringify({ text: 'Hello world 👋', tag: ['one', 'two'], nullable: null }, { sort: false }), 'text=Hello%20world%20%F0%9F%91%8B&tag=one&tag=two&nullable');
  const parsed = query.parse('text=Hello%20world%20%F0%9F%91%8B&tag=one&tag=two&nullable');
  assert.equal(parsed.text, 'Hello world 👋');
  assert.deepEqual(parsed.tag, ['one', 'two']);
  assert.equal(parsed.nullable, null);
  assert.equal(query.parse('text=%E0%A4%A&ok=%41').ok, 'A');
});

test('malformed percent-encoded input completes in a bounded subprocess', () => {
  // A timeout kills a regression instead of hanging the test worker on the DoS input.
  const result = spawnSync(process.execPath, ['-e', `
    const query = require('query-string');
    const malformed = '%80'.repeat(20000) + '%E0%A4%A';
    const parsed = query.parse('text=' + malformed);
    require('node:assert/strict').equal(parsed.text.length, malformed.length);
  `], { cwd: path.resolve(__dirname, '..'), timeout: 3000, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
