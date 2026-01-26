// Day Reminders - Main Application Logic
import { API_URL } from './config.js';
import { initAuth, getCurrentUser, getAuthToken, signOut, onAuthStateChanged } from './auth.js';

// Application state
let contacts = [];
let currentFilter = 'all'; // 'all', 'birthday', 'anniversary'
let searchQuery = ''; // Current search query
let currentUser = null; // Current authenticated user

// DOM Elements
const contactsList = document.getElementById('contactsList');
const contactsListContainer = document.getElementById('contactsListContainer');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const emptyState = document.getElementById('emptyState');
const retryBtn = document.getElementById('retryBtn');
const addBtn = document.getElementById('addBtn');
const addFirstBtn = document.getElementById('addFirstBtn');
const addModal = document.getElementById('addModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn'); // May not exist in new design
const addContactForm = document.getElementById('addContactForm');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');
const formErrorMessage = document.getElementById('formErrorMessage');
const successToast = document.getElementById('successToast');
const darkModeToggle = document.getElementById('darkModeToggle');
const filterAll = document.getElementById('filterAll');
const filterBirthday = document.getElementById('filterBirthday');
const filterAnniversary = document.getElementById('filterAnniversary');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const editModal = document.getElementById('editModal');
const closeEditModalBtn = document.getElementById('closeEditModalBtn');
const editContactForm = document.getElementById('editContactForm');
const editSubmitBtn = document.getElementById('editSubmitBtn');
const editFormError = document.getElementById('editFormError');
const editFormErrorMessage = document.getElementById('editFormErrorMessage');
const deleteModal = document.getElementById('deleteModal');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteContactName = document.getElementById('deleteContactName');
const deleteContactId = document.getElementById('deleteContactId');
const successToastMessage = document.getElementById('successToastMessage');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const signOutBtn = document.getElementById('signOutBtn');

// Track if event listeners have been set up to avoid duplicate setup
let eventListenersSetup = false;
// Track if user has been successfully authenticated to prevent redirect loops
let userAuthenticated = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    
    if (!API_URL) {
        console.error('API_URL not configured');
        showError('Please configure API_URL in config.js');
        return;
    }

    // Initialize authentication
    // Firebase's onAuthStateChanged fires immediately with current state
    // We need to handle the initial state properly, especially after redirects
    let authStateResolved = false;
    let initialAuthCheckDone = false;
    
    try {
        initAuth((user) => {
            currentUser = user;
            
            // Only handle auth state after initial check is complete
            if (!authStateResolved) {
                authStateResolved = true;
                
                // Check if we're coming from a login redirect
                const fromLogin = sessionStorage.getItem('fromLogin') === 'true';
                const waitTime = fromLogin ? 500 : 200; // Wait longer if coming from login

                // Longer delay to ensure Firebase has time to restore auth state from persistence
                // This is critical after a page redirect
                setTimeout(() => {
                    // Check auth state again after delay - Firebase might have restored it
                    const currentUserAfterWait = getCurrentUser();
                    
                    // Use the user from the callback, but if it's null, check again
                    const userToHandle = currentUserAfterWait || user;
                    
                    if (!initialAuthCheckDone) {
                        initialAuthCheckDone = true;
                        
                        // If user is still null but we came from login, wait a bit more
                        if (!userToHandle) {
                            const fromLogin = sessionStorage.getItem('fromLogin') === 'true';
                            if (fromLogin) {
                                setTimeout(() => {
                                    const finalUser = getCurrentUser();
                                    handleAuthState(finalUser || userToHandle);
                                }, 500);
                                return;
                            }
                        }
                        
                        handleAuthState(userToHandle);
                    }
                }, waitTime);
            } else {
                // Subsequent auth state changes (like sign out)
                handleAuthState(user);
            }
        });
    } catch (error) {
        console.error('Error initializing auth:', error);
        showError('Failed to initialize authentication. Please refresh the page.');
    }
});

/**
 * Handle authentication state changes
 */
function handleAuthState(user) {
    
    if (user) {
        // User is authenticated
        
        // Mark that we've successfully authenticated - prevent redirects
        userAuthenticated = true;
        
        // Clear the fromLogin flag since we're successfully authenticated
        sessionStorage.removeItem('fromLogin');
        sessionStorage.removeItem('loginTime');
        
        // Only set up event listeners once
        if (!eventListenersSetup) {
            try {
                setupEventListeners();
                eventListenersSetup = true;
            } catch (error) {
                console.error('Error setting up event listeners:', error);
                // Continue anyway - listeners might already be set up
            }
        }
        
        showMainApp();
        loadContacts();
        updateUserUI(user);
    } else {
        // User is not authenticated
        
        // IMPORTANT: If we've already successfully authenticated, don't redirect
        // This prevents redirect loops when onAuthStateChanged fires multiple times
        if (userAuthenticated) {
            
            // Double-check by getting current user directly
            const directCheck = getCurrentUser();
            if (directCheck) {
                // User is actually authenticated, update state
                userAuthenticated = true;
                handleAuthState(directCheck);
                return;
            } else {
                userAuthenticated = false;
            }
        }
        
        // Check if we just came from login (might be a timing issue)
        const fromLogin = sessionStorage.getItem('fromLogin') === 'true';
        const loginTime = sessionStorage.getItem('loginTime');
        
        if (fromLogin && loginTime) {
            const timeSinceLogin = Date.now() - parseInt(loginTime);
            
            // If it's been less than 5 seconds since login, wait longer for Firebase to restore
            if (timeSinceLogin < 5000) {
                
                // Try multiple times with increasing delays
                let attempts = 0;
                const maxAttempts = 4;
                const checkAuth = () => {
                    attempts++;
                    const userAfterWait = getCurrentUser();
                    
                    if (userAfterWait) {
                        // User is actually authenticated, handle it
                        userAuthenticated = true;
                        sessionStorage.removeItem('fromLogin');
                        sessionStorage.removeItem('loginTime');
                        handleAuthState(userAfterWait);
                    } else if (attempts < maxAttempts) {
                        // Try again with increasing delay
                        setTimeout(checkAuth, 500 * attempts);
                    } else {
                        // Really not authenticated after all attempts
                        userAuthenticated = false;
                        sessionStorage.removeItem('fromLogin');
                        sessionStorage.removeItem('loginTime');
                        redirectToLogin();
                    }
                };
                
                // Start checking after initial delay
                setTimeout(checkAuth, 300);
                return; // Don't redirect immediately
            } else {
                // Too much time has passed, clear the flag
                userAuthenticated = false;
                sessionStorage.removeItem('fromLogin');
                sessionStorage.removeItem('loginTime');
            }
        }
        
        // Only redirect if not already on login page AND we haven't been authenticated
        if (!userAuthenticated) {
            const currentPath = window.location.pathname;
            const currentUrl = window.location.href;
            
            // Treat ONLY explicit /login or /login.html routes as the login page.
            // Do NOT treat the root path ("/") or other routes as login.
            const isLoginPath =
                currentPath.endsWith('/login') ||
                currentPath.endsWith('/login.html');
            
            const isLoginUrl =
                currentUrl.includes('/login?') ||
                currentUrl.endsWith('/login') ||
                currentUrl.endsWith('/login.html');
            
            const isLoginPage = isLoginPath || isLoginUrl;
            
            if (!isLoginPage) {
                redirectToLogin();
            } else {
            }
        } else {
        }
    }
}

