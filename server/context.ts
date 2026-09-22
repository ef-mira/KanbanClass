import type { NextFunction, Request, Response } from "express";
import { createStorageService, type StorageService } from "./services/storage/StorageService";
import { createLMSAdapter, type LMSAdapter } from "./services/lms/LMSAdapter";

/**
 * Per-request context. In V1 there is exactly one local user, but every query
 * and service goes through this object so V2 can resolve the user from an auth
 * token (and pick per-tenant storage / LMS) without touching route code.
 */
export interface RequestContext {
  userId: string;
  storage: StorageService;
  lms: LMSAdapter;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestContext;
    }
  }
}

export const LOCAL_USER_ID = process.env.LOCAL_USER_ID || "local";

export function contextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const userId = LOCAL_USER_ID;
  req.ctx = {
    userId,
    storage: createStorageService(userId),
    lms: createLMSAdapter(userId),
  };
  next();
}
