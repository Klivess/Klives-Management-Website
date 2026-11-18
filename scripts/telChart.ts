// chart.js setup for the API telemetry page: one registration, one theme, and the
// two cross-chart behaviours every time chart shares — a synced crosshair (all charts
// follow telHoverT) and drag-to-zoom (a selection band that re-scopes the page).

import { Chart, registerables, type Plugin } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { telHoverT } from './apiTelemetryShared';

let registered = false;
export function ensureChartsRegistered() {
    if (registered) return;
    Chart.register(...registerables, MatrixController, MatrixElement);
    registered = true;
}

/** Resolves a CSS custom property (e.g. '--tel-s1') against an element. */
export function cssVar(el: Element | null | undefined, name: string, fallback = '#888'): string {
    if (!el || typeof window === 'undefined') return fallback;
    return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

export function theme(el: Element) {
    return {
        text: cssVar(el, '--tel-text'),
        text2: cssVar(el, '--tel-text-2'),
        muted: cssVar(el, '--tel-muted'),
        grid: cssVar(el, '--tel-grid'),
        axis: cssVar(el, '--tel-axis'),
        tipBg: cssVar(el, '--tel-tip-bg'),
        tipBorder: cssVar(el, '--tel-line-strong'),
        crosshair: cssVar(el, '--tel-crosshair'),
        select: cssVar(el, '--tel-select'),
        surface: cssVar(el, '--tel-surface'),
    };
}

export function tooltipOptions(el: Element) {
    const t = theme(el);
    return {
        backgroundColor: t.tipBg,
        borderColor: t.tipBorder,
        borderWidth: 1,
        titleColor: t.muted,
        bodyColor: t.text,
        titleFont: { size: 10, weight: 'normal' as const },
        bodyFont: { size: 11 },
        padding: 7,
        boxWidth: 12,
        boxHeight: 2,
        boxPadding: 5,
        usePointStyle: false,
        caretSize: 0,
        animation: false as const,
    };
}

export function axisTicks(el: Element) {
    const t = theme(el);
    return { color: t.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true };
}

/**
 * Draws the page-wide crosshair on every time chart. The chart's x axis is the bucket
 * index; `meta.telT0/telStep` (set on the chart options) map it back to time.
 */
export const crosshairPlugin: Plugin = {
    id: 'telCrosshair',
    afterDatasetsDraw(chart) {
        const opts = (chart.options as any).telTime as { t0: number; step: number } | undefined;
        if (!opts || telHoverT.value == null) return;
        const i = Math.round((telHoverT.value - opts.t0) / opts.step);
        const count = chart.data.labels?.length ?? 0;
        if (i < 0 || i >= count) return;
        const x = chart.scales.x.getPixelForValue(i);
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = theme(chart.canvas).crosshair;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, top);
        ctx.lineTo(Math.round(x) + 0.5, bottom);
        ctx.stroke();
        ctx.restore();
    },
};

/**
 * Draws event marks (routing changes, restarts…) as dashed vertical lines, from
 * `options.telMarks` [{ t, label }]. Nothing is drawn when a chart has no marks, so charts
 * that never pass any are unchanged.
 */
export const marksPlugin: Plugin = {
    id: 'telMarks',
    afterDatasetsDraw(chart) {
        const opts = (chart.options as any).telTime as { t0: number; step: number } | undefined;
        const marks = (chart.options as any).telMarks as { t: number; label?: string }[] | undefined;
        if (!opts || !marks?.length) return;
        const count = chart.data.labels?.length ?? 0;
        if (count < 2) return;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        const colour = cssVar(chart.canvas, '--tel-mark', '#f5b942');
        ctx.save();
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        for (const mark of marks) {
            const i = (mark.t - opts.t0) / opts.step - 0.5;
            if (i < -0.5 || i > count - 0.5) continue;
            const x = Math.round(chart.scales.x.getPixelForValue(i)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();
        }
        ctx.restore();
    },
};

/** Draws the drag-to-zoom selection band stored on `chart.$telDrag`. */
export const selectionPlugin: Plugin = {
    id: 'telSelection',
    afterDraw(chart) {
        const drag = (chart as any).$telDrag as { a: number; b: number } | undefined;
        if (!drag) return;
        const { top, bottom, left, right } = chart.chartArea;
        const a = Math.max(left, Math.min(drag.a, drag.b));
        const b = Math.min(right, Math.max(drag.a, drag.b));
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = theme(chart.canvas).select;
        ctx.fillRect(a, top, Math.max(0, b - a), bottom - top);
        ctx.restore();
    },
};

export { Chart };
