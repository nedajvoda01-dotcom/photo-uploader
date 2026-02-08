/**
 * HTTP DTOs and Type Definitions
 * Common types for API requests and responses
 */

// ============================================================================
// Authentication DTOs
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  user?: {
    id: number;
    email: string;
    role: string;
    region: string;
  };
  error?: string;
  message?: string;
}

export interface LogoutResponse {
  ok: boolean;
  message: string;
}

// ============================================================================
// Car and Slot DTOs
// ============================================================================

export interface Car {
  id: number;
  vin: string;
  region: string;
  created_at?: string;
  updated_at?: string;
}

export interface Slot {
  car_id: number;
  slot_type: string;
  slot_index: number;
  filename?: string | null;
  uploaded_at?: string | null;
}

export interface CarWithSlots extends Car {
  slots?: Slot[];
}

// ============================================================================
// Generic API Response Types
// ============================================================================

export interface ApiErrorResponse {
  ok: false;
  error: string;
  code?: string;
  message?: string;
  status?: number;
}

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  [key: string]: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Type Guards
// ============================================================================

export function isApiErrorResponse(response: unknown): response is ApiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'ok' in response &&
    response.ok === false &&
    'error' in response
  );
}

export function isApiSuccessResponse<T = unknown>(response: unknown): response is ApiSuccessResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'ok' in response &&
    response.ok === true
  );
}

// ============================================================================
// Utility Types
// ============================================================================

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

// Helper to safely extract error messages
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
}
