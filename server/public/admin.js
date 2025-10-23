// Dynamically determine server URL based on current host
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000'
    : window.location.origin;
const API_URL = `${SERVER_URL}/api/admin`;

let editingMemberId = null;
let cropper = null;
let croppedBlob = null;

// DOM Elements
const form = document.getElementById('member-form');
const membersList = document.getElementById('members-list');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const photoInput = document.getElementById('photo');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewContainer = document.getElementById('photo-preview-container');

// Crop modal elements
const cropModal = document.getElementById('crop-modal');
const cropImage = document.getElementById('crop-image');
const cropClose = document.getElementById('crop-close');
const cropCancel = document.getElementById('crop-cancel');
const cropApply = document.getElementById('crop-apply');

// Load family members on page load
document.addEventListener('DOMContentLoaded', () => {
    loadFamilyMembers();
    setupPhotoPreview();
    setupCropModal();
});

// Photo preview with cropping
function setupPhotoPreview() {
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.match(/image\/(jpeg|jpg|png|gif|webp)/)) {
                showError('Please select a valid image file (JPG, PNG, GIF, WebP)');
                photoInput.value = '';
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                showError('Image size must be less than 5MB');
                photoInput.value = '';
                return;
            }

            // Read file and show crop modal
            const reader = new FileReader();
            reader.onload = (e) => {
                cropImage.src = e.target.result;
                openCropModal();
            };
            reader.readAsDataURL(file);
        } else {
            photoPreviewContainer.style.display = 'none';
            croppedBlob = null;
        }
    });
}

// Setup crop modal
function setupCropModal() {
    // Close modal handlers
    cropClose.addEventListener('click', closeCropModal);
    cropCancel.addEventListener('click', closeCropModal);

    // Apply crop handler
    cropApply.addEventListener('click', applyCrop);

    // Close on backdrop click
    cropModal.addEventListener('click', (e) => {
        if (e.target === cropModal) {
            closeCropModal();
        }
    });
}

