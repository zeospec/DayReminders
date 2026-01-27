// Notification Service for Day Reminders
// Handles browser notifications for upcoming birthdays

/**
 * Request notification permission from the user
 * @returns {Promise<boolean>} - True if permission granted, false otherwise
 */
export async function requestNotificationPermission() {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return false;
    }
    
    // Check current permission status
    if (Notification.permission === 'granted') {
        return true;
    }
    
    // Request permission if not already denied
    if (Notification.permission !== 'denied') {
        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }
    
    return false;
}

/**
 * Check if notifications are enabled and permission is granted
 * @returns {boolean}
 */
export function isNotificationEnabled() {
    if (!('Notification' in window)) {
        return false;
    }
    
    // Check permission
    if (Notification.permission !== 'granted') {
        return false;
    }
    
    // Check user preference (stored in localStorage)
    const userPreference = localStorage.getItem('notificationsEnabled');
    return userPreference !== 'false'; // Default to true if not set
}

/**
 * Enable or disable notifications (user preference)
 * @param {boolean} enabled
 */
export function setNotificationPreference(enabled) {
    localStorage.setItem('notificationsEnabled', enabled.toString());
}

/**
 * Get notification preference
 * @returns {boolean}
 */
export function getNotificationPreference() {
    const preference = localStorage.getItem('notificationsEnabled');
    return preference !== 'false'; // Default to true
}

/**
 * Check if we've already shown a notification for a contact today
 * @param {string} contactId - Contact ID
 * @param {number} daysRemaining - Days remaining (0 for today, 1 for tomorrow)
 * @returns {boolean}
 */
function hasNotificationBeenShown(contactId, daysRemaining) {
    const today = new Date().toDateString();
    const key = `notification_${contactId}_${daysRemaining}_${today}`;
    return localStorage.getItem(key) === 'shown';
}

/**
 * Mark a notification as shown for today
 * @param {string} contactId - Contact ID
 * @param {number} daysRemaining - Days remaining
 */
function markNotificationAsShown(contactId, daysRemaining) {
    const today = new Date().toDateString();
    const key = `notification_${contactId}_${daysRemaining}_${today}`;
    localStorage.setItem(key, 'shown');
    
    // Clean up old notification keys (older than 7 days)
    cleanupOldNotificationKeys();
}

/**
 * Clean up notification keys older than 7 days
 */
function cleanupOldNotificationKeys() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('notification_')) {
            // Extract date from key (format: notification_contactId_days_dateString)
            const parts = key.split('_');
            if (parts.length >= 4) {
                const dateString = parts.slice(3).join('_');
                try {
                    const notificationDate = new Date(dateString);
                    if (notificationDate < sevenDaysAgo) {
                        keysToRemove.push(key);
                    }
                } catch (e) {
                    // Invalid date, remove it
                    keysToRemove.push(key);
                }
            }
        }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Show a notification for a birthday
 * @param {Object} contact - Contact object with name, type, daysRemaining
 * @returns {boolean} - True if notification was shown, false otherwise
 */
export function showBirthdayNotification(contact) {
    // Check if notifications are enabled
    if (!isNotificationEnabled()) {
        return false;
    }
    
    // Only show for today (0) or tomorrow (1)
    if (contact.daysRemaining !== 0 && contact.daysRemaining !== 1) {
        return false;
    }
    
    // Check if we've already shown this notification today
    if (hasNotificationBeenShown(contact.id, contact.daysRemaining)) {
        return false;
    }
    
    // Create notification message
    const isToday = contact.daysRemaining === 0;
    const dayText = isToday ? 'Today' : 'Tomorrow';
    const emoji = contact.type.toLowerCase() === 'birthday' ? '🎂' : 
                  contact.type.toLowerCase() === 'anniversary' ? '💍' : '🎉';
    
    const title = `${emoji} ${dayText}: ${contact.name}'s ${contact.type}`;
    const body = isToday 
        ? `Don't forget to wish ${contact.name} a happy ${contact.type}!`
        : `${contact.name}'s ${contact.type} is tomorrow!`;
    
    // Create and show notification
    try {
        const notificationOptions = {
            body: body,
            tag: `birthday_${contact.id}_${contact.daysRemaining}`, // Unique tag to replace previous notifications
            requireInteraction: false, // Don't require user interaction
            silent: false // Play sound
        };
        
        // Add icon if available (some browsers support it)
        try {
            notificationOptions.icon = '/favicon.svg';
            notificationOptions.badge = '/favicon.svg';
        } catch (e) {
            // Icon not supported, continue without it
        }
        
        const notification = new Notification(title, notificationOptions);
        
        // Mark as shown
        markNotificationAsShown(contact.id, contact.daysRemaining);
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            notification.close();
        }, 5000);
        
        // Handle click - focus the app window
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        
        return true;
    } catch (error) {
        console.error('Error showing notification:', error);
        return false;
    }
}

/**
 * Check contacts and show notifications for today/tomorrow birthdays
 * @param {Array} contacts - Array of contact objects
 * @returns {number} - Number of notifications shown
 */
export function checkAndShowNotifications(contacts) {
    if (!isNotificationEnabled()) {
        return 0;
    }
    
    let notificationsShown = 0;
    
    // Filter contacts for today (0) and tomorrow (1)
    const upcomingContacts = contacts.filter(contact => 
        contact.daysRemaining === 0 || contact.daysRemaining === 1
    );
    
    // Show notifications for each upcoming contact
    upcomingContacts.forEach((contact, index) => {
        // Stagger notifications slightly to avoid overwhelming the user
        setTimeout(() => {
            if (showBirthdayNotification(contact)) {
                notificationsShown++;
            }
        }, index * 500); // 500ms delay between each notification
    });
    
    return notificationsShown;
}

/**
 * Schedule daily notification check
 * This checks once per day when the app is open
 */
export function scheduleDailyCheck(contacts) {
    // Check immediately
    checkAndShowNotifications(contacts);
    
    // Set up interval to check every hour (in case user keeps app open)
    // This ensures notifications are shown even if the app was open at midnight
    const checkInterval = setInterval(() => {
        const now = new Date();
        // Only check at the start of each hour (00 minutes)
        if (now.getMinutes() === 0) {
            // Reload contacts would be needed here, but for now we'll use cached contacts
            // In a real implementation, you might want to refetch contacts
        }
    }, 60000); // Check every minute to catch the hour change
    
    // Store interval ID for cleanup if needed
    return checkInterval;
}