// Event Listeners Setup
function setupEventListeners() {
    retryBtn.addEventListener('click', loadContacts);
    addBtn.addEventListener('click', showAddModal);
    addFirstBtn.addEventListener('click', showAddModal);
    closeModalBtn.addEventListener('click', hideAddModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideAddModal);
    addContactForm.addEventListener('submit', handleFormSubmit);
    
    // Dark mode toggle
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }
    
    // Sign out button
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
    
    // Filter buttons
    if (filterAll) filterAll.addEventListener('click', () => setFilter('all'));
    if (filterBirthday) filterBirthday.addEventListener('click', () => setFilter('birthday'));
    if (filterAnniversary) filterAnniversary.addEventListener('click', () => setFilter('anniversary'));
    
    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearchInput();
            }
        });
    }
    if (clearSearch) {
        clearSearch.addEventListener('click', clearSearchInput);
    }
    
    // Edit modal
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', hideEditModal);
    }
    if (editContactForm) {
        editContactForm.addEventListener('submit', handleEditFormSubmit);
    }
    
    // Delete modal
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    }
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', handleDeleteContact);
    }
    
    // Close modals on background click
    addModal.addEventListener('click', (e) => {
        if (e.target === addModal) {
            hideAddModal();
        }
    });
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                hideEditModal();
            }
        });
    }
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                hideDeleteModal();
            }
        });
    }
    
    // Event delegation for edit and delete buttons (since they're dynamically created)
    if (contactsList) {
        contactsList.addEventListener('click', (e) => {
            // Handle edit button clicks
            if (e.target.closest('.edit-contact-btn')) {
                const btn = e.target.closest('.edit-contact-btn');
                const contactId = btn.getAttribute('data-edit-id');
                if (contactId) {
                    editContact(contactId);
                }
            }
            
            // Handle delete button clicks
            if (e.target.closest('.delete-contact-btn')) {
                const btn = e.target.closest('.delete-contact-btn');
                const contactId = btn.getAttribute('data-delete-id');
                const contactName = btn.getAttribute('data-delete-name');
                if (contactId && contactName) {
                    confirmDeleteContact(contactId, contactName);
                }
            }
        });
    }
    
    // Initialize dark mode from localStorage
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        updateDarkModeIcon(true);
    }
}

// Date Calculation Logic
/**
 * Normalizes date string to YYYY-MM-DD format
 * Handles various formats that Google Sheets might return
 * IMPORTANT: Parses dates without timezone conversion to avoid day shifts
 * @param {string} dateString - Date in various formats
 * @returns {string} - Date in YYYY-MM-DD format
 */
function normalizeDateString(dateString) {
    if (!dateString) return '';
    
    const str = String(dateString).trim();
    
    // If it's already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }
    
    // Check if it's an ISO string with timezone (e.g., "2000-01-28T00:00:00.000Z")
    // Extract just the date part to avoid timezone conversion
    if (str.includes('T')) {
        const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            // Use the date components directly, ignoring timezone
            return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        }
    }
    
    // Try parsing as Date object, but be careful with timezone
    // For YYYY-MM-DD strings, new Date() interprets as UTC, which causes issues
    // So we'll parse the components directly if possible
    const ymdMatch = str.match(/^(\d{4})[\/\s-]+(\d{1,2})[\/\s-]+(\d{1,2})$/);
    if (ymdMatch) {
        // Format: YYYY-MM-DD or YYYY/MM/DD
        return `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, '0')}-${String(ymdMatch[3]).padStart(2, '0')}`;
    }
    
    const dmyMatch = str.match(/^(\d{1,2})[\/\s-]+(\d{1,2})[\/\s-]+(\d{4})$/);
    if (dmyMatch) {
        // Format: DD/MM/YYYY or DD-MM-YYYY (assuming day comes first)
        return `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(dmyMatch[1]).padStart(2, '0')}`;
    }
    
    // Try parsing text format like "28 January 2000"
    const textMatch = str.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
    if (textMatch) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                          'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIndex = monthNames.findIndex(m => 
            textMatch[2].toLowerCase().startsWith(m.toLowerCase())
        );
        if (monthIndex !== -1) {
            return `${textMatch[3]}-${String(monthIndex + 1).padStart(2, '0')}-${String(textMatch[1]).padStart(2, '0')}`;
        }
    }
    
    // Last resort: try Date object, but use UTC methods to avoid timezone shift
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        // Use UTC methods to avoid timezone conversion
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return str; // Return original if can't parse
}

/**
 * Calculates the next occurrence of a date and days remaining
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Object} - { nextOccurrence: Date, daysRemaining: number }
 */
function calculateNextOccurrence(dateString) {
    // Normalize the date string first
    const normalizedDate = normalizeDateString(dateString);
    
    // Parse the date string (should be YYYY-MM-DD now)
    const dateParts = normalizedDate.split('-');
    if (dateParts.length !== 3) {
        console.error('Invalid date format:', dateString);
        throw new Error('Invalid date format');
    }
    
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
    const day = parseInt(dateParts[2]);
    
    // Validate parsed values
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        console.error('Invalid date values:', { year, month, day, original: dateString });
        throw new Error('Invalid date values');
    }
    
    // Get today's date in LOCAL timezone (set to midnight for accurate comparison)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Create date for this year in LOCAL timezone (not UTC)
    // Using new Date(year, month, day) creates a date in local timezone
    let nextOccurrence = new Date(today.getFullYear(), month, day);
    nextOccurrence.setHours(0, 0, 0, 0);
    
    // Handle leap year edge case: Feb 29
    if (month === 1 && day === 29) {
        // Check if current year is a leap year
        const isLeapYear = (year) => {
            return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
        };
        
        // If current year is not a leap year, use Feb 28
        if (!isLeapYear(today.getFullYear())) {
            nextOccurrence = new Date(today.getFullYear(), 1, 28);
            nextOccurrence.setHours(0, 0, 0, 0);
        }
    }
    
    // If the date has already passed this year, move to next year
    if (nextOccurrence < today) {
        const nextYear = today.getFullYear() + 1;
        
        // Handle leap year for next year
        if (month === 1 && day === 29) {
            const isNextYearLeap = (nextYear % 4 === 0 && nextYear % 100 !== 0) || (nextYear % 400 === 0);
            if (isNextYearLeap) {
                nextOccurrence = new Date(nextYear, month, day);
            } else {
                nextOccurrence = new Date(nextYear, 1, 28);
            }
        } else {
            nextOccurrence = new Date(nextYear, month, day);
        }
        nextOccurrence.setHours(0, 0, 0, 0);
    }
    
    // Calculate days remaining
    const timeDiff = nextOccurrence - today;
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    return {
        nextOccurrence,
        daysRemaining
    };
}

