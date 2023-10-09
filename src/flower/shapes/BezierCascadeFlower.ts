import { Flower } from './Flower';
import { generateIncreasingArray, random, sumArray } from '../utils/math';

const pointsPosition = sumArray(
    0,
    generateIncreasingArray(1, 30, (n) => Math.log(n + 1) / 2),
);

interface PaintPoint {
    target: [number, number];
    c1: [number, number];
    c2: [number, number];
}

export class BezierFlower extends Flower {
    size = random(80, 20);

    petals = 5;

    private petalPaintCount = 0;

    points: Record<number, PaintPoint[]> = {};

    private genPoints(index: number, dir: number) {
        const target: PaintPoint[] = [];

        let i = 0;
        while (i++ < 30) {
            const s = pointsPosition[i - 1];
            if (s > this.size) {
                break;
            }

            target.push({
                target: [s, 0],
                c1: [-this.size / 2, s],
                c2: [this.size / 2, s],
            });
        }
        this.points = this.points ?? {};
        this.points[index] = target;
    }

    set(params?: Partial<Flower>): void {
        super.set(params);

        this.dirs.forEach((dir, index) => this.genPoints(index, dir));
    }

    paintPetal(t: number, dir: number, dirIndex: number) {
        this.ctx.save();

        this.ctx.strokeStyle = this.color;

        this.ctx.rotate(dir);

        const p = this.points[dirIndex][this.points[dirIndex].length - 1]!;

        
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);

        this.ctx.bezierCurveTo(...p.c2, ...p.c1, 0,0);

        this.ctx.stroke();

        this.ctx.closePath();

        this.ctx.restore();
    }
}
