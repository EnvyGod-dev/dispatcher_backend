import { eq, and, inArray } from "drizzle-orm";
import { drizzleDb } from "$/libs/database/db";
import { deviceTokens, users } from "$/libs/database/schema";
import { getMessaging } from "$/libs/firebase";
import type { Message, MulticastMessage } from "firebase-admin/messaging";

// ── Device Token Management ──

export async function registerDeviceToken(params: { userId: string; token: string; platform: "ios" | "android" }) {
    const { userId, token, platform } = params;

    // Upsert: if token already exists, update it
    const existing = await drizzleDb.select().from(deviceTokens).where(eq(deviceTokens.token, token)).limit(1);

    if (existing.length > 0) {
        const [updated] = await drizzleDb
            .update(deviceTokens)
            .set({ userId, platform, isActive: true })
            .where(eq(deviceTokens.token, token))
            .returning();

        return updated;
    }

    const [inserted] = await drizzleDb.insert(deviceTokens).values({ userId, token, platform }).returning();

    return inserted;
}

export async function removeDeviceToken(token: string) {
    await drizzleDb.update(deviceTokens).set({ isActive: false }).where(eq(deviceTokens.token, token));
}

export async function getUserDeviceTokens(userId: string) {
    return drizzleDb
        .select()
        .from(deviceTokens)
        .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));
}

// ── Send Notifications ──

export async function sendToUser(params: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}) {
    const { userId, title, body, data } = params;
    const tokens = await getUserDeviceTokens(userId);

    if (tokens.length === 0) return { success: false, reason: "no_tokens" };

    const messaging = getMessaging();

    const message: MulticastMessage = {
        tokens: tokens.map((t) => t.token),
        notification: { title, body },
        data,
        apns: {
            payload: {
                aps: { sound: "default" },
            },
        },
        android: {
            priority: "high" as const,
            notification: { sound: "default" },
        },
    };

    const response = await messaging.sendEachForMulticast(message);

    // Deactivate failed tokens (invalid/unregistered)
    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
        const failedToken = tokens[idx]?.token;
        const errorCode = resp.error?.code;

        if (
            !failedToken ||
            (!resp.success &&
                errorCode &&
                ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(errorCode))
        ) {
            if (failedToken) {
                failedTokens.push(failedToken);
            }
        }
    });

    if (failedTokens.length > 0) {
        await drizzleDb.update(deviceTokens).set({ isActive: false }).where(inArray(deviceTokens.token, failedTokens));
    }

    return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
    };
}

export async function sendToMultipleUsers(params: {
    userIds: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
}) {
    const { userIds, title, body, data } = params;

    const tokens = await drizzleDb
        .select()
        .from(deviceTokens)
        .where(and(inArray(deviceTokens.userId, userIds), eq(deviceTokens.isActive, true)));

    if (tokens.length === 0) return { success: false, reason: "no_tokens" };

    const messaging = getMessaging();

    const message: MulticastMessage = {
        tokens: tokens.map((t) => t.token),
        notification: { title, body },
        data,
        apns: {
            payload: {
                aps: { sound: "default" },
            },
        },
        android: {
            priority: "high" as const,
            notification: { sound: "default" },
        },
    };

    const response = await messaging.sendEachForMulticast(message);

    // Log all failures for debugging
    response.responses.forEach((resp, idx) => {
        const currentToken = tokens[idx]?.token;

        if (!resp.success) {
            console.error(
                `FCM send failed for token ${currentToken?.substring(0, 20) ?? "unknown"}...:`,
                resp.error?.code,
                resp.error?.message,
            );
        }
    });

    // Cleanup invalid tokens
    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
        const failedToken = tokens[idx]?.token;
        const errorCode = resp.error?.code;

        if (
            !failedToken ||
            (!resp.success &&
                errorCode &&
                ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(errorCode))
        ) {
            if (failedToken) {
                failedTokens.push(failedToken);
            }
        }
    });

    if (failedTokens.length > 0) {
        await drizzleDb.update(deviceTokens).set({ isActive: false }).where(inArray(deviceTokens.token, failedTokens));
    }

    return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
    };
}