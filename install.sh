#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Installing z-proxy with hourly identity rotation..."

echo "Creating zen-proxy.json with 1-hour identity rotation..."
cat > zen-proxy.json << 'EOF'
{
  "identityRotateMs": 3600000
}
EOF

echo "Setting executable permission..."
chmod +x zen-proxy.mjs
chmod +x run-zen-proxy.sh
chmod +x install.sh

echo ""
echo "Setup complete. Start with:"
echo "  ./run-zen-proxy.sh"
echo ""
echo "Or run directly:"
echo "  bun zen-proxy.mjs    # recommended"
echo "  node zen-proxy.mjs   # fallback"
echo ""
echo "Health check:"
echo "  curl -s http://127.0.0.1:8787/health"