// Open crop modal
function openCropModal() {
    cropModal.classList.add('active');

    // Initialize Cropper.js
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }

    // Wait for image to load before initializing cropper
    cropImage.onload = function() {
        cropper = new Cropper(cropImage, {
            aspectRatio: 1, // Square crop for circular avatars
            viewMode: 2,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    };
}

// Close crop modal
function closeCropModal() {
    cropModal.classList.remove('active');
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    // Clear the onload handler
    cropImage.onload = null;
    // Clear the file input so user can select same file again if needed
    photoInput.value = '';

    // If user cancelled and there's no existing preview, hide the preview container
    // But keep the existing photo preview if we're editing a member
    if (!croppedBlob && !editingMemberId) {
        photoPreviewContainer.style.display = 'none';
    }
}

// Apply crop
function applyCrop() {
    if (!cropper) return;

    // Get cropped canvas
    const canvas = cropper.getCroppedCanvas({
        width: 500,
        height: 500,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    // Convert canvas to blob
    canvas.toBlob((blob) => {
        if (blob) {
            croppedBlob = blob;

            // Show preview
            const url = URL.createObjectURL(blob);
            photoPreview.src = url;
            photoPreviewContainer.style.display = 'block';

            // Close modal
            closeCropModal();
        }
    }, 'image/jpeg', 0.9);
}

// Load all family members
async function loadFamilyMembers() {
    try {
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        membersList.innerHTML = '';

        const response = await fetch(`${API_URL}/family`);

        if (response.status === 403) {
            showError('Access denied. Your IP address is not authorized for admin access.');
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to load family members');
        }

        const members = await response.json();
        displayFamilyMembers(members);
    } catch (error) {
        console.error('Error loading family members:', error);
        showError('Failed to load family members. Please try again.');
    } finally {
        loading.style.display = 'none';
    }
}

// Display family members
function displayFamilyMembers(members) {
    if (members.length === 0) {
        membersList.innerHTML = '<p style="text-align: center; color: #999; grid-column: 1/-1;">No family members yet. Add one above!</p>';
        return;
    }

    membersList.innerHTML = members.map(member => `
        <div class="member-card">
            <div class="member-photo">
                ${member.photoUrl
                    ? `<img src="${SERVER_URL}${member.photoUrl}" alt="${member.name}">`
                    : `<div class="emoji-avatar">${member.avatar || '👤'}</div>`
                }
            </div>
            <div class="member-info">
                <div class="member-name">${member.name}</div>
                <div class="member-detail">
                    <strong>Phone:</strong> ${member.phone}
                </div>
                ${member.email ? `
                    <div class="member-detail">
                        <strong>Email:</strong> ${member.email}
                    </div>
                ` : ''}
                <div class="member-detail">
                    <strong>ID:</strong> ${member.id}
                </div>
            </div>
            <div class="member-actions">
                <button class="btn btn-edit" onclick="editMember('${member.id}')">
                    Edit
                </button>
                <button class="btn btn-danger" onclick="deleteMember('${member.id}', '${member.name}')">
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

// Form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('name', document.getElementById('name').value);
    formData.append('phone', document.getElementById('phone').value);
    formData.append('email', document.getElementById('email').value);
    formData.append('avatar', document.getElementById('avatar').value);

    // Use cropped image if available, otherwise use original file
    if (croppedBlob) {
        formData.append('photo', croppedBlob, 'cropped-photo.jpg');
    } else {
        const photoFile = photoInput.files[0];
        if (photoFile) {
            formData.append('photo', photoFile);
        }
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = editingMemberId ? 'Updating...' : 'Adding...';

        let response;
        if (editingMemberId) {
            response = await fetch(`${API_URL}/family/${editingMemberId}`, {
                method: 'PUT',
                body: formData
            });
        } else {
            response = await fetch(`${API_URL}/family`, {
                method: 'POST',
                body: formData
            });
        }

        if (response.status === 403) {
            showError('Access denied. Your IP address is not authorized.');
            return;
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save family member');
        }

        // Success
        showSuccess(editingMemberId ? 'Family member updated successfully!' : 'Family member added successfully!');
        resetForm();
        loadFamilyMembers();
    } catch (error) {
        console.error('Error saving family member:', error);
        showError(error.message || 'Failed to save family member. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = editingMemberId ? 'Update Member' : 'Add Member';
    }
});

// Edit member
async function editMember(id) {
    try {
        const response = await fetch(`${API_URL}/family`);
        const members = await response.json();
        const member = members.find(m => m.id === id);

        if (!member) {
            showError('Family member not found');
            return;
        }

        editingMemberId = id;
        document.getElementById('member-id').value = id;
        document.getElementById('name').value = member.name;
        document.getElementById('phone').value = member.phone;
        document.getElementById('email').value = member.email || '';
        document.getElementById('avatar').value = member.avatar || '';

        if (member.photoUrl) {
            photoPreview.src = `${SERVER_URL}${member.photoUrl}`;
            photoPreviewContainer.style.display = 'block';
        }

        formTitle.textContent = 'Edit Family Member';
        submitBtn.textContent = 'Update Member';
        cancelBtn.style.display = 'inline-block';

        // Scroll to form
        document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading member for edit:', error);
        showError('Failed to load member details');
    }
}

// Delete member
async function deleteMember(id, name) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/family/${id}`, {
            method: 'DELETE'
        });

        if (response.status === 403) {
            showError('Access denied. Your IP address is not authorized.');
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to delete family member');
        }

        showSuccess(`${name} deleted successfully`);
        loadFamilyMembers();
    } catch (error) {
        console.error('Error deleting family member:', error);
        showError('Failed to delete family member. Please try again.');
    }
}

// Cancel edit
cancelBtn.addEventListener('click', resetForm);

// Reset form
function resetForm() {
    form.reset();
    editingMemberId = null;
    croppedBlob = null;
    document.getElementById('member-id').value = '';
    formTitle.textContent = 'Add New Family Member';
    submitBtn.textContent = 'Add Member';
    cancelBtn.style.display = 'none';
    photoPreviewContainer.style.display = 'none';
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Show success message
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;

    const formCard = document.querySelector('.form-card');
    formCard.insertBefore(successDiv, formCard.firstChild);

    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}