// Data Fetching & Processing
/**
 * Fetches contacts from the API
 */
async function fetchContacts() {
    try {
        showLoading();
        
        // Get Firebase ID token
        const token = await getAuthToken();
        
        if (!token) {
            console.error('❌ No token available from getAuthToken()');
            throw new Error('No authentication token available');
        }
        
        // Validate token format (JWT should have 3 parts)
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
            console.error('❌ Invalid token format - expected JWT with 3 parts, got:', tokenParts.length);
            throw new Error('Invalid token format');
        }
        
        // Use POST request with token in body (secure - no tokens in URL)
        const requestData = {
            action: 'getContacts',
            token: token
        };
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            // If unauthorized, token might be expired - try refreshing
            if (response.status === 401) {
                const refreshedToken = await getAuthToken(true);
                const retryData = {
                    action: 'getContacts',
                    token: refreshedToken
                };
                const retryResponse = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: JSON.stringify(retryData)
                });
                if (!retryResponse.ok) {
                    throw new Error(`HTTP error! status: ${retryResponse.status}`);
                }
                const retryResponseData = await retryResponse.json();
                
                // Check for error in retry response
                if (retryResponseData && typeof retryResponseData === 'object' && !Array.isArray(retryResponseData) && retryResponseData.error) {
                    const errorMessage = retryResponseData.message || 'Authentication failed';
                    // Only redirect if user is not authenticated
                    if (!userAuthenticated) {
                        redirectToLogin();
                    }
                    throw new Error(errorMessage);
                }
                
                if (!Array.isArray(retryResponseData)) {
                    throw new Error('Invalid data format: expected an array');
                }
                return retryResponseData;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Check if API returned an error object
        if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
            const errorMessage = data.message || 'Authentication failed';
            const errorCode = data.code || 'UNKNOWN';
            
            console.error('❌ API returned error:', {
                message: errorMessage,
                code: errorCode,
                fullError: data
            });
            
            // Check if this is a permission error (Apps Script authorization issue)
            if (errorMessage.includes('Permission denied') || errorMessage.includes('authorization') || errorMessage.includes('authorizeExternalRequests')) {
                const permissionError = 'Apps Script Authorization Required: The backend needs permission to make external API calls. ' +
                    'Please run the authorizeExternalRequests() function in your Apps Script editor and redeploy. ' +
                    'See AUTHORIZATION_GUIDE.md for detailed instructions.';
                console.error('🔒 PERMISSION ERROR:', permissionError);
                showError(permissionError);
                throw new Error(permissionError);
            }
            
            // If authentication error, only redirect if user is not authenticated
            // Don't redirect if we've already successfully authenticated (prevents loops)
            if ((errorMessage.includes('Authentication') || errorMessage.includes('token') || errorMessage.includes('Invalid')) && !userAuthenticated) {
                redirectToLogin();
                throw new Error(errorMessage);
            } else if (errorMessage.includes('Authentication') || errorMessage.includes('token') || errorMessage.includes('Invalid')) {
                // Still throw the error, but don't redirect
                throw new Error(errorMessage);
            }
            
            throw new Error(errorMessage);
        }
        
        // Validate data is an array
        if (!Array.isArray(data)) {
            const errorMsg = data && data.message ? data.message : 'Invalid data format: expected an array';
            throw new Error(errorMsg);
        }
        
        return data;
    } catch (error) {
        console.error('❌ Error in fetchContacts:', {
            message: error.message,
            stack: error.stack,
            userAuthenticated: userAuthenticated
        });
        
        // If auth error, only redirect if user is not authenticated
        // Don't redirect if we've already successfully authenticated (prevents loops)
        if ((error.message.includes('401') || 
            error.message.includes('No authenticated user') ||
            error.message.includes('Authentication') ||
            error.message.includes('token') ||
            error.message.includes('Invalid or expired')) && !userAuthenticated) {
            redirectToLogin();
        }
        throw error;
    }
}

/**
 * Processes contacts by adding nextOccurrence and daysRemaining
 * @param {Array} contacts - Array of contact objects
 * @returns {Array} - Processed contacts with date calculations
 */
function processContacts(contacts) {
    return contacts.map(contact => {
        try {
            // Normalize all fields to handle Google Sheets data types
            // Google Sheets might return numbers as numbers, dates as Date objects, etc.
            const name = contact.name != null ? String(contact.name).trim() : '';
            let date = contact.date != null ? String(contact.date).trim() : '';
            const type = contact.type != null ? String(contact.type).trim() : '';
            const phone = contact.phone != null ? String(contact.phone).trim() : '';
            const reference = contact.reference != null ? String(contact.reference).trim() : '';
            const id = contact.id != null ? String(contact.id).trim() : '';
            
            // Skip invalid contacts (must have name, date, and type)
            if (!name || !date || !type) {
                return null;
            }
            
            // Normalize date format - Google Sheets might return dates in various formats
            const originalDate = date;
            date = normalizeDateString(date);
            
            // Debug logging for date issues
            if (originalDate !== date) {
            }
            
            const { nextOccurrence, daysRemaining } = calculateNextOccurrence(date);
            
            // Additional debug: log the calculated next occurrence
            
            return {
                id,
                name,
                phone,
                date,
                type,
                reference,
                nextOccurrence,
                daysRemaining
            };
        } catch (error) {
            console.error('Error processing contact:', contact, error);
            return null; // Return null for contacts that fail processing
        }
    }).filter(contact => contact !== null); // Filter out null contacts
}

/**
 * Sorts contacts by days remaining (ascending)
 * @param {Array} contacts - Array of processed contacts
 * @returns {Array} - Sorted contacts
 */
