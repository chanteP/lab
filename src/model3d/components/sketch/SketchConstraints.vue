<script setup lang="ts">
import { NIcon, NSwitch } from 'naive-ui';
import { CloseOutline, LockClosedOutline, LockOpenOutline } from '@vicons/ionicons5';
import type { SketchConstraintType } from '../../engine/sketchConstraints';
import type { ConstraintRuleListItem } from '../../types';
import MinimalRange from '../ui/MinimalRange.vue';

defineProps<{
    segmentCount: number; selectedPoint: number; selectionLocked: boolean; lengthLocked: boolean; edgeSelected: boolean;
    rules: ConstraintRuleListItem[]; constraintLimit: number; guideSnapEnabled: boolean; autoActive: boolean;
    horizontalActive: boolean; verticalActive: boolean; assetSelected: boolean; aspectLocked: boolean;
    tangentAvailable: boolean; concentricAvailable: boolean;
}>();
const emit = defineEmits<{ constraint: [type: SketchConstraintType]; lock: []; deleteRule: [id: string]; selectRule: [rule: ConstraintRuleListItem]; hoverRule: [rule: ConstraintRuleListItem | null]; 'update:constraintLimit': [value: number]; 'update:guideSnapEnabled': [value: boolean]; aspect: [] }>();
</script>

<template>
    <aside class="constraints-panel" aria-label="草图约束">
        <div class="tool-panel-title"><div><small>草图</small><strong>约束</strong></div></div>
        <button v-if="assetSelected" class="asset-aspect" :class="{ active: aspectLocked }" @click="emit('aspect')"><NIcon><component :is="aspectLocked ? LockClosedOutline : LockOpenOutline" /></NIcon>比例锁定</button>
        <p>{{ assetSelected ? '拖动四角或通过尺寸调整整体大小。' : selectedPoint >= 0 ? '点已选择，可固定位置。' : edgeSelected ? '选择边或形状，Ctrl/Command 多选。' : '选择点、边或带中心的形状。' }}</p>
        <template v-if="!assetSelected">
            <section class="constraint-group" aria-label="方向约束">
                <div class="constraint-group-title">方向</div>
                <div class="constraint-grid">
                    <button :class="{ active: autoActive }" :disabled="!segmentCount" @click="emit('constraint', 'auto')">水平/垂直</button>
                    <button :class="{ active: horizontalActive }" :disabled="!segmentCount" @click="emit('constraint', 'horizontal')">H</button>
                    <button :class="{ active: verticalActive }" :disabled="!segmentCount" @click="emit('constraint', 'vertical')">V</button>
                </div>
            </section>
            <section class="constraint-group" aria-label="几何关系约束">
                <div class="constraint-group-title">几何关系</div>
                <div class="constraint-grid">
                    <button :disabled="segmentCount < 2" @click="emit('constraint', 'parallel')">平行</button>
                    <button :disabled="segmentCount < 2" @click="emit('constraint', 'perpendicular')">正交</button>
                    <button :disabled="segmentCount < 2" @click="emit('constraint', 'equal')">等长</button>
                    <button :disabled="!tangentAvailable" @click="emit('constraint', 'tangent')">相切</button>
                    <button :disabled="!concentricAvailable" @click="emit('constraint', 'concentric')">同心</button>
                    <button :disabled="!segmentCount" @click="emit('constraint', 'length')">{{ lengthLocked ? '取消定长' : '固定长度' }}</button>
                </div>
            </section>
            <button class="constraint-lock" :disabled="selectedPoint < 0 && !edgeSelected" @click="emit('lock')"><NIcon><component :is="selectionLocked ? LockOpenOutline : LockClosedOutline" /></NIcon>{{ selectionLocked ? '取消固定' : '固定所选' }}</button>
            <div v-if="rules.length" class="constraint-rules">
                <div class="constraint-rules-title"><span>全部规则</span><span>{{ rules.length }}</span></div>
                <div class="constraint-rules-list">
                    <div v-for="rule in rules" :key="rule.id" class="constraint-rule" @mouseenter="emit('hoverRule', rule)" @mouseleave="emit('hoverRule', null)" @focusin="emit('hoverRule', rule)" @focusout="emit('hoverRule', null)">
                        <button class="constraint-rule-select" @click="emit('selectRule', rule)">{{ rule.label }}</button>
                        <button class="constraint-rule-delete" :aria-label="`删除${rule.label}规则`" @click="emit('deleteRule', rule.id)"><NIcon><CloseOutline /></NIcon></button>
                    </div>
                </div>
            </div>
            <div class="constraint-state"><i :class="{ locked: selectionLocked }"></i>{{ selectionLocked ? (selectedPoint >= 0 ? '所选点已固定' : '所选边端点已固定') : '约束修改会保留固定点' }}</div>
            <div class="constraint-limit"><label for="constraint-limit-range">约束传播 <output>{{ constraintLimit }}</output></label><MinimalRange id="constraint-limit-range" :min="10" :max="100" :value="constraintLimit" aria-label="约束传播检查上限" @update:value="emit('update:constraintLimit', $event)" /></div>
        </template>
        <div class="constraint-snap"><span>磁吸</span><NSwitch size="small" :value="guideSnapEnabled" aria-label="参考线磁吸" @update:value="emit('update:guideSnapEnabled', $event)" /></div>
    </aside>
