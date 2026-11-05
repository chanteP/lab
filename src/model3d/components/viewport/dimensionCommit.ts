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
