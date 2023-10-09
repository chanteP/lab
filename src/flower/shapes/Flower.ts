import { rad, random } from '../utils/math';

export class Flower {
    ctx: CanvasRenderingContext2D;

    x = 0;
    y = 0;

    die = false;

    color = `hsl(${random(120) - 60}, 70%, 70%)`;

    petals = 5;
    randomRange = 20;

    duration = 3000;
    startTime?: number;

    protected dirs: number[] = [];

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;

        this.set();
    }

    set(params: Partial<Flower> = {}) {
        Object.assign(this, params);

        this.genPetalDir();
    }

    /**
     * 随机生成花瓣方向
     * 360度
     */
    genPetalDir(from = 0, to = 360) {
        this.dirs = [];

        const p = (to - from) / this.petals;

        let i = 0;

        while (i++ < this.petals) {
            this.dirs.push(rad((i - 1) * p + random(this.randomRange)));
        }
    }

    paintPetal(t: number, dir: number, dirIndex: number) {}

    paint(t: number, ratio: number) {
        if (!this.startTime) {
            this.startTime = t;
        } else if (t > this.startTime + this.duration + 100) {
            this.die = true;
            return;
        }

        const deltaT = t - this.startTime;

        this.ctx.save();
        this.ctx.translate(this.x * ratio, this.y * ratio);

        this.dirs.forEach((dir, index) => {
            this.paintPetal(deltaT, dir, index);
        });

        this.ctx.restore();
    }

    restart() {
        this.startTime = undefined;
    }
}
