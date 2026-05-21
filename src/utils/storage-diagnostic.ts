/**
 * Diagnostic utility to check localStorage availability and Chrome-specific issues
 */
export function runStorageDiagnostic(): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 STORAGE DIAGNOSTIC FOR CHROME');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Check 1: localStorage availability
  try {
    if (typeof localStorage === 'undefined') {
      console.error('❌ localStorage is undefined');
      return;
    }
    console.log('✅ localStorage is defined');
  } catch (e) {
    console.error('❌ Cannot access localStorage:', e);
    return;
  }

  // Check 2: Write test
  try {
    const testKey = '__storage_test__';
    const testValue = 'test_' + Date.now();
    localStorage.setItem(testKey, testValue);
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);

    if (retrieved === testValue) {
      console.log('✅ localStorage write/read test: PASSED');
    } else {
      console.error('❌ localStorage write/read test: FAILED');
      console.error('   Written:', testValue);
      console.error('   Retrieved:', retrieved);
    }
  } catch (e) {
    console.error('❌ localStorage write test failed:', e);
    console.error('   This usually means:');
    console.error('   - Chrome is in Incognito mode');
    console.error('   - Storage quota exceeded');
    console.error('   - Security settings blocking storage');
  }

  // Check 3: Storage quota
  try {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const used = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentUsed = ((used / quota) * 100).toFixed(2);
        console.log('💾 Storage quota:');
        console.log('   Used:', (used / 1024 / 1024).toFixed(2), 'MB');
        console.log('   Total:', (quota / 1024 / 1024).toFixed(2), 'MB');
        console.log('   Usage:', percentUsed + '%');
      });
    } else {
      console.log('⚠️ Storage API not available (quota check not possible)');
    }
  } catch (e) {
    console.log('⚠️ Could not check storage quota:', e);
  }

  // Check 4: Current app data
  try {
    const appData = localStorage.getItem('festival-event-planner.v1');
    if (appData) {
      const parsed = JSON.parse(appData);
      console.log('📦 Current app data:');
      console.log('   Events:', parsed.events?.length || 0);
      console.log('   Tasks:', parsed.tasks?.length || 0);
      console.log('   RSVPs:', parsed.rsvps?.length || 0);
      console.log('   Size:', (appData.length / 1024).toFixed(2), 'KB');
    } else {
      console.log('⚠️ No app data found in localStorage');
    }
  } catch (e) {
    console.log('⚠️ Could not read app data:', e);
  }

  // Check 5: Chrome-specific warnings
  console.log('');
  console.log('🔧 CHROME-SPECIFIC FIXES:');
  console.log('If data is not persisting:');
  console.log('1. Open Chrome Settings (chrome://settings/cookies)');
  console.log('2. Click "See all site data and permissions"');
  console.log('3. Search for "localhost"');
  console.log('4. Ensure cookies are "Allowed"');
  console.log('5. Check Settings > Privacy > "Clear browsing data"');
  console.log('6. Disable "Clear cookies and site data when you close all windows"');
  console.log('');
  console.log('Or run this command in console:');
  console.log('   localStorage.setItem("test", "1"); localStorage.getItem("test")');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
