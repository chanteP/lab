<script setup lang="ts">
import { NIcon } from 'naive-ui';
import { LockClosedOutline, LockOpenOutline } from '@vicons/ionicons5';
import { computed } from 'vue';
import type { SketchConstraintType } from '../../engine/sketchConstraints';
import type { SketchEdgeConstraint } from '../../types';

const props = defineProps<{ segmentCount: number; selectedPoint: number; selectionLocked: boolean; edgeSelected: boolean; constraintRule?: SketchEdgeConstraint | null }>();
const emit = defineEmits<{ constraint: [type: SketchConstraintType]; lock: []; cancelRule: [] }>();
const ruleLabel = computed(() => ({ auto: '水平 / 垂直', horizontal: '水平', vertical: '垂直', parallel: '平行', perpendicular: '正交', equal: '等长' })[props.constraintRule?.type || 'auto']);
</script>

<template>
    <aside class="constraints-panel" aria-label="草图约束">
        <div class="tool-panel-title"><div><small>草图</small><strong>约束</strong></div></div>
        <p>{{ selectedPoint >= 0 ? '点已选择，可固定位置。' : edgeSelected ? '已选边；方向约束仅适用于直线。' : '选择点或直线，Ctrl/Command 多选。' }}</p>
        <button :disabled="!segmentCount" @click="emit('constraint', 'auto')">水平 / 垂直</button>
        <div class="constraint-pair"><button :disabled="!segmentCount" @click="emit('constraint', 'horizontal')">H</button><button :disabled="!segmentCount" @click="emit('constraint', 'vertical')">V</button></div>
        <button :disabled="segmentCount < 2" @click="emit('constraint', 'parallel')">平行</button>
        <button :disabled="segmentCount < 2" @click="emit('constraint', 'perpendicular')">正交</button>
        <button :disabled="segmentCount < 2" @click="emit('constraint', 'equal')">等长</button>
        <button :disabled="selectedPoint < 0 && !edgeSelected" @click="emit('lock')"><NIcon><component :is="selectionLocked ? LockOpenOutline : LockClosedOutline" /></NIcon>{{ selectionLocked ? '取消固定' : '固定' }}</button>
        <div v-if="constraintRule" class="constraint-rule"><span>当前规则：{{ ruleLabel }}</span><button @click="emit('cancelRule')">取消此规则</button></div>
        <div class="constraint-state"><i :class="{ locked: selectionLocked }"></i>{{ selectionLocked ? (selectedPoint >= 0 ? '所选点已固定' : '所选边端点已固定') : '约束修改会保留固定点' }}</div>
    </aside>
</template>

<style lang="scss" scoped>
.constraints-panel { position: absolute; z-index: 7; top: 12px; right: 12px; width: 174px; max-height: calc(100% - 55px); padding: 12px; overflow-y: auto; border-radius: 8px; transition: background .16s ease; }
.constraints-panel:hover { background: var(--model3d-ui-0000000a); }
.tool-panel-title { margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--model3d-ui-e3e9e5); }
.tool-panel-title > div { display: flex; flex-direction: column; gap: 2px; }
.tool-panel-title small { color: var(--model3d-ui-87938c); font-size: 8px; }
.tool-panel-title strong { font-size: 12px; }
p { color: var(--model3d-ui-7e8b83); font-size: 10px; line-height: 1.6; }
button { width: 100%; min-height: 31px; display: flex; align-items: center; justify-content: center; gap: 6px; margin: 4px 0; padding: 4px 7px; border: 0; background: transparent; color: var(--model3d-ui-56675d); font-size: 10px; cursor: pointer; }
button:hover { color: var(--model3d-ui-147d70); }
button:disabled { opacity: .3; cursor: default; }
.constraint-pair { display: flex; gap: 5px; }
.constraint-state { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--model3d-ui-e4eae6); color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--model3d-ui-599fd0); }
.constraint-state i.locked { background: var(--model3d-ui-54a184); }
.constraint-rule { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--model3d-ui-e4eae6); color: var(--model3d-ui-147d70); font-size: 10px; }
.constraint-rule button { color: var(--model3d-ui-c45757); }
</style>
