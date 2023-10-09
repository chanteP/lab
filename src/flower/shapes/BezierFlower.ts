import { Flower } from './Flower';
import { generateNormalDistribution, random } from '../utils/math';

export class BezierFlower extends Flower {
    size = random(80, 20);

    petals = generateNormalDistribution(5, 1);
    randomRange = 30;

    paintPetal(t: number, dir: number, dirIndex: number) {
        this.ctx.save();

        this.ctx.strokeStyle = this.color;

        this.ctx.rotate(dir);

        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);

        this.ctx.bezierCurveTo(this.size / 2, this.size, -this.size / 2, this.size, 0, 0);

        this.ctx.stroke();

        this.ctx.closePath();

        this.ctx.restore();
    }
}
