// Dynamically determine server URL based on current host
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000'
    : window.location.origin;
const PEER_ID = 'family-' + Math.random().toString(36).substr(2, 9);

class FamilyCallApp {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.roomId = null;
        this.pollInterval = null;
        this.roomIsActive = false;
        this.familyMembers = [];
        this.peersInCall = new Set(); // Track who's in the call

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
        // Extract room ID from URL query parameter or path
        const urlParams = new URLSearchParams(window.location.search);
        this.roomId = urlParams.get('room');

        // Fallback to path-based routing if no query parameter
        if (!this.roomId) {
            const pathParts = window.location.pathname.split('/');
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart && lastPart !== 'join.html') {
                this.roomId = lastPart;
            }
        }

        if (!this.roomId) {
            await this.showActiveRooms();
            return;
        }

        console.log('Room ID:', this.roomId);

        // Check if we're on HTTPS or localhost
        const isSecure = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '[::1]';

        if (!isSecure && !isLocalhost) {
            this.showSecurityError();
            return;
        }

        // Connect to signaling server
        this.socket = io(SERVER_URL);

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.setStatus('Checking if call is active...');

            // Check if the room is still active
            this.socket.emit('check-room', { roomId: this.roomId }, (response) => {
                console.log('Room check response:', response);
                if (!response.active) {
                    console.log('Room is not active, showing active rooms instead');
                    this.roomIsActive = false;
                    this.showActiveRooms();
                } else {
                    this.roomIsActive = true;
                    this.setStatus('Tap "Join Call" to connect with Nora! 👶');

                    // Auto-click join button after a short delay (still requires user to grant camera permission)
                    setTimeout(() => {
                        const joinBtn = document.getElementById('join-btn');
                        if (joinBtn && !joinBtn.disabled && this.roomIsActive) {
                            // Update text to be more action-oriented
                            document.querySelector('h1').textContent = 'Connecting to Nora...';
                            document.querySelector('p').textContent = 'Please allow camera and microphone access when prompted';
                            joinBtn.click();
                        }
                    }, 1000);
                }
            });
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

        this.socket.on('peer-disconnected', ({ peerId, userType }) => {
            console.log('Peer disconnected:', peerId, userType);
            // Only end call if the tablet disconnects, not other family members
            if (userType === 'tablet') {
                console.log('Tablet disconnected - ending call');
                this.endCall();
            } else {
                console.log('Family member disconnected - staying in call');
            }
        });

        // Setup event listeners
        document.getElementById('join-btn').addEventListener('click', () => {
            this.joinCall();
        });

        document.getElementById('end-btn').addEventListener('click', () => {
            this.endCall();
        });

        // Setup invite modal
        const inviteBtn = document.getElementById('invite-btn');
        const inviteModal = document.getElementById('invite-modal');
        const modalClose = document.getElementById('modal-close');

        if (inviteBtn) {
            inviteBtn.addEventListener('click', () => this.openInviteModal());
        }

        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeInviteModal());
        }

        if (inviteModal) {
            inviteModal.addEventListener('click', (e) => {
                if (e.target === inviteModal) {
                    this.closeInviteModal();
                }
            });
        }

        // Load family members for invite modal
        this.loadFamilyMembers();
    }

    setStatus(message) {
        document.getElementById('status-message').textContent = message;
    }

    async joinCall() {
        // Clear polling interval if active
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        const joinBtn = document.getElementById('join-btn');
        joinBtn.disabled = true;
        this.setStatus('Setting up camera and microphone...');

        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera/microphone access not supported. Please use HTTPS or a modern browser.');
            }

            // Get local media
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

            console.log('Local stream obtained:', this.localStream.getTracks().map(t => t.kind));
            document.getElementById('local-video').srcObject = this.localStream;

            // Create peer connection WITHOUT creating an offer yet
            // The tablet will send us an offer
            await this.setupPeerConnection(false);

            // Join room AFTER peer connection is ready
            this.socket.emit('join-room', {
                roomId: this.roomId,
                peerId: PEER_ID,
                userType: 'family'
            });

            this.setStatus('Waiting for Nora...');

        } catch (error) {
            console.error('Failed to join call:', error);
            if (error.name === 'NotAllowedError') {
                this.setStatus('Camera/microphone access denied. Please allow permissions and try again.');
            } else if (error.name === 'NotFoundError') {
                this.setStatus('No camera or microphone found. Please connect a device and try again.');
            } else {
                this.setStatus(error.message || 'Failed to access camera/microphone. Please check permissions and use HTTPS.');
            }
            joinBtn.disabled = false;
        }
    }

    async setupPeerConnection(createOffer = true) {
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
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✅ Remote video play() succeeded');
                }).catch(e => {
                    console.error('❌ Remote video play() failed:', e.name, e.message);
                });
            }

            this.showVideo();
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    roomId: this.roomId,
                    candidate: event.candidate
                });
            }
        };

        // Connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.setStatus('Connected!');
            } else if (this.peerConnection.connectionState === 'failed' ||
                       this.peerConnection.connectionState === 'disconnected') {
                this.setStatus('Connection lost. Please try again.');
                setTimeout(() => this.endCall(), 2000);
            }
        };

        // Only create offer if specified (family should NOT create offer, tablet does)
        if (createOffer) {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('offer', {
                roomId: this.roomId,
                offer: offer
            });
        }
    }

    async handleOffer(offer) {
        if (!this.peerConnection) {
            console.log('No peer connection, setting up without offer');
            await this.setupPeerConnection(false);
        }

        console.log('Setting remote description (offer)');
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        console.log('Creating answer');
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        console.log('Sending answer');
        this.socket.emit('answer', {
            roomId: this.roomId,
            answer: answer
        });
    }

    async handleAnswer(answer) {
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
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

    showVideo() {
        document.getElementById('join-container').style.display = 'none';
        document.getElementById('video-container').classList.add('active');

        // Setup zoom controls once
        if (!this.zoomControlsSetup) {
            this.setupZoomControls();
            this.zoomControlsSetup = true;
        }
    }

    endCall() {
        if (this.socket && this.roomId) {
            this.socket.emit('end-call', { roomId: this.roomId });
        }

        this.cleanup();

        // Show thank you message
        document.getElementById('video-container').classList.remove('active');
        document.getElementById('join-container').style.display = 'block';
        document.querySelector('h1').textContent = 'Call Ended';
        document.querySelector('p').textContent = 'Thanks for calling! 💕';
        document.getElementById('join-btn').style.display = 'none';
    }

    cleanup() {
        // Clear polling interval if active
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

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
    }

    showSecurityError() {
        const currentUrl = window.location.href;
        const localhostUrl = currentUrl.replace(window.location.hostname, 'localhost');

        document.querySelector('h1').textContent = 'Security Error';
        document.querySelector('p').innerHTML = `
            Video calls require a secure connection (HTTPS) or localhost.<br><br>
            <strong>To join this call:</strong><br>
            1. If you're on the same device as the server, use:<br>
            <a href="${localhostUrl}" style="color: #2196F3; word-break: break-all;">${localhostUrl}</a><br><br>
            2. If you're on a different device, the server needs HTTPS.<br><br>
            <span style="color: #999; font-size: 14px;">
                Current URL: ${window.location.href}<br>
                Issue: Camera/microphone access requires secure context
            </span>
        `;
        document.getElementById('join-btn').style.display = 'none';
        this.setStatus('');
    }

    async showActiveRooms() {
        try {
            const response = await fetch(`${SERVER_URL}/api/rooms`);
            const rooms = await response.json();

            const familyResponse = await fetch(`${SERVER_URL}/api/family`);
            const familyMembers = await familyResponse.json();

            document.querySelector('h1').textContent = 'Active Video Calls';

            if (rooms.length === 0) {
                document.querySelector('p').textContent = 'No active calls at the moment. Waiting for Nora to call...';
                document.getElementById('join-btn').style.display = 'none';

                // Start polling for new rooms
                this.startPollingForRooms();
            } else {
                document.querySelector('p').textContent = 'Choose a call to join:';
                document.getElementById('join-btn').style.display = 'none';

                const statusDiv = document.getElementById('status-message');
                statusDiv.innerHTML = rooms.map(room => {
                    const member = familyMembers.find(m => m.id === room.familyMemberId);
                    const ageMinutes = Math.floor(room.age / 60000);
                    return `
                        <div style="background: #f5f5f5; padding: 15px; margin: 10px 0; cursor: pointer; border: 2px solid #e0e0e0; transition: all 0.2s;"
                             onmouseover="this.style.borderColor='#2196F3'"
                             onmouseout="this.style.borderColor='#e0e0e0'"
                             onclick="window.location.href='/join.html?room=${room.roomId}'">
                            <div style="font-size: 16px; font-weight: bold; color: #333;">
                                ${member ? member.name : 'Nora'} 👶
                            </div>
                            <div style="font-size: 14px; color: #666; margin-top: 5px;">
                                Started ${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} ago
                            </div>
                            <div style="font-size: 12px; color: #999; margin-top: 3px;">
                                Tap to join
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (error) {
            console.error('Failed to load active rooms:', error);
            document.querySelector('p').textContent = 'Unable to load active calls. Please try refreshing the page.';
            document.getElementById('join-btn').style.display = 'none';
        }
    }

    startPollingForRooms() {
        // Clear any existing poll interval
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        // Poll every 2 seconds for new rooms
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${SERVER_URL}/api/rooms`);
                const rooms = await response.json();

                if (rooms.length > 0) {
                    // Found a new room! Auto-join the first one
                    console.log('New room detected, auto-joining:', rooms[0].roomId);
                    clearInterval(this.pollInterval);
                    window.location.href = `/join.html?room=${rooms[0].roomId}`;
                }
            } catch (error) {
                console.error('Error polling for rooms:', error);
            }
        }, 2000);
    }

    async loadFamilyMembers() {
        try {
            const response = await fetch(`${SERVER_URL}/api/family`);
            this.familyMembers = await response.json();
            console.log('Family members loaded:', this.familyMembers);
        } catch (error) {
            console.error('Failed to load family members:', error);
        }
    }

    openInviteModal() {
        const modal = document.getElementById('invite-modal');
        const grid = document.getElementById('invite-family-grid');

        // Render family members
        grid.innerHTML = this.familyMembers.map(member => {
            const isInCall = this.peersInCall.has(member.id);
            const memberHtml = member.photoUrl
                ? `<img src="${SERVER_URL}${member.photoUrl}" alt="${member.name}" class="family-photo">`
                : `<div class="family-avatar">${member.avatar || '👤'}</div>`;

            return `
                <div class="family-member ${isInCall ? 'disabled' : ''}"
                     data-member-id="${member.id}"
                     onclick="${isInCall ? '' : `app.inviteMember('${member.id}')`}">
                    ${memberHtml}
                    <div class="family-name">${member.name}</div>
                    ${isInCall ? '<div class="in-call-badge">In Call</div>' : ''}
                </div>
            `;
        }).join('');

        modal.classList.add('active');
    }

    closeInviteModal() {
        const modal = document.getElementById('invite-modal');
        modal.classList.remove('active');
    }

    async inviteMember(memberId) {
        const member = this.familyMembers.find(m => m.id === memberId);
        if (!member) return;

        console.log('Inviting member:', member);

        try {
            // Send invitation through server
            const response = await fetch(`${SERVER_URL}/api/call/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    familyMemberId: memberId,
                    roomId: this.roomId
                })
            });

            const result = await response.json();
            console.log('Invitation sent:', result);

            // Mark member as invited/in call
            this.peersInCall.add(memberId);

            // Close modal
            this.closeInviteModal();

            // Show success message
            this.setStatus(`Invited ${member.name} to the call!`);
            setTimeout(() => {
                this.setStatus('');
            }, 3000);

        } catch (error) {
            console.error('Failed to invite member:', error);
            alert(`Failed to invite ${member.name}. Please try again.`);
        }
    }
}

// Initialize app
const app = new FamilyCallApp();
