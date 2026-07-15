// middleware.ts
import type { NextFunction, Request, Response } from "express";
import { createSupabaseClient } from "./client";
import { prisma } from "./db";

const client = createSupabaseClient();

declare global {
    namespace Express {
        interface Request {
            userId?: string;      // Supabase user ID
            authUser?: any;
            appUserId?: string;   // local user table ID (UUID)
        }
    }
}

export async function middleware(req: Request, res: Response, next: NextFunction) {
    const authorizationHeader = req.headers.authorization ?? "";
    const token = authorizationHeader.startsWith("Bearer ")
        ? authorizationHeader.slice(7)
        : authorizationHeader;

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    let authUser: any;
    try {
        const result = await client.auth.getUser(token);
        authUser = result.data?.user;
    } catch (e: any) {
        console.error('[AUTH] Supabase auth call failed:', e?.message ?? e);
        return res.status(502).json({ message: "Authentication service unavailable" });
    }

    if (!authUser) {
        return res.status(401).json({ message: "Invalid or revoked token" });
    }

    const supabaseUserId = authUser.id;
    const provider = authUser.app_metadata.provider === "github" ? "Github" : "Google";
    const name =
        (typeof authUser.user_metadata.full_name === "string" && authUser.user_metadata.full_name.trim()) ||
        (typeof authUser.user_metadata.name === "string" && authUser.user_metadata.name.trim()) ||
        "Unknown User";
    const email = authUser.email ?? `${supabaseUserId}@no-email.local`;

    let dbUser: any;
    try {
        dbUser = await prisma.user.upsert({
            where: { supabaseId: supabaseUserId },
            update: { email, provider, name },
            create: { email, provider, name, supabaseId: supabaseUserId },
        });
    } catch (e: any) {
        console.error('[AUTH] User upsert failed:', e?.message ?? e);
        return res.status(502).json({ message: "Database unavailable" });
    }

    req.userId = supabaseUserId;
    req.authUser = authUser;
    req.appUserId = dbUser.id;

    next();
}