#!/bin/bash

echo "======================================================="
echo "          Cap Hashcat Web - Linux/macOS Launcher       "
echo "======================================================="
echo ""

# Helper for colored output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
    if command -v apt-get &> /dev/null; then
        read -p "Would you like to install Node.js via apt now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
        else
            exit 1
        fi
    else
        echo "Please install Node.js manually."
        exit 1
    fi
fi
NODE_VER=$(node -v)
echo -e "${GREEN}[OK] Node.js found: $NODE_VER${NC}"


if ! command -v hashcat &> /dev/null && [ ! -f "./hashcat/hashcat.bin" ]; then
    echo -e "${YELLOW}[WARNING] hashcat binary not found in PATH or project directory.${NC}"
    echo "The web interface will start, but cracking will not work."
    read -p "Would you like to automatically download and install hashcat to the project folder? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if ! command -v 7z &> /dev/null; then
            echo "Installing 7zip to extract hashcat..."
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y p7zip-full
            else
                echo -e "${RED}[ERROR] Please install 7zip manually to extract hashcat.${NC}"
                exit 1
            fi
        fi
        echo "Downloading Hashcat v6.2.6..."
        curl -L -o hashcat.7z https://github.com/hashcat/hashcat/releases/download/v6.2.6/hashcat-6.2.6.7z
        echo "Extracting Hashcat..."
        7z x hashcat.7z -y > /dev/null
        mv hashcat-6.2.6 hashcat
        rm hashcat.7z
        echo -e "${GREEN}[OK] Hashcat installed successfully to the local directory!${NC}"
    fi
else
    echo -e "${GREEN}[OK] hashcat found.${NC}"
fi

# 4. Check hcxpcapngtool (Linux Native Converter)
if ! command -v hcxpcapngtool &> /dev/null; then
    echo -e "${YELLOW}[WARNING] hcxpcapngtool is not installed.${NC}"
    echo "This is the recommended tool for converting cap files."
    
    # Offer to install if on Debian/Ubuntu
    if command -v apt-get &> /dev/null; then
        read -p "Would you like to install hcxtools via apt now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo apt-get update && sudo apt-get install -y hcxtools
            if command -v hcxpcapngtool &> /dev/null; then
                echo -e "${GREEN}[OK] hcxtools installed successfully.${NC}"
            else
                echo -e "${RED}[ERROR] Failed to install hcxtools. We will use the native JS fallback converter.${NC}"
            fi
        else
            echo "Skipping. We will use the native JS fallback converter."
        fi
    else
        echo "We will use the native JS fallback converter."
    fi
else
    echo -e "${GREEN}[OK] hcxpcapngtool found.${NC}"
fi

# 5. Install npm dependencies if missing
if [ ! -d "node_modules" ]; then
    echo ""
    echo "Installing required npm packages..."
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] Failed to install npm dependencies.${NC}"
        exit 1
    fi
fi

# Open browser (cross-platform open command)
echo "Opening browser to http://localhost:3000..."
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000 &
elif command -v open &> /dev/null; then
    open http://localhost:3000 &
fi

# Wait a couple seconds
sleep 2

echo ""
echo "Starting Cap Hashcat Web server..."
echo -e "${YELLOW}Press Ctrl+C to stop the server.${NC}"
echo ""

# Start the server in the foreground
node server/index.js
