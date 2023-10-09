interface PaintObject {
    x: number;
    y: number;
    paint: (t?: number, ratio?: number) => void;
    die?: boolean;
}

enum EngineStatus {
    STOPPED = 0,
    PLAYING = 1,
    PAUSING = 2,
}

export class Engine {
    ctx: CanvasRenderingContext2D;

    ratio = 2;

    t = 0;
    fps = 60;
    private lastPaintTime = 0;
    private frameTime = 1000 / 60;

    private paintList: PaintObject[] = [];

    timer?: number;

    status: EngineStatus = EngineStatus.STOPPED;

    clearFrame = true;

    constructor(canvas: HTMLCanvasElement, clearFrame = false) {
        this.resetCanvas(canvas);
        this.ctx = canvas.getContext('2d');
        this.clearFrame = clearFrame;

        window.addEventListener('resize', () => this.resetCanvas(canvas));
    }

    resetCanvas(canvas: HTMLCanvasElement, ratio = 2) {
        this.ratio = ratio;
        canvas.width = canvas.clientWidth * ratio;
        canvas.height = canvas.clientHeight * ratio;
    }

    setFPS(fps: number) {
        this.fps = fps;
        this.frameTime = 1000 / this.fps;
    }

    add(obj: PaintObject) {
        this.paintList.push(obj);

        this.play();
    }

    private paint(t: number) {
        this.paintList.forEach((obj) => {
            try {
                obj.paint(t, this.ratio);
            } catch {
                //
            }
        });

        this.paintList = this.paintList.filter((obj) => !obj.die);
    }

    play() {
        if (!this.paintList.length) {
            this.stop();
            return;
        }
        
        cancelAnimationFrame(this.timer);
        this.status = EngineStatus.PLAYING;

        const now = Date.now();
        if (!this.lastPaintTime) {
            this.lastPaintTime = now;
        }

        const duration = now - this.lastPaintTime;

        if (duration >= this.frameTime) {
            this.t += duration;
            if (this.clearFrame) {
                this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
            }

            this.paint(this.t);

            this.lastPaintTime = now;
        }


        this.timer = requestAnimationFrame(() => this.play());
    }

    pause() {
        this.status = EngineStatus.PAUSING;

        cancelAnimationFrame(this.timer);
        this.lastPaintTime = 0;
    }

    stop() {
        this.status = EngineStatus.STOPPED;
        cancelAnimationFrame(this.timer);
        this.lastPaintTime = 0;
        this.t = 0;
    }
}
