const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  // Check if we're building for Linux AppImage
  const isAppImage = context.targets && context.targets.some(t => 
    t.name === 'appimage' || (t.target && t.target.name === 'appimage')
  );
  
  if (isAppImage || process.platform === 'linux') {
    const appOutDir = context.appOutDir;
    
    // AppRun is created by electron-builder, check in appOutDir
    const appRunPath = path.join(appOutDir, 'AppRun');
    
    console.log('Checking for AppRun at:', appRunPath);
    console.log('AppOutDir exists:', fs.existsSync(appOutDir));
    
    if (fs.existsSync(appRunPath)) {
      let appRunContent = fs.readFileSync(appRunPath, 'utf8');
      console.log('Original AppRun content:', appRunContent.substring(0, 200));
      
      // Modify AppRun to add --no-sandbox flag
      if (!appRunContent.includes('--no-sandbox')) {
        // Try multiple patterns to find the exec line
        appRunContent = appRunContent.replace(
          /(exec\s+"\$THIS"\s+"\$@")/,
          'exec "$THIS" --no-sandbox "$@"'
        );
        
        // Alternative pattern
        if (!appRunContent.includes('--no-sandbox')) {
          appRunContent = appRunContent.replace(
            /(exec\s+"\$THIS")/,
            '$1 --no-sandbox'
          );
        }
        
        // Another pattern - find the electron binary execution
        if (!appRunContent.includes('--no-sandbox')) {
          appRunContent = appRunContent.replace(
            /(".*electron"|"\$THIS")/,
            '$1 --no-sandbox'
          );
        }
      }
      
      fs.writeFileSync(appRunPath, appRunContent, { mode: 0o755 });
      console.log('Modified AppRun to include --no-sandbox flag');
      console.log('Modified AppRun content:', appRunContent.substring(0, 200));
    } else {
      console.log('AppRun not found, will be created by electron-builder');
      // AppRun might be created later, so we'll need to use afterSign or a different hook
    }
  }
};

