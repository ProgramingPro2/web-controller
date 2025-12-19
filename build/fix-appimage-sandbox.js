#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appImagePath = path.join(__dirname, '..', 'dist', 'Web Controller-1.0.0.AppImage');

if (!fs.existsSync(appImagePath)) {
  console.error('AppImage not found:', appImagePath);
  process.exit(1);
}

console.log('Extracting AppImage to modify AppRun...');

// Create temp directory
const tempDir = path.join(__dirname, '..', 'dist', 'appimage-temp');
if (fs.existsSync(tempDir)) {
  execSync(`rm -rf "${tempDir}"`);
}
fs.mkdirSync(tempDir, { recursive: true });

try {
  // Extract AppImage
  execSync(`cd "${tempDir}" && "${appImagePath}" --appimage-extract`, { stdio: 'inherit' });
  
  const appRunPath = path.join(tempDir, 'squashfs-root', 'AppRun');
  
  if (fs.existsSync(appRunPath)) {
    let appRunContent = fs.readFileSync(appRunPath, 'utf8');
    
    if (!appRunContent.includes('--no-sandbox')) {
      // Modify AppRun to add --no-sandbox flag
      appRunContent = appRunContent.replace(
        /(exec\s+"\$THIS"\s+"\$@")/,
        'exec "$THIS" --no-sandbox "$@"'
      );
      
      if (!appRunContent.includes('--no-sandbox')) {
        // Try alternative pattern
        appRunContent = appRunContent.replace(
          /(exec\s+"\$THIS")/,
          '$1 --no-sandbox'
        );
      }
      
      fs.writeFileSync(appRunPath, appRunContent, { mode: 0o755 });
      console.log('Modified AppRun script');
      
      // Repackage AppImage
      console.log('Repackaging AppImage...');
      const appimagetool = process.env.APPIMAGETOOL || 'appimagetool';
      execSync(`cd "${tempDir}" && ${appimagetool} squashfs-root "${appImagePath}"`, { stdio: 'inherit' });
      console.log('AppImage updated successfully!');
    } else {
      console.log('AppRun already contains --no-sandbox flag');
    }
  } else {
    console.error('AppRun not found in extracted AppImage');
    process.exit(1);
  }
} finally {
  // Cleanup
  execSync(`rm -rf "${tempDir}"`);
}

