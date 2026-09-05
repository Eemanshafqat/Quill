import { Request } from "express";

export function setFlash(req: Request, type: "success" | "error", message: string) {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push({ type, message });
}

/** Reads and clears flash messages for the current request. */
export function consumeFlash(req: Request) {
  const messages = req.session.flash || [];
  req.session.flash = [];
  return messages;
}
