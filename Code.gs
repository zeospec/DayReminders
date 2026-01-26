/**
 * Day Reminders - Google Apps Script Backend
 * 
 * This script provides a REST API for the Day Reminders web app.
 * It reads from and writes to a Google Sheet named "Contacts".
 * 
 * IMPORTANT: This script MUST be created from within a Google Sheet.
 * To create it correctly:
 * 1. Open your Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Paste this code
 * 
 * If you created a standalone Apps Script project, you need to:
 * 1. Open your Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Copy this code there
 * 
 * Sheet Structure (Row 1 - Headers):
 * id | name | reference | phone | date | type
 */

// Configuration
const SHEET_NAME = 'Contacts';
const FIREBASE_PROJECT_ID = 'zeodayreminders'; // Replace with your Firebase project ID
const FIREBASE_API_KEY = 'AIzaSyCQ_1-a6UoD-hv5SrRfrR_GaSSO2te34Lw'; // Replace with your Firebase Web API Key (from Firebase Console → Project Settings → General → Web API Key)

// Security Configuration
const LOG_LEVEL = 'production';
const TOKEN_CACHE_TTL = 300; // Cache validated tokens for 5 minutes (in seconds)
const EXPECTED_ISSUER = 'https://securetoken.google.com/' + FIREBASE_PROJECT_ID;

// Rate Limiting Configuration
const RATE_LIMIT_WINDOW = 900; // 15 minutes in seconds
const RATE_LIMIT_PER_IP = 100; // Max requests per IP per window
const RATE_LIMIT_PER_USER = 200; // Max requests per user per window
const MAX_REQUEST_SIZE = 100000; // 100KB max request size

/**
 * Handles GET requests - Returns all contacts as JSON
 */
function doGet(e) {
  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(e);
    
    // Check rate limit before processing
    const rateLimitCheck = checkRateLimit(clientIP, null);
    if (!rateLimitCheck.allowed) {
      secureLog('SECURITY: Rate limit exceeded in GET request');
      return addSecurityHeaders(createErrorResponse('Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED'));
    }
    
    // Extract and validate Firebase token from query parameter
    // Note: GET requests are deprecated in favor of POST for security
    // This is kept for backward compatibility
    let token = e.parameter ? e.parameter.token : null;
    
    // If token is still URL-encoded, decode it
    if (token && typeof token === 'string') {
      try {
        // Try decoding in case it's double-encoded
        const decoded = decodeURIComponent(token);
        if (decoded !== token) {

          token = decoded;
        }
      } catch (e) {
      }
    }

    // Verify token format (Firebase ID tokens are JWT, should have 3 parts separated by dots)
    if (token) {
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {

      }
    }
    
    if (!token) {
      secureLog('ERROR: No token provided in GET request');
      return addSecurityHeaders(createErrorResponse('Authentication required', 'AUTH_REQUIRED'));
    }
    
    // Validate token and get user ID
    const validationResult = validateFirebaseToken(token);
    
    if (!validationResult || !validationResult.userId) {
      secureLog('ERROR: Token validation failed');
      if (LOG_LEVEL === 'development') {

        const errorReason = validationResult && validationResult.errorReason ? validationResult.errorReason : 'Unknown validation failure';

      }
      
      // Check if this is a permission error and provide helpful message
      const errorReason = validationResult && validationResult.errorReason ? validationResult.errorReason : 'Unknown validation failure';
      let errorMessage;
      
      if (errorReason.includes('Permission denied') || errorReason.includes('authorization') || errorReason.includes('authorizeExternalRequests')) {
        errorMessage = errorReason; // Use the full helpful message
      } else if (LOG_LEVEL === 'development') {
        errorMessage = 'Token validation failed: ' + errorReason;
      } else {
        errorMessage = 'Invalid or expired token';
      }
      
      return addSecurityHeaders(createErrorResponse(errorMessage, 'AUTH_ERROR'));
    }
    
    const userId = validationResult.userId;
    
    // Re-check rate limit with user ID
    const userRateLimitCheck = checkRateLimit(clientIP, userId);
    if (!userRateLimitCheck.allowed) {
      secureLog('SECURITY: User rate limit exceeded in GET request');
      return addSecurityHeaders(createErrorResponse('Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED'));
    }
    
    // Get user-specific sheet
    try {
      const sheet = getUserSheet(userId);
      if (!sheet) {
        const errorMsg = 'Could not access or create the user sheet for user: ' + userId.substring(0, 8) + '...';
        secureLog('ERROR: ' + errorMsg);
        
        return addSecurityHeaders(createErrorResponse(
          LOG_LEVEL === 'development' ? errorMsg : 'Error accessing contacts',
          'SHEET_ERROR'
        ));
      }
      
      const data = getContactsFromSheet(sheet);

      // Google Apps Script automatically handles CORS for web apps deployed with "Anyone" access
      // We just need to return proper JSON with security headers
      return addSecurityHeaders(ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON));
    } catch (sheetError) {
      const errorMsg = 'Error accessing user sheet: ' + sheetError.toString();
      secureLog('ERROR: ' + errorMsg);
      
      return addSecurityHeaders(createErrorResponse(
        LOG_LEVEL === 'development' ? errorMsg : 'Error accessing contacts',
        'SHEET_ERROR'
      ));
    }
      
  } catch (error) {
    // Log error for debugging
    const errorMessage = error.toString();
    const errorStack = error.stack || 'No stack trace available';
    
    secureLog('ERROR: doGet exception - ' + errorMessage);

    // Return detailed error in development, generic in production
    const clientMessage = LOG_LEVEL === 'development' 
      ? 'Server error: ' + errorMessage 
      : 'An error occurred processing your request';
    
    return addSecurityHeaders(createErrorResponse(clientMessage, 'SERVER_ERROR'));
  }
}

