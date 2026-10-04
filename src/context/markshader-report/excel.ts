import * as XLSX from 'xlsx';

const EXCAVATOR_CONFIGS = [
    { startCol: 6 },
    { startCol: 17 },
    { startCol: 28 },
    { startCol: 40 },
    { startCol: 51 },
    { startCol: 60 },
] as const;

type ExcavatorConfig = (typeof EXCAVATOR_CONFIGS)[number];

const COL = {
    OPERATOR: 0,
    BLOCK: 1,
    MARK_PRODUCTION: 2,
    DIS_SOIL: 3,
    DIS_COAL: 4,
    ACTUAL_LOAD: 5,
    REIS_SOIL: 6,
    REIS_COAL: 7,
    TOTAL_PRODUCTION: 8,
    DIS_COEFFICIENT: 9,
    DIS_COUNT: 10,
} as const;

const COMMON_COL = {
    DAY: 2,
    SHIFT_TYPE: 4,
    MASTER: 5,
} as const;

export interface ExcelImportRow {
    day: number;
    shiftType: 'day' | 'night';
    master: string | null;
    excavatorIndex: number;
    mineName: string;
    operator: string | null;
    blockNumbers: string[];
    markProduction: number | null;
    disSoil: number | null;
    disCoal: number | null;
    disReisSoil: number | null;
    disReisCoal: number | null;
    disTotalProduction: number | null;
    disCoefficient: number | null;
}

export interface ExcelExportRow {
    reportDate: string;
    shiftType: 'day' | 'night';
    vehicleName: string;
    mineNumber: string;
    operatorName: string | null;
    masterName: string | null;
    blockNumbers: string[];
    markProduction: number | null;
    disSoil: number | null;
    disCoal: number | null;
    disReisSoil: number | null;
    disReisCoal: number | null;
    disTotalProduction: number | null;
    disCoefficient: number | null;
    markDisDiscrepancy: number | null;
}

export function parseMarkshaderExcel(buffer: ArrayBuffer): {
    excavatorNames: string[];
    rows: ExcelImportRow[];
    errors: string[];
} {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { excavatorNames: [], rows: [], errors: ['Sheet олдсонгүй'] };

    const ws = wb.Sheets[sheetName];
    if (!ws) return { excavatorNames: [], rows: [], errors: ['Sheet олдсонгүй'] };

    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: null,
    }) as (unknown[] | null)[];

    const errors: string[] = [];
    const rows: ExcelImportRow[] = [];

    const headerRow = (data[2] ?? []) as unknown[];
    const excavatorNames: string[] = EXCAVATOR_CONFIGS.map(
        (cfg: ExcavatorConfig) => String(headerRow[cfg.startCol] ?? `EX${cfg.startCol}`)
    );

    // DS мөрийн өдрийг хадгалж NS мөрт дамжуулна
    // Excel-д NS мөрт өдрийн багана хоосон байдаг тул DS-ийн өдрийг ашиглах
    let currentDay = 1;

    for (let rowIdx = 4; rowIdx < data.length; rowIdx++) {
        const rawRow = data[rowIdx];
        if (!rawRow || !Array.isArray(rawRow)) continue;
        const row = rawRow as unknown[];
        if (row.every((v) => v === null)) continue;

        const shiftRaw = row[COMMON_COL.SHIFT_TYPE];
        if (!shiftRaw || (shiftRaw !== 'DS' && shiftRaw !== 'NS')) continue;

        const dayRaw = row[COMMON_COL.DAY];
        const dayNum = dayRaw != null ? Number(dayRaw) : NaN;

        // DS мөрт өдөр байвал хадгална
        // NS мөрт өдөр хоосон тул өмнөх DS-ийн өдрийг ашиглана
        if (!isNaN(dayNum) && dayNum > 0 && Number.isInteger(dayNum)) {
            currentDay = dayNum;
        }

        const shiftType: 'day' | 'night' = shiftRaw === 'DS' ? 'day' : 'night';
        const masterRaw = row[COMMON_COL.MASTER];
        const master = masterRaw != null ? String(masterRaw) : null;

        for (let exIdx = 0; exIdx < EXCAVATOR_CONFIGS.length; exIdx++) {
            const cfg = EXCAVATOR_CONFIGS[exIdx];
            if (!cfg) continue;
            const base = cfg.startCol;

            const operatorRaw = row[base + COL.OPERATOR];
            const operator = operatorRaw != null ? String(operatorRaw) : null;
            const blockRaw = row[base + COL.BLOCK];
            const markProduction = toNum(row[base + COL.MARK_PRODUCTION]);
            const disSoil = toNum(row[base + COL.DIS_SOIL]);
            const disCoal = toNum(row[base + COL.DIS_COAL]);
            const disReisSoil = toNum(row[base + COL.REIS_SOIL]);
            const disReisCoal = toNum(row[base + COL.REIS_COAL]);
            const disTotalProduction = toNum(row[base + COL.TOTAL_PRODUCTION]);
            const disCoefficient = toNum(row[base + COL.DIS_COEFFICIENT]);

            if (
                operator === null &&
                markProduction === null &&
                disSoil === null &&
                disCoal === null
            ) continue;

            const blockNumbers =
                blockRaw != null
                    ? String(blockRaw)
                        .split(/[,_](?=[A-Z])/)
                        .map((b) => b.trim())
                        .filter(Boolean)
                    : [];

            const mineName = excavatorNames[exIdx] ?? `EX${exIdx}`;

            rows.push({
                day: currentDay, // NS мөрт ч DS-ийн өдрийг ашиглана
                shiftType,
                master,
                excavatorIndex: exIdx,
                mineName,
                operator,
                blockNumbers,
                markProduction,
                disSoil,
                disCoal,
                disReisSoil,
                disReisCoal,
                disTotalProduction,
                disCoefficient,
            });
        }
    }

    return { excavatorNames, rows, errors };
}

