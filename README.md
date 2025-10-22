# Nora - Baby Video Call Table

A baby-friendly video calling app that lets babies easily call family members by touching their photos. Available in both web and React Native Android versions.

## Project Structure

```
nora/
├── server/           # Node.js WebRTC signaling server
├── web-tablet/       # Web version for tablet (fullscreen Chrome)
├── native-tablet/    # React Native Android app
└── README.md
```

## Features

- Simple, baby-friendly interface with large touch targets
- Video calling using WebRTC
- Multiple implementations: Web and React Native
- Stubbed WhatsApp notifications (logs to console)
- Real-time signaling via Socket.IO
- Family members can join via web browser (no app required)
- **Admin Panel** for managing family members
  - Add/edit/delete family members
  - Upload family photos
  - Manage contact information (phone, email)
  - IP-restricted access for security

## Setup Instructions

### 1. Server Setup

```bash
cd server
npm install
npm start
```

The server will run on `http://localhost:4000`

### 2. Web Tablet Setup

```bash
cd web-tablet
npm install
npm start
```

The web app will be available at `http://localhost:4001`

**To run in fullscreen Chrome:**
1. Open Chrome and navigate to `http://localhost:4001`
2. Press `F11` for fullscreen, or
3. Click the menu (⋮) → "More tools" → "Create shortcut" → Check "Open as window"
4. Tap anywhere to enter fullscreen mode automatically

### 3. React Native Android Setup

**Prerequisites:**
- Android SDK installed
- Android emulator running or physical device connected
- Node.js 18+

```bash
cd native-tablet
npm install
npm run android
```

