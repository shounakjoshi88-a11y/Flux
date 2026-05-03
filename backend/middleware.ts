import type { NextFunction, Request, Response } from "express";
import { createSupabaseClient } from "./client";
import { prisma } from "./db";

const client = createSupabaseClient();

// Extend Express Request to hold the Supabase user object
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            authUser?: any; // store the full Supabase user for fallback
        }
    }
}

export async function middleware(req: Request, res: Response, next: NextFunction) {
    const authorizationHeader = req.headers.authorization ?? "";
    const token = authorizationHeader.startsWith("Bearer ")
        ? authorizationHeader.slice(7)
        : authorizationHeader;

    if (!token) {
        return res.status(403).json({
            message: "Unauthorized"
        });
    }

    const data = await client.auth.getUser(token);
    const authUser = data.data.user;
    const userId = authUser?.id;

    if (!userId) {
        return res.status(403).json({
            message: "Incorrect inputs"
        });
    }

    const provider = authUser.app_metadata.provider === "github" ? "Github" : "Google";
    const nameFromMetadata =
        typeof authUser.user_metadata.full_name === "string" && authUser.user_metadata.full_name.length > 0
            ? authUser.user_metadata.full_name
            : typeof authUser.user_metadata.name === "string" && authUser.user_metadata.name.length > 0
                ? authUser.user_metadata.name
                : "Unknown User";
    const email = authUser.email ?? `${userId}@no-email.local`;

    // Upsert the user record in the database
    await prisma.user.upsert({
        where: { supabaseId: userId },
        update: {
            email,
            provider,
            name: nameFromMetadata
        },
        create: {
            email,
            provider,
            name: nameFromMetadata,
            supabaseId: userId
        }
    });

    req.userId = userId;
    req.authUser = authUser;   // <-- new: attach full authUser for fallback use
    next();
}