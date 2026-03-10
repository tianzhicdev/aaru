export interface JsonResponse<T> {
  status: number;
  body: T;
}

export function jsonResponse<T>(status: number, body: T): JsonResponse<T> {
  return { status, body };
}