/**
 * Creates a standardized error response
 * @param {string} message - User-friendly error message
 * @param {string} code - Error code for debugging
 * @returns {TextOutput} - Error response
 */
function createErrorResponse(message, code) {
  const response = {
    error: true,
    message: message,
    code: code
  };
  
  // Log detailed error in development
  if (LOG_LEVEL === 'development') {
    secureLog('Error response: ' + JSON.stringify(response));
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Adds security headers to response
 * @param {TextOutput} output - ContentService output
 * @returns {TextOutput} - Output with security headers
 */
function addSecurityHeaders(output) {
  // Note: Google Apps Script has limited header control
  // These headers are set via the web app deployment settings
  // For programmatic control, we return the output as-is
  // Security headers should be configured in:
  // Apps Script → Deploy → Web app → Security settings
  
  return output;
}

/**
 * Handles POST requests - Adds a new contact to the sheet
 */
function doPost(e) {
  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(e);
    
    // Check rate limit before processing (use null for userId until authenticated)
    const rateLimitCheck = checkRateLimit(clientIP, null);
    if (!rateLimitCheck.allowed) {
      secureLog('SECURITY: Rate limit exceeded');
      const errorResponse = createErrorResponse('Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED');
      // Note: Apps Script doesn't support custom status codes easily
      // The error message indicates rate limiting
      return addSecurityHeaders(errorResponse);
    }
    
    // Validate request size
    let requestSize = 0;
    if (e.postData && e.postData.contents) {
      requestSize = e.postData.contents.length;
    } else if (e.parameter) {
      requestSize = JSON.stringify(e.parameter).length;
    }
    
    if (requestSize > MAX_REQUEST_SIZE) {
      secureLog('SECURITY: Request too large: ' + requestSize);
      return addSecurityHeaders(createErrorResponse('Request too large', 'REQUEST_TOO_LARGE'));
    }
    
    // Parse the request body first to get token
    let requestData;
    
    // Google Apps Script receives POST data as text/plain
    // We need to parse it as JSON
    if (typeof e.postData === 'undefined' || !e.postData.contents) {
      // Try to get from parameter or request body
      const rawData = e.parameter ? (e.parameter.postData || e.parameter) : null;
      if (!rawData) {
        return addSecurityHeaders(createErrorResponse('No data received in POST request', 'INVALID_REQUEST'));
      }
      try {
        requestData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      } catch (parseError) {
        return addSecurityHeaders(createErrorResponse('Invalid JSON in request body', 'INVALID_JSON'));
      }
    } else {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (parseError) {
        return addSecurityHeaders(createErrorResponse('Invalid JSON in request body', 'INVALID_JSON'));
      }
    }
    
    // Validate request data structure
    if (!requestData || typeof requestData !== 'object') {
      return addSecurityHeaders(createErrorResponse('Invalid request data format', 'INVALID_REQUEST'));
    }
    
    // Extract token from request body
    const token = requestData.token || null;
    
    if (!token) {
      secureLog('ERROR: No token provided in POST request');
      
      return addSecurityHeaders(createErrorResponse('Authentication required', 'AUTH_REQUIRED'));
    }
    
    // Log token info in development mode

    // Validate token and get user ID
    const validationResult = validateFirebaseToken(token);
    
    if (!validationResult || !validationResult.userId) {
      secureLog('ERROR: Token validation failed');
      if (LOG_LEVEL === 'development') {

        const errorReason = validationResult && validationResult.errorReason ? validationResult.errorReason : 'Unknown validation failure';

      }
      
      // Check if this is a permission error and provide helpful message
      const errorReason = validationResult && validationResult.errorReason ? validationResult.errorReason : 'Unknown validation failure';
      let errorMessage;
      
      if (errorReason.includes('Permission denied') || errorReason.includes('authorization') || errorReason.includes('authorizeExternalRequests')) {
        errorMessage = errorReason; // Use the full helpful message
      } else if (LOG_LEVEL === 'development') {
        errorMessage = 'Token validation failed: ' + errorReason;
      } else {
        errorMessage = 'Invalid or expired token';
      }
      
      return addSecurityHeaders(createErrorResponse(errorMessage, 'AUTH_ERROR'));
    }
    
    const userId = validationResult.userId;
    
    // Re-check rate limit with user ID (more accurate)
    const userRateLimitCheck = checkRateLimit(clientIP, userId);
    if (!userRateLimitCheck.allowed) {
      secureLog('SECURITY: User rate limit exceeded');
      return addSecurityHeaders(createErrorResponse('Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED'));
    }
    
    // Extract action
    let action = 'add';
    if (requestData.action !== undefined && requestData.action !== null) {
      action = String(requestData.action).toLowerCase().trim();
    }
    
    // Remove token and action from requestData before processing
    delete requestData.token;
    delete requestData.action;
    
    // Add userId to requestData for user-specific operations
    requestData.userId = userId;
    
    secureLog('Processing action: ' + action + ' for user: ' + userId.substring(0, 8) + '...');
    
    // Validate required fields based on action
    if (action === 'getcontacts') {
      // Handle GET contacts request via POST (secure - token in body)
      try {
        const sheet = getUserSheet(userId);
        if (!sheet) {
          const errorMsg = 'Could not access or create the user sheet for user: ' + userId.substring(0, 8) + '...';
          secureLog('ERROR: ' + errorMsg);
          
          return addSecurityHeaders(createErrorResponse(
            LOG_LEVEL === 'development' ? errorMsg : 'Error accessing contacts',
            'SHEET_ERROR'
          ));
        }
        
        const data = getContactsFromSheet(sheet);
        
        return addSecurityHeaders(ContentService
          .createTextOutput(JSON.stringify(data))
          .setMimeType(ContentService.MimeType.JSON));
      } catch (sheetError) {
        const errorMsg = 'Error accessing user sheet: ' + sheetError.toString();
        secureLog('ERROR: ' + errorMsg);
        
        return addSecurityHeaders(createErrorResponse(
          LOG_LEVEL === 'development' ? errorMsg : 'Error accessing contacts',
          'SHEET_ERROR'
        ));
      }
    } else if (action === 'delete') {
      // Validate required fields for delete
      if (!requestData.id) {
        return addSecurityHeaders(createErrorResponse('Contact ID is required for deletion', 'VALIDATION_ERROR'));
      }
      return handleDeleteContact(requestData);
    } else if (action === 'update') {
      // Validate required fields for update
      if (!requestData.id || !requestData.name || !requestData.date || !requestData.type) {
        return addSecurityHeaders(createErrorResponse('Missing required fields: id, name, date, and type are required', 'VALIDATION_ERROR'));
      }
      return handleUpdateContact(requestData);
    } else {
      // Default: add new contact
      // Validate required fields for add
      if (!requestData.name || !requestData.date || !requestData.type) {
        return addSecurityHeaders(createErrorResponse('Missing required fields: name, date, and type are required', 'VALIDATION_ERROR'));
      }
      return handleAddContact(requestData);
    }
      
  } catch (error) {
    // Log error for debugging
    const errorMessage = error.toString();
    const errorStack = error.stack || 'No stack trace available';
    
    secureLog('ERROR: doPost exception - ' + errorMessage);
    if (LOG_LEVEL === 'development') {

      // Try to get more context about where the error occurred
      if (errorStack.includes('getUserSheet')) {

      } else if (errorStack.includes('getContactsFromSheet')) {

      } else if (errorStack.includes('validateFirebaseToken')) {

      }
    }
    
    // Return detailed error in development, generic in production
    const clientMessage = LOG_LEVEL === 'development' 
      ? 'Server error: ' + errorMessage 
      : 'An error occurred processing your request';
    
    return addSecurityHeaders(createErrorResponse(clientMessage, 'SERVER_ERROR'));
  }
}

/**
 * Handles adding a new contact
 */
function handleAddContact(contactData) {
  // Additional validation (fields already validated in doPost)
  // Validate data types and formats
  if (typeof contactData.name !== 'string' || contactData.name.trim().length === 0) {
    return addSecurityHeaders(createErrorResponse('Invalid name format', 'VALIDATION_ERROR'));
  }
  
  if (typeof contactData.date !== 'string' || !contactData.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return addSecurityHeaders(createErrorResponse('Invalid date format. Expected YYYY-MM-DD', 'VALIDATION_ERROR'));
  }
  
  if (typeof contactData.type !== 'string' || contactData.type.trim().length === 0) {
    return addSecurityHeaders(createErrorResponse('Invalid type format', 'VALIDATION_ERROR'));
  }
  
  // Generate UUID for id
  const id = generateUUID();
  
  // Prepare row data
  const rowData = [
    id,
    contactData.name || '',
    contactData.reference || '',
    contactData.phone || '',
    contactData.date,
    contactData.type
  ];
  
  // Get user-specific sheet and append the row
  const userId = contactData.userId;
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  const sheet = getUserSheet(userId);
  if (!sheet) {
    throw new Error('Could not access or create the user sheet');
  }
  
  sheet.appendRow(rowData);
  
  // Return success response
  return addSecurityHeaders(ContentService
    .createTextOutput(JSON.stringify({ 
      success: true, 
      id: id,
      message: 'Contact added successfully' 
    }))
    .setMimeType(ContentService.MimeType.JSON));
}

/**
 * Handles updating an existing contact
 */
function handleUpdateContact(contactData) {
  // Additional validation (fields already validated in doPost)
  // Validate data types and formats
  if (typeof contactData.name !== 'string' || contactData.name.trim().length === 0) {
    return addSecurityHeaders(createErrorResponse('Invalid name format', 'VALIDATION_ERROR'));
  }
  
  if (typeof contactData.date !== 'string' || !contactData.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return addSecurityHeaders(createErrorResponse('Invalid date format. Expected YYYY-MM-DD', 'VALIDATION_ERROR'));
  }
  
  if (typeof contactData.type !== 'string' || contactData.type.trim().length === 0) {
    return addSecurityHeaders(createErrorResponse('Invalid type format', 'VALIDATION_ERROR'));
  }
  
  const userId = contactData.userId;
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  const sheet = getUserSheet(userId);
  if (!sheet) {
    throw new Error('Could not access or create the user sheet');
  }
  
  // Find the row with matching ID
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return addSecurityHeaders(createErrorResponse('No contacts found', 'NOT_FOUND'));
  }
  
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 6);
  const values = dataRange.getValues();
  
  // Find the row index (0-based in array, but +2 for sheet row because we start at row 2)
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === contactData.id) {
      rowIndex = i + 2; // +2 because array is 0-based and we start at row 2
      break;
    }
  }
  
  if (rowIndex === -1) {
    return addSecurityHeaders(createErrorResponse('Contact not found', 'NOT_FOUND'));
  }
  
  // Update the row
  const rowData = [
    contactData.id,
    contactData.name || '',
    contactData.reference || '',
    contactData.phone || '',
    contactData.date,
    contactData.type
  ];
  
  sheet.getRange(rowIndex, 1, 1, 6).setValues([rowData]);
  
  return addSecurityHeaders(ContentService
    .createTextOutput(JSON.stringify({ 
      success: true, 
      id: contactData.id,
      message: 'Contact updated successfully' 
    }))
    .setMimeType(ContentService.MimeType.JSON));
}