export function generateMarkshaderExcel(
    rows: ExcelExportRow[],
    title: string,
    filters: { startDate?: string; endDate?: string; vehicleName?: string }
): Uint8Array {
    const wb = XLSX.utils.book_new();
    const summaryData: (string | number | { f: string } | null)[][] = [];

    summaryData.push([title]);
    summaryData.push([]);

    if (filters.startDate ?? filters.endDate) {
        summaryData.push([
            `Хугацаа: ${filters.startDate ?? ''} - ${filters.endDate ?? ''}`,
            filters.vehicleName ? `Excavator: ${filters.vehicleName}` : '',
        ]);
        summaryData.push([]);
    }

    summaryData.push([
        'Огноо',
        'Ээлж',
        'Excavator',
        'Парк №',
        'Оператор',
        'Уулын мастер',
        'Блок №',
        'Марк бүтээл (м3)',
        'ДИС Хөрс (м3)',
        'ДИС Нүүрс (м3)',
        'Рейс хөрс',
        'Рейс нүүрс',
        'Бодит бүтээл (м3)',
        'ДИС коэф',
        'Марк-Дис зөрүү (м3)',
    ]);

    for (const row of rows) {
        summaryData.push([
            row.reportDate,
            row.shiftType === 'day' ? 'DS' : 'NS',
            row.vehicleName,
            row.mineNumber,
            row.operatorName ?? '',
            row.masterName ?? '',
            row.blockNumbers.join(', '),
            row.markProduction ?? '',
            row.disSoil ?? '',
            row.disCoal ?? '',
            row.disReisSoil ?? '',
            row.disReisCoal ?? '',
            row.disTotalProduction ?? '',
            row.disCoefficient ?? '',
            row.markDisDiscrepancy ?? '',
        ]);
    }

    const headerOffset = (filters.startDate ?? filters.endDate) ? 5 : 3;
    const dataStartRow = headerOffset + 1;
    const dataEndRow = dataStartRow + rows.length - 1;

    summaryData.push([]);
    summaryData.push([
        'Нийт', '', '', '', '', '', '',
        { f: `SUM(H${dataStartRow}:H${dataEndRow})` },
        { f: `SUM(I${dataStartRow}:I${dataEndRow})` },
        { f: `SUM(J${dataStartRow}:J${dataEndRow})` },
        { f: `SUM(K${dataStartRow}:K${dataEndRow})` },
        { f: `SUM(L${dataStartRow}:L${dataEndRow})` },
        { f: `SUM(M${dataStartRow}:M${dataEndRow})` },
        '',
        { f: `SUM(O${dataStartRow}:O${dataEndRow})` },
    ]);

    const ws = XLSX.utils.aoa_to_sheet(summaryData);

    ws['!cols'] = [
        { wch: 12 },
        { wch: 6 },
        { wch: 20 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 24 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 10 },
        { wch: 16 },
        { wch: 10 },
        { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Маркшейдрийн мэдээ');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

function toNum(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
}