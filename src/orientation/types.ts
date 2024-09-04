export type Orientation = {
    /**
     * z rotate [0, 360)
     */
    alpha: number;
    /**
     * x rotate [-180, 180)
     */
    beta: number;
    /**
     * y rotate [-90, 90)
     */
    gamma: number;
};

export type Quaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
};
