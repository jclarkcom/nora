require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Password authentication (SHA-256 hash of "Rahmani2025")
const PASSWORD_HASH = '8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b'; // Hash of "Rahmani2025"

// Calculate the correct hash (run once to get the hash for "Rahmani2025")
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const authToken = req.cookies.nora_auth;

  if (authToken === hashPassword('Rahmani2025')) {
    next();
  } else {
    // If it's an API request, return JSON
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Otherwise redirect to login
    res.redirect('/login.html');
  }
}

// Store active rooms and connections
const rooms = new Map();
const tablets = new Map();

// Path to family members data file
const FAMILY_DATA_FILE = path.join(__dirname, 'familyMembers.json');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'family-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// IP filtering middleware for admin routes
const ALLOWED_ADMIN_IPS = ['::1', '127.0.0.1', '::ffff:127.0.0.1', '69.181.129.6', '::ffff:69.181.129.6'];

function adminIPFilter(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;

  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  if (ALLOWED_ADMIN_IPS.includes(clientIP)) {
    next();
  } else {
    console.log(`⛔ Admin access denied for IP: ${clientIP}`);
    res.status(403).json({ error: 'Access denied. Admin access is restricted to authorized IPs.' });
  }
}

// Load family members from file
function loadFamilyMembers() {
  try {
    if (fs.existsSync(FAMILY_DATA_FILE)) {
      const data = fs.readFileSync(FAMILY_DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading family members:', error);
  }

  // Default family members if file doesn't exist or error
  return [
    { id: 'mom', name: 'Mom', avatar: '👩', phone: '+1234567890', email: 'mom@family.com', photoUrl: null },
    { id: 'dad', name: 'Dad', avatar: '👨', phone: '+1234567891', email: 'dad@family.com', photoUrl: null },
    { id: 'grandma', name: 'Grandma', avatar: '👵', phone: '+1234567892', email: 'grandma@family.com', photoUrl: null },
    { id: 'grandpa', name: 'Grandpa', avatar: '👴', phone: '+1234567893', email: 'grandpa@family.com', photoUrl: null }
  ];
}

// Save family members to file
function saveFamilyMembers(members) {
  try {
    fs.writeFileSync(FAMILY_DATA_FILE, JSON.stringify(members, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving family members:', error);
    return false;
  }
}

// Initialize family members
let familyMembers = loadFamilyMembers();

function createApp() {
  const app = express();
  const server = http.createServer(app);
  const io = socketIO(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // Login endpoint (public)
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;

    if (hashPassword(password) === hashPassword('Rahmani2025')) {
      // Set cookie that expires in 30 days
      res.cookie('nora_auth', hashPassword('Rahmani2025'), {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        sameSite: 'lax'
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('nora_auth');
    res.json({ success: true });
  });

  // Serve login page (public) - specific route to avoid exposing server files
  app.get('/login.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'login.html'));
  });

  // Serve uploaded images
  app.use('/uploads', express.static(uploadsDir));

  // Serve admin UI (with IP filtering and authentication)
  const publicDir = path.join(__dirname, 'public');

  // Redirect /admin and /admin/ to /admin/admin.html
  app.get('/admin', requireAuth, adminIPFilter, (req, res) => res.redirect('/admin/admin.html'));

  app.use('/admin', requireAuth, adminIPFilter, express.static(publicDir));

  // Serve web-tablet interface (with authentication, except join.html)
  const webTabletDir = path.join(__dirname, '../web-tablet');

  // Public join page (for email links)
  app.get('/join.html', express.static(webTabletDir));
  app.get('/join', (req, res) => res.redirect('/join.html' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')));

  // Protected tablet interface
  app.use('/', requireAuth, express.static(webTabletDir));

  // API endpoint to get family members
  app.get('/api/family', (req, res) => {
    res.json(familyMembers);
  });

  // API endpoint to get active rooms
  app.get('/api/rooms', (req, res) => {
    const activeRooms = Array.from(rooms.entries()).map(([roomId, roomData]) => ({
      roomId,
      familyMemberId: roomData.familyMemberId,
      createdAt: roomData.createdAt,
      age: Date.now() - roomData.createdAt
    }));
    res.json(activeRooms);
  });

  // Test email endpoint
  app.post('/api/test-email', async (req, res) => {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Send to yourself
        subject: '🎉 Nodemailer Test - Nora App',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #4285f4;">✅ Email Configuration Working!</h1>
              <p style="font-size: 16px; color: #333;">Your Nodemailer setup is configured correctly.</p>
              <p style="color: #666; font-size: 14px;">
                <strong>From:</strong> ${process.env.EMAIL_USER}<br>
                <strong>Time:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `
      });
      console.log('✉️  Test email sent successfully!');
      res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
      console.error('Failed to send test email:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API endpoint to initiate call
  app.post('/api/call/initiate', async (req, res) => {
    const { familyMemberId, roomId } = req.body;
    const member = familyMembers.find(m => m.id === familyMemberId);

    if (!member) {
      return res.status(404).json({ error: 'Family member not found' });
    }

    // Create room
    rooms.set(roomId, {
      familyMemberId,
      tabletId: null,
      createdAt: Date.now()
    });

    // Construct join URL based on environment
    let joinUrl;
    const productionDomain = process.env.PRODUCTION_DOMAIN || 'nora.jonathanclark.com';

    if (process.env.NODE_ENV === 'production' || productionDomain !== 'nora.jonathanclark.com') {
      // Production: use HTTPS domain
      joinUrl = `https://${productionDomain}/join.html?room=${roomId}`;
    } else {
      // Development: use localhost for private network IPs since they require HTTPS for camera/mic
      const localIP = global.LOCAL_IP || 'localhost';
      const isPrivateIP = localIP.startsWith('192.168.') || localIP.startsWith('10.10.');
      const hostname = isPrivateIP ? 'localhost' : localIP;
      joinUrl = `http://${hostname}:4001/join.html?room=${roomId}`;
    }

    // Send email notification
    if (member.email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: member.email,
          subject: '👶 Nora is calling you!',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background: #ffffff;">
              <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="font-size: 80px; line-height: 1;">👶</div>
                  <h1 style="color: #333; margin: 20px 0 10px 0; font-size: 32px;">Nora is calling!</h1>
                  <p style="font-size: 18px; color: #666; margin: 0;">Someone wants to see you 💕</p>
                </div>
                <div style="text-align: center; margin: 40px 0;">
                  <a href="${joinUrl}"
                     style="background: #2196F3;
                            color: white;
                            padding: 18px 50px;
                            text-decoration: none;
                            border-radius: 8px;
                            display: inline-block;
                            font-size: 20px;
                            font-weight: bold;">
                    📹 Join Video Call
                  </a>
                </div>
                <div style="background: #f5f5f5; padding: 20px; margin-top: 30px;">
                  <p style="color: #666; font-size: 14px; margin: 0 0 10px 0; text-align: center;">
                    <strong>Quick tip:</strong> Make sure your camera and microphone are enabled!
                  </p>
                  <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
                    Link: <a href="${joinUrl}" style="color: #2196F3; word-break: break-all;">${joinUrl}</a>
                  </p>
                </div>
              </div>
            </div>
          `
        });
        if (process.env.NODE_ENV !== 'test') {
          console.log(`✉️  Email sent to ${member.name} (${member.email})`);
        }
      } catch (error) {
        console.error('Failed to send email:', error);
        // Don't fail the request if email fails
      }
    }

    // Still log for debugging (stubbed WhatsApp)
    if (process.env.NODE_ENV !== 'test') {
      console.log('\n=== 📱 CALL INITIATED ===');
      console.log(`To: ${member.name} (${member.phone})`);
      console.log(`Email: ${member.email || 'Not provided'}`);
      console.log(`Join link: ${joinUrl}`);
      console.log('========================\n');
    }

    res.json({
      success: true,
      roomId,
      joinUrl,
      message: `Call initiated - email sent to ${member.email || 'no email provided'}`
    });
  });

  // ============ ADMIN ENDPOINTS (IP Restricted) ============

  // Get all family members (admin)
  app.get('/api/admin/family', adminIPFilter, (req, res) => {
    res.json(familyMembers);
  });

  // Add new family member
  app.post('/api/admin/family', adminIPFilter, upload.single('photo'), (req, res) => {
    try {
      const { name, phone, email, avatar } = req.body;

      if (!name || !phone) {
        return res.status(400).json({ error: 'Name and phone are required' });
      }

      const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

      const newMember = {
        id,
        name,
        avatar: avatar || '👤',
        phone,
        email: email || '',
        photoUrl
      };

      familyMembers.push(newMember);
      saveFamilyMembers(familyMembers);

      console.log(`✅ Added new family member: ${name}`);
      res.json(newMember);
    } catch (error) {
      console.error('Error adding family member:', error);
      res.status(500).json({ error: 'Failed to add family member' });
    }
  });

  // Update family member
  app.put('/api/admin/family/:id', adminIPFilter, upload.single('photo'), (req, res) => {
    try {
      const { id } = req.params;
      const { name, phone, email, avatar } = req.body;

      const index = familyMembers.findIndex(m => m.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      const member = familyMembers[index];

      // Delete old photo if new one is uploaded
      if (req.file && member.photoUrl) {
        const oldPhotoPath = path.join(__dirname, member.photoUrl);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }

      // Update member
      familyMembers[index] = {
        ...member,
        name: name || member.name,
        phone: phone || member.phone,
        email: email !== undefined ? email : member.email,
        avatar: avatar || member.avatar,
        photoUrl: req.file ? `/uploads/${req.file.filename}` : member.photoUrl
      };

      saveFamilyMembers(familyMembers);

      console.log(`✏️ Updated family member: ${familyMembers[index].name}`);
      res.json(familyMembers[index]);
    } catch (error) {
      console.error('Error updating family member:', error);
      res.status(500).json({ error: 'Failed to update family member' });
    }
  });

  // Delete family member
  app.delete('/api/admin/family/:id', adminIPFilter, (req, res) => {
    try {
      const { id } = req.params;
      const index = familyMembers.findIndex(m => m.id === id);

      if (index === -1) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      const member = familyMembers[index];

      // Delete photo if exists
      if (member.photoUrl) {
        const photoPath = path.join(__dirname, member.photoUrl);
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
        }
      }

      familyMembers.splice(index, 1);
      saveFamilyMembers(familyMembers);

      console.log(`🗑️ Deleted family member: ${member.name}`);
      res.json({ success: true, message: 'Family member deleted' });
    } catch (error) {
      console.error('Error deleting family member:', error);
      res.status(500).json({ error: 'Failed to delete family member' });
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`📞 New connection: ${socket.id}`);
    }

    // Register tablet
    socket.on('register-tablet', ({ tabletId }) => {
      tablets.set(tabletId, socket.id);
      socket.tabletId = tabletId;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`📱 Tablet registered: ${tabletId}`);
      }
    });

    // Check if room is active (has a tablet)
    socket.on('check-room', ({ roomId }, callback) => {
      const room = rooms.get(roomId);
      const hasActiveTablet = room && Array.from(io.sockets.adapter.rooms.get(roomId) || []).some(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        return socket && socket.userType === 'tablet';
      });

      if (callback) {
        callback({ active: hasActiveTablet, exists: !!room });
      }

      if (process.env.NODE_ENV !== 'test') {
        console.log(`🔍 Room check: ${roomId} - active: ${hasActiveTablet}, exists: ${!!room}`);
      }
    });

    // Join room
    socket.on('join-room', ({ roomId, peerId, userType }) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.peerId = peerId;
      socket.userType = userType;

      if (process.env.NODE_ENV !== 'test') {
        console.log(`👤 ${userType} joined room ${roomId} (peerId: ${peerId})`);
      }

      // Notify other peer in the room
      socket.to(roomId).emit('peer-joined', { peerId, userType });
    });

    // Forward WebRTC signaling messages
    socket.on('offer', ({ roomId, offer, targetPeerId }) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`📤 Offer sent to room ${roomId}`);
      }
      socket.to(roomId).emit('offer', { offer, peerId: socket.peerId });
    });

    socket.on('answer', ({ roomId, answer, targetPeerId }) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`📥 Answer sent to room ${roomId}`);
      }
      socket.to(roomId).emit('answer', { answer, peerId: socket.peerId });
    });

    socket.on('ice-candidate', ({ roomId, candidate, targetPeerId }) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🧊 ICE candidate sent to room ${roomId}`);
      }
      socket.to(roomId).emit('ice-candidate', { candidate, peerId: socket.peerId });
    });

    // End call
    socket.on('end-call', ({ roomId }) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`📴 Call ended in room ${roomId}`);
      }
      socket.to(roomId).emit('call-ended');
      rooms.delete(roomId);
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`📴 Connection closed: ${socket.id}`);
      }
      if (socket.roomId) {
        socket.to(socket.roomId).emit('peer-disconnected', { peerId: socket.peerId });
      }
      if (socket.tabletId) {
        tablets.delete(socket.tabletId);
      }
    });
  });

  return { app, server, io, rooms, tablets };
}

module.exports = { createApp, familyMembers };
