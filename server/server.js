const { createApp } = require('./app');
const os = require('os');

// Get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIPAddress();
global.LOCAL_IP = localIP; // Make available to app.js

const { server } = createApp();

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 Nora Server running on port ${PORT}`);
  console.log(`📱 Tablet web app: http://${localIP}:4001`);
  console.log(`👨‍👩‍👧 Family join page: http://${localIP}:4001/join/{roomId}\n`);
});
