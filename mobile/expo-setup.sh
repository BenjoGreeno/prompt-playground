#!/bin/bash
# Quick Expo setup script

echo "Setting up Expo app..."
cd ..
npx create-expo-app TaskMetricsMobile
cd TaskMetricsMobile

# Install dependencies
npm install @react-native-async-storage/async-storage

# Copy our app files
cp ../mobile/src/App.js ./App.js
cp ../mobile/src/api.js ./api.js

echo "Setup complete! Run: npx expo start"