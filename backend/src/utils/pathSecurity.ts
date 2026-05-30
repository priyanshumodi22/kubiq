import path from 'path';

// Blocklist approach to allow flexibility for user log directories while blocking sensitive system paths
const NOT_ALLOWED_LOG_DIRECTORIES = [
    '/etc',
    '/root',
    '/boot',
    '/dev',
    '/proc',
    '/sys',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)'
];

export const isPathSafe = (targetPath: string): boolean => {
    // 1. Prevent basic directory traversal attacks
    if (targetPath.includes('..')) return false;

    // Handle glob patterns by resolving the base directory
    const cleanPath = targetPath.split('*')[0];
    const normalizedTarget = path.resolve(cleanPath);
    
    // 2. Ensure the target path does NOT reside within any blocked directories
    const isBlocked = NOT_ALLOWED_LOG_DIRECTORIES.some(blockedDir => {
        const absBlocked = path.resolve(blockedDir);
        return normalizedTarget.startsWith(absBlocked + path.sep) || normalizedTarget === absBlocked;
    });

    return !isBlocked;
};
