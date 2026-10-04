import { drizzleDb } from '$/libs/database/db';
import { organizationSettings } from '$/libs/database/schema';
import { first, firstOrNull } from '$/libs/database/utils';
import { eq } from 'drizzle-orm';

export type OrgSettings = typeof organizationSettings.$inferSelect;
export type OrgSettingsInput = Pick<
    typeof organizationSettings.$inferInsert,
    'shiftDurationHours' | 'shiftMode'
>;

const DEFAULT_SETTINGS = {
    shiftDurationHours: '10.0',
    shiftMode: 'double' as const,
};

export const getOrgSettings = async (organizationId: string): Promise<OrgSettings> => {
    const row = await firstOrNull(
        await drizzleDb
            .select()
            .from(organizationSettings)
            .where(eq(organizationSettings.organizationId, organizationId))
    );

    if (!row) {
        const now = new Date().toISOString();
        return {
            id: '',
            organizationId,
            ...DEFAULT_SETTINGS,
            createdAt: now,
            updatedAt: now,
        };
    }

    return row;
};

export const getShiftDurationHours = async (organizationId: string): Promise<number> => {
    const settings = await getOrgSettings(organizationId);
    return parseFloat(settings.shiftDurationHours);
};

export const upsertOrgSettings = async (
    organizationId: string,
    input: Partial<OrgSettingsInput>
) => {
    return first(
        await drizzleDb
            .insert(organizationSettings)
            .values({
                organizationId,
                shiftDurationHours: input.shiftDurationHours ?? DEFAULT_SETTINGS.shiftDurationHours,
                shiftMode: input.shiftMode ?? DEFAULT_SETTINGS.shiftMode,
            })
            .onConflictDoUpdate({
                target: organizationSettings.organizationId,
                set: {
                    ...(input.shiftDurationHours != null && {
                        shiftDurationHours: input.shiftDurationHours,
                    }),
                    ...(input.shiftMode != null && {
                        shiftMode: input.shiftMode,
                    }),
                    updatedAt: new Date().toISOString(),
                },
            })
            .returning()
    );
};