**Note:** The app uses `http://10.0.2.2:4000` to connect to the server (Android emulator's localhost). If using a physical device, update the `SERVER_URL` in `App.tsx` to your computer's IP address.

## How It Works

### Making a Call

1. **Tablet (Baby's device):**
   - Shows a grid of family member avatars
   - Baby taps on a family member's photo
   - App sends call initiation request to server
   - Server logs WhatsApp notification (stubbed)
   - Tablet waits for family member to join

2. **Server:**
   - Creates a unique room ID
   - Logs a stubbed WhatsApp message with join link
   - Handles WebRTC signaling between peers

3. **Family Member:**
   - Receives join link (currently shown in server console)
   - Opens link in browser: `http://localhost:4001/join/{roomId}`
   - Grants camera/microphone permissions
   - Clicks "Join Call"
   - Video call connects!

### Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Tablet    │◄────────►│   Server    │◄────────►│   Family    │
│  (Baby's)   │  Socket  │  (Signaling)│  Socket  │  (Browser)  │
│             │          │             │          │             │
│  WebRTC     │◄─────────────────────────────────►│   WebRTC    │
│  (Direct)   │      P2P Video/Audio              │  (Direct)   │
└─────────────┘                                   └─────────────┘
```

- **Server**: Handles signaling and room management
- **WebRTC**: Peer-to-peer video/audio connection (not routed through server)
- **STUN servers**: Help establish P2P connection through NAT/firewalls

## Admin Panel

Manage family members through the web-based admin interface.

### Access the Admin Panel

```
http://localhost:4000/admin/admin.html
```

**Security**: Access is restricted to authorized IP addresses only:
- `localhost` (127.0.0.1)
- `69.181.129.6`

### Features

- **Add Family Members**: Name, phone, email, and photo
- **Edit Members**: Update information and photos
- **Delete Members**: Remove family members (also deletes photos)
- **Photo Upload**: Support for JPG, PNG, GIF, WebP (max 5MB)
- **Real-time Updates**: Changes appear immediately on tablets

### Quick Start

1. Access `http://localhost:4000/admin/admin.html`
2. Fill in the form to add a family member
3. Optionally upload a photo (or use an emoji avatar)
4. Click "Add Member"
5. The new member appears on the tablet instantly

For detailed instructions, see [ADMIN_GUIDE.md](./ADMIN_GUIDE.md)

## Configuration

### Managing Family Members

**Recommended**: Use the Admin Panel at `http://localhost:4000/admin/admin.html`

**Alternative**: Manually edit `server/familyMembers.json`:

```json
[
  {
    "id": "mom",
    "name": "Mom",
    "avatar": "👩",
    "phone": "+1234567890",
    "email": "mom@family.com",
    "photoUrl": null
  }
]
```

Restart the server after manual changes.

### WhatsApp Integration (To-Do)

The app currently stubs WhatsApp notifications by logging to the console. To implement real WhatsApp notifications:

1. Sign up for [WhatsApp Business API](https://business.whatsapp.com/products/business-platform)
2. Or use a service like [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
3. Update `server/server.js` in the `/api/call/initiate` endpoint
4. Replace the console.log with actual WhatsApp message sending

### Using Physical Device IP

If testing with a physical Android device instead of emulator:

1. Find your computer's local IP (e.g., `192.168.1.100`)
2. Update `SERVER_URL` in `native-tablet/App.tsx`:
   ```typescript
   const SERVER_URL = 'http://192.168.1.100:4000';
   ```
3. Ensure both devices are on the same network

## Testing the Complete Flow

1. **Start the server:**
   ```bash
   cd server && npm start
   ```

2. **Start the web tablet OR React Native app:**

   Web version:
   ```bash
   cd web-tablet && npm start
   ```

   OR Native version:
   ```bash
   cd native-tablet && npm run android
   ```

3. **Initiate a call:**
   - On the tablet, tap a family member's avatar
   - Check server console for the join link

4. **Family member joins:**
   - Open the join link in another browser/device
   - Click "Join Call"
   - Grant camera/microphone permissions

5. **Video call established!**

## Running Tests

The project includes comprehensive automated tests for both server and React Native app.

### Run All Tests

```bash
# Server tests (10 tests)
cd server && npm test

# React Native tests (8 tests)
cd native-tablet && npm test
```

### Test Coverage

**Server Tests (✅ 10/10 passing)**:
- REST API endpoints (family members, call initiation)
- WebRTC signaling via Socket.IO
- Room management
- Peer connection handling
- ICE candidate forwarding

**React Native Tests (✅ 8/8 passing)**:
- Component rendering
- Socket.IO connection
- API integration
- State management
- Cleanup on unmount

See [TEST_RESULTS.md](./TEST_RESULTS.md) for detailed test results.

## Troubleshooting

### Web Tablet Issues

- **Camera not working:** Ensure you're using HTTPS or localhost (browsers restrict camera access otherwise)
- **Fullscreen not triggering:** Click anywhere on the page first
- **Connection fails:** Check that the server is running on port 4000

### React Native Issues

- **Build fails:** Ensure Android SDK is properly installed
- **Camera permission denied:** Manually grant permissions in Android settings
- **Can't connect to server:**
  - Emulator: Use `10.0.2.2:4000`
  - Physical device: Use your computer's IP address
- **Metro bundler issues:** Run `npm start -- --reset-cache`

### WebRTC Connection Issues

- **Peers can't connect:** Check firewall settings
- **No video/audio:** Verify camera/microphone permissions
- **One-way video:** Check that both peers granted permissions

## Dependencies

### Server
- Express - Web server
- Socket.IO - Real-time communication
- CORS - Cross-origin resource sharing

### Web Tablet
- Socket.IO Client - Real-time communication
- Native WebRTC APIs - Video calling

### Native Tablet
- React Native 0.76
- react-native-webrtc - WebRTC for React Native
- socket.io-client - Real-time communication

## Future Enhancements

- [ ] Implement real WhatsApp Business API integration
- [ ] Add call history and statistics
- [ ] Support for group video calls
- [ ] Add fun filters and effects for babies
- [ ] Offline mode with call scheduling
- [ ] Push notifications for family members
- [ ] Custom ringtones per family member
- [ ] Record video messages

## License

MIT
