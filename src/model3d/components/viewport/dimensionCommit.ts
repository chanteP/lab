const committedValues = new WeakMap<HTMLInputElement, string>();

/** A following blur must not submit the exact value already accepted by Enter/wheel. */
export function claimDimensionCommit(input: HTMLInputElement, raw: string) {
    if (committedValues.get(input) === raw) return false;
    committedValues.set(input, raw);
    return true;
}

export function resetDimensionCommit(input: HTMLInputElement) {
    committedValues.delete(input);
}

/** Keep drafts only while their dimension identity and committed value are unchanged. */
export function reconcileDimensionDrafts(items: { id: string; value: number }[], drafts: Map<string, string>, previousValues: Map<string, number>) {
    const current = new Map(items.map((item) => [item.id, item.value]));
    drafts.forEach((_, id) => {
        if (!current.has(id) || previousValues.get(id) !== current.get(id)) drafts.delete(id);
    });
    previousValues.clear();
    current.forEach((value, id) => previousValues.set(id, value));
}
