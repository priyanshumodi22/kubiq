/** A hung dependency must not extend the application's total shutdown deadline. */
export async function shutdownDeadline(action: () => Promise<void>, milliseconds = 5000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            Promise.resolve().then(action).then(() => true, () => false),
            new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), milliseconds); }),
        ]);
    } finally { clearTimeout(timer); }
}
