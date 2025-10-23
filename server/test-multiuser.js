#!/usr/bin/env node
/**
 * Multi-User Call Test
 * Tests that multiple family members can join the same room without ending the call
 */

const io = require('socket.io-client');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';
const TEST_ROOM_ID = 'test-room-' + Date.now();

class TestClient {
    constructor(name, userType, peerId) {
        this.name = name;
        this.userType = userType;
        this.peerId = peerId;
        this.socket = null;
        this.connected = false;
        this.inCall = false;
        this.receivedOffers = [];
        this.receivedAnswers = [];
        this.receivedIceCandidates = [];
        this.peerDisconnects = [];
    }

    connect() {
        return new Promise((resolve, reject) => {
            console.log(`[${this.name}] Connecting to ${SERVER_URL}...`);

            this.socket = io(SERVER_URL, {
                transports: ['websocket']
            });

            this.socket.on('connect', () => {
                this.connected = true;
                console.log(`[${this.name}] ✅ Connected (${this.userType})`);
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error(`[${this.name}] ❌ Connection error:`, error.message);
                reject(error);
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
                console.log(`[${this.name}] 🔌 Disconnected`);
            });

            // WebRTC signaling events
            this.socket.on('offer', ({ offer, peerId }) => {
                console.log(`[${this.name}] 📥 Received offer from ${peerId}`);
                this.receivedOffers.push({ peerId, offer });

                // Simulate answering
                setTimeout(() => {
                    console.log(`[${this.name}] 📤 Sending answer to ${peerId}`);
                    this.socket.emit('answer', {
                        roomId: TEST_ROOM_ID,
                        answer: { type: 'answer', sdp: 'test-sdp' },
                        targetPeerId: peerId
                    });
                }, 100);
            });

            this.socket.on('answer', ({ answer, peerId }) => {
                console.log(`[${this.name}] 📥 Received answer from ${peerId}`);
                this.receivedAnswers.push({ peerId, answer });
            });

            this.socket.on('ice-candidate', ({ candidate, peerId }) => {
                this.receivedIceCandidates.push({ peerId, candidate });
            });

            this.socket.on('peer-joined', ({ peerId, userType }) => {
                console.log(`[${this.name}] 👤 Peer joined: ${peerId} (${userType})`);

                // If this is the tablet, send offer to new family member
                if (this.userType === 'tablet' && userType === 'family') {
                    setTimeout(() => {
                        console.log(`[${this.name}] 📤 Sending offer to ${peerId}`);
                        this.socket.emit('offer', {
                            roomId: TEST_ROOM_ID,
                            offer: { type: 'offer', sdp: 'test-sdp' },
                            targetPeerId: peerId
                        });
                    }, 50);
                }
            });

            this.socket.on('peer-disconnected', ({ peerId, userType }) => {
                console.log(`[${this.name}] 👋 Peer disconnected: ${peerId} (${userType})`);
                this.peerDisconnects.push({ peerId, userType });
            });

            this.socket.on('call-ended', () => {
                console.log(`[${this.name}] ☎️  Call ended`);
                this.inCall = false;
            });
        });
    }

    joinRoom() {
        return new Promise((resolve) => {
            console.log(`[${this.name}] 📞 Joining room ${TEST_ROOM_ID}...`);
            this.socket.emit('join-room', {
                roomId: TEST_ROOM_ID,
                peerId: this.peerId,
                userType: this.userType
            });
            this.inCall = true;
            setTimeout(resolve, 100);
        });
    }

