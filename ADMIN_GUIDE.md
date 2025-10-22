# Admin Panel Guide

## Overview

The Nora Admin Panel allows you to manage family members who can be called from the baby tablet. You can add, edit, and delete family members, upload their photos, and manage their contact information.

## Access

The admin panel is **IP-restricted** for security. Only the following IP addresses can access it:

- `localhost` (127.0.0.1)
- `69.181.129.6`

### Accessing the Admin Panel

1. Start the server:
   ```bash
   cd server
   npm start
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:4000/admin/admin.html
   ```

3. If you're not on an authorized IP, you'll see an "Access denied" error.

## Features

### View Family Members

The admin panel displays all current family members in a grid layout showing:
- Profile photo or emoji avatar
- Name
- Phone number
- Email address
- Member ID

### Add New Family Member

1. Fill in the form at the top of the page:
   - **Name** (required): Full name of the family member
   - **Emoji Avatar** (optional): An emoji like 👩, 👨, 👵, 👴 (used as fallback if no photo)
   - **Phone Number** (required): Contact phone number (format: +1234567890)
   - **Email** (optional): Email address
   - **Photo** (optional): Upload a profile photo (JPG, PNG, GIF, or WebP, max 5MB)

2. Click "Add Member"

3. The new family member will appear in the grid below

### Edit Family Member

1. Click the "Edit" button on any family member card

2. The form will populate with their current information

3. Make your changes:
   - You can update any field
   - Upload a new photo to replace the existing one
   - Leave photo empty to keep the current one

4. Click "Update Member"

### Delete Family Member

1. Click the "Delete" button on the family member card

2. Confirm the deletion

3. The member will be removed from the system
   - Their photo will also be deleted from the server

## Photo Management

### Uploading Photos

- **Supported formats**: JPG, JPEG, PNG, GIF, WebP
- **Maximum size**: 5MB
- **Recommended**: Square images (1:1 aspect ratio) for best display
- **Resolution**: 500x500 pixels or larger recommended

### Photo Display

Photos are automatically:
- Resized to fit circular avatars on the tablet
- Displayed in place of emoji avatars when available
- Stored in the `server/uploads/` directory
- Deleted when a family member is removed

## Data Storage

Family member data is stored in:
```
server/familyMembers.json
```

Photos are stored in:
```
server/uploads/
```

### Backup Recommendations

To backup your family data:
1. Copy `familyMembers.json`
2. Copy the entire `uploads/` directory

## Security

### IP Filtering

The admin panel uses IP-based access control. Only requests from authorized IPs can:
- View the admin interface
- Access admin API endpoints
- Add/edit/delete family members
- Upload photos

### Adding New IPs

To authorize additional IP addresses, edit `server/app.js`:

```javascript
const ALLOWED_ADMIN_IPS = [
  '::1',
  '127.0.0.1',
  '::ffff:127.0.0.1',
  '69.181.129.6',
  '::ffff:69.181.129.6',
  'YOUR_NEW_IP_HERE'  // Add new IPs here
];
```

Then restart the server.

## API Endpoints

The admin panel uses these endpoints (all IP-restricted):

- **GET** `/api/admin/family` - Get all family members
- **POST** `/api/admin/family` - Add new family member
- **PUT** `/api/admin/family/:id` - Update family member
- **DELETE** `/api/admin/family/:id` - Delete family member

## Troubleshooting

### "Access Denied" Error

**Problem**: You see "Access denied. Admin access is restricted to authorized IPs."

**Solution**:
1. Check your IP address
2. Verify you're accessing from `localhost` or an authorized IP
3. Add your IP to the allowed list (see Security section)

### Images Not Uploading

**Problem**: Photo upload fails or doesn't show

**Solution**:
1. Check file size (must be under 5MB)
2. Verify file format (JPG, PNG, GIF, WebP only)
3. Check server logs for errors
4. Ensure `server/uploads/` directory exists and is writable

### Changes Not Appearing on Tablet

**Problem**: Updated family members don't show on the tablet

**Solution**:
1. Refresh the tablet web page (if using web version)
2. Restart the React Native app (if using native version)
3. Check that the server is running
4. Verify the tablet can reach the server

### Photo Path Issues

**Problem**: Photos show broken image icons

**Solution**:
1. Check that photos exist in `server/uploads/`
2. Verify the server is serving the `/uploads` route
3. Check browser console for 404 errors
4. Ensure `photoUrl` in `familyMembers.json` is correct

## Best Practices

1. **Use high-quality photos**: Better photos make it easier for baby to recognize family
2. **Keep phone numbers updated**: Ensure contact info is current for notifications
3. **Regular backups**: Backup `familyMembers.json` and `uploads/` directory
4. **Test after changes**: Always test on the tablet after making admin changes
5. **Secure your network**: Only expose the admin panel on trusted networks

## Advanced Configuration

### Changing Upload Limits

Edit `server/app.js` to change file size limits:

```javascript
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Change to 10MB
  // ...
});
```

### Custom Avatars

Instead of emojis, you can use any Unicode character:
- 👶 Baby
- 🧒 Child
- 👦 Boy
- 👧 Girl
- 🧑 Person
- Or any other emoji!

## Support

For issues or questions:
1. Check the main [README.md](./README.md)
2. Review server logs for error messages
3. Check browser console for JavaScript errors