/**
 * Handles deleting a contact
 */
function handleDeleteContact(contactData) {
  // Additional validation (id already validated in doPost)
  const userId = contactData.userId;
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  const sheet = getUserSheet(userId);
  if (!sheet) {
    throw new Error('Could not access or create the user sheet');
  }
  
  // Find the row with matching ID
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return addSecurityHeaders(createErrorResponse('No contacts found', 'NOT_FOUND'));
  }
  
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 6);
  const values = dataRange.getValues();
  
  // Find the row index
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === contactData.id) {
      rowIndex = i + 2; // +2 because array is 0-based and we start at row 2
      break;
    }
  }
  
  if (rowIndex === -1) {
    return addSecurityHeaders(createErrorResponse('Contact not found', 'NOT_FOUND'));
  }
  
  // Delete the row
  sheet.deleteRow(rowIndex);
  
  return addSecurityHeaders(ContentService
    .createTextOutput(JSON.stringify({ 
      success: true, 
      message: 'Contact deleted successfully' 
    }))
    .setMimeType(ContentService.MimeType.JSON));
}

/**
 * Handles OPTIONS requests for CORS preflight
 * Note: Google Apps Script web apps handle CORS automatically when deployed with "Anyone" access
 */
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Decodes a JWT token payload (without signature verification)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded payload or null if invalid
 */
