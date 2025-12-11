
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.resolve(__dirname, '../dist');
const srcDir = path.resolve(__dirname, '../');

console.log('🏗️  Starting Mobile Build...');

// 1. Clean dist
if (fs.existsSync(distDir)) {
    console.log('🧹 Cleaning dist...');
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 2. Compile TS
console.log('🔨 Compiling TypeScript...');
try {
    execSync('npm run build', { stdio: 'inherit', cwd: srcDir });
} catch (e) {
    console.error('❌ Compilation failed.');
    process.exit(1);
}

// 3. Copy Assets
const filesToCopy = [
    'index.html',
    'style.css',
    'sw.js',
    'manifest.json',
    'favicon.ico',
    'config.js'
];

const dirsToCopy = [
    'assets',
    'icons'
];

console.log('📦 Copying static files...');
filesToCopy.forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
    } else {
        console.warn(`⚠️  Warning: ${file} not found.`);
    }
});

dirsToCopy.forEach(dir => {
    const src = path.join(srcDir, dir);
    const dest = path.join(distDir, dir);
    if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
    } else {
        console.warn(`⚠️  Warning: ${dir} not found.`);
    }
});

// 4. Patch index.html
console.log('🔧 Patching index.html...');
const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf-8');
    // Replace "dist/index.js" with "index.js"
    content = content.replace('src="dist/index.js"', 'src="index.js"');
    fs.writeFileSync(indexPath, content);
}

console.log('✅ Mobile Build Complete! Ready for Capacitor.');
