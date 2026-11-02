const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = ['src/core.js', 'src/lampa.js'];
const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
const metadata = {
    version: require('./package.json').version,
    bytes: Buffer.byteLength(code),
    sha256: crypto.createHash('sha256').update(code).digest('hex'),
    files: files.map(f => ({
        path: f,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex')
    }))
};
for (const directory of ['dist', 'docs']) {
    const target = path.join(__dirname, directory);
    fs.mkdirSync(target, { recursive: true });
    for (const name of ['ukrainian-sources.js', 'ua.js']) fs.writeFileSync(path.join(target, name), code);
    fs.writeFileSync(path.join(target, 'build.json'), JSON.stringify(metadata, null, 2));
}
console.log(path.join(__dirname, 'dist/ukrainian-sources.js'));