function decodeJWTPayload(token) {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {

      return null;
    }
    
    // Decode the payload (second part)
    const payload = parts[1];
    
    // Convert URL-safe base64 to standard base64
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Decode base64 using Apps Script's Utilities
    const decodedBytes = Utilities.base64Decode(base64);
    const decodedString = Utilities.newBlob(decodedBytes).getDataAsString();
    
    // Parse JSON
    return JSON.parse(decodedString);
  } catch (error) {
    return null;
  }
}

/**
 * Secure logging function - only logs errors in production
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
function secureLog(message, data) {
  if (LOG_LEVEL === 'development') {
    if (data !== undefined) {

    } else {

    }
  } else {
    // In production, only log errors and security violations
    if (message.includes('ERROR') || message.includes('FAILED') || message.includes('SECURITY')) {
      // Sanitize data - don't log sensitive information

    }
  }
}

/**
 * Gets client IP address from request
 * @param {Object} e - Request event object
 * @returns {string} - IP address or 'unknown'
 */
function getClientIP(e) {
  // Try to get IP from various sources
  if (e.parameter && e.parameter.ip) {
    return e.parameter.ip;
  }
  // Apps Script doesn't directly expose IP, use a fallback
  return 'unknown';
}

/**
 * Checks rate limit for IP address and user ID
 * @param {string} ipAddress - Client IP address
 * @param {string} userId - User ID (null if not authenticated yet)
 * @returns {Object} - {allowed: boolean, remaining: number, resetAt: number}
 */
