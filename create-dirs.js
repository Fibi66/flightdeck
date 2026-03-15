const fs = require('fs');
const path = require('path');

const dirPath = 'C:\\Users\\yzf01\\workspace\\flightdeck\\packages\\web\\src\\i18n\\locales';

try {
  fs.mkdirSync(dirPath, { recursive: true });
  console.log(`✓ Directory created: ${dirPath}`);
  
  // Verify it exists
  if (fs.existsSync(dirPath)) {
    console.log(`✓ Verification successful - directory exists`);
  }
} catch (err) {
  console.error(`✗ Error: ${err.message}`);
}
