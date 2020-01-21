export default {
    linear: {
        text: 'Linear-gradient',
        format(data) {
            format(data);
            data.angle = 90;
        },
        css(data) {
            return `linear-gradient(${'angle' in data ? data.angle : 90 }deg ${(data.colorList || [])
                .slice()
                .sort((a, b) => (a.stop > b.stop ? 1 : -1))
                .map(({ color, stop }) => {
                    return `${color} ${stop * 100}%`;
                })
                .map(t => `, ${t}`)
                .join('')})`;
        },
    },

    radial: {
        text: 'Radial-gradient',
        format(data) {
            format(data);
            data.shape = 'ellipse';
        },
        css(data) {
            return `radial-gradient(${data.shape || 'ellipse'},${(data.colorList || [])
                .slice()
                .sort((a, b) => (a.stop > b.stop ? 1 : -1))
                .map(({ color, stop }) => {
                    return `${color} ${stop * 100}%`;
                })
                // .map(t => `, ${t}`)
                .join(',')})`;
        },
    },

    conic: {
        text: 'Conic-gradient',
        format(data) {
            format(data);
        },
        css(data) {
            return `conic-gradient(from ${data.angle || 0}deg ${(data.colorList || [])
                .slice()
                .sort((a, b) => (a.stop > b.stop ? 1 : -1))
                .map(({ color, stop }) => {
                    return `${color} ${stop * 360}deg`;
                })
                .map(t => `, ${t}`)
                .join('')})`;
        },
    },
};
function format(data){
    data.size = '100%';
    data.pos = 'center';
}
