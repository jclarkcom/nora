const request = require('supertest');
const { createApp, familyMembers } = require('./app');
const { io: Client } = require('socket.io-client');

describe('Nora Server Tests', () => {
  let app, server, io, rooms, tablets;
  let serverPort;

  beforeAll((done) => {
    const appInstance = createApp();
    app = appInstance.app;
    server = appInstance.server;
    io = appInstance.io;
    rooms = appInstance.rooms;
    tablets = appInstance.tablets;

    // Start server on random port
    server.listen(0, () => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    rooms.clear();
    tablets.clear();
  });

  describe('API Endpoints', () => {
    describe('GET /api/family', () => {
      it('should return list of family members', async () => {
        const response = await request(app)
          .get('/api/family')
          .expect(200);

        expect(response.body).toEqual(familyMembers);
        expect(response.body).toHaveLength(4);
        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('name');
        expect(response.body[0]).toHaveProperty('avatar');
        expect(response.body[0]).toHaveProperty('phone');
      });
    });

    describe('POST /api/call/initiate', () => {
      it('should initiate a call successfully', async () => {
        const response = await request(app)
          .post('/api/call/initiate')
          .send({
            familyMemberId: 'mom',
            roomId: 'test-room-123'
          })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('roomId', 'test-room-123');
        expect(response.body).toHaveProperty('joinUrl');
        expect(response.body.joinUrl).toContain('test-room-123');

        // Verify room was created
        expect(rooms.has('test-room-123')).toBe(true);
        const room = rooms.get('test-room-123');
        expect(room.familyMemberId).toBe('mom');
      });

      it('should return 404 for invalid family member', async () => {
        const response = await request(app)
          .post('/api/call/initiate')
          .send({
            familyMemberId: 'invalid-id',
            roomId: 'test-room-456'
          })
          .expect(404);

        expect(response.body).toHaveProperty('error', 'Family member not found');
        expect(rooms.has('test-room-456')).toBe(false);
      });
    });
  });

  describe('Socket.IO Events', () => {
    let clientSocket1, clientSocket2;

    beforeEach((done) => {
      // Create two client sockets
      clientSocket1 = Client(`http://localhost:${serverPort}`);
      clientSocket2 = Client(`http://localhost:${serverPort}`);

      let connected = 0;
      const onConnect = () => {
        connected++;
        if (connected === 2) {
          done();
        }
      };

      clientSocket1.on('connect', onConnect);
      clientSocket2.on('connect', onConnect);
    });

    afterEach(() => {
      if (clientSocket1.connected) {
        clientSocket1.disconnect();
      }
      if (clientSocket2.connected) {
        clientSocket2.disconnect();
      }
    });

    it('should register tablet', (done) => {
      const tabletId = 'test-tablet-1';

      clientSocket1.emit('register-tablet', { tabletId });

      setTimeout(() => {
        expect(tablets.has(tabletId)).toBe(true);
        expect(tablets.get(tabletId)).toBe(clientSocket1.id);
        done();
      }, 100);
    });

    it('should allow peers to join room', (done) => {
      const roomId = 'test-room-789';

      // First peer joins
      clientSocket1.emit('join-room', {
        roomId,
        peerId: 'tablet-peer-1',
        userType: 'tablet'
      });

      // First peer should be notified when second peer joins
      clientSocket1.on('peer-joined', ({ peerId, userType }) => {
        expect(peerId).toBe('family-peer-1');
        expect(userType).toBe('family');
        done();
      });

      // Second peer joins - this should trigger notification to first peer
      setTimeout(() => {
        clientSocket2.emit('join-room', {
          roomId,
          peerId: 'family-peer-1',
          userType: 'family'
        });
      }, 50);
    });

    it('should forward WebRTC offer', (done) => {
      const roomId = 'test-room-webrtc';
      const mockOffer = { type: 'offer', sdp: 'mock-sdp' };

      // Both peers join the room
      clientSocket1.emit('join-room', {
        roomId,
        peerId: 'peer-1',
        userType: 'tablet'
      });

      clientSocket2.emit('join-room', {
        roomId,
        peerId: 'peer-2',
        userType: 'family'
      });

      // Listen for offer on peer 2
      clientSocket2.on('offer', ({ offer, peerId }) => {
        expect(offer).toEqual(mockOffer);
        expect(peerId).toBe('peer-1');
        done();
      });

      // Send offer from peer 1
      setTimeout(() => {
        clientSocket1.emit('offer', {
          roomId,
          offer: mockOffer
        });
      }, 100);
    });

    it('should forward WebRTC answer', (done) => {
      const roomId = 'test-room-answer';
      const mockAnswer = { type: 'answer', sdp: 'mock-sdp' };

      // Both peers join
      clientSocket1.emit('join-room', {
        roomId,
        peerId: 'peer-1',
        userType: 'tablet'
      });

      clientSocket2.emit('join-room', {
        roomId,
        peerId: 'peer-2',
        userType: 'family'
      });

      // Listen for answer on peer 1
      clientSocket1.on('answer', ({ answer, peerId }) => {
        expect(answer).toEqual(mockAnswer);
        expect(peerId).toBe('peer-2');
        done();
      });

      // Send answer from peer 2
      setTimeout(() => {
        clientSocket2.emit('answer', {
          roomId,
          answer: mockAnswer
        });
      }, 100);
    });

    it('should forward ICE candidates', (done) => {
      const roomId = 'test-room-ice';
      const mockCandidate = { candidate: 'mock-ice-candidate' };

      clientSocket1.emit('join-room', {
        roomId,
        peerId: 'peer-1',
        userType: 'tablet'
      });

      clientSocket2.emit('join-room', {
        roomId,
        peerId: 'peer-2',
        userType: 'family'
      });

      clientSocket2.on('ice-candidate', ({ candidate, peerId }) => {
        expect(candidate).toEqual(mockCandidate);
        expect(peerId).toBe('peer-1');
        done();
      });

      setTimeout(() => {
        clientSocket1.emit('ice-candidate', {
          roomId,
          candidate: mockCandidate
        });
      }, 100);
    });

    it('should handle call end', (done) => {
      const roomId = 'test-room-end';

      // Create room first
      rooms.set(roomId, {
        familyMemberId: 'mom',
        tabletId: null,
        createdAt: Date.now()
      });

      clientSocket1.emit('join-room', {
        roomId,
        peerId: 'peer-1',
        userType: 'tablet'
      });

      clientSocket2.emit('join-room', {
        roomId,
        peerId: 'peer-2',
        userType: 'family'
      });

      clientSocket2.on('call-ended', () => {
        expect(rooms.has(roomId)).toBe(false);
        done();
      });

      setTimeout(() => {
        clientSocket1.emit('end-call', { roomId });
      }, 100);
    });

    it('should notify on peer disconnect', (done) => {
      const roomId = 'test-room-disconnect';

      clientSocket1.emit('join-room', {
        roomId,
        peerId: 'peer-1',
        userType: 'tablet'
      });

      clientSocket2.emit('join-room', {
        roomId,
        peerId: 'peer-2',
        userType: 'family'
      });

      clientSocket2.on('peer-disconnected', ({ peerId }) => {
        expect(peerId).toBe('peer-1');
        done();
      });

      setTimeout(() => {
        clientSocket1.disconnect();
      }, 100);
    });
  });
});
