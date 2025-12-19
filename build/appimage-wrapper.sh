#!/bin/bash
# Wrapper script for AppImage to add --no-sandbox flag
exec "$(dirname "$0")/web-controller" --no-sandbox "$@"

