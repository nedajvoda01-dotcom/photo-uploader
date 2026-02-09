/**
 * Yandex Disk API Call Instrumentation
 * 
 * Tracks API calls per request when DEBUG_DISK_CALLS=1
 * Provides insights into optimization effectiveness
 */

export interface DiskCallCounter {
  listFolder: number;
  downloadFile: number;
  uploadText: number;
  uploadFile: number;
  createFolder: number;
  deleteFile: number;
  exists: number;
  moveFolder: number;
  publishFolder: number;
}

interface RequestContext {
  requestId: string;
  route: string;
  calls: DiskCallCounter;
  startTime: number;
}

const DEBUG_ENABLED = process.env.DEBUG_DISK_CALLS === '1' || process.env.DEBUG_DISK_CALLS === 'true';

// Store per-request tracking
const requestContexts = new Map<string, RequestContext>();

/**
 * Initialize tracking for a request
 */
export function initRequestTracking(requestId: string, route: string): void {
  if (!DEBUG_ENABLED) return;
  
  requestContexts.set(requestId, {
    requestId,
    route,
    calls: {
      listFolder: 0,
      downloadFile: 0,
      uploadText: 0,
      uploadFile: 0,
      createFolder: 0,
      deleteFile: 0,
      exists: 0,
      moveFolder: 0,
      publishFolder: 0,
    },
    startTime: Date.now(),
  });
}

/**
 * Track a disk API call
 */
export function trackDiskCall(requestId: string, callType: keyof DiskCallCounter): void {
  if (!DEBUG_ENABLED) return;
  
  const context = requestContexts.get(requestId);
  if (context) {
    context.calls[callType]++;
  }
}

/**
 * Get current call counts for a request
 */
export function getCallCounts(requestId: string): DiskCallCounter | null {
  if (!DEBUG_ENABLED) return null;
  
  const context = requestContexts.get(requestId);
  return context ? { ...context.calls } : null;
}

/**
 * Log and cleanup tracking for a request
 */
export function finishRequestTracking(requestId: string): void {
  if (!DEBUG_ENABLED) return;
  
  const context = requestContexts.get(requestId);
  if (context) {
    const duration = Date.now() - context.startTime;
    const totalCalls = Object.values(context.calls).reduce((sum, count) => sum + count, 0);
    
    console.log('[DISK_CALLS]', {
      requestId: context.requestId,
      route: context.route,
      duration: `${duration}ms`,
      totalCalls,
      diskCalls: context.calls,
    });
    
    requestContexts.delete(requestId);
  }
}

/**
 * Generate a request ID for tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
