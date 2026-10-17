const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {ScanFace} = require('lucide-react');
const {Resvg} = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const symbol = renderToStaticMarkup(React.createElement(ScanFace, {size: 576, strokeWidth: 1.45, color: '#f4f1df'})).replace('<svg ', '<svg x="224" y="224" ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="64" y="64" width="896" height="896" rx="204" fill="#263c31"/><rect x="84" y="84" width="856" height="856" rx="188" fill="none" stroke="#77936a" stroke-opacity=".32" stroke-width="4"/>${symbol}</svg>`;
fs.writeFileSync(path.join(root, 'public/brand.svg'), svg + '\n');
const png = size => new Resvg(svg, {fitTo:{mode:'width',value:size}}).render().asPng();
fs.writeFileSync(path.join(root, 'electron/assets/icon.png'), png(1024));
if (process.platform === 'darwin') {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'studio-icons-'));
 const iconset = path.join(temporary, 'CharacterStudio.iconset');
 fs.mkdirSync(iconset);
 try {
  for (const size of [16,32,128,256,512]) {
   fs.writeFileSync(path.join(iconset,`icon_${size}x${size}.png`),png(size));
   fs.writeFileSync(path.join(iconset,`icon_${size}x${size}@2x.png`),png(size*2));
  }
  execFileSync('iconutil',['-c','icns',iconset,'-o',path.join(root,'electron/assets/icon.icns')]);
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
console.log('Brand SVG, runtime PNG and macOS ICNS generated.');
