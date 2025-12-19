#!/bin/bash
# Create a launcher script for the AppImage
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/../dist"
mkdir -p "$DIST_DIR"

cat > "$DIST_DIR/web-controller-launcher.sh" << 'EOF'
#!/bin/bash
# Launcher script for Web Controller AppImage
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/Web Controller-1.0.0.AppImage" --no-sandbox "$@"
EOF
chmod +x "$DIST_DIR/web-controller-launcher.sh"
echo "Created launcher script: dist/web-controller-launcher.sh"