function checkRateLimit(ipAddress, userId) {
  const cache = PropertiesService.getScriptProperties();
  const now = Math.floor(new Date().getTime() / 1000);
  
  // Check IP rate limit
  const ipKey = 'ratelimit_ip_' + ipAddress;
  const ipData = cache.getProperty(ipKey);
  
  let ipCount = 0;
  let ipWindowStart = now;
  
  if (ipData) {
    try {
      const parsed = JSON.parse(ipData);
      if (parsed.windowStart > (now - RATE_LIMIT_WINDOW)) {
        // Still in current window
        ipCount = parsed.count;
        ipWindowStart = parsed.windowStart;
      }
      // Otherwise, start new window
    } catch (e) {
      // Invalid data, start fresh
    }
  }
  
  if (ipCount >= RATE_LIMIT_PER_IP) {
    const resetAt = ipWindowStart + RATE_LIMIT_WINDOW;
    secureLog('SECURITY: Rate limit exceeded for IP: ' + ipAddress.substring(0, 10) + '...');
    return {
      allowed: false,
      remaining: 0,
      resetAt: resetAt,
      limitType: 'ip'
    };
  }
  
  // Initialize userCount outside the if block to avoid scope issues
  let userCount = 0;
  let userWindowStart = now;
  
  // Check user rate limit (if authenticated)
  if (userId) {
    const userKey = 'ratelimit_user_' + userId;
    const userData = cache.getProperty(userKey);
    
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        if (parsed.windowStart > (now - RATE_LIMIT_WINDOW)) {
          // Still in current window
          userCount = parsed.count;
          userWindowStart = parsed.windowStart;
        }
        // Otherwise, start new window
      } catch (e) {
        // Invalid data, start fresh
      }
    }
    
    if (userCount >= RATE_LIMIT_PER_USER) {
      const resetAt = userWindowStart + RATE_LIMIT_WINDOW;
      secureLog('SECURITY: Rate limit exceeded for user: ' + userId.substring(0, 8) + '...');
      return {
        allowed: false,
        remaining: 0,
        resetAt: resetAt,
        limitType: 'user'
      };
    }
    
    // Update user count
    userCount++;
    cache.setProperty(userKey, JSON.stringify({
      count: userCount,
      windowStart: userWindowStart
    }));
  }
  
  // Update IP count
  ipCount++;
  cache.setProperty(ipKey, JSON.stringify({
    count: ipCount,
    windowStart: ipWindowStart
  }));
  
  // Calculate remaining requests
  const remaining = userId ? 
    Math.min(RATE_LIMIT_PER_IP - ipCount, RATE_LIMIT_PER_USER - userCount) :
    (RATE_LIMIT_PER_IP - ipCount);
  
  return {
    allowed: true,
    remaining: Math.max(0, remaining),
    resetAt: ipWindowStart + RATE_LIMIT_WINDOW
  };
}

