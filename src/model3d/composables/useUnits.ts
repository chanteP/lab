import { computed, ref, type Ref } from 'vue';
import { STORAGE_KEYS } from '../config/const';
import type { LengthUnit, ModelDocument } from '../types';

export function storedLengthUnit(): LengthUnit {
    const value = localStorage.getItem(STORAGE_KEYS.lengthUnit);
    return value === 'cm' || value === 'm' ? value : 'mm';
}

/** Values are unitless in the document; switching units only changes labels and export metadata. */
export function useUnits(document: Ref<ModelDocument>, onChange: () => void) {
    const lengthUnit = ref<LengthUnit>(storedLengthUnit());
    const scaleBar = ref({ width: 76, value: 50 });
    const scaleBarLabel = computed(() => formatLength(scaleBar.value.value));

    function setLengthUnit(unit: LengthUnit) {
        lengthUnit.value = unit;
        document.value.lengthUnit = unit;
        localStorage.setItem(STORAGE_KEYS.lengthUnit, unit);
        onChange();
    }
    function displayLength(value: number) { return value; }
    function inputLength(value: number | null) { return value; }
    function formatLength(value: number) { return `${Number(displayLength(value).toFixed(2))} ${lengthUnit.value}`; }
    return { lengthUnit, scaleBar, scaleBarLabel, storedLengthUnit, setLengthUnit, displayLength, inputLength, formatLength };
}
