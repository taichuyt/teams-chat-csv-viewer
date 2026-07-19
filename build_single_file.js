#!/usr/bin/env node
/**
 * Build script: bundles index.html, css/style.css, and js/app.js
 * into a single standalone HTML file: TeamsChat_CSV_Viewer.html
 *
 * Usage:
 *   node build_single_file.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_HTML = 'index.html';
const SOURCE_CSS = 'css/style.css';
const SOURCE_JS = 'js/app.js';
const OUTPUT = 'TeamsChat_CSV_Viewer.html';

function main() {
    // Read source files
    let html = fs.readFileSync(SOURCE_HTML, 'utf-8');
    const css = fs.readFileSync(SOURCE_CSS, 'utf-8');
    const js = fs.readFileSync(SOURCE_JS, 'utf-8');

    // Replace <link rel="stylesheet" href="..."> with inline <style>
    html = html.replace(
        /<link\s+rel="stylesheet"\s+href="[^"]*style\.css[^"]*"\s*\/?>/i,
        '<style>\n' + css.trim() + '\n</style>'
    );

    // Replace <script src="..."></script> with inline <script>
    html = html.replace(
        /<script\s+src="[^"]*app\.js[^"]*"\s*>\s*<\/script>/i,
        '<script>\n' + js.trim() + '\n</script>'
    );

    // Write output
    fs.writeFileSync(OUTPUT, html, 'utf-8');
    console.log('✓ Created:', path.resolve(OUTPUT));
}

main();