    disconnect() {
        if (this.socket) {
            console.log(`[${this.name}] 🔌 Disconnecting...`);
            this.socket.disconnect();
        }
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('\n========================================');
    console.log('  Multi-User Call Test');
    console.log('========================================\n');
    console.log(`Room ID: ${TEST_ROOM_ID}\n`);

    let testsPassed = 0;
    let testsFailed = 0;

    try {
        // Test 1: Tablet and 2 family members join
        console.log('\n📋 Test 1: Multiple family members join without ending call\n');

        const tablet = new TestClient('Tablet', 'tablet', 'tablet-test-001');
        const family1 = new TestClient('Family1', 'family', 'family-test-001');
        const family2 = new TestClient('Family2', 'family', 'family-test-002');

        // Connect all clients
        await tablet.connect();
        await family1.connect();
        await family2.connect();

        // Tablet joins first
        await tablet.joinRoom();
        await sleep(500);

        // Family member 1 joins
        console.log('\n--- Family Member 1 Joining ---\n');
        await family1.joinRoom();
        await sleep(1000);

        // Verify family1 received offer from tablet
        if (family1.receivedOffers.length > 0) {
            console.log('✅ Family1 received offer from tablet');
            testsPassed++;
        } else {
            console.log('❌ Family1 did NOT receive offer from tablet');
            testsFailed++;
        }

        // Verify tablet received answer from family1
        if (tablet.receivedAnswers.length > 0) {
            console.log('✅ Tablet received answer from Family1');
            testsPassed++;
        } else {
            console.log('❌ Tablet did NOT receive answer from Family1');
            testsFailed++;
        }

        // Family member 2 joins
        console.log('\n--- Family Member 2 Joining ---\n');
        await family2.joinRoom();
        await sleep(1000);

        // Verify family2 received offer from tablet
        if (family2.receivedOffers.length > 0) {
            console.log('✅ Family2 received offer from tablet');
            testsPassed++;
        } else {
            console.log('❌ Family2 did NOT receive offer from tablet');
            testsFailed++;
        }

        // Verify call is still active for family1 (not ended)
        if (family1.inCall) {
            console.log('✅ Family1 still in call after Family2 joined');
            testsPassed++;
        } else {
            console.log('❌ Family1 call ENDED when Family2 joined');
            testsFailed++;
        }

        // Verify tablet has connections to both family members
        if (tablet.receivedAnswers.length >= 2) {
            console.log('✅ Tablet received answers from both family members');
            testsPassed++;
        } else {
            console.log(`❌ Tablet only received ${tablet.receivedAnswers.length} answer(s), expected 2`);
            testsFailed++;
        }

        // Test 2: Family member leaves, others stay connected
        console.log('\n📋 Test 2: One family member leaves, others stay connected\n');

        family1.disconnect();
        await sleep(1000);

        // Verify family2 and tablet are still in call
        if (family2.inCall) {
            console.log('✅ Family2 still in call after Family1 left');
            testsPassed++;
        } else {
            console.log('❌ Family2 call ENDED when Family1 left');
            testsFailed++;
        }

        if (tablet.inCall) {
            console.log('✅ Tablet still in call after Family1 left');
            testsPassed++;
        } else {
            console.log('❌ Tablet call ENDED when Family1 left');
            testsFailed++;
        }

        // Test 3: Tablet disconnects, call ends for everyone
        console.log('\n📋 Test 3: Tablet disconnects, call ends for family members\n');

        tablet.disconnect();
        await sleep(1000);

        // Verify family2 received disconnect event with tablet userType
        const tabletDisconnect = family2.peerDisconnects.find(d => d.userType === 'tablet');
        if (tabletDisconnect) {
            console.log('✅ Family2 received tablet disconnect event');
            testsPassed++;
        } else {
            console.log('❌ Family2 did NOT receive tablet disconnect event');
            testsFailed++;
        }

        // Cleanup
        family2.disconnect();

        // Summary
        console.log('\n========================================');
        console.log('  Test Results');
        console.log('========================================\n');
        console.log(`✅ Passed: ${testsPassed}`);
        console.log(`❌ Failed: ${testsFailed}`);
        console.log(`📊 Total:  ${testsPassed + testsFailed}\n`);

        if (testsFailed === 0) {
            console.log('🎉 All tests passed!\n');
            process.exit(0);
        } else {
            console.log('⚠️  Some tests failed.\n');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Test error:', error);
        process.exit(1);
    }
}

// Run tests
runTests().catch(console.error);