</template>

<style lang="scss" scoped>
.constraints-panel { position: absolute; z-index: 7; top: 12px; right: 12px; width: 232px; max-height: calc(100% - 55px); padding: 11px; overflow-y: auto; border-radius: 9px; transition: background .16s ease; }
.asset-aspect { margin-bottom: 8px !important; border: 0 !important; border-radius: 6px; background: var(--model3d-ui-fff) !important; }
.constraints-panel:hover { background: var(--model3d-ui-0000000a); }
.tool-panel-title { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--model3d-ui-e3e9e5); }
.tool-panel-title > div { display: flex; flex-direction: column; gap: 2px; }
.tool-panel-title small { color: var(--model3d-ui-87938c); font-size: 8px; }
.tool-panel-title strong { font-size: 12px; }
p { margin-bottom: 9px; color: var(--model3d-ui-7e8b83); font-size: 9px; line-height: 1.5; }
button { width: 100%; min-height: 28px; display: flex; align-items: center; justify-content: center; gap: 4px; margin: 0; padding: 4px 5px; border: 0; border-radius: 5px; background: transparent; color: var(--model3d-ui-56675d); font-size: 9px; white-space: nowrap; cursor: pointer; }
button:hover { color: var(--model3d-ui-147d70); background: var(--model3d-ui-147d700a); }
button.active { color: var(--model3d-ui-147d70); font-weight: 700; }
button:disabled { opacity: .3; cursor: default; }
button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 1px; }
.constraint-group { margin-top: 8px; }
.constraint-group-title { margin-bottom: 4px; color: var(--model3d-ui-8a968f); font-size: 8px; }
.constraint-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.constraint-grid button { background: var(--model3d-ui-ffffff70); border-color: transparent; }
.constraint-lock { margin-top: 7px !important; }
.constraint-state { display: flex; align-items: center; gap: 6px; margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--model3d-ui-e4eae6); color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--model3d-ui-599fd0); }
.constraint-state i.locked { background: var(--model3d-ui-54a184); }
.constraint-rules { margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--model3d-ui-e4eae6); }
.constraint-rules-title { display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-rules-list { max-height: min(180px, 30vh); padding-right: 5px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-gutter: stable; }
.constraint-rule { display: grid; grid-template-columns: minmax(0, 1fr) 22px; align-items: center; gap: 4px; min-height: 26px; padding-right: 2px; color: var(--model3d-ui-147d70); font-size: 10px; }
.constraint-rule:hover, .constraint-rule:focus-within { background: var(--model3d-ui-0000000a); }
button.constraint-rule-select { justify-content: flex-start; min-width: 0; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
button.constraint-rule-delete { width: 22px; min-width: 22px; height: 20px; min-height: 20px; padding: 2px; border-radius: 5px; background: var(--model3d-ui-c45757); color: var(--model3d-ui-fff); }
button.constraint-rule-delete:hover { background: var(--model3d-ui-df4b5a); color: var(--model3d-ui-fff); }
.constraint-limit { margin-top: 5px; padding-top: 8px; border-top: 1px solid var(--model3d-ui-e4eae6); }
.constraint-limit label { display: flex; justify-content: space-between; color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-limit .minimal-range { display: block; margin-top: 3px; }
.constraint-snap { display: flex; align-items: center; justify-content: space-between; margin-top: 9px; color: var(--model3d-ui-8a968f); font-size: 9px; }
</style>
