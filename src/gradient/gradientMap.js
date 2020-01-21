export default {
    linear: {
        text: 'Linear-gradient',
        format(data) {
            format(data);
            data.angle = 90;
        },
        css(data) {
            return `linear-gradient(${'angle' in data ? data.angle : 90}deg ${(data.colorList || [])
                .slice()
                .sort((a, b) => (a.stop > b.stop ? 1 : -1))
                .map(({ color, stop }) => {
                    return `${color} ${stop * 100}%`;
                })
                .map(t => `, ${t}`)
                .join('')})`;
        },
        getDefault() {
            return [
                { color: '#FFFFFF00', stop: 0 },
                { color: '#000000FF', stop: 1 },
            ];
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
        getDefault() {
            return [
                { color: '#FFFFFF00', stop: 0 },
                { color: '#000000FF', stop: 1 },
            ];
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
                .sort((a, b) => (a.stop > b.stop ? -1 : 1))
                .map(({ color, stop }) => {
                    return `${color} ${360 - stop * 360}deg`;
                })
                .map(t => `, ${t}`)
                .join('')})`;
        },
        getDefault() {
            return [
                { color: '#FFFFFFFF', stop: 0 },
                { color: '#FFFFFFFF', stop: 0.2 },
                { color: '#FFDDFFFF', stop: 0.20001 },
                { color: '#FFDDFFFF', stop: 0.4 },
                { color: '#FFFFDDFF', stop: 0.40001 },
                { color: '#FFFFDDFF', stop: 0.6 },
                { color: '#DDFFDDFF', stop: 0.60001 },
                { color: '#DDFFDDFF', stop: 0.8 },
                { color: '#FFDDDDFF', stop: 0.80001 },
                { color: '#FFDDDDFF', stop: 1 },
            ];
        },
    },
};

function format(data) {
    data.size = '100%';
    data.pos = '50% 50%';
}
