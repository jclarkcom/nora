#!/usr/bin/env node
/**
 * Test short URL encoding/decoding
 */

// URL-safe base64 encoding for room IDs
function encodeRoomId(roomId) {
  // Convert to base64 and make URL-safe
  const base64 = Buffer.from(roomId).toString('base64');
  return base64
    .replace(/\+/g, '-')  // Replace + with -
    .replace(/\//g, '_')  // Replace / with _
    .replace(/=/g, '');   // Remove padding
}

function decodeRoomId(encodedRoomId) {
  try {
    // Reverse the URL-safe encoding
    let base64 = encodedRoomId
      .replace(/-/g, '+')  // Replace - with +
      .replace(/_/g, '/'); // Replace _ with /

    // Add back padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }

    return Buffer.from(base64, 'base64').toString('utf8');
  } catch (error) {
    console.error('Failed to decode room ID:', error);
    return null;
  }
}

// Test cases
const testRoomIds = [
  'ab123456-cd78-90ef-1234-567890abcdef',  // UUID format
  'room-12345',
  'simple-room',
  'test_room_with_underscores',
  '12345'
];

console.log('\n🧪 Testing Short URL Encoding/Decoding\n');
console.log('=' .repeat(80));

let allPassed = true;

testRoomIds.forEach((roomId, index) => {
  console.log(`\nTest ${index + 1}: "${roomId}"`);

  const encoded = encodeRoomId(roomId);
  console.log(`  Encoded: ${encoded}`);
  console.log(`  Length: ${roomId.length} → ${encoded.length} (${Math.round((1 - encoded.length/roomId.length) * 100)}% ${encoded.length < roomId.length ? 'shorter' : 'longer'})`);

  const decoded = decodeRoomId(encoded);
  console.log(`  Decoded: ${decoded}`);

  const passed = decoded === roomId;
  console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);

  if (!passed) {
    allPassed = false;
    console.log(`  ERROR: Expected "${roomId}" but got "${decoded}"`);
  }

  // Generate example URLs
  const shortUrl = `https://nora.jonathanclark.com/join?r=${encoded}`;
  const longUrl = `https://nora.jonathanclark.com/join.html?room=${roomId}`;
  console.log(`  Short URL: ${shortUrl}`);
  console.log(`  Long URL:  ${longUrl}`);
  console.log(`  Savings: ${longUrl.length - shortUrl.length} characters (${Math.round((1 - shortUrl.length/longUrl.length) * 100)}% shorter)`);
});

console.log('\n' + '='.repeat(80));
console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}\n`);

// Test URL safety (no special characters that need encoding)
console.log('Testing URL safety...');
const testId = 'ab123456-cd78-90ef-1234-567890abcdef';
const encoded = encodeRoomId(testId);
const urlEncoded = encodeURIComponent(encoded);

if (encoded === urlEncoded) {
  console.log('✅ Encoded room ID is URL-safe (no escaping needed)');
} else {
  console.log('❌ Encoded room ID requires URL escaping:');
  console.log(`  Original: ${encoded}`);
  console.log(`  Escaped:  ${urlEncoded}`);
  allPassed = false;
}

process.exit(allPassed ? 0 : 1);
