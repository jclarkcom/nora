// Dynamically determine server URL based on current host
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000'
    : window.location.origin;
const TABLET_ID = 'tablet-' + Math.random().toString(36).substr(2, 9);

class VideoCallApp {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentRoomId = null;
        this.currentFamilyMember = null;

        this.screens = {
            family: document.getElementById('family-screen'),
            calling: document.getElementById('calling-screen'),
            video: document.getElementById('video-screen')
        };

        // Zoom and pan state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastTouchDistance = 0;
        this.zoomControlsSetup = false;

        this.init();
    }

    async init() {
        // Connect to signaling server
        this.socket = io(SERVER_URL);

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.socket.emit('register-tablet', { tabletId: TABLET_ID });
        });

        // Handle peer joined
        this.socket.on('peer-joined', async ({ peerId, userType }) => {
            console.log('Peer joined:', peerId, userType);
            if (userType === 'family') {
                await this.startCall();
            }
        });

        // Handle WebRTC signaling
        this.socket.on('offer', async ({ offer, peerId }) => {
            console.log('Received offer from', peerId);
            await this.handleOffer(offer);
        });

        this.socket.on('answer', async ({ answer, peerId }) => {
            console.log('Received answer from', peerId);
            await this.handleAnswer(answer);
        });

        this.socket.on('ice-candidate', async ({ candidate, peerId }) => {
            console.log('Received ICE candidate from', peerId);
            await this.handleIceCandidate(candidate);
        });

        this.socket.on('call-ended', () => {
            console.log('Call ended by peer');
            this.endCall();
        });

        this.socket.on('peer-disconnected', () => {
            console.log('Peer disconnected');
            this.endCall();
        });

        // Load family members
        await this.loadFamilyMembers();

        // Setup event listeners
        this.setupEventListeners();

        // Request fullscreen on first interaction
        document.body.addEventListener('click', () => {
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(console.error);
            }
        }, { once: true });
    }

    calculateOptimalLayout(count) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const padding = 20;
        const gap = 10;

        const availableWidth = width - padding;
        const availableHeight = height - padding;

        let bestLayout = { cols: 1, rows: 1, cardWidth: availableWidth, cardHeight: availableHeight };
        let bestWaste = Infinity;

        // Try different column/row combinations
        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);

            const cardWidth = (availableWidth - (cols - 1) * gap) / cols;
            const cardHeight = (availableHeight - (rows - 1) * gap) / rows;

            // Prefer layouts that make cards more square-ish
            const aspectRatio = cardWidth / cardHeight;
            const waste = Math.abs(aspectRatio - 1) + (cols * rows - count) * 0.1;

            if (waste < bestWaste && cardWidth > 150 && cardHeight > 150) {
                bestWaste = waste;
                bestLayout = { cols, rows, cardWidth, cardHeight };
            }
        }

        return bestLayout;
    }

    async loadFamilyMembers() {
        try {
            const response = await fetch(`${SERVER_URL}/api/family`);
            let familyMembers = await response.json();

            // Sort: members with photos first, then emoji avatars
            familyMembers = familyMembers.sort((a, b) => {
                const aHasPhoto = a.photoUrl && a.photoUrl.trim() !== '';
                const bHasPhoto = b.photoUrl && b.photoUrl.trim() !== '';
                if (aHasPhoto && !bHasPhoto) return -1;
                if (!aHasPhoto && bHasPhoto) return 1;
                return 0; // Keep original order for same type
            });

            const grid = document.getElementById('family-grid');
            const layout = this.calculateOptimalLayout(familyMembers.length);

            // Apply dynamic grid layout
            grid.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
            grid.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
            grid.style.gap = '10px';
            grid.style.padding = '10px';
            grid.style.width = '100vw';
            // Use window.innerHeight for iOS compatibility
            grid.style.height = `${window.innerHeight}px`;

            grid.innerHTML = familyMembers.map(member => `
                <div class="family-card" data-member-id="${member.id}">
                    <div class="family-avatar">
                        ${member.photoUrl
                            ? `<img src="${SERVER_URL}${member.photoUrl}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 15px;">`
                            : member.avatar}
                    </div>
                </div>
            `).join('');

            // Add click handlers
            document.querySelectorAll('.family-card').forEach(card => {
                card.addEventListener('click', () => {
                    const memberId = card.dataset.memberId;
                    const member = familyMembers.find(m => m.id === memberId);
                    this.initiateCall(member);
                });
            });

            // Recalculate on window resize (important for iOS viewport changes)
            window.addEventListener('resize', () => {
                const newLayout = this.calculateOptimalLayout(familyMembers.length);
                grid.style.gridTemplateColumns = `repeat(${newLayout.cols}, 1fr)`;
                grid.style.gridTemplateRows = `repeat(${newLayout.rows}, 1fr)`;
                grid.style.height = `${window.innerHeight}px`;
            });
        } catch (error) {
            console.error('Failed to load family members:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('cancel-call-btn').addEventListener('click', () => {
            this.cancelCall();
        });

        document.getElementById('end-call-btn').addEventListener('click', () => {
            this.endCall();
        });
    }

    async initiateCall(member) {
        this.currentFamilyMember = member;
        this.currentRoomId = 'room-' + Date.now();

        // Update UI
        const callingPhoto = document.getElementById('calling-photo');
        const callingAvatar = document.getElementById('calling-avatar');

        if (member.photoUrl) {
            callingPhoto.src = `${SERVER_URL}${member.photoUrl}`;
            callingPhoto.style.display = 'block';
            callingAvatar.style.display = 'none';
        } else {
            callingPhoto.style.display = 'none';
            callingAvatar.textContent = member.avatar;
            callingAvatar.style.display = 'block';
        }

        document.getElementById('calling-name').textContent = member.name;
        this.showScreen('calling');

        // Setup local media FIRST before joining room
        try {
            await this.setupLocalMedia();
            console.log('Local media ready');
        } catch (error) {
            console.error('Failed to get camera/microphone:', error);
            alert('Failed to access camera/microphone. Please check permissions.');
            this.showScreen('family');
            return;
        }

        // Send call initiation to server
        try {
            const response = await fetch(`${SERVER_URL}/api/call/initiate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    familyMemberId: member.id,
                    roomId: this.currentRoomId
                })
            });

            const result = await response.json();
            console.log('Call initiated:', result);

            // Join room AFTER local media is ready
            this.socket.emit('join-room', {
                roomId: this.currentRoomId,
                peerId: TABLET_ID,
                userType: 'tablet'
            });

        } catch (error) {
            console.error('Failed to initiate call:', error);
            alert('Failed to start call. Please try again.');
            this.showScreen('family');
        }
    }

    async setupLocalMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            document.getElementById('local-video').srcObject = this.localStream;
        } catch (error) {
            console.error('Failed to get local media:', error);
        }
    }

    async startCall() {
        // Prevent creating multiple peer connections
        if (this.peerConnection) {
            console.log('Peer connection already exists, skipping');
            return;
        }

        console.log('Creating peer connection and offer');

        // Create peer connection
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Set encoding parameters for better quality
            this.peerConnection.getSenders().forEach(sender => {
                if (sender.track && sender.track.kind === 'video') {
                    const parameters = sender.getParameters();
                    if (!parameters.encodings || parameters.encodings.length === 0) {
                        parameters.encodings = [{}];
                    }
                    // Set max bitrate to 2.5 Mbps for better quality
                    parameters.encodings[0].maxBitrate = 2500000;
                    sender.setParameters(parameters).catch(e => console.error('Failed to set encoding parameters:', e));
                }
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind, 'id:', event.track.id, 'enabled:', event.track.enabled, 'muted:', event.track.muted, 'readyState:', event.track.readyState);
            const remoteVideo = document.getElementById('remote-video');

            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                // Set srcObject only once when creating the stream
                remoteVideo.srcObject = this.remoteStream;
                console.log('Remote stream created and attached to video element');

                // Add event listeners for debugging
                remoteVideo.onloadedmetadata = () => {
                    console.log('Remote video metadata loaded - videoWidth:', remoteVideo.videoWidth, 'videoHeight:', remoteVideo.videoHeight);
                };
                remoteVideo.onloadeddata = () => {
                    console.log('Remote video data loaded');
                };
                remoteVideo.onplay = () => {
                    console.log('Remote video started playing');
                };
                remoteVideo.onerror = (e) => {
                    console.error('Remote video error:', e);
                };
            }

            this.remoteStream.addTrack(event.track);
            console.log('Remote stream now has', this.remoteStream.getTracks().length, 'tracks');

            // Try to play video
            console.log('Attempting to play remote video...');
            console.log('Video element state:', {
                srcObject: !!remoteVideo.srcObject,
                videoWidth: remoteVideo.videoWidth,
                videoHeight: remoteVideo.videoHeight,
                readyState: remoteVideo.readyState,
                paused: remoteVideo.paused,
                currentTime: remoteVideo.currentTime
            });

            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✅ Remote video play() succeeded');
                    console.log('After play - dimensions:', remoteVideo.videoWidth, 'x', remoteVideo.videoHeight);
                }).catch(e => {
                    console.error('❌ Remote video play() failed:', e.name, e.message);
                });
            }

            this.showScreen('video');

            // Setup zoom controls once
            if (!this.zoomControlsSetup) {
                this.setupZoomControls();
                this.zoomControlsSetup = true;
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    roomId: this.currentRoomId,
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        this.socket.emit('offer', {
            roomId: this.currentRoomId,
            offer: offer
        });
    }

    async handleOffer(offer) {
        // Tablet should never receive offers - it's always the initiator
        console.warn('Tablet received unexpected offer - ignoring');
    }

    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    async handleIceCandidate(candidate) {
        if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    setupZoomControls() {
        const remoteVideo = document.getElementById('remote-video');

        // Mouse wheel zoom
        remoteVideo.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom = Math.max(1, Math.min(4, this.zoom + delta));
            this.updateVideoTransform();
        }, { passive: false });

        // Mouse drag to pan
        remoteVideo.addEventListener('mousedown', (e) => {
            if (this.zoom > 1) {
                this.isDragging = true;
                this.dragStartX = e.clientX - this.panX;
                this.dragStartY = e.clientY - this.panY;
                remoteVideo.style.cursor = 'grabbing';
            }
        });

        remoteVideo.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.panX = e.clientX - this.dragStartX;
                this.panY = e.clientY - this.dragStartY;
                this.updateVideoTransform();
            }
        });

        remoteVideo.addEventListener('mouseup', () => {
            this.isDragging = false;
            remoteVideo.style.cursor = this.zoom > 1 ? 'grab' : 'default';
        });

        remoteVideo.addEventListener('mouseleave', () => {
            this.isDragging = false;
            remoteVideo.style.cursor = this.zoom > 1 ? 'grab' : 'default';
        });

        // Touch pinch zoom
        remoteVideo.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                this.lastTouchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
            }
        }, { passive: false });

        remoteVideo.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );

                if (this.lastTouchDistance > 0) {
                    const delta = (distance - this.lastTouchDistance) * 0.01;
                    this.zoom = Math.max(1, Math.min(4, this.zoom + delta));
                    this.updateVideoTransform();
                }

                this.lastTouchDistance = distance;
            }
        }, { passive: false });

        remoteVideo.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                this.lastTouchDistance = 0;
            }
        });

        // Double-tap to reset zoom
        let lastTap = 0;
        remoteVideo.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0 && e.touches.length === 0) {
                this.zoom = 1;
                this.panX = 0;
                this.panY = 0;
                this.updateVideoTransform();
            }
            lastTap = currentTime;
        });

        // Double-click to reset zoom
        remoteVideo.addEventListener('dblclick', () => {
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this.updateVideoTransform();
        });
    }

    updateVideoTransform() {
        const remoteVideo = document.getElementById('remote-video');
        remoteVideo.style.transform = `scale(${this.zoom}) translate(${this.panX / this.zoom}px, ${this.panY / this.zoom}px)`;
        remoteVideo.style.cursor = this.zoom > 1 ? 'grab' : 'default';
    }

    cancelCall() {
        if (this.currentRoomId) {
            this.socket.emit('end-call', { roomId: this.currentRoomId });
        }
        this.cleanup();
        this.showScreen('family');
    }

    endCall() {
        if (this.currentRoomId) {
            this.socket.emit('end-call', { roomId: this.currentRoomId });
        }
        this.cleanup();
        this.showScreen('family');
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream = null;
        }

        // Reset zoom state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.zoomControlsSetup = false;

        this.currentRoomId = null;
        this.currentFamilyMember = null;
    }

    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
    }
}

// Initialize app
const app = new VideoCallApp();
