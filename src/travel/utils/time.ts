import type { Schedule, Trip } from '../types';

const fixedDate = (value?: string) => {
    if (!value || /^day\d+/i.test(value) || /^\d{1,2}:\d{2}/.test(value)) return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
};

export function scheduleDay(schedule: Schedule, index: number) {
    return Number(schedule.startTime.match(/^day(\d+)/i)?.[1]) || index + 1;
}

export function scheduleDateLabel(schedule: Schedule) {
    const date = fixedDate(schedule.startTime);
    if (!date) return schedule.startTime;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(date);
}

export function tripDateRange(trip: Trip) {
    const dates = trip.schedules.map((item) => fixedDate(item.startTime)).filter(Boolean) as Date[];
    if (!dates.length) return '日期待定';
    const start = new Date(Math.min(...dates.map(Number)));
    const end = new Date(Math.max(...dates.map(Number)));
    const format = (date: Date, withYear: boolean) => new Intl.DateTimeFormat('zh-CN', {
        ...(withYear ? { year: 'numeric' } : {}), month: '2-digit', day: '2-digit',
    }).format(date);
    return `${format(start, true)}${start.getTime() === end.getTime() ? '' : ` — ${format(end, start.getFullYear() !== end.getFullYear())}`}`;
}

export function durationLabel(minutes?: number) {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} 小时${rest ? ` ${rest} 分钟` : ''}`;
}
