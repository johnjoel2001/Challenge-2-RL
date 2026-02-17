#!/bin/bash
# Build script for Railway deployment
# This builds the React frontend before starting the Python server

echo "Building React frontend..."
cd react-demo

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

# Build the React app
echo "Running build..."
npm run build

echo "Build complete! Frontend built to react-demo/dist"
cd ..
