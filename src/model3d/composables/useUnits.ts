import { computed, ref, type Ref } from 'vue';
import { LENGTH_UNITS } from '../config/configs';
import { STORAGE_KEYS } from '../config/const';
import type { LengthUnit, ModelDocument } from '../types';

/** Single global display-unit ref; model geometry always remains millimetres. */
export function useUnits(document: Ref<ModelDocument>, onChange: () => void) {
    function storedLengthUnit(): LengthUnit {
        const value = localStorage.getItem(STORAGE_KEYS.lengthUnit);
        return value === 'cm' || value === 'm' ? value : 'mm';
    }
    const lengthUnit = ref<LengthUnit>(storedLengthUnit());
    const unitFactor = computed(() => LENGTH_UNITS.find((item) => item.value === lengthUnit.value)?.factor || 1);
    const scaleBar = ref({ width: 76, value: 50 });
    const scaleBarLabel = computed(() => formatLength(scaleBar.value.value));

    function setLengthUnit(unit: LengthUnit) {
        lengthUnit.value = unit;
        document.value.lengthUnit = unit;
        localStorage.setItem(STORAGE_KEYS.lengthUnit, unit);
        onChange();
    }
    function displayLength(value: number) { return value / unitFactor.value; }
    function inputLength(value: number | null) { return value === null ? null : value * unitFactor.value; }
    function formatLength(value: number) { return `${Number(displayLength(value).toFixed(2))} ${lengthUnit.value}`; }
    return { lengthUnit, scaleBar, scaleBarLabel, storedLengthUnit, setLengthUnit, displayLength, inputLength, formatLength };
}
