// src/middleware/basicAuth.ts
import { Request, Response, NextFunction } from "express";

export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const expectedUser = process.env.ADMIN_BASIC_USER;
  const expectedPass = process.env.ADMIN_BASIC_PASS;

  if (!expectedUser || !expectedPass) {
    return res.status(401).send("Authentication credentials are not configured on the server");
  }

  const header = req.headers.authorization || "";

  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="AllAtYou Admin"');
    return res.status(401).send("Auth required");
  }
  const [user, pass] = Buffer.from(header.slice(6), "base64").toString().split(":");
  if (user === expectedUser && pass === expectedPass) return next();

  res.setHeader("WWW-Authenticate", 'Basic realm="AllAtYou Admin"');
  return res.status(401).send("Unauthorized");
}
