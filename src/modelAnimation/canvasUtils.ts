import {
    WebGLRenderer,
    Mesh,
    Scene,
    PerspectiveCamera,
    AmbientLight,
    DirectionalLight,
    Box3,
    Vector3,
    Object3DEventMap,
    Group,
    MeshPhongMaterial,
    AnimationMixer,
    InterpolateDiscrete,
    LoopRepeat,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface ResourceItem {
    file: File;
    url: string;
    type: string;
}

let scene: Scene;
let renderer: WebGLRenderer;
let camera: PerspectiveCamera;
const mixerList: AnimationMixer[] = [];

export function initContext(canvas: HTMLCanvasElement) {
    scene = new Scene();

    // 创建透视相机
    camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5); // 设置相机位置

    // 创建WebGL渲染器，并设置大小
    renderer = new WebGLRenderer({
        antialias: true,
        canvas,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 抗锯齿效果

    // 添加光源
    const ambientLight = new AmbientLight(0xffffff, 0.5); // 环境光
    scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 1);
    directionalLight.position.set(-1, 2, 1); // 设置光源位置为左上前方
    scene.add(directionalLight);

    // 创建轨道控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0); // 设置控制器的目标点为(0, 0, 0)，即模型的中心
    controls.enableDamping = true; // 启用阻尼效果
    controls.dampingFactor = 0.25; // 阻尼系数
    controls.enableZoom = true; // 启用缩放
    controls.zoomSpeed = 1.0; // 缩放速度

    // 确保光源方向不变
    const updateLightPosition = () => {
        const position = camera.position.clone();
        const lightDirection = new Vector3(-1, 2, 1);
        lightDirection.applyQuaternion(camera.quaternion);
        directionalLight.position.copy(position).add(lightDirection.normalize().multiplyScalar(2));
    };

    // 在动画循环中更新光源位置
    controls.addEventListener('change', updateLightPosition);

    // 渲染循环
    const animate = () => {
        deltaTime = Date.now() - lastTime;
        lastTime = Date.now();
        requestAnimationFrame(animate);
        renderer.render(scene, camera);

        // 更新动画混合器，传递时间增量
        mixerList.forEach((mixer) => mixer.update(deltaTime));
    };

    let lastTime = Date.now();
    let deltaTime = 0;
    animate();
}

function updateAnimation(object: Group<Object3DEventMap>) {
    // 获取FBX模型中的所有动画剪辑
    const animations = object.animations;
    if (!animations) {
        return;
    }

    // 创建动画混合器并将其与场景中的对象和时间相关联
    const mixer = new AnimationMixer(object);
    mixerList.push(mixer);

    // 循环播放所有动画
    animations.forEach((clip) => {
        // clip.tracks.forEach((track) => {
        //   track.setInterpolation(InterpolateDiscrete);
        // });
        // 创建动画动作
        const action = mixer.clipAction(clip);
        action.loop = LoopRepeat;
        action.timeScale = 0.9;
        // 播放动画
        action.play();
    });
}

function fitCamera(object: any) {
    // 计算模型的边界框
    const box = new Box3().setFromObject(object);
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);

    camera.position.copy(center).add(new Vector3(size.x * 0.5, size.y * 0.5, size.z * 1.5)); // 将相机放

    // 相机对准模型
    camera.lookAt(center);
}

async function renderFBX(resource: ResourceItem) {
    const loader = new FBXLoader();
    return new Promise<Group<Object3DEventMap>>((res, rej) => {
        loader.load(
            resource.url, // 替换为你的fbx文件路径
            (object) => {
                object.traverse((child) => {
                    if (child instanceof Mesh) {
                        // 移除贴图，设置为简单的材质
                        // child.material.map = null;
                        // child.material.needsUpdate = true; // 确保材质更新

                        // 创建一个新的白色材质
                        const whiteMaterial = new MeshPhongMaterial({ color: 0xffffff });
                        // 将原有的材质替换为白色材质
                        child.material = whiteMaterial;
                    }
                });
                res(object);
            },
            undefined,
            rej,
        );
    });
}

async function renderGLB(resource: ResourceItem) {
    const loader = new GLTFLoader();
    return new Promise<Group<Object3DEventMap>>((res, rej) => {
        loader.load(
            resource.url, // 替换为你的fbx文件路径
            (gltf) => {
                res(gltf.scene);
            },
            undefined,
            rej,
        );
    });
}

async function renderSTL(resource: ResourceItem) {
    const loader = new STLLoader();
    return new Promise<Group<Object3DEventMap>>((res, rej) => {
        loader.load(
            resource.url, // 替换为你的fbx文件路径
            (geometry) => {
                const material = new MeshPhongMaterial({ color: 0xffffff });
                // 创建网格模型
                const model = new Mesh(geometry, material);
                res(model as unknown as Group<Object3DEventMap>);
            },
            undefined,
            rej,
        );
    });
}

export async function render(resource: ResourceItem) {
    let object: Group<Object3DEventMap> = undefined;
    if (resource.type === 'fbx') {
        object = await renderFBX(resource);
    } else if (resource.type.startsWith('gl')) {
        object = await renderGLB(resource);
    } else if (resource.type === 'stl') {
        object = await renderSTL(resource);
    } else {
        return;
    }

    updateAnimation(object);
    scene.add(object);
    fitCamera(object);

    return true;
}