function sortContactsByDays(contacts) {
    return [...contacts].sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Loads and displays contacts
 */
async function loadContacts() {
    try {
        const rawContacts = await fetchContacts();
        
        const processedContacts = processContacts(rawContacts);
        
        const sortedContacts = sortContactsByDays(processedContacts);
        
        contacts = sortedContacts;
        
        // Always render list (it will handle empty state internally)
        renderList(contacts);
    } catch (error) {
        console.error('❌ Error in loadContacts:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Don't show error or redirect if it's an auth error and we're authenticated
        // This prevents error messages from showing when token validation fails but user is logged in
        if (error.message.includes('Authentication') || error.message.includes('token')) {
            if (userAuthenticated) {
                // Still show error to user, but don't redirect
            }
        }
        
        showError(error.message || 'Failed to load contacts. Please check your API URL and try again.');
    }
}

/**
 * Refreshes the contact list from local cache (no API call)
 * This provides instant UI updates after add/edit/delete operations
 */
function refreshListFromCache() {
    // Re-sort contacts by days remaining
    const sortedContacts = sortContactsByDays(contacts);
    contacts = sortedContacts;
    
    // Re-render the list (renderList will handle filtering and search internally)
    renderList(contacts);
}

/**
 * Adds a new contact to the local cache
 * @param {Object} contactData - Contact data from form
 * @param {string} contactId - ID returned from API
 */
function addContactToCache(contactData, contactId) {
    // Process the contact data to include nextOccurrence and daysRemaining
    const normalizedDate = normalizeDateString(contactData.date);
    const { nextOccurrence, daysRemaining } = calculateNextOccurrence(normalizedDate);
    
    const newContact = {
        id: contactId,
        name: contactData.name.trim(),
        phone: contactData.phone?.trim() || '',
        date: normalizedDate,
        type: contactData.type.trim(),
        reference: contactData.reference?.trim() || '',
        nextOccurrence,
        daysRemaining
    };
    
    // Add to cache
    contacts.push(newContact);
    
    // Refresh the list
    refreshListFromCache();
}

/**
 * Updates a contact in the local cache
 * @param {Object} contactData - Updated contact data
 */
function updateContactInCache(contactData) {
    // Find the contact in cache
    const index = contacts.findIndex(c => c.id === contactData.id);
    if (index === -1) {
        // If not found, do a full reload as fallback
        loadContacts();
        return;
    }
    
    // Process the updated data
    const normalizedDate = normalizeDateString(contactData.date);
    const { nextOccurrence, daysRemaining } = calculateNextOccurrence(normalizedDate);
    
    // Update the contact
    contacts[index] = {
        ...contacts[index],
        name: contactData.name.trim(),
        phone: contactData.phone?.trim() || '',
        date: normalizedDate,
        type: contactData.type.trim(),
        reference: contactData.reference?.trim() || '',
        nextOccurrence,
        daysRemaining
    };
    
    // Refresh the list
    refreshListFromCache();
}

/**
 * Removes a contact from the local cache
 * @param {string} contactId - ID of contact to remove
 */
function removeContactFromCache(contactId) {
    // Remove from cache
    const index = contacts.findIndex(c => c.id === contactId);
    if (index === -1) {
        // If not found, do a full reload as fallback
        loadContacts();
        return;
    }
    
    contacts.splice(index, 1);
    
    // Refresh the list
    refreshListFromCache();
}

// UI State Management
function showLoading() {
    loadingState.classList.remove('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
    contactsList.innerHTML = '';
}

function showEmptyState() {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    contactsList.innerHTML = '';
}

function hideAllStates() {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
    if (contactsListContainer) {
        contactsListContainer.classList.add('hidden');
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorState.classList.remove('hidden');
    loadingState.classList.add('hidden');
    emptyState.classList.add('hidden');
    contactsList.innerHTML = '';
}

// WhatsApp Integration
/**
 * Generates WhatsApp link with pre-filled message
 * @param {string|number} phone - Phone number (international format without +)
 * @param {string} type - Contact type (Birthday, Anniversary, or custom)
 * @param {string} name - Contact name (optional)
 * @returns {string} - WhatsApp URL
 */
function generateWhatsAppLink(phone, type, name = '') {
    if (!phone) return '#';
    
    // Ensure phone is a string and remove any whitespace
    const phoneStr = String(phone).trim();
    if (!phoneStr) return '#';
    
    // Generate message based on type
    let message;
    if (!type) {
        message = 'Hello! 👋';
    } else {
        const normalizedType = type.toLowerCase().trim();
        const contactName = name ? name.trim() : '';
        
        if (normalizedType === 'birthday') {
            if (contactName) {
                message = `Happy Birthday ${contactName} 🎉🎂🥳\n\nWish you a splendid years ahead.\n\n✌️`;
            } else {
                message = 'Happy Birthday 🎉🎂🥳\n\nWish you a splendid years ahead.\n\n✌️';
            }
        } else if (normalizedType === 'anniversary') {
            if (contactName) {
                message = `Happy Anniversary ${contactName} 💍\n\nWish you a wonderful years ahead.\n\n✌️`;
            } else {
                message = 'Happy Anniversary 💍\n\nWish you a wonderful years ahead.\n\n✌️';
            }
        } else {
            // Custom type - use a generic greeting
            if (contactName) {
                message = `Happy ${type} ${contactName} 🎊\n\nWish you a wonderful years ahead.\n\n✌️`;
            } else {
                message = `Happy ${type} 🎊\n\nWish you a wonderful years ahead.\n\n✌️`;
            }
        }
    }
    
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${phoneStr}?text=${encodedMessage}`;
}

// Rendering
/**
 * Formats date for display (e.g., "24 OCT")
 * @param {Date} date - Date object
 * @returns {string} - Formatted date string
 */
function formatDateBadge(date) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                   'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    return `${day} ${month}`;
}

/**
 * Gets the appropriate icon for contact type
 * @param {string} type - Contact type
 * @returns {string} - FontAwesome icon class
 */
function getTypeIcon(type) {
    if (!type) return 'fa-calendar';
    
    const normalizedType = type.toLowerCase().trim();
    
    if (normalizedType === 'birthday') {
        return 'fa-birthday-cake';
    } else if (normalizedType === 'anniversary') {
        return 'fa-heart';
    } else {
        // Default icon for custom types
        return 'fa-calendar-check';
    }
}

/**
 * Gets the appropriate color for contact type badge
 * @param {string} type - Contact type
 * @returns {string} - Tailwind color classes
 */
function getTypeBadgeColor(type) {
    if (!type) return 'bg-gray-100 text-gray-800';
    
    const normalizedType = type.toLowerCase().trim();
    
    if (normalizedType === 'birthday') {
        return 'bg-pink-100 text-pink-800';
    } else if (normalizedType === 'anniversary') {
        return 'bg-red-100 text-red-800';
    } else {
        // Default color for custom types
        return 'bg-blue-100 text-blue-800';
    }
}

/**
 * Gets days remaining text with appropriate styling
 * @param {number} daysRemaining - Days until next occurrence
 * @returns {Object} - { text: string, color: string }
 */
function getDaysRemainingText(daysRemaining) {
    if (daysRemaining === 0) {
        return { text: 'Today!', color: 'text-primary font-bold' };
    } else if (daysRemaining === 1) {
        return { text: 'Tomorrow', color: 'text-primary font-semibold' };
    } else if (daysRemaining <= 7) {
        return { text: `In ${daysRemaining} days`, color: 'text-text-muted dark:text-neutral-400' };
    } else {
        return { text: `In ${daysRemaining} days`, color: 'text-text-muted dark:text-neutral-400' };
    }
}

/**
 * Toggles dark mode
 */
function toggleDarkMode() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        localStorage.setItem('darkMode', 'false');
        updateDarkModeIcon(false);
    } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        localStorage.setItem('darkMode', 'true');
        updateDarkModeIcon(true);
    }
}

/**
 * Updates dark mode icon
 */
function updateDarkModeIcon(isDark) {
    if (darkModeToggle) {
        const icon = darkModeToggle.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        }
    }
}

/**
 * Sets the active filter
 */
function setFilter(filter) {
    currentFilter = filter;
    
    // Update button states
    [filterAll, filterBirthday, filterAnniversary].forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
    
    if (filter === 'all' && filterAll) filterAll.classList.add('active');
    if (filter === 'birthday' && filterBirthday) filterBirthday.classList.add('active');
    if (filter === 'anniversary' && filterAnniversary) filterAnniversary.classList.add('active');
    
    // Re-render with filter (search is preserved)
    renderList(contacts);
}

/**
 * Filters contacts based on current filter and search query
 */
function getFilteredContacts(contacts) {
    let filtered = contacts;
    
    // Apply type filter
    if (currentFilter === 'birthday') {
        filtered = filtered.filter(c => c.type.toLowerCase() === 'birthday');
    } else if (currentFilter === 'anniversary') {
        filtered = filtered.filter(c => c.type.toLowerCase() === 'anniversary');
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(contact => {
            const nameMatch = contact.name && contact.name.toLowerCase().includes(query);
            const referenceMatch = contact.reference && contact.reference.toLowerCase().includes(query);
            return nameMatch || referenceMatch;
        });
    }
    
    return filtered;
}

/**
 * Handles search input
 */
function handleSearch(e) {
    searchQuery = e.target.value;
    
    // Show/hide clear button
    if (clearSearch) {
        if (searchQuery.trim()) {
            clearSearch.classList.remove('hidden');
        } else {
            clearSearch.classList.add('hidden');
        }
    }
    
    // Re-render with search
    renderList(contacts);
}

/**
 * Clears search input
 */
function clearSearchInput() {
    if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        if (clearSearch) {
            clearSearch.classList.add('hidden');
        }
        renderList(contacts);
    }
}

/**
 * Updates greeting text
 */
function updateGreeting(count) {
    const greetingText = document.getElementById('greetingText');
    const eventsCount = document.getElementById('eventsCount');
    
    if (greetingText) {
        const hour = new Date().getHours();
        let greeting = 'Good Morning';
        if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
        if (hour >= 17) greeting = 'Good Evening';
        greetingText.textContent = `${greeting}!`;
    }
    
    if (eventsCount) {
        if (searchQuery.trim()) {
            if (count === 0) {
                eventsCount.textContent = `No results found for "${searchQuery}".`;
            } else if (count === 1) {
                eventsCount.textContent = `Found 1 result for "${searchQuery}".`;
            } else {
                eventsCount.textContent = `Found ${count} results for "${searchQuery}".`;
            }
        } else {
            if (count === 0) {
                eventsCount.textContent = 'No upcoming events.';
            } else if (count === 1) {
                eventsCount.textContent = 'You have 1 upcoming event.';
            } else {
                eventsCount.textContent = `You have ${count} upcoming events.`;
            }
        }
    }
}

/**
 * Renders the list of contacts
 * @param {Array} contacts - Array of contact objects
 */
function renderList(allContacts) {
    // Filter contacts
    const filteredContacts = getFilteredContacts(allContacts);
    
    if (filteredContacts.length === 0 && allContacts.length > 0) {
        // Show empty state for filtered/search results
        hideAllStates();
        if (contactsListContainer) {
            contactsListContainer.classList.remove('hidden');
        }
        let message = 'No contacts match the selected filter.';
        if (searchQuery.trim()) {
            message = `No contacts found matching "${searchQuery}".`;
        }
        contactsList.innerHTML = `<div class="flex flex-col items-center justify-center py-12">
            <span class="material-symbols-outlined text-6xl text-text-muted dark:text-neutral-500 mb-4 opacity-50">search_off</span>
            <p class="text-text-muted dark:text-neutral-400 text-center font-medium">${message}</p>
            ${searchQuery.trim() ? `<button onclick="document.getElementById('searchInput').value = ''; document.getElementById('clearSearch').click();" class="mt-4 text-primary hover:text-primary-hover font-semibold">Clear search</button>` : ''}
        </div>`;
        return;
    }
    
    if (allContacts.length === 0) {
        showEmptyState();
        return;
    }
    
    hideAllStates();
    
    // Show the contacts list container
    if (contactsListContainer) {
        contactsListContainer.classList.remove('hidden');
    }
    
    // Update greeting and count
    updateGreeting(filteredContacts.length);
    
    try {
        contactsList.innerHTML = filteredContacts.map(contact => {
            try {
                // Validate required fields
                if (!contact.name || !contact.date || !contact.type || !contact.nextOccurrence) {
                    return ''; // Skip invalid contacts
                }
                
                const dateBadge = formatDateBadge(contact.nextOccurrence);
                const iconClass = getTypeIcon(contact.type);
                const badgeColor = getTypeBadgeColor(contact.type);
                const { text: daysText, color: daysColor } = getDaysRemainingText(contact.daysRemaining);
                const whatsappLink = generateWhatsAppLink(contact.phone, contact.type, contact.name);
                // Safe check: phone is already normalized to string in processContacts
                const hasPhone = contact.phone && String(contact.phone).trim() !== '';
                
                // Determine date badge styling based on urgency
                const isUrgent = contact.daysRemaining <= 1;
                const dateBadgeBg = isUrgent 
                    ? 'bg-orange-50 dark:bg-orange-900/20 text-primary border-orange-100 dark:border-orange-900/30' 
                    : 'bg-neutral-100 dark:bg-neutral-800 text-text-main dark:text-neutral-300';
                const dateParts = dateBadge.split(' ');
                const dayNum = dateParts[0];
                const monthAbbr = dateParts[1];
                
                return `
            <article class="group relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-white dark:bg-card-dark p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 hover:shadow-md transition-all hover:border-primary/20 dark:hover:border-primary/20">
                <!-- Date Badge -->
                <div class="flex flex-col items-center justify-center size-12 sm:size-16 shrink-0 rounded-lg sm:rounded-xl ${dateBadgeBg} border self-start sm:self-center">
                    <span class="text-[9px] sm:text-xs font-bold uppercase tracking-wide ${isUrgent ? '' : 'opacity-60'}">${monthAbbr}</span>
                    <span class="text-lg sm:text-2xl font-bold leading-none">${dayNum}</span>
                </div>
                
                <!-- Contact Info - Takes remaining space -->
                <div class="flex flex-col flex-1 min-w-0 gap-1.5">
                    <h4 class="text-base sm:text-lg font-bold text-text-main dark:text-white break-words leading-tight">${escapeHtml(contact.name)}</h4>
                    <div class="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-text-muted dark:text-neutral-400 flex-wrap">
                        <span class="flex items-center gap-1 font-medium text-text-main dark:text-neutral-300 whitespace-nowrap">
                            ${contact.type.toLowerCase() === 'birthday' ? '🎂' : contact.type.toLowerCase() === 'anniversary' ? '💍' : '📅'} ${escapeHtml(contact.type)}
                        </span>
                        <span class="size-1 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0"></span>
                        <span class="font-bold ${daysColor} whitespace-nowrap">${daysText}</span>
                    </div>
                    ${contact.reference ? `
                        <p class="text-xs sm:text-sm text-text-muted dark:text-neutral-500 break-words leading-relaxed mt-0.5">
                            ${escapeHtml(contact.reference)}
                        </p>
                    ` : ''}
                </div>
                
                <!-- Action Buttons - Horizontal row on all screens -->
                <div class="flex items-center gap-2 sm:gap-2 shrink-0 sm:flex-col sm:items-stretch sm:gap-1.5">
                    <!-- WhatsApp Button -->
                    ${hasPhone ? `
                        <a href="${whatsappLink}" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="flex items-center justify-center size-10 sm:size-12 rounded-full bg-[#E5F7EB] text-brand-teal hover:bg-[#d1f0da] dark:bg-brand-teal/20 dark:text-[#4ade80] transition-colors"
                           title="Send WhatsApp message">
                            <span class="material-symbols-outlined text-[20px] sm:text-[26px]">chat</span>
                        </a>
                    ` : `
                        <button class="flex items-center justify-center size-10 sm:size-12 rounded-full bg-neutral-50 text-neutral-400 border border-neutral-100 hover:bg-neutral-100 hover:text-brand-teal dark:bg-neutral-800 dark:border-neutral-700 transition-colors" disabled title="No phone number">
                            <span class="material-symbols-outlined text-[20px] sm:text-[26px]">chat</span>
                        </button>
                    `}
                    
                    <!-- Edit Button -->
                    <button data-edit-id="${escapeHtml(contact.id)}" 
                            class="edit-contact-btn flex items-center justify-center size-10 sm:size-12 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 transition-colors"
                            title="Edit contact">
                        <span class="material-symbols-outlined text-[20px] sm:text-[26px]">edit</span>
                    </button>
                    
                    <!-- Delete Button -->
                    <button data-delete-id="${escapeHtml(contact.id)}" 
                            data-delete-name="${escapeHtml(contact.name)}"
                            class="delete-contact-btn flex items-center justify-center size-10 sm:size-12 rounded-full bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 transition-colors"
                            title="Delete contact">
                        <span class="material-symbols-outlined text-[20px] sm:text-[26px]">delete</span>
                    </button>
                </div>
            </article>
        `;
            } catch (error) {
                console.error('Error rendering contact:', contact, error);
                return ''; // Return empty string for failed renders
            }
        }).filter(html => html !== '').join(''); // Filter out empty strings
        
        // If no contacts were rendered, show empty state
        if (contactsList.innerHTML.trim() === '') {
            showEmptyState();
        }
    } catch (error) {
        console.error('Error in renderList:', error);
        showError('Error rendering contacts. Please check the console for details.');
    }
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal Functions
function showAddModal() {
    addModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    addContactForm.reset();
    formError.classList.add('hidden');
    
    // Ensure form is enabled when opening
    const inputs = addContactForm.querySelectorAll('input, select, button');
    inputs.forEach(input => {
        if (input.type !== 'submit') {
            input.disabled = false;
        }
    });
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Save Reminder</span>';
}

function hideAddModal() {
    addModal.classList.add('hidden');
    document.body.style.overflow = '';
    addContactForm.reset();
    formError.classList.add('hidden');
    
    // Always re-enable form when closing modal
    const inputs = addContactForm.querySelectorAll('input, select, button');
    inputs.forEach(input => input.disabled = false);
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Save Reminder</span>';
}

// Form Validation & Submission
/**
 * Validates form data
 * @param {FormData} formData - Form data object
 * @returns {Object} - { isValid: boolean, errors: Array }
 */
function validateForm(formData) {
    const errors = [];
    const name = formData.get('name')?.trim();
    const date = formData.get('date');
    const type = formData.get('type');
    
    if (!name || name.length === 0) {
        errors.push('Name is required');
    }
    
    if (!date) {
        errors.push('Date is required');
    } else {
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            errors.push('Invalid date format');
        }
    }
    
    const trimmedType = type?.trim();
    if (!trimmedType || trimmedType.length === 0) {
        errors.push('Type is required');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Handles form submission
 * @param {Event} event - Form submit event
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    // Hide previous errors
    formError.classList.add('hidden');
    
    // Get form data
    const formData = new FormData(addContactForm);
    
    // Validate
    const validation = validateForm(formData);
    if (!validation.isValid) {
        formErrorMessage.textContent = validation.errors.join(', ');
        formError.classList.remove('hidden');
        return;
    }
    
    // Prepare contact data
    const contactData = {
        name: formData.get('name').trim(),
        phone: formData.get('phone')?.trim() || '',
        date: formData.get('date'),
        type: formData.get('type')?.trim() || '', // Trim type to handle custom inputs
        reference: formData.get('reference')?.trim() || ''
    };
    
    // Set loading state
    const originalButtonText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span><span>Saving...</span>';
    
    // Disable form inputs
    const inputs = addContactForm.querySelectorAll('input, select');
    inputs.forEach(input => input.disabled = true);
    
    try {
        const result = await addContact(contactData);
        
        // Get the contact ID from the result
        const contactId = result.id || result.contactId;
        if (!contactId) {
            // If no ID returned, fall back to full reload
            hideAddModal();
            showSuccessToast();
            await loadContacts();
            return;
        }
        
        // Success - add to local cache and refresh UI instantly
        addContactToCache(contactData, contactId);
        
        // Close modal and show success
        hideAddModal();
        showSuccessToast();
    } catch (error) {
        console.error('Error in form submission:', error);
        
        // Show error
        formErrorMessage.textContent = error.message || 'Failed to add contact. Please try again.';
        formError.classList.remove('hidden');
        
        // Re-enable form - IMPORTANT: Always reset form state on error
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Save Reminder</span>';
        inputs.forEach(input => input.disabled = false);
    } finally {
        // Ensure form is always re-enabled, even if something unexpected happens
        // This is a safety net to prevent the form from being stuck
        setTimeout(() => {
            if (submitBtn.disabled) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Save Reminder</span>';
                inputs.forEach(input => input.disabled = false);
            }
        }, 10000); // 10 second timeout safety net
    }
}

/**
 * Adds a new contact via API
 * @param {Object} contactData - Contact data object
 */
async function addContact(contactData) {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 30000); // 30 second timeout
    
    try {
        
        // Get Firebase ID token
        const token = await getAuthToken();
        
        // Include token in request body (Apps Script doesn't easily access headers)
        const requestData = {
            ...contactData,
            token: token
        };
        
        // Google Apps Script CORS workaround: use text/plain content-type
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(requestData),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        // Get response text first to see what we're dealing with
        const responseText = await response.text();
        
        if (!response.ok) {
            // Try to parse error message
            let errorMessage = responseText;
            try {
                const errorJson = JSON.parse(responseText);
                errorMessage = errorJson.message || errorJson.error || responseText;
            } catch (e) {
                // Not JSON, use text as-is
            }
            throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
        }
        
        // Try to parse response as JSON
        let result;
        try {
            result = JSON.parse(responseText);
            
            // Check if response indicates an error
            if (result.error) {
                throw new Error(result.message || 'Failed to add contact');
            }
        } catch (parseError) {
            // If parsing fails but status is OK, assume success
            result = { success: true, message: 'Contact added successfully' };
        }
        
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error adding contact:', error);
        
        // Handle timeout/abort errors
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please check your connection and try again.');
        }
        
        // Re-throw with a user-friendly message
        throw new Error(error.message || 'Failed to add contact. Please check your connection and try again.');
    }
}

/**
 * Shows success toast notification
 */
function showSuccessToast(message = 'Contact added successfully!') {
    if (successToastMessage) {
        successToastMessage.textContent = message;
    }
    successToast.classList.remove('hidden');
    setTimeout(() => {
        successToast.classList.add('hidden');
    }, 3000);
}

// Edit Contact Functions
/**
 * Opens edit modal with contact data
 */
function editContact(contactId) {
    // If modal is already open, close it first to reset state
    if (editModal && !editModal.classList.contains('hidden')) {
        hideEditModal();
        // Small delay to ensure modal closes before opening new one
        setTimeout(() => openEditModal(contactId), 100);
    } else {
        openEditModal(contactId);
    }
}

/**
 * Opens edit modal with contact data
 */
function openEditModal(contactId) {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) {
        console.error('Contact not found:', contactId);
        return;
    }
    
    // Reset form state first (important: re-enable everything)
    if (editContactForm) {
        const inputs = editContactForm.querySelectorAll('input, select, button');
        inputs.forEach(input => input.disabled = false);
    }
    if (editSubmitBtn) {
        editSubmitBtn.disabled = false;
        editSubmitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Update Contact</span>';
    }
    
    // Clear any previous errors
    if (editFormError) {
        editFormError.classList.add('hidden');
    }
    
    // Populate form with contact data
    const editContactIdEl = document.getElementById('editContactId');
    const editNameEl = document.getElementById('editName');
    const editTypeEl = document.getElementById('editType');
    const editDateEl = document.getElementById('editDate');
    const editPhoneEl = document.getElementById('editPhone');
    const editReferenceEl = document.getElementById('editReference');
    
    if (editContactIdEl) editContactIdEl.value = contact.id;
    if (editNameEl) editNameEl.value = contact.name;
    if (editTypeEl) editTypeEl.value = contact.type;
    if (editDateEl) editDateEl.value = contact.date;
    if (editPhoneEl) editPhoneEl.value = contact.phone || '';
    if (editReferenceEl) editReferenceEl.value = contact.reference || '';
    
    // Show modal
    if (editModal) {
        editModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Hides edit modal
 */
function hideEditModal() {
    if (editModal) {
        editModal.classList.add('hidden');
        document.body.style.overflow = '';
        editContactForm.reset();
        editFormError.classList.add('hidden');
        
        // Always re-enable form when closing modal
        const inputs = editContactForm.querySelectorAll('input, select, button');
        inputs.forEach(input => input.disabled = false);
        if (editSubmitBtn) {
            editSubmitBtn.disabled = false;
            editSubmitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Update Contact</span>';
        }
    }
}

/**
 * Handles edit form submission
 */
async function handleEditFormSubmit(event) {
    event.preventDefault();
    
    // Hide previous errors
    editFormError.classList.add('hidden');
    
    // Get form data
    const formData = new FormData(editContactForm);
    const contactId = formData.get('id');
    
    // Validate
    const validation = validateForm(formData);
    if (!validation.isValid) {
        editFormErrorMessage.textContent = validation.errors.join(', ');
        editFormError.classList.remove('hidden');
        return;
    }
    
    // Prepare contact data
    const contactData = {
        id: contactId,
        name: formData.get('name').trim(),
        phone: formData.get('phone')?.trim() || '',
        date: formData.get('date'),
        type: formData.get('type')?.trim() || '',
        reference: formData.get('reference')?.trim() || ''
    };
    
    // Set loading state
    const originalButtonText = editSubmitBtn.innerHTML;
    editSubmitBtn.disabled = true;
    editSubmitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span><span>Updating...</span>';
    
    // Disable form inputs
    const inputs = editContactForm.querySelectorAll('input, select');
    inputs.forEach(input => input.disabled = true);
    
    try {
        await updateContact(contactData);
        
        // Success - update local cache and refresh UI instantly
        updateContactInCache(contactData);
        
        // Close modal and show success
        hideEditModal();
        showSuccessToast('Contact updated successfully!');
    } catch (error) {
        console.error('Error in edit form submission:', error);
        
        // Show error
        editFormErrorMessage.textContent = error.message || 'Failed to update contact. Please try again.';
        editFormError.classList.remove('hidden');
        
        // Re-enable form
        editSubmitBtn.disabled = false;
        editSubmitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Update Contact</span>';
        inputs.forEach(input => input.disabled = false);
    } finally {
        // Ensure form is always re-enabled, even if something unexpected happens
        // This is a safety net to prevent the form from being stuck
        setTimeout(() => {
            if (editSubmitBtn && editSubmitBtn.disabled) {
                editSubmitBtn.disabled = false;
                editSubmitBtn.innerHTML = '<span class="material-symbols-outlined font-bold">check_circle</span><span>Update Contact</span>';
                const allInputs = editContactForm.querySelectorAll('input, select');
                allInputs.forEach(input => input.disabled = false);
            }
        }, 10000); // 10 second timeout safety net
    }
}

/**
 * Updates a contact via API
 */
async function updateContact(contactData) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 30000);
    
    try {
        
        // Get Firebase ID token
        const token = await getAuthToken();
        
        // Include token in request body
        const requestData = {
            ...contactData,
            action: 'update',
            token: token
        };
        
        // Call API with PUT method (or POST with action=update)
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(requestData),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseText = await response.text();
        
        if (!response.ok) {
            let errorMessage = responseText;
            try {
                const errorJson = JSON.parse(responseText);
                errorMessage = errorJson.message || errorJson.error || responseText;
            } catch (e) {
                // Not JSON, use text as-is
            }
            throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
        }
        
        let result;
        try {
            result = JSON.parse(responseText);
            if (result.error) {
                throw new Error(result.message || 'Failed to update contact');
            }
        } catch (parseError) {
            result = { success: true, message: 'Contact updated successfully' };
        }
        
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error updating contact:', error);
        
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please check your connection and try again.');
        }
        
        throw new Error(error.message || 'Failed to update contact. Please check your connection and try again.');
    }
}

// Delete Contact Functions
/**
 * Shows delete confirmation modal
 */
function confirmDeleteContact(contactId, contactName) {
    // If modal is already open, close it first to reset state
    if (deleteModal && !deleteModal.classList.contains('hidden')) {
        hideDeleteModal();
        // Small delay to ensure modal closes before opening new one
        setTimeout(() => openDeleteModal(contactId, contactName), 100);
    } else {
        openDeleteModal(contactId, contactName);
    }
}

/**
 * Opens delete confirmation modal
 */
function openDeleteModal(contactId, contactName) {
    // Reset button state first (important: re-enable everything)
    if (confirmDeleteBtn) {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = 'Delete';
    }
    
    if (deleteContactId && deleteContactName) {
        deleteContactId.value = contactId;
        deleteContactName.textContent = contactName;
        
        if (deleteModal) {
            deleteModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }
}

/**
 * Hides delete modal
 */
function hideDeleteModal() {
    if (deleteModal) {
        deleteModal.classList.add('hidden');
        document.body.style.overflow = '';
        if (deleteContactId) deleteContactId.value = '';
        if (deleteContactName) deleteContactName.textContent = '';
        
        // Always re-enable button when closing modal
        if (confirmDeleteBtn) {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Delete';
        }
    }
}

/**
 * Handles contact deletion
 */
async function handleDeleteContact() {
    const contactId = deleteContactId.value;
    if (!contactId) {
        console.error('No contact ID provided for deletion');
        return;
    }
    
    // Set loading state
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span><span>Deleting...</span>';
    
    try {
        await deleteContact(contactId);
        
        // Success - remove from local cache and refresh UI instantly
        removeContactFromCache(contactId);
        
        // Close modal and show success
        hideDeleteModal();
        showSuccessToast('Contact deleted successfully!');
    } catch (error) {
        console.error('Error deleting contact:', error);
        
        // Show error
        alert(error.message || 'Failed to delete contact. Please try again.');
        
        // Re-enable button
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = 'Delete';
    } finally {
        // Ensure button is always re-enabled, even if something unexpected happens
        // This is a safety net to prevent the button from being stuck
        setTimeout(() => {
            if (confirmDeleteBtn && confirmDeleteBtn.disabled) {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.innerHTML = 'Delete';
            }
        }, 10000); // 10 second timeout safety net
    }
}

/**
 * Deletes a contact via API
 */
async function deleteContact(contactId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 30000);
    
    try {
        
        // Get Firebase ID token
        const token = await getAuthToken();
        
        // Prepare delete request data (include token)
        const deleteData = { 
            id: contactId, 
            action: 'delete',
            token: token
        };
        
        // Call API with DELETE action
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(deleteData),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseText = await response.text();
        
        if (!response.ok) {
            let errorMessage = responseText;
            try {
                const errorJson = JSON.parse(responseText);
                errorMessage = errorJson.message || errorJson.error || responseText;
            } catch (e) {
                // Not JSON, use text as-is
            }
            throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
        }
        
        let result;
        try {
            result = JSON.parse(responseText);
            if (result.error) {
                throw new Error(result.message || 'Failed to delete contact');
            }
        } catch (parseError) {
            result = { success: true, message: 'Contact deleted successfully' };
        }
        
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error deleting contact:', error);
        
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please check your connection and try again.');
        }
        
        throw new Error(error.message || 'Failed to delete contact. Please check your connection and try again.');
    }
}

/**
 * Show main application (hide login, show app)
 */
function showMainApp() {
    // Main app is already visible, just ensure login elements are hidden
    document.body.style.display = 'block';
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
    // Don't redirect if user was previously authenticated (prevents redirect loops)
    if (userAuthenticated) {
        return;
    }
    
    // Only redirect if not already on login page
    const currentPath = window.location.pathname;
    const currentUrl = window.location.href;
    
    const isLoginPage = currentPath.includes('login.html') || 
                       currentUrl.includes('login.html');
    
    if (!isLoginPage) {
        window.location.href = 'login.html';
    }
}

/**
 * Update user UI elements
 */
function updateUserUI(user) {
    if (user && userInfo && userEmail && signOutBtn) {
        // Show display name first, fall back to email if display name is not available
        userEmail.textContent = user.displayName || user.email || 'User';
        userInfo.classList.remove('hidden');
        signOutBtn.classList.remove('hidden');
    }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
    try {
        await signOut();
        // Redirect to login page
        redirectToLogin();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out. Please try again.');
    }
}
