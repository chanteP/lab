<script setup lang="ts">
import { NIcon, NSwitch } from 'naive-ui';
import { CloseOutline, LockClosedOutline, LockOpenOutline } from '@vicons/ionicons5';
import type { SketchConstraintType } from '../../engine/sketchConstraints';
import type { ConstraintRuleListItem } from '../../types';
import MinimalRange from '../ui/MinimalRange.vue';

const props = defineProps<{ segmentCount: number; selectedPoint: number; selectionLocked: boolean; lengthLocked: boolean; edgeSelected: boolean; rules: ConstraintRuleListItem[]; constraintLimit: number; guideSnapEnabled: boolean; autoActive: boolean; horizontalActive: boolean; verticalActive: boolean; assetSelected: boolean; aspectLocked: boolean }>();
const emit = defineEmits<{ constraint: [type: SketchConstraintType]; lock: []; deleteRule: [id: string]; selectRule: [rule: ConstraintRuleListItem]; hoverRule: [rule: ConstraintRuleListItem | null]; 'update:constraintLimit': [value: number]; 'update:guideSnapEnabled': [value: boolean]; aspect: [] }>();
</script>

<template>
    <aside class="constraints-panel" aria-label="草图约束">
        <div class="tool-panel-title"><div><small>草图</small><strong>约束</strong></div></div>
        <button v-if="assetSelected" class="asset-aspect" :class="{ active: aspectLocked }" @click="emit('aspect')"><NIcon><component :is="aspectLocked ? LockClosedOutline : LockOpenOutline" /></NIcon>比例锁定</button>
        <p>{{ assetSelected ? '拖动四角或通过尺寸调整整体大小。' : selectedPoint >= 0 ? '点已选择，可固定位置。' : edgeSelected ? '已选边；方向约束仅适用于直线。' : '选择点或直线，Ctrl/Command 多选。' }}</p>
        <template v-if="!assetSelected">
        <button :class="{ active: autoActive }" :disabled="!segmentCount" @click="emit('constraint', 'auto')">水平 / 垂直</button>
        <div class="constraint-pair"><button :class="{ active: horizontalActive }" :disabled="!segmentCount" @click="emit('constraint', 'horizontal')">H</button><button :class="{ active: verticalActive }" :disabled="!segmentCount" @click="emit('constraint', 'vertical')">V</button></div>
        <button :disabled="segmentCount < 2" @click="emit('constraint', 'parallel')">平行</button>
        <button :disabled="segmentCount < 2" @click="emit('constraint', 'perpendicular')">正交</button>
        <button :disabled="segmentCount < 2" @click="emit('constraint', 'equal')">等长</button>
        <button :disabled="!segmentCount" @click="emit('constraint', 'length')">{{ lengthLocked ? '取消长度固定' : '固定长度' }}</button>
        <button :disabled="selectedPoint < 0 && !edgeSelected" @click="emit('lock')"><NIcon><component :is="selectionLocked ? LockOpenOutline : LockClosedOutline" /></NIcon>{{ selectionLocked ? '取消固定' : '固定' }}</button>
        <div v-if="rules.length" class="constraint-rules"><div class="constraint-rules-title">全部规则</div><div class="constraint-rules-list"><div v-for="rule in rules" :key="rule.id" class="constraint-rule" @mouseenter="emit('hoverRule', rule)" @mouseleave="emit('hoverRule', null)" @focusin="emit('hoverRule', rule)" @focusout="emit('hoverRule', null)"><button class="constraint-rule-select" @click="emit('selectRule', rule)">{{ rule.label }}</button><button class="constraint-rule-delete" :aria-label="`删除${rule.label}规则`" @click="emit('deleteRule', rule.id)"><NIcon><CloseOutline /></NIcon></button></div></div></div>
        <div class="constraint-state"><i :class="{ locked: selectionLocked }"></i>{{ selectionLocked ? (selectedPoint >= 0 ? '所选点已固定' : '所选边端点已固定') : '约束修改会保留固定点' }}</div>
        <div class="constraint-limit"><label for="constraint-limit-range">约束传播 <output>{{ constraintLimit }}</output></label><MinimalRange id="constraint-limit-range" :min="10" :max="100" :value="constraintLimit" aria-label="约束传播检查上限" @update:value="emit('update:constraintLimit', $event)" /></div>
        </template>
        <div class="constraint-snap"><span>磁吸</span><NSwitch size="small" :value="guideSnapEnabled" aria-label="参考线磁吸" @update:value="emit('update:guideSnapEnabled', $event)" /></div>
    </aside>
</template>

<style lang="scss" scoped>
.constraints-panel { position: absolute; z-index: 7; top: 12px; right: 12px; width: 174px; max-height: calc(100% - 55px); padding: 12px; overflow-y: auto; border-radius: 8px; transition: background .16s ease; }
.asset-aspect { margin-bottom: 8px; border: 1px solid var(--model3d-ui-d4dfd8); border-radius: 6px; background: var(--model3d-ui-fff); }
.constraints-panel:hover { background: var(--model3d-ui-0000000a); }
.tool-panel-title { margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--model3d-ui-e3e9e5); }
.tool-panel-title > div { display: flex; flex-direction: column; gap: 2px; }
.tool-panel-title small { color: var(--model3d-ui-87938c); font-size: 8px; }
.tool-panel-title strong { font-size: 12px; }
p { color: var(--model3d-ui-7e8b83); font-size: 10px; line-height: 1.6; }
button { width: 100%; min-height: 31px; display: flex; align-items: center; justify-content: center; gap: 6px; margin: 4px 0; padding: 4px 7px; border: 0; background: transparent; color: var(--model3d-ui-56675d); font-size: 10px; cursor: pointer; }
button:hover { color: var(--model3d-ui-147d70); }
button.active { color: var(--model3d-ui-147d70); font-weight: 700; }
button:disabled { opacity: .3; cursor: default; }
.constraint-pair { display: flex; gap: 5px; }
.constraint-state { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--model3d-ui-e4eae6); color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--model3d-ui-599fd0); }
.constraint-state i.locked { background: var(--model3d-ui-54a184); }
.constraint-rules { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--model3d-ui-e4eae6); }
.constraint-rules-title { margin-bottom: 5px; color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-rules-list { max-height: 180px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.constraint-rule { display: flex; align-items: center; justify-content: space-between; min-height: 25px; color: var(--model3d-ui-147d70); font-size: 10px; }
.constraint-rule:hover, .constraint-rule:focus-within { background: var(--model3d-ui-0000000a); }
button.constraint-rule-select { flex: 1; justify-content: flex-start; min-width: 0; margin: 0; padding-left: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button.constraint-rule-delete { width: 20px; min-width: 20px; height: 20px; min-height: 20px; margin: 0; padding: 2px; border-radius: 5px; background: var(--model3d-ui-c45757); color: var(--model3d-ui-fff); }
button.constraint-rule-delete:hover { background: var(--model3d-ui-df4b5a); color: var(--model3d-ui-fff); }
.constraint-limit { margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--model3d-ui-e4eae6); }
.constraint-limit label { display: flex; justify-content: space-between; color: var(--model3d-ui-8a968f); font-size: 9px; }
.constraint-limit .minimal-range { display: block; margin-top: 3px; }
.constraint-snap { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; color: var(--model3d-ui-8a968f); font-size: 9px; }
</style>
