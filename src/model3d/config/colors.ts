export const SKETCH_COLORS = {
    line: '#147d70',
    fill: '#38a894',
    hoverLine: '#e99a45',
    hoverFill: '#f2a65a',
    active: '#e99a45',
    hover: '#e99a45',
    activeDark: '#a95616',
    border: '#8a6b3a',
    deletePoint: '#e05252',
    arrow: '#6f91ad',
    planeBlue: '#5b8fc9',
    edge: '#26302c',
    point: '#ffffff',
    pointActive: '#ffb65c',
    pointLocked: '#54a184',
    handle: '#e5a34d',
    sectorHandle: '#f2c94c',
    guide: '#7a8d84',
    guideActive: '#dc9441',
    reference: '#35b66f',
    inputBackground: '#fffaf3',
    inputBorder: '#e7a45c',
    inputText: '#76501f',
} as const;

/** Viewport background, lighting, selection and measurement colors. */
export const VIEWPORT_COLORS = {
    background: '#e7ebe8',
    sketchBackground: '#dcebe6',
    light: '#ffffff',
    lightGround: '#829087',
    lightFill: '#d6e8ff',
    gridMajor: '#a6b0aa',
    gridMinor: '#cbd2cd',
    bodyEdge: '#334d46',
    selectedEmissive: '#164b45',
    booleanTarget: '#6d35a8',
    booleanTool: '#175fc2',
    noEmissive: '#000000',
    measureFace: '#26a88f',
    measureFaceActive: '#e2a34d',
    measureStart: '#147d70',
    measureEnd: '#d88d32',
    measureX: '#ef5261',
    measureY: '#63ad45',
    measureZ: '#4c86e8',
} as const;

/** Orientation gizmo axis and label colors. */
export const GIZMO_COLORS = {
    x: '#ff4466',
    y: '#88ff44',
    z: '#4488ff',
    negative: '#000000',
    label: '#ffffff',
} as const;

/** Default colors assigned to newly created model entities. */
export const ENTITY_COLORS = {
    primitive: '#789e9b',
} as const;

/** UI hex palette injected as --model3d-ui-<hex> custom properties. */
export const UI_COLORS = [
    '#00000018', '#0e6a5e', '#147d70', '#147d7018', '#147d7026',
    '#18201dcc', '#187566', '#1d332b2b', '#233a3030', '#24302d',
    '#263b3014', '#2c433616', '#30433b0c', '#30433b12', '#30433b16',
    '#30483f', '#314139', '#42554b', '#46534d', '#477bd3',
    '#4d5e54', '#4d675b', '#4d86b8', '#4d86b818', '#4e5e54',
    '#4f5f56', '#527067', '#54a184', '#55963d', '#56665d',
    '#56675d', '#586b60', '#599fd0', '#5a6c61', '#607168',
    '#60746a', '#617269', '#6243171c', '#63716a', '#64716a',
    '#64736a', '#65766c', '#668078', '#66a997', '#68766e',
    '#6d7873', '#6e7c74', '#6e7e75', '#707d76', '#719687',
    '#728079', '#738079', '#748078', '#74827a', '#76501f',
    '#7a8580', '#7a8780', '#7d8982', '#7d8a83', '#7e8983',
    '#7e8a83', '#7e8b83', '#7eb8aa', '#829088', '#849088',
    '#87938c', '#87938d', '#87948c', '#89938e', '#89958e',
    '#8a5c25', '#8a968f', '#8b9690', '#8c9891', '#8fc4b7',
    '#93a49b', '#9cc8bb', '#a57a3b', '#a9c9c2', '#b8c6bf',
    '#bd5353', '#c45757', '#c94f4f', '#cfd6d2', '#d1e7df',
    '#d4ded8', '#d4dfd8', '#d4dfd888', '#d5ddd8', '#d5dfd9',
    '#d5e9e2', '#d8e0db', '#d8eee7', '#dce2de', '#dce3df',
    '#dce4df', '#df4b5a', '#dfe5e1', '#dfe6e1', '#dfeee9',
    '#e0e6e2', '#e0e9e4', '#e1e6e3', '#e1e7e3', '#e2bcbc',
    '#e2e7e4', '#e2e8e4', '#e3e8e5', '#e3e9e5', '#e4e8e5',
    '#e4eae6', '#e4f1ec', '#e5f1ed', '#e6eae7', '#e6f2ed',
    '#e7a45c', '#e7ebe8', '#e8f3ef', '#e9edea', '#eaf4f0',
    '#edf0ee', '#edf1ee', '#edf2ef', '#edf3ef', '#edf4f0',
    '#efd3b2', '#f0f3f1', '#f0f4f1', '#f4f7f4', '#f4f7f5cc',
    '#f5f7f5', '#fafbfa', '#fcfdfc', '#fff', '#fff4e5',
    '#fffaf3', '#ffffff38', '#ffffff70', '#ffffff80', '#ffffffa8',
] as const;

/** Named UI colors injected as --model3d-ui-<name> custom properties. */
export const UI_NAMED_COLORS = {
    white: 'white',
    surface98: 'rgba(252,253,252,.98)',
    surface97: 'rgba(250,252,250,.97)',
    surface95: 'rgba(252,253,252,.95)',
    surface94: 'rgba(252,253,252,.94)',
    surface92: 'rgba(252,253,252,.92)',
    surface90: 'rgba(252,253,252,.9)',
    status88: 'rgba(248,250,248,.88)',
    border90: 'rgba(207,217,211,.9)',
    drawing90: 'rgba(239,247,243,.9)',
} as const;