/**
 * Validates Firebase ID token using API-only validation
 * Implements caching to reduce API calls
 * @param {string} token - Firebase ID token
 * @returns {string|null} - User ID (uid) or null if invalid
 */
/**
 * Validates Firebase ID token using API-only validation
 * Implements caching to reduce API calls
 * @param {string} token - Firebase ID token
 * @returns {Object} - {userId: string|null, errorReason: string|null}
 */
function validateFirebaseToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      secureLog('ERROR: Token validation failed - No token provided');
      
      return { userId: null, errorReason: 'No token provided' };
    }
    
    // Validate JWT format (should have 3 parts separated by dots)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      secureLog('ERROR: Invalid token format - expected JWT with 3 parts, got ' + tokenParts.length);
      
      return { userId: null, errorReason: 'Invalid token format (expected JWT with 3 parts)' };
    }
    
    // Check cache first (using token hash as key)
    const tokenHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, token, Utilities.Charset.UTF_8);
    const cacheKey = 'token_' + tokenHash.map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
    
    const cache = PropertiesService.getScriptProperties();
    const cachedData = cache.getProperty(cacheKey);
    
    if (cachedData) {
      try {
        const cached = JSON.parse(cachedData);
        const now = Math.floor(new Date().getTime() / 1000);
        if (cached.expiresAt > now && cached.uid) {
          secureLog('Token validated from cache for user: ' + cached.uid.substring(0, 8) + '...');
          return { userId: cached.uid, errorReason: null };
        }
      } catch (e) {
        // Cache invalid, continue to API validation
        cache.deleteProperty(cacheKey);
      }
    }
    
    // Always use Firebase API validation for security
    if (!FIREBASE_API_KEY || FIREBASE_API_KEY === 'YOUR_FIREBASE_API_KEY') {
      secureLog('ERROR: Firebase API key not configured');
      
      return { userId: null, errorReason: 'Firebase API key not configured' };
    }

    const url = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=' + FIREBASE_API_KEY;
    const payload = { idToken: token };
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    let response;
    let responseCode;
    let responseText;
    
    try {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      responseText = response.getContentText();
    } catch (fetchError) {
      // Check if this is a permission error
      const errorMessage = fetchError.toString();
      if (errorMessage.includes('permission') || errorMessage.includes('UrlFetchApp.fetch')) {
        secureLog('ERROR: Permission denied for UrlFetchApp.fetch');
        
        return { 
          userId: null, 
          errorReason: 'Permission denied: The Apps Script needs authorization to call external APIs. Please run authorizeExternalRequests() function in the Apps Script editor and redeploy.' 
        };
      }
      // Re-throw if it's a different error
      throw fetchError;
    }
    
    if (responseCode !== 200) {
      secureLog('ERROR: API validation failed with status ' + responseCode);
      let errorReason = 'Firebase API validation failed (HTTP ' + responseCode + ')';
      // Try to parse error for detailed logging
      try {
        const errorResult = JSON.parse(responseText);
        if (errorResult.error) {
          const errorMsg = errorResult.error.message || 'Token validation failed';
          const errorCode = errorResult.error.code || 'UNKNOWN';
          errorReason = 'Firebase API error: ' + errorMsg + ' (code: ' + errorCode + ')';
          secureLog('ERROR: Firebase API error - ' + errorMsg + ' (code: ' + errorCode + ')');
          
        } else {
          secureLog('ERROR: Unexpected API response format');
          
        }
      } catch (e) {
        secureLog('ERROR: Could not parse API error response');
        
      }
      return { userId: null, errorReason: errorReason };
    }
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      secureLog('ERROR: Could not parse API response');
      
      return { userId: null, errorReason: 'Could not parse Firebase API response' };
    }
    
    if (result.error) {
      const errorMsg = result.error.message || 'Unknown error';
      const errorCode = result.error.code || 'UNKNOWN';
      secureLog('ERROR: API validation error - ' + errorMsg + ' (code: ' + errorCode + ')');
      
      return { userId: null, errorReason: 'Firebase API error: ' + errorMsg + ' (code: ' + errorCode + ')' };
    }
    
    if (!result.users || result.users.length === 0) {
      secureLog('ERROR: No user found in token validation response');
      
      return { userId: null, errorReason: 'No user found in Firebase API response' };
    }
    
    const uid = result.users[0].localId;
    if (!uid) {
      secureLog('ERROR: User ID not found in validation response');
      
      return { userId: null, errorReason: 'User ID not found in Firebase API response' };
    }
    
    // Decode token for strict validation (issuer and audience check)
    const decoded = decodeJWTPayload(token);
    if (decoded) {
      // Strict issuer validation
      const iss = decoded.iss;
      if (iss && iss !== EXPECTED_ISSUER) {
        secureLog('SECURITY: Token issuer mismatch. Expected: ' + EXPECTED_ISSUER + ', Got: ' + iss);
        
        return { userId: null, errorReason: 'Token issuer mismatch (expected: ' + EXPECTED_ISSUER + ', got: ' + iss + ')' };
      }
      
      // Strict audience validation
      const aud = decoded.aud;
      if (aud && aud !== FIREBASE_PROJECT_ID) {
        secureLog('SECURITY: Token audience mismatch. Expected: ' + FIREBASE_PROJECT_ID + ', Got: ' + aud);
        
        return { userId: null, errorReason: 'Token audience mismatch (expected: ' + FIREBASE_PROJECT_ID + ', got: ' + aud + ')' };
      }
      
      // Check expiration (reject only if already expired, not if expiring soon)
      // This allows tokens to be used until they actually expire
      const exp = decoded.exp;
      if (exp) {
        const now = Math.floor(new Date().getTime() / 1000);
        // Only reject if token is already expired (with 60 second clock skew tolerance)
        if (exp < (now - 60)) {
          secureLog('ERROR: Token has expired. Exp: ' + exp + ', Now: ' + now);
          
          return { userId: null, errorReason: 'Token has expired (expired at: ' + new Date(exp * 1000).toISOString() + ')' };
        }
        // Log token expiration info in development
        if (LOG_LEVEL === 'development') {
          const timeUntilExpiry = exp - now;

        }
      } else {
        secureLog('ERROR: Token missing expiration claim');
        return { userId: null, errorReason: 'Token missing expiration claim' };
      }
    } else {
      // If we can't decode, still accept API validation but log warning
      secureLog('WARNING: Could not decode token for additional validation, relying on API only');
      
    }
    
    // Cache successful validation
    const expiresAt = Math.floor(new Date().getTime() / 1000) + TOKEN_CACHE_TTL;
    cache.setProperty(cacheKey, JSON.stringify({
      uid: uid,
      expiresAt: expiresAt
    }));
    
    secureLog('Token validated successfully for user: ' + uid.substring(0, 8) + '...');
    return { userId: uid, errorReason: null };
    
  } catch (error) {
    secureLog('ERROR: Exception during token validation - ' + error.toString());
    
    return { userId: null, errorReason: 'Exception during token validation: ' + error.toString() };
  }
}

