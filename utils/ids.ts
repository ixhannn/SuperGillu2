/**
 * Generates a unique ID using crypto.randomUUID() with a Date.now() fallback.
 * Replaces all Date.now().toString() patterns to prevent ID collisions.
 */
export const generateId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback: timestamp + random suffix
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};
