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

    const { data: { user: authUser } } = await client.auth.getUser(token);
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

    // Upsert the user – this guarantees a local user record exists
    const dbUser = await prisma.user.upsert({
        where: { supabaseId: supabaseUserId },
        update: { email, provider, name },
        create: { email, provider, name, supabaseId: supabaseUserId },
    });

    // Attach both IDs to the request
    req.userId = supabaseUserId;          // Supabase ID
    req.authUser = authUser;
    req.appUserId = dbUser.id;            // Local UUID (the one used in foreign keys)

    next();
}