/**
 * Authorization Helper Function
 * 
 * Run this function from the Apps Script editor to trigger the authorization dialog.
 * This will request permission to make external HTTP requests (UrlFetchApp.fetch).
 * 
 * Steps:
 * 1. Select this function from the dropdown at the top
 * 2. Click "Run"
 * 3. When prompted, click "Review permissions"
 * 4. Select your Google account
 * 5. Click "Advanced" → "Go to [Project Name] (unsafe)" if shown
 * 6. Click "Allow" to grant the permission
 * 7. After authorization, redeploy your web app
 */
function authorizeExternalRequests() {
  try {

    // This will trigger the authorization dialog if permission is not granted
    const testUrl = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=test';
    const response = UrlFetchApp.fetch(testUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: 'test' }),
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();

    return 'Authorization successful! You can now redeploy your web app.';
  } catch (error) {

    throw error;
  }
}

/**
 * Gets user-specific Contacts sheet, creates it if it doesn't exist
 * @param {string} userId - Firebase user ID
 * @returns {Sheet|null} - User's sheet or null
 */
function getUserSheet(userId) {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId provided to getUserSheet: ' + typeof userId);
    }
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      const errorMsg = 'Could not get active spreadsheet. Make sure the Apps Script is bound to a Google Sheet.';
      secureLog('ERROR: ' + errorMsg);
      
      throw new Error(errorMsg);
    }
    
    // Create sheet name for user: Contacts_${userId}
    // Firebase UIDs can contain special characters, so we'll sanitize
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userSheetName = SHEET_NAME + '_' + sanitizedUserId;

    let sheet = spreadsheet.getSheetByName(userSheetName);
    
    if (!sheet) {
      // Create the sheet if it doesn't exist
      try {

        sheet = spreadsheet.insertSheet(userSheetName);
        
        // Add headers
        const headers = ['id', 'name', 'reference', 'phone', 'date', 'type'];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        
        // Format header row
        const headerRange = sheet.getRange(1, 1, 1, headers.length);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#4285f4');
        headerRange.setFontColor('#ffffff');
        
        secureLog('Created new user sheet: ' + userSheetName);
        
      } catch (createError) {
        const errorMsg = 'Error creating user sheet: ' + createError.toString();
        secureLog('ERROR: ' + errorMsg);
        
        throw new Error(errorMsg);
      }
    } else {
      
    }
    
    return sheet;
  } catch (error) {
    const errorMsg = 'Error in getUserSheet: ' + error.toString();
    secureLog('ERROR: ' + errorMsg);
    
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Retrieves all contacts from the sheet
 */
function getContactsFromSheet(sheet) {
  try {
    if (!sheet) {
      throw new Error('Sheet is null or undefined');
    }
    
    // Get all data starting from row 2 (skip header)
    const lastRow = sheet.getLastRow();
    
    if (lastRow < 2) {
      // No data rows, return empty array
      return [];
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 6);
    const values = dataRange.getValues();
    
    // Convert rows to objects
    const contacts = values.map(row => {
      // Handle date formatting - Google Sheets returns dates as Date objects
      let dateValue = row[4] || '';
      
      // If it's a Date object, format it as YYYY-MM-DD
      if (dateValue instanceof Date) {
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        dateValue = `${year}-${month}-${day}`;
      } else if (dateValue) {
        // If it's already a string, try to normalize it
        dateValue = String(dateValue).trim();
      }
      
      return {
        id: row[0] || '',
        name: row[1] || '',
        reference: row[2] || '',
        phone: row[3] || '',
        date: dateValue,
        type: row[5] || ''
      };
    });
    
    // Filter out empty rows
    return contacts.filter(contact => contact.name && contact.date);
  } catch (error) {
    secureLog('ERROR: getContactsFromSheet failed - ' + error.toString());
    
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Generates a UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Test function - can be run from the Apps Script editor to verify setup
 */
function testGetContacts() {
  const sheet = getSheet();
  const contacts = getContactsFromSheet(sheet);
  return contacts;
}

/**
 * Test function for adding a contact
 */
function testAddContact() {
  const testData = {
    name: 'Test Contact',
    phone: '919876543210',
    date: '1990-01-01',
    type: 'Birthday',
    reference: 'Test reference'
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  return result;
}
