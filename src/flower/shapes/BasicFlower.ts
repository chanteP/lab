import { Flower } from './Flower';
import { random } from '../utils/math';

export class BasicFlower extends Flower {
    size = random(40, 20);

    petals = 5;
    color = `hsl(${random(120) - 60}, 70%, 70%)`;

    paintPetal(t: number, dir: number, dirIndex: number) {
        this.ctx.save();

        this.ctx.strokeStyle = this.color;

        this.ctx.rotate(dir);
        // this.ctx.rotate(Math.PI / 2);

        this.ctx.beginPath();

        this.ctx.translate(-this.size / 2, -this.size / 2);
        this.ctx.arc(0, 0, this.size, 0, 2 * Math.PI * t / this.duration);
        this.ctx.translate(this.size / 2, this.size / 2);

        this.ctx.stroke();

        this.ctx.closePath();

        this.ctx.restore();
    }
}
