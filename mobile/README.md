# Task Metrics Mobile (React Native)

## Setup

1. Install React Native CLI:
```bash
npm install -g react-native-cli
```

2. Install dependencies:
```bash
cd mobile
npm install
```

3. Start backend server:
```bash
cd ../
docker compose up -d
```

4. Run on Android:
```bash
npx react-native run-android
```

## Key Changes from Web Version

- Uses `AsyncStorage` instead of browser storage
- Native UI components (`View`, `Text`, `TouchableOpacity`)
- Android emulator uses `10.0.2.2:8001` for localhost
- Simplified CSRF handling for mobile context
- Native styling with `StyleSheet`

## Backend Connection

The mobile app connects to your existing FastAPI backend. Make sure:
- Backend is running on `localhost:8001`
- Android emulator can access via `10.0.2.2:8001`
- For physical device, use your computer's IP address